// npm run backup [-- <folder>]: zips data/ and uploads/ into one file (default: backups/ in the game folder).
// Safe while the game runs; stop the game first for a fully settled copy.
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../src/config');
const backup = require('../src/backup');

const dir = path.resolve(process.argv[2] || path.join(ROOT, 'backups'));
fs.mkdirSync(dir, { recursive: true });
const out = backup.writeZip(path.join(dir, backup.fileName()));
console.log(`Backed up ${out.count} files (${(out.bytes / 1048576).toFixed(1)} MB) to ${out.file}`);
console.log('Restore: stop the game, unzip into the game folder (it holds data/ and uploads/), start again.');
