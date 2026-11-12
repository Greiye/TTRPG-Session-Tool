// Asset pipeline (0f, 0j): one upload path for every kind of file, with per-kind formats,
// size limits, content sniffing, storage folders, and portrait re-encoding.
//
// Kinds and where they live (all under UPLOAD_DIR, served at /uploads with long cache headers):
//   backdrop  images + MP4/WebM loops   uploads/            (root, kept for existing libraries)
//   audio     music and SFX            uploads/
//   portrait  character portraits      uploads/portraits/  (WebM re-encoded to 256x256 VP9 with alpha)
//   creature  creature/NPC art          uploads/creatures/  (WebM re-encoded to 384x384)
//   map       battle and region maps   uploads/maps/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { UPLOAD_DIR } = require('./config');

const IMG = ['png', 'jpg', 'webp', 'gif'];
const AUDIO = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'weba', 'flac'];
const MB = 1024 * 1024;
const KINDS = {
  backdrop: { dir: '', ext: [...IMG, 'mp4', 'webm'], maxBytes: 60 * MB },
  audio: { dir: '', ext: AUDIO, maxBytes: 40 * MB },
  portrait: { dir: 'portraits', ext: [...IMG, 'webm'], maxBytes: 12 * MB, video: { size: 256, maxSeconds: 10 } },
  creature: { dir: 'creatures', ext: [...IMG, 'webm'], maxBytes: 20 * MB, video: { size: 384, maxSeconds: 15 } },
  map: { dir: 'maps', ext: ['png', 'jpg', 'webp'], maxBytes: 25 * MB },
};
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/flac': 'flac',
};
for (const k of Object.values(KINDS)) fs.mkdirSync(path.join(UPLOAD_DIR, k.dir), { recursive: true });

// The declared type must match the bytes, so a renamed .exe can't be served as an image.
function sniff(buf) {
  const hex = buf.subarray(0, 12).toString('hex');
  const ascii = buf.subarray(0, 12).toString('latin1');
  if (hex.startsWith('89504e47')) return ['png'];
  if (hex.startsWith('ffd8ff')) return ['jpg'];
  if (ascii.startsWith('GIF8')) return ['gif'];
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return ['webp'];
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return ['wav'];
  if (hex.startsWith('1a45dfa3')) return ['webm', 'weba'];
  if (ascii.slice(4, 8) === 'ftyp') return ['mp4', 'm4a', 'aac'];
  if (ascii.startsWith('OggS')) return ['ogg'];
  if (ascii.startsWith('fLaC')) return ['flac'];
  if (ascii.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return ['mp3', 'aac'];
  return [];
}

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const hasFfmpeg = (() => { try { return spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } })();

// Square-crop and shrink an animated WebM, keeping transparency. Resolves to the new file path.
function encodeWebm(src, { size, maxSeconds }) {
  const out = src.replace(/\.webm$/, '.enc.webm');
  const args = ['-y', '-loglevel', 'error', '-c:v', 'libvpx-vp9', '-i', src, '-t', String(maxSeconds), '-an',
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},fps=24`,
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', out];
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    const kill = setTimeout(() => p.kill('SIGKILL'), 60000);
    p.on('close', (code) => {
      clearTimeout(kill);
      if (code === 0 && fs.existsSync(out)) { fs.renameSync(out, src); resolve(src); } else { fs.rm(out, () => {}); reject(new Error(err.trim().split('\n').pop() || 'encode failed')); }
    });
  });
}

const safeName = (n) => String(n || 'file').replace(/\.\w+$/, '').replace(/[^\w -]/g, '').slice(0, 40).replace(/ /g, '_') || 'file';
class AssetError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// Validate and store one upload. Returns { file, url, ext, kind }.
async function store(kind, buf, contentType, { name, prefix } = {}) {
  const k = KINDS[kind];
  if (!k) throw new AssetError(404, `Unknown asset kind: ${kind}`);
  if (!Buffer.isBuffer(buf) || !buf.length) throw new AssetError(400, 'Empty upload.');
  if (buf.length > k.maxBytes) throw new AssetError(413, `Too big: ${kind} files can be up to ${k.maxBytes / MB} MB.`);
  const ext = MIME_EXT[String(contentType || '').split(';')[0].trim()];
  if (!ext || !k.ext.includes(ext)) throw new AssetError(415, `Use ${k.ext.map((e) => e.toUpperCase()).join(', ')} for ${kind} files.`);
  if (!sniff(buf).includes(ext)) throw new AssetError(415, `That file isn't really a ${ext.toUpperCase()}.`);
  const file = `${prefix || crypto.randomBytes(4).toString('hex')}-${safeName(name)}.${ext}`;
  const abs = path.join(UPLOAD_DIR, k.dir, file);
  fs.writeFileSync(abs, buf);
  if (ext === 'webm' && k.video && hasFfmpeg) {
    try { await encodeWebm(abs, k.video); } catch (e) { console.warn(`  WebM re-encode failed for ${file}: ${e.message}; keeping the original.`); }
  }
  return { file, ext, kind, url: `/uploads/${k.dir ? k.dir + '/' : ''}${file}` };
}

// Remove a stored file given its /uploads URL (ignores anything outside the upload folder).
function removeUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const abs = path.join(UPLOAD_DIR, path.normalize(url.slice('/uploads/'.length)));
  if (abs.startsWith(UPLOAD_DIR + path.sep)) fs.rm(abs, () => {});
}

module.exports = { KINDS, MIME_EXT, AUDIO, sniff, store, removeUrl, hasFfmpeg, AssetError, MB };
