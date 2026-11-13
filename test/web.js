// Phase F: NPC and faction relationship web. DM edits, TV sees only what the DM revealed, as tiers.
const web = require('../src/web');
const { harness } = require('./helpers');
const h = harness('web');
const { ok, until } = h;

const fl = [{ id: 'f1', name: 'Thieves’ Guild', rep: -60 }];
let W = web.fresh();
ok(W.nodes.length === 1 && W.nodes[0].id === 'party' && W.nodes[0].revealed, 'the party is on the web and revealed from the start');
ok(web.addNode(W, { kind: 'faction', ref: 'nope' }, 'x', fl).error, 'a faction node needs a real faction');
const guild = web.addNode(W, { kind: 'faction', ref: 'f1' }, 'n1', fl).node;
ok(guild.name === 'Thieves’ Guild', 'a faction node takes the faction name');
ok(web.addNode(W, { kind: 'faction', ref: 'f1' }, 'n2', fl).error, 'a faction appears once');
const mirela = web.addNode(W, { kind: 'npc', name: 'Mirela' }, 'n3', fl).node;
ok(web.addEdge(W, { from: mirela.id, to: mirela.id, value: 0 }, 'e0').error, 'no link from a node to itself');
const link = web.addEdge(W, { from: mirela.id, to: 'party', value: -80, label: 'owes a debt' }, 'e1').edge;
ok(link.value === -80, 'a link keeps its value');
ok(web.addEdge(W, { from: mirela.id, to: 'party', value: 10 }, 'e2').error, 'one link per ordered pair');
ok(web.addEdge(W, { from: guild.id, to: mirela.id, value: 999 }, 'e3').edge.value === 100, 'values are clamped to -100..100');

// Nothing reaches the TV until the DM reveals it, and a link needs both ends revealed.
let tv = web.viewFor(W, { role: 'screen' }, fl);
ok(tv.nodes.length === 1 && tv.edges.length === 0, 'the TV sees only the party before any reveal');
ok(web.viewFor(W, { role: 'player', charId: 'a' }, fl) === null && web.viewFor(W, { role: 'guest' }, fl) === null, 'phones and guests see nothing of the web');
web.reveal(W, 'node', mirela.id, true);
web.reveal(W, 'node', 'party', true);
web.reveal(W, 'edge', link.id, true);
tv = web.viewFor(W, { role: 'screen' }, fl);
ok(tv.nodes.length === 2 && tv.edges.length === 1 && tv.edges[0].tierLabel === 'Hostile', 'a revealed link shows as a tier on the TV');
ok(!('value' in tv.edges[0]) && !('rep' in tv.edges[0]), 'the TV never sees the number');
ok(!tv.showTv, 'the TV stays off until the DM shows the web');
web.reveal(W, 'node', guild.id, false);
web.reveal(W, 'edge', link.id, true);
ok(web.viewFor(W, { role: 'screen' }, fl).edges.length === 1, 'a link to a hidden node stays hidden');
ok(web.viewFor(W, { role: 'dm' }, fl).edges[0].value === -80, 'the DM sees the number');
ok(web.reveal(W, 'node', 'party', false) === false, 'the party node cannot be hidden');
ok(web.setValue(W, link.id, 60) && web.viewFor(W, { role: 'dm' }, fl).edges[0].tierLabel === 'Allied', 'a value change moves the tier');

// Faction tiers follow the reputation list, and the DM sees the faction's number on its node.
ok(web.viewFor(W, { role: 'dm' }, fl).nodes.find((n) => n.id === guild.id).tierLabel === 'Hostile', 'a faction node shows its reputation tier');

// Removing a node takes its links with it; the party stays.
ok(web.remove(W, 'node', mirela.id) && !W.edges.some((e) => e.from === mirela.id || e.to === mirela.id), 'removing a node removes its links');
ok(!web.remove(W, 'node', 'party'), 'the party cannot be removed');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  const tvc = await h.client(); tvc.emit('screen:hello');
  await until(() => a.last && tvc.last);

  const f = await h.call(dm, 'dm:faction:add', { name: 'Harbour Watch', rep: 30 });
  ok(f.ok, 'a faction exists for the web');
  const n = await h.call(dm, 'dm:web:node', { kind: 'faction', ref: f.id });
  ok(n.ok && n.id, 'DM adds a faction node');
  const bad = await h.call(a, 'dm:web:node', { kind: 'npc', name: 'Sneak' });
  ok(!bad.ok && dm.last.web.nodes.every((x) => x.name !== 'Sneak'), 'a phone cannot edit the web');
  const m = await h.call(dm, 'dm:web:node', { kind: 'npc', name: 'Captain Ysolde' });
  const e = await h.call(dm, 'dm:web:edge', { from: m.id, to: n.id, value: 40, label: 'trusts' });
  ok(e.ok, 'DM links the captain to the watch');
  ok(await until(() => dm.last.web.edges.length === 1 && dm.last.web.edges[0].tierLabel === 'Friendly'), 'DM view carries the tier');
  ok(!('web' in a.last) || a.last.web === null, 'phones get no web');
  ok(tvc.last.web.nodes.length === 1 && tvc.last.web.edges.length === 0, 'the TV sees nothing until the DM reveals');

  dm.emit('dm:web:reveal', { kind: 'node', id: n.id, on: true });
  dm.emit('dm:web:reveal', { kind: 'node', id: m.id, on: true });
  dm.emit('dm:web:reveal', { kind: 'edge', id: e.id, on: true });
  ok(await until(() => tvc.last.web.edges.length === 1 && tvc.last.web.edges[0].tierLabel === 'Friendly'), 'a revealed link reaches the TV as a tier');
  ok(tvc.last.web.showTv === false, 'the web waits for the DM to show it');
  dm.emit('dm:web:show', { on: true });
  ok(await until(() => tvc.last.web.showTv === true), 'the DM turns the web on for the TV');
  dm.emit('dm:web:value', { id: e.id, value: -90 });
  ok(await until(() => tvc.last.web.edges[0].tierLabel === 'Hostile'), 'a value change updates the TV tier');
  dm.emit('dm:web:remove', { kind: 'node', id: n.id });
  ok(await until(() => tvc.last.web.edges.length === 0), 'removing a node hides its link on the TV');

  await h.done(srv);
})();
