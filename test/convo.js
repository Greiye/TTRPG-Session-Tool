// Social flow (Mike, Nov 16): entering Social mode shows the DM an NPC list; holding Start puts the picked
// NPCs on the scene and pops "Join the conversation?" on phones; a phone line carries its emotion and reads
// "[Name] looks to be [emotion]. They say "..."" in the log; End shows the concluded card, then exploration.
const h = require('./helpers').harness('convo');
const cast = require('../src/cast');
const { ok, until } = h;

{
  const s = { npc: { name: 'x', emotion: 'neutral', hue: 1 } };
  cast.ensure(s);
  ok(s.pool.map((p) => p.name).join() === 'Albert,Brent,Christina', 'placeholder NPCs Albert, Brent and Christina');
  ok(s.convo.live === false, 'no conversation until the DM starts one');
  ok(cast.start(s, [], 1).error, 'starting needs at least one NPC');
  ok(cast.start(s, ['pool-brent', 'pool-albert', 'nope'], 7).ok && s.cast.map((c) => c.name).join() === 'Brent,Albert', 'start puts the picked NPCs on the scene in pick order');
  ok(s.npc.name === 'Brent' && s.convo.live && s.convo.from === 7 && s.entered === 1, 'the first pick speaks; phones see a new entry');
  ok(cast.end(s) && s.convo.ending && !cast.end(s), 'end starts the concluded card once');
  cast.close(s);
  ok(!s.convo.live && !s.convo.ending, 'close resets the conversation');
  ok(cast.sentence('Vex', 'she', 'angry', 'Back off.') === 'Vex looks to be angry. She says "Back off."', 'she says');
  ok(cast.sentence('Tor', 'he', 'neutral', 'Hm.') === 'Tor looks to be calm. He says "Hm."', 'he says, neutral reads as calm');
  ok(cast.sentence('Ash', undefined, 'sad', 'Oh.') === 'Ash looks to be sad. They say "Oh."', 'they say by default');
}

(async () => {
  const srv = await h.boot({ SOCIAL_KEY: 'socialkey' });
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);
  ok(a.last.players[0].pronoun === 'they', 'new characters default to They');

  ok((await h.call(dm, 'dm:convo:start', { ids: ['pool-albert'] })).error, 'cannot start a conversation outside Social mode');
  dm.emit('dm:mode', { mode: 'social' });
  ok(await until(() => dm.last.mode === 'social' && dm.last.social.convo.live === false), 'entering Social mode opens the NPC list, not the conversation');
  const entered = dm.last.social.entered;
  a.emit('player:social:say', { text: 'Too early', emotion: 'happy' });
  await h.wait(150);
  ok(dm.last.social.line.text !== 'Too early', 'phones cannot speak before the conversation starts');

  const r = await h.call(dm, 'dm:convo:start', { ids: ['pool-albert', 'pool-christina'] });
  ok(r.ok, 'DM starts the conversation');
  ok(await until(() => a.last.social.convo.live && a.last.social.entered === entered + 1), 'phones see the conversation start (pop-up trigger)');
  ok(a.last.social.cast.map((c) => c.name).join() === 'Albert,Christina' && a.last.social.npc.name === 'Albert', 'the picked NPCs are on the scene');

  // The emotion only changes with the line.
  a.emit('player:profile', { pronoun: 'she' });
  ok(await until(() => a.last.players[0].pronoun === 'she'), 'a player sets their pronoun');
  ok(!a.last.social.expr?.[a.me.id], 'no emotion shown before a line is sent');
  a.emit('player:social:say', { text: 'We mean no harm.', emotion: 'fearful' });
  ok(await until(() => dm.last.social.line.text === 'We mean no harm.'), 'the line reaches the TV');
  ok(dm.last.social.line.emotion === 'fearful' && dm.last.social.line.player && dm.last.social.expr[a.me.id] === 'fearful', 'the emotion arrives with the line');
  ok(dm.last.log.some((l) => l.kind === 'say' && l.text === 'Thorn looks to be fearful. She says "We mean no harm."'), 'speech log line uses the pronoun');
  a.emit('player:social:say', { text: 'Fine.', emotion: 'bogus' });
  ok(await until(() => dm.last.social.line.text === 'Fine.' && dm.last.social.line.emotion === 'neutral'), 'an unknown emotion falls back to neutral');

  // Narration during the conversation is counted from its start.
  dm.emit('dm:narrate', { text: 'The fire crackles.' });
  ok(await until(() => dm.last.narration.some((n) => n.text === 'The fire crackles.' && n.id > dm.last.social.convo.from)), 'narration posted during the talk is after its start');

  // Social Master may end it.
  const sm = await h.client();
  ok((await h.call(sm, 'dm:auth', { key: 'socialkey' })).role === 'social', 'Social Master joins');
  sm.emit('dm:convo:end');
  ok(await until(() => dm.last.social.convo.ending), 'ending shows the concluded card');
  ok(dm.last.mode === 'social', 'the table stays in Social mode while the card holds');
  ok(await until(() => dm.last.mode === 'exploration', 3000), 'then everyone goes back to exploration');
  ok(!dm.last.social.convo.live && !dm.last.social.convo.ending, 'the conversation is closed');

  // A phone cannot start or end conversations.
  dm.emit('dm:mode', { mode: 'social' });
  await until(() => dm.last.mode === 'social');
  ok(!(await h.call(a, 'dm:convo:start', { ids: ['pool-albert'] })).ok, 'phones cannot start a conversation');
  await h.done(srv);
})();
