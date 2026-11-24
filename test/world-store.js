// World store (Nov 23): the Lore tab and the Arthuria world library are one store. Saved data from before the
// merge (data/entities.json plus the Lore tab list in campaign.json and in save points) moves in without loss.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const h = harness('world-store');
const { ok, until } = h;

const DATA = path.join(h.TMP, 'data');
const T0 = Date.UTC(2026, 10, 20, 12);
const write = (rel, data) => { fs.mkdirSync(path.dirname(path.join(DATA, rel)), { recursive: true }); fs.writeFileSync(path.join(DATA, rel), JSON.stringify(data, null, 2)); };

// The library as a bundle import left it.
const LIBRARY = {
  npc_mirela01: { id: 'npc_mirela01', type: 'npc', name: 'Mirela', race: 'Human', role: 'Innkeeper', body: 'Runs the Lantern Inn.', source: 'arthuria', updatedAt: '2026-11-18T10:00:00.000Z' },
  location_oldmill: { id: 'location_oldmill', type: 'location', name: 'Old Mill', poi: ['Waterwheel'], body: 'Burned ten years ago.', source: 'arthuria', updatedAt: '2026-11-18T10:00:00.000Z' },
  faction_ashguild: { id: 'faction_ashguild', type: 'faction', name: 'The Ash Guild', goals: 'Buy the mill.', dmNotes: 'Mirela pays them.', source: 'tavern-screen', updatedAt: '2026-11-18T10:00:00.000Z' },
  npc_broken: { id: 'npc_broken', type: 'npc', name: 'Broken', mood: 'furious' },
};
// The Lore tab as it was saved.
const LORE = [
  { id: 'lore1a', cat: 'npc', name: 'mirela', text: '', dm: 'Smuggles salt.', shared: true, at: T0, created: T0 },
  { id: 'lore2b', cat: 'location', name: 'Old Mill', text: 'Rebuilt by the guild.', dm: '', shared: false, at: T0 + 1 },
  { id: 'lore3c', cat: 'dungeon', name: 'The Sunken Crypt', text: 'Wet stairs.', dm: 'A lich below.', shared: false, at: T0 + 2, created: T0 - 5000,
    src: { folder: 'content/table', path: 'content/table/the-sunken-crypt.md', sha: 's1', hash: 'h1', at: T0 + 2 } },
  { id: 'lore4d', cat: 'book', name: 'The Ashen Codex', text: 'Bound in grey hide.', dm: 'Curse: 1 HP a page.', shared: true, at: T0 + 3 },
  { id: 'lore5e', cat: 'creature', name: 'Salt Wight', text: 'Leaves white footprints.', dm: '', shared: false, at: T0 + 4 },
];

(async () => {
  write('entities.json', LIBRARY);
  write('campaign.json', { version: 1, seq: 10, lore: LORE });
  // A save point from before the merge, with a shorter Lore tab.
  write('saves/before-merge.json', { name: 'Before merge', savedAt: '2026-11-20T12:00:00.000Z', campaign: { version: 1, seq: 5, lore: LORE.slice(3, 4) }, characters: {} });

  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client();
  tv.emit('screen:hello');
  await until(() => dm.last?.lore && a.last && tv.last);

  // ----- migration -----
  const lore = () => dm.last.lore;
  const by = (cat, name) => lore().find((e) => e.cat === cat && e.name.toLowerCase() === name.toLowerCase());
  const ents = () => dm.last.entities;
  ok(lore().length === 7, `the Lore tab holds the 5 old entries and 3 library records, one joined (${lore().length})`);
  ok(ents().length === 7 && !ents().some((e) => e.id === 'npc_broken'), 'the DM library is the same store, without the record that never passed the schema');
  const mirela = ents().find((e) => e.id === 'npc_mirela01');
  ok(mirela && mirela.body === 'Runs the Lantern Inn.' && mirela.dmNotes === 'Smuggles salt.' && mirela.shared === true && mirela.race === 'Human', 'a Lore tab NPC joins its library twin: the library words, the DM note and the Share tick all kept');
  ok(lore().filter((e) => e.cat === 'location' && e.name === 'Old Mill').length === 2, 'a twin whose words disagree is kept as two entries, so neither text is lost');
  ok(ents().find((e) => e.id === 'location_lore2b')?.body === 'Rebuilt by the guild.', 'an old entry keeps its old ID inside the new one');
  const crypt = by('dungeon', 'The Sunken Crypt');
  ok(crypt && crypt.dm === 'A lich below.' && crypt.src?.path === 'content/table/the-sunken-crypt.md' && crypt.at === T0 + 2 && crypt.created === T0 - 5000, 'a dungeon keeps its DM note, its lore repo link and both dates');
  ok(ents().find((e) => e.id === crypt.id)?.dungeon === true && ents().find((e) => e.id === crypt.id)?.type === 'location', 'a dungeon is a location record with the dungeon flag');
  ok(by('book', 'The Ashen Codex')?.shared && ents().find((e) => e.name === 'Salt Wight')?.category === 'creature', 'books and creatures are lore records by category');
  ok(by('faction', 'The Ash Guild')?.dm === 'Mirela pays them.', 'library factions show in the Lore tab');
  const before = JSON.parse(fs.readFileSync(path.join(DATA, 'lore-before-merge.json'), 'utf8'));
  ok(JSON.stringify(before) === JSON.stringify(LORE), 'the old Lore tab is copied to data/lore-before-merge.json');
  ok(JSON.parse(fs.readFileSync(path.join(DATA, 'entities.json'), 'utf8')).npc_broken, 'data/entities.json is left on disk as it was');
  const backups = fs.readdirSync(path.join(DATA, 'backups'));
  ok(backups.length === 1 && fs.existsSync(path.join(DATA, 'backups', backups[0], 'campaign.json')), 'the startup backup holds the files from before the merge');

  // ----- visibility -----
  ok(a.last.lore.length === 2 && a.last.lore.every((e) => e.dm === undefined && e.src === undefined && e.source === undefined), 'phones get the two shared entries without DM notes, repo links or sources');
  ok(a.last.world === undefined && tv.last.world === undefined && dm.last.world === undefined, 'the raw world store is sent to no one');
  ok(a.last.entities === undefined && tv.last.entities === undefined && tv.last.lore.length === 0, 'the TV and phones never get the library');

  // ----- one store -----
  const saved = await h.call(dm, 'dm:entity:save', { type: 'event', name: 'The Mill Fire', when: 'Ten winters ago', where: 'location_oldmill' });
  ok(saved.id && (await until(() => by('event', 'The Mill Fire'))), 'a record saved in the library shows in the Lore tab');
  ok((await h.call(dm, 'dm:lore:edit', { id: saved.id, text: 'Nobody saw who lit it.' })).ok && (await until(() => ents().find((e) => e.id === saved.id)?.body === 'Nobody saw who lit it.')), 'a Lore tab edit is the library record');
  ok(ents().find((e) => e.id === saved.id).when === 'Ten winters ago', 'a Lore tab edit keeps the fields the tab does not show');
  ok(/details from Arthuria/.test((await h.call(dm, 'dm:lore:edit', { id: 'npc_mirela01', cat: 'item' })).error || ''), 'a record with NPC details cannot become an item from the Lore tab');
  const salt = by('creature', 'Salt Wight');
  const moved = await h.call(dm, 'dm:lore:edit', { id: salt.id, cat: 'npc' });
  ok(moved.ok && moved.id === 'npc_lore5e' && (await until(() => by('npc', 'Salt Wight')?.id === 'npc_lore5e' && !ents().some((e) => e.id === salt.id))), 'a new category moves the entry to the matching type and ID');
  await h.call(dm, 'dm:entity:save', { type: 'event', name: 'The Wight Walks', who: ['npc_lore5e'] });
  await h.call(dm, 'dm:lore:edit', { id: 'npc_lore5e', cat: 'creature' });
  ok(await until(() => ents().find((e) => e.name === 'The Wight Walks')?.who[0] === 'lore_lore5e'), 'links to a moved entry follow it');

  // ----- export (lore in the bundle) -----
  const bundle = await (await fetch(`${h.URL}/api/export`)).json();
  const out = bundle.entities.filter((e) => e.type !== 'pc');
  ok(out.length === ents().length && out.some((e) => e.name === 'The Ashen Codex' && e.category === 'book'), 'the export carries every Lore tab entry');
  ok(!out.some((e) => 'sync' in e || 'shared' in e || 'createdAt' in e), 'the export leaves the table-only fields at home');

  // ----- undo -----
  await h.wait(900);
  await h.call(dm, 'dm:lore:add', { cat: 'note', name: 'Undo me' });
  ok(await until(() => by('note', 'Undo me')), 'a new note');
  await h.wait(900);
  await h.call(dm, 'dm:undo');
  ok(await until(() => !by('note', 'Undo me')), 'undo takes the Lore tab back');
  await h.call(dm, 'dm:redo');
  ok(await until(() => by('note', 'Undo me')), 'redo brings it back');

  // ----- old save point -----
  dm.emit('dm:save:load', { id: 'before-merge' }); // no answer: the state shows it
  ok(await until(() => lore().length === 4 && by('book', 'The Ashen Codex') && !by('note', 'Undo me')), `a save point from before the merge loads the Lore tab as it was, with that day's library (${lore().length})`);
  ok(!by('event', 'The Mill Fire') && ents().some((e) => e.id === 'npc_mirela01' && !e.dmNotes), 'the library is the one from before the merge, too');

  // ----- restart: nothing moves twice -----
  await h.call(dm, 'dm:lore:add', { cat: 'note', name: 'After restart' });
  await h.wait(900);
  await h.stop(srv);
  const srv2 = await h.boot();
  const dm2 = await h.dm();
  await until(() => dm2.last?.lore?.length);
  ok(dm2.last.lore.length === 5 && dm2.last.lore.some((e) => e.name === 'After restart'), `a restart keeps the world and imports nothing twice (${dm2.last.lore.length})`);
  const camp = JSON.parse(fs.readFileSync(path.join(DATA, 'campaign.json'), 'utf8'));
  ok(camp.world && camp.lore === undefined && camp.worldMerged === 1, 'campaign.json now holds the world and no Lore tab list');

  await h.done(srv2);
})();
