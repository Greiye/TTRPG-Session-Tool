// Phase 7: NPC relations (DM only), phrases with glyphs and reveal, mood music, lighting, templates.
const { harness } = require('./helpers');
const h = harness('world');
const { ok, until } = h;
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 1);
  // NPC relations (19)
  dm.emit('dm:creature:save', { name: 'Stub' }); // unrelated: keeps the library busy
  dm.emit('dm:relation', { npc: 'x', charId: a.me.id, stance: 'wary' });
  ok(await until(() => dm.last.relations?.x?.[a.me.id] === 'wary'), 'DM records how an NPC feels about a character');
  ok(!('relations' in a.last) && !('relations' in tv.last), 'relations are never sent to phones or the TV');
  // Phrases (20)
  dm.emit('dm:phrase', { lang: 'Elvish', text: 'Stand aside, friend' });
  ok(await until(() => a.last.handouts.some((x) => x.kind === 'phrase')), 'phrase reaches the phones');
  const ph = a.last.handouts.find((x) => x.kind === 'phrase');
  ok(ph.text === undefined && ph.glyphs && ph.glyphs !== 'Stand aside, friend', 'a character without the language sees only glyphs');
  dm.emit('dm:phrase:reveal', { id: ph.id, on: true });
  ok(await until(() => a.last.handouts.find((x) => x.id === ph.id)?.text === 'Stand aside, friend'), 'DM reveal shows the words to everyone');
  dm.emit('dm:phrase', { lang: 'Elvish', text: 'Stand aside, friend' });
  await until(() => dm.last.handouts.filter((x) => x.kind === 'phrase').length === 2);
  const [p1, p2] = dm.last.handouts.filter((x) => x.kind === 'phrase');
  ok(p1.glyphs === p2.glyphs, 'the same phrase always looks the same');
  // Mood music (21)
  dm.emit('dm:mood', { mode: 'combat', track: 'nope' });
  dm.emit('dm:mood', { mode: 'combat', track: null });
  dm.emit('dm:mode', { mode: 'social' });
  await h.wait(120);
  ok(dm.last.moodMap.combat === undefined, 'mood can be cleared and only real modes are accepted');
  // Lighting (22)
  dm.emit('dm:light', { light: 'night' });
  ok(await until(() => tv.last.scene.light === 'night'), 'lighting preset reaches the TV');
  dm.emit('dm:light', { light: 'disco' });
  await h.wait(100);
  ok(dm.last.scene.light === 'night', 'unknown lighting is refused');
  // Templates (23)
  const tpl = await (await fetch(`${h.URL}/api/templates`)).json();
  ok(tpl.dungeon && tpl.heist && tpl.mystery, 'three starter templates are listed');
  dm.emit('dm:template', { key: 'heist' });
  ok(await until(() => dm.last.scene.title === 'The Guild Vault' && dm.last.clocks.length === 2), 'a template sets the scene and clocks');
  ok(dm.last.backdrop.effects.length === 0, 'template effects go to the backdrop, not the scene');
  dm.emit('dm:template', { key: 'mystery' });
  ok(await until(() => dm.last.backdrop.effects.includes('rain')), 'mystery template adds rain');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
