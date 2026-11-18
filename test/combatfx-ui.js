// Browser test for combat effects (combat aesthetic, first slice): the TV and the DM page play hit, heal,
// down and turn cues; the TV shows health words, not numbers; "Combat effects: Off" plays nothing.
// Usage: node test/combatfx-ui.js  (SHOTS=dir also saves screenshots)
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('combatfx-ui');
const { ok, until } = h;
const SHOTS = process.env.SHOTS;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 30, ac: 12, atk: 4, dmg: 2 });
  await until(() => dm.last.combat.enemies.length === 1);
  const g = dm.last.combat.enemies[0].id;

  const b = await chromium.launch();
  const errors = [];
  const open = async (url, viewport) => {
    const p = await (await b.newContext({ viewport })).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  const tv = await open('/screen', { width: 1280, height: 720 });
  const d = await open('/dm?key=dmkey', { width: 1500, height: 950 });
  await tv.waitForFunction(() => window.tvLast && window.CombatFx);
  await d.waitForFunction(() => window.CombatFx); await d.waitForLoadState('networkidle');

  dm.emit('dm:combat:start');
  ok(await tv.waitForSelector('#cfx .cfx-turn', { timeout: 3000 }).then(() => true, () => false), 'the TV sweeps in the turn');
  ok(/'s turn/.test(await tv.locator('#cfx .cfx-turn').first().textContent()), 'the turn sweep names whose turn it is');

  dm.emit('dm:hp', { id: g, delta: -5 });
  ok(await tv.waitForSelector('#cfx .cfx-slash', { timeout: 3000 }).then(() => true, () => false), 'a hit plays a slash on the TV');
  ok(await tv.locator('#cfx .cfx-amt').count() === 0, 'the TV shows no damage number');
  ok(await d.waitForSelector('#cfx .cfx-slash .cfx-amt', { timeout: 3000 }).then(() => true, () => false), 'the DM page shows the number with the slash');
  ok((await d.locator('#cfx .cfx-amt').first().textContent()).trim() === '-5', 'the DM sees -5');
  if (SHOTS) await tv.screenshot({ path: `${SHOTS}/tv-hit.png` });

  dm.emit('dm:hp', { id: a.me.id, delta: -4 });
  await tv.waitForFunction((id) => !/\d/.test(document.querySelector(`.pc[data-pid="${id}"] .hp span`)?.textContent || '1'), a.me.id, { timeout: 3000 }).catch(() => {});
  const card = await tv.locator(`.pc[data-pid="${a.me.id}"] .hp span`).textContent();
  ok(!/\d/.test(card) && card.trim().length > 0, `the TV party card shows a health word, not a number ("${card.trim()}")`);
  dm.emit('dm:hp', { id: a.me.id, delta: 2 });
  ok(await tv.waitForSelector('#cfx .cfx-heal', { timeout: 3000 }).then(() => true, () => false), 'healing glows on the TV');

  dm.emit('dm:hp', { id: g, delta: -999 });
  ok(await tv.waitForSelector('#cfx .cfx-down', { timeout: 3000 }).then(() => true, () => false), 'a creature at 0 gets a Down stamp');
  if (SHOTS) await tv.screenshot({ path: `${SHOTS}/tv-down.png` });

  // Everyone sees numbers when the DM shares them.
  dm.emit('dm:settings', { display: { numbers: 'all' } });
  await until(() => dm.last.settings.display.numbers === 'all');
  await tv.waitForFunction((id) => /\d+\/\d+/.test(document.querySelector(`.pc[data-pid="${id}"] .hp span`)?.textContent), a.me.id, { timeout: 3000 }).catch(() => {});
  ok(/\d+\/\d+/.test(await tv.locator(`.pc[data-pid="${a.me.id}"] .hp span`).textContent()), 'with numbers for everyone the TV card shows hp/max again');

  // Off: the TV plays nothing.
  dm.emit('dm:settings', { display: { fx: 'off' } });
  await tv.waitForFunction(() => document.documentElement.dataset.fx === 'off');
  await tv.waitForFunction(() => !document.querySelector('#cfx .cfx'), null, { timeout: 5000 }).catch(() => {}); // earlier effects have finished
  dm.emit('dm:hp', { id: a.me.id, delta: -1 });
  await tv.waitForTimeout(400); // nothing should happen: give a wrong effect time to show up
  ok(await tv.locator('#cfx .cfx').count() === 0, 'with combat effects off the TV plays nothing');

  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
