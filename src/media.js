// Backdrop and audio library (the root of uploads/). Files on disk are the source of truth.
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('./config');
const { KINDS, AUDIO } = require('./assets');

const BUILTIN_SFX = ['thunder', 'hit', 'magic', 'roar', 'bell', 'door', 'clash'];
const MIX_MAX = 6; // ambience layers that can play at once on the soundboard
const LIB_EXT = [...new Set([...KINDS.backdrop.ext, ...KINDS.audio.ext])];

function mediaItem(file) {
  const ext = path.extname(file).slice(1);
  return { id: file, url: `/uploads/${file}`, video: ext === 'mp4' || ext === 'webm', audio: AUDIO.includes(ext), name: file.replace(/^\w+-/, '').replace(/\.\w+$/, '') };
}
function scanLibrary() {
  const backdrops = [];
  const audio = [];
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (!LIB_EXT.includes(path.extname(f).slice(1)) || !fs.statSync(path.join(UPLOAD_DIR, f)).isFile()) continue;
    const item = mediaItem(f);
    (item.audio ? audio : backdrops).push(item);
  }
  return { backdrops, audio };
}

module.exports = { BUILTIN_SFX, MIX_MAX, mediaItem, scanLibrary };
