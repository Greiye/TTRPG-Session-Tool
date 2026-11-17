// Strike gestures on the phone (Mike, Nov 17): picking an enemy opens its silhouette; dragging across slashes,
// holding pierces, Quick strike taps; then the attack is rolled as before. The DM can switch gestures off.
// Usage: node test/strike-ui.js  (SHOTS=dir also saves screenshots)
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('strike-ui');
const { ok, until } = h;
const SHOTS = process.env.SHOTS;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:enemy:add', { name: 'Bandit', hp: 200, ac: 1, atk: 0, dmg: 1 });
  dm.emit('dm:enemy:add', { name: 'Wolf', hp: 200, ac: 1, atk: 0, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 2);
  const [bandit, wolf] = dm.last.combat.enemies.map((e) => e.id);
  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  const myTurn = async () => {
    for (let i = 0; i < 6 && dm.last.combat.order[dm.last.combat.turn]?.id !== a.me.id; i++) { dm.emit('dm:combat:next'); await h.wait(120); }
    return dm.last.combat.order[dm.last.combat.turn]?.id === a.me.id;
  };
  const attacks = () => dm.last.log.filter((l) => /^Mira attacks /.test(l.text) && !l.vis).length;

  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ph = await ctx.newPage();
  ph.on('pageerror', (e) => errors.push(e.message));
  await ph.goto(`${h.URL}/play?takeover=${a.me.id}&key=dmkey`);
  await ph.waitForFunction(() => window.Strike);
  ok(await ph.evaluate(() => [Strike.shapeOf({ name: 'Bandit' }), Strike.shapeOf({ name: 'Wolf' }), Strike.shapeOf({ kind: 'Large ooze' }), Strike.shapeOf({ name: 'Young dragon' })].join()) === 'humanoid,beast,blob,winged', 'the silhouette follows the creature: humanoid, beast, blob, winged');

  // Slash: drag across the silhouette.
  ok(await myTurn(), 'it is Mira\'s turn');
  await ph.click(`[data-attack="${bandit}"]`);
  ok(await ph.waitForSelector('#strike .strike-sil', { timeout: 2000 }).then(() => true, () => false), 'picking an enemy opens its silhouette');
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/strike-open.png` });
  const before = attacks();
  await h.wait(300); // wait for the card's entrance to finish
  const f = await ph.locator('#strike .strike-field').boundingBox();
  await ph.mouse.move(f.x + 20, f.y + f.height * 0.35);
  await ph.mouse.down();
  for (let i = 1; i <= 12; i++) await ph.mouse.move(f.x + 20 + ((f.width - 40) * i) / 12, f.y + f.height * (0.35 + 0.02 * i));
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/strike-slash.png` });
  await ph.mouse.up();
  ok(await until(() => attacks() === before + 1, 3000), 'a slash across the silhouette makes the attack');
  ok(await ph.waitForSelector('#strike .strike-result:not([hidden])', { timeout: 3000 }).then(() => true, () => false), 'the result shows on the silhouette');
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/strike-result.png` });
  ok(await ph.waitForSelector('#strike', { state: 'detached', timeout: 3000 }).then(() => true, () => false), 'the pop-up closes after the result');

  // A short drag is not a slash.
  dm.emit('dm:combat:next'); dm.emit('dm:combat:next');
  ok(await myTurn(), 'Mira\'s turn again');
  await ph.click(`[data-attack="${wolf}"]`);
  await ph.waitForSelector('#strike .strike-sil');
  await h.wait(300);
  const g = await ph.locator('#strike .strike-field').boundingBox();
  const n1 = attacks();
  await ph.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await ph.mouse.down();
  await ph.mouse.move(g.x + g.width / 2 + 40, g.y + g.height / 2, { steps: 4 }); await ph.mouse.up();
  await h.wait(500);
  ok(attacks() === n1 && /slash/.test(await ph.locator('#strike .strike-hint').textContent()), 'a short drag does not strike and says how to slash');

  // Pierce: hold until the ring closes.
  await ph.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await ph.mouse.down();
  await h.wait(450);
  ok(await ph.locator('#strike .strike-ring:not([hidden])').count() === 1, 'holding shows the closing ring');
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/strike-hold.png` });
  await h.wait(800);
  await ph.mouse.up();
  ok(await until(() => attacks() === n1 + 1, 3000), 'holding until the ring closes makes a piercing attack');
  await ph.waitForSelector('#strike', { state: 'detached', timeout: 4000 });

  // Gestures off: a tap attacks at once.
  dm.emit('dm:settings', { display: { gestures: 'off' } });
  await until(() => dm.last.settings.display.gestures === 'off');
  dm.emit('dm:combat:next'); dm.emit('dm:combat:next');
  ok(await myTurn(), 'Mira\'s turn a third time');
  await h.wait(200);
  const n2 = attacks();
  await ph.click(`[data-attack="${bandit}"]`);
  ok(await until(() => attacks() === n2 + 1, 3000) && await ph.locator('#strike').count() === 0, 'with strike gestures off the button attacks at once');

  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
