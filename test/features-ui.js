// Browser test for Planning › Modules (Mike, Nov 26): the Modules window lists every module with a switch;
// switching one off hides its tabs and windows on the DM page and its phone tab, switching every module off
// leaves the DM page, TV and phone without page errors, and All on brings it all back.
// Usage: node test/features-ui.js  (SHOTS=dir also saves screenshots)
const path = require('path');
const { chromium } = require('playwright');
const { harness, poll } = require('./helpers');
const F = require('../src/features');
const h = harness('features-ui');
const { ok, until, call } = h;
const SHOTS = process.env.SHOTS;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  await until(() => dm.last?.players.length === 1);

  const b = await chromium.launch();
  const errors = [];
  const open = async (url, opts) => {
    const p = await (await b.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.addInitScript(() => { try { localStorage.dmFoldOpen = '1'; } catch { /* private mode */ } });
    await p.goto(h.URL + url);
    return p;
  };
  try {
    const dmp = await open('/dm?key=dmkey', { viewport: { width: 1440, height: 900 } });
    const tv = await open('/screen', { viewport: { width: 1280, height: 720 } });
    const ph = await open(`/play?takeover=${a.me.id}&key=dmkey`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ph.waitForSelector('#tabs [data-tab="inventory"]');

    // Planning › Modules lists every module, all on.
    await dmp.waitForSelector('#planToggle');
    await dmp.click('#planToggle');
    await dmp.waitForSelector('[data-stab="modules"]:visible');
    await dmp.click('[data-stab="modules"]');
    await dmp.waitForSelector('#modCard:visible .mod-sw');
    const n = Object.keys(F.FEATURES).length;
    ok((await dmp.$$('#modCard .mod-sw.on')).length === n, `Modules lists all ${n} modules, switched on`);
    if (SHOTS) await (await dmp.$('#modCard')).screenshot({ path: path.join(SHOTS, 'modules-card.png') });

    // Shops off: its Planning tab and the phone's shop state go; Items off: the phone's Inventory tab goes.
    ok(await dmp.isVisible('[data-stab="shops"]'), 'the Shops tab shows before');
    await dmp.click('[data-mod="shops"]');
    ok(await poll(dmp, () => !document.querySelector('[data-stab="shops"]')?.offsetParent), 'switching Shops off hides its tab');
    ok(await poll(dmp, () => document.querySelector('[data-mod="shops"]').getAttribute('aria-checked') === 'false' && document.querySelector('[data-row="shops"]').classList.contains('is-off')), 'the switch shows off');
    await dmp.click('[data-mod="items"]');
    ok(await poll(ph, () => !document.querySelector('#tabs [data-tab="inventory"]')), 'Items off removes the phone Inventory tab');
    ok(await poll(dmp, () => !document.querySelector('[data-stab="items"]')?.offsetParent), 'and the DM Items tab');

    // Social off while exploring: the Social mode button goes.
    await dmp.click('[data-mod="social"]');
    ok(await poll(dmp, () => !document.querySelector('[data-mode="social"]')?.offsetParent), 'Social off hides the Social mode button');

    // Everything off: no page breaks.
    const r = await call(dm, 'dm:features:set', { all: true, on: false });
    ok(r.ok, 'every module can be switched off at once');
    ok(await until(() => dm.last.featuresOff.length === n), 'all modules are off');
    ok(await poll(dmp, () => !document.querySelector('#mapToggle')?.offsetParent && !document.querySelector('[data-stab="lore"]')?.offsetParent && !document.querySelector('[data-mode="combat"]')?.offsetParent), 'DM: map, lore and combat controls are hidden');
    ok(await poll(ph, () => ['dungeon', 'town', 'inventory', 'downtime'].every((t) => !document.querySelector(`#tabs [data-tab="${t}"]`))), 'phone: module tabs are gone');
    ok(await poll(tv, () => document.documentElement.classList.contains('no-worldmap')), 'TV knows the modules are off');
    // Each DM tab that is still there opens without errors.
    for (const id of await dmp.$$eval('[data-stab]', (bs) => bs.filter((x) => x.offsetParent && !x.disabled).map((x) => x.dataset.stab))) {
      await dmp.click(`[data-stab="${id}"]`);
      await poll(dmp, (t) => document.querySelector(`[data-stab="${t}"]`).classList.contains('on'), id);
    }
    if (SHOTS) { await dmp.screenshot({ path: path.join(SHOTS, 'modules-all-off-dm.png') }); await ph.screenshot({ path: path.join(SHOTS, 'modules-all-off-phone.png') }); await tv.screenshot({ path: path.join(SHOTS, 'modules-all-off-tv.png') }); }

    // All on: everything comes back.
    await dmp.click('#planToggle');
    await dmp.click('#planToggle');
    await dmp.waitForSelector('[data-stab="modules"]:visible');
    await dmp.click('[data-stab="modules"]');
    await dmp.click('#modAllOn');
    ok(await until(() => dm.last.featuresOff.length === 0), 'All on switches every module back on');
    ok(await poll(ph, () => !!document.querySelector('#tabs [data-tab="inventory"]')), 'phone Inventory tab is back');
    ok(await poll(dmp, () => !!document.querySelector('[data-stab="shops"]')?.offsetParent && !!document.querySelector('[data-mode="social"]')?.offsetParent), 'DM Shops tab and Social button are back');
    ok(await poll(dmp, () => document.querySelectorAll('#modCard .mod-sw.on').length === document.querySelectorAll('#modCard .mod-sw').length), 'every switch shows on');
  } catch (e) { ok(false, e.message); }
  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
