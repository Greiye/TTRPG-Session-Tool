// Combat feel (Mike, Nov 21): Prepare combat keeps the TV and phones out of the fight while the DM sets it up,
// the DM turns the TV's battle view, cues carry the attacker's picture, and ending a fight sends one pop-up.
const { harness } = require('./helpers');
const h = harness('combat-feel');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1 && dm.last);
  const ends = [];
  a.on('cfx:end', (e) => ends.push(e));

  // Prepare combat: the DM's page goes to combat, the table stays in exploration.
  dm.emit('dm:combat:stage', { on: true });
  ok(await until(() => dm.last.mode === 'combat' && dm.last.combat.staged && dm.last.tableMode === 'exploration'), 'the DM page is in combat while preparing');
  dm.emit('dm:map', { cols: 10, rows: 8 });
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13 });
  ok(await until(() => dm.last.combat.enemies.length === 1 && dm.last.map), 'the DM adds a creature and a map in private');
  await h.wait(150); // nothing should reach the phone: a short settle for the broadcast
  ok(a.last.mode === 'exploration', 'the phone stays in exploration');
  ok(a.last.combat.enemies.length === 0 && a.last.map === null && !Object.keys(a.last.tokens || {}).length, 'the phone sees no creatures, map or tokens');
  ok(a.last.combat.staged === undefined && a.last.combatPrep == null, 'the phone gets no prep flag and no Get ready filter');
  ok(!a.last.log.some((l) => l.kind === 'combat' && /Goblin/.test(l.text)), 'combat lines written during the prep stay hidden');

  // Stop preparing: back to the table's mode; prepare again, then press Combat to bring the table in.
  dm.emit('dm:combat:stage', { on: false });
  ok(await until(() => dm.last.mode === 'exploration' && !dm.last.combat.staged), 'Stop preparing returns the DM to the table mode');
  dm.emit('dm:combat:stage', { on: true });
  ok(await until(() => dm.last.combat.staged), 'preparing again');
  dm.emit('dm:mode', { mode: 'combat' });
  ok(await until(() => a.last.mode === 'combat' && a.last.combat.enemies.length === 1 && a.last.combatPrep), 'pressing Combat brings the table into the fight with the Get ready filter');
  ok(!dm.last.combat.staged, 'the prep is over');
  dm.emit('dm:combat:stage', { on: true });
  await h.wait(150); // nothing should change: preparing is only for a fight the table is not in
  ok(!dm.last.combat.staged, 'Prepare does nothing once the table is in combat');

  // TV camera: quarter turns wrap, overhead toggles, and it stays after the fight.
  dm.emit('dm:tv:cam', { turn: -1 });
  ok(await until(() => dm.last.combat.cam?.rot === 3), 'turning left from the start wraps to the last quarter');
  dm.emit('dm:tv:cam', { turn: 1, top: true });
  ok(await until(() => a.last.combat.cam?.rot === 0 && a.last.combat.cam.top === true), 'the TV view turns and looks straight down');

  // End of combat pop-up: sent once, only for a fight the table saw.
  dm.emit('dm:combat:start');
  ok(await until(() => a.last.combat.active), 'initiative rolled');
  dm.emit('dm:combat:end');
  ok(await until(() => ends.length === 1), 'ending the fight sends the end-of-combat pop-up');
  ok(ends[0].won === false, 'the goblin still stands, so it is not a victory');
  ok(await until(() => a.last.combat.cam?.top === true), 'the TV view stays between fights');
  dm.emit('dm:mode', { mode: 'exploration' });
  ok(await until(() => a.last.mode === 'exploration'), 'back to exploring');
  dm.emit('dm:combat:stage', { on: true });
  ok(await until(() => dm.last.combat.staged), 'preparing a new fight');
  dm.emit('dm:combat:end');
  await h.wait(200); // nothing should arrive: a private prep was never a fight
  ok(ends.length === 1 && !dm.last.combat.staged, 'ending a private prep sends no pop-up and ends the prep');

  // Cue pictures: a creature or character picture rides along for the attacker pop-up; other strings do not.
  const fx = require('../src/combatfx');
  ok(fx.cue('hit', { target: { id: 't', name: 'T' }, by: { id: 'b', name: 'B', portrait: '/uploads/b.png' } }).by.img === '/uploads/b.png', 'the attacker picture rides on the cue');
  ok(!fx.cue('hit', { target: { id: 't', name: 'T' }, by: { id: 'b', name: 'B', portrait: 'javascript:x' } }).by.img, 'an unsafe picture is left out');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
