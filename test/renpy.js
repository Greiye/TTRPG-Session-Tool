// Ren'Py export and social replays (src/renpy.js, src/storybook.js; Mike, Nov 21): a social scene records the NPC's
// look and the party, and the session exports as a Ren'Py project (dialogue, emotion changes, backdrops, sprites,
// placeholders for missing art). DM-only lines stay out.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { harness } = require('./helpers');
const h = harness('renpy');
const { ok, until } = h;
async function aUntil(fn, ms = 3000) { const end = Date.now() + ms; for (;;) { let v; try { v = await fn(); } catch { v = false; } if (v) return v; if (Date.now() > end) return false; await h.wait(40); } }

(async () => {
  // Pure helpers first.
  const { rs, ident, hex } = require('../src/renpy');
  ok(rs('Say "hi" [now] {b}\\') === '"Say \\"hi\\" [[now] {{b}\\\\"', 'say strings escape quotes, brackets, braces and backslashes');
  ok(ident('Mirela the Innkeeper') === 'mirela_the_innkeeper' && ident('Éowyn') === 'eowyn', 'speaker names become Ren\'Py names');
  ok(/^#[0-9a-f]{6}$/.test(hex(28)) && hex(0) !== hex(200), 'hues become colours');

  // A layered sprite for the NPC: manifest plus two states.
  const lay = path.join(h.TMP, 'uploads', 'layered', 'albert-spr');
  fs.mkdirSync(path.join(lay, 'layers'), { recursive: true });
  for (const f of ['body', 'face', 'face-angry']) fs.writeFileSync(path.join(lay, 'layers', `${f}.png`), 'png');
  fs.writeFileSync(path.join(lay, 'manifest.json'), JSON.stringify({ kind: 'character', id: 'albert-spr', size: [512, 512],
    layers: [{ id: 'body', z: 0, file: 'layers/body.png' }, { id: 'face', z: 1, file: 'layers/face.png' }, { id: 'face-angry', z: 1, file: 'layers/face-angry.png' }],
    states: { neutral: { 'face-angry': 'face' }, angry: { face: 'face-angry' } } }));

  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  const read = async (id) => (await fetch(`${h.URL}/api/story/sessions/${id}`)).json();

  dm.emit('dm:narrate', { text: 'Rain on the old mill.' });
  dm.emit('dm:mode', { mode: 'social' });
  await until(() => dm.last.mode === 'social');
  ok((await h.call(dm, 'dm:convo:start', { ids: ['pool-albert'] })).ok, 'the conversation starts');
  await until(() => dm.last.social.convo.live && dm.last.social.npc.name === 'Albert');
  ok((await h.call(dm, 'dm:sprite', { target: 'npc', sprite: { id: 'albert-spr', state: 'neutral' } })).ok !== false, 'Albert wears a sprite');
  dm.emit('dm:say', { text: 'Welcome to the "Drowned Bell".' });
  await h.wait(100); // keep the order: the line lands before the emotion changes
  dm.emit('dm:emotion', { emotion: 'angry' });
  await until(() => dm.last.social.npc.emotion === 'angry');
  dm.emit('dm:say', { text: 'Get out of my inn.' });
  dm.emit('dm:say', { text: 'The key is under the altar.', lang: 'Elvish' }); // the plain text is a DM-only line
  await until(() => a.last?.social.convo.live);
  a.emit('player:social:say', { text: 'We only want the key.', emotion: 'happy' });
  const sid = (await aUntil(async () => {
    const [s0] = await (await fetch(`${h.URL}/api/story/sessions`)).json();
    return s0 && (await read(s0.id)).items.some((x) => x.said === 'We only want the key.') && s0.id;
  }));
  ok(sid, 'the phone line is in the storybook');

  // Social replays: the line has the speaker and the mood has the NPC's look and the party.
  const s = await read(sid);
  const pc = s.items.find((x) => x.said === 'We only want the key.');
  ok(pc.who === 'Thorn' && pc.emotion === 'happy', 'a phone line keeps the speaker and the emotion');
  // The mood is the one on screen when the line was said (the line's own emotion arrives with the line).
  ok(pc.mood.party?.some((p) => p.name === 'Thorn' && 'emotion' in p && 'portrait' in p), 'the mood has the party on the left, with their looks');
  const npcLine = s.items.find((x) => x.text === 'Get out of my inn.');
  ok(npcLine.mood.npc === 'Albert' && npcLine.mood.npcSprite?.id === 'albert-spr' && Number.isFinite(npcLine.mood.npcHue), 'the mood has the NPC\'s sprite and colour');
  ok(!s.items.find((x) => x.text === 'Rain on the old mill.').mood.party, 'outside social mode the mood stays small');

  // The export.
  dm.emit('dm:mode', { mode: 'exploration' });
  dm.emit('dm:narrate', { text: 'They leave in the rain.' });
  await aUntil(async () => (await read(sid)).items.some((x) => x.text === 'They leave in the rain.'));
  const res = await fetch(`${h.URL}/api/story/sessions/${sid}/renpy.zip`);
  ok(res.status === 200 && /renpy-.*\.zip/.test(res.headers.get('content-disposition') || ''), 'the DM downloads the Ren\'Py zip');
  const zip = path.join(h.TMP, 'renpy.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const dest = path.join(h.TMP, 'renpy');
  fs.mkdirSync(dest);
  let unzipped = true;
  try { execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', zip, dest]); } catch { unzipped = false; }
  if (unzipped) {
    const [root] = fs.readdirSync(dest);
    const rd = (f) => fs.readFileSync(path.join(dest, root, f), 'utf8');
    const script = rd('game/script.rpy');
    const chars = rd('game/characters.rpy');
    if (process.env.SHOW) console.log(chars + '\n' + script); // SHOW=1 prints the export
    ok(/^label start:$/m.test(script) && /^    return$/m.test(script), 'script.rpy has label start and return');
    ok(script.includes('    "Rain on the old mill."'), 'narration is a narrator line');
    ok(script.includes('albert "Welcome to the \\"Drowned Bell\\"."'), 'NPC dialogue with escaped quotes');
    ok(/show albert neutral at right[\s\S]*show albert angry at right[\s\S]*albert "Get out of my inn\."/.test(script), 'the emotion change is a show statement before the line');
    ok(/show thorn happy at left[\s\S]*thorn "We only want the key\."/.test(script), 'the player stands on the left with their emotion and says only their words');
    ok(/hide albert[\s\S]*"They leave in the rain\."/.test(script), 'leaving social mode clears the stage');
    ok(/^    scene bg \w+$/m.test(script) && /with fade/.test(script), 'the backdrop is a scene statement');
    ok(!/under the altar/.test(script + chars), 'the DM-only line is in no file');
    ok(/define albert = Character\("Albert", color="#[0-9a-f]{6}"/.test(chars) && /define thorn = Character\("Thorn"/.test(chars), 'a Character per speaker');
    ok(/image albert angry = Composite\(\(512, 512\),\s+\(0, 0\), "images\/sprites\/albert\/body\.png",\s+\(0, 0\), "images\/sprites\/albert\/face-angry\.png"\)/.test(chars), 'the sprite becomes a Composite per emotion');
    ok(fs.existsSync(path.join(dest, root, 'game/images/sprites/albert/face-angry.png')), 'the sprite layers are in the zip');
    ok(/image thorn happy = (Placeholder\(text="Thorn \(happy\)"\)|"images\/chars\/)/.test(chars), 'a hero without art gets a placeholder (or their portrait)');
    ok(/^image bg \w+ = ("images\/bg\/[\w.-]+"|Placeholder)/m.test(chars), 'the backdrop is an image (file or placeholder)');
    ok(rd('README.md').includes('Ren\'Py launcher'), 'the README says how to open it');
  } else console.log('  skip  unzip check (no python3 here)');
  ok((await fetch(`${h.URL}/api/story/sessions/nope/renpy.zip`)).status === 404, 'an unknown session is a 404');

  await h.done(srv);
})();
