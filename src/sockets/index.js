// Socket wiring: every connection gets the state, then role-gated handlers.
const { DM_KEY, CODM_KEY, BATTLE_KEY, SOCIAL_KEY } = require('../config');
const { isLocalAddr } = require('../net');
const { stateFor, broadcast } = require('../state');
const worldSockets = require('./worldmap');

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

    // Roles: DM (localhost or DM_KEY), co-DM (CODM_KEY), Battle Master (BATTLE_KEY), Social Master (SOCIAL_KEY).
    // A co-DM key wins over localhost, so a helper link opened on the laptop still gets the helper's view.
    socket.on('dm:auth', ({ key } = {}, ack) => {
      const byKey = { [CODM_KEY]: 'codm', [BATTLE_KEY]: 'battle', [SOCIAL_KEY]: 'social' };
      socket.data.role = key === DM_KEY ? 'dm' : (key && byKey[key]) || (isLocalAddr(socket.handshake.address) ? 'dm' : null);
      // The 'dms' room gets secret rolls; the Battle Master rolls for the DM's creatures, so they get them too.
      if (['dm', 'battle'].includes(socket.data.role)) socket.join('dms'); else socket.leave('dms');
      ack?.({ ok: !!socket.data.role, role: socket.data.role });
      broadcast();
    });

    require('./player')(socket);
    require('./dm')(socket);
    require('./plans')(socket);
    require('./atmo')(socket);
    // Phase 5: what kind of screen this is (phone, tablet or laptop). Spectators are phone only.
    socket.on('client:device', ({ device } = {}) => {
      if (['phone', 'tablet', 'laptop'].includes(device)) socket.data.device = device;
    });
    require('./spectator')(socket);
    require('./quiz')(socket);
    require('./downtime')(socket);
    require('./journal')(socket);
    require('./takeover')(socket);
    require('./legends')(socket);
    worldSockets(socket);
    require('./moments')(socket);
    require('./table')(socket); // Phase I table tools
    require('./living')(socket);
    require('./puzzle')(socket);
    require('./web')(socket);
    require('./dungeon')(socket);
  });
};
module.exports.guard = guard;
