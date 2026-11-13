// Phase 2 combat: a newly added creature must be placed on the map before anything else.
const { harness } = require('./helpers');
const h = harness('placement');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last.players.length === 1);
  dm.emit('dm:map', { cols: 10, rows: 8 });
  await until(() => dm.last.map?.cols === 10);
  dm.emit('dm:token', { id: a.me.id, x: 0, y: 0 });
  await until(() => dm.last.tokens[a.me.id]?.x === 0);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 12, atk: 4, dmg: 3 });
  await until(() => dm.last.pendingPlace?.length === 1);
  const goblin = dm.last.combat.enemies[0].id;
  ok(dm.last.pendingPlace[0] === goblin, 'a new creature is queued for placement');

  // Before it is placed: painting, moving the player, and starting the next turn are refused.
  dm.emit('dm:map:paint', { x: 5, y: 5, kind: 'wall' });
  dm.emit('dm:token', { id: a.me.id, x: 3, y: 3 });
  dm.emit('dm:combat:next', {});
  await h.wait(150);
  ok(!dm.last.map.terrain['5,5'], 'painting waits until the creature is placed');
  ok(dm.last.tokens[a.me.id].x === 0, 'other tokens wait until the creature is placed');

  // Placing it clears the queue, and the rest works again.
  dm.emit('dm:token', { id: goblin, x: 4, y: 4 });
  ok(await until(() => dm.last.tokens[goblin]?.x === 4 && !dm.last.pendingPlace.length), 'placing the creature clears the queue');
  dm.emit('dm:map:paint', { x: 5, y: 5, kind: 'wall' });
  ok(await until(() => dm.last.map.terrain['5,5'] === 'wall'), 'painting works after placement');

  // Deleting a queued creature also clears it.
  dm.emit('dm:enemy:add', { name: 'Rat', hp: 3, ac: 10, atk: 2, dmg: 1 });
  await until(() => dm.last.pendingPlace?.length === 1);
  const rat = dm.last.combat.enemies.find((e) => e.name === 'Rat').id;
  dm.emit('dm:enemy:remove', { id: rat });
  ok(await until(() => !dm.last.pendingPlace.length), 'a queued creature can be deleted');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
