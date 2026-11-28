// Mike, Nov 28: Social mode character chips use the whole row, show full names and wrap; a chip drags into the
// conversation, also onto the TV preview above; windows grow to fit their content; right-click menus cascade
// (side menus on hover, click and arrow keys) and reach every part of the DM screen.
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('wrap-cascade');
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  dm.emit('dm:testparty', {});
  await h.until(() => dm.last?.players?.length >= 4, 5000);
  dm.emit('dm:worldmap:show', { on: false });
  dm.emit('dm:mode', { mode: 'social' });
  await h.until(() => dm.last.mode === 'social');
  const b = await chromium.launch();
  const d = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errors = [];
  d.on('pageerror', (e) => errors.push(e.message));
  await d.goto(h.URL + '/dm?key=dmkey');
  await d.waitForSelector('#convoPlayers [data-pool]');
  await h.settled(d, 'body');
  const menu = d.locator('.ctx-menu:not(.closing)');
  const closeAll = async () => { for (let i = 0; i < 4 && await menu.count(); i++) await d.keyboard.press('Escape'); await d.waitForSelector('.ctx-menu', { state: 'detached', timeout: 3000 }).catch(() => {}); };

  // Chips: full names, sized to content, wrapping across the whole row.
  const chips = await d.evaluate(() => {
    const row = document.querySelector('#convoPlayers').getBoundingClientRect();
    const bs = [...document.querySelectorAll('#convoPlayers .convo-npc')];
    return {
      clipped: bs.filter((x) => x.scrollWidth > x.clientWidth + 1).length,
      widths: new Set(bs.map((x) => Math.round(x.getBoundingClientRect().width))).size,
      rows: new Set(bs.map((x) => Math.round(x.getBoundingClientRect().top))).size,
      inside: bs.every((x) => x.getBoundingClientRect().right <= row.right + 1),
      label: document.querySelector('#convoPlayers').closest('.convo-tray-row').querySelector('.note').getBoundingClientRect().bottom <= row.top + 1,
      names: bs.map((x) => x.textContent.trim()),
    };
  });
  h.ok(chips.clipped === 0, 'no character chip clips its name');
  h.ok(chips.widths > 1, 'chips are sized to their names, not one fixed width');
  h.ok(chips.rows > 1 && chips.inside, 'chips wrap onto new lines inside the row');
  h.ok(chips.label, 'the row label sits above the chips, so the chips use the whole width');
  h.ok(chips.names.some((n) => n.includes('[Test] Brother Oak')), 'full character names are shown');

  // Windows grow to fit their content: the social window has no scrollbar of its own.
  const win = await d.evaluate(() => { const w = document.querySelector('#socialWin'); return w.scrollHeight <= w.clientHeight + 1; });
  h.ok(win, 'the social window grows to fit what is in it');

  // Drag a chip with the mouse onto the TV preview above: it joins the conversation picker at once.
  const pc = dm.last.players.find((p) => p.name.includes('Mira'));
  const chip = d.locator(`#convoPlayers [data-pool="${pc.id}"]`);
  await d.waitForSelector('#tablePage .stage-wrap[data-drop="in"]', { state: 'attached' });
  // The TV preview sits above the picker: scroll the page just far enough that both are on screen.
  await d.evaluate((id) => { const c = document.querySelector(`#convoPlayers [data-pool="${id}"]`); const p = document.querySelector('#tablePage'); p.scrollTop += Math.max(0, c.getBoundingClientRect().bottom - innerHeight + 20); }, pc.id);
  const fromNow = await chip.boundingBox();
  const to = await d.locator('#tablePage .stage-wrap').boundingBox();
  h.ok(!!fromNow && !!to && fromNow.y + fromNow.height < 950 && to.y + to.height > 60, 'chip and TV preview are both on screen');
  await d.mouse.move(fromNow.x + 20, fromNow.y + fromNow.height / 2);
  await d.mouse.down();
  await d.mouse.move(fromNow.x + 40, fromNow.y + 10, { steps: 3 });
  h.ok(await d.waitForSelector('.drag-ghost', { timeout: 2000 }).then(() => true, () => false), 'a mouse drag lifts the chip without a hold');
  await d.mouse.move(to.x + to.width / 2, Math.max(to.y, 0) + 40, { steps: 8 });
  h.ok(await d.locator('#tablePage .stage-wrap.drop-over').count() === 1, 'the TV preview glows as a drop zone');
  await d.mouse.up();
  h.ok(await d.waitForSelector(`#convoZone [data-zone="${pc.id}"]`, { timeout: 3000 }).then(() => true, () => false), 'dropping on the TV preview brings the character into the conversation');

  // Right-click a chip: in or out of the conversation, then a cascading character menu with conditions.
  const zoneChip = d.locator(`#convoZone [data-zone="${pc.id}"]`);
  await zoneChip.scrollIntoViewIfNeeded();
  await zoneChip.click({ button: 'right' });
  h.ok(await menu.count() === 1 && (await menu.locator('header b').textContent()) === pc.name, 'right-click on a conversation chip opens its menu');
  h.ok(await menu.locator('button', { hasText: 'Take out of the conversation' }).count() === 1, 'the chip menu offers to take them out');
  await menu.locator('button.has-sub', { hasText: 'Character' }).hover();
  h.ok(await d.waitForSelector('.ctx-menu.ctx-sub:not(.closing)', { timeout: 2000 }).then(() => true, () => false), 'hovering an item with ▸ opens a side menu');
  const sub = d.locator('.ctx-menu.ctx-sub:not(.closing)');
  await sub.locator('button.has-sub', { hasText: 'Conditions' }).click();
  h.ok(await d.waitForFunction(() => document.querySelectorAll('.ctx-menu.ctx-sub:not(.closing)').length === 2, null, { timeout: 2000 }).then(() => true, () => false), 'side menus cascade a second level');
  await d.locator('.ctx-menu.ctx-sub:not(.closing) button', { hasText: 'Poisoned' }).click();
  h.ok(await h.until(() => dm.last.players.find((p) => p.id === pc.id).conditions?.includes('Poisoned')), 'a condition set from the deepest side menu');
  h.ok(await d.locator('.ctx-menu.ctx-sub:not(.closing) button.on', { hasText: 'Poisoned' }).waitFor({ timeout: 2000 }).then(() => true, () => false), 'the side menu refreshes live and stays open');
  await d.keyboard.press('Escape');
  h.ok(await d.waitForFunction(() => document.querySelectorAll('.ctx-menu:not(.closing)').length === 2, null, { timeout: 2000 }).then(() => true, () => false), 'Escape closes only the deepest side menu');
  await closeAll();
  h.ok(await menu.count() === 0, 'Escape again closes every level');

  // Keyboard: Right arrow opens a side menu, Left arrow goes back.
  await zoneChip.click({ button: 'right' });
  const charItem = menu.locator('button.has-sub', { hasText: 'Character' });
  await charItem.focus();
  await d.waitForFunction(() => document.activeElement?.matches('.ctx-menu button.has-sub'), null, { timeout: 2000 }).catch(() => {});
  await d.keyboard.press('ArrowRight');
  const rightOk = await d.waitForFunction(() => document.activeElement?.closest('.ctx-sub'), null, { timeout: 2000 }).then(() => true, () => false);
  const where = rightOk ? '' : await d.evaluate(() => `menus ${document.querySelectorAll('.ctx-menu:not(.closing)').length}, focus on ${document.activeElement?.tagName}.${document.activeElement?.className} "${document.activeElement?.textContent?.trim().slice(0, 20)}"`);
  h.ok(rightOk, `Right arrow opens the side menu and moves focus into it${where ? ` (${where})` : ''}`);
  await d.keyboard.press('ArrowLeft');
  h.ok(await d.waitForFunction(() => document.querySelectorAll('.ctx-menu:not(.closing)').length === 1 && document.activeElement?.classList.contains('has-sub'), null, { timeout: 2000 }).then(() => true, () => false), 'Left arrow closes it and returns to the item');
  await closeAll();

  // A blank spot on the DM screen still gets a menu, with Mode and Tools side menus.
  const blank = await d.evaluate(() => { const r = document.querySelector('#tablePage').getBoundingClientRect(); return { x: r.left + 6, y: r.top + 4 }; });
  await d.evaluate(() => document.querySelector('#tablePage').scrollTo(0, 0));
  await d.mouse.click(blank.x, blank.y, { button: 'right' });
  h.ok(await menu.count() === 1 && await menu.locator('button.has-sub', { hasText: 'Tools' }).count() === 1, 'a blank spot opens the DM screen menu with Tools');
  await menu.locator('button.has-sub', { hasText: 'Mode' }).click();
  await d.locator('.ctx-menu.ctx-sub:not(.closing) button', { hasText: 'Explore' }).click();
  h.ok(await h.until(() => dm.last.mode === 'exploration', 3000), 'mode switched from the cascading page menu');

  // A window with many controls: its menu lists them in a side menu instead of nothing.
  await d.click('[data-stab="scene"]'); await h.settled(d, 'body');
  const card = d.locator('#toolsCol > .card[data-tab]:not([hidden]):not(.folded)').first();
  await card.locator(':scope > h3').click({ button: 'right', position: { x: 4, y: 4 } });
  h.ok(await menu.count() === 1, 'right-click on a window title opens a menu');
  h.ok(await menu.locator('button', { hasText: /Fold window|Open window|Bring into view/ }).count() >= 1, `the window menu can fold or show the window (${(await menu.innerText()).replace(/\s+/g, ' ').slice(0, 200)})`);
  await closeAll();
  const tools = await d.evaluate(() => [...document.querySelectorAll('#toolsCol > .card[data-tab]:not(.folded):not([hidden])')].every((c) => c.scrollHeight <= c.clientHeight + 1));
  h.ok(tools, 'open tool windows grow to fit their content (no inner scrollbar)');
  const modes = await d.evaluate(() => { const c = document.querySelector('.modes-card').getBoundingClientRect(); return [...document.querySelectorAll('.modes-card .modes .btn')].filter((x) => x.offsetParent).every((x) => x.getBoundingClientRect().right <= c.right + 1 && x.scrollWidth <= x.clientWidth + 1); });
  h.ok(modes, 'mode buttons wrap inside their window');

  // The TV scene panel (title, description, narration) hugs its content and grows with it.
  await d.waitForSelector('#stage .explore');
  const box = () => d.evaluate(() => { const e = document.querySelector('#stage .explore').getBoundingClientRect(); const st = document.querySelector('#stage').getBoundingClientRect(); return { w: e.width, h: e.height, inside: e.right <= st.right + 1, narrow: e.width < st.width * 0.7 }; });
  const b1 = await box();
  dm.emit('dm:narrate', { text: 'A person wishes to speak with the party about the missing caravan that left Millbrook three days ago and never reached Harrowgate, and about the hooded rider seen on the old mill road.' });
  await d.waitForFunction((h0) => document.querySelector('#stage .explore')?.getBoundingClientRect().height > h0 + 4, b1.h, { timeout: 3000 }).catch(() => {});
  const b2 = await box();
  h.ok(b1.narrow && b1.inside, 'the TV scene panel is as wide as its content, inside the screen');
  h.ok(b2.h > b1.h && b2.inside, 'the TV scene panel grows with a new narration line and stays on screen');

  h.ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close(); await h.done(srv);
})();
