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
  dm.emit('dm:sheet', { id: a.me.id, inv: { op: 'add', name: 'Longsword', qty: 1, note: '[1d8 slashing]' } });
  dm.emit('dm:sheet', { id: a.me.id, inv: { op: 'add', name: 'Dagger', qty: 1 } });
  await h.wait(200);
  const cues = [];
  dm.on('cfx', (c) => cues.push(c));
  dm.emit('dm:enemy:add', { name: 'Bandit', hp: 200, ac: 1, atk: 0, dmg: 1 });
  dm.emit('dm:enemy:add', { name: 'Wolf', hp: 200, ac: 1, atk: 0, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 2);
  const [bandit, wolf] = dm.last.combat.enemies.map((e) => e.id);
  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  const turnOf = async (who) => {
    for (let i = 0; i < 8 && dm.last.combat.order[dm.last.combat.turn]?.id !== who.me.id; i++) { dm.emit('dm:combat:next'); await h.wait(120); }
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
  const prof = (item) => ph.evaluate((i) => { const w = Strike.weaponOf(i); return w ? `${w.style}/${w.weight}` : 'none'; }, item);
  ok(await prof({ name: 'Dagger', qty: 1 }) === 'pierce/light' && await prof({ name: 'Mace', qty: 1 }) === 'nodes/heavy' && await prof({ name: 'Longsword', qty: 1 }) === 'slash/medium' && await prof({ name: 'Iron gauntlets', qty: 1 }) === 'nodes/light', 'the weapon decides the strike: dagger pierces lightly, mace nodes heavily, longsword slashes, gauntlets nodes');
  ok(await prof({ name: 'Odd thing', qty: 1, note: 'Strange. [1d6 bludgeoning; heavy]' }) === 'nodes/heavy' && await prof({ name: 'Rope (50 ft)', qty: 1 }) === 'none', 'an unknown weapon is read from its note; gear is not a weapon');
  ok(await ph.evaluate(() => Strike.weaponsOf({ cls: 'Monk', inventory: [] }).map((w) => w.name).join()) === 'Unarmed', 'with no weapon the class does not matter: unarmed nodes');
  ok(await ph.evaluate(() => { const c = Strike.pickChain('humanoid', 4); return c.length === 4 && new Set(c.map(String)).size === 4; }), 'a node chain has different spots');
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
  dm.emit('dm:combat:next'); dm.emit('dm:combat:next'); await h.wait(300);
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

  // Pierce: switch to the dagger and hold until the ring closes.
  await ph.click('#strike [data-weapon="1"]');
  ok(/hold/i.test(await ph.locator('#strike .strike-hint').textContent()), 'picking the dagger switches to a piercing hold');
  await ph.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await ph.mouse.down();
  await h.wait(200);
  ok(await ph.locator('#strike .strike-ring:not([hidden])').count() === 1, 'holding shows the closing ring');
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/strike-hold.png` });
  await h.wait(800);
  await ph.mouse.up();
  ok(await until(() => attacks() === n1 + 1, 3000), 'holding until the ring closes makes a piercing attack');
  await ph.waitForSelector('#strike', { state: 'detached', timeout: 4000 });

  // Node strike: Kai has no weapon, so the strike is unarmed: drag through numbered nodes in order.
  const kp = await ctx.newPage();
  kp.on('pageerror', (e) => errors.push(e.message));
  await kp.goto(`${h.URL}/play?takeover=${k.me.id}&key=dmkey`);
  await kp.waitForFunction(() => window.Strike);
  const kaiAttacks = () => dm.last.log.filter((l) => /^Kai attacks /.test(l.text) && !l.vis).length;
  ok(await turnOf(k), 'it is Kai\'s turn');
  await h.wait(200);
  await kp.click(`[data-attack="${bandit}"]`);
  ok(await kp.waitForSelector('#strike[data-mode="nodes"] .strike-node', { timeout: 2000 }).then(() => true, () => false), 'unarmed gets numbered nodes on the silhouette');
  await h.wait(350);
  const nodes = await kp.$$eval('#strike .strike-node', (ns) => ns.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: n.textContent }; }));
  ok(nodes.map((n) => n.t).join() === '1,2,3', 'the nodes are numbered 1 to 3');
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/strike-nodes.png` });
  const k0 = kaiAttacks();
  // Starting on node 2 does nothing.
  await kp.mouse.move(nodes[1].x, nodes[1].y); await kp.mouse.down(); await kp.mouse.up();
  ok(/node 1/.test(await kp.locator('#strike .strike-hint').textContent()), 'starting on the wrong node says to start on 1');
  // Lifting halfway resets the chain.
  await kp.mouse.move(nodes[0].x, nodes[0].y); await kp.mouse.down();
  await h.wait(260);
  await kp.mouse.move(nodes[1].x, nodes[1].y, { steps: 6 }); await kp.mouse.up();
  ok(await kp.locator('#strike .strike-node.on').count() === 0 && kaiAttacks() === k0, 'lifting the finger halfway resets the chain');
  // The whole chain, waiting out each node's pulse (light: unarmed).
  await kp.mouse.move(nodes[0].x, nodes[0].y); await kp.mouse.down();
  await kp.waitForSelector('#strike .strike-node.pulse', { timeout: 500 }).catch(() => {});
  ok(await kp.locator('#strike .strike-node.pulse').count() === 1, 'a node pulses after it is struck');
  await h.wait(260);
  await kp.mouse.move(nodes[1].x, nodes[1].y, { steps: 6 });
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/strike-nodes-chain.png` });
  await h.wait(260);
  await kp.mouse.move(nodes[2].x, nodes[2].y, { steps: 6 }); await kp.mouse.up();
  ok(await until(() => kaiAttacks() === k0 + 1, 3000), 'dragging through every node in order makes the attack');
  ok(await until(() => cues.some((c) => c.by?.id === k.me.id && c.style === 'combo'), 3000), 'the cue tells the screens it was a combo');
  if (SHOTS) { await kp.waitForSelector('#strike .strike-result:not([hidden])', { timeout: 3000 }).catch(() => {}); await kp.screenshot({ path: `${SHOTS}/strike-nodes-result.png` }); }
  await kp.waitForSelector('#strike', { state: 'detached', timeout: 4000 });

  // Special moves: the builder lays out a chain by tapping the body and saves it on the character.
  await kp.evaluate(() => Strike.openMoveBuilder({ moves: [] }));
  await kp.waitForSelector('#moveBuild .strike-field'); await h.wait(350);
  const bf = await kp.locator('#moveBuild .strike-field').boundingBox();
  const tapAt = (fx, fy) => kp.mouse.click(bf.x + bf.width * fx, bf.y + bf.height * fy);
  await tapAt(0.5, 0.4);
  await kp.click('#moveBuild [data-kind="twin"]'); await tapAt(0.42, 0.8); await tapAt(0.58, 0.8);
  await kp.click('#moveBuild [data-kind="spell"]'); await tapAt(0.5, 0.17);
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/move-builder.png` });
  await kp.click('#moveBuild [data-b="save"]');
  const kaiMoves = () => dm.last.players.find((p) => p.id === k.me.id)?.moves || [];
  ok(await until(() => kaiMoves()[0]?.steps.map((s) => s.k).join() === 'hit,twin,spell', 3000), 'a built move is saved on the character');

  // A mixed chain with every kind of step, two fingers included.
  dm.emit('dm:sheet', { id: k.me.id, moves: [kaiMoves()[0], { steps: [
    { k: 'hit', x: 100, y: 105 }, { k: 'slash', x: 45, y: 140, x2: 155, y2: 140 }, { k: 'pierce', x: 100, y: 160 },
    { k: 'twin', x: 83, y: 235, x2: 117, y2: 235 }, { k: 'twinslash', x: 30, y: 60, x2: 75, y2: 60, x3: 125, y3: 60, x4: 170, y4: 60 }, { k: 'spell', x: 100, y: 42 },
    { k: 'bogus', x: 1, y: 1 },
  ] }] });
  ok(await until(() => kaiMoves()[1]?.steps.length === 6, 3000), 'the server keeps the valid steps of a move');
  dm.emit('dm:combat:next'); await h.wait(300);
  ok(await turnOf(k), 'Kai\'s turn again');
  await h.wait(200);
  const k1 = kaiAttacks(), c1 = cues.length;
  await kp.click(`[data-attack="${wolf}"]`);
  await kp.waitForSelector('#strike [data-move="1"]');
  await kp.click('#strike [data-move="1"]');
  await h.wait(100);
  ok(/hit, slash, pierce, two-press, two-slash, spell/.test(await kp.locator('#strike .strike-hint').textContent()), 'picking a move lays out its chain and names the steps');
  if (SHOTS) await kp.screenshot({ path: `${SHOTS}/move-chain.png` });
  await kp.evaluate(async () => {
    const f = document.querySelector('#strike .strike-field');
    const fire = (t, id, p) => f.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: p.x, clientY: p.y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let here = null;
    const go = async (b, n = 5) => { const a = here; for (let i = 1; i <= n; i++) { fire('pointermove', 1, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }); await wait(12); } here = b; };
    const P = Strike.chainPoints();
    here = P[0][0]; fire('pointerdown', 1, here); await wait(240); // hit
    await go(P[1][0]); await go(P[1][1]); await wait(240); // slash
    await go(P[2][0]); await wait(750); // pierce: hold through the ring
    await go(P[3][0]); fire('pointerdown', 2, P[3][1]); await wait(30); fire('pointerup', 2, P[3][1]); await wait(240); // two-press
    await go(P[4][0]); fire('pointerdown', 2, P[4][2]); // two-slash: both fingers at once
    for (let i = 1; i <= 6; i++) {
      fire('pointermove', 1, { x: P[4][0].x + ((P[4][1].x - P[4][0].x) * i) / 6, y: P[4][0].y });
      fire('pointermove', 2, { x: P[4][2].x + ((P[4][3].x - P[4][2].x) * i) / 6, y: P[4][2].y });
      await wait(12);
    }
    here = P[4][1]; fire('pointerup', 2, P[4][3]); await wait(240);
    await go(P[5][0]); // spell: circle the rune
    const c = P[5][0];
    for (let i = 0; i <= 26; i++) { const t = (i / 24) * 2 * Math.PI; fire('pointermove', 1, { x: c.x + 26 * Math.cos(t), y: c.y + 26 * Math.sin(t) }); await wait(10); }
    fire('pointerup', 1, c);
  });
  ok(await until(() => kaiAttacks() === k1 + 1, 3000) && await until(() => cues.slice(c1).some((c) => c.by?.id === k.me.id && c.style === 'combo'), 3000), 'a mixed chain with two-finger steps lands as a combo');
  await kp.waitForSelector('#strike', { state: 'detached', timeout: 4000 });

  // Gestures off: a tap attacks at once.
  dm.emit('dm:settings', { display: { gestures: 'off' } });
  await until(() => dm.last.settings.display.gestures === 'off');
  dm.emit('dm:combat:next'); dm.emit('dm:combat:next'); await h.wait(300);
  ok(await myTurn(), 'Mira\'s turn a third time');
  await h.wait(200);
  const n2 = attacks();
  await ph.click(`[data-attack="${bandit}"]`);
  ok(await until(() => attacks() === n2 + 1, 3000) && await ph.locator('#strike').count() === 0, 'with strike gestures off the button attacks at once');

  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await b.close();
  await h.done(srv);
})();
