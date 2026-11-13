// Shared animation helpers (public/anim.js): every entrance is in the library, runs through one
// place, staggers in order, and collapses to a short fade when reduce motion is on.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { harness } = require('./helpers');
const h = harness('anim');
const { ok } = h;

function load(reduce) {
  const win = { Settings: { reducedMotion: () => reduce } };
  const ctx = { window: win, document: {}, matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'anim.js'), 'utf8'), ctx);
  return win.Anim;
}

// A fake element that records each Web Animations call.
const fakeEl = (log) => ({ animate: (frames, opts) => { log.push({ frames, opts }); return { finished: Promise.resolve() }; } });

(async () => {
  const A = load(false);
  for (const n of ['unfold', 'reveal', 'fade', 'pop', 'slideUp']) ok(A.names.includes(n), `animation "${n}" is in the shared library`);

  const log = [];
  await A.play(fakeEl(log), 'unfold', null);
  ok(log.length === 1 && log[0].opts.duration === 700, 'unfold runs once at its own length');
  ok(/rotateX\(90deg\)/.test(log[0].frames[0].transform) && log[0].frames[0].transformOrigin === 'top center', 'unfold turns in from the top edge, like paper');

  const big = [];
  await A.play(fakeEl(big), 'unfold', { intensity: 2 });
  ok(/rotateX\(90deg\)/.test(big[0].frames[0].transform), 'unfold angle is capped at edge-on (90deg), however large the intensity');

  const slow = [];
  await A.play(fakeEl(slow), 'fade', { anim: { speed: 2 } });
  ok(slow[0].opts.duration === 150, 'a speed profile of 2 halves the time');

  const staggered = [];
  await A.stagger([fakeEl(staggered), fakeEl(staggered), fakeEl(staggered)], 'reveal', null, 100);
  ok(staggered.map((c) => c.opts.delay).join() === '0,100,200', 'stagger starts each element one gap after the last');

  const quiet = load(true);
  const r = [];
  await quiet.play(fakeEl(r), 'unfold', null);
  ok(r.length === 1 && r[0].opts.duration === 150 && r[0].frames.length === 2 && r[0].frames[0].transform === undefined, 'reduce motion collapses unfold to a short fade');
  const rs = [];
  await quiet.stagger([fakeEl(rs), fakeEl(rs)], 'reveal', null, 100);
  ok(rs.every((c) => !c.opts.delay && c.opts.duration === 150), 'reduce motion skips the stagger delay');

  await h.done(null);
})();
