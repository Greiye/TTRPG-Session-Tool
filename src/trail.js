// Party trail: a simple log of where the party has been (Mike, Nov 15). One entry each time the party
// reaches a place on the world map, enters or leaves a dungeon, or moves to a room inside one. Only places the
// party has actually stood on are logged, so the trail is safe for every screen.
const { str } = require('./util');

const MAX = 100;

// kind: 'world' (a place on the world map), 'enter' / 'leave' (a dungeon or town), 'room' (a dungeon room),
// 'town' (a place inside a town, PR V).
// A repeat of the newest entry is skipped. Returns the new entry, or null.
function add(state, kind, where, extra = {}) {
  const place = str(where, 60);
  if (!place) return null;
  state.trail ||= [];
  const last = state.trail[state.trail.length - 1];
  if (last && last.kind === kind && last.where === place) return null;
  const entry = { at: Date.now(), kind, where: place, day: state.story?.day || null, ...extra };
  state.trail.push(entry);
  if (state.trail.length > MAX) state.trail.splice(0, state.trail.length - MAX);
  return entry;
}

const ICON = { world: '🧭', enter: '⬇', leave: '⬆', room: '⚑', town: '🏘' };
// "Day 2 · ⬇ Entered The Sunken Crossroads" style text, shared by the tests and the pages.
function line(e) {
  const verb = { world: 'At', enter: 'Entered', leave: 'Left', room: 'In', town: 'Visited' }[e.kind] || 'At';
  return `${e.day ? `Day ${e.day} · ` : ''}${ICON[e.kind] || '•'} ${verb} ${e.where}`;
}

module.exports = { add, line, MAX };
