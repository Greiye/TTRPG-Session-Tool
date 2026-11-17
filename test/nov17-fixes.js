// Mike's fix list (Nov 17): the party lands on a new grid, combat music waits for initiative (test/soundscape.js),
// town paths and sharing a town map on the TV, and travel taking over the TV for the trip plus 3 seconds.
const { harness } = require('./helpers');
const town = require('../src/town');
const h = harness('nov17-fixes');
const { ok } = h;

// Town paths: one per reveals link, both ends visible to the viewer.
{
  const T = town.fresh();
  T.maps.w1 = town.starter();
  const m = T.maps.w1;
  ok(town.links(m, true).length === 4, 'the DM sees every path of the starter town');
  ok(town.links(m, false).length === 0, 'the table sees no path while every place is hidden');
  town.arrive(m, 't1');
  const seen = town.links(m, false).map((l) => l.join('-')).sort().join();
  ok(seen === 't1-t2,t1-t3', 'arriving at the entrance shows the paths to the places it reveals');
  const wm = { nodes: [{ id: 'w1', name: 'Millbrook', settlement: true }] };
  T.share = 'w1';
  const tv = town.viewFor(T, wm, { role: 'screen' }, []);
  ok(tv.share?.name === 'Millbrook' && tv.share.nodes.length === 3 && tv.share.links.length === 2, 'a shared town map reaches the TV with discovered places and their paths only');
  T.on = true; T.at = 'w1';
  ok(town.viewFor(T, wm, { role: 'screen' }, []).share === null, 'a visit replaces the shared map');
}

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const names = ['Ash', 'Bram', 'Cid', 'Dara', 'Eli'];
  for (const n of names) await h.player(room, n, 'Fighter');
  await h.until(() => dm.last?.players?.length === names.length);

  // Setting the grid puts the party on it, towards the left, each within 1 to 3 tiles of the others.
  dm.emit('dm:mode', { mode: 'combat' });
  dm.emit('dm:map', { cols: 20, rows: 12 });
  ok(await h.until(() => dm.last.map && dm.last.players.every((p) => dm.last.tokens?.[p.id])), 'setting the grid places every party member');
  const toks = dm.last.players.map((p) => dm.last.tokens[p.id]);
  ok(toks.every((t) => t.x <= 5), 'the party stands towards the left');
  ok(new Set(toks.map((t) => `${t.x},${t.y}`)).size === toks.length, 'no two party members share a tile');
  const far = Math.max(...toks.flatMap((a) => toks.map((b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)))));
  ok(far <= 3, `the group is tight: everyone within 3 tiles of everyone (widest gap ${far})`);
  const before = JSON.stringify(dm.last.tokens);
  dm.emit('dm:map', { cols: 20, rows: 12 });
  await h.wait(200);
  ok(JSON.stringify(dm.last.tokens) === before, 'setting the grid again leaves placed tokens where they are');
  dm.emit('dm:combat:end');
  dm.emit('dm:mode', { mode: 'exploration' });

  // Travel takes over the TV, then gives it back 3 s after arriving.
  await h.call(dm, 'dm:worldmap:clear');
  const a = await h.call(dm, 'dm:worldmap:node', { name: 'Here', x: 0.2, y: 0.2 });
  const b = await h.call(dm, 'dm:worldmap:node', { name: 'There', x: 0.6, y: 0.6 });
  await h.call(dm, 'dm:worldmap:timing', { legSeconds: 5 });
  await h.call(dm, 'dm:worldmap:go', { node: a.id });
  await h.until(() => dm.last.worldMap.here === a.id && !dm.last.worldMap.travel, 7000);
  await h.until(() => dm.last.worldMap.onTv === false, 5000);
  dm.emit('dm:worldmap:show', { on: false });
  await h.until(() => dm.last.worldMap.onTv === false);
  await h.call(dm, 'dm:worldmap:go', { node: b.id });
  ok(await h.until(() => dm.last.worldMap.travel && dm.last.worldMap.onTv === true), 'setting off puts the world map on the TV');
  ok(await h.until(() => dm.last.worldMap.here === b.id && !dm.last.worldMap.travel, 7000), 'the party arrives');
  const arrived = Date.now();
  await h.wait(1500);
  ok(dm.last.worldMap.onTv === true, 'the map lingers after arriving');
  ok(await h.until(() => dm.last.worldMap.onTv === false, 4000), 'then the TV goes back to what it showed before');
  ok(Date.now() - arrived >= 2500, 'after about 3 seconds');

  // Sharing a town map puts it on the TV over the world map.
  const tw = await h.call(dm, 'dm:worldmap:node', { name: 'Burg', x: 0.4, y: 0.4, settlement: true });
  ok((await h.call(dm, 'dm:town:share', { at: tw.id, on: true }))?.ok, 'the DM shares a town map');
  ok(await h.until(() => dm.last.town.share?.at === tw.id && dm.last.worldMap.onTv === true), 'the shared town map is on the TV');
  await h.call(dm, 'dm:town:share', { at: tw.id, on: false });
  ok(await h.until(() => dm.last.town.share === null), 'and the DM takes it down');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
