// Encounter danger: 5e math through the rules adapter, the cr key in plans, and DM-only visibility.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const rules = require('../src/rules');
const { parsePlan } = require('../src/plan');
const h = harness('difficulty');
const { ok, until } = h;

// Adapter (pure). Level 1 thresholds: easy 25, medium 50, hard 75, deadly 100 per character.
const one = rules.difficulty('dnd5e', [1], [{ name: 'Goblin', count: 1, hp: 7, cr: null }]);
ok(one && one.foes === 1 && one.estimated === true, 'one estimated foe is flagged as estimated');
ok(one.xp === 38 && one.rating === 'easy', 'one goblin (1/8 CR, 25 XP) x1.5 for a solo PC is easy');
const four = rules.difficulty('dnd5e', [1, 1, 1, 1], [{ name: 'Bandit', count: 4, hp: 11, cr: '1/4' }]);
ok(four.xp === 400 && four.rating === 'deadly', 'four 1/4-CR foes vs a level 1 party of four is deadly (400 of 400)');
ok(four.estimated === false && four.thresholds.deadly === 400, 'an explicit cr is not estimated and thresholds are summed');
ok(rules.difficulty('dnd5e', [], [{ name: 'X', count: 1, hp: 1 }]) === null, 'no party means no danger check');
ok(rules.difficulty('daggerheart', [3], [{ name: 'X', count: 1, hp: 9 }]) === null, 'Daggerheart has no encounter guide yet');
const big = rules.difficulty('dnd5e', [5, 5, 5, 5, 5, 5], [{ name: 'X', count: 6, hp: 30, cr: '1' }]);
const small = rules.difficulty('dnd5e', [5, 5], [{ name: 'X', count: 6, hp: 30, cr: '1' }]);
ok(big.xp === 1800 && small.xp === 3000, 'six PCs step the x2 multiplier down to x1.5, two PCs step it up to x2.5');
ok(rules.difficulty('dnd5e', [4], [{ name: 'X', count: 1, hp: 9, cr: '99' }]).estimated === true, 'an invalid cr is ignored and estimated');

// Plan parser: cr key is read, a bad one is dropped.
const p = parsePlan('## Encounter: E\n- 2x Wolf (hp 11, ac 13, cr 1/4)\n- Ogre (hp 59, cr 9/9)\n');
ok(p.encounters[0].foes[0].cr === '1/4' && p.encounters[0].foes[1].cr === null, 'cr key parses; invalid cr is dropped');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last?.players?.length === 1);
  const sample = fs.readFileSync(path.join(__dirname, '..', 'docs', 'sample-session.md'), 'utf8');
  const imp = await h.call(dm, 'dm:plan:import', { md: sample, title: 'Danger' });
  ok(await until(() => dm.last.plans?.[0]?.encounters?.[0]?.difficulty), 'DM page gets a danger rating per encounter');
  const d = dm.last.plans[0].encounters[0].difficulty;
  ok(d.rating === 'deadly' && d.party === 1 && d.estimated === true, 'sample ambush (3 goblins + boss) is deadly for one level 1 PC');
  ok(!('plans' in a.last) && !('plans' in tv.last), 'danger ratings stay off phones and the TV');
  const launch = await h.call(dm, 'dm:plan:encounter', { plan: imp.id, index: 0 });
  ok(launch.difficulty && launch.difficulty.rating === 'deadly', 'launch reports the rating back to the DM');
  ok(await until(() => dm.last.log.some((l) => /Mill Ambush \(4 foes, deadly\)/.test(l.text))), 'the log names the danger of the fight');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
