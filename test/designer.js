// Creature Designer and lore wiki (PR W): designs round-trip to Markdown, go to combat and the Lore tab,
// and push to / pull from a wiki folder (a local clone) and a GitHub repo (a stand-in contents API here).
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const h = harness('designer');
const { ok, until } = h;

const { fakeGitHub } = require('./fake-github');

(async () => {
  const gh = await fakeGitHub();
  const srv = await h.boot({ LORE_GITHUB_API: gh.url });
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last && dm.last);

  // ----- designs -----
  const goblin = {
    kind: 'people', name: 'Grey Goblin', title: 'Soldier strain of the Biomancer', summary: 'Three-foot pests that steal and breed.',
    tags: 'goblin, Red Book', details: [{ name: 'Lifespan', value: 'About 25 years' }, { name: 'Size', value: 'Small' }],
    stats: [{ name: 'Agility', value: '+2' }, { name: 'Strength', value: '-1' }],
    vitals: [{ name: 'HP', value: '7' }, { name: 'Evasion', value: '13' }, { name: 'Speed', value: '30' }],
    skills: [{ name: 'Stealth', value: '+4' }],
    abilities: [{ name: 'Scrap Blade', roll: '1d6+2', text: '+4 to hit, a rusty knife.' }, { name: 'Nimble', cost: '1 Stress', text: 'Slip away when an ally is near.' }],
    inventory: [{ name: 'Rusty knife', qty: 2, note: 'Pitted' }, { name: 'Stolen spoon' }],
    lore: 'They multiply quickly.\n\n**Sources disagree.** Quimzy says they are cast-out orcs.',
    dm: 'They are dying out in eight generations.',
  };
  ok((await h.call(a, 'dm:design:save', goblin)).error, 'a phone cannot save a design');
  ok((await h.call(dm, 'dm:design:save', { ...goblin, name: ' ' })).error, 'a design needs a name');
  const s = await h.call(dm, 'dm:design:save', goblin);
  ok(s.ok && s.design.id && s.design.tags.join() === 'goblin,red-book', 'the DM saves a design (tags tidied)');
  const id = s.design.id;
  const list = await (await fetch(`${h.URL}/api/designs`)).json();
  ok(list.some((d) => d.id === id && d.dm.startsWith('They are')), 'the laptop lists designs over HTTP');
  ok(!JSON.stringify(a.last).includes('dying out'), 'phones never see a design');

  // ----- Markdown -----
  const md = await h.call(dm, 'dm:design:markdown', { id });
  ok(md.name === 'grey-goblin' && /^---\ntitle: "Grey Goblin"\n/.test(md.text) && md.text.includes('type: creature') && md.text.includes('kind: people'), 'the page has the lore repo front block');
  ok(md.text.includes('## Stats\n- **Agility:** +2') && md.text.includes('- **Scrap Blade** `1d6+2`: +4 to hit') && md.text.includes('- 2 × Rusty knife: Pitted'), 'stats, abilities and inventory are readable lists');
  ok(!md.text.includes('dying out'), 'DM notes are left out unless asked for');
  ok((await h.call(dm, 'dm:design:markdown', { id, dm: true })).text.includes('## DM notes\n<!-- private -->'), 'DM notes can be included, marked private');
  const designer = require('../src/designer');
  const back = designer.fromMarkdown((await h.call(dm, 'dm:design:markdown', { id, dm: true })).text);
  ok(back.name === 'Grey Goblin' && back.title === goblin.title && back.summary === goblin.summary, 'a page reads back: name, epithet, summary');
  ok(JSON.stringify(back.stats) === JSON.stringify(goblin.stats) && back.vitals.length === 3 && back.skills[0].value === '+4', 'a page reads back: stats, vitals, skills');
  ok(back.abilities[0].roll === '1d6+2' && back.abilities[1].cost === '1 Stress' && back.inventory[0].qty === 2 && back.inventory[1].name === 'Stolen spoon', 'a page reads back: abilities and inventory');
  ok(back.lore === goblin.lore && back.dm === goblin.dm && back.id === id, 'a page reads back: lore, DM notes and the design id');
  const hand = designer.fromMarkdown('---\ntitle: Wolf\nkind: beast\n---\nA grey wolf.\n\n## Stats\n- Bite: 2\n\n## Habits\nHunts at dusk.');
  ok(hand.kind === 'beast' && hand.stats[0].name === 'Bite' && hand.lore.includes('A grey wolf.') && hand.lore.includes('## Habits'), 'a hand-written page keeps unknown sections in the lore');

  // ----- into the rest of the tool -----
  const c = await h.call(dm, 'dm:design:combat', { id });
  ok(c.ok && !c.updated, 'the design becomes a combat stat block');
  const block = (await (await fetch(`${h.URL}/api/creatures`)).json()).find((x) => x.id === c.id);
  ok(block && block.hp === 7 && block.ac === 13 && block.attacks[0].dmg === '1d6+2' && block.attacks[0].atk === 4 && block.traits.some((t) => t.name.startsWith('Nimble')), 'HP, Evasion, rolled abilities and traits carry over');
  ok((await h.call(dm, 'dm:design:combat', { id })).updated, 'sending it again updates the same stat block');
  const l = await h.call(dm, 'dm:design:lore', { id });
  ok(l.ok && await until(() => dm.last.lore.some((e) => e.cat === 'creature' && e.name === 'Grey Goblin' && e.dm.startsWith('They are'))), 'the design becomes a Lore entry under Creatures');
  ok((await h.call(dm, 'dm:design:lore', { id })).updated, 'sending it again updates that entry');

  // ----- wiki: GitHub -----
  ok((await h.call(dm, 'dm:wiki:get')).wiki.ready === false, 'the wiki is not connected at first');
  ok((await h.call(dm, 'dm:wiki:push', { id })).error, 'pushing without a connection is refused');
  let w = (await h.call(dm, 'dm:wiki:config', { mode: 'github', repo: 'https://github.com/Greiye/Artheria.ES.3D.Lore.Game.git', branch: 'main', token: 'bad-token' })).wiki;
  ok(w.repo === 'Greiye/Artheria.ES.3D.Lore.Game' && w.hasToken && w.token === undefined, 'the repo link is tidied and the token never comes back');
  ok(!fs.readdirSync(path.join(h.TMP, 'data')).includes('wiki.json') && fs.existsSync(path.join(h.TMP, 'data', 'wiki.config')), 'settings sit in wiki.config, outside the save points');
  ok(/refused/.test((await h.call(dm, 'dm:wiki:push', { id })).error), 'a bad token is reported in plain words');
  await h.call(dm, 'dm:wiki:config', { token: 'good-token' });
  let p = await h.call(dm, 'dm:wiki:push', { id });
  ok(p.ok && p.created && p.path === 'content/creatures/grey-goblin.md', 'push creates content/creatures/grey-goblin.md');
  const f = gh.files.get('content/creatures/grey-goblin.md');
  ok(f && f.branch === 'main' && /Add grey-goblin/.test(f.message) && !f.text.includes('dying out'), 'one commit on main, without DM notes');
  ok(gh.seen.every((x) => x.repo === 'Greiye/Artheria.ES.3D.Lore.Game'), 'every call goes to the lore repo');

  await h.call(dm, 'dm:design:save', { ...s.design, summary: 'Short-lived pests.' });
  p = await h.call(dm, 'dm:wiki:push', { id });
  ok(p.ok && !p.created && gh.files.get(p.path).text.includes('Short-lived pests.'), 'a second push updates the page');

  // Someone edits the page on GitHub.
  const edited = gh.files.get(p.path).text.replace('## Lore', '## Skills\n- Climb: +3\n\n## Lore');
  gh.files.set(p.path, { text: edited, sha: 'sha-web' });
  await h.call(dm, 'dm:design:save', { id, name: 'Grey Goblin', summary: 'Changed on the laptop.' });
  const clash = await h.call(dm, 'dm:wiki:push', { id });
  ok(clash.conflict && clash.error, 'a page changed in the wiki is not overwritten silently');
  const pages = (await h.call(dm, 'dm:wiki:list')).pages;
  ok(pages.length === 1 && pages[0].design === id && pages[0].behind, 'the page list links the page to the design and shows it is behind');
  const pulled = await h.call(dm, 'dm:wiki:pull', { name: 'grey-goblin' });
  ok(pulled.ok && pulled.updated && pulled.design.id === id && pulled.design.skills.some((x) => x.name === 'Climb'), 'pull brings the wiki edit into the same design');
  ok(pulled.design.dm === goblin.dm, 'pulling keeps the DM notes that never left the laptop');
  ok((await h.call(dm, 'dm:wiki:push', { id })).ok, 'after a pull, push works again');
  gh.files.set('content/creatures/sea-serpent.md', { text: '---\ntitle: "The Sea Serpent"\nkind: monster\n---\n# The Sea Serpent\n> Terrorised halfling coasts.\n', sha: 'sha-s' });
  gh.files.set('content/creatures/README.md', { text: '# readme', sha: 'sha-r' });
  const two = (await h.call(dm, 'dm:wiki:list')).pages;
  ok(two.length === 2 && two.some((x) => x.name === 'sea-serpent' && !x.design), 'pages made elsewhere are listed (README left out)');
  const sea = await h.call(dm, 'dm:wiki:pull', { name: 'sea-serpent' });
  ok(sea.ok && !sea.updated && sea.design.kind === 'monster' && sea.design.summary === 'Terrorised halfling coasts.', 'pulling a new page makes a new design');
  ok((await h.call(dm, 'dm:wiki:pull', { name: '../../package' })).error, 'page names cannot leave the folder');

  // ----- wiki: local folder -----
  const clone = path.join(h.TMP, 'lore-clone');
  w = (await h.call(dm, 'dm:wiki:config', { mode: 'folder', dir: clone, folder: '../content/creatures' })).wiki;
  ok(w.folder === 'content/creatures' && w.ready, 'folder mode is ready with a path (".." is dropped)');
  p = await h.call(dm, 'dm:wiki:push', { id });
  ok(p.ok && fs.readFileSync(path.join(clone, 'content/creatures/grey-goblin.md'), 'utf8').includes('# Grey Goblin'), 'folder mode writes the page into the local clone');
  ok((await h.call(dm, 'dm:wiki:list')).pages.length === 1, 'folder mode lists the clone');

  ok((await h.call(dm, 'dm:design:delete', { id })).ok, 'the DM deletes a design');
  gh.srv.close();
  await h.done(srv);
})();
