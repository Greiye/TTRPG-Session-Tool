// TV landing page (Mike, Nov 18). When the server starts, the TV opens on a landing page: "Landing Page" at the
// top, character slots with "Join Game" under each (arcade style), and a faded Start game that lights up once
// one player has joined with the QR. Phones that join see "You have joined the game!". The TV's Start game is
// display only: the first player to join presses Start game on their phone (or the DM on the DM screen). That
// closes the landing page and the session opens on the world map.
// state.lobby is transient: true on every server start (LOBBY=0 skips it, the tests use that).
const { state } = require('./state');

state.lobby = process.env.LOBBY !== '0';

const seated = () => Object.values(state.players).filter((p) => p.socketId);
const joined = () => seated().length;
// The first player who joined (still seated) holds Start game on their phone.
const starter = () => seated()[0]?.id || null;

// Start the game: needs one joined player. Returns { ok } or { error }.
function start() {
  if (!state.lobby) return { ok: true };
  if (!joined()) return { error: 'At least one player has to join first.' };
  state.lobby = false;
  require('./sockets/worldmap').openSession(); // straight to the world map
  const W = state.worldMap;
  if (W && (W.image || W.nodes?.length)) W.onTv = true; // even with "open on the map each session" off
  return { ok: true };
}

module.exports = { start, joined, starter };
