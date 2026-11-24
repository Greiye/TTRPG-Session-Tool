// Soundscape events (src/soundscape.js). The DM runs every one. The Music Co-DM runs the ones src/roles.js lists
// for 'music' (mood, environment, layers, intensity, weather, favourites and scene links, undoing an automatic
// change), unless the DM has locked the soundscape. Master volume, output, the lock and combat automation are DM only.
const roles = require('../roles');
const ss = require('../soundscape');
const { state, broadcast } = require('../state');

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

module.exports = function soundSockets(socket) {
  const on = (event, fn) => socket.on(event, (payload = {}) => {
    const role = socket.data.role;
    if (!roles.can(role, event)) return;
    if (role !== 'dm' && state.soundscape.locked) return; // the DM's lock: helpers wait until it is lifted
    fn(payload || {}, role);
    broadcast();
  });

  on('sound:mood', ({ mood }, role) => ss.setMood(state, mood || null, role));
  on('sound:env', ({ env }, role) => ss.setEnv(state, env, role));
  on('sound:layer:add', ({ id }, role) => ss.addLayer(state, id, role));
  on('sound:layer:remove', ({ id }, role) => ss.removeLayer(state, id, role));
  on('sound:layer:volume', ({ id, volume }, role) => ss.layerVolume(state, id, volume, role));
  on('sound:density', ({ value }, role) => ss.setDensity(state, value, role));
  on('sound:stop', (_p, role) => ss.stop(state, role));
  on('sound:fav:save', ({ name }, role) => ss.saveFav(state, name, role));
  on('sound:fav:load', ({ id }, role) => ss.loadFav(state, id, role));
  on('sound:fav:delete', ({ id }, role) => ss.deleteFav(state, id, role));
  on('sound:fav:scene', ({ id, scene }, role) => ss.linkFav(state, id, scene === undefined ? state.scene.title : scene, role));
  on('sound:auto:undo', (_p, role) => ss.undoAuto(state, role));

  // The weather slider (DM and Music Co-DM, Mike Nov 17) writes the shared weather through the living world,
  // like the DM's weather buttons, so the TV, travel and sight follow it.
  on('sound:weather', ({ step }) => {
    const w = ss.WEATHER_STEPS[Math.round(Number(step))];
    if (!w) return;
    require('../living').setWeather(state, w.kind, w.intensity); // broadcast() re-syncs the weather layers
  });

  // DM only (not in the Music Co-DM's list).
  on('sound:master', ({ value }) => { state.audio.master = clamp01(value); });
  on('sound:output', ({ output }) => { if (['auto', 'tv', 'laptop'].includes(output)) state.audio.output = output; });
  on('sound:lock', ({ on: locked }) => { state.soundscape.locked = !!locked; });
  on('sound:autonight', ({ on: auto }) => { state.soundscape.autoNight = !!auto; });
  on('sound:autocombat', ({ on: auto }) => { state.soundscape.autoCombat = !!auto; });
};
