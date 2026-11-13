// Placeholder party for testing. One character per D&D 5e class, so every sheet, rest rule and
// class feature has someone to try it on. The DM seeds them with the "Add test party" button; they
// are named "[Test] ..." so they are easy to spot and delete. Seeding is idempotent: a test
// character that already exists is updated, not duplicated.
const { roster, newCharacter, saveRoster } = require('./roster');
const { ensureSheet } = require('./sheet');
const { state, log, sys } = require('./state');

// weapon: the item put in the inventory (rest rules check for one). Monks fight unarmed.
const PARTY = [
  { name: '[Test] Brann', cls: 'Fighter', race: 'Dwarf', level: 2, weapon: 'Longsword', slots: {}, spells: [],
    notes: 'Second Wind: heal 1d10+2 once per short rest. Action Surge: one extra action per short rest.' },
  { name: '[Test] Mira', cls: 'Rogue', race: 'Halfling', level: 2, weapon: 'Dagger', slots: {}, spells: [],
    notes: 'Sneak Attack: +1d6 once per turn with advantage or an ally nearby. Cunning Action: dash, disengage or hide as a bonus.' },
  { name: '[Test] Quill', cls: 'Wizard', race: 'Gnome', level: 2, weapon: 'Quarterstaff', slots: { 1: 3 }, spells: ['srd_magic-missile', 'srd_shield', 'srd_mage-hand'],
    notes: 'Arcane Recovery: recover slots on a short rest.' },
  { name: '[Test] Brother Oak', cls: 'Cleric', race: 'Dwarf', level: 2, weapon: 'Mace', slots: { 1: 3 }, spells: ['srd_cure-wounds', 'srd_bless', 'srd_sacred-flame'],
    notes: 'Channel Divinity: Turn Undead, once per short rest.' },
  { name: '[Test] Thistle', cls: 'Ranger', race: 'Wood Elf', level: 2, weapon: 'Longbow', slots: {}, spells: [],
    notes: 'Favored Enemy: advantage tracking one kind of creature. Fighting Style: Archery.' },
  { name: '[Test] Lark', cls: 'Bard', race: 'Human', level: 2, weapon: 'Rapier', slots: { 1: 3 }, spells: ['srd_vicious-mockery', 'srd_healing-word'],
    notes: 'Bardic Inspiration: d6, uses equal to CHA modifier, refresh on a long rest.' },
  { name: '[Test] Fenwick', cls: 'Druid', race: 'Wood Elf', level: 2, weapon: 'Quarterstaff', slots: { 1: 3 }, spells: ['srd_healing-word', 'srd_thunderwave'],
    notes: 'Wild Shape: 2 uses per short rest. Beast forms up to CR 1/4, no flying or swimming yet.' },
  { name: '[Test] Sera', cls: 'Paladin', race: 'Human', level: 2, weapon: 'Mace', slots: { 1: 2 }, spells: ['srd_bless', 'srd_cure-wounds'],
    notes: 'Divine Smite: spend a slot on a hit for extra radiant damage. Lay on Hands pool: 10. Aura of Protection: +CHA to saves for allies within 10 ft.' },
  { name: '[Test] Vesper', cls: 'Warlock', race: 'Tiefling', level: 2, weapon: 'Dagger', slots: { 1: 2 }, spells: ['srd_fire-bolt', 'srd_hunters-mark'],
    notes: 'Pact Magic: slots refill on a short rest. Eldritch Blast cantrip.' },
  { name: '[Test] Hulda', cls: 'Barbarian', race: 'Half-Orc', level: 2, weapon: 'Greataxe', slots: {}, spells: [],
    notes: 'Rage: 2 uses per long rest, resistance to physical damage while raging. Reckless Attack.' },
  { name: '[Test] Kaito', cls: 'Monk', race: 'Human', level: 2, weapon: null, slots: {}, spells: [],
    notes: 'Martial Arts: unarmed strike as a bonus action after an attack. Ki: 2 points per short rest (Flurry of Blows, Patient Defense).' },
  { name: '[Test] Ember', cls: 'Sorcerer', race: 'Dragonborn', level: 2, weapon: 'Dagger', slots: { 1: 2 }, spells: ['srd_fire-bolt', 'srd_shield'],
    notes: 'Font of Magic: 2 sorcery points per long rest. Draconic Resilience: +1 HP per level.' },
];

// The DM's tool: create or refresh the test characters and seat them in the party.
function seedTestParty() {
  const out = [];
  for (const def of PARTY) {
    let c = Object.values(roster).find((x) => x.name === def.name);
    if (!c) c = newCharacter({ name: def.name, cls: def.cls, race: def.race, player: 'Test' }, sys().id);
    c.cls = def.cls;
    c.race = def.race;
    c.level = def.level;
    c.player = 'Test';
    ensureSheet(c);
    c.hp = c.maxHp; // full health, as a fresh party
    c.spells = [...def.spells];
    c.notes = def.notes;
    c.slots = Object.fromEntries(Object.entries(def.slots).map(([lvl, max]) => [lvl, { max, used: 0 }]));
    c.inventory = def.weapon ? [{ id: `test-${def.cls.toLowerCase()}`, name: def.weapon, qty: 1, note: 'test kit' }] : [];
    if (!state.players[c.id]) { state.players[c.id] = c; log('system', `${c.name} joins the party (test).`); }
    out.push(c.id);
  }
  saveRoster();
  return out;
}

module.exports = { PARTY, seedTestParty };
