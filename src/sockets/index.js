// Socket wiring: every connection gets the state, then role-gated handlers.
const { DM_KEY, CODM_KEY } = require('../config');
const { isLocalAddr } = require('../net');
const { stateFor, broadcast } = require('../state');

// Hardening (audit): a malformed event from any phone must not take the table down.
// - A null payload counts as "no payload", so `({ id } = {})` defaults apply.
// - A handler that throws is logged and dropped; the server keeps running.
function guard(socket) {
  const on = socket.on.bind(socket);
  socket.on = (event, fn) => on(event, (...args) => {
    if (args[0] === null) args[0] = undefined;
    try { return fn(...args); } catch (e) { console.warn(`  Event "${event}" failed and was ignored: ${e.message}`); }
  });
  return socket;
}

module.exports = function sockets(io) {
  io.on('connection', (socket) => {
    guard(socket);
    socket.emit('state', stateFor(socket));

    // TV pages announce themselves so the DM laptop knows whether it should output audio.
    socket.on('screen:hello', () => { socket.data.screen = true; broadcast(); });

    // Roles: DM (localhost or DM_KEY), co-DM (CODM_KEY).
    socket.on('dm:auth', ({ key } = {}, ack) => {
      socket.data.role = isLocalAddr(socket.handshake.address) || key === DM_KEY ? 'dm' : key === CODM_KEY ? 'codm' : null;
      if (socket.data.role === 'dm') socket.join('dms'); else socket.leave('dms');
      ack?.({ ok: !!socket.data.role, role: socket.data.role });
      broadcast();
    });

    require('./player')(socket);
    require('./dm')(socket);
    require('./plans')(socket);
    require('./atmo')(socket);
    require('./spectator')(socket);
    require('./quiz')(socket);
    require('./downtime')(socket);
    require('./journal')(socket);
  });
};
module.exports.guard = guard;
