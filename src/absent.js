// Empty chair (phase J). A seated character whose phone has gone is an empty chair.
//   - Autopilot: the DM can put an empty chair on autopilot. On its turn it takes the Dodge action, and the
//     turn moves on. The DM can still take the character over (src/control.js).
//   - What you missed: everything the table could see while the chair was empty is kept, and the player
//     gets it as a card the next time their phone claims the seat.
// State: state.absent[charId] = { away, autopilot, missed: [{ kind, text, tone, t }] }. DM-only details;
// viewers see only the away and autopilot flags (src/visibility.js).
const { canSee } = require('./visibility');

const MAX_MISSED = 40;

function entryOf(state, id) {
  state.absent ??= {};
  return (state.absent[id] ??= { away: false, autopilot: false, missed: [] });
}
const isAutopilot = (state, id) => !!state.absent?.[id]?.autopilot;

// The phone for this character is gone.
function away(state, id) {
  entryOf(state, id).away = true;
}

// Autopilot only applies to an empty chair. Turning it off keeps any missed lines for the player.
function setAutopilot(state, id, on) {
  const c = state.players[id];
  if (!c) return { error: 'Only characters at the table can go on autopilot.' };
  if (on && c.socketId) return { error: `${c.name} has a phone connected. Autopilot is for empty chairs.` };
  const a = entryOf(state, id);
  a.autopilot = !!on;
  return { ok: true };
}

// Keep a log line for every empty chair that could see it.
function note(state, item) {
  if (!state.absent) return;
  for (const [id, a] of Object.entries(state.absent)) {
    if (!a.away || !state.players[id] || state.players[id].socketId) continue;
    if (!canSee(item.vis, { role: 'player', charId: id })) continue;
    a.missed.push({ kind: item.kind, text: item.text, tone: item.tone, t: item.t });
    if (a.missed.length > MAX_MISSED) a.missed.shift();
  }
}

// A phone claimed the seat again. Returns the missed lines for its card, and ends autopilot.
function returned(state, id) {
  const a = state.absent?.[id];
  if (!a) return [];
  const lines = a.missed.splice(0);
  delete state.absent[id];
  return lines;
}

// Public view: DM sees everything; everyone else sees which chairs are empty and which are on autopilot.
function view(state, viewer) {
  const all = state.absent || {};
  if (viewer.role === 'dm') return all;
  return Object.fromEntries(Object.entries(all).map(([id, a]) => [id, { away: a.away, autopilot: a.autopilot }]));
}

module.exports = { MAX_MISSED, isAutopilot, away, setAutopilot, note, returned, view };
