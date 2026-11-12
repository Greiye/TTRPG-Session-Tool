// Live game state, the log, and the broadcast loop.
const hub = require('./hub');
const { roster, saveRoster } = require('./roster');
const { viewerOf, viewerKey, viewState } = require('./visibility');
const rules = require('./rules');
const { BUILTIN_SFX, scanLibrary } = require('./media');
const net = require('./net');
const { newRoomCode } = require('./session');
const store = require('./store');

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
  },
  players: {}, // character id -> roster entry, for characters at the table this session
  spotlight: null, // { id, kind: 'intro' | 'nat20' } shown briefly on the TV
  check: null, // { skill, dc, results: { token: {...} } }
  combat: { active: false, round: 0, turn: 0, order: [], enemies: [] },
  social: {
    npc: { name: 'Mirela the Innkeeper', emotion: 'neutral', hue: 28 },
    line: { speaker: 'npc', text: 'Welcome, travelers. Mind the mud on my floors.', emotion: 'neutral' },
    choices: [],
    caption: '',
  },
  // Uploads survive restarts (files on disk); `image` null means use the scene theme.
  backdrop: { image: null, effects: [], library: lib.backdrops },
  audio: { library: lib.audio, music: null, playing: false, volume: 0.6, sfxVolume: 0.9, builtins: BUILTIN_SFX },
  log: [],
  whispers: [], // { id, to: charId, text, at, vis } private DM -> player messages
  room: null, // join code, set by session.js
  settings: {}, // table-wide display settings (TV), see 0c
};

let seq = 0;
seq = store.restore(state, roster, store.load());
if (!state.room) state.room = newRoomCode();
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
  const players = Object.values(state.players).map((p) => ({ ...p, online: !!p.socketId }));
  const cards = Object.values(roster).map((c) => ({ id: c.id, name: c.name, player: c.player, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait, online: !!c.socketId }));
  const screens = [...io.sockets.sockets.values()].filter((x) => x.data.screen).length;
  const codms = [...io.sockets.sockets.values()].filter((x) => x.data.role === 'codm').length;
  return { ...state, players, roster: cards, screens, codms, emotions: EMOTIONS, effects: EFFECTS, classes: Object.keys(rules.get(state.system).classes), rules: rules.describe(state.system), systems: rules.list(), joinUrl: net.joinUrl(state.room) };
}
const stateFor = (socket, base = fullState()) => viewState(base, viewerOf(socket));

let pending = false;
function broadcast() {
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
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
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { store.flush(snap); saveRoster.flush?.(); process.exit(0); });

module.exports = { state, log, nextId, fullState, stateFor, broadcast, EMOTIONS, EFFECTS };

module.exports.sys = () => rules.get(state.system);
