// Process-wide settings. Everything can be overridden with env vars.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const config = {
  ROOT,
  PORT: Number(process.env.PORT) || 3000,
  DM_KEY: process.env.DM_KEY || crypto.randomBytes(3).toString('hex'),
  // Co-DM runs atmosphere (backdrops, effects, music, SFX) from their own device; no game controls.
  CODM_KEY: process.env.CODM_KEY || crypto.randomBytes(3).toString('hex'),
  // HTTPS for phones (mic + speech need a secure origin). HTTPS=0 turns it off.
  HTTPS: process.env.HTTPS !== '0',
  HTTPS_PORT: Number(process.env.HTTPS_PORT) || 3443,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')),
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads')),
};
config.PORTRAIT_DIR = path.join(config.UPLOAD_DIR, 'portraits');
config.ROSTER_FILE = path.join(config.DATA_DIR, 'characters.json');
fs.mkdirSync(config.PORTRAIT_DIR, { recursive: true });
fs.mkdirSync(config.DATA_DIR, { recursive: true });

module.exports = config;
