// DM controller (item 28), driven by a simulated Standard Gamepad: the page's navigator.getGamepads()
// is replaced with a fake pad the test presses. Usage: node test/gamepad.js  (needs Playwright)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-pad-'));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) failures++; };

// Runs in the page before any script: window.__pads is what getGamepads() returns.
function fakePads() {
  const mk = (index, id, mapping) => ({ index, id, mapping, connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  window.__pads = [null, null, null, null];
  navigator.getGamepads = () => window.__pads;
  window.__plug = (index, id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping = 'standard', held = []) => {
    const pad = mk(index, id, mapping);
    for (const b of held) pad.buttons[b] = { pressed: true, touched: true, value: 1 };
    window.__pads[index] = pad;
    window.dispatchEvent(new Event('gamepadconnected'));
  };
  window.__unplug = (index) => { window.__pads[index] = null; window.dispatchEvent(new Event('gamepaddisconnected')); };
  window.__set = (index, b, on) => { window.__pads[index].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; };
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const dm = await (await br.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errors = [];
  dm.on('pageerror', (e) => errors.push(e.message));
  await dm.addInitScript(fakePads);
  await dm.goto(B + '/dm');
  await dm.waitForFunction(() => window.socket && document.querySelector('[data-emo].on'));

  const S = () => dm.evaluate(() => window.__state());
  const frames = (n = 4) => dm.evaluate((k) => new Promise((res) => { const f = () => (k-- > 0 ? requestAnimationFrame(f) : res()); f(); }), n);
  const hold = async (b, pad = 0) => { await dm.evaluate(([p, x]) => window.__set(p, x, true), [pad, b]); await frames(); };
  const release = async (b, pad = 0) => { await dm.evaluate(([p, x]) => window.__set(p, x, false), [pad, b]); await frames(); };
  const tap = async (b, pad = 0) => { await hold(b, pad); await release(b, pad); };
  const until = async (fn, arg, ms = 2000) => dm.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const emotion = (e) => until((x) => window.__state().social.npc.emotion === x, e);
  const mode = (m) => until((x) => window.__state().mode === x, m);

  // State is module-private; mirror it for the test.
  await dm.evaluate(() => { window.__state = () => window.__last; socket.on('state', (s) => { window.__last = s; }); socket.emit('dm:narrate', { text: 'pad test' }); });
  await until(() => !!window.__last);

  // Connect
  await dm.evaluate(() => window.__plug(0));
  ok(await until(() => /Xbox Wireless Controller/.test(document.querySelector('#padStatus').textContent)), 'status shows the connected pad');
  ok(!(await dm.evaluate(() => /STANDARD|Vendor/.test(document.querySelector('#padStatus').textContent))), 'status drops the vendor suffix');

  // Mode switching: RB forward, LB back, both wrap.
  ok((await S()).mode === 'exploration', 'starts in exploration');
  await tap(5); ok(await mode('combat'), 'RB: exploration to combat');
  await tap(5); ok(await mode('social'), 'RB: combat to social');
  await tap(5); ok(await mode('exploration'), 'RB wraps to exploration');
  await tap(4); ok(await mode('social'), 'LB wraps back to social');

  // Social: face buttons and d-pad.
  await tap(1); ok(await emotion('happy'), 'B sets emotion 2 (happy)');
  await tap(2); ok(await emotion('angry'), 'X sets emotion 3 (angry)');
  await tap(3); ok(await emotion('sad'), 'Y sets emotion 4 (sad)');
  await tap(0); ok(await emotion('neutral'), 'A sets emotion 1 (neutral)');
  await tap(12); ok(await emotion('smug'), 'D-pad up wraps to the last emotion');
  await tap(13); ok(await emotion('neutral'), 'D-pad down wraps to the first');
  await tap(13); await emotion('happy'); await tap(13); await emotion('angry'); await tap(13); await emotion('sad'); await tap(13);
  ok(await emotion('fearful'), 'D-pad reaches emotions 5-8');
  ok(await until(() => document.querySelector('button[data-emo="fearful"]').classList.contains('on')), 'DM emotion button follows the pad');
  // Two quick d-pad presses, faster than the server round trip, still move two steps.
  await dm.evaluate(() => new Promise((res) => {
    const step = (on, next) => { window.__set(0, 13, on); requestAnimationFrame(() => requestAnimationFrame(next)); };
    step(true, () => step(false, () => step(true, () => step(false, res))));
  }));
  ok(await emotion('suspicious'), 'two fast d-pad presses move two emotions');

  // Holding a button does not repeat.
  const logLen = (await S()).log.length;
  await hold(5); await frames(30);
  ok((await S()).mode === 'exploration', 'held RB changes mode once');
  await dm.waitForTimeout(200);
  ok((await S()).log.length === logLen + 1, 'held RB sends one event');
  await release(5);
  await tap(4); await mode('social');

  // Start speaks the line.
  await dm.fill('#line', 'Well met, travellers.');
  await tap(9);
  ok(await until(() => window.__state().social.line.text === 'Well met, travellers.'), 'Start speaks the dialogue line');
  ok((await dm.inputValue('#line')) === '', 'Start clears the dialogue box');
  const n = (await S()).log.length;
  await tap(9); await dm.waitForTimeout(200);
  ok((await S()).log.length === n, 'Start with an empty box does nothing');

  // Combat: A advances the turn.
  await dm.evaluate(() => { socket.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 12 }); socket.emit('dm:enemy:add', { name: 'Wolf', hp: 9, ac: 12 }); });
  await tap(5); await mode('exploration'); await tap(5); await mode('combat');
  const before = (await S()).log.length;
  await tap(0); await dm.waitForTimeout(200);
  ok(errors.length === 0 && (await S()).log.length === before, 'A before combat starts does nothing');
  await dm.evaluate(() => socket.emit('dm:combat:start', {}));
  ok(await until(() => window.__state().combat.active && window.__state().combat.order.length >= 2), 'combat started with two creatures');
  const t0 = (await S()).combat.turn;
  await tap(0);
  ok(await until((t) => window.__state().combat.turn !== t, t0), 'A advances the turn in combat');
  const emo = (await S()).social.npc.emotion;
  await tap(1); await tap(12); await dm.waitForTimeout(200);
  ok((await S()).social.npc.emotion === emo, 'emotion buttons are ignored outside social');

  // Unplug and replug.
  await dm.evaluate(() => window.__unplug(0));
  ok(await until(() => document.querySelector('#padStatus').textContent === ''), 'status clears on unplug');
  // A pad plugged in with a button already held must not fire on connect.
  const m0 = (await S()).mode;
  await dm.evaluate(() => window.__plug(0, undefined, 'standard', [5]));
  await frames(10); await dm.waitForTimeout(200);
  ok((await S()).mode === m0, 'a button held while plugging in does not fire');
  await release(5);
  await tap(5); ok(await mode('social'), 'pad works again after replug');

  // A non-standard device in slot 0 (wheel, HOTAS, unmapped pad) must not block or misfire.
  await dm.evaluate(() => { window.__unplug(0); window.__plug(0, 'Generic USB Joystick', ''); window.__plug(1); });
  await frames();
  ok(await until(() => /Xbox/.test(document.querySelector('#padStatus').textContent)), 'status names the standard pad, not the joystick');
  await tap(5, 1); ok(await mode('exploration'), 'standard pad in slot 1 drives the page');
  const m1 = (await S()).mode;
  await tap(5, 0); await dm.waitForTimeout(200);
  ok((await S()).mode === m1, 'non-standard device is ignored');

  await dm.evaluate(() => window.__unplug(1));
  ok(await until(() => /Generic USB Joystick: layout not supported/.test(document.querySelector('#padStatus').textContent)), 'a lone non-standard device is reported as unsupported');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures ? `\ngamepad: ${failures} failing` : 'gamepad: all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
