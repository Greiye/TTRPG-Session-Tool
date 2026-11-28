// Planning › Modules (Mike, Nov 26): every optional feature can be switched off. Off = the TV and phones get
// blank state for it, its events are refused, the DM keeps the data, and switching it back on restores it.
const { harness } = require('./helpers');
const F = require('../src/features');
const h = harness('features');
const { ok, until, call } = h;

// Pure rules first.
{
  const st = { features: {}, combat: {}, mode: 'exploration' };
  ok(Object.keys(F.FEATURES).length >= 30 && F.offList(st).length === 0, 'every module starts on');
  ok(F.set(st, 'nope', false).error, 'an unknown module is refused');
  F.set(st, 'worldmap', false);
  ok(!F.on(st, 'worldmap') && !F.on(st, 'town') && F.list(st).find((f) => f.id === 'town').on, 'town waits for the world map, its own switch stays on');
  ok(F.blocked(st, 'dm:town:gate') === 'town' && F.blocked(st, 'player:worldmap:vote') === 'worldmap', 'events of an off module are blocked');
  ok(F.blocked(st, 'dm:features:set') === null && F.blocked(st, 'dm:say') === null, 'the Modules switch and core events never are');
  F.set(st, 'worldmap', true);
  ok(F.offList(st).length === 0 && !('worldmap' in st.features), 'switching back on leaves nothing behind');
  st.mode = 'social';
  ok(F.set(st, 'social', false).error, 'social cannot go off mid-conversation');
  st.mode = 'exploration'; st.combat = { active: true };
  ok(F.set(st, 'combat', false).error, 'combat cannot go off mid-fight');
  st.combat = {};
  F.set(st, 'social', false);
  ok(F.blocked(st, 'dm:mode', { mode: 'social' }) === 'social' && F.blocked(st, 'dm:mode', { mode: 'exploration' }) === null, 'a switched-off mode cannot be entered');
  ok(F.blocked(st, 'spectate') === null, 'spectators on by default');
  F.set(st, 'spectators', false);
  ok(F.blocked(st, 'spectate') === 'spectators' && F.blocked(st, 'spectate:leave') === 'spectators', 'a bare event name matches its module');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1 && dm.last);
  ok(dm.last.featureList?.length === Object.keys(F.FEATURES).length && dm.last.featuresOff.length === 0, 'the DM gets the module list, all on');
  ok((await call(a, 'dm:features:set', { id: 'shops', on: false })).error, 'a phone cannot switch modules');

  // Shops: open one, then switch shops off.
  dm.emit('dm:shop:open', { id: 'greer', open: true });
  ok(await until(() => a.last.shops.some((s) => s.id === 'greer')), 'phone sees the open shop');
  ok((await call(dm, 'dm:features:set', { id: 'shops', on: false })).ok, 'DM switches shops off');
  ok(await until(() => a.last.featuresOff.includes('shops') && a.last.shops.length === 0), 'phone no longer gets shops');
  ok(dm.last.shops.some((s) => s.id === 'greer'), 'the DM keeps the shops');
  ok(/turned off/.test((await call(dm, 'dm:shop:pop', { id: 'greer' }))?.error || ''), 'opening a shop pop-up is refused while off');
  ok(dm.last.shopPop == null, 'no pop-up opened');

  // World map off: the TV-facing state drops the map and town visits with it.
  ok(a.last.worldMap && a.last.town, 'phone has the world map and town before');
  await call(dm, 'dm:features:set', { id: 'worldmap', on: false });
  ok(await until(() => a.last.worldMap === null && a.last.town === null), 'world map off hides the map and towns');
  ok(dm.last.featureList.find((f) => f.id === 'town').live === false, 'the DM sees town waiting on the world map');

  // Social off: the mode button is refused.
  await call(dm, 'dm:features:set', { id: 'social', on: false });
  ok((await call(dm, 'dm:mode', { mode: 'social' }))?.error, 'social mode refused while off');
  await h.wait(100); // nothing should happen: the mode must stay put
  ok(dm.last.mode === 'exploration', 'mode stays exploration');

  // All on brings everything back.
  ok((await call(dm, 'dm:features:set', { all: true, on: true })).ok, 'All on');
  ok(await until(() => a.last.featuresOff.length === 0 && a.last.shops.some((s) => s.id === 'greer') && a.last.worldMap), 'everything comes back as it was');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
