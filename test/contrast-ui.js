// Browser test (Mike, Nov 22): no text too close to the colour behind it, on the DM page (every mode and
// Planning), the TV, a phone in game and the co-DM page. It started with the world map's Road cards: dark
// parchment ink on a near-black card. The scenario seeder fills the table (party, world map, town, dungeon,
// shop, creatures) and two road cards are drawn, so the lists have rows to check. Hidden tabs and closed
// pop-ups are checked too (computed colours do not need layout). See test/contrast-audit.js.
// Usage: node test/contrast-ui.js (needs Playwright).
const { chromium, devices } = require('playwright');
const { harness } = require('./helpers');
const { contrastAudit } = require('./contrast-audit');
const { seed } = require('../tools/scenario');

const MIN = 4.5; // WCAG AA for body text
const h = harness('contrast-ui');

(async () => {
  const srv = await h.boot({ DM_KEY: '', CODM_KEY: '' });
  const br = await chromium.launch();
  try {
    await seed(h.URL);
    const dm = await h.dm();
    dm.emit('dm:mode', { mode: 'exploration' });
    dm.emit('dm:worldmap:draw', {});
    dm.emit('dm:worldmap:draw', {});
    await h.until(() => dm.last?.mode === 'exploration' && dm.last?.worldMap?.cards?.length >= 2);

    const errors = [];
    const page = async (url, opts) => {
      const p = await (await br.newContext(opts)).newPage();
      p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
      await p.goto(h.URL + url);
      return p;
    };
    const audit = async (p, where) => {
      const found = await p.evaluate(`(${contrastAudit})(${MIN})`);
      for (const f of found) console.log(`        ${f.ratio}:1 ${f.fg} on ${f.bg}  ${f.sel}  "${f.text}"`);
      h.ok(!found.length, `${where}: all text reads at ${MIN}:1 or better${found.length ? ` (${found.length} too faint)` : ''}`);
    };
    const setMode = async (mode, waits) => {
      dm.emit('dm:mode', { mode });
      for (const [p, fn] of waits) await p.waitForFunction(fn, mode);
    };
    const dmOn = (m) => document.querySelector(`[data-mode="${m}"].on`);
    const tvOn = (m) => document.querySelector(`.stage.mode-${m}`);
    const phoneOn = (m) => m === 'combat' ? document.querySelector('#tabPlay.combat-quiet')
      : !document.querySelector('#tabPlay.combat-quiet') && document.querySelector('#say')?.placeholder === (m === 'social' ? 'Say something in character…' : 'What do you do?');

    // The case Mike reported: road card text on the world map page.
    const d = await page('/dm', { viewport: { width: 1500, height: 950 } });
    await d.waitForFunction(() => document.querySelectorAll('#wmCards .wm-card .wm-text').length >= 2);
    const card = await d.$eval('#wmCards .wm-card .wm-text', (el) => {
      const c = getComputedStyle(el).color, b = getComputedStyle(el.closest('.wm-card')).backgroundColor;
      return { c, b };
    });
    h.ok(card.c !== card.b, `road card text (${card.c}) is not the card colour (${card.b})`);

    const tv = await page('/screen', { viewport: { width: 1920, height: 1080 } });
    const room = await h.room();
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('[data-claim]');
    await audit(ph, 'phone join screen');
    await ph.click('[data-claim]');
    await ph.waitForSelector('#gameView:not([hidden])');

    for (const mode of ['exploration', 'social', 'combat']) {
      await setMode(mode, [[d, dmOn], [tv, tvOn], [ph, phoneOn]]);
      await audit(d, `DM page, ${mode}`);
      await audit(tv, `TV, ${mode}`);
      await audit(ph, `phone, ${mode}`);
    }
    await d.click('#planToggle');
    await d.waitForFunction(() => document.body.classList.contains('planning'));
    await audit(d, 'DM page, Planning');

    const co = await page('/codm', { viewport: { width: 1200, height: 900 } });
    await co.waitForSelector('.party .pc');
    await audit(co, 'co-DM page');

    h.ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  } finally {
    await br.close();
  }
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
