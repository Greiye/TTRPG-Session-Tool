// Party journal events (see src/journal.js). Phones add and remove their own notes; the DM can remove any.
const { state, broadcast } = require('../state');
const journal = require('../journal');

module.exports = function journalSockets(socket) {
  const me = () => {
    const c = state.players[socket.data.charId];
    return c && c.socketId === socket.id ? c : null;
  };

  socket.on('player:journal:add', ({ text, kind } = {}) => {
    const p = me();
    if (!p || !journal.add(state.journal, p, { text, kind })) return;
    broadcast();
  });

  socket.on('player:journal:remove', ({ id } = {}) => {
    const p = me();
    if (p && journal.remove(state.journal, id, { role: 'player', charId: p.id })) broadcast();
  });

  socket.on('dm:journal:remove', ({ id } = {}) => {
    if (socket.data.role === 'dm' && journal.remove(state.journal, id, { role: 'dm' })) broadcast();
  });
};
