// Phase E: soundboard. Ambience layers blend on the TV, the co-DM can run them, phones cannot,
// and the placeholder loops are real WAV files of the right length.
const { harness, wait } = require('./helpers');
const { LOOP_IDS, wavFor, RATE } = require('../src/placeholder-sounds');
const h = harness('soundboard');
const { ok, until } = h;

// Placeholder WAVs: correct header, four seconds, same bytes every time.
{
  for (const id of LOOP_IDS) {
    const b = wavFor(id);
    ok(b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE', `${id} is a WAV file`);
    ok(b.length === 44 + 4 * RATE * 2, `${id} is four seconds long`);
    ok(wavFor(id).equals(b), `${id} is the same every time it is made`);
  }
  ok(wavFor('../etc/passwd') === null && wavFor('loop-missing') === null, 'only placeholder ids are served');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const codm = await h.client();
  const phone = await h.player(room, 'Thorn', 'Fighter');
  const auth = await h.call(codm, 'dm:auth', { key: 'codmkey' });
  // Every test client connects from localhost, which the server treats as the DM, so only the key is checked here.
  ok(auth.ok, 'the co-DM key is accepted');
  await until(() => dm.last?.audio?.loops?.length === LOOP_IDS.length);

  const au = () => dm.last.audio;
  ok(au().mix.length === 0, 'nothing plays until someone starts a layer');
  ok(au().loops.every((t) => t.builtin && t.url === `/sounds/${t.id}.wav`), 'built-in loops point at the placeholder files');

  dm.emit('atmo:mix:add', { id: 'loop-rain' });
  await until(() => au().mix.length === 1);
  ok(au().mix[0].id === 'loop-rain' && au().mix[0].volume === 0.5, 'the DM starts rain at half volume');

  codm.emit('atmo:mix:add', { id: 'loop-tavern' });
  await until(() => au().mix.length === 2);
  ok(au().mix.map((m) => m.id).join() === 'loop-rain,loop-tavern', 'the co-DM can layer a second ambience');

  dm.emit('atmo:mix:add', { id: 'loop-rain' });
  await wait(150);
  ok(au().mix.length === 2, 'a layer already playing is not added twice');

  codm.emit('atmo:mix:volume', { id: 'loop-rain', volume: 3 });
  await until(() => au().mix.find((m) => m.id === 'loop-rain').volume === 1);
  ok(true, 'a layer volume is clamped to 1');

  codm.emit('atmo:mix:volume', { id: 'loop-tavern', volume: -2 });
  await until(() => au().mix.find((m) => m.id === 'loop-tavern').volume === 0);
  ok(true, 'a layer volume is clamped to 0');

  phone.emit('atmo:mix:add', { id: 'loop-forest' });
  await wait(150);
  ok(au().mix.length === 2, 'a phone cannot start ambience');

  dm.emit('atmo:mix:add', { id: 'no-such-loop' });
  await wait(150);
  ok(au().mix.length === 2, 'an unknown track is ignored');

  codm.emit('atmo:mix:remove', { id: 'loop-rain' });
  await until(() => au().mix.length === 1);
  ok(au().mix[0].id === 'loop-tavern', 'stopping a layer leaves the others playing');

  codm.emit('atmo:backdrop', { id: 'anything' });
  await wait(100);
  ok(au().mix.length === 1, 'soundboard events do not disturb the rest of the state');

  codm.close(); phone.close(); dm.close();
  await h.done(srv);
})();
