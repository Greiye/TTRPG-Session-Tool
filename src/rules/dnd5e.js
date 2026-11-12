// D&D 5e starter data.
const CLASSES = {
  Fighter: { hp: 28, ac: 17, atk: 5, dmg: [1, 10, 3], init: 1, skills: { Athletics: 5, Perception: 3, Intimidation: 2, Insight: 1, Persuasion: 0, Deception: 0, Stealth: 1, Investigation: 0, Survival: 3, Arcana: 0 } },
  Rogue: { hp: 22, ac: 15, atk: 6, dmg: [1, 6, 4], init: 4, skills: { Athletics: 0, Perception: 5, Intimidation: 0, Insight: 3, Persuasion: 2, Deception: 6, Stealth: 7, Investigation: 5, Survival: 1, Arcana: 1 } },
  Wizard: { hp: 16, ac: 12, atk: 6, dmg: [2, 6, 0], init: 2, skills: { Athletics: -1, Perception: 1, Intimidation: 0, Insight: 3, Persuasion: 0, Deception: 0, Stealth: 2, Investigation: 6, Survival: 1, Arcana: 7 } },
  Cleric: { hp: 24, ac: 18, atk: 5, dmg: [1, 8, 3], init: 0, skills: { Athletics: 2, Perception: 4, Intimidation: 0, Insight: 6, Persuasion: 3, Deception: -1, Stealth: -1, Investigation: 0, Survival: 2, Arcana: 1 } },
  Ranger: { hp: 24, ac: 15, atk: 7, dmg: [1, 8, 4], init: 3, skills: { Athletics: 2, Perception: 6, Intimidation: 0, Insight: 2, Persuasion: 0, Deception: 0, Stealth: 6, Investigation: 2, Survival: 6, Arcana: 0 } },
  Bard: { hp: 20, ac: 14, atk: 5, dmg: [1, 8, 3], init: 2, skills: { Athletics: 0, Perception: 2, Intimidation: 3, Insight: 3, Persuasion: 7, Deception: 6, Stealth: 2, Investigation: 1, Survival: 0, Arcana: 2 } },
};
const SKILL_NAMES = Object.keys(CLASSES.Fighter.skills);
module.exports = { CLASSES, SKILL_NAMES };
