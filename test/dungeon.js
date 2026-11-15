// Dungeon nodes (exploration): the tree of rooms, fog for unrevealed rooms, and the DM-only socket events.
const dg = require('../src/dungeon');
const { harness } = require('./helpers');
const h = harness('dungeon');
const { ok } = h;

const D = dg.example();
ok(!D.on && D.here === null && D.nodes.length === 16 && D.nodes.every((n) => !n.revealed), 'a fresh dungeon is the example, closed, with every room hidden');
const lv = dg.levels(D.nodes);
ok(lv.d1 === 1 && lv.d2 === 2 && lv.d6 === 3 && lv.d10 === 4 && lv.d16 === 6, 'a level is one more than the deepest parent');
ok(dg.viewFor(D, { role: 'screen' }).nodes.length === 0, 'nothing reaches the TV while the dungeon is closed');

ok(dg.enter(D).ok && D.on && D.here === 'd1' && dg.byId(D, 'd1').revealed, 'entering puts the party in the entrance and reveals it');
let tv = dg.viewFor(D, { role: 'screen' });
ok(tv.nodes.length === 1 && tv.nodes[0].id === 'd1', 'the TV sees only the discovered entrance: hidden rooms do not reach the table');
ok(!tv.nodes.some((n) => 'note' in n), 'DM notes never leave the DM');
ok(dg.viewFor(D, { role: 'dm' }).nodes.length === 16, 'the DM sees every room');
ok(dg.canExit(D), 'the party can leave from the entrance');

ok(dg.moveTo(D, 'd2') && D.here === 'd2' && dg.byId(D, 'd2').visited && dg.byId(D, 'd2').revealed, 'moving the party reveals and visits the room');
tv = dg.viewFor(D, { role: 'player', charId: 'x' });
ok(tv.here === 'd2' && tv.nodes.length === 2 && !tv.nodes.some((n) => n.id === 'd5'), 'the next room past the party stays hidden until discovered');
ok(!dg.canExit(D) && dg.leave(D).error && D.on, 'the party cannot leave from the middle of the dungeon');
dg.reveal(D, 'd6', true);
tv = dg.viewFor(D, { role: 'player', charId: 'x' });
ok(tv.nodes.find((n) => n.id === 'd6').parents.join() === 'd2', 'a revealed room keeps only ropes from discovered rooms');
dg.moveTo(D, 'd16');
ok(dg.canExit(D) && dg.leave(D).ok && !D.on, 'the party leaves from the end room');
ok(dg.enter(D).ok && D.here === 'd16', 'coming back puts the party where it left');
dg.leave(D);

ok(dg.link(D, 'd16', 'd1').error, 'a rope cannot point back up the tree (no loops)');
ok(dg.link(D, 'd2', 'd2').error, 'a rope needs two rooms');
ok(dg.link(D, 'd3', 'd5').ok && dg.byId(D, 'd5').parents.includes('d3'), 'a second way into a room');
ok(dg.link(D, 'd3', 'd5', false).ok && !dg.byId(D, 'd5').parents.includes('d3'), 'a rope can be cut');

const r = dg.save(D, { name: 'Flooded Cellar', kind: 'nope', parent: 'd16', pill: 'DC 15 and more' });
ok(r.node.kind === 'room' && r.node.pill.length <= 10 && dg.levels(D.nodes)[r.node.id] === 7 && !r.node.revealed, 'a new room is hidden, sits below its parent, and its badge is short');
ok(dg.save(D, { name: '' }).error, 'a new room needs a name');
ok(dg.save(D, { id: r.node.id, name: 'Dry Cellar', kind: 'trap' }).node.name === 'Dry Cellar', 'a room can be edited');
dg.moveTo(D, 'd16');
ok(dg.remove(D, 'd16') && D.here === null && !dg.byId(D, r.node.id).parents.length, 'removing a room cuts its ropes and the party leaves it');
D.on = false;
ok(dg.viewFor(D, { role: 'screen' }).nodes.length === 0, 'nothing reaches the TV while the dungeon is off');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await h.call(dm, 'dm:dungeon:example');
  ok(await h.until(() => a.last?.dungeon && !a.last.dungeon.on && a.last.dungeon.nodes.length === 0), 'the dungeon starts closed and hidden from phones');
  ok((await h.call(dm, 'dm:dungeon:show', { on: true })).error, 'the dungeon will not open away from a dungeon entrance');
  ok((await h.call(a, 'dm:dungeon:show', { on: true })).error, 'a phone cannot open the dungeon');
  // The example world starts in Millbrook (w1); The Sunken Crossroads (w4) is the dungeon entrance.
  ok(a.last.worldMap.here === 'w1' && a.last.worldMap.nodes.find((n) => n.id === 'w1')?.seen, 'the example world starts with the party on a revealed place');
  ok(a.last.trail?.[0]?.where === 'Millbrook', 'the trail starts where the party stands');
  await h.call(dm, 'dm:worldmap:timing', { legSeconds: 5 });
  await h.call(dm, 'dm:worldmap:go', { node: 'w4' });
  ok(await h.until(() => a.last.dungeon.on && a.last.worldMap.here === 'w4', 25000), 'arriving on the dungeon entrance pops the dungeon up for everyone');
  ok(a.last.dungeon.nodes.length === 1 && a.last.dungeon.here === 'd1', 'the phone sees only the entrance room');
  ok(a.last.trail.some((e) => e.kind === 'enter' && e.where === 'The Sunken Crossroads') && a.last.trail.some((e) => e.kind === 'world' && e.where === 'Old Stone Bridge'), 'the trail logs the road and the dungeon');
  ok((await h.call(dm, 'dm:worldmap:go', { node: 'w1' })).error, 'no travel while the party is in the dungeon');
  ok((await h.call(a, 'dm:dungeon:here', { id: 'd2' })).error, 'a phone cannot move the party');
  ok((await h.call(dm, 'dm:dungeon:here', { id: 'd3' })).ok, 'the DM moves the party');
  ok(await h.until(() => a.last.dungeon.here === 'd3' && a.last.log.some((l) => /moves to Explore Right Tunnel/.test(l.text))), 'the phone sees the move and the log line');
  ok((await h.call(dm, 'dm:dungeon:show', { on: false })).error && dm.last.dungeon.on, 'the dungeon cannot be left from the middle');
  const add = await h.call(dm, 'dm:dungeon:node', { name: 'Side Door', kind: 'secret', parent: 'd3' });
  ok(add.ok && (await h.until(() => dm.last.dungeon.nodes.some((n) => n.id === add.id))) && !a.last.dungeon.nodes.some((n) => n.id === add.id), 'a new hidden room does not reach the phone');
  await h.call(dm, 'dm:dungeon:reveal', { id: add.id, on: true });
  ok(await h.until(() => a.last.dungeon.nodes.find((n) => n.id === add.id)?.name === 'Side Door'), 'revealing shows the room');
  await h.call(dm, 'dm:dungeon:here', { id: 'd1' });
  ok((await h.call(dm, 'dm:dungeon:show', { on: false })).ok && (await h.until(() => !a.last.dungeon.on)), 'the party leaves from the entrance');
  ok(a.last.trail.at(-1).kind === 'leave', 'the trail logs leaving');
  await h.call(dm, 'dm:dungeon:clear');
  ok(await h.until(() => dm.last.dungeon.nodes.length === 0), 'clear empties the dungeon');
  await h.call(dm, 'dm:dungeon:example');
  ok(await h.until(() => dm.last.dungeon.nodes.length === 16), 'the example comes back');
  await h.done(srv);
})();
