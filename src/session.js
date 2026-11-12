// Seat claims: which socket currently plays which character.
const hub = require('./hub');

// Drop a character's current phone: tell it, and stop that socket from viewing as the character.
function release(c) {
  if (!c.socketId) return;
  const old = hub.io.sockets.sockets.get(c.socketId);
  if (old) { old.data.charId = null; old.emit('taken'); }
  c.socketId = null;
}

module.exports = { release };
