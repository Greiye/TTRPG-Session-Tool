// Browser smoke test: DM, TV and a phone load without JS errors and a phone can join.
// Usage: node test/ui.js  (needs Playwright, preinstalled in dev containers)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

const PORT = 3800 + Math.floor(Math.random() * 100);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-ui-'));
const SHOTS = process.env.SHOTS;
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const ctx = await br.newContext(opts);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${url}: ${m.text()}`));
    await p.goto(B + url);
    return p;
  };
  const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
  const tv = await page('/screen', { viewport: { width: 1280, height: 720 } });
  const { room } = await (await fetch(B + '/api/join-info')).json();
  const lost = await page('/play', { ...devices['iPhone 13'] });
  await lost.waitForSelector('#roomForm:not([hidden])', { timeout: 5000 });
  await lost.fill('#roomIn', room.toLowerCase());
  await lost.click('#roomForm button');
  await lost.waitForSelector('#roomForm[hidden]', { state: 'attached', timeout: 5000 });
  const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
  await ph.waitForSelector('[data-cls]');
  if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
  await ph.fill('#name', 'Thorn');
  await ph.click('[data-cls]');
  await ph.click('#joinBtn');
  await ph.waitForSelector('#gameView:not([hidden])', { timeout: 5000 });
  await ph.click('[data-skill]');
  await dm.evaluate(() => socket.emit('dm:mode', { mode: 'social' }));
  await tv.waitForSelector('.vn', { timeout: 5000 });
  await dm.waitForTimeout(800);
  if (SHOTS) for (const [n, p] of [['dm', dm], ['tv', tv], ['phone', ph]]) await p.screenshot({ path: `${SHOTS}/ui-${n}.png` });
  if (typeof global.extra === 'function') await global.extra({ dm, tv, ph, br, B });
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  if (errors.length) { console.error('UI errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
