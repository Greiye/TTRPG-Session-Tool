// Browser test: every text box and dropdown on the DM screen is wide enough to show its whole value or
// placeholder, in every mode, tab and part, at the common laptop widths.
// Usage: node test/dm-fields.js  (needs Playwright, preinstalled in dev containers)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 3700 + Math.floor(Math.random() * 100);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-fields-'));
const SKIP = ['checkbox', 'radio', 'range', 'color', 'file', 'hidden'];

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const bad = new Map();
  for (const width of [1280, 1500]) {
    const p = await (await br.newContext({ viewport: { width, height: 900 } })).newPage();
    await p.goto(`http://127.0.0.1:${PORT}/dm`);
    await p.waitForSelector('[data-stab]');
    if ((await p.getAttribute('#planToggle', 'aria-pressed')) !== 'true') await p.click('#planToggle');
    for (const mode of ['exploration', 'social', 'combat']) {
      await p.click(`[data-mode="${mode}"]`);
      await p.waitForTimeout(300);
      for (const tab of await p.$$eval('[data-stab]:not([hidden])', (b) => b.map((x) => x.dataset.stab))) {
        await p.click(`[data-stab="${tab}"]`);
        const subs = await p.$$eval('[data-sub-pick]', (b) => b.map((x) => x.dataset.subPick));
        for (const sub of subs.length ? subs : [null]) {
          if (sub) await p.click(`[data-sub-pick="${sub}"]`);
          await p.waitForTimeout(100);
          const found = await p.evaluate((skip) => {
            const ctx = document.createElement('canvas').getContext('2d');
            const out = [];
            document.querySelectorAll('input, select, textarea').forEach((el) => {
              if (!el.offsetParent || skip.includes(el.type)) return;
              const cs = getComputedStyle(el);
              const name = el.id || el.getAttribute('aria-label') || el.outerHTML.slice(0, 60);
              if (el.tagName === 'TEXTAREA') {
                if (el.scrollHeight > el.clientHeight + 2) out.push(`${name}: textarea needs scrolling`);
                return;
              }
              ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
              const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (el.tagName === 'SELECT' ? 18 : 0);
              const text = el.tagName === 'SELECT' ? el.selectedOptions[0]?.text || '' : el.value;
              const need = Math.max(ctx.measureText(text).width, ctx.measureText(el.placeholder || '').width);
              if (need > room + 1) out.push(`${name}: ${Math.round(room)}px shows "${text || el.placeholder}" (${Math.round(need)}px)`);
            });
            return out;
          }, SKIP);
          for (const f of found) bad.set(f, `${width}px ${mode}/${tab}${sub ? '/' + sub : ''}`);
        }
      }
    }
    await p.context().close();
  }
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true });
  if (bad.size) { console.error('Cut-off DM fields:\n' + [...bad].map(([f, w]) => `  ${w}  ${f}`).join('\n')); process.exit(1); }
  console.log('dm-fields: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
