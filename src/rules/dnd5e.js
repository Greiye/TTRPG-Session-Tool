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
};
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

  // Ability/skill check. dc optional. mode: 'adv' | 'dis' | undefined.
  check(c, skill, { dc, mode } = {}) {
    const r = d20(mode);
    const mod = c.skills?.[skill] ?? 0;
    const total = r.natural + mod;
    const pass = dc == null ? null : total >= dc;
    const dice = r.mode ? `d20${r.mode === 'adv' ? '↑' : '↓'}(${r.dice.join(',')})` : `d20(${r.natural})`;
    return { natural: r.natural, total, pass, crit: r.natural === 20, text: `${skill}: ${dice}${sign(mod)} = ${total}`, outcome: pass == null ? null : pass ? 'SUCCESS' : 'FAIL' };
  },

  initiative: (x) => d20().natural + (x.init || 0),

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
