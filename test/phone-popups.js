// Browser test (Mike, Nov 16): DM messages and roll calls pop up on phones and stay until answered.
// Usage: node test/phone-popups.js  (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

const PORT = 3950 + Math.floor(Math.random() * 40);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-pp-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(B + url);
    return p;
  };
  try {
    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    const { room } = await (await fetch(B + '/api/join-info')).json();
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('[data-cls]');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.fill('#name', 'Thorn');
    await ph.click('[data-cls]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('#gameView:not([hidden])', { timeout: 5000 });
    await dm.waitForSelector('[data-stab="messages"]');

    // Message: a pop-up with Continue, not an inbox item. The DM sees who read it.
    await dm.click('[data-stab="messages"]');
    await dm.evaluate(() => document.querySelectorAll('.card.folded').forEach((c) => c.classList.remove('folded'))); // cards start folded (Mike, Nov 16)
    await dm.fill('#hoTitle', 'Wanted poster');
    await dm.fill('#hoText', 'Reward: 50 gp for the wolf.');
    await dm.click('[data-act="handout"]');
    await ph.waitForSelector('.phone-pop[data-kind="msg"] .pp-continue', { timeout: 5000 });
    ok((await ph.textContent('.phone-pop')).includes('Reward: 50 gp'), 'message pops up on the phone');
    if (SHOTS) await ph.screenshot({ path: `${SHOTS}/phone-message.png` });
    await ph.waitForTimeout(400);
    ok(await ph.isVisible('.phone-pop'), 'message stays up until Continue');
    ok(!(await ph.$eval('#tabInbox', (e) => e.textContent)).includes('Wanted poster'), 'message is not in the inbox');
    await ph.click('.phone-pop .pp-continue');
    await ph.waitForSelector('.phone-pop', { state: 'detached', timeout: 3000 });
    ok(!!(await dm.waitForFunction(() => document.querySelector('#msgList').textContent.includes('read by all'), null, { timeout: 3000 }).catch(() => null)), 'DM sees the message was read');

    ok(!(await dm.$('.vote-card')), 'the Party vote window is gone (Mike, Nov 18)');

    // Roll call: roll type changes the outcome text; the call pops up on the phone.
    await dm.click('[data-stab="rolls"]');
    await dm.evaluate(() => document.querySelectorAll('.card.folded').forEach((c) => c.classList.remove('folded'))); // cards start folded (Mike, Nov 16)
    const skillPh = await dm.getAttribute('#callPass', 'placeholder');
    await dm.selectOption('#callKind', 'save');
    const savePh = await dm.getAttribute('#callPass', 'placeholder');
    ok(skillPh !== savePh && /save/i.test(savePh), `roll type changes the outcome text (${savePh})`);
    ok((await dm.textContent('#checkSkillLbl')) === 'Saving throw', 'roll type renames the second drop-down');
    if (SHOTS) await dm.locator('#callOutcomeNote').locator('xpath=..').screenshot({ path: `${SHOTS}/dm-rollcall.png` });
    await dm.click('[data-act="callSend"]');
    await ph.waitForSelector('.phone-pop[data-kind="call"] [data-pp="roll"]', { timeout: 5000 });
    if (SHOTS) await ph.screenshot({ path: `${SHOTS}/phone-rollcall.png` });
    await ph.click('.phone-pop [data-pp="roll"]');
    await ph.waitForSelector('.phone-pop .pp-result', { timeout: 3000 });
    if (SHOTS) await ph.screenshot({ path: `${SHOTS}/phone-rollcall-result.png` });
    ok(await ph.isVisible('.phone-pop [data-pp="call-close"]'), 'roll call shows the result and Continue');
    await ph.click('.phone-pop [data-pp="call-close"]');
    await ph.waitForSelector('.phone-pop', { state: 'detached', timeout: 3000 });
    ok(true, 'Continue closes the roll call');
  } catch (e) { errors.push(e.message); }
  for (const e of errors) ok(false, e);
  await br.close(); srv.kill();
  console.log(failures ? `phone-popups: ${failures} failed` : 'phone-popups: all passed');
  process.exit(failures ? 1 : 0);
})();
