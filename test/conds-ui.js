// Conditions on the hero portrait (Mike, Nov 16): badges on the bottom right of the portrait open the
// conditions menu on click or right-click; the Conditions card and the Reset session button are gone; the
// hero opens on Bio.
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('conds-ui');
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  dm.emit('dm:testparty', {});
  await h.until(() => dm.last?.players?.length);
  const b = await chromium.launch();
  const d = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errors = [];
  d.on('pageerror', (e) => errors.push(e.message));
  if (process.env.SHOTS) d.on('console', (m) => console.log('page:', m.text()));
  await d.goto(h.URL + '/dm?key=dmkey'); await d.waitForTimeout(1500);
  const menu = d.locator('.ctx-menu:not(.closing)');
  const pc = dm.last.players[0];
  await d.click(`.dm-hero [data-hero-pick="${pc.id}"]`); await d.waitForTimeout(200);

  h.ok(await d.locator('#condWho').count() === 0, 'the Conditions card is gone');
  h.ok(await d.locator('[data-act="reset"]').count() === 0, 'the Reset session button is gone');
  h.ok(await d.locator('.dm-hero [data-hero-view="bio"].on').count() === 1, 'the hero opens on Bio');

  // No conditions yet: a faint + on the portrait opens the menu.
  await d.click('.dm-hero .hero-art .cond-badge.add');
  h.ok(await menu.count() === 1 && /conditions/.test(await menu.locator('header b').textContent()), 'the + badge opens the conditions menu');
  await menu.locator('button', { hasText: 'Poisoned' }).click();
  h.ok(await h.until(() => dm.last.players.find((p) => p.id === pc.id).conditions.includes('Poisoned')), 'picking a condition sets it');
  await d.keyboard.press('Escape'); await d.waitForTimeout(300);
  h.ok(await d.locator('.dm-hero .hero-art .cond-badge[data-cond-key="Poisoned"]').count() === 1, 'the portrait shows a Poisoned badge');
  h.ok(await d.locator(`.dm-hero [data-hero-pick="${pc.id}"] .pick-cond`).count() === 1, 'the party picker shows a condition count');

  // Right-click the badge: the same menu; a timed condition goes through the timer.
  await d.click('.dm-hero .hero-art .cond-badge[data-cond-key="Poisoned"]', { button: 'right' });
  h.ok(await menu.count() === 1, 'right-click on a badge opens the conditions menu');
  await menu.locator('button', { hasText: '3 rounds' }).click();
  await menu.locator('button', { hasText: 'Prone' }).click();
  h.ok(await h.until(() => (dm.last.timers || []).some((t) => t.charId === pc.id && t.name === 'Prone' && t.rounds === 3)), 'a condition can last 3 rounds');
  await menu.locator('button', { hasText: 'Poisoned' }).click();
  h.ok(await h.until(() => !dm.last.players.find((p) => p.id === pc.id).conditions.includes('Poisoned')), 'picking it again clears it');
  await d.keyboard.press('Escape');
  if (process.env.SHOTS) await d.locator('.dm-hero').screenshot({ path: `${process.env.SHOTS}/dm-hero-conds.png` });

  h.ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close(); await h.done(srv);
})();
