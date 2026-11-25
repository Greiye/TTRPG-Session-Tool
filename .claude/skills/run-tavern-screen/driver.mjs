#!/usr/bin/env node
// Tavern Screen driver: boots server.js on a throwaway DATA_DIR, opens DM / TV / phone pages in headless
// Chromium, and reads one command per line from stdin (pipe a heredoc, or run it in tmux).
// Never touches the real data/ or uploads/.
//
// Commands (page = dm | tv | <phone name>):
//   join <name> [class]       open a phone (iPhone 13) and join the table as <name>
//   mode <exploration|social|combat>
//   emit <event> [json]       socket.emit from the DM page (any dm:* event in src/sockets/*.js), prints the ack
//   hold <page> <ms> <selector>   press and hold (many buttons here are hold-to-confirm)
//   click <page> <selector>   fill <page> <selector> <text>   wait <page> <selector>
//   eval <page> <js>          run JS in the page, print the JSON result (DM page has a global `socket`)
//   ss <page> [file]          screenshot (default <OUT>/<page>-<n>.png)
//   state                     mode, players, NPC, combat summary (DM view)
//   errors                    page errors / console errors seen so far
//   sleep <ms>                only for "nothing should happen" checks; prefer wait
//   quit
// Env: OUT (screenshot dir, default ./shots), PORT (default random 4200-5699), KEEP=1 keeps the temp dir.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright'); // global install in the container (NODE_PATH)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.resolve(process.env.OUT || 'shots');
fs.mkdirSync(OUT, { recursive: true });
let PORT = Number(process.env.PORT); if (!PORT) do PORT = 4200 + Math.floor(Math.random() * 1500); while (PORT === 5060 || PORT === 5061);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-drive-'));

const log = (...a) => console.log(...a);
const srv = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, LOBBY: '0', TEST_MODE: '0', HTTPS: '0', PORT, DM_KEY: 'dmkey', DATA_DIR: path.join(TMP, 'data'), UPLOAD_DIR: path.join(TMP, 'uploads') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
await new Promise((res, rej) => { srv.stdout.on('data', (d) => /running/.test(d) && res()); srv.on('exit', (c) => rej(new Error('server exited ' + c))); });
log(`server up: ${B}  (data in ${TMP})`);

const br = await chromium.launch();
let quitting = false;
br.on('disconnected', () => { if (!quitting) log('!! browser disconnected'); });
const pages = {}; const errors = []; let n = 0;
async function open(name, url, ctxOpts) {
  const ctx = await br.newContext(ctxOpts);
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('dmFoldOpen', '1'); } catch { /* private mode */ } });
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  await p.goto(B + url);
  pages[name] = p;
  return p;
}
await open('dm', '/dm', { viewport: { width: 1500, height: 950 } });
await pages.dm.waitForFunction(() => window.socket?.connected, null, { timeout: 10000 });
await open('tv', '/screen', { viewport: { width: 1280, height: 720 } });
// The TV opens with a "Project stats" card for 12 s (public/screen.html); it covers everything. Click it away.
await pages.tv.waitForSelector('#tvStats:not([hidden])', { timeout: 4000 }).then(() => pages.tv.click('#tvStats'), () => {});
log('opened dm, tv');

// A Node-side DM socket (socket.io-client, a devDependency) keeps the latest state for `state` and sends `emit`.
const { io } = require(path.join(ROOT, 'node_modules/socket.io-client'));
const dmSock = io(B, { transports: ['websocket'], forceNew: true });
let last = null;
dmSock.on('state', (st) => { last = st; });
await new Promise((r) => dmSock.on('connect', r));
await new Promise((r) => dmSock.emit('dm:auth', { key: 'dmkey' }, r));

const pg = (name) => { const p = pages[name]; if (!p) throw new Error(`no page "${name}" (have: ${Object.keys(pages).join(', ')})`); return p; };
const json = (s) => (s ? JSON.parse(s) : {});
const cmds = {
  async join(name, cls) {
    if (!name) throw new Error('join <name>');
    const { room } = await (await fetch(B + '/api/join-info')).json();
    const ph = await open(name, `/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('[data-cls]');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.fill('#name', name);
    await ph.click(cls ? `[data-cls="${cls}"]` : '[data-cls]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('#gameView:not([hidden])', { timeout: 8000 });
    log(`${name} joined room ${room}`);
  },
  async mode(m) {
    const dm = pg('dm');
    await dm.click(`[data-mode="${m}"]`); // the real DM mode button
    await dm.waitForSelector(`[data-mode="${m}"].on`, { timeout: 5000 });
    log('mode', m);
  },
  async emit(ev, ...rest) {
    const data = json(rest.join(' '));
    // Most dm:* handlers ack; a few don't, so give up waiting after 1.5 s.
    const ack = await new Promise((r) => { dmSock.emit(ev, data, r); setTimeout(() => r('(no ack)'), 1500); });
    log('ack', JSON.stringify(ack));
  },
  async click(p, ...sel) { await pg(p).click(sel.join(' ')); log('clicked'); },
  // Press and hold (Start conversation 1 s, sheet features 3 s, initiative 3 s). The hold is the feature, not a wait.
  async hold(p, ms, ...sel) {
    const page = pg(p); const loc = page.locator(sel.join(' '));
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down(); await page.waitForTimeout(Number(ms)); await page.mouse.up();
    log('held', ms, 'ms');
  },
  async fill(p, sel, ...text) { await pg(p).fill(sel, text.join(' ')); log('filled'); },
  async wait(p, ...sel) { await pg(p).waitForSelector(sel.join(' '), { timeout: 8000 }); log('found'); },
  async eval(p, ...js) { log(JSON.stringify(await pg(p).evaluate(js.join(' ')))); },
  async ss(p, file) {
    const f = path.resolve(OUT, file || `${p}-${++n}.png`);
    await pg(p).screenshot({ path: f });
    log('saved', f);
  },
  async state() {
    const s = last;
    if (!s) throw new Error('no state yet');
    log(JSON.stringify({ mode: s.mode, players: Object.values(s.players || {}).map((x) => x.name), npc: s.social?.npc?.name, emotion: s.social?.npc?.emotion, combat: !!s.combat?.active || !!s.combat?.order?.length }));
  },
  async errors() { log(errors.length ? errors.join('\n') : 'no errors'); },
  async sleep(ms) { await new Promise((r) => setTimeout(r, Number(ms))); },
};

async function quit(code = 0) {
  quitting = true;
  dmSock.close();
  await br.close().catch(() => {});
  await new Promise((r) => { srv.on('exit', r); srv.kill(); }); // it flushes the save on SIGTERM; rm after
  if (!process.env.KEEP) fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(code);
}
let failed = 0;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
process.stdout.write('> ');
for await (const line of rl) {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd || cmd.startsWith('#')) { process.stdout.write('> '); continue; }
  if (cmd === 'quit') break;
  try {
    if (!cmds[cmd]) throw new Error(`unknown command "${cmd}"`);
    await cmds[cmd](...args);
  } catch (e) { failed++; log('ERR', e.message.split('\n')[0]); }
  process.stdout.write('> ');
}
log(failed ? `\n${failed} command(s) failed` : '\ndone');
await quit(failed ? 1 : 0);
