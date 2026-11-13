// Phase 3: social scene cast. Up to 5 NPCs or items on the scene, the DM picks who speaks when entering social mode,
// the speaker's expression follows the cast, and a phone can choose the expression of its next line.
const cast = require('../src/cast');
const { harness } = require('./helpers');
const h = harness('cast');
const { ok, until } = h;

// Pure rules
{
  const social = { npc: { name: 'Mirela', hue: 28, emotion: 'neutral' }, cast: [], expr: {}, entered: 0 };
  let n = 0;
  const nextId = () => ++n;
  for (const name of ['A', 'B', 'C', 'D', 'E']) ok(cast.add(social, { name }, nextId).ok, `cast member ${name} fits`);
  ok(cast.add(social, { name: 'F' }, nextId).error, 'a sixth member is refused');
  ok(cast.remove(social, social.cast[0].id) && social.cast.length === 4, 'removing a member frees a place');
  ok(cast.add(social, { name: 'b' }, nextId).error, 'a duplicate name is refused');
  ok(cast.add({ cast: [], npc: { id: null } }, { name: '   ' }, nextId).error, 'an empty name is refused');
  ok(cast.setExpression(social, 'p1', 'angry') && social.expr.p1 === 'angry', 'a phone can choose an expression');
  ok(!cast.setExpression(social, 'p1', 'bored'), 'unknown expressions are refused');
  const fresh = { npc: { name: 'x', emotion: 'neutral', hue: 1 } };
  cast.ensure(fresh);
  ok(Array.isArray(fresh.cast) && fresh.npc.id === null, 'older saves get the new fields');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Lyra', 'Cleric');
  const c = await h.player(room, 'Bram', 'Rogue');
  const d = await h.player(room, 'Wren', 'Wizard');
  await until(() => a.last?.players.length === 4);

  // DM adds cast members; the fifth fits, the sixth does not.
  for (const name of ['Mirela', 'Guard', 'Chest', 'Hound', 'Priest']) {
    const r = await h.call(dm, 'dm:cast:add', { name, kind: name === 'Chest' ? 'item' : 'npc' });
    ok(r.ok, `DM adds ${name} to the scene`);
  }
  const six = await h.call(dm, 'dm:cast:add', { name: 'Ghost' });
  ok(six.error && /5/.test(six.error), 'the sixth on-scene member is refused');
  ok(await until(() => a.last.social.cast.length === 5), 'the cast reaches the phones');
  ok(dm.last.social.cast[2].kind === 'item', 'items are kept as items');

  // Entering social mode with a pick: the chosen cast member speaks.
  const chosen = dm.last.social.cast[1];
  dm.emit('dm:mode', { mode: 'social', npcId: chosen.id });
  ok(await until(() => dm.last.mode === 'social' && dm.last.social.npc.id === chosen.id && dm.last.social.npc.name === 'Guard'), 'entering social mode picks the speaker');
  const entered = dm.last.social.entered;
  ok(entered >= 1, 'entering social mode bumps the entry counter the phones watch');

  // Emotion and name changes follow into the cast entry.
  dm.emit('dm:emotion', { emotion: 'angry' });
  ok(await until(() => dm.last.social.cast.find((x) => x.id === chosen.id).emotion === 'angry'), 'the cast entry takes the speaker’s expression');
  dm.emit('dm:npc', { name: 'Guard Captain' });
  ok(await until(() => dm.last.social.cast.find((x) => x.id === chosen.id).name === 'Guard Captain'), 'renaming the speaker renames its cast entry');

  // Picking a different member switches the speaker.
  dm.emit('dm:cast:pick', { id: dm.last.social.cast[0].id });
  ok(await until(() => dm.last.social.npc.name === 'Mirela'), 'the DM can switch the speaker');

  // Phones: a chosen expression applies to the next line only.
  b.emit('player:expression', { emotion: 'smug' });
  b.emit('player:action', { text: 'I did not steal the cart.' });
  ok(await until(() => dm.last.social.line.text === 'I did not steal the cart.' && dm.last.social.line.emotion === 'smug'), 'the next line carries the chosen expression');
  ok(await until(() => a.last.social.line.player && a.last.social.line.emotion === 'smug'), 'phones get the player line with its expression');

  ok(dm.last.players.length === 4, 'all four characters are in the session');

  // Removing the speaker clears the pick but keeps the NPC name.
  dm.emit('dm:cast:remove', { id: chosen.id });
  ok(await until(() => dm.last.social.cast.every((x) => x.id !== chosen.id)), 'removing a cast member');

  // Leaving social and entering again without a pick keeps the current speaker.
  dm.emit('dm:mode', { mode: 'exploration' });
  dm.emit('dm:mode', { mode: 'social' });
  ok(await until(() => dm.last.social.entered === entered + 1 && dm.last.social.npc.name === 'Mirela'), 're-entering without a pick keeps the speaker');

  // A non-DM cannot add cast members.
  const bad = await h.call(a, 'dm:cast:add', { name: 'Intruder' });
  ok(bad.error, 'phones cannot add cast members');
  ok(dm.last.social.cast.length === 4, 'the cast is unchanged after the refused add');

  c.close(); d.close();
  await h.done(srv);
})();
