// Lore sync (Nov 19): the Lore tab pulls the lore repo's library books, characters and table pages, and pushes
// entries made at the table to content/table/ without DM notes. Local clone mode and a stand-in GitHub API.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const { fakeGitHub } = require('./fake-github');
const h = harness('lore-sync');
const { ok, until } = h;

const BOOK = `---
title: "Straphan Forest"
contributor: "mike"
credit_as: "Mike"
created: 2026-10-21
tags: [place, start-area, gods]
type: lore
---
# Straphan Forest

These woods belong to the **Fauna God**.
`;
const NATALIE = `---
title: "Natalie Bourbon"
contributor: "mike"
credit_as: "Mike"
created: 2026-10-21
tags: [natalie, character]
type: character
---
# Natalie Bourbon

*Explorer, Cartographer and Historian Extraordinaire.*
`;
const CHURCH = `---
title: "The Church of the First"
contributor: "mike"
credit_as: "Mike"
created: 2026-10-21
tags: [religion, ein, history]
type: lore
---
# The Church of the First

${'Ein lit the signal fires. '.repeat(120)}
`;

(async () => {
  const gh = await fakeGitHub();
  const srv = await h.boot({ LORE_GITHUB_API: gh.url });
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last && dm.last);

  // Unit: categories and the page format.
  const lb = require('../src/lorebook');
  ok(lb.catOf('content/lore', { tags: ['place'] }) === 'location' && lb.catOf('content/lore', { tags: ['lorebook'] }) === 'book', 'library books go to Locations by the place tag, else Books');
  ok(lb.catOf('content/artifacts', { type: 'character' }) === 'npc' && lb.catOf('content/artifacts', { type: 'song' }) === 'note', 'characters become NPCs, songs notes');
  ok(lb.catOf('content/table', { cat: 'item', tags: ['place'] }) === 'item', 'a table page keeps its own category');
  const page = lb.toPage({ id: 'lore1', cat: 'npc', name: 'Old "Tom"', text: 'A ferryman.', dm: 'Secretly a dragon.', at: Date.UTC(2026, 10, 19) });
  ok(/^---\ntitle: "Old \\"Tom\\""\ncontributor: "mike"\ncredit_as: "Mike"\ncreated: 2026-11-19\ntype: table\ncat: npc\n/.test(page) && page.includes('# Old "Tom"\n\nA ferryman.'), 'a table page uses the lore repo front block');
  ok(!page.includes('dragon'), 'a table page never holds the DM note');
  ok(lb.fromPage('content/table', page).name === 'Old "Tom"' && lb.fromPage('content/table', page).text === 'A ferryman.', 'a table page reads back');

  // Not connected.
  ok(/Connect the lore repo/.test((await h.call(dm, 'dm:lore:repo:pull')).error), 'pull asks for the connection first');
  ok((await h.call(a, 'dm:lore:repo:push')).error, 'a phone cannot push lore');

  // ----- local clone -----
  const clone = path.join(h.TMP, 'lore-clone');
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(clone, rel)), { recursive: true }); fs.writeFileSync(path.join(clone, rel), text); };
  put('content/lore/straphan-forest.md', BOOK);
  put('content/lore/the-church-of-the-first.md', CHURCH);
  put('content/lore/_draft.md', BOOK.replace('Straphan Forest', 'Draft'));
  put('content/artifacts/natalie-bourbon.md', NATALIE);
  await h.call(dm, 'dm:wiki:config', { mode: 'folder', dir: clone });
  await h.call(dm, 'dm:lore:add', { cat: 'npc', name: 'natalie bourbon', text: '', dm: 'Knows where the Archer is.' });
  const ferry = await h.call(dm, 'dm:lore:add', { cat: 'npc', name: 'Old Tom', text: 'A ferryman on the Lyal.', dm: 'Secretly a dragon.' });

  let r = await h.call(dm, 'dm:lore:repo:pull');
  ok(r.ok && r.added === 2 && r.updated === 1, `pull adds two pages and fills the matching NPC (${JSON.stringify(r)})`);
  ok(await until(() => dm.last.lore.length === 4), 'the Lore tab has the pulled entries');
  const by = (n) => dm.last.lore.find((e) => e.name === n);
  ok(by('Straphan Forest')?.cat === 'location' && by('Straphan Forest').text.startsWith('These woods') && by('Straphan Forest').src.path === 'content/lore/straphan-forest.md', 'a place book lands in Locations, without its heading');
  ok(by('Natalie Bourbon')?.dm === 'Knows where the Archer is.' && by('Natalie Bourbon').text.startsWith('*Explorer'), 'pull fills an existing NPC and keeps its DM note');
  ok(by('The Church of the First').text.length <= 2000 && by('The Church of the First').text.endsWith('…'), 'a long book is cut to the Lore tab limit');
  ok(!dm.last.lore.some((e) => e.name === 'Draft'), 'files starting with "_" are skipped');
  ok((await h.call(dm, 'dm:lore:repo:pull')).added === 0, 'a second pull adds nothing');

  // A shared entry reaches the phone without the DM note or the repo link.
  await h.call(dm, 'dm:lore:edit', { id: by('Natalie Bourbon').id, shared: true });
  ok(await until(() => a.last.lore.length === 1), 'the shared entry reaches the phone');
  ok(a.last.lore[0].dm === undefined && a.last.lore[0].src === undefined, 'the phone gets neither the DM note nor the repo link');

  // Push: only entries made here, to content/table/, without DM notes; library books are never written.
  r = await h.call(dm, 'dm:lore:repo:push');
  ok(r.ok && r.pushed === 1, `push writes the one table entry (${JSON.stringify(r)})`);
  const tom = fs.readFileSync(path.join(clone, 'content/table/old-tom.md'), 'utf8');
  ok(tom.includes('cat: npc') && tom.includes('A ferryman on the Lyal.') && !tom.includes('dragon'), 'the page has the entry and not the DM note');
  ok(fs.readFileSync(path.join(clone, 'content/lore/straphan-forest.md'), 'utf8') === BOOK, 'library books are left alone');
  ok(!fs.existsSync(path.join(clone, 'content/table/natalie-bourbon.md')), 'pulled characters are not copied into content/table');
  ok((await h.call(dm, 'dm:lore:repo:push')).pushed === 0, 'nothing to push twice');

  // Edits flow both ways.
  await h.call(dm, 'dm:lore:edit', { id: ferry.id, text: 'A ferryman on the Lyal. Charges a song.' });
  ok((await h.call(dm, 'dm:lore:repo:push')).pushed === 1 && fs.readFileSync(path.join(clone, 'content/table/old-tom.md'), 'utf8').includes('Charges a song.'), 'an edit at the table is pushed to its page');
  put('content/table/old-tom.md', fs.readFileSync(path.join(clone, 'content/table/old-tom.md'), 'utf8').replace('Charges a song.', 'Charges a secret.'));
  put('content/table/greer.md', lb.toPage({ id: 'x', cat: 'npc', name: 'Greer', text: 'Runs the shop.', at: Date.now() }));
  r = await h.call(dm, 'dm:lore:repo:pull');
  ok(r.updated === 1 && r.added === 1, `pull brings repo edits and new table pages (${JSON.stringify(r)})`);
  ok(await until(() => by('Old Tom')?.text.endsWith('Charges a secret.') && by('Greer')), 'the entries show the repo words');
  ok(by('Old Tom').dm === 'Secretly a dragon.', 'a pull never touches the DM note');
  // Changed in both places: the table's words are kept, and push will not overwrite silently.
  await h.call(dm, 'dm:lore:edit', { id: ferry.id, text: 'Table words.' });
  put('content/table/old-tom.md', lb.toPage({ id: ferry.id, cat: 'npc', name: 'Old Tom', text: 'Repo words.', at: Date.now() }));
  r = await h.call(dm, 'dm:lore:repo:pull');
  ok(r.kept.includes('Old Tom') && (await until(() => by('Old Tom').text === 'Table words.')), 'an entry changed in both places keeps the table words on pull');

  // Item cards made at the table join the Lore tab through "From the table".
  await h.call(dm, 'dm:item:save', { name: 'Moonlit Lantern', kind: 'gear', note: 'Shows invisible ink.' });
  await h.call(dm, 'dm:lore:pull');
  ok(await until(() => by('Moonlit Lantern')?.cat === 'item'), 'item cards become Item entries');

  // ----- GitHub -----
  await h.call(dm, 'dm:wiki:config', { mode: 'github', repo: 'Greiye/Artheria.ES.3D.Lore.Game', token: 'good-token' });
  gh.files.set('content/lore/straphan-forest.md', { text: BOOK, sha: 'b1' });
  r = await h.call(dm, 'dm:lore:repo:push');
  ok(r.ok && r.pushed >= 2 && gh.files.has('content/table/old-tom.md') && gh.files.has('content/table/moonlit-lantern.md'), `GitHub push writes table pages (${JSON.stringify(r)})`);
  ok(/Tavern Screen lore/.test(gh.files.get('content/table/old-tom.md').message) && gh.files.get('content/lore/straphan-forest.md').sha === 'b1', 'each page is a commit; the library book is untouched');
  ok(![...gh.files.values()].some((f) => /dragon|Archer is/.test(f.text)), 'no DM note reaches GitHub');
  const sameBefore = gh.seen.length;
  r = await h.call(dm, 'dm:lore:repo:pull');
  ok(r.ok && gh.seen.length - sameBefore < 8, 'a GitHub pull skips pages whose sha has not moved');
  // A page changed on GitHub after the last sync is not overwritten unless asked.
  const greer = by('Greer');
  const gp = 'content/table/greer.md';
  await h.call(dm, 'dm:lore:edit', { id: greer.id, text: 'Runs the shop.' + ' Owes the guild.' });
  ok((await h.call(dm, 'dm:lore:repo:push')).pushed === 1 && gh.files.has(gp), 'a table page pulled from the clone goes to GitHub once edited');
  await h.call(dm, 'dm:lore:edit', { id: greer.id, text: 'Runs the shop. Owes the guild. Hates rain.' });
  gh.files.set(gp, { ...gh.files.get(gp), text: gh.files.get(gp).text + '\nNew line.', sha: 'moved' });
  r = await h.call(dm, 'dm:lore:repo:push');
  ok(r.conflicts.includes('Greer'), 'a page moved on GitHub is reported, not overwritten');
  r = await h.call(dm, 'dm:lore:repo:push', { force: true, ids: [greer.id] });
  ok(r.pushed === 1 && gh.files.get(gp).text.includes('Hates rain'), 'overwrite on request');
  await h.call(dm, 'dm:wiki:config', { token: 'bad', clearToken: true });

  gh.srv.close();
  await h.done(srv);
})();
