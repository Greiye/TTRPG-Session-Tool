// Phase 27: NPC shops. Parsing CSV and Markdown lists, buying with gold (private), stock, closed shops, persistence.
const fs = require('fs');
const path = require('path');
const { harness } = require('./helpers');
const shops = require('../src/shops');
const h = harness('shops');
const { ok, until } = h;

// Parsing (pure)
const csv = shops.parseList('Name,Price,Stock,Note\nRope (50 ft),1 gp,10,\n"Healing potion, greater",50,,"Red, sealed"\nTorch,2 cp,,\nBroken,??,1,\n');
ok(csv.items.length === 3 && csv.items[1].name === 'Healing potion, greater' && csv.items[1].note === 'Red, sealed', 'CSV with a header, quotes and commas in names');
ok(csv.items[0].stock === 10 && csv.items[1].stock === null && csv.items[2].price === 0.02, 'blank stock is unlimited; cp converts to gold');
ok(csv.skipped.length === 1 && /Broken/.test(csv.skipped[0]), 'rows without a readable price are skipped and reported');
const md = shops.parseList('## Mirela\n| Item | Cost | Stock |\n|---|---|---|\n| Dagger | 2 gp | 3 |\n| Shield | 10 | |\n');
ok(md.items.length === 2 && md.items[0].price === 2 && md.items[0].stock === 3 && md.items[1].stock === null, 'Markdown table with a header and separator row');
const bare = shops.parseList('Dagger;2 sp;4');
ok(bare.items[0].price === 0.2 && bare.items[0].stock === 4, 'no header: name, price, stock by position; semicolons work');
ok(shops.create({ text: 'nothing here' }, 's1').error, 'an empty list is refused');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Lyra', 'Wizard');
  await until(() => a.last?.players.length === 2 && b.last?.players.length === 2);

  const imp = await h.call(dm, 'dm:shop:import', { name: 'Mirela’s stall', npc: 'Mirela', text: 'Rope,1 gp,2,\nPotion of healing,50 gp,1,Red\nBig crate,100,0,\n' });
  ok(imp.ok && imp.items === 3, 'DM imports a price list');
  const sid = imp.id;
  const rope = (s) => s.shops.find((x) => x.id === sid).items.find((i) => i.name === 'Rope');
  ok(await until(() => a.last.shops.length === 1 && a.last.shops[0].items.length === 3), 'phones see the open shop and its prices');
  ok(!('skipped' in a.last.shops[0]) && !('skipped' in b.last), 'phones do not see the import notes');

  // Gold is private: the DM sets it, the owner sees it, others do not.
  const buy0 = await h.call(a, 'player:buy', { shopId: sid, itemId: rope(a.last).id, qty: 1 });
  ok(buy0.error && /Not enough gold/.test(buy0.error), 'no gold, no purchase');
  dm.emit('dm:sheet', { id: a.me.id, gold: 20 });
  ok(await until(() => a.last.players.find((p) => p.id === a.me.id).gold === 20), 'DM sets gold; the owner sees it');
  ok(!('gold' in b.last.players.find((p) => p.id === a.me.id)), 'other players do not see anyone else’s gold');

  // Buying: gold, stock and inventory all move together.
  const r1 = await h.call(a, 'player:buy', { shopId: sid, itemId: rope(a.last).id, qty: 2 });
  ok(r1.ok && r1.gold === 18, 'buying two ropes at 1 gp each leaves 18 gp');
  ok(await until(() => a.last.players.find((p) => p.id === a.me.id).inventory?.some((i) => i.name === 'Rope' && i.qty === 2)), 'the rope lands in the pack');
  ok(await until(() => rope(a.last).stock === 0), 'stock drops to 0');
  const r2 = await h.call(a, 'player:buy', { shopId: sid, itemId: rope(a.last).id, qty: 1 });
  ok(r2.error && /Sold out/.test(r2.error), 'sold-out items are refused');
  const r3 = await h.call(a, 'player:buy', { shopId: sid, itemId: `${sid}-2`, qty: 1 });
  ok(r3.error && /Not enough gold/.test(r3.error), 'an item you cannot afford is refused');
  const r4 = await h.call(a, 'player:buy', { shopId: 'nope', itemId: 'x', qty: 1 });
  ok(r4.error, 'unknown shop is refused');

  // Closed shops: hidden from phones and refused at the counter.
  dm.emit('dm:shop:open', { id: sid, open: false });
  ok(await until(() => a.last.shops.length === 0), 'a closed shop disappears from phones');
  const r5 = await h.call(a, 'player:buy', { shopId: sid, itemId: `${sid}-1`, qty: 1 });
  ok(r5.error && /closed/.test(r5.error), 'closed shops refuse purchases');
  ok(dm.last.shops.find((x) => x.id === sid).open === false, 'the DM still sees the closed shop');

  // Persistence: shops survive a restart (campaign.json).
  await h.wait(500);
  const saved = JSON.parse(fs.readFileSync(path.join(h.TMP, 'data', 'campaign.json'), 'utf8'));
  ok(saved.shops?.[0]?.items?.length === 3 && saved.shops[0].open === false, 'shops are saved with the campaign');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
