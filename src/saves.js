// Save points and startup backups (item 1). The live campaign already autosaves (store.js);
// this adds named snapshots the DM can return to, and a rolling backup taken at each start.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { writeJson, readJson } = require('./store');

const SAVE_DIR = path.join(DATA_DIR, 'saves');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_BACKUPS = 8;
fs.mkdirSync(SAVE_DIR, { recursive: true });

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const fileOf = (id) => path.join(SAVE_DIR, `${slug(id)}.json`);

let cache = null;
const list = () => (cache ??= scan());
function scan() {
  return fs.readdirSync(SAVE_DIR).filter((f) => f.endsWith('.json')).map((f) => {
    const s = readJson(path.join(SAVE_DIR, f));
    return s && { id: f.slice(0, -5), name: s.name, savedAt: s.savedAt, scene: s.campaign?.scene?.title, party: (s.campaign?.party || []).length };
  }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
// data: { campaign: store.snapshot(...), characters: roster without connection fields }
function create(name, data) {
  const id = slug(name) || `save-${Date.now().toString(36)}`;
  cache = null;
  writeJson(fileOf(id), { name: String(name || id).slice(0, 60), savedAt: new Date().toISOString(), ...data });
  return id;
}
const read = (id) => readJson(fileOf(id));
function remove(id) { cache = null; try { fs.unlinkSync(fileOf(id)); return true; } catch { return false; } }

// Copy the data files as they were when the server started, so a bad session can be rolled back by hand.
function backupOnStart() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) return null;
  const dir = path.join(BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(DATA_DIR, f), path.join(dir, f));
  const old = fs.readdirSync(BACKUP_DIR).sort().reverse().slice(KEEP_BACKUPS);
  for (const d of old) fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
  return dir;
}

module.exports = { list, create, read, remove, backupOnStart, SAVE_DIR, BACKUP_DIR };
