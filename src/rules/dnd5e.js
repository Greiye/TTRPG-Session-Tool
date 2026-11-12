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
