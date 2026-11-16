// DM combat controls (PR G, Nov 16): DM moves use movement and may go past the speed (negative = red),
// a creature's movement can be given back, a token can go back to the tray, and End clears the combat window.
const { harness } = require('./helpers');
const h = harness('combat-controls');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => dm.last?.players.length === 1);
  dm.emit('dm:map', { cols: 20, rows: 10 });
  await until(() => dm.last.map);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 10, ac: 12, atk: 4, dmg: 2 });
  await until(() => dm.last.combat.enemies.length === 1 && dm.last.pendingPlace.length === 1);
  const g = dm.last.combat.enemies[0].id;
  dm.emit('dm:token', { id: g, x: 0, y: 0 });
  dm.emit('dm:token', { id: a.me.id, x: 0, y: 9 });
  await until(() => dm.last.tokens[g] && dm.last.tokens[a.me.id] && !dm.last.pendingPlace.length);

  // Before initiative the DM sets up for free.
  dm.emit('dm:token:move', { id: g, x: 3, y: 0 });
  ok(await until(() => dm.last.tokens[g].x === 3), 'the DM moves a creature before combat');
  ok(!dm.last.combat.moved?.[g], 'set-up moves before initiative cost nothing');

  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  dm.emit('dm:token:move', { id: g, x: 5, y: 0 });
  ok(await until(() => dm.last.combat.moved?.[g] === 10), 'a DM move in combat uses the creature\'s movement (10 ft)');
  dm.emit('dm:token:move', { id: g, x: 15, y: 0 });
  ok(await until(() => dm.last.tokens[g].x === 15), 'the DM can move a creature past its speed');
  ok(dm.last.combat.moved[g] === 60, 'movement used goes past the 30 ft speed (60 ft used, 30 ft over)');
  ok(dm.last.log.some((l) => /past its speed/.test(l.text)), 'the log notes the creature moved past its speed');

  dm.emit('dm:move:reset', { id: g });
  ok(await until(() => !dm.last.combat.moved?.[g]), 'the right-click menu gives a creature its movement back');

  dm.emit('dm:token:remove', { id: g });
  ok(await until(() => !dm.last.tokens[g]), 'a token can go back to the tray');
  dm.emit('dm:token:move', { id: g, x: 1, y: 1 });
  await h.wait(100);
  ok(!dm.last.tokens[g], 'a token off the map does not move');
  dm.emit('dm:token', { id: g, x: 2, y: 2 });
  ok(await until(() => dm.last.tokens[g]?.x === 2), 'the token can be placed again from the tray');

  dm.emit('dm:combat:end');
  ok(await until(() => !dm.last.combat.active && !dm.last.combat.enemies.length), 'ending combat removes the creatures');
  ok(!Object.keys(dm.last.tokens || {}).length && !dm.last.map && !(dm.last.pendingPlace || []).length, 'ending combat clears tokens and the battle map');
  ok(!Object.keys(dm.last.combat.moved || {}).length && !dm.last.combat.order.length, 'ending combat clears initiative and movement');
  ok(dm.last.players.length === 1, 'the party stays');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
