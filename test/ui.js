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
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const ctx = await br.newContext(opts);
    const p = await ctx.newPage();
    await p.addInitScript(() => { try { localStorage.setItem('dmFoldOpen', '1'); } catch { /* ignore */ } }); // DM cards start open in tests
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
  // Player tabs (Nov 14): Play, Sheet, Inventory, Journal, Misc; no Shops tab. Dice pool on top of Play.
  const tabNames = await ph.$$eval('#tabs [data-tab]', (bs) => bs.map((b) => b.dataset.tab).join());
  if (tabNames !== 'play,sheet,inventory,journal,misc') errors.push('phone tabs: ' + tabNames);
  // Symbols only, and the tab bar never scrolls sideways (Mike, Nov 16).
  const bar = await ph.$eval('#tabs', (t) => ({ fits: t.scrollWidth <= t.clientWidth + 1, text: [...t.querySelectorAll('button')].map((b) => b.querySelector('.tab-ico')?.textContent + '|' + b.getAttribute('aria-label')).join() }));
  if (!bar.fits) errors.push('phone tab bar scrolls sideways');
  if (!/^🎲\|Play,📜\|Sheet,/.test(bar.text)) errors.push('phone tabs should be symbols with a name label: ' + bar.text);
  if (await ph.isVisible('[data-skill]')) errors.push('skill buttons should be on the Sheet tab, not Play');
  await ph.click('#dicePool [data-die="6"][data-step="1"]');
  await ph.click('#dicePool [data-die="6"][data-step="1"]');
  await ph.click('#dicePool [data-die="20"][data-step="1"]');
  if ((await ph.textContent('#dieGo')).trim() !== 'Roll 2d6+1d20') errors.push('dice pool: ' + (await ph.textContent('#dieGo')));
  await ph.click('#dieGo');
  await ph.waitForFunction(() => /^2d6\+1d20 = \d+$/.test(document.querySelector('#dieOut')?.textContent || ''), null, { timeout: 3000 });
  // Journal holds Inbox, Map and Notes; Misc holds Logs, World, Legends and Bond.
  await ph.click('#tabs [data-tab="journal"]');
  await ph.click('#tabJournal .subtabs [data-tab="map"]');
  if (!(await ph.isVisible('#tabMap')) || await ph.isVisible('#tabInbox')) errors.push('journal map section did not open');
  await ph.click('#tabs [data-tab="misc"]');
  const misc = await ph.$$eval('#tabMisc .subtabs [data-tab]', (bs) => bs.map((b) => b.dataset.tab).join());
  if (misc !== 'logs,world,legends,bond') errors.push('misc sections: ' + misc);
  // Sheet: skills roll on tap; a class feature opens its description and activates after a 3 s hold.
  await ph.click('#tabs [data-tab="sheet"]');
  await ph.click('#tabSheet [data-skill]');
  if (await ph.$('#tabSheet [data-feat]')) {
    await ph.click('#tabSheet [data-feat]');
    const go = await ph.waitForSelector('#tabSheet [data-feat-go]');
    await go.scrollIntoViewIfNeeded();
    const bb = await go.boundingBox();
    await ph.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await ph.mouse.down(); await ph.waitForTimeout(800); await ph.mouse.up(); // too short: nothing happens
    await ph.waitForTimeout(300);
    if (/activated/.test(await ph.textContent('#tabSheet'))) errors.push('a short press activated a feature');
    await ph.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await ph.mouse.down(); await ph.waitForTimeout(3300); await ph.mouse.up();
    await ph.waitForFunction(() => /activated/.test(document.querySelector('#tabSheet').textContent), null, { timeout: 3000 }).catch(() => errors.push('holding Activate for 3 s did not activate the feature'));
  }
  // Items (Mike, Nov 16): players can't add items; the DM gives them from the Items tab.
  await ph.click('#tabs [data-tab="inventory"]');
  if (await ph.$('#invForm')) errors.push('the phone should not have an add-item form');
  await dm.click('[data-stab="items"]');
  await dm.waitForSelector('#itWho option', { state: 'attached', timeout: 3000 });
  await dm.fill('#itName', 'Rope');
  await dm.click('#itGive');
  await ph.waitForSelector('#tabInventory [data-item]', { timeout: 3000 }).catch(() => errors.push('the DM could not give an item from the Items tab'));
  await dm.waitForSelector('#itList .it-row', { timeout: 3000 }).catch(() => errors.push('the DM Items tab does not list the given item'));
  await ph.click('#tabs [data-tab="play"]');
  await dm.evaluate(() => socket.emit('dm:mode', { mode: 'social' }));
  await tv.waitForSelector('.vn', { timeout: 5000 });
  await dm.waitForTimeout(800);
  // Entering social mode pops up on the phone; Leave closes it.
  await ph.waitForSelector('.pop-scrim', { timeout: 5000 });
  await ph.click('[data-sp="leave"]');
  // Combat (Mike, Nov 16): no 3D map on phones; a combat pop-up sits at the top of the Play tab.
  await dm.evaluate(() => socket.emit('dm:mode', { mode: 'combat' }));
  await ph.waitForSelector('#combatPop:not([hidden])', { timeout: 5000 }).catch(() => errors.push('phone combat pop-up did not show'));
  if (!/Steel yourselves/.test(await ph.textContent('#combatPop'))) errors.push('combat pop-up should start with "Steel yourselves"');
  if (await ph.evaluate(() => document.querySelector('#tabPlay').firstElementChild.id) !== 'combatPop') errors.push('combat pop-up should be first in the Play tab');
  await dm.evaluate(() => socket.emit('dm:combat:start', {}));
  await ph.waitForFunction(() => /YOUR TURN|'s turn/.test(document.querySelector('#combatPop').textContent), null, { timeout: 5000 }).catch(() => errors.push('combat pop-up did not follow the turn'));
  if (await ph.$('#gameView .iso-layer, #isoPhone')) errors.push('phones should not show the 3D battle map');
  await dm.evaluate(() => socket.emit('dm:combat:end'));
  await dm.evaluate(() => socket.emit('dm:mode', { mode: 'exploration' }));
  await ph.waitForSelector('#combatPop[hidden]', { state: 'attached', timeout: 5000 }).catch(() => errors.push('combat pop-up did not close after combat'));
  // Settings: phone picks large text + color-blind palette; DM sets TV to high contrast.
  await ph.click('.settings-btn');
  await ph.click('label:has(input[name="me-text"][value="xl"])');
  await ph.click('label:has(input[name="me-palette"][value="cb"])');
  await ph.keyboard.press('Escape');
  const phAttr = await ph.evaluate(() => [document.documentElement.dataset.text, document.documentElement.dataset.palette]);
  if (phAttr.join() !== 'xl,cb') errors.push('phone settings not applied: ' + phAttr);
  // Tools column: « minimizes it; the edge grip drags it back out (a short drag snaps closed again).
  const toolsW = () => dm.evaluate(() => document.querySelector('#toolsCol').getBoundingClientRect().width);
  await dm.click('#toolsMin');
  await dm.waitForTimeout(500);
  if ((await toolsW()) > 2) errors.push('tools column did not minimize: ' + (await toolsW()));
  const gb = await dm.locator('#toolsGrip').boundingBox();
  const gx = gb.x + gb.width / 2, gy = gb.y + gb.height / 2;
  await dm.mouse.move(gx, gy); await dm.mouse.down(); await dm.mouse.move(gx + 40, gy, { steps: 4 }); await dm.mouse.up();
  await dm.waitForTimeout(500);
  if ((await toolsW()) > 2) errors.push('short drag should snap the tools closed');
  await dm.mouse.move(gx, gy); await dm.mouse.down(); await dm.mouse.move(gx + 300, gy, { steps: 8 }); await dm.mouse.up();
  await dm.waitForTimeout(500);
  if ((await toolsW()) < 300) errors.push('dragging the grip did not restore tools: ' + (await toolsW()));
  await dm.click('#toolsMin'); await dm.waitForTimeout(450); await dm.click('#toolsGrip');
  await dm.waitForTimeout(500);
  if ((await toolsW()) < 300) errors.push('clicking the grip did not restore tools');
  await dm.evaluate(() => socket.emit('dm:settings', { display: { palette: 'hc', motion: 'reduce' } }));
  await tv.waitForFunction(() => document.documentElement.dataset.palette === 'hc', null, { timeout: 3000 });
  // Animated portrait: WebM upload renders as one persistent <video> on the TV across state updates.
  const { spawnSync } = require('child_process');
  if (spawnSync('ffmpeg', ['-version']).status === 0) {
    const src = path.join(TMP, 'p.webm');
    spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=24', '-t', '1', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', src]);
    const id = await ph.evaluate(() => localStorage.tavernChar);
    const r = await fetch(`${B}/api/portrait/${id}`, { method: 'POST', headers: { 'content-type': 'video/webm' }, body: fs.readFileSync(src) });
    if (!r.ok) errors.push('webm portrait upload ' + r.status);
    await tv.waitForSelector('.party video.av-pc', { timeout: 5000 });
    await tv.evaluate(() => { window.__v = document.querySelector('.party video.av-pc'); });
    await dm.evaluate(() => socket.emit('dm:narrate', { text: 're-render' }));
    await tv.waitForTimeout(500);
    if (!(await tv.evaluate(() => document.querySelector('.party video.av-pc') === window.__v))) errors.push('portrait video was recreated on re-render');
  }
  if (SHOTS) for (const [n, p] of [['dm', dm], ['tv', tv], ['phone', ph]]) await p.screenshot({ path: `${SHOTS}/ui-${n}.png` });
  if (typeof global.extra === 'function') await global.extra({ dm, tv, ph, br, B });
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  if (errors.length) { console.error('UI errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('ui: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
