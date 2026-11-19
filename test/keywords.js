// Creature keyword bank (Nov 19): built-in words, matching a design (plurals, also-words, weights), the DM's own
// words and edits (saved, renamed, removed, reset), DM only, and never in what phones get.
const { harness } = require('./helpers');
const h = harness('keywords');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last && dm.last);
  const kw = require('../src/keywords'); // this process's own copy: for the pure matching checks only
  const bank = async () => (await fetch(`${h.URL}/api/keywords`)).json();
  const ask = async (design) => (await h.call(dm, 'dm:keywords:suggest', { design })).matches.map((x) => x.word);
  const word = async (id) => (await bank()).find((x) => x.id === id);

  // ----- built-ins and matching -----
  const frog = kw.list().find((e) => e.word === 'frog');
  ok(frog && frog.builtin && ['water', 'pond', 'swamp', 'bog'].every((w) => frog.habitat.includes(w)), 'frog = water, pond, swamp, bog (Mike\'s example)');
  ok(kw.list().length >= 40 && kw.list().every((e) => kw.KEYS.every((k) => Array.isArray(e[k]))), 'the bank ships with 40+ words, each with six groups');
  const s = (d) => kw.suggest(d).map((m) => m.word);
  ok(s({ name: 'Bog Frog' })[0] === 'frog', 'a frog design finds frog');
  ok(s({ name: 'Giant Toad' }).includes('frog') && kw.suggest({ name: 'Giant Toad' })[0].matched === 'toad', 'also-words match (toad finds frog)');
  ok(s({ name: 'Dire Wolves' }).includes('wolf') && s({ tags: ['ponies'] }).includes('horse') && s({ summary: 'a swarm of bats' }).includes('bat'), 'plurals match (wolves, ponies, bats)');
  ok(s({ name: 'Swamp Hag', summary: 'smells of fire' })[0] === 'fey', 'a word in the name ranks above one in the summary');
  ok(s({ summary: 'lives in the purple worm tunnels' }).includes('worm'), 'multi-word also-words match');
  ok(s({ name: 'Bob' }).length === 0 && s({}).length === 0, 'nothing matches nothing');
  ok(s({ name: 'frog wolf bear spider bat rat crow owl' }).length === 6, 'at most six matches');

  // ----- sockets: DM only -----
  ok((await h.call(a, 'dm:keywords:suggest', { design: { name: 'frog' } })).error, 'a phone cannot ask for ideas');
  ok((await h.call(a, 'dm:keywords:save', { word: 'mimic' })).error, 'a phone cannot change the bank');
  const sug = await h.call(dm, 'dm:keywords:suggest', { design: { name: 'Marsh Frog', tags: ['beast'] } });
  ok(sug.ok && sug.matches[0].word === 'frog' && sug.groups.habitat.name === 'Habitat', 'the DM gets ideas for a design');

  // ----- the DM's own words -----
  ok((await h.call(dm, 'dm:keywords:save', { word: '  ' })).error, 'a word needs a name');
  const m = await h.call(dm, 'dm:keywords:save', { word: 'Mimic', also: 'chest, Treasure Chest', habitat: 'dungeon, treasure room, ', look: ['wooden', 'iron bands', 'wooden'], hooks: 'a chest that wants to be opened' });
  ok(m.ok && m.entry.id === 'mimic' && m.entry.word === 'mimic' && !m.entry.builtin, 'the DM adds a word');
  ok(m.entry.habitat.join() === 'dungeon,treasure room' && m.entry.look.join() === 'wooden,iron bands' && m.entry.also.includes('treasure chest'), 'lists are tidied (blanks and repeats dropped)');
  ok((await ask({ summary: 'a treasure chest with teeth' }))[0] === 'mimic', 'the new word is suggested at once');
  const list = await bank();
  ok(list.some((e) => e.id === 'mimic') && list.some((e) => e.id === 'frog'), 'the laptop lists built-in and own words over HTTP');
  ok(await until(() => dm.last.lib?.keywords > 1), 'the bank version moves so the DM page refetches');
  ok(!JSON.stringify(a.last).includes('a chest that wants'), 'phones never see the bank');

  // Edit a built-in, then reset it.
  const e = await h.call(dm, 'dm:keywords:save', { id: 'frog', word: 'frog', also: 'toad', habitat: 'Mirewood' });
  ok(e.ok && e.entry.builtin && e.entry.edited && e.entry.habitat.join() === 'Mirewood', 'the DM changes a built-in word');
  ok((await word('frog')).habitat.join() === 'Mirewood' && !(await ask({ name: 'newt' })).includes('frog'), 'the change is what gets suggested');
  const r = await h.call(dm, 'dm:keywords:reset', { id: 'frog' });
  ok(r.ok && !r.entry.edited && r.entry.habitat.includes('pond'), 'Reset brings the built-in words back');
  ok((await h.call(dm, 'dm:keywords:reset', { id: 'mimic' })).error, 'own words have nothing to reset to');

  // Remove a built-in and delete an own word.
  ok((await h.call(dm, 'dm:keywords:delete', { id: 'rat' })).hidden && !(await word('rat')) && !(await ask({ name: 'rat' })).includes('rat'), 'removing a built-in hides it');
  ok((await h.call(dm, 'dm:keywords:save', { word: 'rat', habitat: 'sewer' })).entry.edited, 'adding it again brings it back as an edit');
  ok((await h.call(dm, 'dm:keywords:save', { id: 'mimic', word: 'Mimic Chest', habitat: 'dungeon' })).entry.id === 'mimic-chest' && !(await word('mimic')), 'renaming an own word moves it');
  ok((await h.call(dm, 'dm:keywords:delete', { id: 'mimic-chest' })).ok && !(await word('mimic-chest')), 'the DM deletes an own word');
  ok((await h.call(dm, 'dm:keywords:delete', { id: 'nope' })).error, 'deleting an unknown word says so');

  // Saved to data/keywords.json (the temp DATA_DIR), with only the DM's own words and edits.
  const file = require('path').join(h.TMP, 'data', 'keywords.json');
  const disk = () => { try { return JSON.parse(require('fs').readFileSync(file, 'utf8')); } catch { return {}; } };
  ok(await until(() => disk().rat && !disk()['mimic-chest']) && !disk().frog && !disk().wolf, 'only the DM\'s own words and edits are saved');
  await h.done(srv);
})();
