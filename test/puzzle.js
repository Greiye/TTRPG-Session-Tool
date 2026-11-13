// Phase F: teamwork puzzles. Clues split across phones, guesses, DM-confirmed solve, TV reveal.
const puzzle = require('../src/puzzle');
const { harness } = require('./helpers');
const h = harness('puzzle');
const { ok, until } = h;

// Pure rules
ok(puzzle.caesar('Abc, xyz!', 3) === 'Def, abc!', 'caesar shifts letters forward and keeps case and punctuation');
ok(puzzle.matches({ type: 'riddle', answer: 'Mirela / the innkeeper' }, 'The  Innkeeper!'), 'riddle answers ignore case, punctuation and spacing');
ok(!puzzle.matches({ type: 'riddle', answer: 'Mirela' }, 'Vex'), 'a wrong riddle guess does not match');
const ord = puzzle.create({ type: 'order', title: 'Bells', prompt: 'bell, key, candle, mirror', clues: 'bell before key' }, ['a'], 'p0').puzzle;
ok(puzzle.matches(ord, 'bell, key, candle, mirror') && !puzzle.matches(ord, 'key, bell, candle, mirror'), 'an order puzzle needs the items in order');
ok(ord.shown.length === 4 && ord.shown.join() !== ord.order.join(), 'the TV order is shuffled, never the true order');
ok(puzzle.create({ type: 'order', title: 'x', prompt: 'a, b', clues: 'c' }, [], 'p').error, 'an order puzzle needs three items');
ok(puzzle.create({ type: 'riddle', title: 'x', prompt: 'Who?', answer: 'me' }, [], 'p').error, 'a puzzle needs at least one clue');
const cip = puzzle.create({ type: 'cipher', title: 'Note', prompt: 'Meet at the mill', shift: 3, clues: 'The shift is the moon count' }, ['a', 'b'], 'pc').puzzle;
ok(cip.prompt === 'Phhw dw wkh ploo' && cip.answer === 'Meet at the mill', 'a cipher stores the message and shows the encoded text');
ok(cip.clues[0].pid === 'a', 'the first clue goes to the first seated player');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Vex', 'Rogue');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last?.players.length === 2 && b.last?.players.length === 2 && tv.last);

  // A puzzle with two clues, spread over the two seated players in turn.
  const start = await h.call(dm, 'dm:puzzle:start', { type: 'riddle', title: 'The innkeeper', prompt: 'I pour the ale and keep the key.', answer: 'Mirela / the innkeeper', clues: 'She has a scar on her hand\nHer cellar key hangs by the bar' });
  ok(start.ok, 'DM starts a riddle');
  ok(await until(() => a.last.puzzle?.clues?.length === 1 && b.last.puzzle?.clues?.length === 1), 'each phone sees exactly one clue');
  ok(!JSON.stringify(a.last.puzzle).includes('Mirela'), 'phones never see the answer');
  // Which phone holds which clue depends on seat order, so check the shape: one clue each, different, and
  // neither phone can read the other's clue.
  const ta = a.last.puzzle.clues[0]?.text, tb = b.last.puzzle.clues[0]?.text;
  ok(ta && tb && ta !== tb && [ta, tb].sort().join('|') === ['Her cellar key hangs by the bar', 'She has a scar on her hand'].sort().join('|'), 'each phone holds one of the two clues');
  ok(!JSON.stringify(a.last.puzzle).includes(tb) && !JSON.stringify(b.last.puzzle).includes(ta), 'no phone sees the clue held by another phone');
  ok(dm.last.puzzle.answer === 'Mirela / the innkeeper' && dm.last.puzzle.clues.length === 2, 'DM sees the answer and every clue');
  ok(tv.last.puzzle && !tv.last.puzzle.clues && tv.last.puzzle.clueCount === 2 && !('answer' in tv.last.puzzle), 'the TV sees the prompt and the clue count, not the clues or the answer');
  ok(tv.last.puzzle.solution === undefined, 'the TV has no solution before the solve');

  // Clue reassignment: the clue a phone holds moves to the other phone, which then holds both. A stranger cannot be assigned.
  const bad = await h.call(dm, 'dm:puzzle:assign', { clueId: a.last.puzzle.clues[0].id, pid: 'nobody' });
  ok(bad.error, 'a clue cannot go to someone not seated');
  await h.call(dm, 'dm:puzzle:assign', { clueId: a.last.puzzle.clues[0].id, pid: b.me.id });
  ok(await until(() => b.last.puzzle?.clues?.length === 2 && a.last.puzzle?.clues?.length === 0), 'reassigning a clue moves it to another phone');

  // Guesses: shared with phones, hidden from the TV, flagged for the DM.
  const g1 = await h.call(a, 'player:puzzle:guess', { text: 'Vex' });
  ok(g1.ok, 'a phone can guess');
  ok(await until(() => dm.last.puzzle.guesses.length === 1 && b.last.puzzle.guesses.length === 1), 'DM and other phones see the guess');
  ok(dm.last.puzzle.guesses[0].match === false, 'the DM sees a wrong guess is not a match');
  ok(tv.last.puzzle.guesses.length === 0, 'the TV never sees guesses');
  const g2 = await h.call(b, 'player:puzzle:guess', { text: 'the innkeeper' });
  ok(await until(() => dm.last.puzzle.guesses[1]?.match === true), 'the DM sees a guess that matches the answer');
  dm.emit('dm:puzzle:guessmark', { guessId: dm.last.puzzle.guesses[0].id, wrong: true });
  ok(await until(() => b.last.puzzle.guesses[0].wrong === true), 'a wrong mark reaches the phones');

  // Solve: only the DM can confirm. A phone's attempt is ignored; then the TV gets the solution.
  a.emit('dm:puzzle:solve');
  await h.wait(120);
  ok(dm.last.puzzle.status === 'open', 'a phone cannot confirm the solve');
  dm.emit('dm:puzzle:solve');
  ok(await until(() => tv.last.puzzle?.status === 'solved' && tv.last.puzzle.solution === 'Mirela'), 'the solve reaches the TV with the first alternative');
  ok(await until(() => a.last.puzzle?.solution === 'Mirela'), 'phones see the solution once solved');
  const late = await h.call(a, 'player:puzzle:guess', { text: 'Mirela' });
  ok(late.error, 'no guesses once the puzzle is solved');

  // Reopen, then clear.
  dm.emit('dm:puzzle:reopen');
  ok(await until(() => dm.last.puzzle.status === 'open' && tv.last.puzzle.solution === undefined), 'reopen hides the solution again');
  dm.emit('dm:puzzle:clear');
  ok(await until(() => tv.last.puzzle === null && a.last.puzzle === null), 'clear removes the puzzle everywhere');

  // An order puzzle: the TV gets its shuffled items.
  const q = await h.call(dm, 'dm:puzzle:start', { type: 'order', title: 'Bells', prompt: 'bell, key, candle', clues: 'Bell first' });
  ok(q.ok, 'an order puzzle starts');
  ok(await until(() => tv.last.puzzle?.items?.length === 3), 'the TV shows the items of an order puzzle');

  await h.done(srv);
})();
