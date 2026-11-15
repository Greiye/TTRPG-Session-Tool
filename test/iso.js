// Iso battle map: movement over heights, 3D line of sight, cover, tile edits and generated terrain (src/iso.js).
const { harness } = require('./helpers');
const iso = require('../src/iso');
const h = harness('iso');
const { ok, until } = h;

// ---- rules, no server ----
const flat = (cols = 8, rows = 6, extra = {}) => ({ cols, rows, terrain: {}, elev: {}, ground: {}, props: {}, ...extra });
{
  const m = flat();
  ok(iso.route(m, { x: 0, y: 0 }, { x: 3, y: 0 }).ft === 15, 'three flat tiles cost 15 ft');
  m.elev['1,0'] = 1; m.elev['2,0'] = 2;
  const up = iso.route(m, { x: 0, y: 0 }, { x: 2, y: 0 });
  ok(up && up.ft > 10, 'climbing costs extra feet');
  m.elev['1,0'] = 3; m.elev['1,1'] = 3; m.elev['1,2'] = 3; m.elev['1,3'] = 3; m.elev['1,4'] = 3; m.elev['1,5'] = 3; m.elev['2,0'] = 0;
  ok(iso.route(m, { x: 0, y: 0 }, { x: 2, y: 0 }) === null, 'a cliff three steps high cannot be walked');
  ok(iso.route(m, { x: 0, y: 0 }, { x: 2, y: 0 }, { flying: true })?.ft === 10, 'fliers cross the cliff at flat cost');
  const w = flat(); w.ground['1,0'] = 'water';
  ok(iso.route(w, { x: 0, y: 0 }, { x: 1, y: 0 }).ft === 10, 'water costs double');
  ok(iso.route(w, { x: 0, y: 0 }, { x: 1, y: 0 }, { maxFt: 5 }) === null, 'a route past maxFt is refused');
  const r = flat(); r.props['1,0'] = 'rock';
  ok(iso.route(r, { x: 0, y: 0 }, { x: 1, y: 0 }) === null, 'walkers cannot enter a rock tile');
  ok(iso.route(r, { x: 0, y: 0 }, { x: 1, y: 0 }, { flying: true })?.ft === 5, 'fliers pass over a rock');
}
{
  const m = flat(10, 3);
  ok(iso.sees(m, { x: 0, y: 1 }, { x: 9, y: 1 }), 'open ground: clear line of sight');
  for (let y = 0; y < 3; y++) m.terrain[`5,${y}`] = 'wall';
  ok(!iso.sees(m, { x: 0, y: 1 }, { x: 9, y: 1 }), 'a wall line blocks sight');
  const hill = flat(10, 3); for (let y = 0; y < 3; y++) hill.elev[`5,${y}`] = 6;
  ok(!iso.sees(hill, { x: 0, y: 1 }, { x: 9, y: 1 }), 'a high ridge blocks sight');
}
{
  const m = flat(10, 5);
  ok(iso.cover(m, { x: 0, y: 2 }, { x: 6, y: 2 }) === 0, 'no cover in the open');
  m.props['5,2'] = 'crate';
  ok(iso.cover(m, { x: 0, y: 2 }, { x: 6, y: 2 }) === 2, 'a crate on the attacker side gives half cover');
  m.props['5,2'] = 'tree';
  ok(iso.cover(m, { x: 0, y: 2 }, { x: 6, y: 2 }) === 5, 'a tree gives three-quarters cover');
  ok(iso.cover(m, { x: 5, y: 1 }, { x: 6, y: 2 }) === 0, 'adjacent attackers ignore cover');
  const ledge = flat(10, 5); ledge.elev['5,2'] = 2;
  ok(iso.cover(ledge, { x: 0, y: 2 }, { x: 6, y: 2 }) === 2, 'ground two steps higher gives half cover');
}
{
  const m = flat(4, 4);
  ok(iso.editTile(m, { x: 1, y: 1, elev: 4 }) && m.elev['1,1'] === 4, 'editTile sets a height');
  iso.editTile(m, { x: 1, y: 1, raise: -1 }); ok(m.elev['1,1'] === 3, 'editTile lowers by one step');
  iso.editTile(m, { x: 1, y: 1, elev: 99 }); ok(m.elev['1,1'] === iso.MAX_ELEV, 'height is clamped');
  iso.editTile(m, { x: 1, y: 1, elev: 0 }); ok(!('1,1' in m.elev), 'height 0 is not stored');
  iso.editTile(m, { x: 2, y: 2, ground: 'sand', prop: 'tree' }); ok(m.ground['2,2'] === 'sand' && m.props['2,2'] === 'tree', 'editTile sets ground and prop');
  iso.editTile(m, { x: 2, y: 2, ground: 'lava', prop: 'none' }); ok(m.ground['2,2'] === 'sand' && !m.props['2,2'], 'unknown ground is ignored, prop none clears');
  ok(!iso.editTile(m, { x: 9, y: 0, elev: 1 }), 'editTile refuses tiles off the map');
}
{
  const a = iso.generate(flat(16, 12), 42); const b = iso.generate(flat(16, 12), 42);
  ok(JSON.stringify([a.elev, a.ground, a.props, a.terrain]) === JSON.stringify([b.elev, b.ground, b.props, b.terrain]), 'same seed, same terrain');
  ok(a.seed === 42 && Object.keys(a.elev).length > 0, 'generated terrain has heights and keeps its seed');
  ok(Object.values(a.elev).every((v) => v >= 0 && v <= iso.MAX_ELEV), 'generated heights stay within range');
}

// ---- over the sockets ----
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);
  dm.emit('dm:map', { cols: 12, rows: 6 });
  await until(() => dm.last.map?.cols === 12);
  dm.emit('dm:map:tile', { x: 2, y: 2, elev: 3, ground: 'stone' });
  ok(await until(() => dm.last.map.elev?.['2,2'] === 3 && dm.last.map.ground?.['2,2'] === 'stone'), 'DM raises a tile and sets its ground');
  dm.emit('dm:map:paint', { x: 4, y: 4, kind: 'wall' });
  await until(() => dm.last.map.terrain['4,4'] === 'wall');
  dm.emit('dm:map:tile', { x: 4, y: 4, prop: 'crate' });
  ok(await until(() => dm.last.map.props?.['4,4'] === 'crate' && !dm.last.map.terrain['4,4']), 'a prop replaces a wall on the same tile');
  ok(a.last.map.elev?.['2,2'] === 3, 'players get the heights too');

  dm.emit('dm:token', { id: a.me.id, x: 0, y: 0 });
  await until(() => dm.last.tokens[a.me.id]);
  dm.emit('dm:map:generate', { seed: 7 });
  ok(await until(() => dm.last.map.seed === 7), 'DM generates terrain from a seed');
  const t = dm.last.tokens[a.me.id]; const k = `${t.x},${t.y}`;
  ok(!dm.last.map.terrain[k] && !dm.last.map.props[k], 'tokens are not left inside walls or props');
  ok(!(a.last.log || []).some((l) => /new terrain/.test(l.text)), 'the terrain note is for the DM only');

  // Line of sight in combat: a wall between Thorn and the goblin stops the attack before any roll.
  dm.emit('dm:map', { cols: 12, rows: 6 });
  await until(() => !dm.last.map.seed);
  for (let y = 0; y < 6; y++) dm.emit('dm:map:paint', { x: 5, y, kind: 'wall' });
  await until(() => dm.last.map.terrain['5,5'] === 'wall');
  dm.emit('dm:token', { id: a.me.id, x: 2, y: 2 });
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13, atk: 4, dmg: '1d6+2' });
  const gob = await until(() => dm.last.pendingPlace?.[0]);
  dm.emit('dm:token', { id: gob, x: 9, y: 2 });
  await until(() => dm.last.tokens[gob]);
  dm.emit('dm:combat:start', {});
  await until(() => dm.last.combat.active);
  for (let i = 0; i < 4 && dm.last.combat.order[dm.last.combat.turn].id !== a.me.id; i++) { const n = dm.last.combat.turn; dm.emit('dm:combat:next'); await until(() => dm.last.combat.turn !== n); }
  ok(dm.last.combat.order[dm.last.combat.turn].id === a.me.id, "it is Thorn's turn");
  a.emit('player:combat', { act: 'attack', target: gob });
  ok(await until(() => (a.last.log || []).some((l) => /no line of sight/.test(l.text))), 'an attack through a wall is refused with a note');
  ok(dm.last.combat.order[dm.last.combat.turn].id === a.me.id, 'the refused attack does not end the turn');
  ok(dm.last.combat.enemies.find((e) => e.id === gob).hp === 7, 'no damage through the wall');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
