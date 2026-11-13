// Live game state, the log, and the broadcast loop.
const hub = require('./hub');
const { roster, saveRoster } = require('./roster');
const { viewerOf, viewerKey, viewState } = require('./visibility');
const rules = require('./rules');
const { BUILTIN_SFX, scanLibrary } = require('./media');
const net = require('./net');
const { newRoomCode } = require('./session');
const store = require('./store');
const saves = require('./saves');
const { derived } = require('./sheet');
const library = require('./library');
const perception = require('./perception');
const plan = require('./plan');
const downtime = require('./downtime');
const camp = require('./camp');
const cast = require('./cast');

const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
const EFFECTS = ['rain', 'snow', 'fog', 'embers', 'lightning', 'darkness', 'blood', 'magic'];

const lib = scanLibrary();
const state = {
  system: rules.DEFAULT, // rules adapter id, see src/rules
  mode: 'exploration', // exploration | combat | social
  scene: {
    title: 'The Sunken Crossroads',
    text: 'Rain hammers a mossy crossroads. A toppled shrine leans against an oak, and fresh cart tracks vanish into the fog toward the old mill.',
    theme: 'forest',
    poi: ['Toppled shrine', 'Cart tracks', 'Old mill in the fog'],
    secrets: [], // perception-gated items (src/perception.js)
    revealed: [], // fog of war: POI names the party has uncovered (item 7c)
  },
  players: Object.create(null), // character id -> roster entry, for characters at the table this session
  spotlight: null, // { id, kind: 'intro' | 'nat20' } shown briefly on the TV
  memorial: null, // { id, name, cause, epitaph, n, ... } memorial card on the TV after a death (src/legacy.js)
  bossCard: null, // { id, name, title, n } boss title card on the TV (item 7b); n changes per showing
  check: null, // { skill, dc, results: { token: {...} } }
  combat: { active: false, round: 0, turn: 0, order: [], enemies: [] },
  social: {
    npc: { name: 'Mirela the Innkeeper', emotion: 'neutral', hue: 28, faction: null }, // faction: its mood follows that faction's reputation
    line: { speaker: 'Mirela the Innkeeper', text: 'Welcome, travelers. Mind the mud on my floors.', emotion: 'neutral' },
    choices: [],
    caption: '',
  },
  // Uploads survive restarts (files on disk); `image` null means use the scene theme.
  backdrop: { image: null, effects: [], library: lib.backdrops },
  // loops: built-in placeholder ambience (src/placeholder-sounds.js). mix: layers playing now, { id, url, name, volume }.
  audio: { library: lib.audio, loops: require('./placeholder-sounds').loopItems(), mix: [], music: null, playing: false, volume: 0.6, sfxVolume: 0.9, builtins: BUILTIN_SFX },
  log: [],
  rolls: [], // dice log (src/rolls.js)
  handouts: [], // handouts, spoils and dialogue votes (src/messages.js)
  vote: null, // the active dialogue vote (item 12)
  clocks: [], // segment clocks (item 17), src/tracker.js
  relations: {}, // NPC id -> character id -> stance (item 19, DM only)
  moodMap: {}, // mode -> music track id (item 21)
  map: null, // { image, cols, rows, terrain } battle map (item 24, src/grid.js)
  tokens: {}, // id -> { x, y, z } on the map
  roll: null, // last creature randomizer result (item 26)
  plans: [], // imported session plans, DM only (src/plan.js)
  rndArt: {}, // table -> slot -> label -> creature art url (item 26 art, uploaded by the DM)
  checkLib: [], // DM-made check presets
  tv: require('./moments').defaults(), // TV moments (src/moments.js)
  story: require('./moments').storyDefault(), // in-world clock: lights the TV (src/moments.js)
  journal: [], // party journal: phone notes, newest first (src/journal.js)
  quiz: null, // recap quiz: questions, phone answers and DM marks (src/quiz.js)
  suggestions: [], // { id, name, text, at, vis } from spectators, seen by DM and players (src/spectate.js)
  objectives: [], // secret player objectives { id, charId, name, title, text, revealed, vis } (src/objectives.js)
  pendingPlace: [], // creature ids added to the map that must be placed before anything else (phase 2 combat)
  shops: [], // NPC shops with stock and prices (item 27, src/shops.js)
  downtime: downtime.fresh(), // weekly downtime picks and results (src/downtime.js)
  dmControl: {}, // charId -> true while the DM plays that character (src/control.js); not saved
  camp: camp.fresh(), // camp: TV image, phone votes for short or long rest and downtime notes (src/camp.js)
  factions: [], // faction reputation, DM sees numbers, phones see tiers (src/factions.js)
  room: null, // join code, set by session.js
  // lighting preset is kept on the scene (src/world.js)
  settings: { display: { text: 'md', palette: 'default', motion: 'auto' }, host: null }, // table-wide (TV display, QR host)
  bulbsOn: false, // smart bulbs follow the lighting (item 10, src/bulbs.js); off by default, DM toggle only
  bulbsTargets: 0, // how many bulbs are configured (count only; addresses and keys stay on the server)
  templates: Object.fromEntries(Object.entries(require('./templates').TEMPLATES).map(([k, t]) => [k, t.name])),
};

store.EXTRA.push('rolls', 'checkLib', 'handouts', 'vote', 'clocks', 'relations', 'moodMap', 'map', 'tokens', 'roll', 'rndArt', 'suggestions', 'shops', 'quiz', 'plans', 'objectives', 'downtime', 'factions', 'journal', 'camp', 'pendingPlace', 'tv', 'story');
saves.backupOnStart();
require('./srd').seed();
let seq = 0;
seq = store.restore(state, roster, store.load());
if (!state.room) state.room = newRoomCode();
state.scene.secrets ??= [];
state.factions ??= [];
cast.ensure(state.social);
state.camp ??= camp.fresh();
net.setHost(state.settings.host);
const snap = () => store.snapshot(state, seq);

const nextId = () => ++seq;
function log(kind, text, extra = {}) {
  state.log.push({ id: ++seq, t: Date.now(), kind, text, ...extra });
  if (state.log.length > 80) state.log.shift();
}

// Full snapshot. Never sent as-is: stateFor() filters it per viewer (see visibility.js).
function fullState() {
  const { io } = hub;
  const players = Object.values(state.players).map((p) => ({ ...p, online: !!p.socketId, derived: derived(p) }));
  const cards = Object.values(roster).map((c) => ({ id: c.id, name: c.name, player: c.player, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait, online: !!c.socketId, dead: !!c.death }));
  const screens = [...io.sockets.sockets.values()].filter((x) => x.data.screen).length;
  const codms = [...io.sockets.sockets.values()].filter((x) => x.data.role === 'codm').length;
  const spectators = [...io.sockets.sockets.values()].filter((x) => x.data.spectator).length;
  const bulbsTargets = require('./bulbs').targets().length;
  return { ...state, bulbsTargets, plans: plan.withDanger(state.plans, state), players, roster: cards, screens, codms, spectators, emotions: EMOTIONS, effects: EFFECTS, classes: Object.keys(rules.get(state.system).classes), rules: rules.describe(state.system), systems: rules.list(), checks: require('./rolls').describe(), lib: library.versions(), joinUrl: net.joinUrl(state.room) };
}
const stateFor = (socket, base = fullState()) => viewState(base, viewerOf(socket));

let pending = false;
function broadcast() {
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
    // Perception-gated items: tell each phone once, privately, when its character notices something.
    perception.scan(state, rules.get(state.system), (c, s) => {
      state.log.push({ id: ++seq, t: Date.now(), kind: 'notice', text: `${c.name} notices: ${s.text}`, tone: 'call', vis: { to: [c.id] } });
      if (c.socketId) hub.io.to(c.socketId).emit('notice', { id: s.id, text: s.text });
    });
    const base = fullState();
    const cache = new Map();
    for (const socket of hub.io.sockets.sockets.values()) {
      const v = viewerOf(socket);
      const k = viewerKey(v);
      if (!cache.has(k)) cache.set(k, viewState(base, v));
      socket.emit('state', cache.get(k));
    }
    hub.io.to('dms').emit('dm:roster', Object.values(roster).map(({ socketId, ...c }) => ({ ...c, online: !!socketId })));
    saveRoster();
    store.scheduleSave(snap);
  });
}
// Save immediately on shutdown so the last change is never lost.
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { store.flush(snap); saveRoster.flush?.(); require('./entities').flush(); library.flushAll(); process.exit(0); });

module.exports = { state, log, nextId, fullState, stateFor, broadcast, EMOTIONS, EFFECTS };

module.exports.sys = () => rules.get(state.system);
// Replace the live campaign with a saved snapshot (save points). Phones keep the current room code.
module.exports.loadSnapshot = (saved) => {
  const room = state.room;
  seq = Math.max(seq, store.restore(state, roster, saved));
  state.room = room;
  cast.ensure(state.social);
};
module.exports.snapshot = snap;
