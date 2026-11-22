// Mike's Nov 21 batch: social drag-in and self-join, NPC emotion with the line, player languages, DM-only
// stats, named moves (at least one), Spells tab for casters, hit dice prompts and automated class features.
const h = require('./helpers').harness('nov21');
const cast = require('../src/cast');
const rests = require('../src/rests');
const sheet = require('../src/sheet');
const { ok, until } = h;

// --- units ---
{
  const s = { npc: { name: 'x', emotion: 'neutral', hue: 1 } };
  cast.ensure(s);
  ok(Array.isArray(s.party) && !s.party.length, 'no one is in the conversation at first');
  ok(cast.start(s, ['pool-albert'], 1, ['c1', 'c1', 'c2']).ok && s.party.join() === 'c1,c2', 'start takes the players dragged in, once each');
  ok(cast.join(s, 'c3') && !cast.join(s, 'c3') && s.party.length === 3, 'a player joins once');
  ok(cast.leave(s, 'c1') && s.party.join() === 'c2,c3', 'a player can be taken out');
  ok(cast.bring(s, 'pool-brent').ok && s.cast.map((c) => c.name).join() === 'Albert,Brent', 'the DM drags another NPC in');
  ok(cast.bring(s, 'pool-brent').error, 'an NPC already in the conversation is refused');
  cast.close(s);
  ok(!s.party.length, 'closing the conversation empties it');

  const c = { cls: 'Fighter', system: 'dnd5e', level: 1, hp: 10, maxHp: 10 };
  sheet.ensureSheet(c);
  ok(c.moves.length === 1 && c.moves[0].name && c.moves[0].steps.length >= 2, 'every character starts with one named move');
  sheet.applySheet(c, { moves: [] }, false);
  ok(c.moves.length === 1, 'the last move cannot be deleted');
  sheet.applySheet(c, { moves: [{ ...c.moves[0], name: 'Dragon Fang' }] }, false);
  ok(c.moves[0].name === 'Dragon Fang', 'a player renames a move');
  sheet.applySheet(c, { hp: 1, tempHp: 9, hitDiceUsed: 1, slotMax: { 1: 4 } }, false);
  ok(c.hp === 10 && c.tempHp === 0 && !c.hitDice.used && !c.slots[1], 'a player cannot change stats or health');
  sheet.applySheet(c, { languages: ['Elvish', 'Old Tongue', 'Elvish'] }, false);
  ok(c.languages.join() === 'Elvish,Old Tongue', 'a player sets the languages they know, homebrew ones too');
  sheet.applySheet(c, { languages: ['Orc'], hp: 4 }, true);
  ok(c.languages.join() === 'Elvish,Old Tongue' && c.hp === 4, 'the DM changes HP but not languages');
  ok(!sheet.isCaster(c) && sheet.isCaster({ slots: { 1: { max: 2, used: 0 } } }) && sheet.isCaster({ slots: {}, spells: ['x'] }), 'spellcaster: spell slots or spells');

  const f = { cls: 'Fighter', level: 2, hp: 3, maxHp: 30, uses: {}, hitDice: { die: 10, used: 0 }, abilities: { con: 10 } };
  const sw = rests.useFeature(f, 'Second Wind');
  ok(sw.healed >= 3 && f.hp === 3 + sw.healed && /heals/.test(sw.text), 'Second Wind heals 1d10 + level by itself');
  ok(!rests.useFeature(f, 'Action Surge').error && f.surge === true, 'Action Surge grants one more action');
  rests.restCharacter(f, 'short');
  ok(f.hdOffer?.n > 0 && f.hdOffer.why === 'Short rest', 'a hurt character is offered hit dice after a short rest');
  rests.restCharacter(f, 'long');
  ok(!f.hdOffer, 'a long rest clears the offer');
}

(async () => {
  const srv = await h.boot({});
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Ilse', 'Wizard');
  await until(() => dm.last?.players.length === 2);
  const A = () => dm.last.players.find((p) => p.id === a.me.id);
  const B = () => dm.last.players.find((p) => p.id === b.me.id);
  ok(!A().caster && B().caster, 'the wizard is a spellcaster, the fighter is not');

  // --- social ---
  dm.emit('dm:mode', { mode: 'social' });
  await until(() => dm.last.mode === 'social');
  ok((await h.call(dm, 'dm:convo:start', { ids: ['pool-albert'], pids: [a.me.id, 'nobody'] })).ok, 'the DM starts with an NPC and a player dragged in');
  ok(await until(() => dm.last.social.party.join() === a.me.id), 'only real players join');
  b.emit('player:convo:join');
  ok(await until(() => dm.last.social.party.includes(b.me.id)), 'a player joins from their phone');
  dm.emit('dm:convo:drop', { id: b.me.id });
  ok(await until(() => !dm.last.social.party.includes(b.me.id)), 'the DM takes a player out');
  ok((await h.call(dm, 'dm:convo:add', { id: b.me.id })).ok && await until(() => dm.last.social.party.includes(b.me.id)), 'the DM drags a player back in');
  ok((await h.call(dm, 'dm:convo:add', { id: 'pool-christina' })).ok && await until(() => dm.last.social.cast.some((c) => c.name === 'Christina')), 'the DM drags another NPC in');

  // NPC emotion changes with the line.
  dm.emit('dm:say', { text: 'You again.', emotion: 'angry' });
  ok(await until(() => dm.last.social.line.text === 'You again.' && dm.last.social.npc.emotion === 'angry' && dm.last.social.line.emotion === 'angry'), 'the NPC wears the picked emotion when the line goes out');

  // Languages: set by the player, used for their lines.
  b.emit('player:sheet', { languages: ['Common', 'Draconic'] });
  ok(await until(() => B().languages.join() === 'Common,Draconic'), 'the player sets their languages');
  dm.emit('dm:sheet', { id: b.me.id, languages: ['Orc'] });
  await h.wait(150); // nothing should change
  ok(B().languages.join() === 'Common,Draconic', 'the DM cannot change a player\'s languages');
  b.emit('player:social:say', { text: 'The vault is below.', emotion: 'smug', lang: 'Draconic' });
  ok(await until(() => dm.last.social.line.text === 'The vault is below.' && dm.last.social.line.lang === 'Draconic'), 'a line in a language the speaker knows');
  ok(await until(() => a.last.social.line.lang === 'Draconic' && a.last.social.line.text !== 'The vault is below.'), 'scrambled for a player who does not know it');
  ok(b.last.social.line.text === 'The vault is below.', 'the speaker reads their own line');
  b.emit('player:social:say', { text: 'Hello.', emotion: 'happy', lang: 'Abyssal' });
  ok(await until(() => dm.last.social.line.text === 'Hello.' && !dm.last.social.line.lang), 'a language the speaker does not know falls back to Common');
  dm.emit('dm:convo:end');
  await until(() => dm.last.mode === 'exploration', 3000);
  ok(!dm.last.social.party.length, 'ending the conversation empties it');

  // --- stats are the DM's ---
  a.emit('player:sheet', { hp: 1, notes: 'mine' });
  ok(await until(() => A().notes === 'mine'), 'notes still save');
  ok(A().hp === A().maxHp, 'a phone cannot change HP');

  // --- hit dice ---
  dm.emit('dm:sheet', { id: a.me.id, hp: 2 });
  await until(() => A().hp === 2);
  dm.emit('dm:rest', { kind: 'short' });
  ok(await until(() => a.last.players.find((p) => p.id === a.me.id)?.hdOffer?.why === 'Short rest'), 'the phone is asked about hit dice after a short rest');
  const r = await h.call(a, 'player:hitdice', { n: 1 });
  ok(r.ok && await until(() => A().hp > 2 && A().hitDice.used === 1 && !A().hdOffer), 'spending a hit die heals and counts it');
  dm.emit('dm:sheet', { id: a.me.id, hitDiceUsed: 0 }); // level 1: one die, now back
  await until(() => A().hitDice.used === 0);
  dm.emit('dm:hitdice:offer', { id: a.me.id });
  ok(await until(() => A().hdOffer?.why), 'the DM can offer hit dice any time');
  ok(!('hdOffer' in (b.last.players.find((p) => p.id === a.me.id) || {})), 'another phone does not see the offer');
  await h.call(a, 'player:hitdice', { n: 0 });
  ok(await until(() => !A().hdOffer) && A().hitDice.used === 0, '"Not now" spends nothing');

  // --- named move in combat log ---
  a.emit('player:sheet', { moves: [{ ...A().moves[0], name: 'Dragon Fang' }] });
  ok(await until(() => A().moves[0].name === 'Dragon Fang'), 'the move keeps its new name');
  await h.done(srv);
})();
