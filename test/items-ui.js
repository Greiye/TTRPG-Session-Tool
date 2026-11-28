// Browser test (Mike, Nov 18): item cards in the Items window (gallery and list, search), dragging a card onto a
// portrait gives it, the Item Designer makes a new card, and test mode seats a test player by default.
// Usage: node test/items-ui.js  (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

const PORT = 4900 + Math.floor(Math.random() * 300);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-it-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '1', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(B + url);
    return p;
  };
  try {
    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    await dm.waitForSelector('#testMode.on', { timeout: 5000 });
    ok((await dm.textContent('#testMode')).includes('on'), 'test mode is on by default');

    // A phone joins too, so a give shows up on a real pack.
    const { room } = await (await fetch(B + '/api/join-info')).json();
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('#newBtn:visible, [data-cls]:visible');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.waitForSelector('[data-cls]:visible');
    await ph.fill('#name', 'Thorn');
    await ph.click('[data-cls]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('#gameView:not([hidden])', { timeout: 5000 });

    await dm.click('[data-stab="items"]');
    // the Item cards window opens first (cascade)
    await dm.waitForSelector('#itLib .it-card', { timeout: 5000 });
    ok(await dm.$eval('#itParty', (e) => e.querySelectorAll('[data-give]').length === 2), 'the Items window shows a portrait for the test player and the phone');
    const total = await dm.$$eval('#itLib .it-card', (e) => e.length);
    ok(total > 20 && (await dm.$eval('#itLib', (e) => e.dataset.view)) === 'gallery', `sample item cards in a gallery (${total})`);
    // Nov 27: in a squeezed window the cards showed blank (rows shrank to a sliver). One column, full height.
    const fit = await dm.$eval('#itLib', (L) => { const c = L.querySelector('.it-card'); const n = c.querySelector('.it-name'); const cr = c.getBoundingClientRect(); const nr = n.getBoundingClientRect(); return { cols: getComputedStyle(L).gridTemplateColumns.split(' ').length, shown: nr.bottom <= cr.bottom + 0.5 && cr.height > 60 }; });
    ok(fit.cols === 1, 'the item cards sit in one column');
    ok(fit.shown, 'a card is tall enough to show its art and name');
    await shot(dm, 'dm-items-gallery.png');

    await dm.fill('#itSearch', 'potion');
    await dm.waitForFunction((n) => document.querySelectorAll('#itLib .it-card').length < n, total);
    const names = await dm.$$eval('#itLib .it-name', (e) => e.map((x) => x.textContent));
    ok(names.length >= 2 && names.every((n) => /potion|antitoxin/i.test(n)), `search narrows the cards (${names.join(', ')})`);
    await dm.click('[data-itview="list"]');
    ok((await dm.$eval('#itLib', (e) => e.dataset.view)) === 'list', 'the list view');
    await shot(dm, 'dm-items-list.png');
    await dm.click('[data-itview="gallery"]');

    // Big view: the cards move into a window over the map (the column is short), with the portraits.
    await dm.click('#itBig');
    await dm.waitForSelector('dialog.it-big[open] #itLib .it-card', { timeout: 3000 });
    ok(!!(await dm.$('dialog.it-big #itParty [data-give]')), 'the big view shows the cards and the portraits');
    await shot(dm, 'dm-items-big.png');

    // Drag a card onto the phone player's portrait.
    const pid = await ph.evaluate(() => localStorage.tavernChar);
    await dm.fill('#itSearch', 'healing 2d4');
    await dm.waitForFunction(() => document.querySelectorAll('#itLib .it-card').length === 1);
    const card = dm.locator('#itLib .it-card').first();
    await card.scrollIntoViewIfNeeded();
    const cb = await card.boundingBox();
    const tb = await dm.locator(`#itParty [data-give="${pid}"]`).boundingBox();
    await dm.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 3);
    await dm.mouse.down();
    await dm.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
    await dm.mouse.up();
    await dm.click(`#itParty [data-give="${pid}"]`);
    await dm.waitForFunction(() => /Potion of healing/.test(document.querySelector('#itList').textContent), null, { timeout: 4000 });
    await ph.click('[data-tab="inventory"]').catch(() => {});
    await ph.waitForFunction(() => /Potion of healing/.test(document.body.textContent), null, { timeout: 5000 });
    ok(true, 'dragging a card onto a portrait gives it to that player');
    ok(!!(await ph.$('.inv .inv-img')), 'the phone pack shows the card\'s icon');
    await shot(ph, 'phone-pack-card.png');

    // 🎁 on a card gives to the picked character (the test player here).
    const test = await dm.$eval('#itParty [data-give]:not([data-give="' + pid + '"])', (b) => b.dataset.give);
    await dm.click(`#itParty [data-give="${test}"]`);
    await dm.click('#itLib .it-card [data-it-give]');
    await dm.waitForFunction(() => /Potion of healing/.test(document.querySelector('#itList').textContent), null, { timeout: 4000 });
    ok(await dm.$eval('#itWho', (s) => s.value) === test, 'picking a portrait picks that character for the pack window too');
    ok(true, 'Give on a card gives it to the picked character');

    await dm.click('#itBigClose');
    await dm.waitForSelector('.it-cards #itLib', { state: 'attached', timeout: 3000 });
    ok(!(await dm.$('dialog.it-big[open]')), 'closing the big view puts the cards back');

    // Item Designer
    await dm.click('#itNew');
    await dm.waitForSelector('#idDlg[open]');
    await dm.fill('#idForm [name="name"]', 'Lantern of the Deep');
    await dm.selectOption('#idForm [name="kind"]', 'wondrous');
    await dm.selectOption('#idForm [name="rarity"]', 'rare');
    await dm.fill('#idForm [name="note"]', 'The flame leans toward secrets.');
    await dm.click('#idPropAdd');
    await dm.fill('.id-prop [data-k="name"]', 'Charges');
    await dm.fill('.id-prop [data-k="value"]', '3');
    ok((await dm.textContent('#idCard .it-name')) === 'Lantern of the Deep' && !!(await dm.$('#idCard .rar-rare')), 'the designer previews the card as you type');
    await shot(dm, 'dm-item-designer.png');
    await dm.click('#idSave');
    await dm.waitForFunction(() => /Saved/.test(document.querySelector('#idMsg').textContent));
    await dm.click('#idClose');
    await dm.waitForSelector('#idDlg:not([open])', { state: 'attached' });
    await dm.fill('#itSearch', 'lantern');
    await dm.waitForFunction(() => [...document.querySelectorAll('#itLib .it-name')].some((e) => e.textContent === 'Lantern of the Deep'), null, { timeout: 4000 });
    ok(true, 'the new item is a card in the Items window');

    // Test mode off takes the test player out.
    await dm.click('#testMode');
    await dm.waitForFunction(() => document.querySelectorAll('#itParty [data-give]').length === 1, null, { timeout: 4000 });
    ok((await dm.textContent('#testMode')).includes('off'), 'test mode off takes the test player out of the party');
  } catch (e) {
    console.error(e);
    failures++;
  }
  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the server may still be flushing */ }
  console.log(failures ? `\nitems-ui: ${failures} failing` : 'items-ui: all passed');
  process.exit(failures ? 1 : 0);
})();
