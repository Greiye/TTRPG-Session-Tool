// Layered sprites (shared sets + per-character layers). DM-only uploads, one file per request.
//
// Folders under UPLOAD_DIR:
//   layered/shared/<pack>/       bodies and outfits shared by many characters
//   layered/<character-id>/      per-character head, face, mouth, accessories
// Each folder holds manifest.json (validated against schema/layered.schema.json), layers/*.png
// (512x512) and anim/<name>.webm plus anim/<name>.sheet<N>.png, encoded from the same frames.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const Ajv2020 = require('ajv/dist/2020');
const { UPLOAD_DIR, ROOT } = require('./config');
const { sniff, hasFfmpeg, AssetError, MB } = require('./assets');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SCHEMA_ID = 'https://tavern-screen.local/schema/v1/layered.schema.json';
const SIZE = 512;
const FPS = 12;
const MAX_SECONDS = 2;
const SHEET_COLS = 4;
const SHEET_ROWS = 3; // 12 frames per sheet
const LIMITS = { manifest: 64 * 1024, layer: 1 * MB, anim: 12 * MB };

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'layered.schema.json'), 'utf8')));
const validators = {
  shared: ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/sharedManifest` }),
  character: ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/characterManifest` }),
};

// Schema check plus the cross-references JSON Schema can't express.
function validateManifest(kind, manifest) {
  const v = validators[kind];
  if (!v) return { ok: false, errors: [`unknown kind ${kind}`] };
  if (!v(manifest)) {
    return { ok: false, errors: v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) };
  }
  const errors = [];
  const ids = new Set();
  for (const l of manifest.layers) {
    if (ids.has(l.id)) errors.push(`duplicate layer id ${l.id}`);
    ids.add(l.id);
  }
  if (kind === 'character') {
    if (manifest.id === 'shared') errors.push('character id "shared" is reserved');
    if (manifest.layers.some((l) => l.from === 'base') && !manifest.base) errors.push('layers use from:"base" but no base is set');
    for (const [state, overrides] of Object.entries(manifest.states || {})) {
      for (const [from, to] of Object.entries(overrides)) {
        if (!ids.has(from)) errors.push(`state ${state} overrides unknown layer ${from}`);
        if (!ids.has(to)) errors.push(`state ${state} uses unknown layer ${to}`);
      }
    }
  }
  const names = new Set();
  for (const a of manifest.animations || []) {
    if (names.has(a.name)) errors.push(`duplicate animation ${a.name}`);
    names.add(a.name);
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
// kind + id -> folder under UPLOAD_DIR, and the public URL prefix for it.
function folderFor(kind, id) {
  if (!ID.test(String(id))) throw new AssetError(400, 'Bad id: use lowercase letters, digits, - and _.');
  if (kind === 'shared') return { dir: path.join(UPLOAD_DIR, 'layered', 'shared', id), url: `/uploads/layered/shared/${id}/`, manifestKind: 'shared' };
  if (kind === 'character') {
    if (id === 'shared') throw new AssetError(400, 'Character id "shared" is reserved.');
    return { dir: path.join(UPLOAD_DIR, 'layered', id), url: `/uploads/layered/${id}/`, manifestKind: 'character' };
  }
  throw new AssetError(404, `Unknown layered kind: ${kind}`);
}

// Only these paths may be written; anything else is refused before touching disk.
const REL = /^(manifest\.json|layers\/[a-z0-9_-]{1,40}\.png|anim\/[a-z0-9_-]{1,40}\.webm)$/;

function pngSize(buf) {
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function run(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(kill); reject(e); });
    p.on('close', (code) => {
      clearTimeout(kill);
      if (code === 0) resolve(); else reject(new Error(err.trim().split('\n').pop() || `ffmpeg exit ${code}`));
    });
  });
}

// One source clip -> frames at 12 fps, 512x512, max 2 s. The WebM and sprite sheets are both cut from
// those frames, so they always match.
async function encodeAnimation(srcBuf, outDir, name) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'layered-'));
  try {
    const src = path.join(work, 'src.webm');
    const frames = path.join(work, 'frames');
    fs.mkdirSync(frames);
    fs.writeFileSync(src, srcBuf);
    await run(['-i', src, '-t', String(MAX_SECONDS), '-an', '-vf',
      `fps=${FPS},scale=${SIZE}:${SIZE}:force_original_aspect_ratio=increase,crop=${SIZE}:${SIZE}`,
      '-pix_fmt', 'rgba', path.join(frames, 'f%03d.png')]);
    const files = fs.readdirSync(frames).filter((f) => f.endsWith('.png')).sort();
    if (!files.length) throw new AssetError(415, 'No frames found in that animation.');
    const count = files.length;

    await run(['-framerate', String(FPS), '-i', path.join(frames, 'f%03d.png'), '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
      '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', '-an',
      path.join(outDir, `anim/${name}.webm`)]);

    // Pad the last sheet by repeating its final frame, so every sheet is a full 4x3 grid.
    const perSheet = SHEET_COLS * SHEET_ROWS;
    const padTo = Math.ceil(count / perSheet) * perSheet;
    for (let i = count; i < padTo; i++) {
      fs.copyFileSync(path.join(frames, files[count - 1]), path.join(frames, `f${String(i + 1).padStart(3, '0')}.png`));
    }
    const sheets = padTo / perSheet;
    for (let s = 0; s < sheets; s++) {
      await run(['-framerate', String(FPS), '-start_number', String(s * perSheet + 1), '-i', path.join(frames, 'f%03d.png'),
        '-vf', `tile=${SHEET_COLS}x${SHEET_ROWS}`, '-frames:v', '1', path.join(outDir, `anim/${name}.sheet${s}.png`)]);
    }
    return { frames: count, fps: FPS, sheets, webm: `anim/${name}.webm` };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Store one file of a layered set. Returns { path, url, ... }. Manifests are validated before they land.
async function storeLayered(kind, id, rel, buf) {
  const { dir, url, manifestKind } = folderFor(kind, id);
  if (!REL.test(rel || '')) throw new AssetError(400, 'Bad file path. Use manifest.json, layers/<name>.png or anim/<name>.webm.');
  if (!Buffer.isBuffer(buf) || !buf.length) throw new AssetError(400, 'Empty upload.');
  fs.mkdirSync(path.join(dir, 'layers'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'anim'), { recursive: true });

  if (rel === 'manifest.json') {
    if (buf.length > LIMITS.manifest) throw new AssetError(413, 'Manifest too big.');
    let m;
    try { m = JSON.parse(buf.toString('utf8')); } catch { throw new AssetError(400, 'manifest.json is not valid JSON.'); }
    const check = validateManifest(manifestKind, m);
    if (!check.ok) throw new AssetError(422, `Invalid manifest: ${check.errors.slice(0, 5).join('; ')}`);
    const declared = manifestKind === 'shared' ? m.pack : m.id;
    if (declared !== id) throw new AssetError(422, 'Manifest id does not match the URL.');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
    return { url: url + 'manifest.json', written: ['manifest.json'] };
  }

  if (rel.startsWith('layers/')) {
    if (buf.length > LIMITS.layer) throw new AssetError(413, 'Layer PNG too big (1 MB max).');
    const size = pngSize(buf);
    if (!size || sniff(buf)[0] !== 'png') throw new AssetError(415, 'Layers must be PNG.');
    if (size[0] !== SIZE || size[1] !== SIZE) throw new AssetError(422, `Layers must be ${SIZE}x${SIZE}; this one is ${size[0]}x${size[1]}.`);
    fs.writeFileSync(path.join(dir, rel), buf);
    return { url: url + rel, written: [rel] };
  }

  // anim/<name>.webm: a source clip, re-encoded into the WebM and the sprite sheets.
  if (!sniff(buf).includes('webm')) throw new AssetError(415, 'Animations must be WebM.');
  if (buf.length > LIMITS.anim) throw new AssetError(413, 'Animation too big (12 MB max).');
  if (!hasFfmpeg) throw new AssetError(503, 'ffmpeg is needed to encode animations.');
  const name = path.basename(rel, '.webm');
  const enc = await encodeAnimation(buf, dir, name);
  const written = [enc.webm, ...Array.from({ length: enc.sheets }, (_, i) => `anim/${name}.sheet${i}.png`)];
  return { url: url + enc.webm, written, frames: enc.frames, fps: enc.fps, sheets: enc.sheets };
}

module.exports = { validateManifest, storeLayered, folderFor, encodeAnimation, pngSize, LIMITS, SIZE, FPS };
