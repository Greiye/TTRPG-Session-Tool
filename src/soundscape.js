// Soundscape (Mike, Nov 16): the DM, or the Music Co-DM, builds the table's sound as a scene instead of track by track.
//   mood         the mood wheel: picks the background music and cross-fades to it (public/audio.js decks)
//   environment  a base stack of ambience layers (forest, town, tavern, ...)
//   layers       the stack itself: add or remove any loop, each with its own volume
//   intensity    sparse to dense: one gain over every soundscape layer
//   weather      sun to storm: writes the one shared weather (state.weather, src/living.js) and adds rain/storm layers
//   favourites   save the whole scene and recall it in one tap
//   auto         combat start shifts the mood to Epic and combat's end shifts it back; each shift has a one-tap undo
// It drives the existing audio state (state.audio.mix and state.audio.music), so the TV plays it through the same
// soundboard and music decks. Its mix entries carry ss: true, so manual soundboard layers still play beside them.
// Every sound here is a PLACEHOLDER (src/placeholder-sounds.js) until real files are uploaded.
const { MOOD_IDS, moodItems } = require('./placeholder-sounds');

const MOODS = MOOD_IDS; // calm, happy, funny, epic, sad, creepy, tense, mystic, magical
const ENVS = {
  forest: { name: 'Forest', icon: '🌲', layers: ['loop-forest', 'loop-birds', 'loop-creek'] },
  town: { name: 'Town', icon: '🏘', layers: ['loop-crowd', 'loop-birds'] },
  tavern: { name: 'Tavern', icon: '🍺', layers: ['loop-tavern', 'loop-fire'] },
  dungeon: { name: 'Dungeon', icon: '🗝', layers: ['loop-dungeon', 'loop-drips'] },
  cave: { name: 'Cave', icon: '🪨', layers: ['loop-drips', 'loop-forest'] },
  coast: { name: 'Coast', icon: '🌊', layers: ['loop-waves', 'loop-forest'] },
  camp: { name: 'Camp', icon: '🏕', layers: ['loop-fire', 'loop-night'] },
};
// The weather slider, sun to storm. Each step is one shared weather value.
const WEATHER_STEPS = [
  { label: 'Clear', kind: 'none', intensity: 2 },
  { label: 'Light rain', kind: 'rain', intensity: 1 },
  { label: 'Rain', kind: 'rain', intensity: 2 },
  { label: 'Heavy rain', kind: 'rain', intensity: 3 },
  { label: 'Storm', kind: 'storm', intensity: 3 },
];
const LAYER_MAX = 6;
const FAV_MAX = 12;
const COMBAT_MOOD = 'epic';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const fresh = () => ({ on: false, env: null, mood: null, density: 0.6, layers: [], favs: [], autoCombat: true, auto: null, locked: false, by: null });

function ensure(state) {
  const s = state.soundscape = { ...fresh(), ...(state.soundscape || {}) };
  s.layers = (s.layers || []).filter((l) => l && typeof l.id === 'string').slice(0, LAYER_MAX);
  s.favs = (s.favs || []).slice(0, FAV_MAX);
  state.audio.moods = moodItems();
  state.audio.master ??= 1;
  state.audio.output ??= 'auto';
  return s;
}

const tracks = (state) => [...(state.audio.loops || []), ...(state.audio.library || [])];
const trackOf = (state, id) => tracks(state).find((t) => t.id === id) || null;

// Which step of the slider the shared weather is on (snow and fog have no step: -1).
function weatherStep(w = {}) {
  if (!w.kind || w.kind === 'none') return 0;
  if (w.kind === 'storm') return 4;
  if (w.kind === 'rain') return Math.max(1, Math.min(3, w.intensity || 2));
  return -1;
}
// Layers the weather adds on top of the scene.
function weatherLayers(w = {}) {
  const step = weatherStep(w);
  if (step <= 0) return [];
  if (step === 4) return [{ id: 'loop-rain', volume: 0.8 }, { id: 'loop-storm', volume: 0.6 }];
  return [{ id: 'loop-rain', volume: 0.2 + step * 0.2 }];
}

// Rewrite the soundscape's own entries in state.audio.mix. Manual soundboard layers are left alone.
function sync(state) {
  const s = state.soundscape;
  const manual = state.audio.mix.filter((m) => !m.ss);
  if (!s.on) { state.audio.mix = manual; return; }
  const gain = 0.3 + s.density * 0.9; // sparse to dense
  const taken = new Set(manual.map((m) => m.id));
  const own = [];
  for (const l of [...s.layers, ...weatherLayers(state.weather)]) {
    const t = trackOf(state, l.id);
    if (!t || taken.has(t.id)) continue;
    taken.add(t.id);
    own.push({ id: t.id, url: t.url, name: t.name, volume: +clamp01(l.volume * gain).toFixed(2), ss: true });
  }
  state.audio.mix = [...manual, ...own];
}

const by = (role) => (role === 'music' ? 'Music Co-DM' : 'DM');

function setMood(state, mood, role, { auto } = {}) {
  const s = state.soundscape;
  if (mood !== null && !MOODS.includes(mood)) return false;
  s.mood = mood;
  if (!auto) { s.auto = null; s.by = by(role); }
  const t = mood && state.audio.moods.find((x) => x.mood === mood);
  if (t) { s.on = true; Object.assign(state.audio, { music: t, playing: true }); } else if (state.audio.music?.mood) Object.assign(state.audio, { music: null, playing: false });
  sync(state);
  return true;
}

function setEnv(state, env, role) {
  const e = ENVS[env];
  if (!e) return false;
  const s = state.soundscape;
  Object.assign(s, { on: true, env, by: by(role), layers: e.layers.map((id, i) => ({ id, volume: i === 0 ? 0.6 : 0.4 })) });
  sync(state);
  return true;
}

function addLayer(state, id, role) {
  const s = state.soundscape;
  if (!trackOf(state, id) || s.layers.some((l) => l.id === id) || s.layers.length >= LAYER_MAX) return false;
  s.layers = [...s.layers, { id, volume: 0.5 }];
  Object.assign(s, { on: true, by: by(role) });
  sync(state);
  return true;
}
function removeLayer(state, id, role) {
  const s = state.soundscape;
  if (!s.layers.some((l) => l.id === id)) return false;
  s.layers = s.layers.filter((l) => l.id !== id);
  s.by = by(role);
  sync(state);
  return true;
}
function layerVolume(state, id, volume, role) {
  const l = state.soundscape.layers.find((x) => x.id === id);
  if (!l) return false;
  l.volume = clamp01(volume);
  state.soundscape.by = by(role);
  sync(state);
  return true;
}
function setDensity(state, v, role) {
  state.soundscape.density = clamp01(v);
  state.soundscape.by = by(role);
  sync(state);
}

// Stop the soundscape: its layers fade out and its mood music stops. Manual soundboard layers keep playing.
function stop(state, role) {
  Object.assign(state.soundscape, { on: false, auto: null, by: by(role) });
  if (state.audio.music?.mood) Object.assign(state.audio, { music: null, playing: false });
  sync(state);
}

// Favourites: the whole scene minus the weather (weather is the world's, not the soundscape's).
function saveFav(state, name, role) {
  const s = state.soundscape;
  if (s.favs.length >= FAV_MAX) return null;
  const label = String(name || '').trim().slice(0, 40) || [ENVS[s.env]?.name, s.mood].filter(Boolean).join(', ') || 'Soundscape';
  const fav = { id: `fav${Date.now().toString(36)}${s.favs.length}`, name: label, env: s.env, mood: s.mood, density: s.density, layers: s.layers.map(({ id, volume }) => ({ id, volume })) };
  s.favs = [...s.favs, fav];
  s.by = by(role);
  return fav;
}
function loadFav(state, id, role) {
  const s = state.soundscape;
  const f = s.favs.find((x) => x.id === id);
  if (!f) return false;
  Object.assign(s, { on: true, env: f.env, density: f.density, layers: f.layers.filter((l) => trackOf(state, l.id)).map((l) => ({ ...l })) });
  setMood(state, f.mood, role); // also syncs and records who did it
  return true;
}
function deleteFav(state, id, role) {
  const s = state.soundscape;
  const n = s.favs.length;
  s.favs = s.favs.filter((x) => x.id !== id);
  if (s.favs.length !== n) s.by = by(role);
}

// Automation: the mode changed (src/world.js applyMood). Combat shifts a playing soundscape to Epic; leaving
// combat shifts it back. Skipped when the DM switched it off, or mapped a track to the mode (moodMap wins).
function onMode(state, mode) {
  const s = state.soundscape;
  if (!s?.on || !s.autoCombat || state.moodMap?.[mode]) return;
  if (mode === 'combat' && s.mood !== COMBAT_MOOD && s.auto?.reason !== 'Combat started') {
    s.auto = { from: s.mood, to: COMBAT_MOOD, reason: 'Combat started', at: Date.now() };
    setMood(state, COMBAT_MOOD, 'dm', { auto: true });
  } else if (mode !== 'combat' && s.auto?.reason === 'Combat started' && s.mood === s.auto.to) {
    const back = s.auto.from;
    s.auto = { from: s.mood, to: back, reason: 'Combat ended', at: Date.now() };
    setMood(state, back, 'dm', { auto: true });
  }
}
// One-tap override: put the mood back to what it was before the automatic shift.
function undoAuto(state, role) {
  const a = state.soundscape.auto;
  if (!a) return false;
  setMood(state, a.from, role); // a hand-picked mood clears the auto note
  return true;
}

module.exports = {
  MOODS, ENVS, WEATHER_STEPS, LAYER_MAX, FAV_MAX, COMBAT_MOOD, fresh, ensure, sync, weatherStep, weatherLayers,
  setMood, setEnv, addLayer, removeLayer, layerVolume, setDensity, stop, saveFav, loadFav, deleteFav, onMode, undoAuto,
};
