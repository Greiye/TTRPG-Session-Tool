// Quick-start campaign templates (item 23). Data only, so state.js can list them without a cycle.
const TEMPLATES = {
  dungeon: {
    name: 'Dungeon crawl',
    scene: { title: 'The Drowned Stair', text: 'Cold water runs down the steps of a crypt. Torches gutter in iron brackets, and somewhere below, something is knocking.', theme: 'cave', poi: ['Flooded landing', 'Iron door', 'Bone pile', 'Lever in the wall'], light: 'torchlight', effects: ['darkness'] },
    clocks: [{ name: 'The tide rises', segments: 6 }],
    notes: 'Mood: keep torches low. Each room, one hazard and one reward.',
  },
  heist: {
    name: 'Heist',
    scene: { title: 'The Guild Vault', text: 'A marble hall beneath the counting house. Guards change at the bell. The vault door is warded, and the clock on the wall is ticking.', theme: 'castle', poi: ['Guard rota', 'Ward on the vault', 'Service tunnel', 'Cook\'s back door'], light: 'night', effects: [] },
    clocks: [{ name: 'Guards change', segments: 4 }, { name: 'Alarm raised', segments: 6 }],
    notes: 'Mood: quick, tense. Use clocks for time pressure. Let the party plan before a roll.',
  },
  mystery: {
    name: 'Mystery',
    scene: { title: 'The Miller\'s Last Supper', text: 'Rain on the mill roof. The miller is dead at his own table. Four guests sit with their cups still full.', theme: 'tavern', poi: ['The cup', 'Miller\'s letter', 'Muddy boots', 'Locked ledger'], light: 'dusk', effects: ['rain'] },
    clocks: [{ name: 'The killer leaves town', segments: 4 }],
    notes: 'Mood: slow, careful. Put three clues behind different skills, and one behind a secret.',
  },
};

module.exports = { TEMPLATES };
