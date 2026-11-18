// Browser test for Mike's Nov 18 batch: the TV landing page and "You have joined the game!", Start game on the
// first phone, the window mover and movable tabs, cascade, the mode's window on top (Battle Window), the DM's
// NPC emotion wheel, Show/Hide toggles, Group Map View on the phone and the TV count, translated NPC lines.
// Usage: node test/nov18-ui.js  (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

const PORT = 4600 + Math.floor(Math.random() * 300);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-n18-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '1', TEST_MODE: '0', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(B + url);
    return p;
  };
  const join = async (ph, name) => {
    await ph.waitForSelector('#newBtn:visible, [data-cls]:visible');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.waitForSelector('[data-cls]:visible');
    await ph.fill('#name', name);
    await ph.click('[data-cls]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('#gameView:not([hidden])', { timeout: 5000 });
  };
  try {
    // ----- landing page -----
    const tv = await page('/screen', { viewport: { width: 1280, height: 720 } });
    await tv.waitForSelector('.lb-title');
    ok((await tv.textContent('.lb-title')).trim() === 'Landing Page', 'the TV opens on the Landing Page');
    ok((await tv.$$('.lb-slot')).length === 3 && (await tv.$$eval('.lb-join', (e) => e.map((x) => x.textContent))).every((t) => t === 'Join Game'), 'three blank slots, each saying Join Game');
    ok(!(await tv.$eval('.lb-start', (e) => e.classList.contains('ready'))), 'Start game is faded until someone joins');
    await shot(tv, 'tv-landing-empty.png');

    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    const { room } = await (await fetch(B + '/api/join-info')).json();
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await join(ph, 'Thorn');
    await ph.waitForSelector('.lobby-pop', { timeout: 4000 });
    ok((await ph.textContent('.lobby-pop h3')).includes('You have joined the game!'), 'the phone says You have joined the game!');
    await shot(ph, 'phone-joined.png');
    await ph.click('[data-lobby-ok]');
    await ph.waitForSelector('.lobby-pop', { state: 'detached', timeout: 3000 });
    await tv.waitForSelector('.lb-start.ready', { timeout: 4000 });
    ok((await tv.textContent('.lb-slot.filled .lb-join')).includes('Thorn'), 'the first slot shows the new player');
    await shot(tv, 'tv-landing-ready.png');
    ok(await ph.isVisible('[data-lobby-start]'), 'the first player gets Start game on the phone');
    await ph.click('[data-lobby-start]');
    await tv.waitForSelector('.lb-title', { state: 'detached', timeout: 5000 });
    ok(!!(await tv.$('.wm-tv')), 'Start game takes the TV straight to the world map');

    // ----- Group Map View -----
    await ph.waitForSelector('[data-mapview]');
    ok((await ph.textContent('[data-mapview]')).includes('Close Map'), 'with the map up the phone offers Close Map');
    await ph.click('[data-mapview]'); // one seated player: closes at once
    await ph.waitForFunction(() => document.querySelector('[data-mapview]')?.textContent.includes('Group Map View'), null, { timeout: 4000 });
    await tv.waitForSelector('.wm-tv', { state: 'detached', timeout: 4000 });
    ok(true, 'everyone pressing Close Map gives the TV back');
    const ph2 = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await join(ph2, 'Wren');
    await ph.waitForFunction(() => /\/ 2|everyone/.test(document.querySelector('[data-mapview]')?.textContent || ''), null, { timeout: 4000 });
    await ph.click('[data-mapview]');
    await tv.waitForSelector('.lb-mapcount', { timeout: 4000 });
    ok((await tv.textContent('.lb-mapcount')).includes('1 / 2'), 'the TV shows how many want the map');
    await shot(tv, 'tv-map-count.png');
    await shot(ph, 'phone-mapview.png');
    await ph2.click('[data-mapview]');
    await tv.waitForSelector('.wm-tv', { timeout: 4000 });
    ok(true, 'when every phone presses it the TV shows the map');

    // ----- DM: window mover, tabs, cascade -----
    await dm.waitForSelector('[data-stab="rolls"]');
    await dm.click('[data-stab="rolls"]');
    await dm.click('#reorderBtn');
    await dm.waitForSelector('body.reorder-on');
    const before = await dm.evaluate(() => window.dmCardOrder.keys('rolls'));
    const cards = dm.locator('#toolsCol > .card[data-tab="rolls"]:not([hidden]) > h3');
    await cards.nth(1).dragTo(cards.nth(0), { targetPosition: { x: 10, y: 4 } });
    const after = await dm.evaluate(() => window.dmCardOrder.keys('rolls'));
    ok(before.length > 1 && after[0] === before[1], `the window mover drags a window up (${before.slice(0, 2)} → ${after.slice(0, 2)})`);
    const tabsBefore = await dm.evaluate(() => window.dmCardOrder.tabs('play'));
    await dm.locator('[data-stab="logs"]').dragTo(dm.locator('[data-stab="rolls"]'), { targetPosition: { x: 4, y: 4 } });
    const tabsAfter = await dm.evaluate(() => window.dmCardOrder.tabs('play'));
    ok(tabsAfter.indexOf('logs') < tabsBefore.indexOf('logs'), 'a tab drags to a new place too');
    await dm.click('#reorderBtn');
    const titles = dm.locator('#toolsCol > .card[data-tab="rolls"]:not([hidden]) > h3');
    await titles.nth(0).click();
    if (await dm.$eval('#toolsCol > .card[data-tab="rolls"]:not([hidden])', (c) => c.classList.contains('folded'))) await titles.nth(0).click();
    await titles.nth(1).click();
    const open = await dm.$$eval('#toolsCol > .card[data-tab="rolls"]:not([hidden])', (cs) => cs.filter((c) => !c.classList.contains('folded')).length);
    ok(open === 1, `cascade keeps one window open (${open})`);
    ok(await dm.evaluate(() => { const c = document.getElementById('toolsCol'); return c.scrollHeight <= c.clientHeight + 2; }), 'the tools column does not scroll');
    await shot(dm, 'dm-cascade.png');

    // ----- mode windows -----
    await dm.click('button[data-mode="combat"]');
    await dm.waitForFunction(() => document.querySelector('[data-stab="combat"]')?.classList.contains('on'), null, { timeout: 4000 });
    ok((await dm.textContent('[data-stab="combat"]')).includes('Battle Window'), 'Combat is now the Battle Window and opens on Combat');
    ok(await dm.$eval('[data-stab="combat"]', (b) => b.classList.contains('mode-top')), 'the Battle Window tab sits on top');
    await dm.click('button[data-mode="exploration"]');
    await dm.waitForFunction(() => document.querySelector('[data-stab="scene"]')?.classList.contains('on'), null, { timeout: 4000 });
    ok(true, 'Explore opens the Scene window on top');

    // ----- NPC emotion wheel and translation -----
    await dm.click('button[data-mode="social"]');
    await dm.waitForFunction(() => window.socket && document.querySelector('button[data-mode="social"]').classList.contains('on'), null, { timeout: 5000 });
    await dm.evaluate(() => new Promise((r) => window.socket.emit('dm:convo:start', { ids: ['pool-albert'] }, r)));
    await dm.waitForSelector('#convoLive:not([hidden]) #emotions .convo-wheel', { timeout: 5000 });
    ok(!!(await dm.$('#emotions .convo-wheel .wheel-emo[data-emo="angry"]')), 'the DM has the players\' emotion wheel for NPCs');
    await dm.click('#emotions .wheel-emo[data-emo="angry"] .wheel-lbl', { force: true });
    await dm.waitForFunction(() => document.querySelector('#emotions .wheel-emo[data-emo="angry"]').classList.contains('on'), null, { timeout: 3000 });
    ok(true, 'tapping a segment sets the NPC emotion');
    await shot(dm, 'dm-npc-wheel.png');
    const s = await dm.evaluate(() => window.socket && true);
    const me = await ph.evaluate(() => localStorage.tavernChar);
    // Send the languages and wait for the state that carries them (not a fixed pause).
    await dm.evaluate(([id]) => new Promise((r) => {
      const on = (st) => { if (JSON.stringify(st.players?.find((p) => p.id === id) || {}).includes('Gnollish')) { window.socket.off('state', on); r(); } };
      window.socket.on('state', on);
      setTimeout(() => { window.socket.off('state', on); r(); }, 3000);
      window.socket.emit('dm:sheet', { id, languages: ['Common', 'Gnollish'] });
    }), [me]);
    await dm.evaluate(() => window.socket.emit('dm:say', { text: 'Leave the bridge before the river takes it.', lang: 'Gnollish' }));
    await ph.waitForSelector('.tr-note', { timeout: 4000 });
    ok((await ph.textContent('.tr-note')).includes('Leave the bridge'), 'the player who knows Gnollish gets the translation');
    await shot(ph, 'phone-translation.png');
    ok(!(await ph2.$('.tr-note')), 'the other player gets no translation');
    ok(s, 'DM socket ready');

    // ----- Show/Hide toggle -----
    const qr = dm.locator('.show-toggle').first();
    const t0 = await qr.textContent();
    await qr.click();
    await dm.waitForFunction((t) => document.querySelector('.show-toggle')?.textContent !== t, t0, { timeout: 3000 }).catch(() => {});
    const t1 = await qr.textContent();
    ok(/Show/.test(t0) && /Hide/.test(t1), `a Show button flips to Hide (${t0.trim()} → ${t1.trim()})`);
  } catch (e) {
    console.error(e);
    failures++;
  }
  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the server may still be flushing */ }
  console.log(failures ? `\nnov18-ui: ${failures} failing` : 'nov18-ui: all passed');
  process.exit(failures ? 1 : 0);
})();
