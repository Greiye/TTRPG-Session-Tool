// Phase 6: conditions on combatants, segment clocks, short and long rests.
const { harness } = require('./helpers');
const h = harness('turns');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Wizard');
  await until(() => a.last.players.length === 1);
  // Conditions (16)
  dm.emit('dm:condition', { id: a.me.id, name: 'Poisoned', on: true });
  ok(await until(() => a.last.players[0].conditions?.includes('Poisoned')), 'DM sets a condition on a player and the phone sees it');
  dm.emit('dm:condition', { id: a.me.id, name: 'Poisoned', on: false });
  ok(await until(() => !a.last.players[0].conditions?.includes('Poisoned')), 'DM removes it again');
  dm.emit('dm:condition', { id: a.me.id, name: 'Not a real one', on: true });
  await h.wait(100);
  ok(!(dm.last.players[0].conditions || []).includes('Not a real one'), 'unknown condition is refused');
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13 });
  await until(() => dm.last.combat.enemies.length === 1);
  const gob = dm.last.combat.enemies[0].id;
  dm.emit('dm:condition', { id: gob, name: 'Prone', on: true });
  ok(await until(() => dm.last.combat.enemies[0].conditions?.includes('Prone')), 'conditions work on creatures in the encounter');
  // Segment clocks (17)
  dm.emit('dm:clock:add', { name: 'The ritual completes', segments: 4 });
  ok(await until(() => dm.last.clocks.length === 1 && dm.last.clocks[0].segments === 4), 'DM adds a clock');
  const k = dm.last.clocks[0].id;
  dm.emit('dm:clock:fill', { id: k, delta: 1 }); dm.emit('dm:clock:fill', { id: k, delta: 1 }); dm.emit('dm:clock:fill', { id: k, delta: 9 });
  ok(await until(() => dm.last.clocks[0].filled === 4), 'clock fills and stops at its last segment');
  ok(await until(() => a.last.clocks?.[0]?.filled === 4), 'clock is shown to phones');
  dm.emit('dm:clock:fill', { id: k, delta: -2 });
  ok(await until(() => dm.last.clocks[0].filled === 2), 'DM can wind a clock back');
  // Rests (18)
  dm.emit('dm:sheet', { id: a.me.id, hp: 3 });
  a.emit('player:sheet', { slot: { level: 1, used: 1 }, hitDiceUsed: 1, tempHp: 5 });
  await until(() => dm.last.players[0].slots?.[1]?.used === 1 && dm.last.players[0].hp === 3);
  dm.emit('dm:rest', { kind: 'short' });
  await h.wait(120);
  ok(dm.last.players[0].hp === 3 && dm.last.players[0].hitDice.used === 1, 'a short rest keeps HP and hit dice (the player spends dice by hand)');
  dm.emit('dm:rest', { kind: 'long' });
  ok(await until(() => dm.last.players[0].hp === dm.last.players[0].maxHp), 'a long rest restores HP');
  ok(dm.last.players[0].slots[1].used === 0 && dm.last.players[0].hitDice.used === 0 && dm.last.players[0].tempHp === 0, 'a long rest restores slots, half the hit dice, clears temp HP');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
