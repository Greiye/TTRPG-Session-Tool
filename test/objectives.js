// Secret player objectives: only the owner's phone and the DM see one until the DM reveals it.
const assert = require('assert');
const objectives = require('../src/objectives');
const { viewState } = require('../src/visibility');

const roster = { a: { id: 'a', name: 'Thorn' }, b: { id: 'b', name: 'Vex' } };
const dm = { role: 'dm' }, tv = { role: 'screen' }, codm = { role: 'codm' }, spec = { role: 'spectator' };
const pa = { role: 'player', charId: 'a' }, pb = { role: 'player', charId: 'b' }, guest = { role: 'guest' };

// Validation: unknown character and empty title are refused; text is capped.
assert.strictEqual(objectives.create({ charId: 'zz', title: 'x' }, 'o1', roster), null);
assert.strictEqual(objectives.create({ charId: 'a', title: '   ' }, 'o1', roster), null);
const o = objectives.create({ charId: 'a', title: 'Find my brother', text: 'x'.repeat(900) }, 'o1', roster);
assert.strictEqual(o.text.length, 600);
assert.strictEqual(o.name, 'Thorn');
assert.deepStrictEqual(o.vis, { to: ['a'], screen: false });

const list = [o];
const base = { objectives: list, players: [], combat: { enemies: [] }, log: [] };
const seen = (v) => viewState(base, v).objectives.map((x) => x.id);

// Secret: owner and DM only.
assert.deepStrictEqual(seen(pa), ['o1']);
assert.deepStrictEqual(seen(pb), []);
assert.deepStrictEqual(seen(dm), ['o1']);
assert.deepStrictEqual(seen(tv), []);
assert.deepStrictEqual(seen(codm), []);
assert.deepStrictEqual(seen(spec), []);
assert.deepStrictEqual(seen(guest), []);

// Revealed: every phone and the TV see it.
objectives.setRevealed(list, 'o1', true);
assert.strictEqual(o.revealed, true);
for (const v of [pa, pb, tv, spec, dm]) assert.deepStrictEqual(seen(v), ['o1']);
assert.deepStrictEqual(seen(guest), []); // unjoined phones still see nothing
assert.deepStrictEqual(seen(codm), ['o1']); // the co-DM sees what the TV shows

// Hidden again: back to the owner.
objectives.setRevealed(list, 'o1', false);
assert.deepStrictEqual(seen(pb), []);
assert.deepStrictEqual(seen(pa), ['o1']);
assert.deepStrictEqual(seen(tv), []);

// Unknown id is a no-op.
objectives.setRevealed(list, 'nope', true);
assert.strictEqual(list.length, 1);

console.log('objectives: all passed');
