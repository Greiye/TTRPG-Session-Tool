// Mike's Nov 18 batch, over sockets: the TV landing page, Group Map View, the party vote and gold removal,
// translated NPC lines.
const { harness } = require('./helpers');

const h = harness('nov18');
const { ok, until, call } = h;

(async () => {
  const srv = await h.boot({ LOBBY: '1' }); // the landing page is on, as on game night
  const dm = await h.dm();
  await until(() => dm.last?.worldMap);
  ok(dm.last.lobby === true, 'a fresh server opens the TV on the landing page');
  ok((await call(dm, 'lobby:start', {})).error, 'Start game waits for a player');

  const room = await h.room();
  const a = await h.player(room, 'Ash');
  const b = await h.player(room, 'Bram', 'Wizard');
  await until(() => dm.last.players.length === 2 && a.last?.lobbyStarter);
  ok(a.last.lobbyStarter === a.me.id, 'the first player to join holds Start game');
  ok((await call(b, 'lobby:start', {})).error, 'another player cannot start the game');
  ok((await call(a, 'lobby:start', {})).ok, 'the first player starts the game');
  ok(await until(() => dm.last.lobby === false && dm.last.mode === 'exploration' && dm.last.worldMap.onTv), 'the game opens on the world map');

  // Group Map View: everyone seated presses it, then the same vote closes the map.
  ok(await until(() => a.last.mapVote?.dir === 'close' && a.last.mapVote.total === 2), 'with the map up the phones vote to close it');
  ok((await call(a, 'player:mapview', { on: true })).ok, 'a phone presses Close Map');
  ok(await until(() => dm.last.mapVote.want === 1 && a.last.mapVote.mine && !b.last.mapVote.mine), 'the count shows 1 of 2 and only that phone is pressed');
  ok(dm.last.worldMap.onTv === true, 'one press is not enough');
  await call(a, 'player:mapview', { on: false });
  ok(await until(() => dm.last.mapVote.want === 0), 'pressing again takes the press back');
  await call(a, 'player:mapview', { on: true });
  const r = await call(b, 'player:mapview', { on: true });
  ok(r.done && (await until(() => dm.last.worldMap.onTv === false)), 'when everyone presses Close Map the TV goes back');
  ok(await until(() => dm.last.mapVote.dir === 'open' && dm.last.mapVote.want === 0), 'and the next vote is to open it, from zero');
  await call(a, 'player:mapview', { on: true });
  await call(b, 'player:mapview', { on: true });
  ok(await until(() => dm.last.worldMap.onTv === true), 'everyone pressing Group Map View puts the map on the TV');
  dm.emit('dm:mode', { mode: 'combat' });
  await until(() => dm.last.mode === 'combat');
  ok((await call(a, 'player:mapview', { on: true })).error && a.last.mapVote.blocked, 'no map vote during combat');
  dm.emit('dm:mode', { mode: 'social' });
  await until(() => dm.last.mode === 'social');

  // The party vote is gone; the DM still sets gold (Items tab).
  dm.emit('dm:vote:start', { options: ['Left', 'Right'] });
  await h.wait(120);
  ok(dm.last.vote === undefined, 'no party vote');
  dm.emit('dm:sheet', { id: a.me.id, gold: 42 });
  ok(await until(() => a.last.players.find((p) => p.id === a.me.id)?.gold === 42), 'the DM sets a character\'s gold');

  // Translated lines: the player who knows the tongue reads it, numbered so the phone notifies once.
  dm.emit('dm:sheet', { id: a.me.id, languages: ['Common', 'Gnollish'] });
  await until(() => dm.last.players.find((p) => p.id === a.me.id)?.languages?.includes('Gnollish'));
  dm.emit('dm:say', { text: 'The bridge will not hold three of you.', lang: 'Gnollish' });
  ok(await until(() => a.last.social.line?.lang === 'Gnollish' && b.last.social.line?.lang === 'Gnollish'), 'both phones get the line');
  const la = a.last.social.line; const lb = b.last.social.line;
  ok(!la.scrambled && la.text === 'The bridge will not hold three of you.' && la.n != null, 'the Gnollish speaker reads it, with a line number');
  ok(lb.scrambled && lb.text !== la.text && lb.n === la.n, 'the other phone sees glyphs');
  dm.emit('dm:say', { text: 'Again.', lang: 'Gnollish' });
  ok(await until(() => a.last.social.line.n > la.n), 'each line gets a new number');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
