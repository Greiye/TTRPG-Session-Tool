// Item cards, the Item Designer and test mode (Mike, Nov 18), over sockets.
const { harness } = require('./helpers');

const h = harness('items');
const { ok, until, call } = h;

(async () => {
  const srv = await h.boot({ TEST_MODE: '1' }); // test mode on, as on a fresh laptop
  const dm = await h.dm();
  await until(() => dm.last?.players);
  const test = dm.last.players.find((p) => p.name === '[Test] Brann');
  ok(dm.last.settings.testMode === true && !!test, 'test mode is on by default and seats one test player');
  ok(dm.last.players.length === 1, 'only one test player');
  ok(await until(() => dm.last.lib?.items >= 1), 'the item library has a version');

  const get = async () => (await fetch(`${h.URL}/api/items`, { headers: { 'x-dm-key': 'dmkey' } })).json();
  let lib = await get();
  ok(lib.length > 20 && lib.some((i) => i.name === 'Longsword' && i.kind === 'weapon' && i.props.length) && lib.some((i) => i.rarity === 'uncommon'), `sample items are there (${lib.length})`);

  // Item Designer
  ok((await call(dm, 'dm:item:save', { name: ' ' })).error, 'an item needs a name');
  const r = await call(dm, 'dm:item:save', { name: 'Lantern of the Deep', kind: 'wondrous', rarity: 'rare', value: '300 gp', note: 'The flame leans toward secrets.', props: [{ name: 'Charges', value: '3' }, { name: '', value: '' }], tags: 'light, Cursed', image: 'javascript:alert(1)' });
  ok(r.ok && r.item.id && r.item.props.length === 1 && r.item.tags.includes('cursed') && r.item.image === null, 'the designer saves a clean item');
  const r2 = await call(dm, 'dm:item:save', { ...r.item, rarity: 'nope', kind: 'nope', value: '350 gp' });
  ok(r2.item.id === r.item.id && r2.item.rarity === 'common' && r2.item.kind === 'other' && r2.item.value === '350 gp', 'saving again updates it, with unknown kinds and rarities made safe');
  await call(dm, 'dm:item:save', { ...r2.item, kind: 'wondrous', rarity: 'rare' });
  lib = await get();
  ok(lib.some((i) => i.id === r.item.id), 'the new item is in the library');

  // Give a card: a new pack entry with the card's icon, then one more of the same.
  const room = await h.room();
  const a = await h.player(room, 'Ash');
  await until(() => a.last?.players?.some((p) => p.id === a.me.id));
  ok((await call(dm, 'dm:item:give', { id: r.item.id, to: [] })).error, 'giving needs someone to give to');
  ok((await call(dm, 'dm:item:give', { id: 'nope', to: [a.me.id] })).error, 'giving needs a real item');
  ok((await call(dm, 'dm:item:give', { id: r.item.id, to: [a.me.id], qty: 2 })).ok, 'the DM gives a card');
  const pack = () => a.last.players.find((p) => p.id === a.me.id)?.inventory || [];
  ok(await until(() => pack().some((i) => i.name === 'Lantern of the Deep' && i.qty === 2 && i.icon === '✨' && i.rarity === 'rare')), 'the phone gets it with its icon and rarity');
  await call(dm, 'dm:item:give', { id: r.item.id, to: [a.me.id, test.id] });
  ok(await until(() => pack().find((i) => i.name === 'Lantern of the Deep')?.qty === 3), 'giving it again adds one to the same entry');
  ok(await until(() => dm.last.players.find((p) => p.id === test.id)?.inventory.some((i) => i.name === 'Lantern of the Deep')), 'one give can go to several characters');
  ok((await call(a, 'dm:item:give', { id: r.item.id, to: [a.me.id] })).error, 'a phone cannot give items');

  ok((await call(dm, 'dm:item:delete', { id: r.item.id })).ok && !(await get()).some((i) => i.id === r.item.id), 'the DM deletes an item');
  ok(pack().some((i) => i.name === 'Lantern of the Deep'), 'characters keep what they were given');

  // Test mode off takes the test player out of the party; on brings them back.
  dm.emit('dm:testmode', { on: false });
  ok(await until(() => dm.last.settings.testMode === false && !dm.last.players.some((p) => p.id === test.id)), 'test mode off takes the test player out');
  ok(dm.last.players.some((p) => p.id === a.me.id), 'real players stay');
  dm.emit('dm:testmode', { on: true });
  ok(await until(() => dm.last.players.some((p) => p.id === test.id)), 'test mode on seats them again');

  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
