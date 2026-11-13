// Relations web events (see src/web.js). DM only. Faction nodes link to the reputation list.
const { state, broadcast } = require('../state');
const web = require('../web');

const newId = (p) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

module.exports = function webSockets(socket) {
  const isDm = () => socket.data.role === 'dm';

  socket.on('dm:web:node', (spec = {}, ack) => {
    if (!isDm()) return ack?.({ error: 'Only the DM edits the web.' });
    const r = web.addNode(state.web, spec, newId('n'), state.factions || []);
    if (r.error) return ack?.({ error: r.error });
    broadcast();
    ack?.({ ok: true, id: r.node.id });
  });

  socket.on('dm:web:edge', (spec = {}, ack) => {
    if (!isDm()) return ack?.({ error: 'Only the DM edits the web.' });
    const r = web.addEdge(state.web, spec, newId('e'));
    if (r.error) return ack?.({ error: r.error });
    broadcast();
    ack?.({ ok: true, id: r.edge.id });
  });

  // Reveal or hide one node or link. kind: 'node' | 'edge'.
  socket.on('dm:web:reveal', ({ kind, id, on } = {}) => {
    if (!isDm() || !web.reveal(state.web, kind, id, on)) return;
    broadcast();
  });

  socket.on('dm:web:value', ({ id, value } = {}) => {
    if (!isDm() || !web.setValue(state.web, id, value)) return;
    broadcast();
  });

  socket.on('dm:web:remove', ({ kind, id } = {}) => {
    if (!isDm() || !web.remove(state.web, kind, id)) return;
    broadcast();
  });

  // Put the revealed parts on the TV, or take them off.
  socket.on('dm:web:show', ({ on } = {}) => {
    if (!isDm()) return;
    state.web.showTv = !!on;
    broadcast();
  });
};
