// DM takeover: the DM can play any party character from a second DM tab. While the DM holds a
// character, that character's phone is locked out of actions and rolls. Notes and the sheet can
// still be read, and phone notes and sheet notes can still be written.
//
// Holder: the DM tab's socket. Only that socket may act as the character.
// Public flag: state.dmControl[charId] = true, sent to every viewer so the phone can show the message.
const owners = new Map(); // charId -> socket id of the DM tab holding it (not saved; a restart clears it)

// The character this socket is seated in, whether or not it may act right now.
// A takeover tab is seated in the character it holds. A phone is seated in its claimed character.
function seatOf(state, socket) {
  if (socket.data.takeover) {
    const c = state.players[socket.data.takeover];
    return c && owners.get(c.id) === socket.id ? c : null;
  }
  const c = state.players[socket.data.charId];
  return c && c.socketId === socket.id ? c : null;
}

// The character this socket may act as: its seat, unless the DM holds that character from another tab.
function actorOf(state, socket) {
  const c = seatOf(state, socket);
  if (!c) return null;
  if (socket.data.takeover) return c;
  return owners.has(c.id) ? null : c;
}

function isControlled(charId) { return owners.has(charId); }

// The DM drops a character from any DM tab. The holding tab can no longer act as it.
function drop(state, charId) {
  owners.delete(charId);
  delete state.dmControl[charId];
}

// Take a character. Refused if the character is missing or another DM tab already holds it.
function take(state, charId, socket) {
  const c = state.players[charId];
  if (!c) return { error: 'That character is not at the table.' };
  if (owners.has(charId) && owners.get(charId) !== socket.id) return { error: 'The DM is already controlling this character.' };
  if (socket.data.takeover && socket.data.takeover !== charId) release(state, socket.data.takeover, socket);
  owners.set(charId, socket.id);
  socket.data.takeover = charId;
  socket.data.charId = charId;
  state.dmControl[charId] = true;
  return { ok: true, id: charId };
}

function release(state, charId, socket) {
  if (owners.get(charId) !== socket.id) return;
  owners.delete(charId);
  delete state.dmControl[charId];
  socket.data.takeover = null;
  socket.data.charId = null;
}

// A DM tab that closes gives its character back.
function releaseAll(state, socket) {
  for (const [charId, sid] of [...owners]) if (sid === socket.id) release(state, charId, socket);
}

module.exports = { seatOf, actorOf, isControlled, take, release, drop, releaseAll, owners };
