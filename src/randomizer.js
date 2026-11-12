// Creature randomizer (Phase 8, item 26): weighted slots, a seed that locks a result, and reroll of
// one slot at a time. Deterministic: the same seed gives the same creature, so a result can be shared.
const crypto = require('crypto');

// Small seeded PRNG (mulberry32) so a seed reproduces the same creature.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pickWeighted(options, r) {
  const total = options.reduce((s, o) => s + (o.weight ?? 1), 0);
  let x = r() * total;
  for (const o of options) { x -= o.weight ?? 1; if (x < 0) return o; }
  return options[options.length - 1];
}
// Each slot draws from its own stream, so rerolling one slot leaves the others alone.
function slotSeed(seed, slot) { return (seed ^ crypto.createHash('sha1').update(slot).digest().readUInt32LE(0)) >>> 0; }

function roll(table, seed) {
  const s = (seed ?? crypto.randomInt(2 ** 32)) >>> 0;
  const picks = {};
  for (const slot of table.slots) picks[slot.name] = pickWeighted(slot.options, rng(slotSeed(s, slot.name))).label;
  return { seed: s, picks };
}
// Reroll one slot. The seed stays (so the rest of the creature is kept); a counter gives the slot a fresh draw.
function reroll(table, result, slot) {
  if (!table.slots.some((x) => x.name === slot)) return result;
  const n = (result.n || 0) + 1;
  const def = table.slots.find((x) => x.name === slot);
  const draw = slotSeed((result.seed + Math.imul(n, 0x9e3779b9)) >>> 0, slot);
  return { seed: result.seed, n, picks: { ...result.picks, [slot]: pickWeighted(def.options, rng(draw)).label } };
}

// A starter table so the DM can try it straight away. Slots and weights are the DM's to change.
const TABLES = {
  patron: {
    name: 'Tavern patron',
    slots: [
      { name: 'Build', options: [{ label: 'lanky', weight: 2 }, { label: 'stocky', weight: 3 }, { label: 'towering', weight: 1 }] },
      { name: 'Coat', options: [{ label: 'road-worn leather', weight: 3 }, { label: 'fine wool', weight: 1 }, { label: 'patched cloak', weight: 2 }] },
      { name: 'Quirk', options: [{ label: 'hums off-key', weight: 2 }, { label: 'counts coins aloud', weight: 2 }, { label: 'wears a mask', weight: 1 }] },
      { name: 'Trouble', options: [{ label: 'owes money', weight: 3 }, { label: 'hunting someone', weight: 2 }, { label: 'nothing (yet)', weight: 2 }] },
    ],
  },
};

module.exports = { TABLES, roll, reroll, pickWeighted, rng };
