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
const legends = require('./legends');
const houserules = require('./houserules');
const absent = require('./absent');
const recorder = require('./recorder'); // session recorder (test tool, off by default)
const storybook = require('./storybook'); // append-only session journal and the Keep star (/story)
const tableState = require('./table-state'); // Phase I table tools: defaults for their fields
const worldmap = require('./worldmap');
const living = require('./living');
const web = require('./web');
const dungeon = require('./dungeon');
const undo = require('./undo');

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
    poi: [], // points of interest: none until the DM adds them (Mike, Nov 16)
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
  // Uploads survive restarts (files on disk); `image` null means use the scene theme. Starts on the bundled sample.
  backdrop: { image: require('./media').defaultBackdrop(lib.backdrops), effects: [], library: lib.backdrops },
  // loops: built-in placeholder ambience (src/placeholder-sounds.js). mix: layers playing now, { id, url, name, volume }.
  audio: { library: lib.audio, loops: require('./placeholder-sounds').loopItems(), mix: [], music: null, playing: false, volume: 0.6, sfxVolume: 0.9, builtins: BUILTIN_SFX },
  log: [],
  rolls: [], // dice log (src/rolls.js)
  handouts: [], // handouts, spoils and dialogue votes (src/messages.js)
  clocks: [], // segment clocks (item 17), src/tracker.js
  relations: {}, // NPC id -> character id -> stance (item 19, DM only)
  moodMap: {}, // mode -> music track id (item 21)
  soundscape: require('./soundscape').fresh(), // mood wheel, environment, layers, favourites (src/soundscape.js)
  map: null, // { image, cols, rows, terrain } battle map (item 24, src/grid.js)
  worldMap: worldmap.example(), // starts on the example world (Mike, Nov 15); world map: places, votes, travel and flavour cards (Phase G, src/worldmap.js)
  tokens: {}, // id -> { x, y, z, light } on the map (light: none | torch | lantern | darkvision, src/vision.js)
  roll: null, // last creature randomizer result (item 26)
  plans: [], // imported session plans, DM only (src/plan.js)
  rndArt: {}, // table -> slot -> label -> creature art url (item 26 art, uploaded by the DM)
  checkLib: [], // DM-made check presets
  tv: require('./moments').defaults(), // TV moments (src/moments.js)
  story: require('./moments').storyDefault(), // in-world clock: lights the TV (src/moments.js)
  journal: [], // party journal: phone notes, newest first (src/journal.js)
  intro: { campaign: '', session: 1, lines: [] }, // session intro card text, kept between sessions (src/speech.js)
  introCard: null, // the intro card on the TV now: intro plus n (a new showing bumps n)
  timers: [], // condition countdowns and concentration (src/timers.js)
  quiz: null, // recap quiz: questions, phone answers and DM marks (src/quiz.js)
  suggestions: [], // { id, name, text, at, vis } from spectators, seen by DM and players (src/spectate.js)
  objectives: [], // secret player objectives { id, charId, name, title, text, revealed, vis } (src/objectives.js)
  pendingPlace: [], // creature ids added to the map that must be placed before anything else (phase 2 combat)
  shops: [], // NPC shops with stock and prices (item 27, src/shops.js)
  downtime: downtime.fresh(), // weekly downtime picks and results (src/downtime.js)
  dmControl: {}, // charId -> true while the DM plays that character (src/control.js); not saved
  camp: camp.fresh(), // camp: TV image, phone votes for short or long rest and downtime notes (src/camp.js)
  factions: [], // faction reputation, DM sees numbers, phones see tiers (src/factions.js)
  weather: { kind: 'none', intensity: 2 }, // shared weather: the TV (phase B) and the living world both read it (src/living.js)
  living: living.fresh(), // living world: clocks, town standing, rumours, weather, tension, canon, oracles (src/living.js)
  puzzle: null, // teamwork puzzle: clues split over phones, guesses, DM-confirmed solve (src/puzzle.js)
  town: require('./town').withStarter(), // town maps and the town visit in progress (PR V, src/town.js)
  dungeon: dungeon.fresh(), // exploration dungeon nodes: rooms on levels joined by ropes (src/dungeon.js)
  trail: [], // where the party has been: world places, dungeons and rooms (src/trail.js)
  web: web.fresh(), // NPC and faction relationship web, TV sees revealed parts (src/web.js)
  room: null, // join code, set by session.js
  houseRules: {}, // house rule id -> on (src/houserules.js); enforced by the tool
  absent: {}, // empty chairs: charId -> { away, autopilot, missed } (src/absent.js)
  ended: null, // { n, at, session } while the DM has ended the session: TV and phones show the end card (transient)
  lore: [], // Lore tab: locations, dungeons, NPCs, items, books and notes; phones see shared entries (src/lore.js)
  trophy: null, // { id, n } trophy story card on the TV (transient)
  narration: [], // { id, text } the DM's last 10 narrate posts, shown under the scene description
  shopPop: null, // { shopId, n, done: [charId] } shop pop-up on the TV and phones (transient, src/shops.js)
  legendsShow: null, // 'hall' | 'shelf' | null: legends card on the TV (transient)
  // lighting preset is kept on the scene (src/world.js)
  settings: { display: { text: 'md', palette: 'default', motion: 'auto', dice: 'on', log: 'hide', fx: 'on', numbers: 'dm', gestures: 'on', showLog: [], hideJoin: true, quiet: 1 }, host: null }, // table-wide (TV display, QR host)
  bulbsOn: false, // smart bulbs follow the lighting (item 10, src/bulbs.js); off by default, DM toggle only
  bulbsTargets: 0, // how many bulbs are configured (count only; addresses and keys stay on the server)
  templates: Object.fromEntries(Object.entries(require('./templates').TEMPLATES).map(([k, t]) => [k, t.name])),
};

// Durable campaign keys saved with the table (src/store.js); one list, each key once.
store.EXTRA.push('rolls', 'checkLib', 'handouts', 'clocks', 'relations', 'moodMap', 'map', 'tokens', 'roll', 'rndArt', 'suggestions', 'shops', 'quiz', 'plans', 'objectives', 'downtime', 'factions', 'journal', 'camp', 'pendingPlace', 'tv', 'story', 'narration', 'cues', 'nudges', 'balance', 'tension', 'foreshadow', 'framing', 'canon', 'montage', 'stageLayout', 'sessionNo', 'worldMap');
store.EXTRA.push('living', 'weather'); // phase K living world and the shared weather
store.EXTRA.push('houseRules', 'absent'); // phase J house rules and empty chairs
store.EXTRA.push('intro', 'timers'); // phase D intro card text and timers
store.EXTRA.push('dungeon', 'trail'); // exploration dungeon nodes and the party trail
store.EXTRA.push('puzzle', 'web'); // Phase F teamwork puzzle and relations web
store.EXTRA.push('lore'); // Lore tab (Mike, Nov 16)
store.EXTRA.push('shopSeed'); // Greer's Trinkets seeded once
store.EXTRA.push('town', 'townSeed'); // town maps and visits (PR V)
store.EXTRA.push('soundscape'); // soundscape for the DM and Music Co-DM
saves.backupOnStart();
require('./srd').seed();
let seq = 0;
seq = store.restore(state, roster, store.load());
if (!state.room) state.room = newRoomCode();
state.scene.secrets ??= [];
state.factions ??= [];
state.living = living.ensure(state.living);
state.weather ??= { kind: 'none', intensity: 2 };
require('./soundscape').ensure(state);
state.web ??= web.fresh();
state.dungeon ??= dungeon.fresh();
state.puzzle ??= null;
cast.ensure(state.social);
state.social.convo.ending = false; // the end timer does not survive a restart
state.camp ??= camp.fresh();
// The House rules section left the DM screen and phones (Mike, Nov 16), so no rule is enforced unseen: a save that
// had one on loads with them all off. dm:houserule still works for a later UI.
state.houseRules = {};
// Player choices left the DM's Social window (Mike, Nov 17): a save with choices up would leave them stuck on phones.
state.social.choices = [];
state.absent ??= {};
state.worldMap ??= worldmap.fresh();
state.worldMap.roads ??= []; // roads and fog came after Phase G: older saves have neither
state.worldMap.fog ??= false;
state.worldMap.openOnSession ??= true;
state.trail ??= [];
state.town = require('./town').ensure(state.town);
// Town visits (PR V) came after the example world: an older save's Millbrook gets the starter town once.
if (!state.townSeed) {
  const mb = state.worldMap.nodes.find((n) => n.id === 'w1' && n.name === 'Millbrook');
  if (mb && !Object.keys(state.town.maps).length) { mb.settlement = true; state.town.maps.w1 = require('./town').starter(); state.town.skipAt = 'w1'; }
  state.townSeed = 1;
}
state.lore = require('./lore').ensure(state.lore);
// Every table starts with Greer's Trinkets (Mike, Nov 15). Seeded once: removing it keeps it gone.
if (!state.shopSeed) { state.shops ??= []; if (!state.shops.some((x) => x.name === "Greer's Trinkets")) state.shops.unshift(require('./shops').greer('greer')); state.shopSeed = 1; }
// Placeholder weapons, armour, potions and gear (Mike, Nov 17), also seeded once into older saves.
if ((state.shopSeed || 0) < 2) { if (!state.shops.some((x) => x.id === 'outfitters') && state.shops.length < require('./shops').MAX_SHOPS) state.shops.push(require('./shops').outfitters('outfitters')); state.shopSeed = 2; }
state.combatPrep = null; // transient: the TV's combat prep filter (src/sockets/dm.js)
// Mike, Nov 15: logs and the join QR are off by default on every screen. Older saves switch over once (quiet: 1);
// after that the DM's choices stand. hideLog (a deny list) became showLog (an allow list).
{
  const d = (state.settings.display ||= {});
  if (!d.quiet) Object.assign(d, { log: 'hide', showLog: [], hideJoin: true, quiet: 1 });
  delete d.hideLog;
  d.showLog ??= [];
}
if (!state.trail.length && state.worldMap.here) require('./trail').add(state, 'world', state.worldMap.nodes.find((n) => n.id === state.worldMap.here)?.name); // the trail starts where the party stands
// The dungeon is a pop-up over a dungeon entrance on the world map (Mike, Nov 15). Older saves kept it shown
// anywhere: close it unless the party stands on an entrance.
if (state.dungeon.on && !worldmap.dungeonHere(state.worldMap)) state.dungeon.on = false;
if (state.town.on && require('./town').settlementHere(state.worldMap)?.id !== state.town.at) state.town.on = false; // the same for a town
net.setHost(state.settings.host);
const snap = () => store.snapshot(state, seq);

const nextId = () => ++seq;
function log(kind, text, extra = {}) {
  const entry = { id: ++seq, t: Date.now(), kind, text, ...extra };
  state.log.push(entry);
  if (state.log.length > 80) state.log.shift();
  absent.note(state, entry); // empty chairs keep what they missed (src/absent.js)
  recorder.logLine(entry); // session recorder; a no-op unless recording
  storybook.line(entry); // the whole session, on disk (state.log keeps 80)
}

// Full snapshot. Never sent as-is: stateFor() filters it per viewer (see visibility.js).
function fullState() {
  const { io } = hub;
  const players = Object.values(state.players).map((p) => ({ ...p, online: !!p.socketId, derived: derived(p) }));
  const cards = Object.values(roster).map((c) => ({ id: c.id, name: c.name, player: c.player, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait, online: !!c.socketId, dead: !!c.death }));
  const screens = [...io.sockets.sockets.values()].filter((x) => x.data.screen).length;
  const all = [...io.sockets.sockets.values()];
  const helpers = all.map((x) => x.data.role);
  const codms = all.filter((x) => x.data.coDm).length;
  const masters = { battle: helpers.filter((r) => r === 'battle').length, social: helpers.filter((r) => r === 'social').length, music: helpers.filter((r) => r === 'music').length };
  const spectators = [...io.sockets.sockets.values()].filter((x) => x.data.spectator).length;
  const bulbsTargets = require('./bulbs').targets().length;
  const legendsView = legends.view(); // hall of fame and trophy shelf: public, kept across campaigns
  return { ...state, lobbyStarter: state.lobby ? require('./lobby').starter() : null, bulbsTargets, legends: legendsView, houseRuleList: houserules.list(state), plans: plan.withDanger(state.plans, state), players, roster: cards, screens, codms, masters, spectators, emotions: EMOTIONS, effects: EFFECTS, classes: Object.keys(rules.get(state.system).classes), rules: rules.describe(state.system), systems: rules.list(), checks: require('./rolls').describe(), lib: library.versions(), joinUrl: net.joinUrl(state.room) };
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
    // Soundscape layers follow the shared weather however it changed (buttons, oracles, undo): src/soundscape.js.
    require('./soundscape').sync(state);
    storybook.watch(state); // mood changes and TV moments for the storybook
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
    undo.touch();
  });
}
// Save immediately on shutdown so the last change is never lost.
// Each file is saved on its own, so one failed write never skips the rest. SIGHUP is what Windows sends
// when the console window is closed with the X button.
function flushAll() {
  for (const f of [() => store.flush(snap), () => saveRoster.flush?.(), () => legends.flush(), () => require('./entities').flush(), () => library.flushAll()]) {
    try { f(); } catch (e) { console.warn(`  Save on exit failed: ${e.message}`); }
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.once(sig, () => { flushAll(); process.exit(0); });
require('./safety').install(process, { flush: flushAll }); // errors outside socket handlers log and save instead of ending the game

module.exports = { state, log, nextId, fullState, stateFor, broadcast, EMOTIONS, EFFECTS };

module.exports.flushAll = flushAll;
module.exports.sys = () => rules.get(state.system);
// Phase I table tools (src/table.js) load after this module's exports exist; fill in fields older saves lack.
require('./table-state').ensure(state);
// Replace the live campaign with a saved snapshot (save points). Phones keep the current room code.
module.exports.loadSnapshot = (saved) => {
  const room = state.room;
  seq = Math.max(seq, store.restore(state, roster, saved));
  state.room = room;
  cast.ensure(state.social);
};
module.exports.snapshot = snap;
// The DM page shows the Keep star filling in, for the DM's own taps and for automatic keeps (nat 20, chapter cards).
storybook.init({ onKept: (k) => hub.io?.to('dms').emit('story:kept', k) });

// DM undo (src/undo.js): the history holds the campaign and each character sheet. Going back restores both;
// phones stay connected (socket ids are kept) and characters made since then are left alone.
const sheets = () => Object.fromEntries(Object.values(roster).map(({ socketId, ...c }) => [c.id, c]));
undo.init({
  snapshot: snap,
  characters: sheets,
  changed: () => broadcast(),
  lastLine: () => { const e = state.log[state.log.length - 1]; return e ? { id: e.id, text: e.text } : null; },
  apply(step) {
    const campaign = Object.fromEntries(Object.entries(step.parts).map(([k, v]) => [k, JSON.parse(v)]));
    module.exports.loadSnapshot({ ...campaign, version: store.VERSION, seq: 0 });
    storybook.rewind(Math.max(0, ...state.log.map((l) => Number(l.id) || 0), ...(state.rolls || []).map((r) => Number(r.id) || 0))); // undone lines leave the story
    for (const [id, json] of Object.entries(step.chars)) {
      const saved = JSON.parse(json);
      const c = roster[id];
      if (!c) continue;
      for (const k of Object.keys(c)) if (k !== 'socketId' && !(k in saved)) delete c[k];
      Object.assign(c, saved);
    }
  },
});
