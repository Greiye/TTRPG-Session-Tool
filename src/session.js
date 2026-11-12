// Session and join flow: room code, seat claims, device tokens for silent reconnects.
//
// - The room code (4 letters) is on the TV and inside the QR. A phone needs it to claim a seat,
//   so a stale tab from last week, or a neighbour on the same Wi-Fi, can't walk in.
// - Each claim issues a device token. A phone that reconnects with its token gets its seat back
//   silently, even if the old connection hasn't timed out yet.
// - Taking over a character someone else holds right now needs an explicit takeover flag.
const crypto = require('crypto');
const hub = require('./hub');

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O, easy to read off a TV
const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
const newToken = () => crypto.randomBytes(12).toString('hex');
const sameRoom = (state, code) => String(code || '').trim().toUpperCase() === state.room;

// Drop a character's current phone: tell it, and stop that socket from viewing as the character.
function release(c) {
  if (!c.socketId) return;
  const old = hub.io.sockets.sockets.get(c.socketId);
  if (old) { old.data.charId = null; old.emit('taken'); }
  c.socketId = null;
}

// Decide whether `socket` may sit in character `c`. Returns null if allowed, else an error code.
function claimError(state, c, { token, room, takeover }, socket) {
  const own = token && c.token && token === c.token;
  if (!own && !sameRoom(state, room)) return 'room';
  if (!own && c.socketId && c.socketId !== socket.id && !takeover) return 'in-use';
  return null;
}
function seat(c, socket) {
  if (c.socketId && c.socketId !== socket.id) release(c);
  c.socketId = socket.id;
  socket.data.charId = c.id;
}

module.exports = { newRoomCode, newToken, sameRoom, release, claimError, seat };
