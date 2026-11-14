// Dungeon node events (exploration). DM only: build the tree, reveal rooms, move the party. See src/dungeon.js.
const { state, log, broadcast } = require('../state');
const dg = require('../dungeon');

module.exports = function dungeonSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const out = fn(payload || {}) ?? {};
    broadcast();
    ack?.(out);
  });
  const D = () => state.dungeon;

  dm('dm:dungeon:show', ({ on }) => { D().on = !!on; });
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
    return { ok: true };
  });
  dm('dm:dungeon:example', () => { state.dungeon = dg.example(); });
  dm('dm:dungeon:clear', () => { state.dungeon = dg.blank(); });
};
