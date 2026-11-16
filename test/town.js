// Town visits and the segmented time clock (PR V): the town map rules, the Enter Town gate, picks that settle once
// everyone confirms, the clock moving on per road leg and per town place, and what each screen sees.
const town = require('../src/town');
const wm = require('../src/worldmap');
const { harness } = require('./helpers');
const h = harness('town');
const { ok } = h;

// ----- pure rules -----
const W = wm.example();
const T = town.withStarter();
const players = [{ id: 'a', online: true }, { id: 'b', online: true }, { id: 'c', online: false }];
const m = T.maps.w1;
ok(m.nodes.map((n) => n.name).join() === 'Settlement entrance,Farm,Marketplace,Smithy,Wizards Tower' && m.nodes.every((n) => !n.seen), 'the starting town has five hidden places');
ok(W.nodes.find((n) => n.id === 'w1').settlement && town.settlementHere(W)?.id === 'w1', 'Millbrook is a town with a town map, and the party starts on it');

ok(town.gate(T, W, players) === null, 'a new table wakes in Millbrook with the gate shut (no pop-up on joining)');
T.skipAt = null; // the DM opens the gate
let g = town.gate(T, W, players);
ok(g && g.name === 'Millbrook' && g.total === 2 && g.ready.length === 0, 'standing on a town opens the Enter Town gate for the online players');
ok(town.viewFor(T, W, { role: 'screen' }, players).contents.w1.places.length === 0 && town.viewFor(T, W, { role: 'screen' }, players).contents.w1.hidden === 5, 'the TV hover list shows no hidden places, only how many are left');
ok(town.viewFor(T, W, { role: 'dm' }, players).contents.w1.places.length === 5, 'the DM hover list shows every place');
g = town.setReady(T, W, players, 'a');
ok(!town.allReady(g), 'one of two ready is not enough');
g = town.setReady(T, W, players, 'b');
ok(town.allReady(g), 'every online player ready opens the town');

const e = town.enter(T, W);
ok(e.ok && T.on && T.here === 't1', 'entering puts the party at the Settlement entrance');
ok(town.byId(m, 't2').seen && town.byId(m, 't3').seen && !town.byId(m, 't4').seen, 'the entrance reveals the farm and the marketplace, not the smithy');
ok(town.gate(T, W, players) === null, 'no gate while inside');
let tv = town.viewFor(T, W, { role: 'screen' }, players);
ok(tv.nodes.length === 3 && !tv.nodes.some((n) => n.id === 't4') && !('reveals' in tv.nodes[0]), 'the TV sees discovered places only, without the DM links');

ok(!town.pick(T, 'a', 't4', true, 1), 'a hidden place cannot be picked');
ok(!town.pick(T, 'a', 't1', true, 1), 'the place the party is at cannot be picked');
ok(town.pick(T, 'a', 't3', true, 10) && town.resolve(T, players) === null, 'one confirmed pick of two does not move the party');
ok(town.pick(T, 'b', 't2', false, 11) && town.resolve(T, players) === null, 'a pick that is not held does not count');
ok(town.pick(T, 'b', 't2', true, 12), 'the second player confirms another place');
const n1 = town.resolve(T, players);
ok(n1?.id === 't3' && T.here === 't3' && Object.keys(T.picks).length === 0, 'a tie goes to the pick confirmed first, and picks clear');
ok(town.byId(m, 't4').seen && town.byId(m, 't5').seen, 'the marketplace reveals the smithy and the wizards tower');
ok(!town.canLeave(T) && town.leave(T).error && T.on, 'the party leaves town only from the entrance');
town.pick(T, 'a', 't5', true, 20); town.pick(T, 'b', 't5', true, 21);
ok(town.resolve(T, players)?.time === 2, 'the wizards tower takes two segments');
ok(town.leave(T, true).ok && !T.on && town.gate(T, W, players) === null, 'leaving keeps the gate shut until the party moves on');

const add = town.save(m, { name: 'The Leaky Mug', kind: 'inn', x: 3, y: -1, time: 9 });
ok(add.node.x === 1 && add.node.y === 0 && add.node.time === town.MAX_TIME && !add.node.seen, 'a new place is clamped to the picture, hidden, and its time capped');
ok(town.save(m, { id: 't1', reveals: ['t2', 't1', 'nope'] }).node.reveals.join() === 't2', 'reveals keep real other places only');
ok(town.remove(T, m, add.node.id) && !town.byId(m, add.node.id), 'a place can be removed');

// ----- world map legs use time -----
const legs = [];
const W2 = wm.example();
wm.go(W2, 'w3', { now: 0, seated: 1, log: () => {}, nextId: () => 1 }, { anyRoad: true });
const c = (now) => ({ now, seated: 1, log: () => {}, nextId: () => 1, random: () => 0, onLeg: (n, to) => legs.push([n, to.id]) });
wm.tick(W2, c(60000));
wm.tick(W2, c(60000 + 120000));
ok(legs.join('|') === '1,w2|2,w3', 'each road leg reports its length in segments (1 then 2)');
W2.timeOnTravel = false;
wm.go(W2, 'w2', { now: 0, seated: 1, log: () => {}, nextId: () => 1 }, { anyRoad: true });
wm.tick(W2, c(10 ** 7));
ok(legs.length === 2, 'with Travel uses time off, legs cost nothing');

// ----- over the sockets -----
(async () => {
  const srv = await h.boot();
  try {
    const dm = await h.dm();
    const room = await h.room();
    const p1 = await h.player(room, 'Ana');
    const p2 = await h.player(room, 'Bo');
    const until = h.until;
    await h.wait(200);
    ok(p1.last?.town && p1.last.town.gate === null, 'no Enter Town window on joining a new table');
    ok((await h.call(dm, 'dm:town:gate')).ok, 'the DM opens the gate');
    ok(await until(() => p1.last?.town?.gate?.name === 'Millbrook'), 'a phone gets the Enter Town gate at Millbrook');
    ok((await h.call(p1, 'player:town:pick', { node: 't2', confirm: true })).error, 'no picks before the party is in town');
    await h.call(p1, 'player:town:ready', { on: true });
    await h.call(p2, 'player:town:ready', { on: true });
    ok(await until(() => p1.last.town.on && p1.last.town.here === 't1'), 'every phone holding Enter Town takes the party in');
    ok(await until(() => dm.last.worldMap.onTv), 'the TV shows the town over the world map');
    ok((await h.call(dm, 'dm:worldmap:go', { node: 'w2' })).error, 'world travel waits until the party leaves town');

    const label0 = dm.last.story.label;
    await h.call(p1, 'player:town:pick', { node: 't3', confirm: true });
    ok(await until(() => p2.last.town.tally?.counts?.t3 === 1 && p2.last.town.here === 't1'), 'one confirmed pick shows as a count and waits');
    await h.call(p2, 'player:town:pick', { node: 't3', confirm: true });
    ok(await until(() => p1.last.town.here === 't3'), 'once everyone confirms, the party goes');
    ok(await until(() => dm.last.story.label !== label0 && dm.last.story.from), 'the clock moves on by the place\'s time, and the TV knows where the dial started');
    ok(p1.last.town.nodes.some((n) => n.name === 'Smithy'), 'arriving at the marketplace discovers the smithy');
    ok(dm.last.trail.some((t) => t.kind === 'town' && t.where === 'Marketplace'), 'the trail records the town place');

    // DM edits: a new place dragged onto the map, linked to a shop.
    const shopId = dm.last.shops[0]?.id;
    const r = await h.call(dm, 'dm:town:node', { at: 'w1', name: 'Greer\'s stall', kind: 'market', x: 0.4, y: 0.4, shop: shopId, seen: true, time: 0 });
    ok(r.ok && r.id, 'the DM adds a place to the town map');
    ok(await until(() => p1.last.town.nodes.some((n) => n.id === r.id)), 'a discovered new place reaches the phones');
    await h.call(dm, 'dm:town:here', { id: r.id });
    ok(await until(() => p1.last.town.here === r.id && (!shopId || p1.last.shopPop?.shopId === shopId)), 'the DM moves the party; a place with a shop opens its pop-up');
    await h.call(dm, 'dm:town:show', { on: false });
    ok(await until(() => !p1.last.town.on && p1.last.town.gate === null), 'the DM can take the party out of town');
    ok(p1.last.worldMap.nodes.find((n) => n.id === 'w1')?.settlement, 'the world map marks the town for phones');

    // Travel on the world map spends a segment per leg.
    await h.call(dm, 'dm:worldmap:timing', { legSeconds: 5 });
    const moved = dm.last.story.moved;
    await h.call(dm, 'dm:worldmap:go', { node: 'w2' });
    ok(await until(() => dm.last.worldMap.here === 'w2' && dm.last.story.moved === moved + 1, 8000), 'a one-leg road moves the clock on one segment');
  } finally {
    await h.done(srv);
  }
})();
