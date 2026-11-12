// One rule for who sees what. Every state broadcast goes through viewState(), per viewer.
//
// Viewers: dm, codm (atmosphere helper), player (one character), screen (the TV), guest (unjoined phone).
// Item-level visibility, the `vis` field on any list item (log entries, whispers, handouts, later spoils):
//   undefined | 'all'        everyone
//   'dm'                     DM only
//   { to: [charId...], screen: bool }  the DM, those characters, and the TV if screen is true
// Field-level visibility: FIELD_RULES lists fields only the DM may see, per entity kind.

const FIELD_RULES = {
  character: ['secret', 'hooks', 'socketId', 'token'],
  enemy: ['atk', 'dmg', 'notes'],
};

function viewerOf(socket) {
  const d = socket.data;
  if (d.role === 'dm') return { role: 'dm' };
  if (d.role === 'codm') return { role: 'codm' };
  if (d.charId) return { role: 'player', charId: d.charId };
  if (d.screen) return { role: 'screen' };
  return { role: 'guest' };
}
const viewerKey = (v) => `${v.role}:${v.charId || ''}`;

function canSee(vis, viewer) {
  if (viewer.role === 'dm' || vis === undefined || vis === null || vis === 'all') return true;
  if (vis === 'dm') return false;
  if (typeof vis === 'object') {
    if (viewer.role === 'player' && (vis.to || []).includes(viewer.charId)) return true;
    if ((viewer.role === 'screen' || viewer.role === 'codm') && vis.screen) return true;
  }
  return false;
}

const strip = (obj, kind, viewer) => {
  const hidden = viewer.role === 'dm' ? ['socketId', 'token'] : FIELD_RULES[kind];
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !hidden.includes(k)));
};
const filterList = (list, viewer) => (list || []).filter((x) => canSee(x.vis, viewer));

// base: the full state snapshot (already JSON-safe). Returns what this viewer may see.
function viewState(base, viewer) {
  const out = { ...base, viewer };
  out.players = base.players.map((p) => strip(p, 'character', viewer));
  out.combat = { ...base.combat, enemies: base.combat.enemies.map((e) => strip(e, 'enemy', viewer)) };
  out.log = filterList(base.log, viewer);
  out.whispers = filterList(base.whispers, viewer);
  // The room code is the join secret: only the DM and the TV (which displays it) get it.
  if (!['dm', 'screen', 'codm'].includes(viewer.role)) { delete out.room; delete out.joinUrl; }
  if (viewer.role === 'dm') {
    out.lan = require('./net').lanAddresses();
    out.entities = Object.values(require('./entities').entities); // world library (Arthuria), DM only for now
  }
  return out;
}

module.exports = { FIELD_RULES, viewerOf, viewerKey, canSee, viewState, filterList };
