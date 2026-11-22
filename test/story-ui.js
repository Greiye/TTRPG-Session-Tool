// Browser test (Mike, Nov 19): the DM's Keep star fills in, the Storybook page replays the session (stage, scrubber,
// kept ticks, transcript), keeps from the list, and links the story pack. Waits on the DOM, never a fixed time.
// Usage: node test/story-ui.js  (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 5200 + Math.floor(Math.random() * 300);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-story-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '0', PORT, HTTPS: '0', DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
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
    await dm.waitForSelector('#keepBtn');
    ok(await dm.isVisible('#keepBtn') && await dm.isVisible('#storyLink'), 'the DM bar has the Keep star and the Storybook link');

    // Play a little: narration, a social line, more narration.
    const say = (ev, data) => dm.evaluate(([e, d]) => window.dmEmit(e, d), [ev, data]);
    await say('dm:narrate', { text: 'The bell tolls over the drowned village.' });
    await say('dm:mode', { mode: 'social' });
    await say('dm:emotion', { emotion: 'fearful' });
    await say('dm:say', { text: 'They came up out of the water at night.' });
    await say('dm:narrate', { text: 'Somewhere below, something answers the bell.' });

    // K keeps the newest line (one socket keeps the order); the star fills in and names it.
    await dm.click('h2'); // focus off any field
    await dm.keyboard.press('k');
    await dm.waitForSelector('#keepBtn.kept', { timeout: 5000 });
    ok((await dm.textContent('#keepNote')).includes('something answers the bell'), 'K keeps the newest line and says which');
    await shot(dm, 'dm-keep.png');

    // The Storybook page.
    const sb = await page('/story', { viewport: { width: 1400, height: 900 } });
    await sb.waitForSelector('#sbMain:not([hidden]) .sb-row');
    ok(await sb.isVisible('#sbStage'), 'the storybook opens on the latest session');
    const rows = await sb.$$eval('.sb-row', (r) => r.map((x) => x.textContent));
    ok(rows.some((t) => t.includes('The bell tolls')) && rows.some((t) => t.includes('They came up out of the water')), 'the transcript lists the session');
    ok(await sb.$$eval('.sb-tick', (t) => t.length) >= 1, 'kept moments are ticks on the scrubber');

    // Jump to the kept tick: the stage shows that line.
    await sb.click('.sb-tick');
    await sb.waitForFunction(() => document.querySelector('#sbText').textContent.includes('something answers the bell'));
    ok((await sb.textContent('#sbStar')).includes('Kept'), 'the stage star shows it is kept');

    // Click the social line: the stage shows the speaker, the emotion and the social mood.
    await sb.click('.sb-row:has-text("They came up out of the water") span');
    await sb.waitForFunction(() => document.querySelector('#sbText').textContent.includes('They came up'));
    ok(/fearful/.test(await sb.textContent('#sbWho')) && /Social/.test(await sb.textContent('#sbMode')), 'the stage shows speaker, emotion and mode at that moment');
    // Social replays show the NPC (and the party, when heroes are at the table) on the stage, the speaker in front.
    await sb.waitForSelector('#sbVn:not([hidden]) .sb-npc.speaking .portrait');
    ok(await sb.isVisible('.sb-npc.speaking'), 'a social line shows the NPC who said it');
    await shot(sb, 'storybook.png');

    // Keep it from the stage star (K); it becomes a second tick.
    await sb.keyboard.press('k');
    await sb.waitForFunction(() => document.querySelectorAll('.sb-tick').length >= 2);
    ok(true, 'K on the storybook keeps the moment on the stage');
    // Reload: the keep was saved.
    await sb.reload();
    await sb.waitForSelector('.sb-row');
    ok(await sb.$$eval('.sb-row-star.kept', (s) => s.length) >= 2, 'keeps survive a reload');

    // Arrow keys step, Home of the scrubber via the range input.
    await sb.fill('#sbRange', '0');
    await sb.waitForFunction(() => document.querySelector('#sbAt').textContent.includes('1 of'));
    await sb.keyboard.press('ArrowRight');
    await sb.waitForFunction(() => document.querySelector('#sbAt').textContent.includes('2 of'));
    ok(true, 'the scrubber and arrow keys move through the session');

    // Playback buttons fill one row, at desktop width and on a phone.
    const oneRow = () => sb.$$eval('.sb-controls > *', (els) => { const tops = els.map((e) => Math.round(e.getBoundingClientRect().top)); const w = els.reduce((a, e) => a + e.getBoundingClientRect().width, 0);
      return new Set(tops).size === 1 && w > document.querySelector('.sb-controls').clientWidth * 0.85; });
    ok(await oneRow(), 'the playback buttons fill one row');
    await sb.setViewportSize({ width: 360, height: 760 });
    await sb.waitForFunction(() => getComputedStyle(document.querySelector('.sb-controls .lbl')).display === 'none');
    ok(await oneRow() && await sb.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'on a phone they stay in one row (icons only), no sideways scroll');
    await sb.setViewportSize({ width: 1400, height: 900 });

    // The log can be hidden; the choice survives a reload.
    ok(await sb.isVisible('#sbRight'), 'the log shows by default');
    await sb.click('#sbLogBtn');
    await sb.waitForSelector('#sbRight', { state: 'hidden' });
    const wide = await sb.$eval('#sbStage', (e) => e.getBoundingClientRect().width);
    ok(wide > 900, 'hiding the log gives the stage the width');
    await sb.reload();
    await sb.waitForSelector('#sbMain:not([hidden])');
    ok(!(await sb.isVisible('#sbRight')) && (await sb.getAttribute('#sbLogBtn', 'aria-pressed')) === 'false', 'the log stays hidden after a reload');
    await sb.keyboard.press('l');
    await sb.waitForSelector('#sbRight', { state: 'visible' });
    ok(true, 'L shows the log again');

    // Ren'Py button downloads a zip.
    const rp = await fetch(B + await sb.getAttribute('#sbRenpy', 'href'));
    ok(rp.status === 200 && (rp.headers.get('content-type') || '').includes('zip'), 'the Ren\'Py button downloads a zip');

    // Story pack link downloads a zip.
    const href = await sb.getAttribute('#sbPack', 'href');
    const res = await fetch(B + href);
    ok(res.status === 200 && (res.headers.get('content-type') || '').includes('zip'), 'the Story pack button downloads a zip');

    ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    ok(false, `crashed: ${e.stack || e.message}`);
  } finally {
    await br.close();
    const exited = new Promise((r) => srv.once('exit', r));
    srv.kill();
    await exited; // the server saves on exit; remove its folder after that
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the OS cleans tmp */ }
  }
  if (failures) { console.log(`\nstory-ui: ${failures} failing`); process.exit(1); }
  console.log('\nstory-ui: all passed');
})();
