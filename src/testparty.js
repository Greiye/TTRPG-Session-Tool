// Placeholder party for testing (Phase A). Five characters that exercise the sheets: a druid (wild
// shape), a paladin (smite and aura), a warlock (pact magic), a wizard and a cleric. The DM seeds them
// with the "Add test party" button; they are named "[Test] ..." so they are easy to spot and delete.
// Seeding is idempotent: a test character that already exists is updated, not duplicated.
const { roster, newCharacter, saveRoster } = require('./roster');
const { ensureSheet } = require('./sheet');
const { state, log, sys } = require('./state');

const PARTY = [
  { name: '[Test] Fenwick', cls: 'Druid', race: 'Wood Elf', level: 2, slots: { 1: 3 }, spells: ['srd_healing-word', 'srd_thunderwave'],
    notes: 'Wild Shape: 2 uses per short rest. Beast forms up to CR 1/4, no flying or swimming yet.' },
  { name: '[Test] Sera', cls: 'Paladin', race: 'Human', level: 2, slots: { 1: 2 }, spells: ['srd_bless', 'srd_cure-wounds'],
    notes: 'Divine Smite: spend a slot on a hit for extra radiant damage. Lay on Hands pool: 10. Aura of Protection: +CHA to saves for allies within 10 ft.' },
  { name: '[Test] Vesper', cls: 'Warlock', race: 'Tiefling', level: 2, slots: { 1: 2 }, spells: ['srd_fire-bolt', 'srd_hunters-mark'],
    notes: 'Pact Magic: slots refill on a short rest. Eldritch Blast cantrip.' },
  { name: '[Test] Quill', cls: 'Wizard', race: 'Gnome', level: 2, slots: { 1: 3 }, spells: ['srd_magic-missile', 'srd_shield', 'srd_mage-hand'],
    notes: 'Arcane Recovery: recover slots on a short rest.' },
  { name: '[Test] Brother Oak', cls: 'Cleric', race: 'Dwarf', level: 2, slots: { 1: 3 }, spells: ['srd_cure-wounds', 'srd_bless', 'srd_sacred-flame'],
    notes: 'Channel Divinity: Turn Undead, once per short rest.' },
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
    for (const [lvl, max] of Object.entries(def.slots)) c.slots[lvl] = { max, used: 0 };
    if (!c.inventory.some((i) => /sword|staff|mace|dagger|bow|axe/i.test(i.name))) {
      c.inventory.push({ id: `test-${def.cls.toLowerCase()}`, name: def.cls === 'Wizard' || def.cls === 'Druid' ? 'Quarterstaff' : 'Mace', qty: 1, note: 'test kit' });
    }
    if (!state.players[c.id]) { state.players[c.id] = c; log('system', `${c.name} joins the party (test).`); }
    out.push(c.id);
  }
  saveRoster();
  return out;
}

module.exports = { PARTY, seedTestParty };
