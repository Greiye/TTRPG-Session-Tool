// Lore sync in a real browser: Lore tab › Pull lore repo, the repo badges, and Push to lore repo (local clone
// mode, so nothing leaves the machine). SHOTS=dir saves a screenshot.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 5000 + Math.floor(Math.random() * 100);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-lsync-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };

let srv;
(async () => {
  const clone = path.join(TMP, 'clone');
  fs.mkdirSync(path.join(clone, 'content/lore'), { recursive: true });
  fs.writeFileSync(path.join(clone, 'content/lore/straphan-forest.md'), '---\ntitle: "Straphan Forest"\ncontributor: "mike"\ncredit_as: "Mike"\ncreated: 2026-10-21\ntags: [place]\ntype: lore\n---\n# Straphan Forest\n\nThese woods belong to the Fauna God.\n');
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  fs.writeFileSync(path.join(TMP, 'data', 'wiki.config'), JSON.stringify({ mode: 'folder', dir: clone }));
  srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '0', PORT, HTTPS: '0', DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const p = await br.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  await p.addInitScript(() => { try { localStorage.setItem('dmFoldOpen', '1'); } catch { /* ignore */ } });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await p.goto(`${B}/dm`);
  await p.waitForSelector('[data-stab="lore"]', { state: 'visible' });
  await p.click('[data-stab="lore"]');
  await p.waitForSelector('#loreRepoPull', { state: 'visible' });

  await p.click('#loreRepoPull');
  await p.waitForFunction(() => /Pulled: added 1/.test(document.querySelector('#loreMsg').textContent));
  ok(await p.locator('.lore-entry', { hasText: 'Straphan Forest' }).locator('.lore-badge.repo', { hasText: 'lore repo' }).count() === 1, 'a pulled book shows the lore repo badge');

  await p.fill('#loreName', 'Old Tom');
  await p.click('#loreAdd');
  await p.waitForFunction(() => document.querySelector('#lorePending').textContent === '(1)');
  ok(true, 'a new entry counts as waiting to be pushed');
  await p.click('#loreRepoPush');
  await p.waitForFunction(() => /Pushed 1 page/.test(document.querySelector('#loreMsg').textContent));
  await p.waitForFunction(() => document.querySelector('#lorePending').textContent === '');
  ok(fs.existsSync(path.join(clone, 'content/table/old-tom.md')), 'push writes the page into the clone');
  ok(await p.locator('.lore-entry', { hasText: 'Old Tom' }).locator('.lore-badge.repo', { hasText: 'synced' }).count() === 1, 'the pushed entry shows as synced');
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.locator('#loreCard').screenshot({ path: path.join(SHOTS, 'lore-sync.png') }); }
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await br.close();
  srv.kill();
  console.log(failures ? `\nlore-sync-ui: ${failures} failing` : '\nlore-sync-ui: all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); srv?.kill(); process.exit(1); });
