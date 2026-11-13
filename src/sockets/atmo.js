// Atmosphere events, shared by the DM and co-DM: backdrops, overlay effects, music, SFX.
const path = require('path');
const hub = require('../hub');
const { removeUrl } = require('../assets');
const { state, broadcast, EFFECTS } = require('../state');
const { BUILTIN_SFX, MIX_MAX } = require('../media');

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

module.exports = function atmoSockets(socket) {
  const atmo = (event, fn) => socket.on(event, (payload = {}) => {
    if (!socket.data.role) return;
    fn(payload || {});
    broadcast();
  });
  const trackOf = (id) => [...state.audio.loops, ...state.audio.library].find((t) => t.id === id) || null;
  // Soundboard layers: the DM and co-DM both run them. Each layer keeps its own volume.
  atmo('atmo:mix:add', ({ id }) => {
    const t = trackOf(id);
    if (!t || state.audio.mix.some((m) => m.id === id) || state.audio.mix.length >= MIX_MAX) return;
    state.audio.mix = [...state.audio.mix, { id: t.id, url: t.url, name: t.name, volume: 0.5 }];
  });
  atmo('atmo:mix:remove', ({ id }) => {
    state.audio.mix = state.audio.mix.filter((m) => m.id !== id);
  });
  atmo('atmo:mix:volume', ({ id, volume }) => {
    const m = state.audio.mix.find((x) => x.id === id);
    if (m) m.volume = clamp01(volume);
  });
  atmo('atmo:backdrop', ({ id }) => {
    state.backdrop.image = state.backdrop.library.find((b) => b.id === id) || null;
  });
  atmo('atmo:delete', ({ id }) => {
    const { backdrop: bd, audio } = state;
    const item = [...bd.library, ...audio.library].find((b) => b.id === id);
    if (!item) return;
    bd.library = bd.library.filter((b) => b !== item);
    audio.library = audio.library.filter((b) => b !== item);
    if (bd.image?.id === id) bd.image = null;
    if (audio.music?.id === id) Object.assign(audio, { music: null, playing: false });
    audio.mix = audio.mix.filter((m) => m.id !== id);
    removeUrl(`/uploads/${path.basename(id)}`);
  });
  atmo('atmo:effect', ({ effect, on }) => {
    if (!EFFECTS.includes(effect)) return;
    const fx = new Set(state.backdrop.effects);
    if (on ?? !fx.has(effect)) fx.add(effect); else fx.delete(effect);
    state.backdrop.effects = [...fx];
  });
  atmo('atmo:effects:clear', () => { state.backdrop.effects = []; });
  atmo('atmo:music', ({ id }) => {
    const track = state.audio.library.find((t) => t.id === id) || null;
    Object.assign(state.audio, { music: track, playing: !!track });
  });
  atmo('atmo:music:toggle', () => { if (state.audio.music) state.audio.playing = !state.audio.playing; });
  atmo('atmo:volume', ({ music, sfx }) => {
    const clamp = (v) => Math.max(0, Math.min(1, Number(v)));
    if (music !== undefined) state.audio.volume = clamp(music);
    if (sfx !== undefined) state.audio.sfxVolume = clamp(sfx);
  });
  // One-shot SFX are events, not state, so late joiners don't replay them.
  socket.on('atmo:sfx', ({ id } = {}) => {
    if (!socket.data.role) return;
    if (BUILTIN_SFX.includes(id)) hub.io.emit('sfx', { builtin: id });
    else {
      const t = trackOf(id);
      if (t) hub.io.emit('sfx', { url: t.url });
    }
  });
};
