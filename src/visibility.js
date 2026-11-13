// One rule for who sees what. Every state broadcast goes through viewState(), per viewer.
//
// Viewers: dm, codm (atmosphere helper), player (one character), screen (the TV), guest (unjoined phone).
// Item-level visibility, the `vis` field on any list item (log entries, whispers, handouts, objectives, spoils):
//   undefined | 'all'        everyone
//   'dm'                     DM only
//   { to: [charId...], screen: bool }  the DM, those characters, and the TV if screen is true
// Scene points of interest: covered names are replaced by null for everyone but the DM (sceneFor).
// Field-level visibility: FIELD_RULES lists fields only the DM may see, per entity kind.

const { PRIVATE: SHEET_PRIVATE } = require('./sheet');

const FIELD_RULES = {
  character: ['secret', 'hooks', 'socketId', 'token'],
  enemy: ['atk', 'dmg', 'notes', 'attacks', 'traits', 'ref', 'init'],
};

function viewerOf(socket) {
  const d = socket.data;
  if (d.takeover) return { role: 'player', charId: d.takeover }; // a DM tab playing a character sees that character's view
  if (d.role === 'dm') return { role: 'dm' };
  if (d.role === 'codm') return { role: 'codm' };
  if (d.charId) return { role: 'player', charId: d.charId };
  if (d.screen) return { role: 'screen' };
  if (d.spectator) return { role: 'spectator' };
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
// Fog of war (7c): only the DM gets the names of covered points of interest. Everyone else gets null in
// that slot, so the TV and phones can draw the right number of "???" tiles without holding the names.
function sceneFor(scene, viewer) {
  if (viewer.role === 'dm' || !Array.isArray(scene.poi)) return scene;
  const open = new Set(scene.revealed || []);
  return { ...scene, poi: scene.poi.map((p) => (open.has(p) ? p : null)) };
}
const viewerKey = (v) => `${v.role}:${v.charId || ''}`;

function canSee(vis, viewer) {
  if (viewer.role === 'dm' || vis === undefined || vis === null || vis === 'all') return true;
  if (vis === 'dm') return false;
  if (typeof vis === 'object') {
    if (viewer.role === 'player' && ((vis.to || []).includes(viewer.charId) || (vis.to || []).includes('*'))) return true; // '*' = every phone
    if ((viewer.role === 'screen' || viewer.role === 'codm' || viewer.role === 'spectator') && vis.screen) return true;
  }
  return false;
}

// A shop as a phone sees it: prices after its faction's multiplier, and the faction's standing.
const priced = ({ skipped, ...shop }, base) => {
  const F = require('./factions');
  const L = require('./living');
  const mult = L.priceMult(base, shop); // faction tier times town tier (src/living.js)
  const f = shop.faction && F.find(base, shop.faction);
  const blocked = L.canTrade(base, shop).error || null; // e.g. a hostile town, or shut for the night
  return { ...shop, standing: f ? F.tierOf(f.rep).label : null, blocked, items: shop.items.map((i) => ({ ...i, price: require('./shops').unitCp(i, mult) / 100 })) };
};

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
  out.objectives = filterList(base.objectives, viewer); // secret objectives: the owner's phone and the DM until revealed (src/objectives.js)
  out.suggestions = filterList(base.suggestions, viewer); // spectator suggestions: DM and players only (src/spectate.js)
  out.handouts = filterList(base.handouts, viewer).map((h) => (h.kind === 'spoil' ? spoilFor(h, viewer) : h.kind === 'phrase' ? phraseFor(h, viewer, base) : h));
  if (base.vote) out.vote = viewer.role === 'dm' ? { ...base.vote, counts: require('./messages').tally(base.vote) } : { ...base.vote, votes: undefined, counts: require('./messages').tally(base.vote), mine: viewer.role === 'player' ? base.vote.votes[viewer.charId] ?? null : null };
  // Fog of war (src/vision.js): every viewer gets the tiles the party can see. Phones and the TV never get
  // enemy tokens standing in the dark; the DM sees everything, with the fog drawn dimmer.
  out.mapVision = null;
  if (base.map?.fog) {
    const party = new Set((base.players || []).map((p) => p.id));
    const seen = require('./vision').visibleTiles(base.map, base.tokens, party);
    out.mapVision = [...seen];
    if (viewer.role !== 'dm') out.tokens = Object.fromEntries(Object.entries(base.tokens || {}).filter(([id, t]) => party.has(id) || seen.has(`${t.x},${t.y}`)));
  }
  out.downtime = require('./downtime').viewFor(base.downtime, viewer); // phones see their own pick and result
  out.camp = require('./camp').viewFor(base.camp, viewer); // camp votes: DM sees all, phones their own
  // Phase I table tools (src/table.js). The DM sees the controls and the numbers behind them; phones see
  // their own nudge and token; the TV sees the shared pieces (tension, canon, layout, montage once revealed).
  const T = require('./table');
  if (viewer.role === 'dm') {
    out.balance = T.balanceView();
    out.dueBonds = T.dueBonds();
  } else {
    for (const k of ['cues', 'nudges', 'balance', 'dueBonds']) delete out[k];
    out.myNudges = viewer.role === 'player' ? (base.nudges || []).filter((n) => n.charId === viewer.charId && n.status === 'sent') : [];
  }
  if (viewer.role !== 'dm') { delete out.framing; out.framingTokens = viewer.role === 'player' ? base.framing?.[viewer.charId] || 0 : 0; } // not `tokens`: that is the battle map
  out.foreshadow = T.recapFor(base.foreshadow, viewer); // hints: DM only; paid-off payoffs: everyone
  out.montage = T.montageView(base.montage, viewer);
  if (base.worldMap) out.worldMap = require('./worldmap').viewFor(base.worldMap, viewer, base.players.length); // Phase G: see src/worldmap.js
  // Party journal: phones and the DM only (src/journal.js).
  out.journal = ['dm', 'player'].includes(viewer.role) ? base.journal || [] : null;
  out.quiz = require('./quiz').viewFor(base.quiz, viewer); // recap quiz: DM sees all, phones see their own
  // TV moments (src/moments.js): the TV and the DM only. Planned echoes stay with the DM.
  if (viewer.role === 'dm') out.tv = base.tv;
  else if (['screen', 'codm'].includes(viewer.role)) out.tv = { ...base.tv, echoes: [] };
  else delete out.tv;
  out.story = base.story ? require('./moments').storyView(base.story) : null; // the in-world clock is shared with everyone
  out.puzzle = require('./puzzle').viewFor(base.puzzle, viewer); // teamwork puzzle: clues per phone, answer once solved (src/puzzle.js)
  out.web = require('./web').viewFor(base.web, viewer, base.factions || []); // relations web: TV sees revealed parts only (src/web.js)
  if (base.scene) out.scene = { ...sceneFor(base.scene, viewer), secrets: require('./perception').view(base.scene, viewer, require('./rules').get(base.system), base.players) };
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
  // Spectators watch the public table only: no secret-holding DM fields, no relations (above).
  if (viewer.role !== 'dm') { delete out.relations; delete out.plans; } // plans hold DM notes
  // Shops: phones see open shops only, without the DM's import notes.
  // Phones see the faction-adjusted prices and the standing, never the reputation number (src/factions.js).
  out.factions = (base.factions || []).map((f) => require('./factions').view(f, viewer.role === 'dm'));
  out.living = require('./living').view(base, viewer); // weather, tension, towns by tier, canon, rumours (DM only)
  out.shops = viewer.role === 'dm' ? base.shops : (base.shops || []).filter((s) => s.open).map((s) => priced(s, base));
  if (viewer.role === 'dm') {
    out.lan = require('./net').lanAddresses();
    out.entities = Object.values(require('./entities').entities); // world library (Arthuria), DM only for now
    out.saves = require('./saves').list();
  }
  return out;
}

module.exports = { FIELD_RULES, viewerOf, viewerKey, canSee, viewState, filterList };
