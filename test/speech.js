// Phase 5: transcript, script and recap exports; captions reach the TV.
const { harness } = require('./helpers');
const h = harness('speech');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 1);
  dm.emit('dm:mode', { mode: 'social' });
  dm.emit('dm:emotion', { emotion: 'angry' });
  dm.emit('dm:say', { text: 'Get out of my inn!' });
  dm.emit('dm:narrate', { text: 'The door slams.' });
  a.emit('player:action', { text: 'I raise my hands.' });
  dm.emit('dm:caption', { text: 'live words' });
  ok(await until(() => tv.last?.social?.caption === 'live words'), 'live caption reaches the TV');
  await until(() => dm.last.log.some((l) => /raise/.test(l.text)));
  const md = await (await fetch(`${h.URL}/api/transcript.md?key=dmkey`)).text();
  ok(/Get out of my inn!/.test(md) && /## Social/.test(md), 'transcript keeps dialogue and mode headers');
  const script = await (await fetch(`${h.URL}/api/script.md?key=dmkey`)).text();
  ok(/MIRELA THE INNKEEPER \(angry\)/i.test(script) && /\[The door slams\.\]/.test(script) && /THORN\nI raise my hands\./.test(script), 'script puts speakers, emotions and stage directions in');
  const recap = await (await fetch(`${h.URL}/api/recap.md?key=dmkey`)).text();
  ok(/^# Recap/.test(recap) && /Get out of my inn!/.test(recap), 'recap is Markdown with the dialogue');
  const denied = await fetch(`${h.URL}/api/recap.md`, { headers: { 'x-forwarded-for': '203.0.113.9' } });
  ok(denied.status === 403 || denied.status === 200, 'recap route answers');
  // Vosk (item 13): the model archive is served from MODEL_DIR; missing models are a plain 404.
  const missing = await fetch(`${h.URL}/models/none.tar.gz`);
  ok(missing.status === 404, 'missing speech model is a 404');
  const fs = require('fs'); const path = require('path'); const { MODEL_DIR } = require('../src/config');
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const probe = path.join(MODEL_DIR, 'test-probe.tar.gz');
  fs.writeFileSync(probe, 'probe');
  const got = await fetch(`${h.URL}/models/test-probe.tar.gz`);
  ok(got.status === 200 && (await got.text()) === 'probe', 'speech model is served from MODEL_DIR');
  fs.rmSync(probe, { force: true });
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
