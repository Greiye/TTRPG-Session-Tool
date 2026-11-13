// Campaign persistence: the live table state is saved to data/campaign.json after every change
// (debounced, atomic rename) and restored on startup. Characters stay in data/characters.json.
// JSON over SQLite: the data is small, and a pure-JS store keeps one-click packaging (item 29) simple.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'campaign.json');
const VERSION = 1;
// Later features register their own durable state keys here (clocks, map, handouts...).
const EXTRA = [];

function writeJson(file, data) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(file + '.tmp', file);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') {
      // Keep a corrupt file for inspection instead of silently overwriting it.
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
      console.warn(`  Could not read ${path.basename(file)} (${e.message}); starting fresh. A copy was kept.`);
    }
    return null;
  }
}

// Only durable fields; transient ones (spotlight, caption, connections) are rebuilt at runtime.
function snapshot(state, seq) {
  return {
    version: VERSION,
    savedAt: new Date().toISOString(),
    seq,
    system: state.system,
    mode: state.mode,
    room: state.room,
    scene: state.scene,
    party: Object.keys(state.players),
    check: state.check,
    combat: state.combat,
    social: { ...state.social, caption: '' },
    backdrop: { image: state.backdrop.image?.id || null, effects: state.backdrop.effects },
    audio: { music: state.audio.music?.id || null, playing: state.audio.playing, volume: state.audio.volume, sfxVolume: state.audio.sfxVolume },
    settings: state.settings,
    log: state.log,
    ...Object.fromEntries(EXTRA.map((k) => [k, state[k]])),
  };
}

// Apply a saved snapshot onto the live state. Returns the saved id counter.
function restore(state, roster, saved) {
  if (!saved || saved.version !== VERSION) return 0;
  const pick = (k) => { if (saved[k] !== undefined) state[k] = saved[k]; };
  ['system', 'mode', 'room', 'scene', 'check', 'combat', 'social', 'log', ...EXTRA].forEach(pick);
  if (saved.settings) Object.assign(state.settings, saved.settings);
  state.players = Object.create(null);
  for (const id of saved.party || []) if (roster[id]) state.players[id] = roster[id];
  state.combat.order = (state.combat.order || []).filter((o) => state.players[o.id] || state.combat.enemies.some((e) => e.id === o.id));
  const bd = saved.backdrop || {};
  state.backdrop.image = state.backdrop.library.find((b) => b.id === bd.image) || null;
  state.backdrop.effects = bd.effects || [];
  const au = saved.audio || {};
  state.audio.music = state.audio.library.find((t) => t.id === au.music) || null;
  Object.assign(state.audio, { playing: !!(state.audio.music && au.playing), volume: au.volume ?? state.audio.volume, sfxVolume: au.sfxVolume ?? state.audio.sfxVolume });
  return saved.seq || 0;
}

// A save from another version is never silently overwritten: keep a copy first, then start fresh.
function load() {
  const saved = readJson(FILE);
  if (saved && saved.version !== VERSION) {
    const copy = `${FILE}.v${saved.version}-${Date.now()}.bak`;
    fs.copyFileSync(FILE, copy);
    console.warn(`  campaign.json is version ${saved.version}, expected ${VERSION}. Kept a copy at ${path.basename(copy)}; starting fresh.`);
  }
  return saved;
}

let timer = null;
function scheduleSave(getSnapshot) {
  clearTimeout(timer);
  timer = setTimeout(() => writeJson(FILE, getSnapshot()), 300);
}
function flush(getSnapshot) {
  clearTimeout(timer);
  writeJson(FILE, getSnapshot());
}

module.exports = { EXTRA, FILE, VERSION, snapshot, restore, load, scheduleSave, flush, writeJson, readJson };
