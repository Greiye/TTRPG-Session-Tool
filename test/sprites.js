// Layered sprites, steps 5-6: the DM picks a sprite for the speaker or a character, the emotion buttons drive
// its state, and playback and animation are per-device settings. Typewriter mouth sync is client-side.
const sprites = require('../src/sprites');
const { harness } = require('./helpers');
const h = harness('sprites');
const { ok, until } = h;

// Pure rules
ok(sprites.clean(null) === null, 'no sprite clears the pick');
ok(sprites.clean({ id: 'mirela' }).state === 'neutral', 'a sprite starts neutral');
ok(sprites.clean({ id: 'mirela', state: 'happy' }).state === 'happy', 'a sprite keeps its state');
ok(sprites.clean({ id: '../etc' }) === undefined, 'path-like sprite ids are refused');
ok(sprites.clean({ id: 'Mirela' }) === undefined, 'sprite ids are lowercase');
ok(sprites.clean('mirela') === undefined, 'a bare string is not a sprite');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);

  // NPC: pick a sprite, the emotion buttons follow it.
  const bad = await h.call(dm, 'dm:sprite', { target: 'npc', sprite: { id: '../x' } });
  ok(bad.error, 'a bad sprite id is refused');
  const set = await h.call(dm, 'dm:sprite', { target: 'npc', sprite: { id: 'mirela', state: 'neutral' } });
  ok(set.ok, 'the DM sets the speaker’s sprite');
  ok(await until(() => a.last.social.npc.sprite?.id === 'mirela'), 'the sprite reaches the phones');
  dm.emit('dm:emotion', { emotion: 'happy' });
  ok(await until(() => dm.last.social.npc.sprite?.state === 'happy'), 'an emotion button changes the sprite state');

  // Cast entries keep the sprite too.
  const c = await h.call(dm, 'dm:cast:add', { name: 'Mirela', kind: 'npc' });
  dm.emit('dm:cast:pick', { id: c.id });
  ok(await until(() => dm.last.social.npc.id === c.id), 'the cast member is picked');
  await h.call(dm, 'dm:sprite', { target: 'npc', sprite: { id: 'guard', state: 'neutral' } });
  ok(await until(() => dm.last.social.cast.find((x) => x.id === c.id)?.sprite?.id === 'guard'), 'the cast entry keeps the sprite');

  // Characters: the DM sets a PC sprite, and the emotion target changes that character.
  const me = a.me.id;
  const pc = await h.call(dm, 'dm:sprite', { target: me, sprite: { id: 'thorn', state: 'neutral' } });
  ok(pc.ok, 'the DM sets a character’s sprite');
  ok(await until(() => a.last.players.find((p) => p.id === me)?.sprite?.id === 'thorn'), 'the character sprite reaches the phones');
  dm.emit('dm:pc:emotion', { id: me, emotion: 'angry' });
  ok(await until(() => a.last.players.find((p) => p.id === me)?.sprite?.state === 'angry'), 'the emotion target changes a character’s sprite state');
  const nope = await h.call(dm, 'dm:sprite', { target: 'nobody', sprite: { id: 'x' } });
  ok(nope.error, 'a sprite for an unknown target is refused');

  // Phones cannot pick sprites.
  const phoneTry = await h.call(a, 'dm:sprite', { target: 'npc', sprite: { id: 'evil' } });
  ok(phoneTry.error, 'phones cannot pick sprites');

  // Playback and animation are settings the DM can store for the TV.
  dm.emit('dm:settings', { display: { sprite: 'sheet', anim: 'off' } });
  ok(await until(() => dm.last.settings.display.anim === 'off' && dm.last.settings.display.sprite === 'sheet'), 'TV playback and animation settings are stored');
  dm.emit('dm:settings', { display: { anim: 'loud' } });
  await h.wait(100);
  ok(dm.last.settings.display.anim === 'off', 'unknown animation settings are ignored');

  a.close();
  await h.done(srv);
})();
