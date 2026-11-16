// Saves never crash the server: a locked file (Windows EPERM/EBUSY) is retried, and a failed
// debounced write is logged and tried again until it lands.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'save-retry-'));
process.env.UPLOAD_DIR = path.join(process.env.DATA_DIR, 'up');
const store = require('../src/store');

let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const warn = console.warn;
const warnings = [];
console.warn = (m) => warnings.push(m);

(async () => {
  const dir = process.env.DATA_DIR;

  // A rename that fails twice with EPERM still saves.
  const rename = fs.renameSync;
  let busy = 2;
  fs.renameSync = (a, b) => { if (busy-- > 0) { const e = new Error('locked'); e.code = 'EPERM'; throw e; } return rename(a, b); };
  const f1 = path.join(dir, 'a.json');
  store.writeJson(f1, { x: 1 });
  ok(JSON.parse(fs.readFileSync(f1, 'utf8')).x === 1, 'a briefly locked file is saved after a retry');
  // Other errors are not retried.
  fs.renameSync = () => { const e = new Error('nope'); e.code = 'ENOSPC'; throw e; };
  let threw = false;
  try { store.writeJson(f1, { x: 2 }); } catch (e) { threw = e.code === 'ENOSPC'; }
  ok(threw, 'a full disk is reported, not retried forever');
  fs.renameSync = rename;

  // A debounced save into a missing folder does not throw, and lands once the folder exists.
  const sub = path.join(dir, 'later');
  const f2 = path.join(sub, 'b.json');
  let n = 0;
  const s = store.saver(f2, () => ({ n: ++n }), 20);
  s.schedule();
  await wait(80);
  ok(!fs.existsSync(f2) && s.pending(), 'a failed save waits to try again instead of crashing');
  ok(warnings.length === 1 && /Could not save b\.json/.test(warnings[0]), 'the failure is logged once');
  fs.mkdirSync(sub);
  await wait(2100);
  ok(fs.existsSync(f2) && !s.pending(), 'the retry saves the file once the disk is writable again');
  ok(warnings.some((w) => /Saved b\.json again/.test(w)), 'recovery is logged');
  ok(s.flush() === true, 'flush writes now and reports success');
  ok(store.saver(path.join(dir, 'nope', 'c.json'), () => ({})).flush() === false, 'a failed flush reports false instead of throwing');

  console.warn = warn;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `save-retry: ${fails} failed` : 'save-retry: all passed');
  process.exit(fails ? 1 : 0);
})();
