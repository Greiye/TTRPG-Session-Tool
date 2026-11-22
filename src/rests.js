// Rest rules (Phase C): what each class gets back on a short or long rest, and the hit dice spent at camp.
// Class features with limited uses are tracked on the character as p.uses[name] = uses spent.
const { rollDice } = require('./dice');

const mod = (score) => Math.floor(((score ?? 10) - 10) / 2);

// max(c) gives the uses at this level (0 means the feature is not yet unlocked); reset(c) is the rest that refills it.
const FEATURES = {
  Fighter: [
    { name: 'Second Wind', max: () => 1, reset: () => 'short', text: 'As a bonus action, regain hit points equal to 1d10 plus your fighter level.', effect: (c) => heal(c, rollDice([1, 10, c.level || 1]).total) },
    { name: 'Action Surge', max: (c) => (c.level >= 2 ? 1 : 0), reset: () => 'short', text: 'Push past your limits: take one additional action on this turn.', effect: (c) => { c.surge = true; return { text: 'and gets one more action this turn' }; } },
  ],
  Cleric: [{ name: 'Channel Divinity', max: () => 1, reset: () => 'short', text: 'Channel divine energy for an effect such as Turn Undead or your domain\'s power.' }],
  Bard: [{ name: 'Bardic Inspiration', max: (c) => Math.max(1, mod(c.abilities?.cha)), reset: (c) => (c.level >= 5 ? 'short' : 'long'), text: 'As a bonus action, give an ally within 60 ft an inspiration die to add to one roll in the next 10 minutes.' }],
  Druid: [{ name: 'Wild Shape', max: () => 2, reset: () => 'short', text: 'As an action, take the shape of a beast you have seen. Your DM sets the stats.' }],
  Paladin: [
    { name: 'Lay on Hands', max: (c) => 5 * (c.level || 1), reset: () => 'long', pool: true, text: 'Touch a creature to restore hit points from your pool. Each activation spends 1 point; 5 points cure a disease or poison.' }, // a pool of points, not a use count
    { name: 'Channel Divinity', max: (c) => (c.level >= 3 ? 1 : 0), reset: () => 'short', text: 'Channel divine energy for your oath\'s power.' },
  ],
};

// Automated feature effects (Mike, Nov 21: "class features automated"). Each returns { text, healed? } for the log.
// The DM can still change HP afterwards; features without an effect just spend the use and tell the table.
function heal(c, amount) {
  const before = c.hp;
  c.hp = Math.min(c.maxHp, c.hp + Math.max(0, amount));
  return { text: `and heals ${c.hp - before} HP`, healed: c.hp - before };
}

const unlocked = (c) => (FEATURES[c.cls] || []).filter((f) => f.max(c) > 0);
const spendable = (c) => Math.max(0, (c.level || 1) - (c.hitDice?.used || 0));

// Spend n hit dice (Phase C; Nov 21 also from the phone's prompt): each heals d(die) + CON, at least 1.
// Returns { n, healed, line } or null when nothing was spent.
function spendHitDice(p, want) {
  const n = Math.min(spendable(p), Math.max(0, Math.floor(Number(want)) || 0));
  if (n <= 0) return null;
  p.hitDice ??= { die: 8, used: 0 };
  const die = p.hitDice.die || 8;
  const conMod = mod(p.abilities?.con);
  let healed = 0;
  const rolls = [];
  for (let i = 0; i < n; i++) {
    const r = Math.max(1, rollDice([1, die, conMod]).total);
    rolls.push(r);
    healed += r;
  }
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + healed);
  p.hitDice.used = (p.hitDice.used || 0) + n;
  return { n, healed: p.hp - before, line: `spends ${n} hit di${n > 1 ? 'ce' : 'e'} (d${die}${conMod ? `${conMod > 0 ? '+' : ''}${conMod}` : ''}: ${rolls.join(', ')}) and heals ${p.hp - before} HP` };
}
// Hit dice prompt (Mike, Nov 21): after a short rest (or when the DM offers), a character who is hurt and has
// dice left gets a pop-up on their phone to spend some. `n` changes with every new offer.
let offerSeq = 0;
function offerHitDice(p, why) {
  if (!p.hitDice?.die || spendable(p) <= 0) { delete p.hdOffer; return false; }
  p.hdOffer = { n: ++offerSeq, why: String(why || 'Hit dice').slice(0, 40) };
  return true;
}

// Apply one character's rest in place. Returns short lines for the log (empty when nothing changed).
// spend: hit dice the character spends on a short rest (ignored on a long rest and clamped to what is left).
function restCharacter(p, kind, spend = 0) {
  p.uses ??= {};
  const out = [];
  const short = kind === 'short';

  if (short) {
    const hd = spendHitDice(p, spend);
    if (hd) out.push(hd.line);
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
  if (short && p.hp < p.maxHp) offerHitDice(p, 'Short rest');
  else delete p.hdOffer;
  return out;
}

// What a character's sheet shows: each unlocked feature with its maximum and the rest that refills it.
const featureList = (c) => unlocked(c).map((f) => ({ name: f.name, max: f.max(c), reset: f.reset(c), pool: !!f.pool, text: f.text || '', auto: !!f.effect }));

// Spend one use (or one pool point) of a feature from the phone. Returns { left } or { error }.
function useFeature(p, name) {
  const f = unlocked(p).find((x) => x.name === name);
  if (!f) return { error: 'You do not have that feature.' };
  p.uses ??= {};
  const max = f.max(p);
  const spent = p.uses[f.name] || 0;
  if (spent >= max) return { error: `No uses of ${f.name} left. It refills on a ${f.reset(p)} rest.` };
  p.uses[f.name] = spent + 1;
  const fx = f.effect ? f.effect(p) || {} : {};
  return { left: max - spent - 1, pool: !!f.pool, text: fx.text || '', healed: fx.healed || 0 };
}

// Camp class section: what this character's class gets back on each rest, and camp ideas for the class.
const CAMP_IDEAS = {
  Barbarian: ['Hunt for fresh meat', 'Sleep like a rock by the fire', 'Wrestle a party member for fun'],
  Bard: ['Play a song by the fire', 'Turn today into a tale', 'Practise a new verse'],
  Cleric: ['Lead an evening prayer', 'Tend the party\'s wounds', 'Bless the camp'],
  Druid: ['Gather herbs and berries', 'Listen to the forest', 'Talk with a local animal'],
  Fighter: ['Sharpen and oil your weapons', 'Drill your stances', 'Take first watch'],
  Monk: ['Meditate at dawn', 'Run through your forms', 'Fast and focus'],
  Paladin: ['Keep a vigil and pray', 'Polish your armour', 'Recite your oath'],
  Ranger: ['Forage and set snares', 'Scout the perimeter', 'Read the tracks around camp'],
  Rogue: ['Scout the perimeter quietly', 'Practise on a lock', 'Count the party\'s coin twice'],
  Sorcerer: ['Let the magic settle', 'Test the edges of your power', 'Stare into the fire'],
  Warlock: ['Commune with your patron', 'Study a forbidden tome', 'Whisper to the dark'],
  Wizard: ['Study your spellbook', 'Copy a spell scroll', 'Take notes on today\'s magic'],
};
function campInfo(c) {
  if (!c) return null;
  const left = spendable(c);
  const die = c.hitDice?.die || 8;
  const feats = featureList(c).map((f) => ({ name: f.name, reset: f.reset, max: f.max, left: Math.max(0, f.max - ((c.uses || {})[f.name] || 0)) }));
  const short = [`Spend hit dice: d${die} + CON each (${left} left)`];
  if (c.cls === 'Warlock') short.push('Pact Magic slots refill');
  if (c.cls === 'Wizard') short.push(`Arcane Recovery: up to ${Math.ceil((c.level || 1) / 2)} slot levels back`);
  for (const f of feats) if (f.reset === 'short') short.push(`${f.name} refills`);
  const back = Math.max(1, Math.floor((c.level || 1) / 2));
  const long = ['HP back to full', `Regain ${back} hit di${back > 1 ? 'ce' : 'e'}`];
  if (Object.keys(c.slots || {}).length) long.push('All spell slots refill');
  if (feats.length) long.push(`${feats.map((f) => f.name).join(', ')} refill`);
  return { cls: c.cls || '', level: c.level || 1, short, long, features: feats, ideas: CAMP_IDEAS[c.cls] || ['Keep watch', 'Mend your gear', 'Share a story by the fire'] };
}

module.exports = { FEATURES, unlocked, spendable, spendHitDice, offerHitDice, restCharacter, featureList, useFeature, campInfo, CAMP_IDEAS };
