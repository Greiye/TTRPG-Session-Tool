// Right-click menus on the DM screen (Mike, Nov 16): characters, creatures, world map places, lore, log lines
// and any row with buttons open the shared menu; text fields and Shift + right-click keep the browser's menu.
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('ctxmenu');
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  dm.emit('dm:testparty', {});
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 12, ac: 13 });
  dm.emit('dm:clock:add', { name: 'Doom', segments: 6 });
  await h.call(dm, 'dm:lore:add', { cat: 'npc', name: 'Old Mara', text: 'Keeps the ferry.' });
  await h.until(() => dm.last?.players?.length && dm.last.combat.enemies.length);
  const b = await chromium.launch();
  const d = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errors = [];
  d.on('pageerror', (e) => errors.push(e.message));
  await d.goto(h.URL + '/dm?key=dmkey'); await d.waitForTimeout(1500);
  const menu = d.locator('.ctx-menu:not(.closing)');
  const close = async () => { await d.keyboard.press('Escape'); await d.waitForTimeout(200); };
  const tab = async (id) => { await d.click(`[data-stab="${id}"]`); await d.waitForTimeout(250); };

  // Party member in the hero column's picker.
  const pc = dm.last.players[0];
  await d.click(`.dm-hero [data-hero-pick="${pc.id}"]`, { button: 'right' });
  h.ok(await menu.count() === 1, 'right-click on a party portrait opens the menu');
  h.ok((await menu.locator('header b').textContent()) === pc.name, 'menu is titled with the character name');
  const hp0 = dm.last.players.find((p) => p.id === pc.id).hp;
  await menu.locator('button', { hasText: /^-5$/ }).click();
  h.ok(await h.until(() => dm.last.players.find((p) => p.id === pc.id).hp === Math.max(0, hp0 - 5)), 'HP -5 from the menu');
  h.ok(await menu.count() === 1, 'the menu stays open for repeated HP taps');
  await menu.locator('button', { hasText: 'Prone' }).click();
  h.ok(await h.until(() => dm.last.players.find((p) => p.id === pc.id).conditions?.includes('Prone')), 'condition toggled from the menu');
  h.ok(await menu.locator('button.on', { hasText: 'Prone' }).waitFor({ timeout: 2000 }).then(() => true, () => false), 'the open menu updates live');
  await close();
  h.ok(await menu.count() === 0, 'Escape closes the menu');

  // Creature card in the Combat tab: remove is a two-click arm.
  dm.emit('dm:mode', { mode: 'combat' }); await d.waitForTimeout(500);
  await tab('combat');
  const foe = dm.last.combat.enemies[0];
  // The 3D battle map's unit menu is the same shared menu.
  dm.emit('dm:map', { cols: 10, rows: 8 });
  await h.until(() => dm.last.map);
  dm.emit('dm:token', { id: foe.id, x: 3, y: 3 });
  if (await h.until(() => dm.last.tokens?.[foe.id]) && await d.waitForFunction(() => window.IsoDm?.battle, null, { timeout: 5000 }).then(() => true, () => false)) {
    await d.evaluate((id) => window.IsoDm.menu(id, 600, 300), foe.id);
    h.ok((await menu.locator('header b').textContent()) === 'Goblin', '3D map unit menu uses the shared menu');
    await menu.locator('button', { hasText: 'Torch' }).click();
    h.ok(await h.until(() => dm.last.tokens[foe.id]?.light === 'torch'), '3D map menu sets a light');
    await close();
  } else h.ok(false, '3D map mounted for the unit menu');
  await d.click(`[data-oid="${foe.id}"] .cbt-head b`, { button: 'right' });
  h.ok((await menu.locator('header b').textContent()) === 'Goblin', 'right-click on a creature card opens its menu');
  const rm = menu.locator('button.danger');
  await rm.click();
  h.ok((await rm.textContent()).includes('Click again'), 'remove arms on the first click');
  await rm.click();
  h.ok(await h.until(() => !dm.last.combat.enemies.length), 'second click removes the creature');

  // A clock row has no menu of its own: its buttons become the menu.
  dm.emit('dm:mode', { mode: 'exploration' }); await d.waitForTimeout(500);
  await tab('scene');
  await d.click('[data-sub-pick="clocks"]'); await d.waitForTimeout(250);
  const clock = d.locator('#clockList .item').first();
  await clock.scrollIntoViewIfNeeded();
  await clock.click({ button: 'right', position: { x: 30, y: 8 } });
  h.ok(await menu.count() === 1, 'a clock row opens the generic menu');
  await menu.locator('button', { hasText: '+' }).first().click();
  h.ok(await h.until(() => dm.last.clocks[0].filled === 1), 'the generic menu runs the row button (+1 segment)');

  // Lore entry.
  await tab('lore');
  await d.click('details[data-lore] summary', { button: 'right' });
  h.ok((await menu.locator('header b').textContent()) === 'Old Mara', 'right-click on a lore entry opens its menu');
  await menu.locator('button', { hasText: 'Share with phones' }).click();
  h.ok(await h.until(() => dm.last.lore.find((e) => e.name === 'Old Mara')?.shared), 'share with phones from the menu');
  await close();

  // World map place.
  await d.click('#mapToggle'); await d.waitForTimeout(500);
  await h.call(dm, 'dm:worldmap:example');
  await d.waitForTimeout(400);
  const node = dm.last.worldMap.nodes.find((n) => !n.revealed) || dm.last.worldMap.nodes[0];
  const was = !!node.revealed;
  await d.click(`#wmBoard [data-node="${node.id}"] i`, { button: 'right' });
  h.ok((await menu.locator('header b').textContent()) === node.name, 'right-click on a world map place opens its menu');
  await menu.locator('button', { hasText: 'Info revealed' }).click();
  h.ok(await h.until(() => !!dm.last.worldMap.nodes.find((n) => n.id === node.id).revealed !== was), 'reveal info from the menu');
  await close();
  await d.click('#mapToggle'); await d.waitForTimeout(300);

  // Text fields and Shift + right-click keep the browser's own menu (no custom menu opens).
  await d.click('#narrate', { button: 'right' });
  h.ok(await menu.count() === 0, 'no custom menu on a text field');
  await d.keyboard.down('Shift');
  await d.click(`.dm-hero [data-hero-pick="${pc.id}"]`, { button: 'right' });
  await d.keyboard.up('Shift');
  h.ok(await menu.count() === 0, 'Shift + right-click keeps the browser menu');

  h.ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await d.screenshot({ path: require('path').join(h.TMP, 'x.png') });
  await b.close(); await h.done(srv);
})();
