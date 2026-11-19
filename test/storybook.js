// Storybook (src/storybook.js, src/storypack.js; Mike, Nov 19): the whole session on disk, the Keep star, the
// replay data for /story and the story pack zip. DM-only lines stay out of the pack.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { harness } = require('./helpers');
const h = harness('storybook');
const { ok, until } = h;
// until() for an async check (fetching the journal over HTTP).
async function aUntil(fn, ms = 3000) { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() > end) return false; await h.wait(40); } }

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  const sessions = async () => (await fetch(`${h.URL}/api/story/sessions`)).json();
  const read = async (id) => (await fetch(`${h.URL}/api/story/sessions/${id}`)).json();

  // An idle boot leaves nothing behind; the first line starts the session file.
  dm.emit('dm:narrate', { text: 'Rain on the old mill.' });
  ok(await aUntil(async () => (await sessions()).length === 1), 'the first line starts a session');
  const [s0] = await sessions();
  ok(/^\d{4}-\d\d-\d\d-\d{4}/.test(s0.id) && s0.current && !s0.ended, 'the session is named by its start time and is the current one');
  const file = path.join(h.TMP, 'data', 'sessions', s0.id, 'journal.jsonl');
  ok(fs.existsSync(file), 'the journal is a file under data/sessions/');

  // More than the 80 lines the live log keeps.
  for (let i = 1; i <= 90; i++) dm.emit('dm:narrate', { text: `Line ${i}.` });
  ok(await until(() => dm.last.log.some((l) => l.text === 'Line 90.')), 'the narration lands');
  let s = await read(s0.id);
  ok(dm.last.log.length <= 80 && s.items.filter((x) => /^Line \d+\.$/.test(x.text)).length === 90, 'the storybook keeps every line, the live log only 80');
  ok(s.items.some((x) => x.text === 'Rain on the old mill.'), 'including the first one');
  ok(s.items[0].mood && s.items[0].mood.mode === 'exploration' && typeof s.items[0].mood.scene === 'string', 'each line carries the mood');

  // Mood: social with an emotion, and the weather.
  dm.emit('dm:mode', { mode: 'social' });
  dm.emit('dm:emotion', { emotion: 'angry' });
  dm.emit('dm:weather', { kind: 'rain', intensity: 3 });
  await until(() => dm.last.mode === 'social' && dm.last.social.npc.emotion === 'angry' && dm.last.weather.kind === 'rain');
  dm.emit('dm:say', { text: 'Get out of my inn.' });
  dm.emit('dm:say', { text: 'The key is under the altar.', lang: 'Elvish' }); // the plain text is a DM-only line
  ok(await aUntil(async () => (await read(s0.id)).items.some((x) => x.text === 'Get out of my inn.')), 'the NPC line is in');
  s = await read(s0.id);
  const said = s.items.find((x) => x.text === 'Get out of my inn.');
  ok(said.who && said.emotion === 'angry' && said.mood.mode === 'social' && said.mood.emotion === 'angry' && /rain/.test(said.mood.weather), 'the line has its speaker, emotion and the mood (social, angry, rain)');
  const secret = s.items.find((x) => /under the altar/.test(x.text) && !x.public);
  ok(secret && secret.vis === 'dm', 'the DM-only line is in the journal, marked not public');

  // The Keep star: no id keeps the newest public thing; again un-keeps; a phone cannot keep.
  let k = await h.call(dm, 'dm:keep');
  ok(k.ok && k.kept && !/under the altar/.test(k.text || ''), 'Keep marks the newest public line (never a DM-only one)');
  const keptId = k.id;
  ok((await read(s0.id)).items.find((x) => x.id === keptId)?.kept, 'the viewer shows it kept');
  k = await h.call(dm, 'dm:keep');
  ok(k.ok && !k.kept && k.id === keptId, 'pressing Keep again un-keeps it');
  ok((await h.call(a, 'dm:keep')).error, 'a phone cannot keep');
  k = await h.call(dm, 'dm:keep', { id: said.id, on: true });
  ok(k.ok && k.kept && k.id === said.id, 'keeping by id');
  const kept = new Promise((res) => dm.once('story:kept', res));
  dm.emit('dm:narrate', { text: 'Chapter test.' });
  const r = await fetch(`${h.URL}/api/story/sessions/${s0.id}/keep`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: 'nope', on: true }) });
  ok(r.status === 200, 'the viewer can keep any item over HTTP');
  ok(await Promise.race([kept.then(() => true), new Promise((res) => setTimeout(() => res(false), 2000))]), 'the DM page hears about keeps');

  // A TV moment with no log line of its own (a pinned quote) is kept automatically.
  dm.emit('dm:tv:quote:add', { text: 'Never trust a smiling innkeeper.', who: 'Thorn' });
  const quoted = await aUntil(async () => (await read(s0.id)).items.find((x) => x.type === 'moment' && /smiling innkeeper/.test(x.text)));
  ok(quoted && quoted.kept && quoted.auto, 'a pinned quote is a kept moment, kept automatically');

  // Undo takes an undone line out of the story. Fixed wait: undo groups a burst of changes into one step after
  // 700 ms of quiet (src/undo.js), so the mistake must be its own step.
  await h.wait(900);
  dm.emit('dm:narrate', { text: 'A mistake I will undo.' });
  ok(await until(() => dm.last.undo?.undo === 'A mistake I will undo.', 3000), 'the narration is the undo step');
  ok((await h.call(dm, 'dm:undo')).ok, 'undo');
  ok(await aUntil(async () => !(await read(s0.id)).items.some((x) => x.text === 'A mistake I will undo.')), 'the undone line leaves the story');

  // Story pack: transcript, moments and mood timeline; DM-only lines stay out.
  const res = await fetch(`${h.URL}/api/story/sessions/${s0.id}/pack.zip`);
  ok(res.status === 200 && /story-.*\.zip/.test(res.headers.get('content-disposition') || ''), 'the DM downloads the story pack');
  const zip = path.join(h.TMP, 'pack.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const dest = path.join(h.TMP, 'pack');
  fs.mkdirSync(dest);
  let unzipped = true;
  try { execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', zip, dest]); } catch { unzipped = false; }
  if (unzipped) {
    const [root] = fs.readdirSync(dest);
    const rd = (f) => fs.readFileSync(path.join(dest, root, f), 'utf8');
    const all = ['README.md', 'story/transcript.md', 'story/script.md', 'story/recap.md', 'moments.json', 'moments.md', 'music/mood.csv'].map(rd).join('\n');
    ok(rd('story/transcript.md').includes('Line 90.') && rd('story/transcript.md').includes('Rain on the old mill.'), 'the transcript has the whole session');
    ok(!/under the altar/.test(all), 'the DM-only line is in no file of the pack');
    const m = JSON.parse(rd('moments.json'));
    ok(m.moments.some((x) => x.text === 'Get out of my inn.' && x.mood?.emotion === 'angry'), 'moments.json has the kept line with its mood');
    ok(/^iso_time,time,scene,mode,npc,emotion,weather,time_of_day,music/.test(rd('music/mood.csv')) && /social/.test(rd('music/mood.csv')), 'the mood timeline is a CSV with the social scene');
    ok(fs.existsSync(path.join(dest, root, 'art', 'backdrops')), 'the backdrop on screen is in art/');
  } else console.log('  skip  unzip check (no python3 here)');
  ok((await fetch(`${h.URL}/api/story/sessions/..%2F..%2Fetc`)).status === 404, 'a bad session id is a 404');

  // End Session marks it ended; the viewer page is served.
  dm.emit('dm:session:end');
  ok(await aUntil(async () => (await sessions())[0].ended), 'End Session marks the session ended');
  ok((await fetch(`${h.URL}/story`)).status === 200, 'the storybook page is served');

  await h.done(srv);
})();
