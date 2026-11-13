// Spectator events: join as a watcher (no seat), leave, suggest, and the DM dismissing a suggestion.
const { state, broadcast } = require('../state');
const session = require('../session');
const spectate = require('../spectate');
const { str } = require('../util');

module.exports = function spectatorSockets(socket) {
  socket.on('spectate', ({ room, name } = {}, ack) => {
    if (socket.data.device !== 'phone') return ack?.({ error: 'Spectators join from a phone.' });
    if (!session.sameRoom(state, room)) return ack?.({ error: 'room' });
    // Give up a seat first: a spectator never holds a character.
    const c = state.players[socket.data.charId];
    if (c && c.socketId === socket.id) c.socketId = null;
    socket.data.charId = null;
    socket.data.spectator = true;
    socket.data.spectatorName = str(name, 24) || 'Spectator';
    ack?.({ ok: true });
    broadcast();
  });

  socket.on('spectate:leave', () => {
    socket.data.spectator = false;
    broadcast();
  });

  socket.on('spectator:suggest', ({ text } = {}, ack) => {
    if (!socket.data.spectator) return ack?.({ error: 'Join as a spectator first.' });
    const r = spectate.suggest(socket, text);
    if (r.ok) broadcast();
    ack?.(r);
  });

  socket.on('dm:suggestion:dismiss', ({ id } = {}) => {
    if (socket.data.role !== 'dm') return;
    spectate.dismiss(id);
    broadcast();
  });
};
