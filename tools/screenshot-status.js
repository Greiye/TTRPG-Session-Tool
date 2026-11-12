const { chromium, devices } = require('playwright');
// Usage: start the server (PORT=3123 npm start) with an empty data/, then: node tools/screenshot-status.js screenshots
const OUT = process.argv[2] || 'screenshots', B = process.env.BASE || 'http://localhost:3123', D = new Date().toISOString().slice(0, 10);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const br = await chromium.launch();
  const dmCtx = await br.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const tvCtx = await br.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const dm = await dmCtx.newPage(); await dm.goto(B + '/dm');
  const tv = await tvCtx.newPage(); await tv.goto(B + '/screen');
  const { room } = await (await fetch(B + '/api/join-info')).json();
  const phones = [];
  const party = [['Thorn', 'Fighter', 'Dwarf', 'Mike'], ['Vex', 'Rogue', 'Tiefling', 'Sam']];
  for (const [name, cls, race, player] of party) {
    const ctx = await br.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage(); await p.goto(B + '/play?room=' + room);
    await p.waitForTimeout(800); if (await p.isVisible('#newBtn')) await p.click('#newBtn'); await p.fill('#name', name); await p.fill('#race', race); await p.fill('#player', player);
    await p.click(`[data-cls="${cls}"]`); await p.click('#joinBtn'); phones.push(p);
  }
  await wait(1000);
  const emit = (ev, data) => dm.evaluate(([e, d]) => socket.emit(e, d), [ev, data]);
  const shot = async (view) => {
    await wait(1500);
    await tv.screenshot({ path: `${OUT}/status-${D}-${view}-tv.png` });
    await dm.screenshot({ path: `${OUT}/status-${D}-${view}-dm.png`, fullPage: true });
    await phones[0].screenshot({ path: `${OUT}/status-${D}-${view}-phone.png`, fullPage: true });
  };
  // Lobby phone (before join) on a fresh device
  { const ctx = await br.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage(); await p.goto(B + '/play'); await wait(1000);
    await p.screenshot({ path: `${OUT}/status-${D}-join-phone.png` }); await ctx.close(); }
  // Exploration with an active check
  await emit('dm:mode', { mode: 'exploration' });
  await emit('dm:check', { skill: 'Perception', dc: 13 });
  await shot('exploration');
  await emit('dm:check', {});
  // Combat
  await emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13, atk: 4, dmg: 2 });
  await emit('dm:enemy:add', { name: 'Bugbear', hp: 27, ac: 16, atk: 4, dmg: 2 });
  await emit('dm:combat:start', {});
  await wait(500);
  // advance until Thorn's turn, so the phone shows actions
  for (let i = 0; i < 4; i++) {
    const isThorn = await phones[0].evaluate(() => !!document.querySelector('#main button[data-act], #main [data-act]'));
    if (isThorn) break;
    await emit('dm:combat:next', {}); await wait(400);
  }
  await wait(5000); // let turn card fade
  await shot('combat');
  await emit('dm:combat:end', {});
  // Social
  await emit('dm:mode', { mode: 'social' });
  await emit('dm:emotion', { emotion: 'suspicious' });
  await emit('dm:say', { text: 'Strangers asking about the old mill? Folk who go there don\'t come back.' });
  await emit('dm:choices', { choices: ['Ask about the missing cart', 'Offer coin for information', 'Leave quietly'] });
  await wait(4000); await shot('social');
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
