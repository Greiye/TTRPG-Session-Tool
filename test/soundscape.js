// Soundscape (Mike, Nov 16): mood wheel, environments, layers, intensity, weather, favourites, combat automation
// with a one-tap override, master volume and output, and the Music Co-DM role.
const { harness, wait } = require('./helpers');
const roles = require('../src/roles');
const { MOOD_IDS, MOOD_SECS, wavFor, RATE, loopItems } = require('../src/placeholder-sounds');
const ss = require('../src/soundscape');
const h = harness('soundscape');
const { ok, until, call } = h;

// Pure rules
{
  ok(MOOD_IDS.join() === 'calm,happy,funny,epic,sad,creepy,tense,mystic,magical', 'nine moods on the wheel');
  for (const m of MOOD_IDS) {
    const b = wavFor(`mood-${m}`);
    ok(b && b.toString('ascii', 0, 4) === 'RIFF' && b.length === 44 + MOOD_SECS * RATE * 2, `${m} mood music is an ${MOOD_SECS} second WAV`);
  }
  const ids = new Set(loopItems().map((t) => t.id));
  ok(Object.values(ss.ENVS).every((e) => e.layers.every((id) => ids.has(id))), 'every environment layer is a built-in loop');
  ok(loopItems().every((t) => t.placeholder && /placeholder/i.test(t.name)), 'built-in loops are marked placeholder');
  ok(ss.weatherStep({ kind: 'none' }) === 0 && ss.weatherStep({ kind: 'rain', intensity: 3 }) === 3 && ss.weatherStep({ kind: 'storm', intensity: 1 }) === 4 && ss.weatherStep({ kind: 'fog' }) === -1, 'weather maps onto the sun to storm slider');
  ok(roles.can('music', 'sound:mood') && roles.can('music', 'sound:env') && roles.can('music', 'sound:layer:add') && roles.can('music', 'sound:fav:load'), 'the Music Co-DM runs mood, environment, layers and favourites');
  ok(!roles.can('music', 'sound:master') && !roles.can('music', 'sound:output') && !roles.can('music', 'sound:lock') && !roles.can('music', 'sound:autocombat'), 'the Music Co-DM cannot touch master volume, output, the lock or the combat shift');
  ok(roles.can('music', 'sound:weather') && roles.can('music', 'sound:fav:scene'), 'the Music Co-DM moves the weather and links favourites to scenes (Mike, Nov 17)');
  ok(!roles.can('music', 'dm:say') && !roles.can('music', 'dm:enemy:add') && !roles.can('social', 'sound:mood'), 'roles stay in their lanes');
  ok(roles.canUpload('music', 'audio') && !roles.canUpload('music', 'backdrop'), 'the Music Co-DM may upload audio only');
}

(async () => {
  const srv = await h.boot({ MUSIC_KEY: 'musickey' });
  const dm = await h.dm();
  const music = await h.client();
  const phone = await h.player(await h.room(), 'Thorn', 'Fighter');
  ok((await call(music, 'dm:auth', { key: 'musickey' })).role === 'music', 'the Music Co-DM key is accepted');
  await until(() => dm.last?.masters?.music === 1);
  ok(dm.last.masters.music === 1, 'the DM sees the Music Co-DM connected');
  const S = () => dm.last.soundscape;
  const A = () => dm.last.audio;
  ok(S().on === false && A().master === 1 && A().output === 'auto' && A().moods.length === 9, 'a new table starts with the soundscape off, full master, auto output');

  // Environment loads a base stack of layers into the soundboard mix.
  music.emit('sound:env', { env: 'forest' });
  await until(() => S().env === 'forest');
  ok(S().on && S().layers.map((l) => l.id).join() === 'loop-forest,loop-birds,loop-creek', 'Forest loads wind, birds and creek');
  ok(A().mix.filter((m) => m.ss).length === 3, 'its layers play through the soundboard mix');
  ok(S().by === 'Music Co-DM', 'the soundscape records who changed it');

  // Mood cross-fades the music (the TV's music decks).
  music.emit('sound:mood', { mood: 'calm' });
  await until(() => A().music?.id === 'mood-calm');
  ok(A().music?.id === 'mood-calm' && A().playing, 'Calm starts the calm mood music');
  dm.emit('sound:mood', { mood: 'nonsense' });
  await wait(100);
  ok(A().music?.id === 'mood-calm', 'an unknown mood is ignored');

  // Layers: add, change volume, remove; a manual soundboard layer is left alone.
  dm.emit('atmo:mix:add', { id: 'loop-tavern' });
  music.emit('sound:layer:add', { id: 'loop-fire' });
  await until(() => S().layers.length === 4);
  ok(A().mix.some((m) => m.id === 'loop-tavern' && !m.ss) && A().mix.some((m) => m.id === 'loop-fire' && m.ss), 'soundscape layers sit beside manual soundboard layers');
  music.emit('sound:layer:volume', { id: 'loop-fire', volume: 9 });
  await until(() => S().layers.find((l) => l.id === 'loop-fire').volume === 1);
  ok(true, 'layer volume is clamped');
  music.emit('sound:density', { value: 0 });
  await until(() => S().density === 0);
  const fire = () => A().mix.find((m) => m.id === 'loop-fire').volume;
  ok(Math.abs(fire() - 0.3) < 0.01, 'sparse intensity turns every layer down');
  music.emit('sound:density', { value: 1 });
  await until(() => fire() === 1);
  ok(true, 'dense intensity turns them up (never past full)');
  dm.emit('atmo:mix:remove', { id: 'loop-birds' });
  await until(() => !S().layers.some((l) => l.id === 'loop-birds'));
  ok(!A().mix.some((m) => m.id === 'loop-birds'), 'stopping a soundscape layer on the soundboard removes it from the soundscape too');
  music.emit('sound:layer:remove', { id: 'loop-creek' });
  await until(() => !A().mix.some((m) => m.id === 'loop-creek'));
  ok(true, 'the Music Co-DM removes a layer');

  // Weather: it writes the shared weather and adds rain layers.
  music.emit('sound:weather', { step: 4 });
  await until(() => dm.last.weather.kind === 'storm');
  ok(dm.last.weather.kind === 'storm', 'the Music Co-DM moves the weather to Storm');
  ok(A().mix.some((m) => m.id === 'loop-rain' && m.ss) && A().mix.some((m) => m.id === 'loop-storm' && m.ss), 'Storm adds rain and storm layers');
  dm.emit('dm:weather', { kind: 'clear' });
  await until(() => !A().mix.some((m) => m.id === 'loop-storm'));
  ok(!A().mix.some((m) => m.id === 'loop-rain'), 'clearing the weather from the weather buttons takes them away again');

  // Favourites
  music.emit('sound:fav:save', { name: 'Campfire night' });
  await until(() => S().favs.length === 1);
  const fav = S().favs[0];
  ok(fav.name === 'Campfire night' && fav.mood === 'calm' && fav.env === 'forest', 'a favourite keeps the scene');
  dm.emit('sound:env', { env: 'dungeon' });
  dm.emit('sound:mood', { mood: 'creepy' });
  await until(() => A().music?.id === 'mood-creepy');
  music.emit('sound:fav:load', { id: fav.id });
  await until(() => A().music?.id === 'mood-calm');
  ok(S().env === 'forest' && S().layers.some((l) => l.id === 'loop-fire'), 'one tap brings the favourite back');

  // Scene link: a favourite linked to a scene starts when the DM moves to that scene, with a one-tap undo.
  dm.emit('sound:mood', { mood: 'happy' });
  await until(() => S().mood === 'happy');
  dm.emit('dm:scene', { title: 'The Old Mill' });
  await until(() => dm.last.scene.title === 'The Old Mill');
  music.emit('sound:fav:scene', { id: fav.id }); // links to the scene now showing
  await until(() => S().favs[0].scene === 'The Old Mill');
  ok(true, 'a favourite links to the current scene');
  dm.emit('dm:scene', { title: 'Market Square' });
  await wait(150);
  ok(S().mood === 'happy', 'another scene leaves the soundscape alone');
  dm.emit('sound:env', { env: 'town' });
  await until(() => S().env === 'town');
  dm.emit('dm:scene', { title: 'the old mill' });
  await until(() => S().mood === 'calm' && S().env === 'forest');
  ok(S().auto?.reason === 'Scene: the old mill', 'going back to the scene starts its favourite and says why');
  dm.emit('sound:auto:undo');
  await until(() => S().env === 'town' && S().mood === 'happy');
  ok(!S().auto, 'one tap puts back what was playing');
  music.emit('sound:fav:scene', { id: fav.id, scene: '' });
  await until(() => !S().favs[0].scene);
  ok(true, 'a favourite can be unlinked');
  dm.emit('sound:fav:load', { id: fav.id });
  await until(() => S().mood === 'calm');

  // Automation: combat shifts the mood to Epic, with a one-tap override, and shifts it back afterwards.
  dm.emit('dm:mode', { mode: 'combat' });
  await until(() => A().music?.id === 'mood-epic');
  ok(S().auto?.reason === 'Combat started' && S().auto.from === 'calm', 'combat shifts the mood to Epic and says why');
  dm.emit('sound:auto:undo');
  await until(() => A().music?.id === 'mood-calm');
  ok(!S().auto && S().mood === 'calm', 'one tap keeps the old mood');
  dm.emit('dm:mode', { mode: 'exploration' });
  await wait(150);
  ok(S().mood === 'calm' && !S().auto, 'leaving combat after an override leaves the mood alone');
  dm.emit('dm:mode', { mode: 'combat' });
  await until(() => S().mood === 'epic');
  dm.emit('dm:mode', { mode: 'exploration' });
  await until(() => S().mood === 'calm');
  ok(S().auto?.reason === 'Combat ended', 'leaving combat shifts the mood back');
  dm.emit('sound:autocombat', { on: false });
  dm.emit('dm:mode', { mode: 'combat' });
  await wait(150);
  ok(S().mood === 'calm', 'the DM can switch the combat shift off');
  music.emit('sound:autocombat', { on: true });
  await wait(100);
  ok(S().autoCombat === false, 'the Music Co-DM cannot switch it back on');
  dm.emit('dm:mode', { mode: 'exploration' });

  // DM output controls and the lock.
  music.emit('sound:master', { value: 0.2 });
  music.emit('sound:output', { output: 'laptop' });
  await wait(150);
  ok(A().master === 1 && A().output === 'auto', 'the Music Co-DM cannot change master volume or output');
  dm.emit('sound:master', { value: 0.4 });
  dm.emit('sound:output', { output: 'tv' });
  await until(() => A().output === 'tv' && A().master === 0.4);
  ok(true, 'the DM sets master volume and output');
  dm.emit('sound:lock', { on: true });
  await until(() => S().locked);
  music.emit('sound:mood', { mood: 'sad' });
  await wait(150);
  ok(S().mood === 'calm', 'a locked soundscape ignores the Music Co-DM');
  dm.emit('sound:mood', { mood: 'sad' });
  await until(() => S().mood === 'sad');
  ok(S().by === 'DM', 'the DM still changes it');
  dm.emit('sound:lock', { on: false });

  // Phones cannot run it.
  phone.emit('sound:mood', { mood: 'funny' });
  phone.emit('sound:stop');
  await wait(150);
  ok(S().mood === 'sad' && S().on, 'phones cannot change the soundscape');

  // Stop fades the soundscape out but keeps manual soundboard layers.
  await wait(900); // let the undo history settle, so Stop is its own step
  music.emit('sound:stop');
  await until(() => !S().on);
  ok(!A().music && A().mix.every((m) => !m.ss) && A().mix.some((m) => m.id === 'loop-tavern'), 'Stop ends the soundscape and its music, the soundboard layer plays on');

  // DM undo covers the soundscape too.
  await wait(900);
  dm.emit('dm:undo');
  await until(() => S().on);
  ok(S().on && A().music?.id === 'mood-sad', 'DM undo brings the soundscape and its mood music back');

  await h.done(srv);
})();
