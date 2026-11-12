// World and content (Phase 7): NPC relations (19), phrases in unknown languages (20), mood music per
// mode (21), lighting presets (22) and quick-start templates (23).
const { state, log, nextId } = require('./state');
const { str } = require('./util');
const { TEMPLATES } = require('./templates');

const STANCES = ['friendly', 'neutral', 'wary', 'hostile'];
const LIGHTS = ['day', 'dusk', 'night', 'dawn', 'torchlight'];

// 19: how an NPC feels about each party member, and what the NPC knows. DM only.
function relate(npcId, charId, stance) {
  if (!STANCES.includes(stance) || !state.players[charId]) return;
  state.relations ??= {};
  state.relations[npcId] ??= {};
  state.relations[npcId][charId] = stance;
}

// 20: a phrase in a language the party may not know. Players see glyphs unless they know the tongue
// or the DM reveals it. The glyphs are derived from the text, so the same phrase looks the same each time.
const GLYPHS = '⌘⟁⟡⌬⏃⎍⍾⌖⍟⏁⎔⋈⌗⍜⎊';
function glyphs(text) {
  let h = 2166136261;
  return [...text].map((ch) => { if (ch === ' ') return ' '; h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return GLYPHS[h % GLYPHS.length] + (h % 3 ? '' : '·'); }).join('');
}
function phrase({ lang, text, to }) {
  const t = str(text, 200); const l = str(lang, 30);
  if (!t || !l) return null;
  return { id: 'ph' + nextId(), kind: 'phrase', lang: l, text: t, glyphs: glyphs(t), revealed: false, vis: { to: ['*'], screen: false }, at: Date.now(), target: to || null };
}

// 21: mood per mode. Changing the mode switches the background music to the mapped track.
function setMood(mode, trackId) {
  state.moodMap ??= {};
  if (trackId) state.moodMap[mode] = trackId; else delete state.moodMap[mode];
}
function applyMood(mode) {
  const id = state.moodMap?.[mode];
  if (!id) return;
  const t = state.audio.library.find((x) => x.id === id);
  if (t) { state.audio.music = t; state.audio.playing = true; }
}

// 22: lighting preset for the scene; the TV tints the stage.
const setLight = (light) => { if (LIGHTS.includes(light)) state.scene.light = light; };

// 23: quick-start templates. Each sets the scene, POIs, clocks and a few DM notes; the DM edits from there.
function applyTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) return null;
  const { effects, ...scene } = t.scene;
  Object.assign(state.scene, { ...scene, revealed: [] });
  state.scene.secrets = [];
  state.clocks = t.clocks.map((c) => ({ id: 'k' + nextId(), name: c.name, segments: c.segments, filled: 0, vis: 'all' }));
  state.backdrop.effects = effects || [];
  log('system', `Template: ${t.name}. ${t.notes}`, { tone: 'call' });
  return t;
}

module.exports = { STANCES, LIGHTS, TEMPLATES, relate, phrase, glyphs, setMood, applyMood, setLight, applyTemplate };
