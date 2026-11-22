// Nov 21 batch: Story Nodes Graph (with choice echoes), "Received 'Item'" toast, TV shop trade counter and coin sound.
const { harness } = require('./helpers');
const graph = require('../src/storygraph');
const h = harness('nov21');
const { ok, until } = h;

// Pure graph logic
const g = graph.fresh();
const a1 = graph.add(g, { kind: 'hook', title: 'Missing brother' });
const b1 = graph.add(g, { kind: 'npc', title: 'Old Greer' });
ok(a1.id && b1.id && a1.x >= 0 && a1.x <= graph.W && Math.abs(a1.x - b1.x) + Math.abs(a1.y - b1.y) > 50, 'nodes land on free spots on the board');
ok(graph.add(g, { title: '  ' }).error, 'a node needs a title');
ok(graph.add(g, { kind: 'dragon', title: 'x' }).kind === 'hook', 'an unknown kind falls back to a plot hook');
const l1 = graph.link(g, { a: a1.id, b: b1.id, label: 'knows' });
ok(l1.id && graph.link(g, { a: b1.id, b: a1.id }).id === l1.id && g.links.length === 1, 'one link per pair, either way round');
ok(graph.link(g, { a: a1.id, b: a1.id }).error, 'a node cannot link to itself');
graph.edit(g, { id: a1.id, x: 5000, y: -3 });
ok(a1.x === graph.W && a1.y === 0, 'moves are kept on the board');
graph.remove(g, b1.id);
ok(!g.links.length, 'removing a node removes its links');
const s0 = { tv: { echoes: [{ id: 'e9', decision: 'Spared the goblin', consequence: 'It returns', left: 2 }] } };
ok(graph.sync(s0) && s0.storyGraph.nodes[0].echoId === 'e9' && s0.storyGraph.nodes[0].kind === 'echo', 'an echo planted elsewhere gets a node');
s0.tv.echoes = [];
graph.sync(s0);
ok(s0.storyGraph.nodes[0].done === true, 'when its echo has gone, the node is marked done');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const p = await h.player(room, 'Thorn', 'Fighter');
  const tv = await h.client();
  tv.emit('screen:hello');
  await until(() => dm.last?.players.length === 1 && p.last?.players.length === 1);

  // ----- Story Nodes Graph -----
  const n1 = await h.call(dm, 'dm:graph:add', { kind: 'hook', title: "Thorn's missing brother", pc: p.me.id });
  ok(n1.ok && n1.node.pc === p.me.id, 'the DM adds a plot hook for a PC');
  const e1 = await h.call(dm, 'dm:graph:echo', { decision: 'Spared the goblin', consequence: 'It returns with friends', after: 2, from: n1.node.id });
  ok(e1.ok && e1.node.kind === 'echo' && e1.node.echoId, 'a choice echo is planted as a node');
  ok(await until(() => dm.last.tv.echoes.some((e) => e.id === e1.node.echoId) && dm.last.storyGraph.links.length === 1), 'the echo is planted and linked to the hook');
  ok((await h.call(dm, 'dm:graph:echo', { decision: 'x', consequence: '', after: 2 })).error, 'an echo needs what comes back');
  ok(!('storyGraph' in p.last) && !('storyGraph' in tv.last), 'phones and the TV never get the graph (DM only)');
  const pl = await h.call(p, 'dm:graph:add', { title: 'hack' });
  ok(pl?.error && dm.last.storyGraph.nodes.length === 2, 'a phone cannot add nodes');
  ok((await h.call(dm, 'dm:graph:fire', { id: e1.node.id })).ok, 'Fire now');
  ok(await until(() => dm.last.tv.echo?.decision === 'Spared the goblin' && dm.last.storyGraph.nodes.find((n) => n.id === e1.node.id)?.done), 'the echo shows on the TV and its node is done');
  const e2 = await h.call(dm, 'dm:graph:echo', { decision: 'Lied to the mayor', consequence: 'The guard knows', after: 5 });
  await h.call(dm, 'dm:graph:remove', { id: e2.node.id });
  ok(await until(() => !dm.last.tv.echoes.some((e) => e.id === e2.node.echoId)), 'removing an echo node cancels the echo');
  dm.emit('dm:tv:echo:plant', { decision: 'Old way', consequence: 'Still works', after: 3 });
  ok(await until(() => dm.last.storyGraph.nodes.some((n) => n.kind === 'echo' && n.title === 'Old way')), 'an echo planted the old way shows up on the graph');

  // ----- "Received 'Item'" -----
  const got = [];
  p.on('item:received', (m) => got.push(m));
  dm.emit('dm:sheet', { id: p.me.id, inv: { op: 'add', name: 'Rope', qty: 2, note: '' } });
  ok(await until(() => got.some((m) => m.items[0].name === 'Rope' && m.items[0].qty === 2)), "the phone hears Received 'Rope' when the DM gives it");
  const rope = (await until(() => p.last.players[0].inventory?.find((i) => i.name === 'Rope')));
  const before = got.length;
  dm.emit('dm:sheet', { id: p.me.id, inv: { op: 'set', id: rope.id, qty: 1 } });
  await until(() => p.last.players[0].inventory.find((i) => i.name === 'Rope').qty === 1);
  await h.wait(150); // nothing should arrive: taking an item back is not a gift
  ok(got.length === before, 'taking an item back sends no toast');
  dm.emit('dm:item:samples');
  const lib = await (await fetch(`${h.URL}/api/items`)).json();
  const card = (lib.items || lib)[0];
  if (card) {
    const r = await h.call(dm, 'dm:item:give', { id: card.id, to: [p.me.id], qty: 1 });
    ok(r.ok && await until(() => got.some((m) => m.items.some((i) => i.name === card.name))), 'an item card given by the DM sends the toast too');
  } else ok(false, 'sample item cards exist');

  // ----- shop pop-up trades -----
  const shop = dm.last.shops.find((x) => x.name === "Greer's Trinkets");
  dm.emit('dm:shop:pop', { id: shop.id });
  await until(() => tv.last.shopPop?.shopId === shop.id);
  ok(tv.last.shopPop.trade === null, 'no trade yet');
  dm.emit('dm:sheet', { id: p.me.id, gold: 500 });
  await until(() => p.last.players[0].gold === 500);
  const sfx = [];
  tv.on('sfx', (m) => sfx.push(m));
  const buy = await h.call(p, 'player:buy', { shopId: shop.id, itemId: shop.items[0].id, qty: 1 });
  ok(buy.ok && await until(() => tv.last.shopPop?.trade?.n === 1 && tv.last.shopPop.trade.kind === 'buy'), 'a buy counts as a trade on the TV');
  ok(await until(() => sfx.some((m) => m.builtin === 'coin')), 'a coin sound plays on a trade');
  const inv = p.last.players[0].inventory.find((i) => i.name === shop.items[0].name);
  const sell = await h.call(p, 'player:sell', { shopId: shop.id, invId: inv.id, qty: 1 });
  ok(sell.ok && await until(() => tv.last.shopPop?.trade?.n === 2 && tv.last.shopPop.trade.kind === 'sell'), 'a sell counts too');
  ok(!JSON.stringify(tv.last.shopPop).includes('Thorn'), 'the TV is not told who traded');
  await h.done(srv);
})();
