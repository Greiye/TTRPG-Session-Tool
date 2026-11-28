// Browser test for the battle map's view and light (Mike, Nov 22): the overhead view keeps its turn instead of
// snapping back to north-up, a compass rose turns with the view on the DM page, the TV and phones, the map follows
// the time of day (with a DM override), and a dungeon map gets its own tiles, doors, pillars and wall torches.
// Usage: node test/battle-light-ui.js  (SHOTS=dir also saves screenshots)
const { chromium } = require('playwright');
const { harness, poll } = require('./helpers');
const h = harness('battle-light-ui');
const { ok, until } = h;
const SHOTS = process.env.SHOTS;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 50, ac: 10, atk: 3, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 1);
  const gob = dm.last.combat.enemies[0].id;
  dm.emit('dm:map', { cols: 16, rows: 10 });
  await until(() => dm.last.map && dm.last.tokens?.[a.me.id]);
  dm.emit('dm:token', { id: gob, x: 12, y: 6 });
  await until(() => dm.last.tokens?.[gob]);
  dm.emit('dm:story:set', { day: 1, seg: 1 }); // Day
  await until(() => dm.last.story?.segment === 'day');

  const b = await chromium.launch();
  const errors = [];
  const open = async (url, opts) => {
    const p = await (await b.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  const dmp = await open('/dm?key=dmkey', { viewport: { width: 1440, height: 900 } });
  const tv = await open('/screen', { viewport: { width: 1280, height: 720 } });
  const ph = await open(`/play?takeover=${a.me.id}&key=dmkey`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await tv.waitForFunction(() => window.tvLast && window.IsoTv);

  dm.emit('dm:mode', { mode: 'combat' });
  await until(() => dm.last.mode === 'combat');
  const amb = (p, who) => p.evaluate((w) => window[w]?.battle?.ambience?.() || null, who);
  const angle = (p, who) => p.evaluate((w) => window[w]?.battle?.camera.angle() || null, who);
  ok(await poll(dmp, () => window.IsoDm?.battle?.ambience?.(), null, 10000), 'the DM page shows the 3D map');
  ok(await poll(tv, () => window.IsoTv?.battle?.ambience?.(), null, 10000), 'the TV shows the 3D map');

  // DM tools panel (Mike, Nov 27): closed by default, the map bar's Tools button opens and closes it.
  ok(await dmp.locator('.isob-dm').first().isHidden(), 'the DM tools panel starts closed');
  await dmp.locator('.iso-cov .iso-tools').first().click();
  ok(await poll(dmp, () => !document.querySelector('.isob-dm')?.hidden), 'the Tools button opens the DM tools');
  await dmp.locator('.iso-cov .iso-tools').first().click();
  ok(await poll(dmp, () => document.querySelector('.isob-dm')?.hidden), 'and closes them again');

  // Compass on every screen.
  for (const [p, name] of [[dmp, 'DM page'], [tv, 'TV']]) ok(await p.locator('.isob-compass').first().isVisible(), `the ${name} shows a compass rose`);

  // Overhead keeps the turn (the bug: it snapped back to north-up).
  const DEG = Math.PI / 180;
  const near = (x, y) => Math.abs(x - y) < 0.01;
  await dmp.evaluate(() => { const r = window.IsoDm.battle; r.camera.rotate(1); r.camera.rotate(1); }); // iso 45° -> 135°
  ok(await poll(dmp, () => Math.abs(window.IsoDm.battle.camera.angle().az - 135 * Math.PI / 180) < 0.01), 'two iso turns face 135°');
  await dmp.evaluate(() => window.IsoDm.battle.camera.overhead(true));
  let an = await angle(dmp, 'IsoDm');
  ok(an.overhead && near(an.az, 90 * DEG), `overhead keeps the quarter turn it was on (90°, got ${Math.round(an.az / DEG)}°)`);
  await dmp.evaluate(() => window.IsoDm.battle.camera.rotate(1));
  an = await angle(dmp, 'IsoDm');
  ok(an.overhead && near(an.az, 180 * DEG), 'a turn while overhead stays overhead and turns 90°');
  // A right-click (orbit with no drag) snaps the view; it must keep the turn.
  const box = await dmp.locator('.iso-layer canvas').first().boundingBox();
  await dmp.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.15);
  await dmp.mouse.down({ button: 'right' }); await dmp.mouse.up({ button: 'right' });
  an = await angle(dmp, 'IsoDm');
  ok(an.overhead && near(an.az, 180 * DEG), 'a right-click on the map does not snap overhead back to north-up');
  dm.emit('dm:combat:start'); // a turn change
  await until(() => dm.last.combat.active);
  dm.emit('dm:combat:next');
  await until(() => dm.last.combat.turn === 1 || dm.last.combat.round > 1);
  an = await angle(dmp, 'IsoDm');
  ok(an.overhead && near(an.az, 180 * DEG), 'the view keeps its turn across turn changes');
  ok(await poll(ph, () => window.IsoPhone?.battle?.ambience?.(), null, 10000), 'the phone shows the 3D map in combat');
  ok(await ph.locator('.isob-compass').first().isVisible(), 'the phone shows a compass rose');
  await dmp.evaluate(() => window.IsoDm.battle.camera.overhead(false));
  an = await angle(dmp, 'IsoDm');
  ok(!an.overhead && near(an.az, 225 * DEG), 'leaving overhead goes to the iso angle next to it');
  // The compass needle follows: rotated by the view's angle.
  ok(await poll(dmp, () => /rotate\((224|225)/.test(document.querySelector('.isob-compass svg')?.style.transform || '')), 'the DM compass turns with the view');
  // Phone: tapping the compass turns the map a quarter turn and stays overhead.
  const p0 = await angle(ph, 'IsoPhone');
  await ph.locator('.isob-compass').first().tap();
  const p1 = await angle(ph, 'IsoPhone');
  ok(p0.overhead && p1.overhead && near(p1.az - p0.az, 90 * DEG), 'tapping the phone compass turns the map a quarter turn');
  // TV: the DM's quarter turn reaches the TV view and its compass.
  dm.emit('dm:tv:cam', { turn: 1 });
  ok(await poll(tv, () => Math.abs(window.IsoTv.battle.camera.angle().az - 135 * Math.PI / 180) < 0.01, null, 4000), 'the TV view turns when the DM turns it');
  ok(await poll(tv, () => /rotate\(13[45]/.test(document.querySelector('.isob-compass svg')?.style.transform || ''), null, 4000), 'the TV compass turns with it');
  if (SHOTS) { await tv.waitForTimeout(800); await tv.screenshot({ path: `${SHOTS}/tv-day.png` }); } // screenshot only: let the turn ease in

  // Time of day: Day, then the clock moves to Night; torches light up on the party.
  ok((await amb(tv, 'IsoTv')).light === 'day', 'by day the map is lit as day');
  ok((await amb(tv, 'IsoTv')).torches === 0, 'no torches by day');
  dm.emit('dm:story:set', { day: 1, seg: 4 }); // Night
  ok(await poll(tv, () => window.IsoTv.battle.ambience().light === 'night', null, 4000), 'the TV map turns to night with the story clock');
  ok(await poll(ph, () => window.IsoPhone.battle.ambience().light === 'night', null, 4000), 'so does the phone');
  ok((await amb(tv, 'IsoTv')).torches >= 1, 'at night the party carries torches');
  if (SHOTS) { await tv.waitForTimeout(1500); await tv.screenshot({ path: `${SHOTS}/tv-night.png` }); }
  // DM override.
  dm.emit('dm:map:daylight', { light: 'dusk' });
  ok(await poll(tv, () => window.IsoTv.battle.ambience().light === 'dusk', null, 4000), 'the DM override sets dusk');
  ok(await poll(dmp, () => document.querySelector('.iso-daylight select')?.value === 'dusk', null, 4000), 'the DM light picker shows the override');
  if (SHOTS) { await dmp.waitForTimeout(1500); await dmp.screenshot({ path: `${SHOTS}/dm-dusk.png` }); }
  dm.emit('dm:map:daylight', { light: 'auto' });
  ok(await poll(tv, () => window.IsoTv.battle.ambience().light === 'night', null, 4000), 'Auto goes back to the story clock');
  dm.emit('dm:map:daylight', { light: 'noon!' });
  await until(() => false, 200); // nothing should happen: an unknown light is ignored
  ok(!dm.last.map.daylight, 'an unknown light is ignored');

  // Dungeon tiles: generate a dungeon for this encounter.
  dm.emit('dm:map:generate', { seed: 42, theme: 'dungeon' });
  await until(() => dm.last.map.theme === 'dungeon');
  const m = dm.last.map;
  const props = Object.values(m.props || {});
  ok(m.theme === 'dungeon', 'the map is a dungeon');
  ok(Object.values(m.terrain).filter((t) => t === 'wall').length > m.cols * m.rows * 0.3, 'a dungeon is mostly solid wall');
  ok(Object.values(m.ground).includes('flagstone') && Object.values(m.ground).includes('cobble'), 'flagstone rooms and cobbled corridors');
  ok(props.includes('door'), 'doorways get doors');
  const free = (x, y) => !m.terrain[`${x},${y}`] && (!m.props[`${x},${y}`] || m.props[`${x},${y}`] === 'door');
  ok(Object.values(dm.last.tokens).every((t) => free(t.x, t.y)), 'tokens moved out of the new walls');
  ok(await poll(tv, () => { const x = window.IsoTv.battle.ambience(); return x.theme === 'dungeon' && x.light === 'dark'; }, null, 4000), 'the TV draws the dungeon, dark (Auto in a dungeon)');
  ok(await poll(tv, () => window.IsoTv.battle.ambience().sconces > 0, null, 4000), 'the dungeon has wall torches');
  if (SHOTS) {
    await tv.waitForTimeout(1500);
    await tv.screenshot({ path: `${SHOTS}/tv-dungeon.png` });
    dm.emit('dm:map:daylight', { light: 'day' });
    await poll(dmp, () => window.IsoDm.battle.ambience().light === 'day', null, 4000);
    await dmp.evaluate(() => window.IsoDm.battle.camera.fit());
    await dmp.waitForTimeout(1500);
    await dmp.screenshot({ path: `${SHOTS}/dm-dungeon-lit.png` });
    await ph.waitForTimeout(500);
    await ph.screenshot({ path: `${SHOTS}/phone-dungeon.png` });
  }
  // Same seed and kind, same dungeon; outdoors again keeps working.
  const before = JSON.stringify(dm.last.map.terrain);
  dm.emit('dm:map:generate', { seed: 42 }); // the map keeps its kind
  await until(() => false, 200); // nothing should change: same seed, same kind
  ok(JSON.stringify(dm.last.map.terrain) === before && dm.last.map.theme === 'dungeon', 'same seed and kind, same dungeon');
  dm.emit('dm:map:generate', { seed: 42, theme: 'outdoor' });
  await until(() => dm.last.map.theme === 'outdoor');
  ok(!Object.values(dm.last.map.ground).includes('flagstone'), 'outdoors again: no dungeon floor');

  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await b.close();
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
