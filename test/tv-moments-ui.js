// Browser test for PR I (TV moments and rolls, Mike Nov 16): rolls sit in the centre and fade out, natural 20
// and natural 1 brighten or dim the TV, covered points of interest stay off the TV, mode titles never stack,
// timed moment cards fade, and clocks are cut into wedges from the centre on the TV and the DM.
// Usage: node test/tv-moments-ui.js  (SHOTS=dir also saves screenshots)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { settled } = require('./helpers');

const PORT = 4100 + Math.floor(Math.random() * 100);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-tvm-'));
const SHOTS = process.env.SHOTS;
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '0', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const fail = (m) => { errors.push(m); if (process.env.DEBUG) console.log('FAIL', m); };
  const page = async (url, viewport) => {
    const p = await (await br.newContext({ viewport })).newPage();
    await p.addInitScript(() => { try { localStorage.setItem('dmFoldOpen', '1'); } catch { /* ignore */ } }); // DM cards start open in tests
    p.on('pageerror', (e) => fail(`${url}: ${e.message}`));
    await p.goto(B + url);
    return p;
  };
  const dm = await page('/dm', { width: 1500, height: 950 });
  const tv = await page('/screen', { width: 1280, height: 720 });
  await tv.waitForFunction(() => window.tvLast);
  await tv.evaluate(() => { document.getElementById('tvStats').hidden = true; });
  const emit = (ev, data) => dm.evaluate(([e, d]) => socket.emit(e, d), [ev, data]);
  const shot = (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
  const centre = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });

  // Points of interest: covered ones are not on the TV at all; an uncovered one appears.
  await emit('dm:mode', { mode: 'exploration' });
  await emit('dm:worldmap:show', { on: false }); // a session opens on the world map; this test needs the stage
  await emit('dm:scene', { title: 'Old mill', text: 'Wind turns a broken wheel.', theme: 'default', poi: ['Wheel', 'Loft', 'Cellar door'] });
  await tv.waitForFunction(() => document.querySelector('.explore h1')?.textContent === 'Old mill');
  if (await tv.$('.poi .fog')) fail('covered points should not show as ??? chips on the TV');
  if (await tv.$('.poi span')) fail('no point should show on the TV before the DM uncovers one');
  await emit('dm:reveal', { poi: 'Loft' });
  await tv.waitForFunction(() => document.querySelector('.poi span')?.textContent.includes('Loft'), null, { timeout: 3000 }).catch(() => fail('an uncovered point should show on the TV'));
  if ((await tv.$$('.poi span')).length !== 1) fail('only the uncovered point shows');

  // Rolls: centred, fade out (an .out phase) rather than vanish.
  await tv.evaluate(() => RollPop.show({ who: 'Thorn', label: 'Athletics', dice: [{ sides: 20, value: 12, kept: true }], total: 15, outcome: 'pass' }));
  await settled(tv, '.rollpop');
  const pop = await centre(tv, '.rollpop');
  if (Math.abs(pop.cx - 640) > 20 || Math.abs(pop.cy - 360) > 40) fail(`roll popup should sit in the centre: ${JSON.stringify(pop)}`);
  await tv.waitForSelector('.rollpop.out', { timeout: 3000 }).catch(() => fail('roll popup should fade out'));
  await tv.waitForSelector('.rollpop', { state: 'hidden', timeout: 2000 }).catch(() => fail('roll popup should hide after its fade'));

  // Natural 20: gold burst and a brighter screen; natural 1: a darker screen.
  await tv.evaluate(() => RollPop.show({ who: 'Vex', label: 'Stealth', dice: [{ sides: 20, value: 20, kept: true }], total: 27, crit: true }));
  await tv.waitForFunction(() => { const m = document.querySelector('.roll-mood'); return m && !m.hidden && /brightness\(1\.[1-9]/.test(getComputedStyle(m).backdropFilter); }, null, { timeout: 3000 }).catch(() => {});
  const mood = () => tv.evaluate(() => { const m = document.querySelector('.roll-mood'); return m && !m.hidden ? `${m.className}|${getComputedStyle(m).backdropFilter}` : null; });
  const crit = await mood();
  if (!crit || !/crit\b.*brightness\(1\.[1-9]/.test(crit)) fail('a natural 20 should brighten the TV: ' + crit);
  if (!(await tv.$('.rollpop.crit .rp-nat'))) fail('a natural 20 shows its banner');
  await shot(tv, 'tv-nat20');
  await tv.evaluate(() => RollPop.show({ who: 'Vex', label: 'Stealth', dice: [{ sides: 20, value: 1, kept: true }], total: 8, fumble: true }));
  await tv.waitForFunction(() => { const m = document.querySelector('.roll-mood'); return m && !m.hidden && /brightness\(0\.[0-9]/.test(getComputedStyle(m).backdropFilter); }, null, { timeout: 3000 }).catch(() => {});
  const fum = await mood();
  if (!fum || !/fumble.*brightness\(0\.[0-9]/.test(fum)) fail('a natural 1 should darken the TV: ' + fum);
  await shot(tv, 'tv-nat1');
  await tv.evaluate(() => RollPop.hide());
  await tv.waitForSelector('.roll-mood', { state: 'hidden', timeout: 2000 }).catch(() => fail('the screen mood should fade back after the roll'));

  // 3D dice tray: centred on the TV and fades out.
  await tv.evaluate(() => Dice3D.show({ who: 'Elowen', label: 'Arcana', dice: [{ sides: 20, value: 20, kept: true }], total: 25, crit: true }));
  await settled(tv, '.dice-tray');
  const tray = await centre(tv, '.dice-tray');
  if (Math.abs(tray.cx - 640) > 10 || Math.abs(tray.cy - 360) > 10) fail('dice tray should sit in the centre: ' + JSON.stringify(tray));
  await tv.waitForSelector('.roll-mood.crit:not([hidden])', { timeout: 4000 }).catch(() => {});
  if (!(await tv.$('.roll-mood.crit:not([hidden])'))) fail('a natural 20 on the dice tray brightens the TV once the dice settle');
  await shot(tv, 'tv-tray-nat20');
  await tv.evaluate(() => Dice3D.hide());
  await tv.waitForSelector('.dice-tray.out', { state: 'attached', timeout: 1000 }).catch(() => fail('dice tray should fade out'));
  await tv.waitForSelector('.dice-tray', { state: 'hidden', timeout: 2000 }).catch(() => fail('dice tray hides after its fade'));

  // Mode titles: a quick second switch replaces the first card instead of stacking on it.
  await emit('dm:mode', { mode: 'combat' });
  await tv.waitForSelector('.mode-title');
  await emit('dm:mode', { mode: 'exploration' });
  await tv.waitForFunction(() => document.querySelector('.mode-title:last-of-type')?.textContent.includes('EXPLORATION'));
  if ((await tv.$$('.mode-title')).length !== 1) fail('mode titles overlap');

  // Chapter card: fades out (opacity drops) before it hides; the log keeps it.
  // Wait for the state that carries the line: another update (a ticker) can arrive first.
  const logged = dm.evaluate(() => new Promise((r) => {
    const on = (s) => { if (s.log.some((l) => l.text === 'Chapter: The long night (Act two)')) { socket.off('state', on); r(true); } };
    socket.on('state', on);
    setTimeout(() => { socket.off('state', on); r(false); }, 4000);
  }));
  await emit('dm:tv:chapter', { title: 'The long night', sub: 'Act two' });
  if (!(await logged)) fail('chapter card should be in the log');
  await tv.waitForSelector('.mo-chapter:not([hidden])');
  await shot(tv, 'tv-chapter');
  // Past the entrance, which also starts from opacity 0: wait until the card is fully shown.
  await tv.waitForFunction(() => Number(getComputedStyle(document.querySelector('.mo-chapter .mo-card')).opacity) >= 0.99, null, { timeout: 5000, polling: 50 }).catch(() => fail('chapter card should fade in'));
  await tv.waitForFunction(() => { const c = document.querySelector('.mo-chapter .mo-card'); return c && !c.parentElement.hidden && Number(getComputedStyle(c).opacity) < 0.9; }, null, { timeout: 8000, polling: 50 }) // the card shows for 5.2 s.catch(() => fail('chapter card should fade out'));
  await tv.waitForSelector('.mo-chapter', { state: 'hidden', timeout: 2000 }).catch(() => fail('chapter card hides after fading'));

  // Clocks: wedges from the centre on the TV and in the DM's clock list.
  const added = dm.evaluate(() => new Promise((r) => { const on = (s) => { if (s.clocks?.[0]) { socket.off('state', on); r(s); } }; socket.on('state', on); }));
  await emit('dm:clock:add', { name: 'Ritual', segments: 6 });
  const id = (await added).clocks[0].id;
  await tv.waitForSelector('.clock svg.pie');
  await emit('dm:clock:fill', { id, delta: 1 });
  await emit('dm:clock:fill', { id, delta: 1 });
  await tv.waitForFunction(() => document.querySelectorAll('.clock .pie .wedges .on').length === 2);
  const tvPie = await tv.$eval('.clock .pie', (p) => ({ wedges: p.querySelectorAll('.wedges path').length, spokes: p.querySelectorAll('.spokes line').length }));
  if (tvPie.wedges !== 6 || tvPie.spokes !== 6) fail('TV clock should have 6 wedges and spokes: ' + JSON.stringify(tvPie));
  if (await tv.$('.pie i')) fail('clock should not use vertical bars');
  await settled(tv, '.clock');
  await shot(tv, 'tv-clock');
  await dm.waitForFunction(() => document.querySelectorAll('#clockList .pie .wedges path').length === 6, null, { timeout: 3000 }).catch(() => fail('DM clock list should show the wedge clock'));

  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  if (errors.length) { console.error('tv-moments-ui errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('tv-moments-ui: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
