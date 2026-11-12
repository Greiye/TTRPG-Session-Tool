// Downtime between sessions: the DM opens a week, phones choose an activity, the DM writes results.
// Picks and results are private to the character and the DM; the TV and other phones see nothing.
const { harness } = require('./helpers');
const downtime = require('../src/downtime');
const h = harness('downtime');
const { ok, until } = h;

// Pure rules
let dt = downtime.start(null);
ok(dt.n === 1 && dt.open, 'a new week starts open');
ok(downtime.choose(dt, 'c1', 'nope', 'x').error, 'unknown activities are refused');
ok(downtime.choose(dt, 'c1', 'crafting', '   ').error, 'a pick needs a target');
ok(downtime.choose(dt, 'c1', 'crafting', 'Healing potion').ok && dt.picks.c1.kind === 'crafting', 'a valid pick is kept');
ok(downtime.choose(dt, 'c1', 'training', 'Longsword drills').ok && dt.picks.c1.kind === 'training', 'a later pick replaces the earlier one');
ok(downtime.resolve(dt, 'c1', 'The potion is ready.') && dt.results.c1.text === 'The potion is ready.', 'a result is written for a pick');
ok(!downtime.resolve(dt, 'c2', 'No pick here.'), 'no result for a character who made no pick');
dt.open = false;
ok(downtime.choose(dt, 'c1', 'research', 'The mill').error, 'closed picks refuse choices');
ok(downtime.start(dt).n === 2, 'the next week counts up');
ok(downtime.viewFor(null, { role: 'dm' }) === null, 'no downtime means nothing to show');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Lyra', 'Wizard');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 2 && b.last.players.length === 2);

  ok(!a.last.downtime?.n && a.last.downtime?.mine == null, 'no week yet: phones see no week');
  dm.emit('dm:downtime:start');
  ok(await until(() => a.last.downtime?.n === 1 && a.last.downtime.open), 'DM starts week 1; phones see it open');
  ok(tv.last?.downtime == null, 'the TV never sees downtime');

  // Picks: a phone chooses; invalid input is refused; the DM sees all picks, phones see their own.
  const bad = await h.call(a, 'player:downtime:choose', { kind: 'sleep', target: 'all day' });
  ok(bad.error, 'a phone cannot pick an unknown activity');
  const r1 = await h.call(a, 'player:downtime:choose', { kind: 'crafting', target: 'Healing potion' });
  ok(r1.ok, 'a phone chooses crafting');
  await h.call(b, 'player:downtime:choose', { kind: 'research', target: 'The old mill' });
  ok(await until(() => dm.last.downtime.picks[a.me.id]?.target === 'Healing potion' && dm.last.downtime.picks[b.me.id]?.kind === 'research'), 'the DM sees every pick');
  ok(a.last.downtime.mine?.target === 'Healing potion' && b.last.downtime.mine?.kind === 'research', 'each phone sees its own pick');
  ok(!JSON.stringify(a.last.downtime).includes('The old mill'), 'other players picks stay private');

  // DM closes picks: choices are refused.
  dm.emit('dm:downtime:open', { open: false });
  ok(await until(() => a.last.downtime.open === false), 'DM closes picks');
  const late = await h.call(a, 'player:downtime:choose', { kind: 'training', target: 'Too late' });
  ok(late.error && /closed/.test(late.error), 'closed picks refuse late choices');

  // Results: only the DM and the character who picked see the result.
  dm.emit('dm:downtime:resolve', { pid: a.me.id, text: 'Three potions of healing, one cracked.' });
  ok(await until(() => a.last.downtime.result?.text?.startsWith('Three potions')), 'the character sees its result');
  ok(!b.last.downtime.result && !JSON.stringify(b.last.downtime).includes('Three potions'), 'other phones do not see the result');
  ok(a.last.log.some((l) => l.kind === 'downtime' && /resolved/.test(l.text)), 'the character gets a private log line');
  ok(!b.last.log.some((l) => l.kind === 'downtime'), 'other phones do not get that log line');
  ok(!JSON.stringify(tv.last?.downtime || {}).includes('Three potions'), 'the TV never shows the result');
  dm.emit('dm:downtime:resolve', { pid: b.me.id, text: '' });
  dm.emit('dm:downtime:resolve', { pid: 'nobody', text: 'x' });
  await h.wait(120);
  ok(!dm.last.downtime.results[b.me.id], 'an empty result clears it; unknown characters are ignored');

  // A new week resets picks and results.
  dm.emit('dm:downtime:start');
  ok(await until(() => a.last.downtime?.n === 2 && a.last.downtime.mine === null && a.last.downtime.result === null), 'a new week clears picks and results');

  // A phone cannot start weeks or write results.
  a.emit('dm:downtime:start');
  await h.wait(80);
  ok(dm.last.downtime.n === 2, 'phones cannot start a week');
  await h.done(srv);
})();
