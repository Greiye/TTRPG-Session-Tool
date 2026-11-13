// Phase I table tools over the wire: the DM drives them, phones answer them, and each viewer gets only their part.
const { harness } = require('./helpers');
const h = harness('table-sockets');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const ash = await h.player(room, 'Ash', 'Rogue');
  const bren = await h.player(room, 'Bren', 'Cleric');
  const screen = await h.client();
  screen.emit('screen:hello', {});
  await until(() => ash.last?.players.length === 2 && dm.last);

  // Cue deck: the DM saves and fires a cue; a phone cannot.
  ash.emit('dm:cue:add', { name: 'Nope' });
  await h.wait(300);
  ok(!dm.last.cues.some((c) => c.name === 'Nope'), 'a phone cannot add a cue');
  dm.emit('dm:cue:add', { name: 'Ambush', mode: 'combat', light: 'night' });
  ok(await until(() => dm.last.cues.some((c) => c.name === 'Ambush')), 'the DM adds a cue');
  const cue = dm.last.cues.find((c) => c.name === 'Ambush');
  dm.emit('dm:cue:fire', { id: cue.id });
  ok(await until(() => dm.last.mode === 'combat' && dm.last.scene.light === 'night'), 'firing a cue sets the mode and light');

  // Nudge: only the target phone gets it; the TV does not.
  dm.emit('dm:nudge', { charId: ash.me.id, text: 'The locket is warm.' });
  ok(await until(() => ash.last?.myNudges?.length === 1), 'the target phone gets the nudge');
  ok(bren.last && !(bren.last.myNudges || []).length, 'another phone does not');
  ok(!JSON.stringify(screen.last || {}).includes('locket is warm'), 'the TV never sees the nudge');
  const nudgeId = ash.last.myNudges[0].id;
  ash.emit('player:nudge', { id: nudgeId, share: true, text: 'It is cold.' });
  ok(await until(() => dm.last.nudges.some((n) => n.id === nudgeId && n.status === 'shared')), 'the player can share it');
  ok(await until(() => dm.last.log.some((l) => l.text.includes('It is cold.'))), 'a shared nudge reaches the table log');

  // Framing: grant a token, spend it on the phone, and the TV shows the canon.
  dm.emit('dm:framing:grant', { charId: ash.me.id, n: 1 });
  ok(await until(() => ash.last?.tokens === 1), 'the phone shows its token');
  ash.emit('player:frame', { text: 'The door is already unlocked.' });
  ok(await until(() => screen.last?.canon?.some((c) => c.text.includes('unlocked'))), 'the TV shows the framed detail as canon');
  ok(await until(() => ash.last?.tokens === 0), 'spending the token uses it up');

  // Bonds: a phone sets its bond; only the owner and the DM see it; the DM calls it back.
  ash.emit('player:bond', { to: bren.me.id, text: 'We owe each other a debt.' });
  ok(await until(() => ash.last.players.find((p) => p.id === ash.me.id)?.bond?.text), 'the owner sees the bond');
  ok(!JSON.stringify(bren.last.players.find((p) => p.id === ash.me.id) || {}).includes('debt'), 'other phones do not see the bond');
  dm.emit('dm:session:next', {});
  dm.emit('dm:session:next', {});
  ok(await until(() => dm.last.dueBonds.some((b) => b.charId === ash.me.id)), 'the DM is reminded to call the bond back');
  dm.emit('dm:bond:called', { charId: ash.me.id });
  ok(await until(() => !dm.last.dueBonds.some((b) => b.charId === ash.me.id)), 'calling it back clears the reminder');

  // Montage: answers stay with the DM until the reveal.
  dm.emit('dm:montage:ask', { prompt: 'What did you dream?' });
  ash.emit('player:montage', { text: 'Rain on a red door.' });
  bren.emit('player:montage', { text: 'A bell.' });
  ok(await until(() => dm.last.montage.count === 2), 'both answers are in');
  ok(!JSON.stringify(screen.last?.montage || {}).includes('red door'), 'the TV holds the answers until the reveal');
  dm.emit('dm:montage:reveal', {});
  ok(await until(() => (screen.last?.montage?.answers || []).length === 2), 'the reveal shows every answer on the TV');

  // Spotlight: the DM sees counts; the TV does not.
  ok(dm.last.balance.some((r) => r.talk >= 1), 'the spotlight meter counts speech');
  ok(!('balance' in screen.last), 'the TV does not see the spotlight meter');

  // Foreshadowing: the recap shows payoffs to everyone; hints stay with the DM.
  dm.emit('dm:foreshadow:add', { text: 'The stranger knows your name.' });
  ok(await until(() => dm.last.foreshadow.length === 1), 'the DM plants a hint');
  dm.emit('dm:foreshadow:pay', { id: dm.last.foreshadow[0].id, payoff: 'He is the king’s spy.' });
  ok(await until(() => (screen.last?.foreshadow || []).length === 1), 'the recap shows the payoff on the TV');

  // Tension and layouts.
  dm.emit('dm:tension', { value: 7, label: 'Chase', on: true });
  ok(await until(() => screen.last?.tension?.value === 7 && screen.last.tension.on), 'the TV shows the tension track');
  dm.emit('dm:layout', { name: 'rest' });
  ok(await until(() => screen.last?.stageLayout === 'rest'), 'the layout follows the DM');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
