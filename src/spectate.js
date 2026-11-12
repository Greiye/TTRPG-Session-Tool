// Spectators (item 5): phones that watch the table without a seat. They see what the TV sees
// (no room code, no secrets, no sheets) and can send short suggestions. Suggestions show to the
// DM and players only. Spectators cannot roll, vote, claim spoils, act, or take a character.
const { state, nextId } = require('./state');
const { str } = require('./util');

const MAX = 30; // suggestions kept on the table
const GAP_MS = 3000; // one suggestion per spectator every few seconds
const VIS = { to: ['*'], screen: false }; // '*' = every phone player and the DM; not the TV, not spectators

function suggest(socket, text) {
  const now = Date.now();
  if (now - (socket.data.lastSuggest || 0) < GAP_MS) return { error: 'Give it a few seconds before the next one.' };
  const t = str(text, 200);
  if (!t) return { error: 'Write a suggestion first.' };
  socket.data.lastSuggest = now;
  state.suggestions.push({ id: nextId(), name: socket.data.spectatorName || 'Spectator', text: t, at: now, vis: VIS });
  while (state.suggestions.length > MAX) state.suggestions.shift();
  return { ok: true };
}

function dismiss(id) {
  const i = state.suggestions.findIndex((s) => s.id === Number(id));
  if (i >= 0) state.suggestions.splice(i, 1);
}

module.exports = { suggest, dismiss, MAX, GAP_MS };
