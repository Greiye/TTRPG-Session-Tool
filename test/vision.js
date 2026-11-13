// Phase B: fog of war and light on the battle map, the TV weather setting, and the 3D dice tray setting.
const { harness } = require('./helpers');
const { visibleTiles, lineClear, LIGHTS } = require('../src/vision');
const h = harness('vision');
const { ok, until } = h;
(async () => {
  // Pure: a torch reveals its radius; a wall blocks the line behind it; darkvision reaches further.
  const map = { cols: 20, rows: 20, terrain: { '5,3': 'wall' } };
  const party = new Set(['a']);
  const v1 = visibleTiles(map, { a: { x: 2, y: 3, light: 'torch' } }, party);
  ok(v1.has('2,3') && v1.has('2,7') && !v1.has('2,8'), 'a torch reveals 4 tiles out (20 ft) and no further');
  ok(v1.has('5,3') && !v1.has('6,3'), 'a wall is seen at its edge, the tile behind it stays dark');
  const v2 = visibleTiles(map, { a: { x: 2, y: 3, light: 'none' } }, party);
  ok(v2.size === 1 && v2.has('2,3'), 'no light: only the token’s own tile');
  const v3 = visibleTiles(map, { a: { x: 0, y: 0, light: 'darkvision' } }, party);
  ok(v3.has('12,0') && !v3.has('13,0'), 'darkvision reaches 12 tiles (60 ft)');
  const v4 = visibleTiles(map, { e: { x: 0, y: 0, light: 'lantern' } }, party);
  ok(v4.size === 0, 'enemies with light do not reveal the map');
  ok(!lineClear(map.terrain, 3, 3, 7, 3) && lineClear(map.terrain, 3, 0, 3, 3), 'line of sight stops at a wall');
  ok(LIGHTS.torch === 4 && LIGHTS.lantern === 6 && LIGHTS.darkvision === 12, 'light radii match 20, 30 and 60 ft');

  // Socket: fog hides enemies outside the party's sight from phones and the TV, not from the DM.
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last.players.length === 1);
  dm.emit('dm:map', { cols: 10, rows: 8 });
  await until(() => dm.last.map?.cols === 10);
  dm.emit('dm:token', { id: a.me.id, x: 0, y: 0 });
  await until(() => dm.last.tokens[a.me.id]);
  dm.emit('dm:enemy:add', { name: 'Goblin', hp: 7, ac: 13, atk: 4, dmg: '1d6+2' });
  await until(() => dm.last.combat.enemies.length === 1);
  const gob = dm.last.combat.enemies[0];
  dm.emit('dm:token', { id: gob.id, x: 9, y: 7 });
  await until(() => dm.last.tokens[gob.id]);
  ok(a.last.mapVision === null, 'fog off by default: no vision set is sent');
  ok(await until(() => a.last.tokens[gob.id]), 'with fog off the phone sees every token');
  dm.emit('dm:fog', { on: true });
  ok(await until(() => dm.last.map.fog === true), 'DM turns fog of war on');
  ok(await until(() => Array.isArray(a.last.mapVision) && a.last.mapVision.includes('0,0')), 'phone gets the tiles Thorn can see');
  ok(!a.last.mapVision.includes('9,7'), 'the far corner is in the dark for the phone');
  ok(!a.last.tokens[gob.id], 'the goblin in the dark is not sent to the phone');
  ok(dm.last.tokens[gob.id], 'the DM still gets the goblin');
  dm.emit('dm:token:light', { id: a.me.id, light: 'lantern' });
  ok(await until(() => dm.last.tokens[a.me.id]?.light === 'lantern'), 'DM sets a lantern on Thorn');
  dm.emit('dm:token:light', { id: a.me.id, light: 'laser' });
  await new Promise((r) => setTimeout(r, 80));
  ok(dm.last.tokens[a.me.id]?.light === 'lantern', 'an unknown light is refused');
  dm.emit('dm:token', { id: a.me.id, x: 2, y: 2 });
  ok(await until(() => dm.last.tokens[a.me.id]?.light === 'lantern' && dm.last.tokens[a.me.id]?.x === 2), 'moving a token keeps its light');
  ok(await until(() => a.last.mapVision.includes('5,2')), 'the lantern widens what the phone sees');

  // Weather: the DM sets it; a bad kind is refused and the strength is kept within 1 to 3.
  dm.emit('dm:weather', { kind: 'storm', intensity: 3 });
  ok(await until(() => dm.last.weather?.kind === 'storm' && dm.last.weather.intensity === 3), 'DM sets a heavy storm');
  ok(await until(() => a.last.weather?.kind === 'storm'), 'the TV and phones get the weather');
  dm.emit('dm:weather', { kind: 'hail', intensity: 2 });
  dm.emit('dm:weather', { kind: 'rain', intensity: 9 });
  ok(await until(() => dm.last.weather?.kind === 'rain' && dm.last.weather.intensity === 3), 'an unknown kind is refused, strength is capped at 3');

  // Dice tray: the TV setting is on by default and the DM can turn it off.
  ok(dm.last.settings.display.dice === 'on', '3D dice tray is on by default');
  dm.emit('dm:settings', { display: { dice: 'off' } });
  ok(await until(() => dm.last.settings.display.dice === 'off'), 'DM turns the 3D dice tray off');
  dm.emit('dm:settings', { display: { dice: 'maybe' } });
  await new Promise((r) => setTimeout(r, 80));
  ok(dm.last.settings.display.dice === 'off', 'an unknown dice setting is ignored');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
