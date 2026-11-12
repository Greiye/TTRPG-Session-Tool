// Party journal: phones add and remove notes, everyone at the table sees them, the TV and spectators do not.
const { harness } = require('./helpers');
const journal = require('../src/journal');

const h = harness('journal');
const { ok, until } = h;
(async () => {
  // Pure rules first: text is trimmed and capped, kinds fall back to note, removal is author-only for phones.
  const list = [];
  const author = { id: 'thorn', name: 'Thorn' };
  ok(journal.add(list, author, { text: '   ' }) === null, 'blank entries are rejected');
  const e = journal.add(list, author, { text: '  Mirela runs the inn  ', kind: 'npc' });
  ok(e.text === 'Mirela runs the inn' && e.kind === 'npc' && e.by === 'thorn', 'entries keep trimmed text, kind and author');
  ok(journal.add(list, author, { text: 'x', kind: 'bogus' }).kind === 'note', 'unknown kinds become notes');
  ok(!journal.remove(list, e.id, { role: 'player', charId: 'vex' }), 'a phone cannot remove another character\'s entry');
  ok(journal.remove(list, e.id, { role: 'dm' }) && list.length === 1, 'the DM can remove any entry');

  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Vex', 'Rogue');
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => a.last.players.length === 2 && b.last.players.length === 2);

  a.emit('player:journal:add', { text: 'The cart went to the old mill', kind: 'clue' });
  ok(await until(() => b.last.journal?.[0]?.text === 'The cart went to the old mill'), 'other phones see a new entry');
  ok(dm.last.journal[0].name === 'Thorn', 'the DM sees who wrote it');
  ok(tv.last?.journal === null || tv.last?.journal === undefined, 'the TV sees no journal');

  b.emit('player:journal:remove', { id: a.last.journal[0].id });
  await h.wait(120);
  ok(dm.last.journal.length === 1, 'a phone cannot remove another phone\'s entry');
  dm.emit('dm:journal:remove', { id: dm.last.journal[0].id });
  ok(await until(() => b.last.journal.length === 0), 'the DM can remove an entry and phones see it go');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
