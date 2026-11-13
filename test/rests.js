// Rest rules: per-class resources come back on the right rest, and hit dice spent heal and are counted.
const assert = require('assert');
const { restCharacter } = require('../src/rests');

const mk = (cls, extra = {}) => ({
  name: 'T', cls, level: 5, hp: 5, maxHp: 30, abilities: { con: 14, cha: 16, str: 10, dex: 10, int: 10, wis: 10 },
  hitDice: { die: 8, used: 0 }, slots: {}, uses: {}, ...extra,
});

// Warlock: pact slots refill on a short rest.
let w = mk('Warlock', { slots: { 3: { max: 2, used: 2 } } });
restCharacter(w, 'short');
assert.strictEqual(w.slots[3].used, 0);

// Wizard: Arcane Recovery returns up to ceil(level/2) slot levels, at level 5 that is 3.
let z = mk('Wizard', { slots: { 1: { max: 4, used: 3 }, 2: { max: 3, used: 2 } } });
restCharacter(z, 'short');
assert.strictEqual(z.slots[1].used, 0); // 3 levels of 1st back
assert.strictEqual(z.slots[2].used, 2); // nothing left in the budget

// Druid: Wild Shape refills on short; Cleric: Channel Divinity on short; both on long too.
let d = mk('Druid', { uses: { 'Wild Shape': 2 } });
restCharacter(d, 'short');
assert.strictEqual(d.uses['Wild Shape'], 0);
let c = mk('Cleric', { uses: { 'Channel Divinity': 1 } });
restCharacter(c, 'long');
assert.strictEqual(c.uses['Channel Divinity'], 0);

// Paladin: Lay on Hands is long-rest only; Channel Divinity (level 3+) is short.
let p = mk('Paladin', { uses: { 'Lay on Hands': 12, 'Channel Divinity': 1 } });
restCharacter(p, 'short');
assert.strictEqual(p.uses['Lay on Hands'], 12);
assert.strictEqual(p.uses['Channel Divinity'], 0);
restCharacter(p, 'long');
assert.strictEqual(p.uses['Lay on Hands'], 0);

// Hit dice: spending heals d(die)+CON per die (at least 1), capped at max HP, and counts the dice used.
let h = mk('Fighter', { hp: 5, hitDice: { die: 10, used: 1 } });
const lines = restCharacter(h, 'short', 9); // clamped to the 4 left (level 5 minus 1 used)
assert.strictEqual(h.hitDice.used, 5);
assert(h.hp > 5 && h.hp <= 30);
assert(lines.some((l) => /spends 4 hit dice/.test(l)));

// Hit dice spent on a long rest are ignored.
let l = mk('Fighter', { hp: 5 });
restCharacter(l, 'long', 3);
assert.strictEqual(l.hitDice.used, 0);
assert.strictEqual(l.hp, 30);

console.log('rests ok');
