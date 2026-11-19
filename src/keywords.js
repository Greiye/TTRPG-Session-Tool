// Creature keyword bank (Mike, Nov 19: "a key word bank? example frog = water, pond, swamp, bog"). Each entry is
// a word (frog) with words it also answers to (toad, newt) and themed word lists: where it lives, how it looks and
// feels, how it sounds and smells, how it behaves, story hooks and name parts. The Creature Designer suggests the
// entries that match a design's name, race, tags and summary; the DM picks what to use (nothing is filled in on
// its own). Built-in entries ship here; the DM's own entries and edits live in data/keywords.json and win over a
// built-in with the same word. A removed built-in is kept as { hidden: true } so it stays gone. System-agnostic:
// flavour words only, no rules.
const { library } = require('./library');
const { str, slug } = require('./util');

const GROUPS = {
  habitat: { icon: '🌿', name: 'Habitat' },
  look: { icon: '👁', name: 'Look and feel' },
  sounds: { icon: '👂', name: 'Sounds and smells' },
  behaviour: { icon: '🐾', name: 'Behaviour' },
  hooks: { icon: '🪝', name: 'Story hooks' },
  names: { icon: '🏷', name: 'Name parts' },
};
const KEYS = Object.keys(GROUPS);
const MAX = { words: 30, also: 20, len: 60, entries: 500 };

// word: [also, habitat, look, sounds, behaviour, hooks, names] (comma lists, kept short to read here)
const B = {
  frog: ['toad, newt, salamander, amphibian', 'water, pond, swamp, bog, marsh, reeds, lily pads, riverbank', 'slimy, warty, bulging eyes, webbed feet, speckled green, glistening', 'croak, ribbit, plop, wet slap, stagnant water', 'leaps, ambushes from water, sticky tongue, sits still for hours, sings at night', 'a cursed prince, poison skin used by assassins, the bog chorus warns of rain', 'Croak, Bog, Mire, Lily, Puddle, Gloop'],
  snake: ['serpent, viper, adder, cobra, python, naga', 'jungle, desert, ruins, tall grass, tree branches, ancient temple', 'scaled, coiled, forked tongue, slit pupils, shed skin', 'hiss, rattle, dry rustle, musk', 'strikes fast, constricts, hypnotic stare, swallows prey whole, basks on warm stone', 'venom that is also a cure, a temple of the serpent god, a shed skin as big as a boat', 'Sss, Coil, Viper, Venna, Asp, Slither'],
  wolf: ['wolves, hound, dog, jackal, coyote, warg', 'forest, tundra, hills, snowy pine, moonlit clearing', 'grey fur, yellow eyes, bared fangs, lean, scarred muzzle', 'howl, growl, snarl, panting, wet fur', 'hunts in packs, circles prey, tests the weakest, loyal to the alpha', 'a pack that follows the party, a werewolf among the villagers, a lost pup', 'Fang, Ash, Grey, Moon, Howl, Lupa'],
  bear: ['bears, ursine, owlbear', 'mountain forest, cave, river with salmon, berry thicket', 'massive, shaggy, clawed, hump-backed, brown or white', 'roar, huff, grunt, rotten fish, musk', 'territorial, protects cubs, rears up, sleeps through winter, raids camps for food', 'a bear that guards a shrine, a druid in bear form, hibernation cave hides a treasure', 'Ursa, Bruin, Honey, Grizzle, Old Paw'],
  spider: ['spiders, arachnid, tarantula, widow', 'caves, dark forest, attic, ruins, webs between trees', 'eight eyes, hairy legs, glossy black, bloated abdomen', 'clicking, skittering, silence, dusty silk', 'spins webs, waits, wraps prey, drops from above, egg sacs', 'cocooned victims still alive, a spider queen who trades secrets, webs strung with old coins', 'Weaver, Silk, Arach, Widow, Lattice'],
  bat: ['bats, vampire bat', 'caves, belfries, ruins, night sky, dark forest', 'leathery wings, tiny fangs, upside down, glowing eyes', 'screech, flutter, guano stink, echoing chirps', 'swarms at dusk, hunts by sound, hangs in clusters, drinks blood', 'a vampire\'s messengers, a cave mapped by bat calls, guano worth its weight in gold', 'Flit, Dusk, Squeak, Nocturne, Vesper'],
  rat: ['rats, mouse, mice, vermin, rodent, ratfolk', 'sewers, cellars, granaries, docks, plague towns', 'mangy, pink tail, beady eyes, gnawed, filthy', 'squeak, scratching in walls, rot, droppings', 'swarms, gnaws through anything, steals food, carries disease', 'a rat king tangled by the tails, plague in the granary, a wererat thieves guild', 'Nibble, Whisker, Squeak, Scab, Gnaw'],
  crow: ['raven, rook, magpie, corvid, crows', 'battlefields, gallows, rooftops, bare trees, graveyards', 'black feathers, glossy, beady eyes, sharp beak', 'caw, croak, wingbeats, carrion smell', 'clever, collects shiny things, mimics voices, follows death, holds grudges', 'an omen of death, a witch\'s spy, a stolen ring in a nest', 'Corvus, Inky, Caw, Mourn, Hex, Quill'],
  owl: ['owls', 'old forest, barns, ruins, hollow trees', 'round face, huge eyes, silent feathers, ear tufts', 'hoot, silence, pellets of bone', 'hunts at night, turns its head, watches, swallows prey whole', 'a wise owl that knows a riddle, an owl familiar, an owlbear nest', 'Hoot, Athena, Hollow, Tawny, Sage'],
  cat: ['cats, lion, tiger, panther, leopard, lynx, feline', 'jungle, savannah, rooftops, temples, alleys', 'sleek, striped or spotted, slit eyes, soft paws, whiskers', 'purr, hiss, yowl, low growl', 'stalks, pounces, plays with prey, sleeps in sun, aloof', 'a temple cat sacred to a goddess, a tiger that once was a king, nine lives', 'Whisker, Shade, Tawn, Mau, Sable'],
  boar: ['pig, swine, hog, boars', 'oak forest, mud wallow, farmland, thickets', 'bristled, tusked, muddy, small mean eyes', 'snort, squeal, grunt, mud and dung', 'charges, roots for truffles, never retreats, feral', 'the great boar of the royal hunt, truffles under the cursed oak', 'Tusk, Bristle, Snout, Grunt, Hogga'],
  deer: ['stag, elk, moose, doe, hart, antelope', 'meadow, forest edge, misty glade', 'antlers, dappled coat, white tail, graceful', 'bellow, rustle, hoofbeats', 'skittish, flees, rutting fights, watches from the trees', 'a white stag that leads to fey lands, antlers crowned with flowers', 'Hart, Fawn, Antler, Glade, Rowan'],
  fish: ['fishes, carp, pike, salmon, merfolk', 'river, lake, sea, reef, underground pool', 'scales, fins, gills, glassy eyes, slick', 'splash, bubbles, fishy reek, brine', 'schools, swims upstream, hides in weeds, nibbles', 'a fish that grants wishes, a ring in a fish belly, a drowned village below the lake', 'Finn, Gill, Scale, Marlo, Brine'],
  shark: ['sharks', 'open sea, reef, shipwreck, deep water', 'grey, rows of teeth, dorsal fin, dead eyes', 'silence, churning water, blood in the water', 'circles, smells blood from afar, never stops moving', 'a shark god worshipped by pirates, a tooth in a sailor\'s leg', 'Fin, Jaw, Maw, Razor, Deep'],
  crab: ['crabs, lobster, crustacean, crayfish', 'beach, tidepool, mangrove, sea cave', 'armoured shell, pincers, eye stalks, barnacles', 'clacking, scuttling, salt, seaweed', 'walks sideways, snaps, hides in shells, molts', 'a crab with a hermit house made of a crown, giant shell used as a boat', 'Pinch, Clack, Shell, Barna, Krab'],
  octopus: ['squid, kraken, cephalopod, octopi', 'deep sea, reef, sunken ship, sea cave', 'tentacles, suckers, ink, shifting colours, beak', 'wet slap, silence, ink and brine', 'clever, camouflages, squeezes through cracks, grabs and drags', 'a kraken that sinks ships, ink used for spellbooks, an octopus that can open locks', 'Inka, Tenta, Krak, Ink, Murk'],
  eel: ['eels, lamprey', 'murky river, sea cave, sewer, swamp', 'long, slick, toothy, glowing or electric', 'crackle, splash, rot', 'hides in holes, shocks, latches on', 'an eel that powers a gnome device, an eel-filled moat', 'Zap, Slick, Murk, Anguil'],
  lizard: ['lizards, gecko, iguana, salamander, lizardfolk, kobold, chameleon', 'desert rocks, jungle, hot springs, ruins, warm stone', 'scaled, cold-blooded, frilled, changing colours', 'hiss, tongue flick, dust', 'basks in sun, drops its tail, climbs walls, slow in the cold', 'a lizard tribe with a dragon idol, a gecko that steals keys', 'Scale, Tail, Sunny, Skink, Ziz'],
  dragon: ['dragons, wyrm, wyvern, drake, dragonborn', 'mountain lair, volcano, ruined keep, deep cavern, high peaks', 'scaled, horned, vast wings, smouldering eyes, ancient', 'roar, rumble, sulphur, smoke, wingbeats like thunder', 'hoards treasure, proud, cunning, sleeps for centuries, speaks in riddles', 'a dragon egg, a hoard with a cursed coin, the town pays tribute', 'Ignis, Vyr, Thrax, Smolder, Kael, Aurum'],
  goblin: ['goblins, hobgoblin, gremlin, imp', 'caves, ruins, junkyards, forest camps, sewers', 'small, green or grey, pointy ears, sharp teeth, scavenged gear', 'cackling, squabbling, rusty clank, unwashed', 'steals, sets traps, swarms, flees when the boss falls, bargains', 'goblins that worship a stolen object, a goblin who wants to be a hero', 'Snik, Grub, Nackle, Zib, Grizzle, Mog'],
  orc: ['orcs, half-orc', 'warcamps, badlands, mountain holds, ruined forts', 'tusked, muscular, scarred, war paint, heavy furs', 'war drums, roar, smoke, blood and leather', 'proud, clan loyal, raids, honours strength, fierce in battle', 'a clan feud, an orc chief who wants peace, a stolen war banner', 'Grom, Urka, Throk, Mazga, Druk'],
  troll: ['trolls, ogre, giant, ettin', 'bridges, caves, mountain passes, swamps', 'huge, warty, mossy, long arms, rocky skin', 'thudding steps, grunt, rotten meat', 'regenerates, slow witted, demands toll, eats anything, turns to stone in sun', 'a toll bridge, a troll who wants a riddle, stone trolls frozen at dawn', 'Grumm, Boulder, Mossback, Thud, Olg'],
  elf: ['elves, eladrin, fey folk, half-elf', 'ancient forest, silver city, moonlit glade, high tower', 'tall, graceful, pointed ears, ageless, fine silk', 'song, soft speech, wind chimes, flowers', 'aloof, patient, long memory, keeps old grudges, loves art', 'an elf who remembers the last war, a forest that does not let outsiders leave', 'Ael, Lith, Sylv, Ithil, Ren, Thal'],
  dwarf: ['dwarves, dwarven, duergar', 'mountain halls, mines, forges, deep roads', 'stout, bearded, braided, stone-grey eyes, heavy armour', 'hammer on anvil, chanting, ale, coal smoke', 'stubborn, crafts, keeps grudges, loves gold, honours ancestors', 'a lost hold, a grudge-book with the party\'s name, a mine dug too deep', 'Thrain, Borin, Dagna, Brom, Hilda, Kragg'],
  skeleton: ['undead, zombie, ghoul, lich, mummy, skeletons, revenant, wight', 'crypt, graveyard, battlefield, tomb, barrow mound', 'bones, rotting flesh, empty eyes, grave dirt, rusty armour', 'rattling, moaning, grave dirt, decay', 'tireless, mindless or vengeful, rises at night, guards the dead', 'a necromancer\'s army, a ghost who needs burial, a lich\'s hidden heart', 'Bone, Grim, Rattle, Mort, Crypt'],
  ghost: ['spirit, spectre, wraith, phantom, banshee, poltergeist, haunt', 'haunted house, ruins, misty moor, shipwreck, battlefield', 'pale, translucent, flickering, cold mist, sad eyes', 'wailing, whispers, cold draft, faint perfume, silence', 'repeats its last moments, passes through walls, possesses, cannot leave', 'unfinished business, a murder only the ghost saw, a haunted heirloom', 'Wisp, Pale, Mourn, Echo, Lament'],
  demon: ['fiend, devil, imp, demons, infernal', 'hell, burning pits, cult shrines, ruined churches, summoning circles', 'horned, red or black skin, burning eyes, tail, wings', 'sulphur, crackling fire, laughter, screams', 'tempts, makes deals, lies, hungers for souls', 'a pact with a hidden clause, a demon bound in a sword, a cult opening a gate', 'Azzar, Mal, Baal, Vex, Morx, Zul'],
  fey: ['fairy, faerie, pixie, sprite, dryad, satyr, nymph, hag', 'enchanted wood, fairy ring, flower meadow, mushroom circle, the Feywild', 'tiny or tall, glittering wings, flower crowns, too beautiful, wrong', 'tinkling laughter, music, honey, blossom', 'tricks, bargains, keeps promises to the letter, steals children or names', 'a true name to win, a fairy bargain with a twist, time runs wrong in the fey wood', 'Bramble, Thistle, Puck, Willow, Nim'],
  ooze: ['slime, jelly, pudding, blob, cube, mold', 'dungeons, sewers, caves, damp ruins', 'translucent, gooey, acidic, quivering, things floating inside', 'bubbling, sizzling, squelch, acid tang', 'engulfs, dissolves, splits when hit, slides under doors', 'an ooze with a key floating inside, a slime that copies what it eats', 'Gloop, Blorb, Jelly, Ooz, Squish'],
  golem: ['construct, automaton, clockwork, robot, animated armour, golems', 'wizard tower, ancient ruins, forge, vault', 'stone, iron or clay, runes, glowing core, gears', 'grinding, ticking, hum, oil and dust', 'obeys orders, guards, never tires, does not think', 'a command word lost, a golem that wants freedom, a heart rune that can be stolen', 'Gear, Iron, Rune, Clank, Anvil'],
  tree: ['treant, plant, dryad, vine, shrub, plants, trees', 'old forest, overgrown ruins, sacred grove, swamp', 'bark skin, leaves, mossy, roots for feet, flowering', 'creaking, rustling, sap, wet earth, pollen', 'slow, patient, rooted, entangles, protects the forest', 'an awakened tree that saw the old kingdom, a cursed vine strangling a village', 'Oak, Bark, Moss, Elder, Root, Ash'],
  mushroom: ['fungus, fungi, myconid, spore, mold', 'caves, damp forest, rotting logs, underground', 'spongy, spotted cap, glowing, spore clouds', 'silence, damp earth, rot, puffs of spores', 'spreads, shares thoughts through spores, hallucinations, slow', 'a spore that makes people dream together, a fungus that eats the dead', 'Spore, Puff, Cap, Morel, Myco'],
  insect: ['bug, beetle, ant, wasp, bee, mantis, locust, centipede, scorpion, insects, hive', 'hive, nest, desert, jungle, underground tunnels', 'chitin, many legs, compound eyes, mandibles, stinger', 'buzzing, clicking, chittering, honey or rot', 'swarms, hive mind, obeys a queen, builds, stings', 'a hive queen who negotiates, a swarm that eats crops, honey that heals', 'Chit, Buzz, Mandi, Hive, Skitter'],
  bird: ['birds, eagle, hawk, falcon, vulture, griffon, harpy, roc', 'cliffs, mountains, sky, treetops, aeries', 'feathers, talons, hooked beak, keen eyes, wide wings', 'shriek, cry, wingbeats, wind', 'soars, dives, carries prey away, nests high', 'an egg worth a fortune, a griffon mount, a vulture circling means death nearby', 'Talon, Sky, Feather, Aerie, Kestra'],
  horse: ['horses, pony, steed, mare, unicorn, pegasus, centaur, mule', 'plains, stables, meadows, roads', 'mane, hooves, strong, sleek, braided', 'neigh, whinny, hoofbeats, hay', 'gallops, startles, carries riders, kicks', 'a horse that knows the way home, a stolen racehorse, a unicorn hunted for its horn', 'Storm, Dapple, Swift, Bay, Maple'],
  goat: ['goats, ram, sheep, satyr', 'mountain cliffs, highland pasture, farms', 'horned, shaggy, sideways pupils, beard', 'bleat, bells, rank smell', 'climbs anything, headbutts, eats anything, stubborn', 'a goat that eats a treasure map, a sacrificial goat that escapes', 'Billy, Horn, Bleat, Nanny, Craggy'],
  moth: ['moths, butterfly', 'night garden, lantern light, wardrobes, old houses', 'dusty wings, eye patterns, feathery antennae', 'soft flutter, dust', 'drawn to light, lays eggs in cloth, short lived', 'moths that eat a royal banner, a moth that carries dreams', 'Dust, Lumen, Flutter, Pale, Tinea'],
  worm: ['worms, purple worm, grub, maggot, leech, sandworm', 'underground, desert, mud, graves, rotting things', 'segmented, slimy, eyeless, ring of teeth', 'rumble underground, squelch, earth', 'burrows, swallows whole, senses tremors', 'a worm that ate a castle, leeches used by healers', 'Grub, Loam, Burrow, Wriggle, Maw'],
  fire: ['flame, ember, salamander, phoenix, fire elemental, lava, magma', 'volcano, forge, burning plains, desert', 'flickering, glowing, smoking, cracked lava skin', 'roar of flames, crackle, smoke, ash', 'spreads, consumes, rises from ashes, never rests', 'a fire that must never go out, a phoenix rebirth, a forest fire set on purpose', 'Ember, Cinder, Pyra, Ash, Blaze'],
  water: ['sea, ocean, river, wave, water elemental, tide, merrow', 'sea, lake, waterfall, flooded ruins', 'flowing, clear or murky, foam, drips', 'roar of waves, drip, rain, salt', 'flows around, drowns, calm then sudden, shapes stone over time', 'a flood that hides a ruin, a river spirit that wants an offering', 'Tide, Brook, Marina, Wave, Kelp'],
  ice: ['frost, snow, winter, yeti, cold, glacier, ice elemental', 'tundra, glacier, frozen lake, snowy peaks', 'white, crystalline, frosted fur, blue glow', 'cracking ice, howling wind, crunch of snow', 'freezes, slows, hibernates, endures', 'a frozen army in the glacier, an endless winter curse', 'Frost, Rime, Hail, Boreas, Snow'],
  storm: ['lightning, thunder, wind, air elemental, cloud', 'sky, mountain peaks, open plains, sea storms', 'crackling, swirling, grey clouds, glowing eyes', 'thunder, howling wind, ozone, rain', 'sudden, wild, unpredictable, strikes the tallest', 'a storm that follows the party, lightning in a bottle', 'Thunder, Gale, Volt, Zephyr, Squall'],
  stone: ['rock, earth, gargoyle, earth elemental, crystal, gem', 'mountains, caves, quarries, cathedrals', 'grey, cracked, mossy, heavy, glittering veins', 'grinding, rumble, dust', 'still for ages, sudden, slow and strong, guards', 'a statue that moves at night, a living crystal vein', 'Granite, Flint, Pebble, Quartz, Obsidian'],
};

function expand(word, a) {
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const [also, ...rest] = a;
  const e = { id: slug(word), word, also: list(also), builtin: true };
  KEYS.forEach((k, i) => { e[k] = list(rest[i] || ''); });
  return e;
}
const BUILTIN = Object.fromEntries(Object.entries(B).map(([w, a]) => [slug(w), expand(w, a)]));

const lib = library('keywords');

const words = (v, n = MAX.words) => [...new Set((Array.isArray(v) ? v : String(v || '').split(','))
  .map((x) => str(x, MAX.len).trim()).filter(Boolean).map((x) => x.replace(/\s+/g, ' ')))].slice(0, n);

// The bank as the DM sees it: built-ins (edited or not) and the DM's own words, hidden built-ins left out.
function list() {
  const out = [];
  for (const [id, b] of Object.entries(BUILTIN)) {
    const mine = lib.get(id);
    if (mine?.hidden) continue;
    out.push(mine ? { ...mine, builtin: true, edited: true } : b);
  }
  for (const e of lib.list()) if (!BUILTIN[e.id] && !e.hidden) out.push({ ...e, builtin: false });
  return out.sort((a, b) => a.word.localeCompare(b.word));
}
const get = (id) => list().find((e) => e.id === id);

function save(input = {}) {
  const word = str(input.word, 40).trim().toLowerCase();
  const id = slug(word);
  if (!id) return { error: 'Give the word a name.' };
  if (input.id && input.id !== id && !BUILTIN[input.id]) lib.remove(input.id); // renamed an own word
  else if (input.id && input.id !== id && BUILTIN[input.id]) lib.set({ id: input.id, word: BUILTIN[input.id].word, hidden: true });
  if (!BUILTIN[id] && !lib.get(id) && lib.list().length >= MAX.entries) return { error: 'The bank is full.' };
  const e = { id, word, also: words(input.also, MAX.also).map((x) => x.toLowerCase()), updatedAt: Date.now() };
  for (const k of KEYS) e[k] = words(input[k]);
  lib.set(e);
  return { ok: true, entry: get(id) };
}
// Own words are deleted; a built-in is hidden (Reset brings it back).
function remove(id) {
  if (BUILTIN[id]) { lib.set({ id, word: BUILTIN[id].word, hidden: true }); return { ok: true, hidden: true }; }
  return lib.remove(id) ? { ok: true } : { error: 'No such word.' };
}
function reset(id) {
  if (!BUILTIN[id]) return { error: 'Only built-in words can be reset.' };
  lib.remove(id);
  return { ok: true, entry: get(id) };
}

// Simple English forms, so "wolves", "frogs" and "ponies" still find wolf, frog and pony.
function forms(w) {
  const out = new Set([w]);
  if (w.length > 3) {
    if (w.endsWith('ies')) out.add(`${w.slice(0, -3)}y`);
    if (w.endsWith('ves')) { out.add(`${w.slice(0, -3)}f`); out.add(w.slice(0, -1)); }
    if (w.endsWith('es')) out.add(w.slice(0, -2));
    if (w.endsWith('s') && !w.endsWith('ss')) out.add(w.slice(0, -1));
  }
  return out;
}
const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim()} `;

// Entries that match a design: its name, epithet, race, tags, summary and detail values, in that order of
// weight (a word in the name counts more than one in the summary). Returns at most `limit` entries, best first.
function suggest(design = {}, { limit = 6 } = {}) {
  const fields = [
    [3, design.name], [2, design.race], [2, (Array.isArray(design.tags) ? design.tags : [design.tags]).join(' ').replace(/-/g, ' ')],
    [1, design.title], [1, design.summary], [1, (design.details || []).map((d) => d?.value).join(' ')], [1, design.text],
  ].map(([w, t]) => [w, norm(t)]);
  const toks = fields.map(([w, t]) => [w, new Set(t.trim().split(' ').filter(Boolean).flatMap((x) => [...forms(x)]))]);
  const scored = [];
  for (const e of list()) {
    let score = 0;
    let hit = '';
    for (const key of [e.word, ...(e.also || [])]) {
      const k = key.toLowerCase().trim();
      if (!k) continue;
      for (let i = 0; i < fields.length; i++) {
        const [w, text] = fields[i];
        const found = k.includes(' ') ? text.includes(` ${k} `) : toks[i][1].has(k);
        if (found && w > score) { score = w; hit = key; }
      }
    }
    if (score) scored.push({ ...e, matched: hit, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word)).slice(0, limit);
}

module.exports = { GROUPS, KEYS, BUILTIN, lib, list, get, save, remove, reset, suggest, forms };
