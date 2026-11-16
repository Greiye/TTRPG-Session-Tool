// Combat screen feedback (Nov 16): a creature that attacks is marked as acted for the round, the creature
// randomizer rolls a token accessory colour, and initiative sorts everyone.
const { harness } = require('./helpers');
const randomizer = require('../src/randomizer');
const h = harness('combat-ui');
const { ok, until } = h;

ok(randomizer.accent(5) === randomizer.accent(5), 'same seed, same accessory colour');
ok(randomizer.ACCENTS.includes(randomizer.accent()), 'an accessory colour comes from the palette');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 30, ac: 1, atk: 9, dmg: 1 });
  dm.emit('dm:enemy:add', { name: 'Orc', hp: 30, ac: 1, atk: 9, dmg: 1 });
  await until(() => dm.last.combat.enemies.length === 2);
  ok(dm.last.combat.enemies.every((e) => /^#[0-9a-f]{6}$/i.test(e.accent)), 'new creatures get an accessory colour');
  const [g, o] = dm.last.combat.enemies.map((e) => e.id);
  dm.emit('dm:creature:accent', { id: g, seed: 1 });
  ok(await until(() => dm.last.combat.enemies[0].accent === randomizer.accent(1)), 'the randomizer sets one creature\'s colour');
  dm.emit('dm:creature:accent', { id: 'all', seed: 10 });
  ok(await until(() => dm.last.combat.enemies[1].accent === randomizer.accent(11)), 'the randomizer can colour every creature');

  dm.emit('dm:combat:start', {});
  await until(() => dm.last.combat.active);
  const c = dm.last.combat;
  ok(c.order.length === 3 && c.order.every((x, i) => i === 0 || c.order[i - 1].init >= x.init), 'initiative sorts players and creatures');
  ok(c.acted && Object.keys(c.acted).length === 0, 'nobody has acted at the start');
  for (let i = 0; i < 3 && ![g, o].includes(dm.last.combat.order[dm.last.combat.turn].id); i++) { const n = dm.last.combat.turn; dm.emit('dm:combat:next'); await until(() => dm.last.combat.turn !== n); }
  const who = dm.last.combat.order[dm.last.combat.turn].id;
  dm.emit('dm:enemy:attack', { target: a.me.id, attack: 0 });
  ok(await until(() => dm.last.combat.acted?.[who] === dm.last.combat.round), 'a creature that attacks is marked as acted this round');
  dm.emit('dm:combat:end');
  ok(await until(() => !dm.last.combat.active && Object.keys(dm.last.combat.acted || {}).length === 0), 'ending combat clears acted');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
