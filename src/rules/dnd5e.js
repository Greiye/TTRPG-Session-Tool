// D&D 5e adapter. See ./index.js for the interface every rules system implements.
const { d20, rollDice, sign } = require('../dice');
const { int } = require('../util');

const CLASSES = {
  Fighter: { blurb: 'Tough frontliner · AC 17', hp: 28, ac: 17, atk: 5, dmg: [1, 10, 3], init: 1, skills: { Athletics: 5, Perception: 3, Intimidation: 2, Insight: 1, Persuasion: 0, Deception: 0, Stealth: 1, Investigation: 0, Survival: 3, Arcana: 0 } },
  Rogue: { blurb: 'Sneaky, sharp tongue · AC 15', hp: 22, ac: 15, atk: 6, dmg: [1, 6, 4], init: 4, skills: { Athletics: 0, Perception: 5, Intimidation: 0, Insight: 3, Persuasion: 2, Deception: 6, Stealth: 7, Investigation: 5, Survival: 1, Arcana: 1 } },
  Wizard: { blurb: 'Arcane blaster · AC 12', hp: 16, ac: 12, atk: 6, dmg: [2, 6, 0], init: 2, skills: { Athletics: -1, Perception: 1, Intimidation: 0, Insight: 3, Persuasion: 0, Deception: 0, Stealth: 2, Investigation: 6, Survival: 1, Arcana: 7 } },
  Cleric: { blurb: 'Healer, insightful · AC 18', hp: 24, ac: 18, atk: 5, dmg: [1, 8, 3], init: 0, skills: { Athletics: 2, Perception: 4, Intimidation: 0, Insight: 6, Persuasion: 3, Deception: -1, Stealth: -1, Investigation: 0, Survival: 2, Arcana: 1 } },
  Ranger: { blurb: 'Tracker, archer · AC 15', hp: 24, ac: 15, atk: 7, dmg: [1, 8, 4], init: 3, skills: { Athletics: 2, Perception: 6, Intimidation: 0, Insight: 2, Persuasion: 0, Deception: 0, Stealth: 6, Investigation: 2, Survival: 6, Arcana: 0 } },
  Bard: { blurb: 'Silver-tongued · AC 14', hp: 20, ac: 14, atk: 5, dmg: [1, 8, 3], init: 2, skills: { Athletics: 0, Perception: 2, Intimidation: 3, Insight: 3, Persuasion: 7, Deception: 6, Stealth: 2, Investigation: 1, Survival: 0, Arcana: 2 } },
  Druid: { blurb: 'Shapeshifter, nature caster · AC 13', hp: 22, ac: 13, atk: 5, dmg: [1, 6, 2], init: 1, skills: { Athletics: 1, Perception: 3, Intimidation: 0, Insight: 4, Persuasion: 0, Deception: 0, Stealth: 1, Investigation: 1, Survival: 4, Arcana: 2 } },
  Paladin: { blurb: 'Holy warrior, aura · AC 18', hp: 28, ac: 18, atk: 5, dmg: [1, 8, 3], init: 0, skills: { Athletics: 4, Perception: 1, Intimidation: 2, Insight: 1, Persuasion: 3, Deception: 0, Stealth: -1, Investigation: 0, Survival: 0, Arcana: 0 } },
  Warlock: { blurb: 'Pact-bound caster · AC 13', hp: 18, ac: 13, atk: 5, dmg: [1, 10, 0], init: 2, skills: { Athletics: 0, Perception: 1, Intimidation: 2, Insight: 1, Persuasion: 2, Deception: 3, Stealth: 2, Investigation: 2, Survival: 0, Arcana: 4 } },
  Barbarian: { blurb: 'Raging brawler · AC 15', hp: 30, ac: 15, atk: 5, dmg: [1, 12, 3], init: 1, skills: { Athletics: 5, Perception: 1, Intimidation: 3, Insight: 1, Persuasion: 0, Deception: 0, Stealth: 0, Investigation: 0, Survival: 3, Arcana: 0 } },
  Monk: { blurb: 'Unarmed martial artist · AC 16', hp: 20, ac: 16, atk: 5, dmg: [1, 6, 3], init: 3, skills: { Athletics: 2, Perception: 4, Intimidation: 0, Insight: 4, Persuasion: 0, Deception: 0, Stealth: 5, Investigation: 0, Survival: 2, Arcana: 0 } },
  Sorcerer: { blurb: 'Innate caster · AC 12', hp: 16, ac: 12, atk: 5, dmg: [1, 4, 0], init: 2, skills: { Athletics: 0, Perception: 1, Intimidation: 2, Insight: 1, Persuasion: 4, Deception: 3, Stealth: 1, Investigation: 0, Survival: 0, Arcana: 3 } },
};
const SKILLS = Object.keys(CLASSES.Fighter.skills);
const ABILITIES = [['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']];
const AB = ABILITIES.map((a) => a[0]);
// Which ability drives each skill (used for labels and for creatures, which have no skill table).
const SKILL_ABILITY = { Athletics: 'str', Stealth: 'dex', Perception: 'wis', Insight: 'wis', Survival: 'wis', Investigation: 'int', Arcana: 'int', Persuasion: 'cha', Deception: 'cha', Intimidation: 'cha' };
// Sheet defaults per class at level 1: ability scores, save proficiencies, hit die, level-1 spell slots.
const SHEET = {
  Fighter: { ab: [16, 12, 15, 10, 13, 8], saves: ['str', 'con'], hd: 10, slots: {}, lang: ['Common'] },
  Rogue: { ab: [10, 17, 13, 14, 12, 14], saves: ['dex', 'int'], hd: 8, slots: {}, lang: ['Common', "Thieves' Cant"] },
  Wizard: { ab: [8, 14, 14, 17, 12, 10], saves: ['int', 'wis'], hd: 6, slots: { 1: 2 }, lang: ['Common', 'Elvish'] },
  Cleric: { ab: [14, 10, 14, 10, 16, 12], saves: ['wis', 'cha'], hd: 8, slots: { 1: 2 }, lang: ['Common', 'Celestial'] },
  Ranger: { ab: [12, 16, 14, 10, 15, 8], saves: ['str', 'dex'], hd: 10, slots: {}, lang: ['Common', 'Sylvan'] },
  Bard: { ab: [8, 14, 13, 12, 10, 17], saves: ['dex', 'cha'], hd: 8, slots: { 1: 2 }, lang: ['Common', 'Elvish'] },
  Druid: { ab: [10, 12, 14, 10, 16, 8], saves: ['int', 'wis'], hd: 8, slots: { 1: 2 }, lang: ['Common', 'Sylvan'] },
  Paladin: { ab: [16, 10, 14, 8, 12, 14], saves: ['wis', 'cha'], hd: 10, slots: {}, lang: ['Common', 'Celestial'] },
  Warlock: { ab: [8, 14, 14, 10, 12, 16], saves: ['wis', 'cha'], hd: 8, slots: { 1: 1 }, lang: ['Common', 'Infernal'] },
  Barbarian: { ab: [15, 13, 14, 8, 12, 10], saves: ['str', 'con'], hd: 12, slots: {}, lang: ['Common'] },
  Monk: { ab: [10, 15, 12, 8, 14, 12], saves: ['str', 'dex'], hd: 8, slots: {}, lang: ['Common'] },
  Sorcerer: { ab: [8, 14, 14, 10, 12, 16], saves: ['con', 'cha'], hd: 6, slots: { 1: 2 }, lang: ['Common', 'Draconic'] },
};
// Encounter difficulty (DMG ch. 3). Per-character XP thresholds by level: [easy, medium, hard, deadly].
const XP_THRESHOLDS = [[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8700, 12700]];
// XP per challenge rating (DMG table).
const CR_XP = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000 };
const CR_KEYS = Object.keys(CR_XP);
// Rough CR from a foe's hit points, for foes whose plan line has no `cr:` key (DMG monster statistics, low CRs).
// Upper hp bound per CR. Anything above the last band is treated as CR 10 and flagged as estimated.
const HP_BANDS = [[6, '0'], [35, '1/8'], [49, '1/4'], [70, '1/2'], [85, '1'], [100, '2'], [115, '3'], [130, '4'], [145, '5'], [160, '6'], [175, '7'], [190, '8'], [205, '9'], [220, '10']];
const estimateCr = (hp) => (HP_BANDS.find(([max]) => hp <= max) || [0, '10'])[1];
const MULT = [1, 1.5, 2, 2.5, 3, 4]; // by foe count: 1, 2, 3-6, 7-10, 11-14, 15+
const multiplier = (n, party) => {
  let i = n <= 1 ? 0 : n === 2 ? 1 : n <= 6 ? 2 : n <= 10 ? 3 : n <= 14 ? 4 : 5;
  if (party < 3) i = Math.min(MULT.length - 1, i + 1); // small parties: one step harder
  else if (party > 5) i = Math.max(0, i - 1); // large parties: one step easier
  return MULT[i];
};
const RATINGS = ['trivial', 'easy', 'medium', 'hard', 'deadly'];
// foes: [{ name, count, hp, cr? }]. partyLevels: one level per character at the table.
function difficulty(partyLevels, foes) {
  const levels = (partyLevels || []).map((l) => Math.min(20, Math.max(1, Math.round(Number(l)) || 1)));
  if (!levels.length) return null;
  const totals = [0, 0, 0, 0];
  for (const l of levels) XP_THRESHOLDS[l - 1].forEach((t, i) => { totals[i] += t; });
  let raw = 0, count = 0, estimated = false;
  for (const f of foes) {
    const n = Math.max(0, Number(f.count) || 0);
    if (!n) continue;
    let cr = f.cr && CR_XP[f.cr] !== undefined ? f.cr : null;
    if (!cr) { cr = estimateCr(Number(f.hp) || 0); estimated = true; }
    raw += CR_XP[cr] * n;
    count += n;
  }
  const xp = Math.round(raw * multiplier(count, levels.length));
  // Rating is the highest threshold the adjusted XP reaches.
  let rating = 'trivial';
  totals.forEach((t, i) => { if (xp >= t) rating = RATINGS[i + 1]; });
  return { rating, xp, raw, foes: count, party: levels.length, thresholds: { easy: totals[0], medium: totals[1], hard: totals[2], deadly: totals[3] }, estimated };
}
const normalizeCr = (v) => (CR_KEYS.includes(String(v).trim()) ? String(v).trim() : null);

const mod = (score) => Math.floor(((score ?? 10) - 10) / 2);
const profBonus = (level) => 2 + Math.floor(((level || 1) - 1) / 4);

module.exports = {
  id: 'dnd5e',
  name: 'D&D 5e',
  classes: CLASSES,
  skills: SKILLS,
  skillGroups: {
    exploration: ['Perception', 'Investigation', 'Stealth', 'Survival', 'Athletics', 'Arcana'],
    social: ['Persuasion', 'Deception', 'Intimidation', 'Insight'],
  },
  defenseLabel: 'AC',
  dcLabel: 'DC',
  abilities: ABILITIES,
  skillAbility: SKILL_ABILITY,
  slotLevels: 9,
  languages: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon', "Thieves' Cant"],

  // Character sheet fields (item 2). Kept separate from the combat stats so older saves upgrade cleanly.
  sheetDefaults(cls) {
    const s = SHEET[cls] || SHEET.Fighter;
    return {
      abilities: Object.fromEntries(AB.map((k, i) => [k, s.ab[i]])), saveProf: [...s.saves], speed: 30,
      slots: Object.fromEntries(Object.entries(s.slots).map(([l, max]) => [l, { max, used: 0 }])),
      hitDice: { die: s.hd, used: 0 }, languages: [...s.lang],
    };
  },
  editSheet(c, f) {
    if (f.abilities) for (const k of AB) if (f.abilities[k] !== undefined) c.abilities[k] = int(f.abilities[k], 1, 30, c.abilities[k]);
    if (Array.isArray(f.saveProf)) c.saveProf = f.saveProf.filter((k) => AB.includes(k));
    if (f.hitDie !== undefined) c.hitDice.die = int(f.hitDie, 4, 12, c.hitDice.die);
  },
  abilityMod: (c, ab) => mod(c.abilities?.[ab]),
  prof: (c) => profBonus(c.level),
  saveBonus: (c, ab) => (c.saves?.[ab] ?? mod(c.abilities?.[ab]) + ((c.saveProf || []).includes(ab) ? profBonus(c.level) : 0)),
  passive: (c, skill) => 10 + (c.skills?.[skill] ?? mod(c.abilities?.[SKILL_ABILITY[skill]])),

  newStats(cls) {
    const c = CLASSES[cls];
    return { hp: c.hp, maxHp: c.hp, ac: c.ac, atk: c.atk, dmg: [...c.dmg], init: c.init, skills: { ...c.skills } };
  },

  editStats(c, f) {
    if (f.ac !== undefined) c.ac = int(f.ac, 1, 40, c.ac);
    if (f.atk !== undefined) c.atk = int(f.atk, -5, 20, c.atk);
    if (f.init !== undefined) c.init = int(f.init, -5, 20, c.init);
    if (f.dmg !== undefined) {
      const m = String(f.dmg).replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
      if (m) c.dmg = [int(m[1], 1, 20, 1), int(m[2], 2, 20, 6), int(m[3] || 0, -10, 30, 0)];
    }
    if (f.skills) for (const k of SKILLS) if (f.skills[k] !== undefined) c.skills[k] = int(f.skills[k], -5, 20, c.skills[k] ?? 0);
  },

  bonus: (c, skill) => c.skills?.[skill] ?? 0,

  // Any d20 test: label + modifier. dc optional. mode: 'adv' | 'dis' | undefined.
  test(label, mod, { dc, mode } = {}) {
    const r = d20(mode);
    const total = r.natural + mod;
    const pass = dc == null ? null : total >= dc;
    const dice = r.mode ? `d20${r.mode === 'adv' ? '↑' : '↓'}(${r.dice.join(',')})` : `d20(${r.natural})`;
    return { natural: r.natural, dice: r.dice, sides: 20, mod, total, pass, crit: r.natural === 20, fumble: r.natural === 1, mode: r.mode, text: `${label}: ${dice}${sign(mod)} = ${total}`, outcome: pass == null ? null : pass ? 'SUCCESS' : 'FAIL' };
  },
  check(c, skill, opts) { return this.test(skill, c.skills?.[skill] ?? mod(c.abilities?.[SKILL_ABILITY[skill]]), opts); },
  save(c, ab, opts) { return this.test(`${ABILITIES.find((a) => a[0] === ab)?.[1] || ab} save`, this.saveBonus(c, ab), opts); },
  ability(c, ab, opts) { return this.test(`${ABILITIES.find((a) => a[0] === ab)?.[1] || ab} check`, mod(c.abilities?.[ab]), opts); },
  dcLadder: [['Very easy', 5], ['Easy', 10], ['Medium', 15], ['Hard', 20], ['Very hard', 25], ['Nearly impossible', 30]],

  initiative: (x) => d20().natural + (x.init || 0),

  // Encounter danger for the party (see src/rules/index.js). Returns null when there is no party.
  difficulty,
  normalizeCr,

  attack(attacker, target, { mode } = {}) {
    const r = d20(mode);
    const total = r.natural + attacker.atk;
    const crit = r.natural === 20;
    const hit = crit || (r.natural !== 1 && total >= target.ac);
    let text = `${attacker.name} attacks ${target.name}: d20(${r.natural})${sign(attacker.atk)} = ${total} vs AC ${target.ac}`;
    let damage = 0;
    if (hit) {
      const dmg = attacker.dmg;
      const dm = rollDice(crit ? [dmg[0] * 2, dmg[1], dmg[2]] : dmg);
      damage = dm.total;
      text += ` ${crit ? 'CRIT' : 'HIT'} for ${dm.total} (${dm.expr})`;
    } else text += ' MISS';
    return { natural: r.natural, hit, crit, damage, text };
  },
};
