// DM screen notes (Nov 14): one TV pop-up at a time, the shop pop-up (buy, sell, who is still shopping),
// and the narrate posts kept under the scene description.
const { harness } = require('./helpers');
const h = harness('popups');
const { ok, until } = h;

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const tv = await h.client();
  tv.emit('screen:hello');
  const a = await h.player(room, 'Thorn', 'Fighter');
  const b = await h.player(room, 'Lyra', 'Wizard');
  await until(() => a.last?.players.length === 2 && tv.last);

  // One pop-up at a time: opening camp closes the relations web, and the other way round.
  dm.emit('dm:web:show', { on: true });
  ok(await until(() => tv.last.web?.showTv === true), 'the relations web goes up on the TV');
  dm.emit('dm:camp:open', { open: true });
  ok(await until(() => tv.last.camp?.open === true && tv.last.web.showTv === false), 'opening camp closes the relations web');
  dm.emit('dm:web:show', { on: true });
  ok(await until(() => tv.last.web.showTv === true && tv.last.camp.open === false), 'showing the web again closes camp');
  dm.emit('dm:legends:show', { view: 'hall' });
  ok(await until(() => tv.last.legendsShow === 'hall' && tv.last.web.showTv === false), 'the hall of fame closes the web');

  // Shop pop-up: the DM pops a closed shop; it opens for trade and everyone sees it.
  const imp = await h.call(dm, 'dm:shop:import', { name: 'Mirela’s stall', npc: 'Mirela', text: 'Rope,1 gp,2,\nDagger,2 gp,,\n' });
  const sid = imp.id;
  dm.emit('dm:shop:open', { id: sid, open: false });
  await until(() => !a.last.shops.some((x) => x.id === sid));
  dm.emit('dm:shop:pop', { id: sid });
  ok(await until(() => tv.last.shopPop?.shopId === sid && tv.last.legendsShow === null), 'the shop pops up on the TV and closes the hall of fame');
  ok(await until(() => a.last.shopPop?.shopId === sid && a.last.shops.some((x) => x.id === sid)), 'phones get the pop-up and the shop opens for trade');
  ok(tv.last.shopPop.shopping === 2, 'the TV counts two players still shopping');

  // Buy, then sell back at half price; selling something the shop does not list is refused.
  dm.emit('dm:sheet', { id: a.me.id, gold: 10 });
  await until(() => a.last.players.find((p) => p.id === a.me.id).gold === 10);
  const dagger = a.last.shops.find((x) => x.id === sid).items.find((i) => i.name === 'Dagger');
  ok((await h.call(a, 'player:buy', { shopId: sid, itemId: dagger.id, qty: 2 })).ok, 'a phone buys two daggers');
  ok(await until(() => a.last.shopPop.sell.length === 1 && a.last.shopPop.sell[0].offer === 1), 'the sell list offers half the price for the daggers');
  const inv = a.last.shopPop.sell[0];
  const sold = await h.call(a, 'player:sell', { shopId: sid, invId: inv.id, qty: 1 });
  ok(sold.ok && sold.gold === 7, 'selling one dagger pays 1 gp');
  ok(b.last.shopPop.sell.length === 0, 'another phone has nothing to sell here');
  const rope = a.last.shops.find((x) => x.id === sid).items.find((i) => i.name === 'Rope');
  const S = require('../src/shops');
  const shop = { name: 'Stall', open: true, items: [{ id: 'r', name: 'Rope', price: 1, stock: 2 }] };
  const pc = { gold: 0, inventory: [{ id: 'l', name: 'Lute', qty: 1 }] };
  ok(/does not buy/.test(S.sell(shop, pc, 'l', 1).error) && pc.inventory.length === 1 && shop.items[0].stock === 2, 'the shop does not buy what it does not sell, and nothing changes');
  ok(rope.stock === 2, 'buying daggers left the rope stock alone');

  // Done shopping: the TV count goes down; the DM closes the pop-up.
  a.emit('player:shop:done', { done: true });
  ok(await until(() => tv.last.shopPop.shopping === 1 && a.last.shopPop.mine === true), 'a phone says it is done; the TV shows one still shopping');
  dm.emit('dm:shop:pop', { id: null });
  ok(await until(() => tv.last.shopPop === null && a.last.shopPop === null), 'the DM closes the shop pop-up');

  // Narrate posts: kept under the scene description, the newest ten, cleared by a new place.
  for (let i = 1; i <= 12; i++) dm.emit('dm:narrate', { text: `Post ${i}` });
  ok(await until(() => tv.last.narration?.length === 10 && tv.last.narration[9].text === 'Post 12'), 'the scene keeps the newest ten narrate posts');
  ok(tv.last.narration[0].text === 'Post 3', 'the oldest posts drop off first');
  ok(tv.last.log.some((l) => l.kind === 'narrate' && l.text === 'Post 12'), 'narrate posts still go to the log');
  dm.emit('dm:scene', { title: 'The old mill', text: 'Dust.', theme: 'forest', poi: [] });
  ok(await until(() => tv.last.narration.length === 0), 'a new place starts with no narrate posts');

  await h.done(srv);
})();
