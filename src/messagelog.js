// Table message log (phase 5): what the DM, the Co-DM and the players say to the table in writing.
// Kept apart from the event log (state.log) so it can be read on its own.
const { str } = require('./util');

const MAX = 200;

// Add one message. `from` is the speaker's label: a character name, 'DM' or 'Co-DM'.
function post(list, { from, role, text, at = Date.now(), id }) {
  const body = str(text, 300);
  if (!body) return null;
  const m = { id, from: str(from, 40) || 'Table', role: ['dm', 'codm', 'player'].includes(role) ? role : 'player', text: body, at };
  list.push(m);
  if (list.length > MAX) list.splice(0, list.length - MAX);
  return m;
}

module.exports = { MAX, post };
