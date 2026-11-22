// Browser test for Mike's Nov 21 batch: press, hold and drag NPCs and players into the DM's Social window,
// Emotions next to Dialogue, the phone's centred Join pop-up and top speech box with a language, the phone
// sheet (read-only HP, big press-and-hold skills, named moves, languages), the Spells tab for casters only,
// the hit dice pop-up and named moves on the combat turn.
// Usage: node test/social-phone-ui.js  (needs Playwright). SHOTS=dir saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

const PORT = 4300 + Math.floor(Math.random() * 300);
const B = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tavern-sp21-'));
const SHOTS = process.env.SHOTS;
let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) failures++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name) }); };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, LOBBY: '0', TEST_MODE: '0', PORT, HTTPS_PORT: PORT + 1000, DATA_DIR: TMP + '/data', UPLOAD_DIR: TMP + '/up' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(B + url);
    return p;
  };
  const join = async (ph, name, cls) => {
    await ph.waitForSelector('#newBtn:visible, [data-cls]:visible');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.waitForSelector('[data-cls]:visible');
    await ph.fill('#name', name);
    await ph.click(cls ? `[data-cls="${cls}"]` : '[data-cls]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('#gameView:not([hidden])', { timeout: 5000 });
  };
  // Press, hold, then drag from one element's centre to another's.
  const holdDrag = async (p, from, to) => {
    await p.locator(from).scrollIntoViewIfNeeded();
    const a = await p.locator(from).boundingBox();
    const b = await p.locator(to).boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down();
    await p.waitForSelector('.drag-ghost', { timeout: 2000 });
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await p.mouse.up();
  };
  const S = (p) => p.evaluate(() => window.__state?.() || null);
  try {
    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    await dm.waitForFunction(() => window.socket);
    await dm.evaluate(() => { window.__state = () => window.__last; socket.on('state', (st) => { window.__last = st; }); });
    const { room } = await (await fetch(B + '/api/join-info')).json();
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await join(ph, 'Thorn', 'Fighter');
    const wz = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await join(wz, 'Ilse', 'Wizard');

    // ----- phone sheet -----
    await ph.click('#tabs [data-tab="sheet"]');
    await ph.waitForSelector('#tabSheet .sk-tile');
    ok(!(await ph.$('#tabSheet [data-hp]')), 'no HP buttons on the phone: the DM keeps health');
    const ab = await ph.locator('#tabSheet .ab[data-ab]').first().boundingBox();
    const sk = await ph.locator('#tabSheet .sk-tile').first().boundingBox();
    ok(sk.height >= ab.height - 2 && sk.width >= ab.width - 2, 'skills are as large as abilities');
    await ph.dispatchEvent('#tabSheet .sk-tile', 'pointerdown');
    await ph.waitForSelector('#tabSheet .sk-tile.cool', { timeout: 3000 }).catch(() => {});
    ok(await ph.$('#tabSheet .sk-tile.cool'), 'press and hold a skill rolls it');
    ok(!(await ph.$('#tabs [data-tab="spells"]')), 'a fighter has no Spells tab');
    ok(await wz.waitForSelector('#tabs [data-tab="spells"]', { timeout: 3000 }).then(() => true, () => false), 'a wizard has a Spells tab');
    ok(await ph.$('#tabSheet .move-name'), 'the starter move has a name field');
    ok(!(await ph.$('#tabSheet [data-move-del]')), 'the only move cannot be deleted');
    await ph.fill('#tabSheet .move-name', 'Dragon Fang');
    await ph.press('#tabSheet .move-name', 'Enter');
    await dm.waitForFunction(() => window.__state().players.some((p) => p.moves?.[0]?.name === 'Dragon Fang'), null, { timeout: 3000 }).catch(() => errors.push('renaming a move did not reach the server'));
    await ph.fill('#langAdd', 'Draconic');
    await ph.click('#langForm .btn');
    await ph.waitForSelector('#tabSheet [data-lang-del="Draconic"]', { timeout: 3000 }).catch(() => errors.push('adding a language failed'));
    await shot(ph, 'phone-sheet.png');
    await ph.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(ph, 'phone-sheet-bottom.png');

    // ----- hit dice pop-up after a short rest -----
    const thorn = (await S(dm)).players.find((p) => p.name === 'Thorn');
    await dm.evaluate((id) => { socket.emit('dm:sheet', { id, hp: 3 }); socket.emit('dm:rest', { kind: 'short' }); }, thorn.id);
    await ph.waitForSelector('.hd-pop [data-hd-roll]', { timeout: 4000 });
    ok(true, 'a short rest asks the hurt player about hit dice');
    await shot(ph, 'phone-hitdice.png');
    await ph.click('.hd-pop [data-hd-roll]');
    await ph.waitForSelector('.hd-pop', { state: 'detached', timeout: 4000 });
    ok((await S(dm)).players.find((p) => p.name === 'Thorn').hp > 3, 'rolling the hit die heals');

    // ----- social: drag in -----
    await dm.evaluate(() => socket.emit('dm:worldmap:show', { on: false }));
    await dm.click('[data-mode="social"]');
    await dm.waitForSelector('#socialWin:not([hidden]) #convoPool [data-pool="pool-albert"]');
    await holdDrag(dm, '#convoPool [data-pool="pool-albert"]', '#convoZone');
    await dm.waitForSelector('#convoZone [data-zone="pool-albert"]', { timeout: 2000 }).catch(() => errors.push('dragging an NPC into the circle failed'));
    await holdDrag(dm, `#convoPlayers [data-pool="${thorn.id}"]`, '#convoZone');
    await dm.waitForSelector(`#convoZone [data-zone="${thorn.id}"]`, { timeout: 2000 }).catch(() => errors.push('dragging a player into the circle failed'));
    await shot(dm, 'dm-social-pick.png');
    await dm.locator('#convoStart').scrollIntoViewIfNeeded();
    const sb = await dm.locator('#convoStart').boundingBox();
    await dm.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await dm.mouse.down(); await dm.waitForFunction(() => window.__state().social.convo.live, null, { timeout: 4000 }); await dm.mouse.up();
    ok((await S(dm)).social.party.includes(thorn.id), 'the dragged player is in the conversation');
    await dm.waitForSelector('#convoIn [data-in="pool-albert"]');
    await holdDrag(dm, '#convoOut [data-out="pool-brent"]', '#convoIn');
    await dm.waitForFunction(() => window.__state().social.cast.some((c) => c.name === 'Brent'), null, { timeout: 3000 }).catch(() => errors.push('dragging an NPC into the live conversation failed'));
    // Emotions and Dialogue on one row; the wheel is not clipped.
    const emo = await dm.locator('.social-emo').boundingBox();
    const dlg = await dm.locator('.social-dlg').boundingBox();
    ok(Math.abs(emo.y - dlg.y) < 4 && dlg.x > emo.x, 'Emotions and Dialogue share a row');
    const wheel = await dm.locator('#emotions .convo-wheel').boundingBox();
    ok(wheel.x >= emo.x && wheel.x + wheel.width <= emo.x + emo.width + 1, 'the emotion wheel fits inside its card');
    // Emotion is picked, then goes out with the line.
    await dm.click('#emotions .wheel-emo[data-emo="angry"] .wheel-lbl', { force: true });
    await dm.waitForTimeout(250); // nothing should change before the line is sent
    ok((await S(dm)).social.npc.emotion !== 'angry', 'picking an emotion does not change the NPC yet');
    await dm.fill('#line', 'Out of my inn.');
    await dm.press('#line', 'Enter');
    await dm.waitForFunction(() => window.__state().social.npc.emotion === 'angry' && window.__state().social.line.text === 'Out of my inn.', null, { timeout: 3000 }).catch(() => errors.push('the NPC emotion did not change with the line'));
    await shot(dm, 'dm-social-live.png');

    // Phone: Join pop-up in the middle, speech box at the top, language picker.
    await wz.waitForSelector('.convo-pop [data-cv="yes"]', { timeout: 5000 });
    const sheetBox = await wz.locator('.convo-pop .pop-sheet').boundingBox();
    const vh = wz.viewportSize().height;
    ok(Math.abs(sheetBox.y + sheetBox.height / 2 - vh / 2) < 40, 'Join the Conversation sits in the middle of the phone');
    await shot(wz, 'phone-join-center.png');
    await wz.click('.convo-pop [data-cv="yes"]');
    await dm.waitForFunction(() => window.__state().social.party.length === 2, null, { timeout: 3000 }).catch(() => errors.push('Yes did not join the conversation'));
    await wz.waitForTimeout(400); // let the slide-in finish before measuring
    ok((await wz.locator('.convo-pop .pop-sheet').boundingBox()).y <= 2, 'the speech box comes from the top');
    ok(await wz.$('#convoLang option[value="Elvish"]'), 'the speech box offers the languages the character knows');
    await shot(wz, 'phone-speech-top.png');
    await wz.click('.convo-pop [data-cv="no"]');

    // ----- combat: named move on the turn -----
    await dm.click('[data-mode="combat"]');
    await dm.evaluate(() => { socket.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 12, atk: 4, dmg: [1, 6, 2] }); });
    await dm.waitForFunction(() => window.__state().combat.enemies.length > 0);
    await dm.evaluate(() => socket.emit('dm:combat:start'));
    await dm.waitForFunction(() => window.__state().combat.active, null, { timeout: 4000 }).catch(() => {});
    // Move to Thorn's turn.
    for (let i = 0; i < 6; i++) {
      const st = await S(dm);
      if (st.combat.order[st.combat.turn]?.id === thorn.id) break;
      await dm.evaluate(() => socket.emit('dm:combat:next'));
      await dm.waitForFunction((t) => window.__state().combat.turn !== t, st.combat.turn, { timeout: 2000 }).catch(() => {});
    }
    await ph.click('#tabs [data-tab="play"]');
    const hasMove = await ph.waitForSelector('[data-move-pick]', { timeout: 4000 }).then(() => true, () => false);
    ok(hasMove, 'the named move is a combat choice on the turn');
    if (hasMove) {
      ok((await ph.textContent('[data-move-pick]')).includes('Dragon Fang'), 'it shows the move name');
      await shot(ph, 'phone-combat-moves.png');
    }
  } catch (e) {
    errors.push(e.stack || String(e));
  } finally {
    for (const e of errors) ok(false, e);
    await br.close();
    srv.kill();
    console.log(failures ? `social-phone-ui: ${failures} failing` : 'social-phone-ui: all passed');
    process.exit(failures ? 1 : 0);
  }
})();
