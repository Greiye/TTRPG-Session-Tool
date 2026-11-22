// Browser test for combat feel (Mike, Nov 21): the phone's overhead battle map with a D-pad, the TV's attacker
// pop-up before a blow lands, and the end-of-combat banner on the TV and the phone.
// Usage: node test/combat-feel-ui.js  (SHOTS=dir also saves screenshots)
const { chromium } = require('playwright');
const { harness } = require('./helpers');
const h = harness('combat-feel-ui');
const { ok, until } = h;
const SHOTS = process.env.SHOTS;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 200, ac: 1, atk: 5, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 1);
  const gob = dm.last.combat.enemies[0].id;
  dm.emit('dm:map', { cols: 12, rows: 8 });
  await until(() => dm.last.map && dm.last.tokens?.[a.me.id]);
  dm.emit('dm:token', { id: gob, x: 10, y: 6 });
  await until(() => dm.last.tokens?.[gob]);

  const b = await chromium.launch();
  const errors = [];
  const open = async (url, opts) => {
    const p = await (await b.newContext(opts)).newPage();
    p.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await p.goto(h.URL + url);
    return p;
  };
  const tv = await open('/screen', { viewport: { width: 1280, height: 720 } });
  const ph = await open(`/play?takeover=${a.me.id}&key=dmkey`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await tv.waitForFunction(() => window.tvLast && window.CombatFx);

  dm.emit('dm:mode', { mode: 'combat' });
  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  ok(await ph.waitForSelector('.phone-map:not([hidden]) .iso-pad-b', { timeout: 10000 }).then(() => true, () => false), 'the phone shows the battle map with a D-pad in combat');
  if (SHOTS) await ph.screenshot({ path: `${SHOTS}/phone-map.png` });

  const at = () => `${dm.last.combat.round}:${dm.last.combat.turn}`;
  const nextTurn = async () => { const was = at(); dm.emit('dm:combat:next'); await until(() => at() !== was, 3000); };
  const turnOf = async (id) => { for (let i = 0; i < 4 && dm.last.combat.order[dm.last.combat.turn]?.id !== id; i++) await nextTurn(); return dm.last.combat.order[dm.last.combat.turn]?.id === id; };

  // D-pad: on Mira's turn a press steps her one tile.
  ok(await turnOf(a.me.id), 'it is Mira\'s turn');
  const from = { ...dm.last.tokens[a.me.id] };
  await ph.waitForFunction(() => document.querySelector('.phone-map canvas'));
  for (const i of [5, 7, 1, 3]) { // right, down, up, left: one of them is open
    await ph.click(`.iso-pad-b[data-i="${i}"]`);
    if (await until(() => { const t = dm.last.tokens[a.me.id]; return t.x !== from.x || t.y !== from.y; }, 1500)) break;
  }
  const to = dm.last.tokens[a.me.id];
  ok((to.x !== from.x || to.y !== from.y) && Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) === 1, 'a D-pad press moves Mira one tile');

  // Attacker pop-up on the TV, then the blow.
  ok(await turnOf(gob), 'the goblin\'s turn');
  dm.emit('dm:enemy:attack', { target: a.me.id, attack: 0 });
  ok(await tv.waitForSelector('#cfx .cfx-actor', { timeout: 3000 }).then(() => true, () => false), 'the TV shows the attacker pop-up');
  ok(/Goblin/.test(await tv.locator('#cfx .cfx-actor').first().textContent()), 'the pop-up names the attacker');
  ok(await tv.waitForSelector('#cfx .cfx-actor', { state: 'detached', timeout: 3000 }).then(() => true, () => false), 'the pop-up goes after about half a second');

  // End of combat banner.
  dm.emit('dm:combat:end');
  ok(await tv.waitForSelector('#cfx .cfx-end', { timeout: 3000 }).then(() => true, () => false), 'the TV shows the end-of-combat banner');
  ok(await ph.waitForSelector('#cfx .cfx-end', { timeout: 3000 }).then(() => true, () => false), 'the phone shows it too');
  ok(/Combat over/.test(await tv.locator('#cfx .cfx-end').first().textContent()), 'with the goblin standing it reads Combat over');
  ok(await ph.waitForSelector('.phone-map', { state: 'hidden', timeout: 5000 }).then(() => true, () => false), 'the phone map goes away after the fight');

  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await b.close();
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
