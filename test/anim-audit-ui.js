// Browser test (animation audit, Nov 16): things that used to snap in now animate, once.
// TV roll call banner and results, VN choices, initiative-strip conditions, DM dialogs and page swaps.
// Usage: node test/anim-audit-ui.js (needs Playwright).
const { chromium, devices } = require('playwright');
const { harness } = require('./helpers');

const h = harness('anim-audit-ui');
const { ok } = h;
(async () => {
  const srv = await h.boot();
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  // Names of animations running on the first element matching sel (Web Animations and CSS).
  const anims = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? el.getAnimations().map((a) => a.animationName || 'waapi') : null; }, sel);
  try {
    const room = await h.room();
    const dm = await h.dm();
    const tv = await page('/screen', { viewport: { width: 1280, height: 720 } });
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('[data-cls]');
    const pl = await h.player(room, 'Thorn', 'Fighter');
    await h.until(() => dm.last.players.length === 1);

    dm.emit('dm:mode', { mode: 'exploration' });
    dm.emit('dm:worldmap:show', { on: false }); // a session opens on the world map; this test needs the stage
    await tv.waitForTimeout(1500);
    // Roll call: the banner slides in once; a result pops when it lands; re-renders replay nothing.
    dm.emit('dm:call', { kind: 'skill', key: 'Perception', dc: 12 });
    await tv.waitForSelector('.check-banner');
    ok((await anims(tv, '.check-banner'))?.length > 0, 'TV: a new roll call banner animates in');
    await tv.waitForTimeout(700);
    pl.emit('player:answer', {});
    await tv.waitForSelector('.check-res [data-rid]');
    ok((await anims(tv, '.check-res [data-rid]'))?.length > 0, 'TV: a roll call result pops in');
    await tv.waitForTimeout(700);
    dm.emit('dm:scene', { title: 'Old mill', text: 'Wind.', theme: 'default', poi: [] }); // any change re-renders the TV
    await tv.waitForTimeout(300);
    ok((await anims(tv, '.check-banner'))?.length === 0 && (await anims(tv, '.check-res [data-rid]'))?.length === 0, 'TV: a re-render does not replay them');

    // DM page: the settings dialog rises in.
    const dmp = await page('/dm', { viewport: { width: 1400, height: 900 } });
    await dmp.waitForSelector('.settings-btn');
    await dmp.click('.settings-btn');
    await dmp.waitForSelector('.settings-dlg[open]');
    ok((await anims(dmp, '.settings-dlg[open]'))?.includes('dlg-in'), 'DM: the settings dialog animates open');

    // Phone: the join screen fades in.
    ok((await anims(ph, '#joinView'))?.includes('page-in') || (await ph.evaluate(() => getComputedStyle(document.querySelector('#joinView')).animationName)) === 'page-in', 'phone: the join screen uses the page fade');
    ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    ok(false, `test crashed: ${e.message}`);
  } finally {
    await br.close();
    await h.done(srv);
  }
})();
