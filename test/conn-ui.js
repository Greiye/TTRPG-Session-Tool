// Browser test: when the laptop's server goes away, the TV, DM and phone pages show the
// "Reconnecting" pill, and it slides away once the server is back. Also checks the campaign
// saved on shutdown (same room code after the restart). Usage: node test/conn-ui.js (needs Playwright).
const { chromium, devices } = require('playwright');
const { harness } = require('./helpers');

const h = harness('conn-ui');
const { ok } = h;
(async () => {
  let srv = await h.boot();
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  try {
    const room = await h.room();
    const dm = await page('/dm', { viewport: { width: 1400, height: 900 } });
    const tv = await page('/screen', { viewport: { width: 1280, height: 720 } });
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('[data-cls]');
    const pages = { DM: dm, TV: tv, phone: ph };
    const shown = (p) => p.evaluate(() => !!document.querySelector('.conn-pill.on'));
    for (const [n, p] of Object.entries(pages)) ok(!(await shown(p)), `${n}: no pill while connected`);

    await h.stop(srv);
    for (const p of Object.values(pages)) await p.waitForSelector('.conn-pill.on', { timeout: 6000 }).catch(() => {});
    for (const [n, p] of Object.entries(pages)) ok(await shown(p), `${n}: pill slides in after the laptop drops`);
    const txt = await ph.evaluate(() => document.querySelector('.conn-pill')?.textContent);
    ok(/Reconnecting/.test(txt || ''), 'the pill says it is reconnecting');

    srv = await h.boot();
    ok((await h.room()) === room, 'the room code survives a restart (saved on shutdown)');
    // Socket.IO's reconnect backoff, then the 1.2 s "Back" message.
    for (const p of Object.values(pages)) await p.waitForSelector('.conn-pill.on', { state: 'detached', timeout: 15000 }).catch(() => p.waitForFunction(() => !document.querySelector('.conn-pill.on'), null, { timeout: 1000 }).catch(() => {}));
    for (const [n, p] of Object.entries(pages)) ok(!(await shown(p)), `${n}: pill slides away once reconnected`);
    ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    ok(false, `test crashed: ${e.message}`);
  } finally {
    await br.close();
    await h.done(srv);
  }
})();
