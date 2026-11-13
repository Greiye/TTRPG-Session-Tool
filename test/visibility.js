const assert = require('assert');
const { canSee, viewState } = require('../src/visibility');
const dm = { role: 'dm' }, tv = { role: 'screen' }, a = { role: 'player', charId: 'a' }, b = { role: 'player', charId: 'b' }, g = { role: 'guest' };
assert(canSee(undefined, g) && canSee('all', tv));
assert(canSee('dm', dm) && !canSee('dm', a) && !canSee('dm', tv));
const w = { to: ['a'] };
assert(canSee(w, a) && !canSee(w, b) && !canSee(w, tv) && canSee(w, dm));
assert(canSee({ to: ['a'], screen: true }, tv));
const base = { players: [{ id: 'a', secret: 's', hooks: 'h', socketId: 'x', token: 't', hp: 3 }], combat: { enemies: [{ id: 'e', atk: 5, dmg: [1, 6, 2], hp: 7 }] }, log: [{ text: 'pub' }, { text: 'dmonly', vis: 'dm' }] };
const va = viewState(base, a), vd = viewState(base, dm), vb = viewState(base, b);
assert(!('secret' in va.players[0]) && !('token' in va.players[0]) && va.players[0].hp === 3);
assert(vd.players[0].secret === 's' && !('token' in vd.players[0]) && !('socketId' in vd.players[0]));
assert(!('atk' in va.combat.enemies[0]) && vd.combat.enemies[0].atk === 5);
assert(va.log.length === 1 && vd.log.length === 2);
// Fog of war: covered point-of-interest names reach the DM only.
const fog = { ...base, system: 'dnd5e', scene: { title: 't', poi: ['Shrine', 'Tracks', 'Mill'], revealed: ['Tracks'], secrets: [] } };
for (const v of [a, tv, g, { role: 'codm' }]) {
  const sc = viewState(fog, v).scene;
  assert.deepStrictEqual(sc.poi, [null, 'Tracks', null]);
  assert(!/Shrine|Mill/.test(JSON.stringify(viewState(fog, v))));
}
assert.deepStrictEqual(viewState(fog, dm).scene.poi, ['Shrine', 'Tracks', 'Mill']);
assert.deepStrictEqual(fog.scene.poi, ['Shrine', 'Tracks', 'Mill']); // the filter does not touch the live state
console.log('visibility: all passed');
