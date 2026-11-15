// Authoritative game rules. Pure-ish: mutates `state`, returns {ok, error?, events[]}.
// Runs on the Node server and (for hot-seat mode) in the browser via the same Room.
import {
  generateMap, tileAt, idx, inBounds, findPath, hasLOS, hasCover, rollDice, dirFromDelta, mulberry32,
} from './grid.js';

export const DM_INTENTS = new Set([
  'spawn', 'delete', 'setTile', 'setHp', 'setAp', 'setInitiative', 'setActive', 'reveal',
  'setFog', 'assign', 'rerollInitiative', 'newMap', 'teleport', 'setFacing',
]);

/**
 * Create a game state.
 * opts.seed: map seed. opts.w/h: map size.
 * opts.map: {w, h, tiles:[{h, type, obstacle}]} to use a host-supplied map instead of generating one.
 * opts.units: [{kind, x, y, team?, owner?, name?, hp?}] to place a host-supplied roster (skips default spawns).
 */
export function createGame(rules, { w = 20, h = 20, seed = (Math.random() * 1e9) | 0, map = null, units = null } = {}) {
  const m = map ? { w: map.w, h: map.h, tiles: map.tiles.map((t) => ({ h: t.h | 0, type: t.type || 'grass', obstacle: t.obstacle || null })) } : generateMap(w, h, seed);
  if (m.tiles.length !== m.w * m.h) throw new Error('map.tiles length must equal w*h');
  const state = {
    seed, w: m.w, h: m.h, tiles: m.tiles, units: {}, nextId: 1,
    initiative: [], turn: 0, round: 1, fog: true, revealed: [], log: [], logSeq: 0,
  };
  if (units) {
    for (const d of units) {
      const spot = passable(state, rules, d.x, d.y) ? [d.x, d.y] : findFreeNear(state, rules, d.x, d.y);
      if (!spot) continue;
      const u = spawnUnit(state, rules, d.kind, spot[0], spot[1], d.team);
      if (d.owner) u.owner = d.owner;
      if (d.name) u.name = d.name;
      if (d.hp != null) u.hp = Math.min(u.maxHp, d.hp);
    }
  } else {
    const place = (kinds, cx, cy, team) => {
      for (const kind of kinds) {
        const spot = findFreeNear(state, rules, cx, cy);
        if (spot) spawnUnit(state, rules, kind, spot[0], spot[1], team);
      }
    };
    place(rules.startingParty || [], 2, 2, 'players');
    place(rules.startingMonsters || [], state.w - 3, state.h - 3, 'monsters');
  }
  rollInitiative(state, rules);
  log(state, `Round 1 begins.${map ? '' : ` Map seed ${seed}.`}`);
  return state;
}

export function log(state, msg) {
  state.logSeq++;
  state.log.push({ seq: state.logSeq, msg });
  if (state.log.length > 60) state.log.shift();
}

export function unitAt(state, x, y) {
  return Object.values(state.units).find((u) => u.x === x && u.y === y && !u.dead) || null;
}

function passable(state, rules, x, y) {
  const t = tileAt(state, x, y);
  return t && !(t.obstacle && rules.obstacles[t.obstacle]?.blocksMove) && !unitAt(state, x, y);
}

export function findFreeNear(state, rules, cx, cy) {
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (passable(state, rules, cx + dx, cy + dy)) return [cx + dx, cy + dy];
  }
  return null;
}

export function spawnUnit(state, rules, kind, x, y, team) {
  const def = rules.units[kind];
  if (!def) throw new Error('unknown kind ' + kind);
  const id = 'u' + state.nextId++;
  const sameKind = Object.values(state.units).filter((u) => u.kind === kind).length;
  state.units[id] = {
    id, kind, name: def.name + (sameKind ? ' ' + (sameKind + 1) : ''),
    team: team || def.team, owner: null,
    x, y, facing: (team || def.team) === 'players' ? 0 : 4,
    hp: def.hp, maxHp: def.hp, ap: def.ap, maxAp: def.ap,
    init: def.init, defense: def.defense, sight: def.sight,
    abilities: [...def.abilities], dead: false,
  };
  return state.units[id];
}

export function rollInitiative(state, rules, rand = Math.random) {
  const rolls = Object.values(state.units).filter((u) => !u.dead).map((u) => [u.id, 1 + Math.floor(rand() * 20) + u.init + rand() * 0.01]);
  rolls.sort((a, b) => b[1] - a[1]);
  state.initiative = rolls.map((r) => r[0]);
  state.turn = 0;
  const a = activeUnit(state); if (a) a.ap = a.maxAp;
}

export function activeUnit(state) {
  return state.units[state.initiative[state.turn]] || null;
}

function advanceTurn(state) {
  const n = state.initiative.length;
  if (!n) return;
  for (let k = 0; k < n; k++) {
    state.turn++;
    if (state.turn >= n) { state.turn = 0; state.round++; log(state, `Round ${state.round} begins.`); }
    const u = activeUnit(state);
    if (u && !u.dead) { u.ap = u.maxAp; log(state, `${u.name}'s turn.`); return; }
  }
}

export function canControl(state, actor, unit) {
  if (!unit) return false;
  if (actor.isDM) return true;
  return unit.owner === actor.name && activeUnit(state)?.id === unit.id && !unit.dead;
}

export function blockedSet(state, exceptId) {
  const b = new Set();
  for (const u of Object.values(state.units)) if (!u.dead && u.id !== exceptId) b.add(idx(state, u.x, u.y));
  return b;
}

export function attackPreview(state, rules, unit, abilityId, target) {
  const ab = rules.abilities[abilityId];
  if (!ab || !target) return { ok: false, error: 'no target' };
  const ta = tileAt(state, unit.x, unit.y), tb = tileAt(state, target.x, target.y);
  const dist = Math.hypot(target.x - unit.x, target.y - unit.y);
  if (dist > ab.range) return { ok: false, error: 'out of range' };
  if (ab.melee && Math.abs(ta.h - tb.h) > rules.grid.maxClimb) return { ok: false, error: 'height gap too large for melee' };
  if (ab.needsLOS && !hasLOS(state, rules, unit.x, unit.y, target.x, target.y, 1.0)) return { ok: false, error: 'no line of sight' };
  if (ab.targetsAllies ? target.team !== unit.team : target.team === unit.team) return { ok: false, error: ab.targetsAllies ? 'must target ally' : 'cannot target ally' };
  const c = rules.combat;
  const cover = !ab.targetsAllies && hasCover(state, rules, unit.x, unit.y, target.x, target.y);
  const hb = Math.max(-c.maxHeightBonus, Math.min(c.maxHeightBonus, (ta.h - tb.h) * c.heightBonusPerStep));
  let chance = ab.targetsAllies ? 100 : ab.accuracy - target.defense + hb - (cover ? c.coverPenalty : 0);
  if (!ab.targetsAllies) chance = Math.max(c.minHit, Math.min(c.maxHit, chance));
  return { ok: true, chance, cover, heightBonus: hb, ability: ab };
}

/**
 * Apply an intent from an actor. actor = {name, isDM}.
 */
export function applyIntent(state, rules, actor, intent, rand = Math.random, custom = null) {
  const fail = (error) => ({ ok: false, error, events: [] });
  const events = [];
  if (!intent || typeof intent.type !== 'string') return fail('bad intent');
  if (DM_INTENTS.has(intent.type) && !actor.isDM) return fail('DM only');
  const ext = custom?.get(intent.type);
  if (ext) {
    if (ext.dmOnly && !actor.isDM) return fail('DM only');
    const r = ext.apply({ state, rules, actor, intent, rand, log: (m) => log(state, m), canControl: (u) => canControl(state, actor, u) }) || {};
    return { ok: r.ok !== false, error: r.error, events: r.events || [] };
  }
  const unit = intent.unitId ? state.units[intent.unitId] : null;

  switch (intent.type) {
    case 'move': {
      if (!unit || unit.dead) return fail('no such unit');
      if (!canControl(state, actor, unit)) return fail('not your turn / unit');
      const to = intent.to;
      if (!Array.isArray(to) || !inBounds(state, to[0], to[1])) return fail('bad target');
      const ignoreAp = actor.isDM && activeUnit(state)?.id !== unit.id; // DM moving out of turn: free, still pathed
      const res = findPath(state, rules, [unit.x, unit.y], to, blockedSet(state, unit.id), ignoreAp ? Infinity : unit.ap);
      if (!res || !res.path.length) return fail('no path within AP');
      const from = [unit.x, unit.y];
      const last = res.path[res.path.length - 1], prev = res.path[res.path.length - 2] || from;
      unit.facing = dirFromDelta(last[0] - prev[0], last[1] - prev[1]);
      unit.x = to[0]; unit.y = to[1];
      if (!ignoreAp) unit.ap -= res.cost;
      events.push({ type: 'move', unitId: unit.id, path: [from, ...res.path] });
      break;
    }
    case 'teleport': {
      if (!unit) return fail('no such unit');
      const [x, y] = intent.to || [];
      if (!passable(state, rules, x, y) && !(unit.x === x && unit.y === y)) return fail('blocked');
      unit.x = x; unit.y = y;
      events.push({ type: 'teleport', unitId: unit.id });
      break;
    }
    case 'attack': {
      if (!unit || unit.dead) return fail('no such unit');
      if (!canControl(state, actor, unit)) return fail('not your turn / unit');
      if (!unit.abilities.includes(intent.ability)) return fail('unit lacks ability');
      const ab = rules.abilities[intent.ability];
      if (unit.ap < ab.ap) return fail('not enough AP');
      const target = state.units[intent.targetId];
      if (!target || target.dead) return fail('no target');
      const pv = attackPreview(state, rules, unit, intent.ability, target);
      if (!pv.ok) return fail(pv.error);
      unit.ap -= ab.ap;
      unit.facing = dirFromDelta(target.x - unit.x, target.y - unit.y);
      const hit = rand() * 100 < pv.chance;
      let amount = 0;
      if (hit) {
        amount = rollDice(ab.damage, rand);
        target.hp = Math.max(0, Math.min(target.maxHp, target.hp - amount));
        if (target.hp <= 0) target.dead = true;
      }
      const verb = amount < 0 ? `heals ${target.name} for ${-amount}` : hit ? `hits ${target.name} for ${amount}` : `misses ${target.name}`;
      log(state, `${unit.name} uses ${ab.name}: ${verb} (${pv.chance}%${pv.cover ? ', cover' : ''}).${target.dead ? ` ${target.name} falls!` : ''}`);
      events.push({ type: 'attack', unitId: unit.id, targetId: target.id, ability: intent.ability, hit, amount, chance: pv.chance });
      break;
    }
    case 'endTurn': {
      const a = activeUnit(state);
      if (!a) return fail('no active unit');
      if (!actor.isDM && !(a.owner === actor.name)) return fail('not your turn');
      advanceTurn(state);
      events.push({ type: 'turn' });
      break;
    }
    case 'claim': {
      if (!unit || unit.team !== 'players') return fail('can only claim party units');
      if (unit.owner && unit.owner !== actor.name) return fail('already claimed');
      unit.owner = intent.release ? null : actor.name;
      log(state, intent.release ? `${actor.name} released ${unit.name}.` : `${actor.name} controls ${unit.name}.`);
      break;
    }
    // ---------- DM ----------
    case 'spawn': {
      const [x, y] = intent.at || [];
      if (!rules.units[intent.kind]) return fail('unknown kind');
      if (!passable(state, rules, x, y)) return fail('blocked');
      const u = spawnUnit(state, rules, intent.kind, x, y, intent.team);
      // insert into initiative after current
      state.initiative.splice(state.turn + 1, 0, u.id);
      log(state, `DM spawns ${u.name}.`);
      events.push({ type: 'spawn', unitId: u.id });
      break;
    }
    case 'delete': {
      if (!unit) return fail('no such unit');
      const i = state.initiative.indexOf(unit.id);
      const wasActive = i === state.turn;
      if (i >= 0) { state.initiative.splice(i, 1); if (i < state.turn) state.turn--; }
      delete state.units[unit.id];
      if (state.turn >= state.initiative.length) state.turn = 0;
      if (wasActive) { const a = activeUnit(state); if (a) a.ap = a.maxAp; }
      log(state, `DM removes ${unit.name}.`);
      break;
    }
    case 'setTile': {
      const t = tileAt(state, intent.x, intent.y);
      if (!t) return fail('bad tile');
      if (intent.h !== undefined) t.h = Math.max(0, Math.min(12, intent.h | 0));
      if (intent.type2) { if (!rules.terrain[intent.type2]) return fail('bad terrain'); t.type = intent.type2; }
      if (intent.obstacle !== undefined) {
        if (intent.obstacle && !rules.obstacles[intent.obstacle]) return fail('bad obstacle');
        if (intent.obstacle && unitAt(state, intent.x, intent.y)) return fail('occupied');
        t.obstacle = intent.obstacle || null;
      }
      break;
    }
    case 'setHp': {
      if (!unit) return fail('no such unit');
      if (intent.maxHp) unit.maxHp = Math.max(1, intent.maxHp | 0);
      unit.hp = Math.max(0, Math.min(unit.maxHp, intent.hp | 0));
      unit.dead = unit.hp <= 0;
      log(state, `DM sets ${unit.name} HP to ${unit.hp}.`);
      break;
    }
    case 'setAp': {
      if (!unit) return fail('no such unit');
      unit.ap = Math.max(0, intent.ap | 0);
      break;
    }
    case 'setFacing': {
      if (!unit) return fail('no such unit');
      unit.facing = ((intent.facing | 0) % 8 + 8) % 8;
      break;
    }
    case 'setInitiative': {
      const order = intent.order;
      const cur = activeUnit(state)?.id;
      if (!Array.isArray(order) || order.length !== state.initiative.length || !order.every((id) => state.initiative.includes(id))) return fail('bad order');
      state.initiative = [...order];
      state.turn = Math.max(0, state.initiative.indexOf(cur));
      break;
    }
    case 'setActive': {
      const i = state.initiative.indexOf(intent.unitId);
      if (i < 0) return fail('not in initiative');
      state.turn = i; unit.ap = unit.maxAp;
      log(state, `DM gives the turn to ${unit.name}.`);
      events.push({ type: 'turn' });
      break;
    }
    case 'rerollInitiative': rollInitiative(state, rules, rand); log(state, 'DM rerolls initiative.'); events.push({ type: 'turn' }); break;
    case 'setFog': state.fog = !!intent.enabled; log(state, `Fog of war ${state.fog ? 'on' : 'off'}.`); break;
    case 'reveal': {
      const set = new Set(state.revealed);
      for (const i of intent.tiles || []) { if (i >= 0 && i < state.tiles.length) intent.on === false ? set.delete(i) : set.add(i); }
      state.revealed = [...set];
      break;
    }
    case 'assign': {
      if (!unit) return fail('no such unit');
      unit.owner = intent.owner || null;
      if (intent.team) unit.team = intent.team;
      log(state, `DM assigns ${unit.name} to ${unit.owner || 'nobody'}.`);
      break;
    }
    case 'newMap': {
      const fresh = createGame(rules, { w: intent.w || state.w, h: intent.h || state.h, seed: intent.seed ?? (rand() * 1e9) | 0, map: intent.map || null, units: intent.units || null });
      // carry over ownership by kind
      const owners = Object.values(state.units).filter((u) => u.owner).map((u) => [u.kind, u.owner]);
      for (const [kind, owner] of owners) { const u = Object.values(fresh.units).find((v) => v.kind === kind && !v.owner); if (u) u.owner = owner; }
      const seq = state.logSeq;
      for (const k of Object.keys(state)) delete state[k];
      Object.assign(state, fresh, { logSeq: seq + fresh.logSeq, log: fresh.log.map((l) => ({ ...l, seq: l.seq + seq })) });
      events.push({ type: 'newMap' });
      break;
    }
    default: return fail('unknown intent ' + intent.type);
  }
  return { ok: true, events };
}

export { mulberry32 };
