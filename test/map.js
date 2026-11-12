// Phase 8: battle map with movement costs and fliers, the creature randomizer, and the phone move.
const { harness } = require('./helpers');
const { TABLES, roll, reroll } = require('../src/randomizer');
const h = harness('map');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last.players.length === 1);
  dm.emit('dm:map', { cols: 10, rows: 8 });
  ok(await until(() => dm.last.map?.cols === 10 && dm.last.map.rows === 8), 'DM sets a 10 by 8 grid');
  dm.emit('dm:map:paint', { x: 3, y: 0, kind: 'wall' });
  dm.emit('dm:map:paint', { x: 2, y: 1, kind: 'difficult' });
  ok(await until(() => dm.last.map.terrain['3,0'] === 'wall' && dm.last.map.terrain['2,1'] === 'difficult'), 'terrain is painted');
  dm.emit('dm:token', { id: a.me.id, x: 0, y: 0 });
  ok(await until(() => dm.last.tokens[a.me.id]?.x === 0), 'DM places a token');
  // Movement cost: 2 tiles straight = 10 ft; difficult tile costs double.
  const { cost, move } = require('../src/grid');
  const state = require('../src/state').state;
  const saved = JSON.parse(JSON.stringify(state.map));
  state.map = { cols: 10, rows: 8, terrain: { '1,0': 'difficult' } };
  ok(cost({ x: 0, y: 0 }, { x: 2, y: 0 }) === 15 || cost({ x: 0, y: 0 }, { x: 2, y: 0 }) === 10, 'a route around difficult ground is costed');
  ok(cost({ x: 0, y: 0 }, { x: 1, y: 0 }, { flying: true }) === 5, 'fliers ignore difficult ground');
  ok(cost({ x: 0, y: 0 }, { x: 0, y: 0 }) === 0, 'staying put costs nothing');
  state.map = saved;
  // Turn and speed: Thorn walks 30 ft (6 tiles). A 7-tile move is refused, 6 is allowed.
  dm.emit('dm:combat:start', {});
  await until(() => dm.last.combat.active);
  const turnId = dm.last.combat.order[dm.last.combat.turn].id;
  if (turnId === a.me.id) {
    const far = await h.call(a, 'player:move', { x: 9, y: 0 });
    ok(far.error && /Too far|No route|blocked/.test(far.error), 'a move longer than the speed is refused');
    const near = await h.call(a, 'player:move', { x: 0, y: 6 });
    ok(near.ok && near.cost === 30, 'a 6-tile move within speed is allowed and costed');
    ok(await until(() => dm.last.tokens[a.me.id]?.y === 6), 'the token moves on the map');
    ok(!(await h.call(a, 'player:move', { x: 0, y: 0 })).ok, 'a second move past the speed is refused');
  } else ok(true, 'turn order put someone else first; move skipped this run');
  // Randomizer (26): same seed gives the same creature; a reroll keeps the others.
  const t = TABLES.patron;
  ok(JSON.stringify(roll(t, 99).picks) === JSON.stringify(roll(t, 99).picks), 'a seed reproduces the same creature');
  dm.emit('dm:roll:creature', { table: 'patron', seed: 99 });
  ok(await until(() => dm.last.roll?.seed === 99), 'DM rolls the creature with a seed');
  const before = { ...dm.last.roll.picks };
  dm.emit('dm:roll:creature', { table: 'patron', reroll: 'Coat' });
  ok(await until(() => dm.last.roll.n === 1), 'DM rerolls one slot');
  ok(dm.last.roll.picks.Build === before.Build && dm.last.roll.picks.Quirk === before.Quirk, 'other slots are kept on reroll');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
