// Combat prep filter (Mike, Nov 15): entering combat puts "Combat · Get ready" on the TV; the DM's initiative
// hold shakes it; rolling initiative lifts it. Leaving combat clears it.
const { harness } = require('./helpers');
const h = harness('combatprep');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);
  dm.emit('dm:mode', { mode: 'combat' });
  ok(await until(() => a.last.mode === 'combat' && a.last.combatPrep && a.last.combatPrep.holding === false), 'entering combat shows the prep filter');
  dm.emit('dm:combat:prep', { holding: true });
  ok(await until(() => a.last.combatPrep?.holding === true), 'holding Roll initiative shakes it');
  dm.emit('dm:combat:prep', { holding: false });
  ok(await until(() => a.last.combatPrep?.holding === false), 'letting go early stops the shake');
  dm.emit('dm:combat:start');
  ok(await until(() => a.last.combat.active && a.last.combatPrep === null), 'rolling initiative lifts the filter');
  dm.emit('dm:combat:prep', { holding: true });
  await h.wait(200);
  ok(a.last.combatPrep === null, 'a late hold does not bring it back');
  dm.emit('dm:combat:end');
  dm.emit('dm:mode', { mode: 'exploration' });
  ok(await until(() => a.last.mode === 'exploration' && a.last.combatPrep === null), 'leaving combat clears it');
  dm.emit('dm:mode', { mode: 'combat' });
  ok(await until(() => a.last.combatPrep), 'a new fight brings it back');
  dm.emit('dm:mode', { mode: 'social' });
  ok(await until(() => a.last.mode === 'social' && a.last.combatPrep === null), 'switching to social clears it');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
