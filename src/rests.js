// Rest rules (Phase C): what each class gets back on a short or long rest, and the hit dice spent at camp.
// Class features with limited uses are tracked on the character as p.uses[name] = uses spent.
const { rollDice } = require('./dice');

const mod = (score) => Math.floor(((score ?? 10) - 10) / 2);

// max(c) gives the uses at this level (0 means the feature is not yet unlocked); reset(c) is the rest that refills it.
const FEATURES = {
  Fighter: [
    { name: 'Second Wind', max: () => 1, reset: () => 'short', text: 'As a bonus action, regain hit points equal to 1d10 plus your fighter level.' },
    { name: 'Action Surge', max: (c) => (c.level >= 2 ? 1 : 0), reset: () => 'short', text: 'Push past your limits: take one additional action on this turn.' },
  ],
  Cleric: [{ name: 'Channel Divinity', max: () => 1, reset: () => 'short', text: 'Channel divine energy for an effect such as Turn Undead or your domain\'s power.' }],
  Bard: [{ name: 'Bardic Inspiration', max: (c) => Math.max(1, mod(c.abilities?.cha)), reset: (c) => (c.level >= 5 ? 'short' : 'long'), text: 'As a bonus action, give an ally within 60 ft an inspiration die to add to one roll in the next 10 minutes.' }],
  Druid: [{ name: 'Wild Shape', max: () => 2, reset: () => 'short', text: 'As an action, take the shape of a beast you have seen. Your DM sets the stats.' }],
  Paladin: [
    { name: 'Lay on Hands', max: (c) => 5 * (c.level || 1), reset: () => 'long', pool: true, text: 'Touch a creature to restore hit points from your pool. Each activation spends 1 point; 5 points cure a disease or poison.' }, // a pool of points, not a use count
    { name: 'Channel Divinity', max: (c) => (c.level >= 3 ? 1 : 0), reset: () => 'short', text: 'Channel divine energy for your oath\'s power.' },
  ],
};

const unlocked = (c) => (FEATURES[c.cls] || []).filter((f) => f.max(c) > 0);
const spendable = (c) => Math.max(0, (c.level || 1) - (c.hitDice?.used || 0));

// Apply one character's rest in place. Returns short lines for the log (empty when nothing changed).
// spend: hit dice the character spends on a short rest (ignored on a long rest and clamped to what is left).
function restCharacter(p, kind, spend = 0) {
  p.uses ??= {};
  const out = [];
  const short = kind === 'short';

  if (short) {
    const n = Math.min(spendable(p), Math.max(0, Math.floor(Number(spend)) || 0));
    if (n > 0) {
      const die = p.hitDice?.die || 8;
      const conMod = mod(p.abilities?.con);
      let healed = 0;
      const rolls = [];
      for (let i = 0; i < n; i++) {
        const r = Math.max(1, rollDice([1, die, conMod]).total); // d(die)+CON, at least 1
        rolls.push(r);
        healed += r;
      }
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + healed);
      p.hitDice.used = (p.hitDice.used || 0) + n;
      out.push(`spends ${n} hit di${n > 1 ? 'ce' : 'e'} (d${die}${conMod ? `${conMod > 0 ? '+' : ''}${conMod}` : ''}: ${rolls.join(', ')}) and heals ${p.hp - before} HP`);
    }
    // Warlock: Pact Magic slots refill on a short rest.
    if (p.cls === 'Warlock') {
      const refilled = Object.values(p.slots || {}).some((s) => s.used > 0);
      for (const s of Object.values(p.slots || {})) s.used = 0;
      if (refilled) out.push('pact magic slots refill');
    }
    // Wizard: Arcane Recovery gets back slot levels up to half the wizard level (rounded up), never 6th level or higher.
    if (p.cls === 'Wizard') {
      let budget = Math.ceil((p.level || 1) / 2);
      const back = [];
      for (const [lvl, s] of Object.entries(p.slots || {}).sort(([a], [b]) => a - b)) {
        while (Number(lvl) <= 5 && s.used > 0 && Number(lvl) <= budget) {
          s.used -= 1;
          budget -= Number(lvl);
          back.push(lvl);
        }
      }
      if (back.length) out.push(`Arcane Recovery returns slots (levels ${back.join(', ')})`);
    }
  } else {
    p.hp = p.maxHp;
    p.tempHp = 0;
    for (const s of Object.values(p.slots || {})) s.used = 0;
    p.hitDice.used = Math.max(0, (p.hitDice.used || 0) - Math.max(1, Math.floor((p.level || 1) / 2)));
    if (p.conditions?.includes('Exhaustion')) p.conditions = p.conditions.filter((x) => x !== 'Exhaustion');
  }

  // Class features: short rest refills short-reset features, long rest refills everything.
  const back = unlocked(p).filter((f) => {
    const was = p.uses[f.name] || 0;
    const r = f.reset(p);
    return was > 0 && (!short || r === 'short');
  });
  for (const f of back) p.uses[f.name] = 0;
  if (back.length) out.push(`${back.map((f) => f.name).join(' and ')} ${back.length > 1 ? 'are' : 'is'} restored`);
  return out;
}

// What a character's sheet shows: each unlocked feature with its maximum and the rest that refills it.
const featureList = (c) => unlocked(c).map((f) => ({ name: f.name, max: f.max(c), reset: f.reset(c), pool: !!f.pool, text: f.text || '' }));

// Spend one use (or one pool point) of a feature from the phone. Returns { left } or { error }.
function useFeature(p, name) {
  const f = unlocked(p).find((x) => x.name === name);
  if (!f) return { error: 'You do not have that feature.' };
  p.uses ??= {};
  const max = f.max(p);
  const spent = p.uses[f.name] || 0;
  if (spent >= max) return { error: `No uses of ${f.name} left. It refills on a ${f.reset(p)} rest.` };
  p.uses[f.name] = spent + 1;
  return { left: max - spent - 1, pool: !!f.pool };
}

module.exports = { FEATURES, unlocked, spendable, restCharacter, featureList, useFeature };
