// Session plans: Markdown parsing, DM-only import, one-click launch, and privacy from phones and the TV.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const { parsePlan } = require('../src/plan');
const h = harness('plans');
const { ok, until } = h;

// Parser (pure): the sample file and the edge cases of the convention.
const sample = fs.readFileSync(path.join(__dirname, '..', 'docs', 'sample-session.md'), 'utf8');
const p = parsePlan(sample);
ok(p.scenes.length === 1 && p.scenes[0].poi.length === 3, 'sample: one scene with three points of interest');
ok(p.scenes[0].text.startsWith('Rain hammers'), 'sample: scene paragraphs become read-aloud text');
ok(p.npcs[0].emotion === 'suspicious' && p.npcs[0].hue === 28 && p.npcs[0].choices.length === 3, 'sample: NPC emotion, hue and choices');
ok(p.npcs[0].notes.length === 1 && !p.npcs[0].choices.includes('Owes the Thieves\' Guild three gold. Knows the miller\'s son is missing.'), 'sample: other text is DM notes, not choices');
ok(p.encounters[0].foes[0].count === 3 && p.encounters[0].foes[1].dmg === '1d8+3', 'sample: foe counts and damage');
const edge = parsePlan('## scene Quiet\nhi\n## Scenes overview\nx\n## NPC: Bob\n- emotion: grumpy\n- hue: 400\n## Encounter: E\n- ???\n- Rat (hp 3, side nonsense)\n');
ok(edge.scenes[0].title === 'Quiet', 'heading words are case-insensitive and the colon is optional');
ok(edge.warnings.some((w) => /Scenes overview/.test(w)) === true, '"Scenes overview" is not a scene heading');
ok(edge.npcs[0].emotion === null && edge.npcs[0].hue === 40 && edge.warnings.some((w) => /grumpy/.test(w)), 'bad emotion is warned; hue wraps');
ok(edge.encounters[0].foes.length === 1 && edge.encounters[0].foes[0].side === 'enemy', 'nameless foe line is skipped; bad side falls back to enemy');
ok(parsePlan('').scenes.length === 0 && parsePlan(null).npcs.length === 0, 'empty and missing input give an empty plan');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last?.players?.length === 1);

  // Import (DM only)
  const guest = await h.call(a, 'dm:plan:import', { md: sample });
  ok(guest.error, 'a phone cannot import a plan');
  const imp = await h.call(dm, 'dm:plan:import', { md: sample, title: 'Night one' });
  ok(imp.id && imp.scenes === 1 && imp.npcs === 1 && imp.encounters === 1, 'DM imports the sample and gets counts back');
  ok(await until(() => dm.last.plans?.[0]?.title === 'Night one'), 'imported plan appears on the DM page');
  ok(!('plans' in a.last) && !('plans' in tv.last), 'plans (with DM notes) are never sent to phones or the TV');
  const empty = await h.call(dm, 'dm:plan:import', { md: '# Just a title\nno sections' });
  ok(empty.error, 'a file with no recognised sections is refused');

  // Launch: scene
  const before = dm.last.scene.title;
  const beforeEnemies = dm.last.combat.enemies.length;
  dm.emit('dm:reveal', { all: true });
  await h.call(dm, 'dm:plan:scene', { plan: imp.id, index: 0 });
  ok(await until(() => dm.last.scene.title === 'The Sunken Crossroads' && dm.last.scene.poi.length === 3), 'scene launch sets title and points of interest');
  ok(dm.last.scene.revealed.length === 0 && before !== undefined, 'scene launch resets fog of war');
  ok(await until(() => a.last.scene?.title === 'The Sunken Crossroads'), 'the new scene reaches the phones');

  // Launch: NPC
  await h.call(dm, 'dm:plan:npc', { plan: imp.id, index: 0 });
  ok(await until(() => dm.last.social.npc.name === 'Mirela the Innkeeper' && dm.last.social.npc.emotion === 'suspicious'), 'NPC launch sets speaker and emotion');
  ok(await until(() => dm.last.social.line.text === 'Welcome, travelers. Mind the mud on my floors.'), 'NPC launch posts the opening line');
  ok(dm.last.social.choices.length === 3, 'NPC launch sets the player choices');
  ok(await until(() => tv.last.social?.npc?.name === 'Mirela the Innkeeper'), 'NPC reaches the TV');

  // Launch: encounter
  await h.call(dm, 'dm:plan:encounter', { plan: imp.id, index: 0 });
  ok(await until(() => dm.last.combat.enemies.length === beforeEnemies + 4), 'encounter adds 3 goblins and a boss');
  const names = dm.last.combat.enemies.map((e) => e.name);
  ok(names.includes('Goblin') && names.includes('Goblin 2') && names.includes('Goblin 3') && names.includes('Goblin Boss'), 'duplicate foes get numbered names');
  ok(dm.last.plans[0].encounters[0].launched === true && dm.last.plans[0].scenes[0].launched === true, 'launched items are marked on the plan');

  // Bad index is refused, not thrown
  const bad = await h.call(dm, 'dm:plan:scene', { plan: imp.id, index: 9 });
  ok(bad.error, 'a launch with a bad index is refused');

  // Remove
  dm.emit('dm:plan:remove', { plan: imp.id });
  ok(await until(() => (dm.last.plans || []).length === 0), 'DM can remove a plan');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
