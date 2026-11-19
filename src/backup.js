// Back up everything (studio review S5, Mike Nov 18): one .zip of data/ and uploads/, so a laptop swap or a
// dead disk loses neither the campaign nor the art, music and maps. Save points hold only the campaign.
// Used by GET /api/backup (DM tile "Back up everything") and `npm run backup`.
// Restore: unzip into the game folder (it holds data/ and uploads/) while the game is stopped.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DATA_DIR, UPLOAD_DIR } = require('./config');

// Folders that are copies or caches, not campaign data.
const SKIP = new Set([path.join(DATA_DIR, 'backups')]);

function walk(dir, base, out) {
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of names) {
    const full = path.join(dir, d.name);
    if (SKIP.has(full)) continue;
    if (d.isDirectory()) walk(full, `${base}/${d.name}`, out);
    else if (d.isFile()) out.push({ full, name: `${base}/${d.name}` });
  }
  return out;
}
const files = () => [...walk(DATA_DIR, 'data', []), ...walk(UPLOAD_DIR, 'uploads', [])];

function dosTime(t) {
  const d = new Date(t);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Writes a standard zip (deflate, or stored when that is smaller, e.g. images and audio). One file in
// memory at a time. Returns { file, count, bytes }. `list` defaults to data/ and uploads/; each item is
// { name, full } (a file on disk) or { name, data } (a Buffer or string), so the story pack can reuse it.
function writeZip(target, list = files()) {
  const fd = fs.openSync(target, 'w');
  const central = [];
  let offset = 0;
  const put = (buf) => { fs.writeSync(fd, buf); offset += buf.length; };
  try {
    for (const f of list) {
      let raw;
      try { raw = f.data !== undefined ? Buffer.from(f.data) : fs.readFileSync(f.full); } catch { continue; } // removed while we read: skip it
      const deflated = zlib.deflateRawSync(raw);
      const store = deflated.length >= raw.length;
      const body = store ? raw : deflated;
      const name = Buffer.from(f.name, 'utf8');
      const crc = zlib.crc32(raw) >>> 0;
      const { time, date } = dosTime(f.full ? fs.statSync(f.full).mtimeMs : Date.now());
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
      head.writeUInt16LE(store ? 0 : 8, 8); head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12);
      head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22);
      head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
      const at = offset;
      put(head); put(name); put(body);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(store ? 0 : 8, 10); c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14);
      c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24);
      c.writeUInt16LE(name.length, 28); c.writeUInt32LE(at, 42);
      central.push(Buffer.concat([c, name]));
    }
    const start = offset;
    for (const c of central) put(c);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16);
    put(end);
  } finally { fs.closeSync(fd); }
  return { file: target, count: central.length, bytes: offset };
}

const fileName = () => `tavern-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.zip`;

module.exports = { files, writeZip, fileName };
