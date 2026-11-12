// Rules-system registry. Game code never touches 5e math directly; it calls the active adapter.
//
// Adapter interface:
//   id, name                     identifiers
//   classes {Name: {blurb, ...}} starter classes for character creation
//   skills [string]              checkable skills/traits; skillGroups {exploration, social}
//   defenseLabel, dcLabel        UI words ("AC"/"DC" vs "Evasion"/"Difficulty")
//   newStats(cls)                stat fields for a fresh character
//   editStats(c, fields)         DM stat edits, validated per system
//   bonus(c, skill)              modifier shown on buttons
//   check(c, skill, {dc, mode})  -> {natural, total, pass, crit, text, outcome}
//   abilities, sheetDefaults(cls), editSheet(c, f), abilityMod, prof, saveBonus(c, ab), passive(c, skill)   character sheet (item 2)
//   initiative(x)                -> number
//   attack(attacker, target, {mode}) -> {natural, hit, crit, damage, text}
const systems = {
  dnd5e: require('./dnd5e'),
  daggerheart: require('./daggerheart'),
};
const DEFAULT = 'dnd5e';

const get = (id) => systems[id] || systems[DEFAULT];
const list = () => Object.values(systems).map(({ id, name }) => ({ id, name }));
// What clients need to render buttons and labels.
const describe = (id) => {
  const s = get(id);
  return { id: s.id, name: s.name, skills: s.skills, skillGroups: s.skillGroups, defenseLabel: s.defenseLabel, dcLabel: s.dcLabel,
    abilities: s.abilities, skillAbility: s.skillAbility, slotLevels: s.slotLevels, languages: s.languages,
    classes: Object.fromEntries(Object.entries(s.classes).map(([k, v]) => [k, v.blurb])) };
};

module.exports = { get, list, describe, DEFAULT };
