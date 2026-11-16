// Town visit events (PR V). Phones hold Enter Town at the gate, pick a discovered place and hold the town action;
// once every online player has confirmed, the party goes and the story clock moves on by the place's time.
// The DM edits town maps (drag places onto the picture) and can override every step. Rules: src/town.js.
const { state, log, broadcast } = require('../state');
const town = require('../town');
const trail = require('../trail');
const clock = require('../clock');
const control = require('../control');

const playersNow = () => Object.values(state.players).map((p) => ({ id: p.id, online: !!p.socketId }));
const T = () => state.town;

// The party steps onto a town place: log it, and a place with a shop opens that shop's pop-up (the node's window).
function landed(n, spent) {
  if (!n) return;
  log('narrate', `The party goes to ${n.name}.`);
  trail.add(state, 'town', n.name);
  if (spent && n.time) clock.spend(state, n.time, n.name, log);
  const shop = n.shop && (state.shops || []).find((s) => s.id === n.shop);
  if (shop) {
    require('../popups').only(state, 'shop');
    shop.open = true;
    state.shopPop = { shopId: shop.id, n: (state.shopPop?.n || 0) + 1, done: [] };
    log('shop', `${shop.name} is open for business.`);
  }
}

function enter() {
  if (state.dungeon?.on) return { error: 'The party is in the dungeon.' };
  const r = town.enter(T(), state.worldMap);
  if (r.error) return r;
  log('narrate', `The party enters ${r.town.name}.`);
  trail.add(state, 'enter', r.town.name);
  state.worldMap.onTv = true;
  return { ok: true };
}
function leave(force) {
  if (!T().on) return { ok: true };
  const name = state.worldMap.nodes.find((n) => n.id === T().at)?.name || 'town';
  const r = town.leave(T(), force);
  if (r.error) return r;
  log('narrate', `The party leaves ${name}.`);
  trail.add(state, 'leave', name);
  if (state.shopPop) state.shopPop = null;
  return { ok: true };
}
// Everyone has confirmed: go.
function settle(force = false) {
  const n = town.resolve(T(), playersNow(), force);
  if (n) landed(n, true);
  return n;
}

module.exports = function townSockets(socket) {
  const me = () => control.actorOf(state, socket);
  socket.on('player:town:ready', ({ on = true } = {}, ack) => {
    const p = me();
    if (!p) return ack?.({ error: 'Join the party first.' });
    const g = town.setReady(T(), state.worldMap, playersNow(), p.id, !!on);
    if (!g) return ack?.({ error: 'There is no town gate here.' });
    if (town.allReady(g)) enter();
    broadcast();
    ack?.({ ok: true });
  });
  // Pick a place (confirm: false) or hold the town action on it (confirm: true). node null takes the pick back.
  socket.on('player:town:pick', ({ node, confirm = false } = {}, ack) => {
    const p = me();
    if (!p || !T().on) return ack?.({ error: 'The party is not in town.' });
    const ok = node ? town.pick(T(), p.id, node, !!confirm, Date.now()) : town.unpick(T(), p.id);
    if (!ok) return ack?.({ error: 'The party cannot go there.' });
    settle();
    broadcast();
    ack?.({ ok: true });
  });
  socket.on('player:town:leave', (_p, ack) => {
    if (!me()) return ack?.({ error: 'Join the party first.' });
    const r = leave(false);
    broadcast();
    ack?.(r);
  });

  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const out = fn(payload || {}) ?? {};
    broadcast();
    ack?.(out);
  });
  // The map being edited: the world place `at` (made on first use).
  const mapOf = (at) => (state.worldMap.nodes.some((n) => n.id === at) ? town.mapFor(T(), at) : null);

  dm('dm:town:node', (f) => {
    const m = mapOf(f.at);
    if (!m) return { error: 'Pick a town on the world map.' };
    const r = town.save(m, f);
    return r.error ? r : { ok: true, id: r.node.id };
  });
  dm('dm:town:remove', ({ at, id }) => { const m = mapOf(at); return { ok: !!m && town.remove(T(), m, id) }; });
  dm('dm:town:image', ({ at, url }) => { const m = mapOf(at); if (!m) return { error: 'Pick a town.' }; m.image = String(url || '').slice(0, 300); return { ok: true }; });
  dm('dm:town:starter', ({ at }) => {
    if (!mapOf(at)) return { error: 'Pick a town.' };
    if (T().on && T().at === at) return { error: 'The party is in that town.' };
    T().maps[at] = town.starter();
    return { ok: true };
  });
  dm('dm:town:reveal', ({ at, id, on }) => {
    const m = mapOf(at);
    const ids = id === '*' ? m?.nodes.map((n) => n.id) || [] : [id];
    for (const x of ids) { const n = town.byId(m, x); if (n) n.seen = !!on; }
    if (on && id !== '*' && town.byId(m, id)) log('narrate', `Discovered: ${town.byId(m, id).name}.`);
    return { ok: true };
  });
  dm('dm:town:show', ({ on }) => (on ? enter() : leave(true)));
  dm('dm:town:here', ({ id, spend }) => {
    const n = town.moveTo(T(), id);
    if (!n) return { error: 'Open the town first, and pick one of its places.' };
    landed(n, !!spend);
    return { ok: true };
  });
  // The DM settles the town action now: the most picked place wins, even if someone is still deciding.
  dm('dm:town:resolve', () => (settle(true) ? { ok: true } : { error: 'Nobody has confirmed a place yet.' }));
  dm('dm:town:clearpicks', () => { T().picks = {}; });
};
module.exports.enter = enter;
module.exports.leave = leave;
