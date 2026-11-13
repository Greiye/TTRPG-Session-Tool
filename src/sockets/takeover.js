// DM takeover events (src/control.js): a DM tab plays a party character, or gives it back.
const { state, broadcast } = require('../state');
const control = require('../control');

module.exports = function takeoverSockets(socket) {
  socket.on('dm:takeover', ({ id } = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'Only the DM can take a character.' });
    const r = control.take(state, id, socket);
    if (r.ok) broadcast();
    ack?.(r);
  });
  socket.on('dm:takeover:release', (_, ack) => {
    if (socket.data.takeover) control.release(state, socket.data.takeover, socket);
    broadcast();
    ack?.({ ok: true });
  });
  socket.on('dm:control:drop', ({ id } = {}) => {
    if (socket.data.role !== 'dm') return;
    control.drop(state, id);
    broadcast();
  });
  // A closed DM tab gives its character back.
  socket.on('disconnect', () => {
    control.releaseAll(state, socket);
    broadcast();
  });
};
