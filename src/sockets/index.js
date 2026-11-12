// Socket wiring: every connection gets the state, then role-gated handlers.
const { DM_KEY, CODM_KEY } = require('../config');
const { isLocalAddr } = require('../net');
const { stateFor, broadcast } = require('../state');

module.exports = function sockets(io) {
  io.on('connection', (socket) => {
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
    require('./atmo')(socket);
    require('./spectator')(socket);
  });
};
