// One rule for who sees what. Every state broadcast goes through viewState(), per viewer.
//
// Viewers: dm, codm (atmosphere helper), player (one character), screen (the TV), guest (unjoined phone).
// Item-level visibility, the `vis` field on any list item (log entries, whispers, handouts, later spoils):
//   undefined | 'all'        everyone
//   'dm'                     DM only
//   { to: [charId...], screen: bool }  the DM, those characters, and the TV if screen is true
// Field-level visibility: FIELD_RULES lists fields only the DM may see, per entity kind.

const { PRIVATE: SHEET_PRIVATE } = require('./sheet');

const FIELD_RULES = {
  character: ['secret', 'hooks', 'socketId', 'token'],
  enemy: ['atk', 'dmg', 'notes', 'attacks', 'traits', 'ref', 'init'],
};

function viewerOf(socket) {
  const d = socket.data;
  if (d.role === 'dm') return { role: 'dm' };
  if (d.role === 'codm') return { role: 'codm' };
  if (d.charId) return { role: 'player', charId: d.charId };
  if (d.screen) return { role: 'screen' };
  return { role: 'guest' };
}
// A spoil shows each character only their own claim, plus the DM's full view.
function spoilFor(h, viewer) {
  if (viewer.role === 'dm') return h;
  const { claims, ...rest } = h;
  return { ...rest, mine: viewer.role === 'player' ? claims[viewer.charId] || null : null, claimCount: Object.keys(claims).length };
}
// A phrase shows its words only to a character who knows the language, or once the DM reveals it.
function phraseFor(h, viewer, base) {
  if (viewer.role === 'dm') return h;
  const c = viewer.role === 'player' ? base.players.find((p) => p.id === viewer.charId) : null;
  const knows = !!c && (c.languages || []).includes(h.lang);
  const { text, ...rest } = h;
  return { ...rest, text: knows || h.revealed ? text : undefined, glyphs: h.glyphs, knows };
}
const viewerKey = (v) => `${v.role}:${v.charId || ''}`;

function canSee(vis, viewer) {
  if (viewer.role === 'dm' || vis === undefined || vis === null || vis === 'all') return true;
  if (vis === 'dm') return false;
  if (typeof vis === 'object') {
    if (viewer.role === 'player' && ((vis.to || []).includes(viewer.charId) || (vis.to || []).includes('*'))) return true; // '*' = every phone
    if ((viewer.role === 'screen' || viewer.role === 'codm') && vis.screen) return true;
  }
  return false;
}

const strip = (obj, kind, viewer) => {
  let hidden = viewer.role === 'dm' ? ['socketId', 'token'] : FIELD_RULES[kind];
  // A player's own sheet is theirs to see; everyone else gets the public card.
  if (kind === 'character' && viewer.role !== 'dm' && viewer.charId !== obj.id) hidden = [...hidden, ...SHEET_PRIVATE];
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !hidden.includes(k)));
};
const filterList = (list, viewer) => (list || []).filter((x) => canSee(x.vis, viewer));

// base: the full state snapshot (already JSON-safe). Returns what this viewer may see.
function viewState(base, viewer) {
  const out = { ...base, viewer };
  out.players = base.players.map((p) => strip(p, 'character', viewer));
  out.combat = { ...base.combat, enemies: base.combat.enemies.map((e) => strip(e, 'enemy', viewer)) };
  out.log = filterList(base.log, viewer);
  out.rolls = filterList(base.rolls, viewer);
  out.whispers = filterList(base.whispers, viewer);
  out.handouts = filterList(base.handouts, viewer).map((h) => (h.kind === 'spoil' ? spoilFor(h, viewer) : h.kind === 'phrase' ? phraseFor(h, viewer, base) : h));
  if (base.vote) out.vote = viewer.role === 'dm' ? { ...base.vote, counts: require('./messages').tally(base.vote) } : { ...base.vote, votes: undefined, counts: require('./messages').tally(base.vote), mine: viewer.role === 'player' ? base.vote.votes[viewer.charId] ?? null : null };
  if (base.scene) out.scene = { ...base.scene, secrets: require('./perception').view(base.scene, viewer, require('./rules').get(base.system), base.players) };
  // The check on a phone or the TV: no DC when hidden, no outcome text, and only on the targeted phones.
  if (base.check) {
    const targeted = !base.check.targets || viewer.role !== 'player' || base.check.targets.includes(viewer.charId);
    if (!targeted) out.check = null;
    else {
      out.check = { ...base.check };
      if (viewer.role !== 'dm') { delete out.check.outcome; if (base.check.hideDc) delete out.check.dc; }
    }
  }
  // The room code is the join secret: only the DM and the TV (which displays it) get it.
  if (!['dm', 'screen', 'codm'].includes(viewer.role)) { delete out.room; delete out.joinUrl; }
  if (viewer.role !== 'dm') { delete out.relations; delete out.plans; } // plans hold DM notes
  if (viewer.role === 'dm') {
    out.lan = require('./net').lanAddresses();
    out.entities = Object.values(require('./entities').entities); // world library (Arthuria), DM only for now
    out.saves = require('./saves').list();
  }
  return out;
}

module.exports = { FIELD_RULES, viewerOf, viewerKey, canSee, viewState, filterList };
