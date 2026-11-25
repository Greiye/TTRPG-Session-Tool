// Table play in a real browser (PR AD, Nov 24): phone quick rolls, flip cards, the drag die, tips and nearby places;
// the DM's ask bar and NPC voice card; the TV's battle cry.
const { chromium, devices } = require('playwright');
const { harness, settled } = require('./helpers');

const h = harness('tableplay-ui');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const br = await chromium.launch();
  const errors = [];
  const page = async (url, opts = {}) => {
    const p = await (await br.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  try {
    const room = await h.room();
    const sock = await h.dm();
    sock.emit('dm:mode', { mode: 'exploration' });
    const dm = await page('/dm', { viewport: { width: 1500, height: 950 } });
    const tv = await page('/screen', { viewport: { width: 1280, height: 720 } });
    const ph = await page(`/play?room=${room}`, { ...devices['iPhone 13'] });
    await ph.waitForSelector('#newBtn:visible, [data-cls]:visible');
    if (await ph.isVisible('#newBtn')) await ph.click('#newBtn');
    await ph.fill('#name', 'Thorn');
    await ph.click('[data-cls="Fighter"]');
    await ph.click('#joinBtn');
    await ph.waitForSelector('.keybank [data-ask="Athletics"]', { state: 'visible' });
    await until(() => sock.last.players.length === 1);
    const id = sock.last.players[0].id;

    // First-time tip: shows once, closes on a tap
    await ph.waitForSelector('.phone-tip');
    ok(true, 'the first tab shows its tip');

    // Quick roll: ask, then the DM sets a DC, then flick the die
    await ph.click('.keybank [data-ask="Athletics"]');
    await ph.waitForSelector('.phone-tip', { state: 'detached' });
    ok(true, 'a tap closes the tip and still works');
    await ph.waitForSelector('.keybank .kb.on');
    await dm.waitForSelector('.ask-row [data-dc]');
    ok(/Thorn/.test(await dm.textContent('.ask-row')), 'the DM page shows who asks');
    await dm.fill('.ask-row [data-dc]', '5');
    await dm.click('.ask-row [data-ask-dc]');
    await ph.waitForSelector('.phone-pop [data-drag-die]');
    await settled(ph, '.phone-pop');
    const box = await ph.locator('[data-drag-die]').boundingBox();
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    await ph.mouse.move(x, y); await ph.mouse.down(); await ph.mouse.move(x + 60, y - 50, { steps: 4 }); await ph.mouse.up();
    await ph.waitForSelector('.phone-pop .pp-result');
    ok(await until(() => Object.keys(sock.last.check.results).length === 1), 'a flick rolls the roll call');
    await ph.click('.phone-pop [data-pp="call-close"]');
    await ph.waitForSelector('.phone-pop', { state: 'detached' });

    // Flip card
    await ph.click('#tabs [data-tab="sheet"]');
    await ph.waitForSelector('#tabSheet [data-feat]');
    await ph.click('#tabSheet [data-feat]');
    await ph.waitForSelector('#tabSheet .flip.back [data-feat-go]');
    await ph.click('#tabSheet .flip.back .flip-head');
    await ph.waitForSelector('#tabSheet .flip.back', { state: 'detached' });
    ok(true, 'a feature card flips to its rules and back');

    // Nearby places, nearest first
    await ph.click('#tabs [data-tab="journal"]');
    await ph.click('#tabJournal [data-tab="map"]');
    await ph.waitForSelector('.near-list li');
    const legs = await ph.$$eval('.near-list small', (l) => l.map((e) => parseInt(e.textContent, 10)));
    ok(legs.length > 0 && legs.every((v, i) => !i || v >= legs[i - 1]), `nearby places are sorted (${legs.join(', ')})`);

    // Battle cry on the TV
    sock.emit('dm:enemy:add', { name: 'Goblin', hp: 200, ac: 1 });
    await until(() => sock.last.combat.enemies.length === 1);
    sock.emit('dm:combat:start');
    await until(() => sock.last.combat.active);
    const turn = () => sock.last.combat.order[sock.last.combat.turn]?.id;
    if (turn() !== id) { sock.emit('dm:combat:next'); await until(() => turn() === id); }
    await ph.waitForSelector('#battleCry', { state: 'attached' });
    await ph.evaluate((t) => socket.emit('player:combat', { act: 'attack', target: t, cry: 'For the mill!' }), sock.last.combat.enemies[0].id);
    await tv.waitForSelector('.tv-cry');
    ok(/For the mill!/.test(await tv.textContent('.tv-cry')), 'the TV shows the battle cry');
    await dm.click('[data-cry-hide]');
    await tv.waitForSelector('.tv-cry', { state: 'detached' });
    ok(true, 'the DM hides it');

    // Voice rules, without needing an installed voice
    const said = await tv.evaluate(() => {
      const s = (n, extra = {}, tts = { on: true, npcs: {} }) => ({ mode: 'social', audio: {}, tts, social: { line: { n, speaker: 'Albert', text: 'Hi', ...extra } } });
      TablePlay.lineToSay(s(1e6));
      return [TablePlay.lineToSay(s(1e6 + 1))?.text, TablePlay.lineToSay(s(1e6 + 1)), TablePlay.lineToSay(s(1e6 + 2, { player: true })), TablePlay.lineToSay(s(1e6 + 3, { lang: 'Elvish' })),
        TablePlay.lineToSay(s(1e6 + 4, {}, { on: false, npcs: {} })), TablePlay.lineToSay(s(1e6 + 5, {}, { on: true, npcs: { Albert: { mute: true } } }))];
    });
    ok(said[0] === 'Hi' && said.slice(1).every((v) => v === null), 'only a new, readable line from an unmuted NPC is spoken, and only when on');
    ok(!errors.length, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  } catch (e) {
    ok(false, `test crashed: ${e.message}`);
  } finally {
    await br.close();
    await h.done(srv);
  }
})();
