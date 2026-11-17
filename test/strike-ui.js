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
  const k = await h.player(room, 'Kai', 'Monk');
  await until(() => dm.last?.players.length === 2);
  const cues = [];
  dm.on('cfx', (c) => cues.push(c));
  dm.emit('dm:enemy:add', { name: 'Bandit', hp: 200, ac: 1, atk: 0, dmg: 1 });
  dm.emit('dm:enemy:add', { name: 'Wolf', hp: 200, ac: 1, atk: 0, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 2);
  const [bandit, wolf] = dm.last.combat.enemies.map((e) => e.id);
  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  const at = () => `${dm.last.combat.round}:${dm.last.combat.turn}`;
  const nextTurn = async () => { const was = at(); dm.emit('dm:combat:next'); await until(() => at() !== was, 3000); };
  const turnOf = async (who) => {
    // Wait for each step to reach the DM's state before deciding to step again: a fixed pause could send an
    // extra "next" on a slow machine and skip past the turn we want (CI flake, Nov 17).
    for (let i = 0; i < 8 && dm.last.combat.order[dm.last.combat.turn]?.id !== who.me.id; i++) await nextTurn();
    return dm.last.combat.order[dm.last.combat.turn]?.id === who.me.id;
  };
  const myTurn = () => turnOf(a);
  const attacks = () => dm.last.log.filter((l) => /^Mira attacks /.test(l.text) && !l.vis).length;

  const b = await chromium.launch();
  const errors = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ph = await ctx.newPage();
  ph.on('pageerror', (e) => errors.push(e.message));
  await ph.goto(`${h.URL}/play?takeover=${a.me.id}&key=dmkey`);
  await ph.waitForFunction(() => window.Strike);
  ok(await ph.evaluate(() => [Strike.strikeMode({ cls: 'Fighter' }), Strike.strikeMode({ cls: 'Monk' }), Strike.strikeMode({ cls: 'Fighter', inventory: [{ name: 'Iron gauntlets', qty: 1 }] })].join()) === 'free,nodes,nodes', 'martial artists and unique weapons strike with nodes');
  ok(await ph.evaluate(() => { const c = Strike.pickChain('humanoid'); return c.length === 4 && new Set(c.map(String)).size === 4; }), 'a node chain has 4 different spots');
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
  await nextTurn(); await nextTurn();
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

  // Node strike: the monk drags through numbered nodes in order.
  const kp = await ctx.newPage();
  kp.on('pageerror', (e) => errors.push(e.message));
  await kp.goto(`${h.URL}/play?takeover=${k.me.id}&key=dmkey`);
  await kp.waitForFunction(() => window.Strike);
  const kaiAttacks = () => dm.last.log.filter((l) => /^Kai attacks /.test(l.text) && !l.vis).length;
  ok(await turnOf(k), 'it is Kai\'s turn');
  await h.wait(200);
  await kp.click(`[data-attack="${bandit}"]`);
  ok(await kp.waitForSelector('#strike[data-mode="nodes"] .strike-node', { timeout: 2000 }).then(() => true, () => false), 'a monk gets numbered nodes on the silhouette');
  await h.wait(350);
  const nodes = await kp.$$eval('#strike .strike-node', (ns) => ns.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: n.textContent }; }));
  ok(nodes.map((n) => n.t).join() === '1,2,3,4', 'the nodes are numbered 1 to 4');
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/strike-nodes.png` });
  const k0 = kaiAttacks();
  // Starting on node 2 does nothing.
  await kp.mouse.move(nodes[1].x, nodes[1].y); await kp.mouse.down(); await kp.mouse.up();
  ok(/node 1/.test(await kp.locator('#strike .strike-hint').textContent()), 'starting on the wrong node says to start on 1');
  // Lifting halfway resets the chain.
  await kp.mouse.move(nodes[0].x, nodes[0].y); await kp.mouse.down();
  await kp.mouse.move(nodes[1].x, nodes[1].y, { steps: 6 }); await kp.mouse.up();
  ok(await kp.locator('#strike .strike-node.on').count() === 0 && kaiAttacks() === k0, 'lifting the finger halfway resets the chain');
  // The whole chain.
  await kp.mouse.move(nodes[0].x, nodes[0].y); await kp.mouse.down();
  for (let i = 1; i < 3; i++) await kp.mouse.move(nodes[i].x, nodes[i].y, { steps: 6 });
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/strike-nodes-chain.png` });
  await kp.mouse.move(nodes[3].x, nodes[3].y, { steps: 6 }); await kp.mouse.up();
  ok(await until(() => kaiAttacks() === k0 + 1, 3000), 'dragging through every node in order makes the attack');
  ok(await until(() => cues.some((c) => c.by?.id === k.me.id && c.style === 'combo'), 3000), 'the cue tells the screens it was a combo');
  if (SHOTS) { await kp.waitForSelector('#strike .strike-result:not([hidden])', { timeout: 3000 }).catch(() => {}); await kp.screenshot({ path: `${SHOTS}/strike-nodes-result.png` }); }
  await kp.waitForSelector('#strike', { state: 'detached', timeout: 4000 });

  // Gestures off: a tap attacks at once.
  dm.emit('dm:settings', { display: { gestures: 'off' } });
  await until(() => dm.last.settings.display.gestures === 'off');
  await nextTurn(); await nextTurn();
  ok(await myTurn(), 'Mira\'s turn a third time');
  await h.wait(200);
  const n2 = attacks();
  await ph.click(`[data-attack="${bandit}"]`);
  ok(await until(() => attacks() === n2 + 1, 3000) && await ph.locator('#strike').count() === 0, 'with strike gestures off the button attacks at once');

  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
