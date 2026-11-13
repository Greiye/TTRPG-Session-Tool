// Phase D: languages (scrambled lines and DM gloss), NPC speech styles, the intro card, and timers
// (conditions that count down by round, concentration checks on damage).
const { harness } = require('./helpers');
const speech = require('../src/speech');
const h = harness('phase-d');
const { ok, until } = h;
(async () => {
  // Unit: scrambling keeps the length and spaces, is stable, and styles fall back to fixed names.
  const s1 = speech.scramble('Ash taro, kel!');
  ok([...s1].length === 'Ash taro, kel!'.length && s1.split(' ').length === 3 && s1 === speech.scramble('Ash taro, kel!'), 'a line scrambles to glyphs of the same shape, the same way each time');
  ok(speech.styleFor({ font: 'comic', color: '#ff0000' }).font === 'serif' && speech.styleFor({ font: 'mono', color: 'teal' }).color === 'teal', 'speech styles use fixed names and fall back to serif and ivory');
  ok(speech.introFrom({ campaign: 'Crossroads', session: '3', lines: ['a', 'b', 'c', 'd'] }).lines.length === 3, 'the intro card keeps at most three recap lines');

  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Wizard');
  const b = await h.player(room, 'Brann', 'Fighter');
  await until(() => a.last?.players.length === 2 && b.last?.players.length === 2);
  const mine = (sock) => sock.last.players.find((p) => p.id === sock.me.id);
  dm.emit('dm:sheet', { id: a.me.id, languages: ['Common', 'Elvish'] });
  dm.emit('dm:sheet', { id: b.me.id, languages: ['Common'] });
  await until(() => (mine(a).languages || []).includes('Elvish'));

  // Languages: a player who knows Elvish reads the line; one who does not sees glyphs.
  dm.emit('dm:mode', { mode: 'social' });
  dm.emit('dm:say', { text: 'Ash taro, kel', lang: 'Elvish' });
  ok(await until(() => dm.last.social.line.lang === 'Elvish' && dm.last.social.line.text === 'Ash taro, kel'), 'the DM sees the real Elvish line');
  ok(await until(() => a.last.social.line.text === 'Ash taro, kel'), 'a player who knows Elvish reads the line');
  ok(await until(() => b.last.social.line.scrambled === true && b.last.social.line.text !== 'Ash taro, kel'), 'a player who does not know Elvish sees glyphs');
  dm.emit('dm:gloss', { to: b.me.id, on: true });
  ok(await until(() => b.last.social.line.text === 'Ash taro, kel'), 'the DM glosses the line for one player');
  dm.emit('dm:gloss', { to: '*', on: true });
  dm.emit('dm:say', { text: 'Hush now', lang: 'Dwarvish' });
  ok(await until(() => b.last.social.line.scrambled === true && b.last.social.line.lang === 'Dwarvish'), 'a new line in a tongue starts scrambled again');
  ok(await until(() => dm.last.social.line.text === 'Hush now'), 'the DM still reads it');
  dm.emit('dm:gloss', { to: '*', on: true });
  ok(await until(() => a.last.social.line.text === 'Hush now' && b.last.social.line.text === 'Hush now'), 'glossing for everyone reveals it to every phone');
  dm.emit('dm:say', { text: 'Plain words' });
  ok(await until(() => b.last.social.line.text === 'Plain words' && !b.last.social.line.scrambled), 'a line with no tongue is plain for everyone');

  // NPC speech styles: fixed names, copied onto the line they speak.
  dm.emit('dm:npc', { style: { font: 'mono', color: 'gold' } });
  ok(await until(() => dm.last.social.npc.style?.font === 'mono'), 'the DM sets an NPC font and colour');
  dm.emit('dm:npc', { style: { font: 'comic', color: 'pink' } });
  ok(await until(() => dm.last.social.npc.style?.font === 'serif' && dm.last.social.npc.style?.color === 'ivory'), 'unknown styles fall back to the defaults');
  dm.emit('dm:npc', { style: { font: 'runic', color: 'crimson' } });
  dm.emit('dm:say', { text: 'Stand aside.' });
  ok(await until(() => dm.last.social.line.style?.color === 'crimson'), 'the next line carries the NPC style to the TV');

  // Intro card: campaign, session and up to three lines, shown then removed.
  dm.emit('dm:intro', { campaign: 'The Sunken Crossroads', session: 4, lines: ['The cart tracks led north.', 'Mirela paid us.', 'Brann lost a tooth.', 'extra'] });
  ok(await until(() => dm.last.introCard?.session === 4 && dm.last.introCard.lines.length === 3), 'the intro card shows on the TV with three lines');
  const n1 = dm.last.introCard.n;
  dm.emit('dm:intro', { campaign: 'The Sunken Crossroads', session: 4, lines: [] });
  ok(await until(() => dm.last.introCard?.n === n1 + 1), 'showing it again bumps the card so the TV replays it');

  // Timers: a condition counts down one round at a time and is removed when it runs out.
  dm.emit('dm:combat:start');
  await until(() => dm.last.combat.active);
  dm.emit('dm:timer:condition', { id: a.me.id, name: 'Stunned', rounds: 2 });
  ok(await until(() => (mine(a).conditions || []).includes('Stunned') && dm.last.timers.some((t) => t.name === 'Stunned' && t.rounds === 2)), 'a timed condition sets the condition and a 2-round timer');
  // Two turns (one per player) make a round, and a new round ticks the timers.
  dm.emit('dm:combat:next');
  dm.emit('dm:combat:next');
  ok(await until(() => dm.last.timers.some((t) => t.name === 'Stunned' && t.rounds === 1)), 'one round passes: the timer drops to 1');
  dm.emit('dm:combat:next');
  dm.emit('dm:combat:next');
  ok(await until(() => !dm.last.timers.some((t) => t.name === 'Stunned') && !(mine(a).conditions || []).includes('Stunned')), 'the condition ends when its timer runs out');

  // Concentration: starting it logs it; damage asks the caster for a Constitution save.
  dm.emit('dm:concentrate', { id: a.me.id, spell: 'Hold Person' });
  ok(await until(() => dm.last.timers.some((t) => t.kind === 'concentration' && t.name === 'Hold Person')), 'the caster concentrates on a spell');
  dm.emit('dm:hp', { id: a.me.id, delta: -6 });
  ok(await until(() => dm.last.check?.kind === 'save' && dm.last.check.key === 'con' && dm.last.check.dc === 10 && dm.last.check.targets?.includes(a.me.id)), 'damage asks the caster for a DC 10 Constitution save');
  dm.emit('dm:concentrate:drop', { id: a.me.id });
  ok(await until(() => !dm.last.timers.some((t) => t.kind === 'concentration')), 'the DM drops concentration');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
