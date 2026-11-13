// Layered sprites: manifest validation, DM-only uploads, PNG size checks, WebM + sprite-sheet encode.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-layered-'));
process.env.UPLOAD_DIR = path.join(TMP, 'u');
process.env.DATA_DIR = path.join(TMP, 'd');
const layered = require('../src/layered');
const { AssetError } = require('../src/assets');
const ff = process.env.FFMPEG || 'ffmpeg';
const hasFf = spawnSync(ff, ['-version'], { stdio: 'ignore' }).status === 0;

const ok = (kind, m) => assert.strictEqual(layered.validateManifest(kind, m).ok, true, JSON.stringify(layered.validateManifest(kind, m).errors));
const bad = (kind, m) => assert.strictEqual(layered.validateManifest(kind, m).ok, false, 'expected invalid');

const shared = { kind: 'shared', pack: 'tavern', size: [512, 512], layers: [{ id: 'body', z: 0, file: 'layers/body.png' }] };
ok('shared', shared);
bad('shared', { ...shared, size: [256, 256] });
bad('shared', { ...shared, layers: [{ id: 'body', z: 0, file: '../etc/passwd' }] });
bad('shared', { ...shared, extra: 1 });
bad('shared', { ...shared, layers: [{ id: 'a', z: 0, file: 'layers/a.png' }, { id: 'a', z: 1, file: 'layers/b.png' }] });

const char = {
  kind: 'character', id: 'mira', size: [512, 512], base: 'shared/tavern',
  layers: [
    { id: 'body', z: 0, file: 'layers/body.png', from: 'base' },
    { id: 'eyes', z: 2, file: 'layers/eyes_open.png' },
    { id: 'eyes_narrow', z: 2, file: 'layers/eyes_narrow.png' },
  ],
  states: { angry: { eyes: 'eyes_narrow' } },
  animations: [{ name: 'blink', file: 'anim/blink.webm', kind: 'blink', fps: 12, frames: 4, z: 2 }],
};
ok('character', char);
bad('character', { ...char, states: { angry: { nope: 'eyes_narrow' } } });
bad('character', { ...char, base: undefined });
bad('character', { ...char, id: 'shared' });
bad('character', { ...char, animations: [{ ...char.animations[0], fps: 60 }] });

(async () => {
  // Path and id guards.
  await assert.rejects(layered.storeLayered('character', 'mira', '../x.png', Buffer.from('x')), AssetError);
  await assert.rejects(layered.storeLayered('character', 'Bad Id', 'manifest.json', Buffer.from('{}')), AssetError);
  await assert.rejects(layered.storeLayered('nope', 'mira', 'manifest.json', Buffer.from('{}')), AssetError);

  // Manifest lands only when valid.
  await assert.rejects(layered.storeLayered('character', 'mira', 'manifest.json', Buffer.from('{"kind":"character"}')), /Invalid manifest/);
  const m = await layered.storeLayered('character', 'mira', 'manifest.json', Buffer.from(JSON.stringify(char)));
  assert.strictEqual(m.url, '/uploads/layered/mira/manifest.json');
  assert(fs.existsSync(path.join(TMP, 'u/layered/mira/manifest.json')));
  await assert.rejects(layered.storeLayered('character', 'other', 'manifest.json', Buffer.from(JSON.stringify(char))), /does not match/);

  // Layers: PNG, exactly 512x512.
  const png = (w, h) => {
    if (!hasFf) return null;
    const r = spawnSync(ff, ['-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=red:s=${w}x${h}`, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'], { maxBuffer: 1 << 24 });
    return r.stdout;
  };
  if (hasFf) {
    await assert.rejects(layered.storeLayered('character', 'mira', 'layers/body.png', png(256, 256)), /512x512/);
    const l = await layered.storeLayered('character', 'mira', 'layers/eyes_open.png', png(512, 512));
    assert.deepStrictEqual(l.written, ['layers/eyes_open.png']);
    await assert.rejects(layered.storeLayered('character', 'mira', 'layers/eyes_open.png', Buffer.from('not a png')), /must be PNG/);

    // Animation: WebM source is re-encoded into a WebM and 12-frame sprite sheets from the same frames.
    const clip = spawnSync(ff, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24:duration=1.5', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '50', '-deadline', 'realtime', '-f', 'webm', 'pipe:1'], { maxBuffer: 1 << 26 }).stdout;
    const a = await layered.storeLayered('character', 'mira', 'anim/blink.webm', clip);
    assert.strictEqual(a.frames, 18); // 1.5 s at 12 fps
    assert.strictEqual(a.sheets, 2);
    for (const f of ['anim/blink.webm', 'anim/blink.sheet0.png', 'anim/blink.sheet1.png']) assert(fs.existsSync(path.join(TMP, 'u/layered/mira', f)), f);
    assert.strictEqual(layered.pngSize(fs.readFileSync(path.join(TMP, 'u/layered/mira/anim/blink.sheet0.png')))[0], 512 * 4);
  } else {
    console.log('  (ffmpeg not found: skipped PNG and animation encode checks)');
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('layered: ok');
})().catch((e) => { console.error(e); process.exit(1); });
