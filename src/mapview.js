// Group Map View (Mike, Nov 18): the players open the world map on the TV themselves, not the DM. Each phone has
// a Group Map View button; the TV counts how many want the map, and once every seated player has pressed it the
// TV shows the map. With the map up the same button reads Close Map, and the same vote puts the TV back.
// state.mapVote = { dir: 'open' | 'close', want: [charId], n } is transient (never saved).
// Pure logic: the socket layer (src/sockets/worldmap.js) broadcasts.

// Seated: characters with a phone connected, still standing.
const seated = (state) => Object.values(state.players || {}).filter((p) => p.socketId && !p.death).map((p) => p.id);
const dirOf = (state) => (state.worldMap?.onTv ? 'close' : 'open');
// Combat hands the TV to the battle map, so the vote waits for the fight to end.
const blocked = (state) => (state.mode === 'combat' ? 'The battle map has the TV during combat.' : null);

// The vote follows the TV: when the map comes or goes some other way (travel, a dungeon, a mode change), the
// presses for the old direction no longer count.
function current(state) {
  const dir = dirOf(state);
  if (!state.mapVote || state.mapVote.dir !== dir) state.mapVote = { dir, want: [], n: (state.mapVote?.n || 0) + 1 };
  return state.mapVote;
}

// A phone presses (on) or takes its press back (off). Returns { ok, done } or { error }.
function press(state, charId, on = true) {
  const err = blocked(state);
  if (err) return { error: err };
  if (!seated(state).includes(charId)) return { error: 'Take a seat first.' };
  const v = current(state);
  v.want = on ? [...new Set([...v.want, charId])] : v.want.filter((id) => id !== charId);
  return { ok: true, done: settle(state) };
}

// Everyone seated wants it: flip the TV. Also runs on the ticker, so a phone that leaves cannot hold it up.
function settle(state) {
  if (!state.mapVote) return false;
  const v = current(state);
  const seats = seated(state);
  v.want = v.want.filter((id) => seats.includes(id));
  if (!seats.length || !v.want.length || blocked(state) || seats.some((id) => !v.want.includes(id))) return false;
  const W = state.worldMap;
  W.onTv = v.dir === 'open';
  if (W.tvTakeover) W.tvTakeover.kept = true; // a trip's hand-back must not undo the table's choice
  state.mapVote = { dir: dirOf(state), want: [], n: state.mapVote.n + 1 };
  return true;
}

// What a viewer sees: how many want it out of how many seated, which way, and whether this phone pressed.
function viewFor(state, viewer) {
  const v = state.mapVote && state.mapVote.dir === dirOf(state) ? state.mapVote : { dir: dirOf(state), want: [], n: (state.mapVote?.n || 0) + 1 };
  return { n: v.n || 0, dir: v.dir, want: v.want.length, total: seated(state).length, mine: viewer?.role === 'player' && v.want.includes(viewer.charId), blocked: blocked(state) };
}

module.exports = { press, settle, viewFor, seated };
