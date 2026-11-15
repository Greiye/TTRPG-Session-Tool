// Room: owns authoritative state, validates client intents, sends per-client fog-filtered diffs.
// Transport-agnostic: the Node server wraps it with WebSockets; hot-seat mode wraps it in-browser.
import { applyIntent, createGame, activeUnit } from './engine.js';
import { visibleFrom, idx } from './grid.js';

export class Room {
  /**
   * @param rules  rules object (see rules.json)
   * @param opts   {dmKey, seed, state, scenario:{map?, units?, w?, h?}, beforeIntent(actor, intent) -> true | string}
   */
  constructor(rules, { dmKey = 'dm', seed, state, scenario, beforeIntent } = {}) {
    this.rules = rules;
    this.dmKey = dmKey;
    this.state = state || createGame(rules, { seed, ...(scenario || {}) });
    this.clients = new Map(); // id -> {actor, send, lastView}
    this.customIntents = new Map();
    this.beforeIntent = beforeIntent || null;
    this._listeners = {};
  }

  on(ev, fn) { (this._listeners[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._listeners[ev] = (this._listeners[ev] || []).filter((f) => f !== fn); }
  emit(ev, ...a) { for (const f of this._listeners[ev] || []) f(...a); }

  /** Add a game-specific intent. def = {dmOnly?, apply({state, rules, actor, intent, rand, log, canControl}) -> {ok?, error?, events?}} */
  registerIntent(type, def) { this.customIntents.set(type, def); return this; }

  join(clientId, { name, wantDM, dmKey }, send) {
    name = String(name || 'player').slice(0, 24);
    const isDM = !!wantDM && dmKey === this.dmKey;
    const c = { actor: { name, isDM }, send, lastView: null };
    this.clients.set(clientId, c);
    if (wantDM && !isDM) send({ t: 'notice', msg: 'Wrong DM key; joined as player.' });
    const view = this.viewFor(c.actor);
    c.lastView = view;
    send({ t: 'welcome', you: c.actor, view, rules: this.rules });
    this.emit('join', clientId, c.actor);
    this.broadcast([]); // update player lists
  }

  leave(clientId) { const c = this.clients.get(clientId); this.clients.delete(clientId); if (c) this.emit('leave', clientId, c.actor); this.broadcast([]); }

  /** Change a client's role/name without a key (hot-seat, or host-side auth). */
  setActor(clientId, actor) {
    const c = this.clients.get(clientId); if (!c) return;
    c.actor = { ...actor };
    c.lastView = this.viewFor(c.actor);
    c.send({ t: 'welcome', you: c.actor, view: c.lastView, rules: this.rules });
  }

  /** Apply an intent as an arbitrary actor (host-side AI, scripted events). Broadcasts on success. */
  act(actor, intent) {
    if (this.beforeIntent) { const v = this.beforeIntent(actor, intent); if (v !== true && v !== undefined) return { ok: false, error: typeof v === 'string' ? v : 'rejected', events: [] }; }
    let res;
    try { res = applyIntent(this.state, this.rules, actor, intent, Math.random, this.customIntents); }
    catch (e) { res = { ok: false, error: 'server error: ' + e.message, events: [] }; }
    if (res.ok) {
      this.emit('applied', { actor, intent, events: res.events, state: this.state });
      this.broadcast(res.events);
      this._checkOutcome();
    }
    return res;
  }

  handle(clientId, msg) {
    const c = this.clients.get(clientId);
    if (!c || !msg || msg.t !== 'intent') return;
    const res = this.act(c.actor, msg.intent);
    c.send({ t: 'ack', reqId: msg.reqId, ok: res.ok, error: res.error });
  }

  _checkOutcome() {
    const teams = {};
    for (const u of Object.values(this.state.units)) { teams[u.team] ||= { alive: 0 }; if (!u.dead) teams[u.team].alive++; }
    for (const [team, t] of Object.entries(teams)) {
      if (t.alive === 0 && !this._defeated?.has(team)) { (this._defeated ||= new Set()).add(team); this.emit('teamDefeated', team, this.state); }
      if (t.alive > 0) this._defeated?.delete(team);
    }
  }

  broadcast(events) {
    for (const c of this.clients.values()) {
      const next = this.viewFor(c.actor);
      const d = diffView(c.lastView, next);
      const evs = events.filter((e) => !e.unitId || next.units[e.unitId] || (e.targetId && next.units[e.targetId]));
      c.lastView = next;
      if (d || evs.length) c.send({ t: 'diff', diff: d || {}, events: evs });
    }
  }

  viewFor(actor) {
    const s = this.state;
    const players = [...this.clients.values()].map((c) => ({ name: c.actor.name, isDM: c.actor.isDM }));
    const meta = {
      w: s.w, h: s.h, round: s.round, turn: s.turn, initiative: s.initiative, fog: s.fog,
      seed: s.seed, active: activeUnit(s)?.id || null, players,
    };
    let visible = null;
    const units = {};
    if (actor.isDM || !s.fog) {
      for (const u of Object.values(s.units)) units[u.id] = u;
      if (actor.isDM && s.fog) visible = computePartyVision(s, this.rules); // DM sees everything but gets the party's view for preview
    } else {
      visible = computePartyVision(s, this.rules);
      const vis = new Set(visible);
      for (const u of Object.values(s.units)) if (u.team === 'players' || vis.has(idx(s, u.x, u.y))) units[u.id] = u;
    }
    return structuredClone({ meta, tiles: s.tiles, units, visible, revealed: s.revealed, log: s.log });
  }
}

export function computePartyVision(s, rules) {
  const set = new Set(s.revealed);
  for (const u of Object.values(s.units)) {
    if (u.team !== 'players' || u.dead) continue;
    for (const i of visibleFrom(s, rules, u.x, u.y, u.sight)) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}

const J = (v) => JSON.stringify(v);

/** Compact diff between two views. Returns null when nothing changed. */
export function diffView(prev, next) {
  if (!prev) return { full: next };
  const d = {};
  if (J(prev.meta) !== J(next.meta)) d.meta = next.meta;
  if (prev.tiles.length !== next.tiles.length) d.tilesFull = next.tiles;
  else {
    const t = {};
    let any = false;
    for (let i = 0; i < next.tiles.length; i++) if (J(prev.tiles[i]) !== J(next.tiles[i])) { t[i] = next.tiles[i]; any = true; }
    if (any) d.tiles = t;
  }
  const set = {}, del = [];
  for (const [id, u] of Object.entries(next.units)) if (!prev.units[id] || J(prev.units[id]) !== J(u)) set[id] = u;
  for (const id of Object.keys(prev.units)) if (!next.units[id]) del.push(id);
  if (Object.keys(set).length || del.length) d.units = { set, del };
  if (J(prev.visible) !== J(next.visible)) d.visible = next.visible;
  if (J(prev.revealed) !== J(next.revealed)) d.revealed = next.revealed;
  const lastSeq = prev.log.length ? prev.log[prev.log.length - 1].seq : 0;
  const newLog = next.log.filter((l) => l.seq > lastSeq);
  if (newLog.length) d.log = newLog;
  return Object.keys(d).length ? d : null;
}

/** Client-side: apply a diff to a local view (deep-cloned data from the wire). */
export function applyDiff(view, d) {
  if (d.full) return structuredClone(d.full);
  if (d.meta) view.meta = d.meta;
  if (d.tilesFull) view.tiles = d.tilesFull;
  if (d.tiles) for (const [i, t] of Object.entries(d.tiles)) view.tiles[+i] = t;
  if (d.units) { for (const [id, u] of Object.entries(d.units.set)) view.units[id] = u; for (const id of d.units.del) delete view.units[id]; }
  if ('visible' in d) view.visible = d.visible;
  if (d.revealed) view.revealed = d.revealed;
  if (d.log) view.log = [...view.log, ...d.log].slice(-60);
  return view;
}
