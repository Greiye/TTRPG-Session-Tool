// Battle map kinds and light (Mike, Nov 22): dungeon generation (src/iso.js over the iso core), walking through
// doors, sight blocked by doors, the DM's light override, and the Battle Master may use it.
const iso = require('../src/iso');
const roles = require('../src/roles');
let failures = 0;
const ok = (c, m) => { if (c) console.log(`  ok   ${m}`); else { failures++; console.log(`  FAIL ${m}`); } };

const map = (cols = 20, rows = 14) => ({ cols, rows, terrain: {}, fog: false });
const d1 = iso.generate(map(), 7, 'dungeon');
const d2 = iso.generate(map(), 7, 'dungeon');
ok(d1.theme === 'dungeon' && JSON.stringify(d1.terrain) === JSON.stringify(d2.terrain) && JSON.stringify(d1.props) === JSON.stringify(d2.props), 'same seed, same dungeon');
const walls = Object.values(d1.terrain).filter((t) => t === 'wall').length;
ok(walls > 20 * 14 * 0.3 && walls < 20 * 14, 'a dungeon is mostly wall, with some floor');
ok(Object.values(d1.ground).includes('flagstone') && Object.values(d1.ground).includes('cobble'), 'flagstone rooms, cobbled corridors');
let doors = 0;
for (let s = 1; s < 40; s++) doors += Object.values(iso.generate(map(), s, 'dungeon').props).filter((p) => p === 'door').length;
ok(doors > 10, 'doorways get doors');
ok(Object.values(d1.props).every((p) => iso.PROPS.includes(p)), 'every prop is a known prop');
const o = iso.generate(map(), 7, 'outdoor');
ok(o.theme === 'outdoor' && !Object.values(o.ground).some((g) => ['flagstone', 'cobble', 'moss'].includes(g)), 'outdoors has no dungeon floor');
ok(iso.generate(map(), 7, 'castle').theme === 'outdoor', 'an unknown kind is outdoors');
ok(iso.generate(d1, 8).theme === 'dungeon', 'with no kind the map keeps its kind');

// A door: walk through it, but it blocks sight.
const m = { cols: 5, rows: 1, terrain: {}, props: { '2,0': 'door' } };
const r = iso.route(m, { x: 0, y: 0 }, { x: 4, y: 0 });
ok(r && r.ft === 20, 'a walker goes through a door');
ok(!iso.sees(m, { x: 0, y: 0 }, { x: 4, y: 0 }), 'a closed door blocks sight');
const m2 = { cols: 5, rows: 1, terrain: {}, props: { '2,0': 'pillar' } };
ok(!iso.route(m2, { x: 0, y: 0 }, { x: 4, y: 0 }), 'a pillar blocks the way');
ok(iso.cover({ cols: 5, rows: 1, props: { '3,0': 'barrel' } }, { x: 0, y: 0 }, { x: 4, y: 0 }) === 2, 'a barrel gives half cover');
ok(iso.cover({ cols: 5, rows: 1, props: { '3,0': 'pillar' } }, { x: 0, y: 0 }, { x: 4, y: 0 }) === 5, 'a pillar gives three-quarters cover');

// Light override.
const lm = map();
ok(iso.setDaylight(lm, 'night') && lm.daylight === 'night', 'the DM sets night');
ok(!iso.setDaylight(lm, 'noon!') && lm.daylight === 'night', 'an unknown light is ignored');
ok(iso.setDaylight(lm, 'auto') && lm.daylight === undefined, 'Auto clears the override');
ok(roles.can('battle', 'dm:map:daylight') && !roles.can('social', 'dm:map:daylight'), 'the Battle Master may set the light; the Social Master may not');
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
