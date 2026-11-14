// Dungeon nodes (exploration): the tree of rooms, fog for unrevealed rooms, and the DM-only socket events.
const dg = require('../src/dungeon');
const { harness } = require('./helpers');
const h = harness('dungeon');
const { ok } = h;

const D = dg.example();
ok(D.on && D.here === 'd1' && D.nodes.length === 16, 'a fresh dungeon is the example, shown, with the party at the entrance');
const lv = dg.levels(D.nodes);
ok(lv.d1 === 1 && lv.d2 === 2 && lv.d6 === 3 && lv.d10 === 4 && lv.d16 === 6, 'a level is one more than the deepest parent');

let tv = dg.viewFor(D, { role: 'screen' });
ok(tv.nodes.filter((n) => n.revealed).length === 1, 'the TV sees only the revealed entrance');
ok(tv.nodes.filter((n) => n.fog).length === 3 && tv.nodes.every((n) => n.revealed || (n.name === null && n.kind === null)), 'the three ways on show as fog, with no name or kind');
ok(!tv.nodes.some((n) => 'note' in n), 'DM notes never leave the DM');
ok(dg.viewFor(D, { role: 'dm' }).nodes.length === 16, 'the DM sees every room');

ok(dg.moveTo(D, 'd2') && D.here === 'd2' && dg.byId(D, 'd2').visited && dg.byId(D, 'd2').revealed, 'moving the party reveals and visits the room');
tv = dg.viewFor(D, { role: 'player', charId: 'x' });
ok(tv.here === 'd2' && tv.nodes.some((n) => n.id === 'd5' && n.fog), 'the next room past the party shows as fog');
const fog6 = tv.nodes.find((n) => n.id === 'd6');
ok(fog6 && fog6.parents.every((p) => tv.nodes.find((n) => n.id === p)?.revealed), 'a fogged room keeps only ropes from revealed rooms');

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
  ok(await h.until(() => a.last?.dungeon?.nodes?.length === 4), 'a phone gets the entrance and three fogged ways');
  ok((await h.call(a, 'dm:dungeon:here', { id: 'd2' })).error, 'a phone cannot move the party');
  ok((await h.call(dm, 'dm:dungeon:here', { id: 'd3' })).ok, 'the DM moves the party');
  ok(await h.until(() => a.last.dungeon.here === 'd3' && a.last.log.some((l) => /moves to Explore Right Tunnel/.test(l.text))), 'the phone sees the move and the log line');
  const add = await h.call(dm, 'dm:dungeon:node', { name: 'Side Door', kind: 'secret', parent: 'd3' });
  ok(add.ok && (await h.until(() => a.last.dungeon.nodes.find((n) => n.id === add.id)?.fog)), 'a new hidden room past the party shows as fog');
  await h.call(dm, 'dm:dungeon:reveal', { id: add.id, on: true });
  ok(await h.until(() => a.last.dungeon.nodes.find((n) => n.id === add.id)?.name === 'Side Door'), 'revealing names the room');
  await h.call(dm, 'dm:dungeon:clear');
  ok(await h.until(() => a.last.dungeon.nodes.length === 0), 'clear empties the dungeon');
  await h.call(dm, 'dm:dungeon:example');
  ok(await h.until(() => dm.last.dungeon.nodes.length === 16), 'the example comes back');
  await h.done(srv);
})();
