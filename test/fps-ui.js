// TV frame rate in a busy combat (Nov 24): eight creatures on the 3D map, the dice tray tumbling and hits landing.
// Prints the frame rate and the longest frame, so a change can be measured before and after (npm run fps).
// CI draws without a graphics card, so the check itself is loose: the TV must keep drawing and not freeze.
const { chromium } = require('playwright');
const { harness } = require('./helpers');

const h = harness('fps-ui');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const br = await chromium.launch();
  try {
    const dm = await h.dm();
    const pl = await h.player(await h.room(), 'Thorn', 'Fighter');
    for (let i = 1; i <= 8; i++) dm.emit('dm:enemy:add', { name: `Goblin ${i}`, hp: 200, ac: 10, atk: 4, dmg: 2 });
    await until(() => dm.last.combat.enemies.length === 8);
    dm.emit('dm:map', { cols: 16, rows: 10 });
    dm.last.combat.enemies.forEach((e, i) => dm.emit('dm:token', { id: e.id, x: 2 + i, y: 4 }));
    dm.emit('dm:mode', { mode: 'combat' });
    dm.emit('dm:combat:start');
    const tv = await br.newPage({ viewport: { width: 1280, height: 720 } });
    await tv.goto(`${h.URL}/screen`);
    await tv.waitForFunction(() => window.Dice3D && document.querySelector('#stage canvas, canvas'), null, { timeout: 15000 });
    const sample = tv.evaluate(() => new Promise((res) => {
      const t = [];
      const start = performance.now();
      const roll = () => window.Dice3D.show({ who: 'Thorn', label: 'Fireball', total: 28, dice: Array.from({ length: 8 }, () => ({ sides: 6, value: 1 + Math.floor(Math.random() * 6) })) });
      roll();
      const tick = (now) => { t.push(now); if (now - start < 4000) requestAnimationFrame(tick); else res(t); };
      requestAnimationFrame(tick);
    }));
    for (const e of dm.last.combat.enemies) dm.emit('dm:hp', { id: e.id, delta: -3 });
    dm.emit('dm:hp', { id: pl.me.id, delta: -2 });
    const times = await sample;
    const gaps = times.slice(1).map((x, i) => x - times[i]);
    const fps = (gaps.length * 1000) / (times.at(-1) - times[0]);
    console.log(`  TV in combat with dice: ${fps.toFixed(1)} frames a second, longest frame ${Math.max(...gaps).toFixed(0)} ms`);
    ok(gaps.length >= 8, `the TV keeps drawing (${gaps.length} frames in 4 s)`);
    ok(Math.max(...gaps) < 3000, 'no frame freezes the TV for 3 seconds');
  } catch (e) {
    ok(false, `test crashed: ${e.message}`);
  } finally {
    await br.close();
    await h.done(srv);
  }
})();
