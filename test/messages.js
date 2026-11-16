// Phase 4: handouts, whisper reveal to the TV, spoils, dialogue vote.
const { harness } = require('./helpers');

const h = harness('messages');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Vex', 'Rogue');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 2 && b.last.players.length === 2);

  // Handouts (9): sent to everyone's phone, not the TV until shared.
  dm.emit('dm:handout', { title: 'Wanted poster', text: 'Reward: 50 gp.', to: 'all' });
  await until(() => a.last.handouts.some((x) => x.title === 'Wanted poster'));
  ok(b.last.handouts.some((x) => x.title === 'Wanted poster'), 'handout reaches every phone');
  ok(!tv.last?.handouts?.some((x) => x.title === 'Wanted poster'), 'handout stays off the TV until shared');
  const hid = dm.last.handouts.find((x) => x.title === 'Wanted poster').id;
  dm.emit('dm:share', { id: hid, on: true });
  await until(() => tv.last?.handouts?.some((x) => x.title === 'Wanted poster'));
  ok(true, 'shared handout reaches the TV');
  dm.emit('dm:handout', { title: 'Secret letter', text: 'For Vex only.', to: [b.me.id] });
  await until(() => b.last.handouts.some((x) => x.title === 'Secret letter'));
  ok(!a.last.handouts.some((x) => x.title === 'Secret letter'), 'targeted handout is not on other phones');

  // Handouts pop up on phones until Continue (Mike, Nov 16): read state per character, the DM sees who read.
  ok(a.last.handouts.find((x) => x.id === hid).seen === false, 'an unread handout is marked unseen on the phone');
  ok(a.last.handouts.find((x) => x.id === hid).read === undefined, 'phones do not get the read map');
  a.emit('player:handout:read', { id: hid });
  await until(() => dm.last.handouts.find((x) => x.id === hid).read?.[a.me.id]);
  ok(await until(() => a.last.handouts.find((x) => x.id === hid).seen === true), 'Continue marks the handout read on that phone');
  ok(b.last.handouts.find((x) => x.id === hid).seen === false, 'other phones still have it unread');
  const sid = dm.last.handouts.find((x) => x.title === 'Secret letter').id;
  a.emit('player:handout:read', { id: sid });
  await h.wait(120);
  ok(!dm.last.handouts.find((x) => x.id === sid).read?.[a.me.id], 'a phone cannot mark a handout it was not sent');
  dm.emit('dm:phrase', { lang: 'Elvish', text: 'Mellon' });
  await until(() => a.last.handouts.some((x) => x.kind === 'phrase'));
  const ph = a.last.handouts.find((x) => x.kind === 'phrase');
  a.emit('player:handout:read', { id: ph.id });
  await until(() => a.last.handouts.find((x) => x.id === ph.id).seen === true);
  dm.emit('dm:phrase:reveal', { id: ph.id, on: true });
  ok(await until(() => a.last.handouts.find((x) => x.id === ph.id).seen === false && a.last.handouts.find((x) => x.id === ph.id).text === 'Mellon'), 'revealing a phrase pops it up again, now readable');

  // Spoils (11): drop items to phones, claims, DM award.
  dm.emit('dm:spoil', { title: 'Bandit camp', items: [{ name: 'Gold', qty: 40 }, { name: 'Dagger', qty: 1 }] });
  await until(() => a.last.handouts.some((x) => x.kind === 'spoil'));
  const sp = dm.last.handouts.find((x) => x.kind === 'spoil');
  a.emit('player:claim', { id: sp.id, note: 'I need the gold for the inn' });
  b.emit('player:claim', { id: sp.id });
  await until(() => Object.keys(dm.last.handouts.find((x) => x.id === sp.id).claims).length === 2);
  ok(a.last.handouts.find((x) => x.id === sp.id).mine?.note === 'I need the gold for the inn', 'a claim shows on its own phone');
  ok(!JSON.stringify(b.last.handouts).includes('inn') && b.last.handouts.find((x) => x.id === sp.id).claimCount === 2, 'other claims stay private; a phone sees only the count');
  dm.emit('dm:spoil:award', { id: sp.id, charId: a.me.id });
  ok(await until(() => dm.last.handouts.find((x) => x.id === sp.id).awarded === a.me.id), 'DM awards spoils to a character');

  // Dialogue vote (12): everyone votes once, the DM sees counts, phones see their own pick.
  dm.emit('dm:vote:start', { options: ['Accept the deal', 'Walk away', 'Bluff', 'Say nothing'] });
  await until(() => a.last.vote?.options?.length === 4);
  a.emit('player:vote', { index: 0 });
  b.emit('player:vote', { index: 2 });
  await until(() => dm.last.vote?.counts?.[0] === 1 && dm.last.vote?.counts?.[2] === 1);
  ok(dm.last.vote.counts.reduce((x, y) => x + y, 0) === 2, 'DM sees the tally');
  ok(a.last.vote.mine === 0, 'a phone sees its own vote');
  ok(a.last.vote.votes === undefined, 'phones do not see who voted for what');
  a.emit('player:vote', { index: 1 });
  await until(() => dm.last.vote.counts[1] === 1);
  ok(dm.last.vote.counts[0] === 0 && dm.last.vote.counts[1] === 1, 'changing a vote moves it (one vote each)');
  dm.emit('dm:vote:close', {});
  await until(() => a.last.vote && !a.last.vote.open);
  a.emit('player:vote', { index: 3 });
  await h.wait(120);
  ok(dm.last.vote.counts[3] === 0, 'votes are closed after close');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
