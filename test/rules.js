// Unit checks for dice and rules adapters.
const assert = require('assert');
const dice = require('../src/dice');
const rules = require('../src/rules');

for (let i = 0; i < 200; i++) {
  const r = dice.roll('4d6kh3+2');
  assert.strictEqual(r.dice.filter((x) => x.kept).length, 3);
  assert(r.total >= 5 && r.total <= 20);
  const a = dice.d20('adv');
  assert.strictEqual(a.natural, Math.max(...a.dice));
  const dz = dice.d20('dis');
  assert.strictEqual(dz.natural, Math.min(...dz.dice));
}
assert.strictEqual(dice.parse('2d6+'), null);
assert.strictEqual(dice.parse('hello'), null);
assert.strictEqual(dice.roll('3').total, 3);
assert.strictEqual(dice.roll('1d1000-1d1000+5').dice.length, 2);

for (const { id } of rules.list()) {
  const sys = rules.get(id);
  for (const cls of Object.keys(sys.classes)) {
    const c = { name: 'T', ...sys.newStats(cls) };
    for (const sk of sys.skills) {
      const r = sys.check(c, sk, { dc: 10 });
      assert(Number.isFinite(r.total) && typeof r.pass === 'boolean' && r.text, `${id} check`);
    }
    for (const g of Object.values(sys.skillGroups)) for (const sk of g) assert(sys.skills.includes(sk), `${id} group skill ${sk}`);
    const atk = sys.attack(c, { name: 'Foe', ac: 12 });
    assert(typeof atk.hit === 'boolean' && atk.damage >= 0);
  }
  assert(rules.describe(id).classes);
}
// Daggerheart: matching dice always succeed.
const dh = rules.get('daggerheart');
let crits = 0;
for (let i = 0; i < 2000; i++) { const r = dh.check({ skills: {} }, 'Agility', { dc: 99 }); if (r.crit) { crits++; assert(r.pass); } }
assert(crits > 50);
console.log('rules: all passed');
