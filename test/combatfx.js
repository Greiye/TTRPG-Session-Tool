// Combat effects, first slice (docs/combat-aesthetic.md): the server sends one cue per hit, crit, miss,
// heal, down and turn. Only the DM's cues carry the amount, unless the table shares health numbers (Mike, Nov 17).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { harness } = require('./helpers');
const h = harness('combatfx');
const { ok, until } = h;

// Pure parts first: src/combatfx.js builds and redacts cues.
const fx = require('../src/combatfx');
const pc = { id: 'p1', name: 'Mira', hue: 200, hp: 10, maxHp: 10 };
const gob = { id: 'e1', name: 'Goblin', enemy: true, side: 'enemy', accent: '#aa3322', hp: 7, maxHp: 7 };
const c = fx.cue('hit', { target: gob, by: pc, amount: 6 });
ok(c.kind === 'hit' && c.target.id === 'e1' && c.by.id === 'p1' && c.amount === 6, 'a hit cue names the target, the attacker and the amount');
ok(c.target.side === 'enemy' && c.target.accent === '#aa3322' && c.by.side === 'party' && c.by.hue === 200, 'cues carry the side and accent colour for the screens');
ok(fx.cue('miss', { target: gob, by: pc, amount: 6 }).amount === undefined, 'a miss carries no amount');
ok(fx.cue('nope', { target: gob }) === null && fx.cue('hit', {}) === null, 'unknown kinds and missing targets make no cue');
ok(fx.forPlayers(c, { settings: { display: {} } }).amount === undefined, 'players get no amount by default (numbers are the DM\'s)');
ok(fx.forPlayers(c, { settings: { display: { numbers: 'all' } } }).amount === 6, 'with "Health numbers: Everyone" players get the amount');

// The phone's own lines (public/combatfx.js).
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'combatfx.js'), 'utf8'), { window: win, document: {}, CSS: {}, navigator: {} });
const t = win.CombatFx.phoneText;
ok(t(fx.cue('turn', { target: pc }), 'p1') === 'Your turn' && t(fx.cue('turn', { target: gob }), 'p1') === null, 'a phone gets "Your turn" only on its own turn');
ok(t(fx.cue('hit', { target: gob, by: pc }), 'p1') === 'You hit Goblin' && t(fx.cue('crit', { target: pc, by: gob }), 'p1') === 'Goblin crits you', 'a phone names its own hits');
ok(t(fx.cue('miss', { target: gob, by: pc }), 'p2') === null, 'other players\' moments stay off the phone');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Mira', 'Fighter');
  const tv = await h.client();
  tv.emit('screen:hello');
  const got = { dm: [], a: [], tv: [] };
  dm.on('cfx', (x) => got.dm.push(x)); a.on('cfx', (x) => got.a.push(x)); tv.on('cfx', (x) => got.tv.push(x));
  await until(() => dm.last?.players.length === 1);
  ok(dm.last.settings.display.numbers === 'dm' && dm.last.settings.display.fx === 'on', 'a new table keeps numbers for the DM and has combat effects on');

  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 30, ac: 1, atk: 10, dmg: 2 });
  await until(() => dm.last.combat.enemies.length === 1);
  const g = dm.last.combat.enemies[0].id;
  dm.emit('dm:combat:start');
  ok(await until(() => got.tv.some((x) => x.kind === 'turn')), 'starting combat sends a turn cue');
  const first = got.tv.find((x) => x.kind === 'turn');
  ok(first.target.id === dm.last.combat.order[0].id, 'the first turn cue names who goes first');

  // The DM hurts and heals Mira by hand: a hit and a heal cue, with numbers only on the DM's screens.
  dm.emit('dm:hp', { id: a.me.id, delta: -3 });
  ok(await until(() => got.a.some((x) => x.kind === 'hit') && got.dm.some((x) => x.kind === 'hit')), 'a DM HP change sends a hit cue');
  ok(got.dm.find((x) => x.kind === 'hit').amount === 3, 'the DM\'s cue has the amount');
  ok(got.a.find((x) => x.kind === 'hit').amount === undefined && got.tv.find((x) => x.kind === 'hit').amount === undefined, 'the phone and the TV get no number');
  dm.emit('dm:hp', { id: a.me.id, delta: 2 });
  ok(await until(() => got.a.some((x) => x.kind === 'heal')), 'healing sends a heal cue');

  // The goblin's turn: its attack sends a hit, crit or miss cue with the attacker.
  for (let i = 0; i < 3 && dm.last.combat.order[dm.last.combat.turn]?.id !== g; i++) { dm.emit('dm:combat:next'); await h.wait(80); }
  const before = got.tv.length;
  dm.emit('dm:enemy:attack', { target: a.me.id });
  ok(await until(() => got.tv.slice(before).some((x) => ['hit', 'crit', 'miss'].includes(x.kind) && x.by?.id === g)), 'a creature attack sends a cue naming the attacker');
  ok(!dm.last.log.filter((l) => !l.vis).some((l) => / for \d+/.test(l.text)), 'the public log has no damage numbers');

  // Everyone sees numbers when the DM shares them.
  dm.emit('dm:settings', { display: { numbers: 'all' } });
  await until(() => dm.last.settings.display.numbers === 'all');
  dm.emit('dm:hp', { id: g, delta: -4 });
  ok(await until(() => got.a.some((x) => x.kind === 'hit' && x.target.id === g && x.amount === 4)), 'with numbers for everyone the phone gets the amount');

  // A fall to 0 sends "down" once, not a hit as well.
  const n = got.tv.length;
  dm.emit('dm:hp', { id: g, delta: -999 });
  ok(await until(() => got.tv.slice(n).some((x) => x.kind === 'down' && x.target.id === g)), 'dropping to 0 sends a down cue');
  await h.wait(100);
  ok(!got.tv.slice(n).some((x) => x.kind === 'hit'), 'the fall to 0 sends no separate hit cue');

  dm.emit('dm:settings', { display: { fx: 'off', numbers: 'nonsense' } });
  ok(await until(() => dm.last.settings.display.fx === 'off'), 'the DM can switch combat effects off for the TV');
  ok(dm.last.settings.display.numbers === 'all', 'an unknown numbers value is ignored');
  await h.done(srv);
})();
