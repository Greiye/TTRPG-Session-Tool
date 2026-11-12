// Daggerheart adapter (preview). Duality dice: 2d12 (Hope + Fear) + trait vs Difficulty.
// Matching dice = critical success. HP here is a simple pool; damage thresholds come later.
const { d, sign } = require('../dice');
const { int } = require('../util');

const TRAITS = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'];
const mk = (blurb, hp, evasion, atk, dmg, traits) => ({ blurb, hp, ac: evasion, atk, dmg, init: 0, skills: Object.fromEntries(TRAITS.map((t, i) => [t, traits[i]])) });
const CLASSES = {
  Guardian: mk('Shield wall · Evasion 9', 7, 9, 2, [1, 10, 3], [1, 2, -1, 0, 1, 0]),
  Warrior: mk('Weapon master · Evasion 11', 6, 11, 2, [1, 12, 3], [2, 1, 0, 1, -1, 0]),
  Rogue: mk('Shadows and blades · Evasion 12', 6, 12, 2, [1, 8, 2], [1, -1, 2, 0, 1, 0]),
  Ranger: mk('Hunter, companion · Evasion 12', 6, 12, 2, [1, 8, 3], [2, 0, 1, 1, -1, 0]),
  Wizard: mk('Scholar of magic · Evasion 11', 5, 11, 2, [1, 6, 3], [0, -1, 0, 1, 1, 2]),
  Bard: mk('Voice of the party · Evasion 10', 5, 10, 2, [1, 8, 2], [0, -1, 1, 0, 2, 1]),
};

module.exports = {
  id: 'daggerheart',
  name: 'Daggerheart (preview)',
  classes: CLASSES,
  skills: TRAITS,
  skillGroups: { exploration: ['Agility', 'Instinct', 'Knowledge', 'Finesse', 'Strength'], social: ['Presence', 'Instinct'] },
  defenseLabel: 'Evasion',
  dcLabel: 'Difficulty',

  newStats(cls) {
    const c = CLASSES[cls];
    return { hp: c.hp, maxHp: c.hp, ac: c.ac, atk: c.atk, dmg: [...c.dmg], init: 0, skills: { ...c.skills }, hope: 2, fear: 0 };
  },
  editStats(c, f) {
    if (f.ac !== undefined) c.ac = int(f.ac, 1, 30, c.ac);
    if (f.atk !== undefined) c.atk = int(f.atk, -5, 10, c.atk);
    if (f.skills) for (const k of TRAITS) if (f.skills[k] !== undefined) c.skills[k] = int(f.skills[k], -3, 6, c.skills[k] ?? 0);
  },
  bonus: (c, trait) => c.skills?.[trait] ?? 0,

  // Duality roll: `natural` reports the Hope die so nat-20 style hooks don't misfire.
  check(c, trait, { dc } = {}) {
    const hope = d(12); const fear = d(12);
    const mod = c.skills?.[trait] ?? 0;
    const total = hope + fear + mod;
    const crit = hope === fear;
    const pass = dc == null ? null : crit || total >= dc;
    const side = crit ? 'CRITICAL' : hope > fear ? 'with Hope' : 'with Fear';
    return { natural: hope, hope, fear, total, pass, crit, text: `${trait}: Hope ${hope} / Fear ${fear}${sign(mod)} = ${total} ${side}`, outcome: pass == null ? side : `${pass ? 'SUCCESS' : 'FAIL'} ${side}` };
  },
  initiative: () => 0, // Daggerheart has no initiative; order stays as listed (spotlight flow comes later).
  attack(attacker, target) {
    const r = this.check({ skills: { Attack: attacker.atk } }, 'Attack', { dc: target.ac });
    const dmg = attacker.dmg;
    let damage = 0;
    let text = `${attacker.name} attacks ${target.name}: ${r.text.replace('Attack: ', '')} vs ${target.ac}`;
    if (r.pass) {
      damage = Array.from({ length: dmg[0] * (r.crit ? 2 : 1) }, () => d(dmg[1])).reduce((a, b) => a + b, 0) + dmg[2];
      text += ` HIT for ${damage}`;
    } else text += ' MISS';
    return { natural: r.crit ? 20 : 0, hit: r.pass, crit: r.crit, damage, text };
  },
};
