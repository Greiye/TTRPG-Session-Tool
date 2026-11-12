// Live game state, the log, and the broadcast loop.
const hub = require('./hub');
const { roster, saveRoster, publicChar } = require('./roster');
const { CLASSES } = require('./rules/dnd5e');
const { BUILTIN_SFX, scanLibrary } = require('./media');
const { joinUrl } = require('./net');

const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
const EFFECTS = ['rain', 'snow', 'fog', 'embers', 'lightning', 'darkness', 'blood', 'magic'];

const lib = scanLibrary();
const state = {
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
};

let seq = 0;
const nextId = () => ++seq;
function log(kind, text, extra = {}) {
  state.log.push({ id: ++seq, t: Date.now(), kind, text, ...extra });
  if (state.log.length > 80) state.log.shift();
}

function publicState() {
  const { io } = hub;
  const players = Object.values(state.players).map((p) => ({ ...publicChar(p), online: !!p.socketId }));
  const cards = Object.values(roster).map((c) => ({ id: c.id, name: c.name, player: c.player, race: c.race, cls: c.cls, level: c.level, hue: c.hue, portrait: c.portrait, online: !!c.socketId }));
  const screens = [...io.sockets.sockets.values()].filter((x) => x.data.screen).length;
  const codms = [...io.sockets.sockets.values()].filter((x) => x.data.role === 'codm').length;
  return { ...state, players, roster: cards, screens, codms, emotions: EMOTIONS, effects: EFFECTS, classes: Object.keys(CLASSES), joinUrl: joinUrl() };
}
let pending = false;
function broadcast() {
  if (pending) return;
  pending = true;
  setImmediate(() => {
    pending = false;
    hub.io.emit('state', publicState());
    hub.io.to('dms').emit('dm:roster', Object.values(roster).map(({ socketId, ...c }) => ({ ...c, online: !!socketId })));
    saveRoster();
  });
}

module.exports = { state, log, nextId, publicState, broadcast, EMOTIONS, EFFECTS };
