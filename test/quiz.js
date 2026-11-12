// Recap quiz: DM starts, phones answer, DM marks, correct marks grant inspiration, inspiration gives advantage.
const { harness } = require('./helpers');

const h = harness('quiz');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Vex', 'Rogue');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 2 && b.last.players.length === 2);

  // Start: phones see the questions but no answer keys; the TV sees nothing.
  dm.emit('dm:quiz:start', { text: 'Who runs the inn? | Mirela\nWhere did the cart go? | The old mill\n' });
  ok(await until(() => a.last.quiz?.questions?.length === 2), 'phones receive the recap questions');
  ok(!JSON.stringify(a.last.quiz).includes('Mirela'), 'phones never see the answer key');
  ok(dm.last.quiz.questions[0].answer === 'Mirela', 'DM sees the answer key');
  ok(tv.last?.quiz === null || tv.last?.quiz === undefined, 'TV sees no quiz');

  // Answers: each phone answers its own; others do not see them.
  a.emit('player:quiz:answer', { qid: 'q1', text: 'Mirela, I think' });
  b.emit('player:quiz:answer', { qid: 'q1', text: 'The bartender' });
  b.emit('player:quiz:answer', { qid: 'q2', text: 'The mill' });
  ok(await until(() => dm.last.quiz.answers[b.me.id]?.q2 === 'The mill'), 'DM receives answers');
  ok(a.last.quiz.mine.q1 === 'Mirela, I think' && a.last.quiz.mine.q2 === undefined, 'a phone sees only its own answers');
  ok(!JSON.stringify(a.last.quiz).includes('The bartender'), 'other players answers stay private');

  // Marks: correct gives inspiration, clearing takes it back, wrong gives none.
  dm.emit('dm:quiz:mark', { pid: a.me.id, qid: 'q1', correct: true });
  ok(await until(() => dm.last.players.find((p) => p.id === a.me.id).inspiration === 1), 'correct mark grants one inspiration point');
  ok(a.last.quiz.marks.q1 === true, 'phone sees its own mark');
  dm.emit('dm:quiz:mark', { pid: b.me.id, qid: 'q1', correct: false });
  dm.emit('dm:quiz:mark', { pid: b.me.id, qid: 'q2', correct: true });
  ok(await until(() => dm.last.players.find((p) => p.id === b.me.id).inspiration === 1), 'wrong mark grants nothing');
  dm.emit('dm:quiz:mark', { pid: a.me.id, qid: 'q1', correct: true });
  await h.wait(120);
  ok(dm.last.players.find((p) => p.id === a.me.id).inspiration === 1, 're-marking the same answer does not double the reward');
  dm.emit('dm:quiz:mark', { pid: b.me.id, qid: 'q2', correct: null });
  ok(await until(() => dm.last.players.find((p) => p.id === b.me.id).inspiration === 0), 'clearing a correct mark takes the point back');

  // Spend: a call with inspiration rolls with advantage and costs one point.
  dm.emit('dm:call', { kind: 'skill', key: 'Perception', dc: 10, targets: [a.me.id] });
  await until(() => a.last.check?.label === 'Perception check');
  a.emit('player:answer', { inspire: true });
  ok(await until(() => dm.last.check.results[a.me.id]), 'inspired roll is recorded');
  ok(dm.last.players.find((p) => p.id === a.me.id).inspiration === 0, 'spending inspiration costs one point');
  ok(dm.last.rolls.some((r) => r.whoId === a.me.id && r.mode === 'adv' && r.dice.length === 2), 'inspired roll uses advantage (two dice)');

  // No points left: inspire does nothing and the roll is plain.
  dm.emit('dm:call', { kind: 'skill', key: 'Perception', dc: 10, targets: [b.me.id] });
  await until(() => b.last.check?.label === 'Perception check');
  b.emit('player:answer', { inspire: true });
  await h.wait(120);
  ok(!!dm.last.check.results[b.me.id], "roll still resolves with no points");
  ok(!dm.last.rolls.some((r) => r.whoId === b.me.id && r.mode === 'adv'), 'no points means no advantage');

  // Disadvantage cannot be cancelled by inspiration.
  dm.emit('dm:quiz:mark', { pid: a.me.id, qid: 'q1', correct: null });
  await until(() => dm.last.players.find((p) => p.id === a.me.id).inspiration === 0);
  dm.emit('dm:quiz:mark', { pid: a.me.id, qid: 'q1', correct: true });
  await until(() => dm.last.players.find((p) => p.id === a.me.id).inspiration === 1);
  dm.emit('dm:call', { kind: 'skill', key: 'Perception', dc: 10, targets: [a.me.id], mode: 'dis' });
  await until(() => a.last.check?.mode === 'dis');
  a.emit('player:answer', { inspire: true });
  await h.wait(120);
  ok(dm.last.players.find((p) => p.id === a.me.id).inspiration === 1, 'inspiration is not spent on a disadvantaged roll');

  // Close: no more answers.
  dm.emit('dm:quiz:close', {});
  await until(() => a.last.quiz && a.last.quiz.open === false);
  a.emit('player:quiz:answer', { qid: 'q2', text: 'Too late' });
  await h.wait(120);
  ok(dm.last.quiz.answers[a.me.id].q2 === undefined, 'answers are closed after close');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
