// Table play (PR AD, Nov 24): key bank and asks, battle cry, NPC memory, night ambience, voices, tips, drift; and
// who may see each of them.
const { harness } = require('./helpers');

const h = harness('tableplay');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  try {
    const dm = await h.dm();
    const room = await h.room();
    const a = await h.player(room, 'Thorn', 'Rogue');
    const b = await h.player(room, 'Wren', 'Bard');
    const tv = await h.client();
    tv.emit('screen:hello');
    await until(() => dm.last.players.length === 2 && tv.last?.viewer.role === 'screen');
    const thorn = (s) => s.last.players.find((p) => p.id === a.me.id);

    // Key bank
    await until(() => thorn(a)?.keys?.length);
    const k = thorn(a).keys.find((x) => x.skill === 'Stealth');
    ok(k && k.bonus === 7, 'a phone gets its profession\'s quick rolls with the bonus');
    ok(thorn(b).keys === undefined && thorn(tv).keys === undefined, 'other phones and the TV do not get them');
    ok((await h.call(a, 'player:ask', { skill: 'Arcana' })).error, 'a skill outside the bank cannot be asked for');
    await h.call(a, 'player:ask', { skill: 'Stealth' });
    await until(() => dm.last.asks.length === 1 && a.last.myAsk === 'Stealth');
    ok(dm.last.asks[0].name === 'Thorn', 'the DM sees who asks');
    ok(a.last.asks === undefined && b.last.asks === undefined && tv.last.asks === undefined && !b.last.myAsk, 'asks stay with the DM and the asker');
    ok((await h.call(b, 'dm:ask:answer', { id: dm.last.asks[0].id })).error && (await h.call(b, 'dm:keybank', { cls: 'Rogue', text: 'Arcana' })).error, 'a phone cannot answer asks or edit the bank');
    const rolls0 = dm.last.rolls.length;
    dm.emit('dm:ask:answer', { id: dm.last.asks[0].id });
    ok(await until(() => dm.last.rolls.length === rolls0 + 1 && !dm.last.asks.length), 'accepting rolls it and clears the ask');
    await h.call(a, 'player:ask', { skill: 'Stealth' });
    await until(() => dm.last.asks.length);
    dm.emit('dm:ask:answer', { id: dm.last.asks[0].id, dc: 14 });
    ok(await until(() => a.last.check?.dc === 14 && a.last.check.key === 'Stealth') && !b.last.check, 'a DC makes it a roll call on that phone only');
    await h.call(a, 'player:ask', { skill: 'Stealth' });
    await h.call(a, 'player:ask', { skill: 'Stealth' });
    ok(await until(() => !dm.last.asks.length && !a.last.myAsk), 'asking again takes it back');
    await h.call(a, 'player:ask', { skill: 'Stealth' });
    await until(() => dm.last.asks.length);
    const rolls1 = dm.last.rolls.length;
    dm.emit('dm:ask:answer', { id: dm.last.asks[0].id, no: true });
    ok(await until(() => !dm.last.asks.length) && dm.last.rolls.length === rolls1, 'the DM can say no');
    dm.emit('dm:quickroll', { id: b.me.id, skill: 'Persuasion' });
    ok(await until(() => dm.last.rolls.some((r) => r.who === 'Wren' && /Persuasion/.test(r.label))), 'the DM rolls for a character in one tap');
    ok((await h.call(dm, 'dm:keybank', { cls: 'Rogue', text: 'Juggling' })).error, 'an unknown skill is refused');
    await h.call(dm, 'dm:keybank', { cls: 'Rogue', text: 'Sneak = stealth, Arcana' });
    ok(await until(() => thorn(a).keys.length === 2 && thorn(a).keys[0].label === 'Sneak' && thorn(a).keys[0].skill === 'Stealth'), 'the DM names and changes the bank');
    await h.call(dm, 'dm:keybank', { cls: 'Rogue', text: '' });
    ok(await until(() => thorn(a).keys.length === 3), 'an empty list goes back to the rules');
    ok(a.last.keyBank === undefined && tv.last.keyBank === undefined, 'the bank list is DM only');

    // NPC voices: DM and TV only, off by default
    ok(dm.last.tts.on === false && tv.last.tts.on === false && a.last.tts === undefined, 'voices are off by default and not sent to phones');
    await h.call(dm, 'dm:tts:npc', { name: 'Albert', pitch: 9, rate: 'x', mute: true });
    ok(await until(() => tv.last.tts.npcs.Albert?.pitch === 1.8) && tv.last.tts.npcs.Albert.rate === 1 && tv.last.tts.npcs.Albert.mute, 'a voice is kept within its limits');
    await h.call(a, 'dm:tts', { on: true });
    ok(dm.last.tts.on === false, 'a phone cannot switch voices on');

    // Tips and drift
    const n = a.last.tipsN;
    await h.call(dm, 'dm:tips:reset');
    ok(await until(() => a.last.tipsN === n + 1), 'the DM resets the tips');
    const bd = dm.last.backdrop.library[0];
    await h.call(dm, 'dm:backdrop:drift', { id: bd.id, on: false });
    ok(await until(() => tv.last.stillBackdrops.includes(bd.id)) && a.last.stillBackdrops === undefined, 'a backdrop can hold still');
    await h.call(dm, 'dm:backdrop:drift', { id: bd.id, on: true });
    ok(await until(() => !tv.last.stillBackdrops.length), 'and drift again');

    // Night ambience, its undo, and indoors
    dm.emit('dm:story:set', { day: 1, seg: 1 });
    dm.emit('sound:env', { env: 'forest' });
    const night = () => dm.last.soundscape.layers.some((l) => l.id === 'loop-night');
    await until(() => dm.last.soundscape.env === 'forest' && dm.last.story.seg === 1);
    dm.emit('dm:story:set', { day: 1, seg: 3 });
    ok(await until(() => night() && dm.last.soundscape.auto?.reason === 'Nightfall'), 'dusk adds night sounds');
    dm.emit('dm:story:set', { day: 2, seg: 0 });
    ok(await until(() => !night() && dm.last.soundscape.auto?.reason === 'Dawn'), 'dawn removes them');
    dm.emit('dm:story:set', { day: 2, seg: 4 });
    await until(night);
    dm.emit('sound:auto:undo');
    ok(await until(() => !night()), 'one tap takes them back');
    await h.call(dm, 'dm:tips:reset');
    ok(!night(), 'and they stay away on the next update');
    dm.emit('dm:story:set', { day: 3, seg: 1 });
    dm.emit('sound:env', { env: 'tavern' });
    await until(() => dm.last.soundscape.env === 'tavern' && dm.last.story.seg === 1);
    dm.emit('dm:story:set', { day: 3, seg: 4 });
    await until(() => dm.last.story.seg === 4);
    ok(!night(), 'a tavern stays indoors');

    // NPC memory: kept moments only, the DM only
    await h.call(dm, 'dm:convo:start', { ids: ['pool-albert'], pids: [a.me.id] });
    dm.emit('dm:mode', { mode: 'social' });
    await until(() => dm.last.mode === 'social');
    await h.call(dm, 'dm:convo:start', { ids: ['pool-albert'], pids: [a.me.id] });
    dm.emit('dm:say', { text: 'I will remember the bridge.' });
    await until(() => dm.last.social.line.text === 'I will remember the bridge.');
    ok(!(await h.call(dm, 'dm:npc:memory', { npcs: ['Albert'], pcs: ['Thorn'] })).moments.some((m) => /bridge/.test(m.text)), 'a line that was not kept is not recalled');
    await h.call(dm, 'dm:keep', {}); // the newest thing the table saw
    const mem = await h.call(dm, 'dm:npc:memory', { npcs: ['Albert'], pcs: ['Thorn'] });
    ok(mem.moments.some((m) => /bridge/.test(m.text) && m.npc === 'Albert'), 'a kept line is recalled for the DM');
    ok(!(await h.call(dm, 'dm:npc:memory', { npcs: ['Christina'] })).moments.length, 'another NPC recalls nothing');
    const no = await h.call(a, 'dm:npc:memory', { npcs: ['Albert'] });
    ok(no.error && !no.moments, 'a phone gets no NPC memory');
    ok(![a, b, tv].some((s) => JSON.stringify(s.last).includes('"npcMemory"')), 'memory is never in the state');

    // Battle cry
    dm.emit('dm:mode', { mode: 'exploration' });
    dm.emit('dm:enemy:add', { name: 'Goblin', hp: 200, ac: 1 });
    await until(() => dm.last.combat.enemies.length === 1);
    dm.emit('dm:combat:start');
    await until(() => dm.last.combat.active);
    const turn = () => dm.last.combat.order[dm.last.combat.turn]?.id;
    for (let i = 0; i < 4 && turn() !== a.me.id; i++) { const was = turn(); dm.emit('dm:combat:next'); await until(() => turn() !== was); }
    a.emit('player:combat', { act: 'attack', target: dm.last.combat.enemies[0].id, cry: `  For the mill! ${'x'.repeat(100)}` });
    ok(await until(() => /^For the mill!/.test(tv.last.cry?.text || '')) && tv.last.cry.text.length <= 60, 'the TV shows a short battle cry');
    ok(a.last.log.some((l) => /For the mill!/.test(l.text)), 'it is in the table\'s log');
    dm.emit('dm:cry:hide');
    ok(await until(() => !tv.last.cry && !a.last.log.some((l) => /For the mill!/.test(l.text))), 'the DM hides it with one tap');
    ok(dm.last.log.some((l) => /For the mill!/.test(l.text)), 'the DM still sees the line');
  } catch (e) {
    ok(false, `test crashed: ${e.stack}`);
  }
  await h.done(srv);
})();
