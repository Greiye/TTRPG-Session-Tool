// Creature Designer pop-up (PR W) in a real browser: open it from Planning > Creatures, fill a design, preset
// stats, save, send to combat and lore, and download the page. SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 4900 + Math.floor(Math.random() * 100);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-cd-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };

let srv;
(async () => {
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', PORT, HTTPS: '0', DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const ctx = await br.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('dmFoldOpen', '1'); localStorage.setItem('dmPlanning', '1'); } catch { /* ignore */ } });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.on('dialog', (d) => d.accept());
  await p.goto(`${B}/dm`);
  await p.waitForSelector('[data-stab="designer"]', { state: 'visible' });
  await p.click('[data-stab="designer"]');
  await p.waitForSelector('#cdOpen', { state: 'visible' });
  ok(await p.isVisible('#cdWikiCard'), 'Planning > Creatures shows the designer and the wiki link');
  if (SHOTS) await p.locator('.dm-right').screenshot({ path: path.join(SHOTS, 'planning-creatures.png') });

  await p.click('#cdOpen');
  await p.waitForSelector('#cdDlg[open]');
  ok(await p.locator('[data-rows="details"] .cd-row').count() === 7, 'a new People design starts with seven details');
  await p.fill('#cdForm [name="name"]', 'Grey Goblin');
  await p.fill('#cdForm [name="title"]', 'Soldier strain of the Biomancer');
  await p.fill('#cdForm [name="summary"]', 'Three-foot pests that steal and breed.');
  await p.fill('[data-rows="details"] .cd-row:nth-child(2) [data-k="value"]', 'About 25 years');
  await p.click('[data-preset="daggerheart"]');
  ok(await p.locator('[data-rows="stats"] .cd-row').count() === 6 && await p.locator('[data-rows="vitals"] .cd-row').count() === 6, 'the Daggerheart preset fills six stats and six vitals');
  // Size, stats and skills are dropdowns (Mike, Nov 18).
  ok(await p.locator('[data-rows="details"] .cd-row:nth-child(1) select[data-k="value"]').count() === 1, 'Size is a dropdown');
  await p.selectOption('[data-rows="details"] .cd-row:nth-child(1) [data-k="value"]', 'Small');
  ok(await p.locator('[data-rows="stats"] .cd-row:nth-child(1) select[data-k="name"]').count() === 1, 'a stat name is a dropdown');
  await p.selectOption('[data-rows="stats"] .cd-row:nth-child(1) [data-k="value"]', '+2');
  await p.click('[data-add="skills"]');
  await p.selectOption('[data-rows="skills"] .cd-row:last-child [data-k="name"]', 'Stealth');
  await p.selectOption('[data-rows="skills"] .cd-row:last-child [data-k="value"]', '+4');
  await p.selectOption('[data-rows="skills"] .cd-row:last-child [data-k="name"]', '__other__');
  ok(await p.locator('[data-rows="skills"] .cd-row:last-child input[data-k="name"]').count() === 1, 'Other… turns the skill dropdown into a text box');
  await p.fill('[data-rows="skills"] .cd-row:last-child input[data-k="name"]', 'Scavenging');
  await p.fill('[data-rows="vitals"] .cd-row:nth-child(1) [data-k="value"]', '7');
  await p.fill('[data-rows="vitals"] .cd-row:nth-child(3) [data-k="value"]', '13');
  await p.click('[data-add="abilities"]');
  await p.fill('[data-rows="abilities"] .cd-row:last-child [data-k="name"]', 'Scrap Blade');
  await p.fill('[data-rows="abilities"] .cd-row:last-child [data-k="roll"]', '1d6+2');
  await p.fill('[data-rows="abilities"] .cd-row:last-child [data-k="text"]', '+4 to hit, a rusty knife.');
  await p.click('[data-add="inventory"]');
  await p.fill('[data-rows="inventory"] .cd-row:last-child [data-k="name"]', 'Rusty knife');
  await p.fill('#cdForm [name="lore"]', 'They multiply quickly and reach adulthood in five years.');
  await p.click('#cdSave');
  await p.waitForFunction(() => /Saved/.test(document.querySelector('#cdMsg').textContent));
  await p.waitForSelector('#cdList [data-open]');
  ok(await p.locator('#cdList [data-open]').count() === 1, 'the saved design is in the list');
  if (SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, 'designer-people.png') }); }

  await p.click('#cdCombat');
  await p.waitForFunction(() => /Combat/.test(document.querySelector('#cdMsg').textContent));
  const block = (await (await fetch(`${B}/api/creatures`)).json()).find((c) => c.name === 'Grey Goblin');
  ok(block && block.hp === 7 && block.ac === 13 && block.attacks[0].dmg === '1d6+2', 'To combat makes a stat block with HP 7, Evasion 13 and the blade');
  await p.click('#cdLore');
  await p.waitForFunction(() => /Lore tab/.test(document.querySelector('#cdMsg').textContent));
  ok(true, 'To lore adds the entry');
  const dl = p.waitForEvent('download');
  await p.click('#cdMd');
  const file = await (await dl).path();
  const md = fs.readFileSync(file, 'utf8');
  ok(md.includes('# Grey Goblin') && md.includes('- **Agility:** +2'), 'the .md download is the wiki page');
  ok(md.includes('- **Scavenging:** +4') && md.includes('Small'), 'the dropdown picks reach the page');
  ok(await p.isDisabled('#cdPush'), 'push waits until the wiki is connected');

  // A person of that people: the race field appears and "From race" copies stats.
  await p.click('#cdNew');
  await p.click('[data-kind="person"]');
  ok(await p.isVisible('#cdForm [name="race"]'), 'a Person gets a race field');
  await p.fill('#cdForm [name="name"]', 'Snitch');
  await p.fill('#cdForm [name="race"]', 'Grey Goblin');
  await p.click('#cdInherit');
  ok(await p.locator('[data-rows="abilities"] .cd-row').count() === 1 && await p.inputValue('[data-rows="stats"] .cd-row:nth-child(1) [data-k="value"]') === '+2', 'From race copies the people’s stats and abilities');
  await p.fill('[data-rows="details"] .cd-row:nth-child(1) [data-k="value"]', 'Pickpocket');
  await p.click('#cdSave');
  await p.waitForFunction(() => document.querySelectorAll('#cdList [data-open]').length === 2);
  if (SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: path.join(SHOTS, 'designer-person.png') }); }

  await p.click('[data-cd-list="wiki"]');
  ok(/Connect the wiki/.test(await p.textContent('#cdList')), 'the Wiki list asks to connect first');
  await p.click('#cdClose');
  await p.waitForSelector('#cdDlg:not([open])', { state: 'attached' });
  ok(await p.locator('#cdRecent .chip').count() === 2, 'the card lists the recent designs');
  if (SHOTS) {
    await p.click('#cdWikiCard > h3').catch(() => {});
    await p.locator('#cdWikiCard').screenshot({ path: path.join(SHOTS, 'wiki-link.png') }).catch(() => {});
  }

  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await br.close();
  srv.kill();
  console.log(failures ? `\ndesigner-ui: ${failures} failing` : '\ndesigner-ui: all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); srv?.kill(); process.exit(1); });
