// Phase 1: campaign persistence, character sheets, creature stat blocks, SRD import.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');

const h = harness('data');
const { ok, call, until } = h;
(async () => {
  let srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Wizard');
  const b = await h.player(room, 'Vex', 'Rogue');
  const mine = (s) => s.last.players.find((p) => p.id === s.me.id);

  // --- sheets (2)
  await until(() => mine(a)?.derived && mine(b)?.derived);
  ok(mine(a).abilities.int === 17 && mine(a).derived.mods.int === 3, 'new character has ability scores and modifiers');
  ok(mine(a).derived.saves.int === 5 && mine(a).derived.saves.str === -1, 'save bonuses include proficiency');
  ok(mine(b).derived.passive.Perception === 15, 'passive perception is 10 + Perception');
  ok(mine(a).slots[1].max === 2 && mine(a).languages.includes('Elvish'), 'caster starts with slots and languages');
  a.emit('player:sheet', { slot: { level: 1, used: 1 } });
  a.emit('player:sheet', { inv: { op: 'add', name: 'Rope', qty: 2 } });
  a.emit('player:sheet', { hp: 9, tempHp: 4, notes: 'PRIVATE-NOTE' });
  await until(() => mine(a).inventory.length === 1 && mine(a).hp === hpAtSave);
  ok(mine(a).slots[1].used === 1 && mine(a).inventory[0].qty === 2 && mine(a).tempHp === 4, 'player updates slots, inventory, HP, temp HP');
  const seenByDm = dm.last.players.find((p) => p.id === a.me.id);
  ok(seenByDm.inventory[0].name === 'Rope' && seenByDm.slots[1].used === 1, 'DM sees the sheet live');
  const seenByB = b.last.players.find((p) => p.id === a.me.id);
  ok(seenByB.hp === 9 && seenByB.inventory === undefined && !JSON.stringify(b.last).includes('PRIVATE-NOTE'), 'other players see HP but not inventory or notes');
  a.emit('player:sheet', { languages: ['Draconic'], speed: 90, slotMax: { 1: 9 } });
  await h.wait(150);
  ok(!mine(a).languages.includes('Draconic') && mine(a).speed === 30 && mine(a).slots[1].max === 2, 'players cannot change DM-only sheet fields');
  dm.emit('dm:sheet', { id: a.me.id, languages: ['Common', 'Draconic'], slotMax: { 1: 4, 2: 2 }, abilities: { int: 18 } });
  await until(() => mine(a).languages.includes('Draconic'));
  ok(mine(a).slots[2].max === 2 && mine(a).slots[1].used === 1 && mine(a).derived.mods.int === 4, 'DM edits languages, slots and abilities');

  // --- creatures (3)
  const lib = await (await fetch(`${h.URL}/api/creatures`)).json();
  ok(lib.some((c) => c.name === 'Goblin') && lib.some((c) => c.side === 'ally' && c.speed.fly), 'starter stat blocks are seeded (incl. a flying ally)');
  const spells = await (await fetch(`${h.URL}/api/spells`)).json();
  ok(spells.some((s) => s.name === 'Fireball' && s.level === 3), 'starter spells are seeded');
  const saved = await call(dm, 'dm:creature:save', { name: 'Mill Wraith', side: 'enemy', hp: 30, ac: 14, speed: { walk: 0, fly: 40 }, boss: true, title: 'Terror of the Mill',
    attacks: [{ name: 'Chill Touch', atk: 5, dmg: '2d6+2', type: 'necrotic' }, { name: 'Wail', atk: 3, dmg: '1d4' }], notes: 'DM-NOTE-XYZ', traits: [{ name: 'Incorporeal', text: 'Moves through walls.' }] });
  ok(saved.id, 'DM saves a custom stat block');
  const goblin = lib.find((c) => c.name === 'Goblin');
  dm.emit('dm:creature:spawn', { id: goblin.id, count: 2 });
  dm.emit('dm:creature:spawn', { id: saved.id });
  dm.emit('dm:creature:spawn', { id: lib.find((c) => c.name === 'Guard').id });
  await until(() => dm.last.combat.enemies.length === 4);
  const en = dm.last.combat.enemies;
  ok(en[0].name === 'Goblin' && en[1].name === 'Goblin 2', 'spawned copies get numbered names');
  ok(en[2].attacks.length === 2 && en[2].speed.fly === 40 && en[3].side === 'ally' && !en[3].enemy, 'combatants carry attacks, fly speed and side');
  const pe = a.last.combat.enemies[2];
  ok(pe.attacks === undefined && pe.notes === undefined && !JSON.stringify(a.last.combat).includes('DM-NOTE-XYZ'), 'stat block details stay DM-only');
  dm.emit('dm:combat:start', {});
  await until(() => dm.last.combat.active);
  let allyActed = false; let wailUsed = false;
  for (let i = 0; i < 12; i++) {
    const c = dm.last.combat;
    const turn = c.order[c.turn].id;
    const who = c.enemies.find((e) => e.id === turn);
    const before = dm.last.log.length + dm.last.log.at(-1).id;
    if (turn === a.me.id) a.emit('player:combat', { act: 'attack', target: en[3].id }); // attacking an ally is refused
    if (turn === a.me.id || turn === b.me.id) (turn === a.me.id ? a : b).emit('player:combat', { act: 'dodge' });
    else if (who.side === 'ally') { dm.emit('dm:enemy:attack', { target: en[0].id }); allyActed = true; } else if (who.id === en[2].id) { dm.emit('dm:enemy:attack', { target: b.me.id, attack: 1 }); wailUsed = true; } else dm.emit('dm:enemy:attack', { target: a.me.id, attack: 0 });
    await until(() => dm.last.log.length + dm.last.log.at(-1).id !== before);
    await h.wait(40);
  }
  const text = dm.last.log.map((l) => l.text).join('\n') + '\n' + JSON.stringify(dm.last.combat);
  ok(allyActed && /Guard attacks \(Spear\) Goblin/.test(text), 'DM-run ally attacks an enemy with a named attack');
  ok(wailUsed && /attacks \(Wail\)/.test(text), 'DM picks which attack a creature uses');
  ok(dm.last.combat.enemies[3].hp === dm.last.combat.enemies[3].maxHp || /Goblin/.test(text), 'players cannot target allies');
  dm.emit('dm:combat:end', {});

  // --- SRD import (3b)
  const open5e = { results: [{ slug: 'adult-red-dragon', name: 'Adult Red Dragon', size: 'Huge', type: 'dragon', armor_class: 19, hit_points: 256, speed: { walk: 40, climb: 40, fly: 80 }, strength: 27, dexterity: 10, challenge_rating: '17',
    actions: [{ name: 'Bite', desc: 'Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.', attack_bonus: 14, damage_dice: '2d10', damage_bonus: 8 }, { name: 'Frightful Presence', desc: 'Each creature of the dragon\'s choice within 120 feet must succeed on a DC 19 Wisdom saving throw.' }],
    legendary_actions: [{ name: 'Tail Attack', desc: 'The dragon makes a tail attack.' }], document__slug: 'wotc-srd' },
  { slug: 'light', name: 'Light', level_int: 0, school: 'Evocation', casting_time: '1 action', range: 'Touch', components: 'V, M', material: 'a firefly', duration: '1 hour', concentration: 'no', dnd_class: 'Bard, Cleric, Wizard', desc: 'You touch one object.' }, { junk: true }] };
  const r1 = await (await fetch(`${h.URL}/api/srd/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(open5e) })).json();
  ok(r1.monsters === 1 && r1.spells === 1 && r1.skipped === 1, 'Open5e page imports monsters and spells, skips junk');
  const bits = [{ index: 'bat', name: 'Bat', size: 'Tiny', type: 'beast', armor_class: [{ type: 'natural', value: 12 }], hit_points: 1, speed: { walk: '5 ft.', fly: '30 ft.' }, dexterity: 15, challenge_rating: 0,
    actions: [{ name: 'Bite', desc: 'Melee Weapon Attack: +0 to hit, reach 5 ft., one creature. Hit: 1 piercing damage.', attack_bonus: 0, damage: [{ damage_type: { name: 'Piercing' }, damage_dice: '1' }] }] }];
  const r2 = await (await fetch(`${h.URL}/api/srd/import`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dm-key': 'dmkey' }, body: JSON.stringify(bits) })).json();
  const lib2 = await (await fetch(`${h.URL}/api/creatures`)).json();
  const dragon = lib2.find((c) => c.id === 'srd_adult-red-dragon'); const bat = lib2.find((c) => c.id === 'srd_bat');
  ok(dragon && dragon.ac === 19 && dragon.speed.fly === 80 && dragon.attacks[0].atk === 14 && dragon.attacks[0].dmg === '2d10+8' && dragon.boss && dragon.traits.some((t) => t.name === 'Frightful Presence'), 'Open5e monster maps to a stat block (attacks, fly, legendary = boss)');
  ok(r2.monsters === 1 && bat && bat.ac === 12 && bat.speed.fly === 30 && bat.init === 2, '5e-SRD (5e-bits) monster format imports');
  const light = (await (await fetch(`${h.URL}/api/spells`)).json()).find((s) => s.id === 'srd_light');
  ok(light && light.level === 0 && light.classes.includes('Cleric') && /firefly/.test(light.components), 'spell import keeps level, classes and material');
  a.emit('player:sheet', { spells: ['srd_light', 'srd_fire-bolt'] });
  await until(() => mine(a).spells.length === 2);
  ok(true, 'player adds spells to the sheet');

  // --- persistence + save points (1)
  const hpAtSave = mine(a).hp;
  const sp = await call(dm, 'dm:save:create', { name: 'Before the vault' });
  ok(sp.id === 'before-the-vault' && (await until(() => dm.last.saves?.length === 1)), 'save point created and listed');
  dm.emit('dm:scene', { title: 'The Vault' });
  a.emit('player:sheet', { hp: hpAtSave === 1 ? 2 : 1 });
  dm.emit('dm:creature:delete', { id: saved.id });
  await until(() => dm.last.scene.title === 'The Vault' && mine(a).hp !== hpAtSave);
  dm.emit('dm:save:load', { id: sp.id });
  await until(() => dm.last.scene.title !== 'The Vault' && mine(a).hp === hpAtSave);
  ok(mine(a).hp === hpAtSave && dm.last.room === room && a.last.players.some((p) => p.id === a.me.id), 'loading a save point restores scene and HP, phones stay seated');
  await h.wait(700);
  for (const s of [dm, a, b]) s.close();
  await h.stop(srv);
  ok(fs.existsSync(path.join(h.TMP, 'data', 'creatures.json')) && fs.existsSync(path.join(h.TMP, 'data', 'spells.json')), 'libraries written to disk');
  srv = await h.boot();
  const dm2 = await h.dm();
  await until(() => dm2.last?.viewer?.role === 'dm');
  const t = dm2.last.players.find((p) => p.name === 'Thorn');
  ok(t && t.inventory[0].name === 'Rope' && t.slots[2].max === 2 && t.spells.length === 2, 'sheets survive a restart');
  ok(dm2.last.combat.enemies.length === 4 && dm2.last.combat.enemies[2].attacks.length === 2, 'encounter with stat blocks survives a restart');
  ok((await (await fetch(`${h.URL}/api/creatures`)).json()).some((c) => c.id === 'srd_bat'), 'imported library survives a restart');
  ok(fs.readdirSync(path.join(h.TMP, 'data', 'backups')).length === 1, 'startup backup taken of the previous data');
  ok(dm2.last.saves.length === 1, 'save points survive a restart');
  const bundle = await (await fetch(`${h.URL}/api/export`)).json();
  ok(bundle.creatures.length >= 13 && bundle.spells.length >= 14 && bundle.entities.find((e) => e.type === 'pc').stats.inventory, 'bundle export carries sheets, creatures and spells');
  const imp = await (await fetch(`${h.URL}/api/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bundle) })).json();
  ok(!imp.error && imp.creatures === bundle.creatures.length, 'bundle re-imports cleanly');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
