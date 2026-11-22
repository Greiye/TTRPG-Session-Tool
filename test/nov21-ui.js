// Browser test (Mike, Nov 21): Planning is a row of the Modes card, the Story Nodes Graph adds and links nodes
// and plants a choice echo, Inspiration sits under Miscellaneous, and the TV shop shows five wares, the merchant
// and a speech box. Usage: node test/nov21-ui.js (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { io } = require('socket.io-client');

const PORT = 5300 + Math.floor(Math.random() * 300);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-n21-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '1', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.addInitScript(() => { try { localStorage.dmFoldOpen = '1'; } catch { /* ignore */ } });
    await p.goto(B + url);
    return p;
  };
  try {
    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    await dm.waitForSelector('.modes #planToggle');
    ok(await dm.$eval('#planToggle', (b) => b.closest('.modes-card') && b.getBoundingClientRect().width >= b.parentElement.getBoundingClientRect().width - 2), 'Planning is a full-width row in the Modes card');
    ok(!(await dm.$('#sideTabs #planToggle')) && !(await dm.$('[data-stab="inspiration"]')) && !(await dm.$('[data-stab="echo"]')), 'no Planning, Inspiration or Choice echo tab in the tab list');

    // Inspiration under Miscellaneous
    await dm.click('[data-stab="misc"]');
    await dm.waitForSelector('[data-sub-pick="inspiration"]');
    await dm.click('[data-sub-pick="inspiration"]');
    await dm.waitForSelector('#inspAll:visible');
    ok(true, 'Miscellaneous › Inspiration holds the inspiration window');

    // Story Nodes Graph
    await dm.click('#planToggle');
    await dm.waitForSelector('[data-stab="graph"]:visible');
    await dm.click('[data-stab="graph"]');
    await dm.waitForSelector('#sgTitle:visible');
    await dm.fill('#sgTitle', 'Missing brother');
    await dm.click('#sgAdd');
    await dm.waitForFunction(() => document.querySelectorAll('.sg-node').length === 1);
    await dm.selectOption('#sgKind', 'npc');
    await dm.fill('#sgTitle', 'Old Greer');
    await dm.click('#sgAdd');
    await dm.waitForFunction(() => document.querySelectorAll('.sg-node').length === 2 && document.querySelectorAll('.sg-lines line').length === 1);
    ok(true, 'a new node links to the picked one');
    await dm.selectOption('#sgKind', 'echo');
    await dm.waitForSelector('#sgCons:visible');
    await dm.fill('#sgTitle', 'Spared the goblin');
    await dm.fill('#sgCons', 'It returns with friends');
    await dm.click('#sgAdd');
    await dm.waitForSelector('.sg-node.k-echo');
    ok((await dm.textContent('.sg-node.k-echo')).includes('in 3 scenes'), 'a choice echo is a node that counts scenes');
    await dm.click('#sgBig');
    await dm.waitForSelector('dialog.sg-big[open] .sg-board');
    await shot(dm, 'nov21-graph-big.png');
    await dm.click('#sgBigClose');
    await dm.waitForSelector('.sg-card #sgBoard');
    ok(true, 'the big view opens and gives the board back');

    // TV shop
    const tv = await page('/screen', { viewport: { width: 1920, height: 1080 } });
    await dm.click('#planToggle');
    await dm.waitForFunction(() => !document.body.classList.contains('planning'));
    const sock = io(B, { transports: ['websocket'], forceNew: true });
    let st = null;
    sock.on('state', (x) => { st = x; });
    await new Promise((r) => sock.emit('dm:auth', {}, r));
    while (!st?.shops?.length) await new Promise((r) => setTimeout(r, 50));
    sock.emit('dm:shop:pop', { id: st.shops.find((x) => x.name === "Greer's Trinkets").id });
    await tv.waitForSelector('.shop-tv .shop-merchant');
    ok((await tv.$$('.shop-tv .shop-ware')).length === 5, 'the TV shows five wares at a time');
    ok(await tv.$eval('.shop-tv', (el) => { const sc = el.querySelector('.shop-scene').getBoundingClientRect(); const w = el.querySelector('.shop-wares').getBoundingClientRect(); return sc.left > w.left; }), 'the shop image and merchant sit on the right');
    ok((await tv.textContent('.shop-say')).trim().length > 0, 'the merchant says a line');
    ok(await tv.$$eval('.shop-tv .shop-ware', (ls) => ls.every((l) => l.scrollHeight <= l.clientHeight + 1)), 'no ware is cut off');
    await shot(tv, 'nov21-tv-shop.png');
    sock.close();
  } catch (e) { ok(false, e.message); }
  ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await br.close();
  await new Promise((r) => { srv.on('exit', r); srv.kill(); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the server may still be flushing */ }
  console.log(failures ? `\nnov21-ui: ${failures} failing` : 'nov21-ui: all passed');
  process.exit(failures ? 1 : 0);
})();
