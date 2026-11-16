// Lore tab (Mike, Nov 16): DM entries by category, DM notes stay on the DM page, phones see shared entries.
const { harness } = require('./helpers');
const h = harness('lore');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const tv = await h.client();
  tv.emit('screen:hello');
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1 && tv.last);

  const r = await h.call(dm, 'dm:lore:add', { cat: 'book', name: 'The Ashen Codex', text: 'Bound in grey hide.', dm: 'Curse: reader loses 1 HP per page.' });
  ok(r.ok && r.id, 'the DM adds a book');
  ok((await h.call(dm, 'dm:lore:add', { cat: 'book', name: 'the ashen codex' })).error, 'a duplicate name in a category is refused');
  ok((await h.call(dm, 'dm:lore:add', { cat: 'spaceship', name: 'X' })).error, 'an unknown category is refused');
  ok((await h.call(a, 'dm:lore:add', { cat: 'note', name: 'Hack' })).error, 'a phone cannot add lore');
  ok(await until(() => dm.last.lore.some((e) => e.id === r.id && e.dm.startsWith('Curse'))), 'the DM sees the entry and its note');
  ok(a.last.lore.length === 0 && tv.last.lore.length === 0, 'unshared lore stays off phones and the TV');

  await h.call(dm, 'dm:lore:edit', { id: r.id, shared: true, text: 'Bound in grey hide. Warm to the touch.' });
  ok(await until(() => a.last.lore.length === 1 && a.last.lore[0].text.endsWith('touch.')), 'a shared entry reaches the phone');
  ok(a.last.lore[0].dm === undefined, 'the phone never gets the DM note');
  ok(tv.last.lore.length === 0, 'the TV gets no lore');

  const pulled = await h.call(dm, 'dm:lore:pull');
  ok(pulled.added > 0, 'pulling from the table adds world map places and NPCs');
  ok(await until(() => dm.last.lore.some((e) => e.cat === 'dungeon') && dm.last.lore.some((e) => e.cat === 'npc')), 'dungeon entrances land in Dungeons and the speaking NPC in NPCs');
  ok((await h.call(dm, 'dm:lore:pull')).added === 0, 'a second pull adds nothing');

  ok((await h.call(dm, 'dm:lore:remove', { id: r.id })).ok, 'the DM deletes an entry');
  ok(await until(() => a.last.lore.length === 0), 'the phone loses it');

  await h.done(srv);
})();
