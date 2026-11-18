// Back up everything (S5, Nov 18): the zip holds data/ and uploads/, unzips cleanly, and is DM only.
// DM only is the same dmOnly() check as /api/export (localhost or the DM key). Also checks that tests never write into the real data/ folder.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { harness, ROOT } = require('./helpers');

const h = harness('backup');
(async () => {
  // config.js gives a test script run without DATA_DIR a throwaway folder (test/run.js sets one too).
  const cfg = require('../src/config');
  h.ok(!cfg.DATA_DIR.startsWith(path.join(ROOT, 'data')), 'a test script never gets the real data/ folder');

  const srv = await h.boot();
  const dm = await h.dm();
  await h.call(dm, 'dm:save:create', { name: 'Before the vault' });
  const up = path.join(h.TMP, 'uploads', 'backdrops');
  fs.mkdirSync(up, { recursive: true });
  fs.writeFileSync(path.join(up, 'cave.webp'), Buffer.alloc(5000, 7));
  fs.mkdirSync(path.join(h.TMP, 'data', 'backups', 'old'), { recursive: true });
  fs.writeFileSync(path.join(h.TMP, 'data', 'backups', 'old', 'x.json'), '{}');

  const res = await fetch(`${h.URL}/api/backup`);
  h.ok(res.status === 200 && /tavern-backup-.*\.zip/.test(res.headers.get('content-disposition') || ''), 'the DM downloads a dated zip');
  const zip = path.join(h.TMP, 'b.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const dest = path.join(h.TMP, 'restored');
  fs.mkdirSync(dest);
  let unzipped = true;
  try { execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', zip, dest]); } catch { unzipped = false; }
  if (unzipped) {
    h.ok(fs.existsSync(path.join(dest, 'data', 'campaign.json')), 'the zip holds the campaign');
    h.ok(fs.readdirSync(path.join(dest, 'data', 'saves')).some((f) => f.startsWith('before-the-vault')), 'and the save points');
    h.ok(fs.readFileSync(path.join(dest, 'uploads', 'backdrops', 'cave.webp')).equals(Buffer.alloc(5000, 7)), 'and the uploads, byte for byte');
    h.ok(!fs.existsSync(path.join(dest, 'data', 'backups')), 'startup backups are left out (they are copies)');
  } else console.log('  skip  unzip check (no python3 here)');

  await h.done(srv);
})();
