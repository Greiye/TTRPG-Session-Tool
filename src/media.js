// Uploaded media library (backdrops, music, SFX). Files on disk are the source of truth.
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('./config');

const MEDIA_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/flac': 'flac',
};
const AUDIO_EXT = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'weba', 'flac'];
const BUILTIN_SFX = ['thunder', 'hit', 'magic', 'roar', 'bell'];

function mediaItem(file) {
  const ext = path.extname(file).slice(1);
  return { id: file, url: `/uploads/${file}`, video: ext === 'mp4' || ext === 'webm', audio: AUDIO_EXT.includes(ext), name: file.replace(/^\w+-/, '').replace(/\.\w+$/, '') };
}
function scanLibrary() {
  const backdrops = [];
  const audio = [];
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (!Object.values(MEDIA_TYPES).includes(path.extname(f).slice(1))) continue;
    const item = mediaItem(f);
    (item.audio ? audio : backdrops).push(item);
  }
  return { backdrops, audio };
}

module.exports = { MEDIA_TYPES, AUDIO_EXT, BUILTIN_SFX, mediaItem, scanLibrary };
