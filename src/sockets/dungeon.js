// Dungeon node events (exploration). DM only: build the tree, reveal rooms, move the party. See src/dungeon.js.
// The dungeon is a pop-up over the world map: it opens only on a dungeon entrance place, and closes only from
// its start or end room. Travel on the world map waits until it is closed (src/sockets/worldmap.js).
const { state, log, broadcast } = require('../state');
const dg = require('../dungeon');
const wm = require('../worldmap');
const trail = require('../trail');

// Open the dungeon pop-up for everyone. Refused unless the party stands on a dungeon entrance.
function open() {
  const at = wm.dungeonHere(state.worldMap);
  if (!at) return { error: 'The party must stand on a dungeon entrance on the world map.' };
  if (state.dungeon.on) return { ok: true };
  const r = dg.enter(state.dungeon);
  if (r.error) return r;
  log('narrate', `The party enters ${at.name}.`);
  trail.add(state, 'enter', at.name);
  if (r.here) trail.add(state, 'room', r.here.name);
  return { ok: true };
}
// Close it. Refused unless the party is at the dungeon's start or end.
function close() {
  if (!state.dungeon.on) return { ok: true };
  const r = dg.leave(state.dungeon);
  if (r.error) return r;
  const at = state.worldMap.nodes.find((n) => n.id === state.worldMap.here);
  log('narrate', `The party leaves ${at?.name || 'the dungeon'}.`);
  if (at) trail.add(state, 'leave', at.name);
  return { ok: true };
}

module.exports = function dungeonSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const out = fn(payload || {}) ?? {};
    broadcast();
    ack?.(out);
  });
  const D = () => state.dungeon;

  dm('dm:dungeon:show', ({ on }) => (on ? open() : close()));
  dm('dm:dungeon:node', (spec) => {
    const r = dg.save(D(), spec);
    return r.error ? r : { ok: true, id: r.node.id };
  });
  dm('dm:dungeon:link', ({ from, to, on = true }) => dg.link(D(), from, to, on));
  dm('dm:dungeon:remove', ({ id }) => ({ ok: dg.remove(D(), id) }));
  dm('dm:dungeon:reveal', ({ id, on }) => {
    const n = dg.byId(D(), id);
    const ok = dg.reveal(D(), id, on);
    if (ok && on && n) log('narrate', `Discovered: ${n.name}.`);
    return { ok };
  });
  dm('dm:dungeon:here', ({ id }) => {
    const n = dg.moveTo(D(), id);
    if (!n) return { error: 'Unknown room.' };
    log('narrate', `The party moves to ${n.name}.`);
    if (D().on) trail.add(state, 'room', n.name);
    return { ok: true };
  });
  dm('dm:dungeon:example', () => { state.dungeon = dg.example(); });
  dm('dm:dungeon:clear', () => { state.dungeon = dg.blank(); });
};
module.exports.open = open;
module.exports.close = close;
