// Phase G: world map. Pure rules (votes, travel, cards, veto, lore) and what each viewer may see.
const wm = require('../src/worldmap');
const { harness } = require('./helpers');
const h = harness('worldmap');
const { ok } = h;

let seq = 0;
const logs = [];
const ctx = (now, seated = 3, random = () => 0) => ({ now, seated, nextId: () => ++seq, log: (k, t) => logs.push(t), random });

// Map with three places and a short leg so the tests can step the clock.
const map = wm.fresh();
map.legSeconds = 60;
map.cardSeconds = 20;
const c0 = ctx(0);
wm.saveNode(map, { name: 'Oakhollow', x: 0.2, y: 0.2, info: 'A hamlet of woodcutters.', revealed: false }, c0);
wm.saveNode(map, { name: 'Mill', x: 0.6, y: 0.4, info: 'Old mill, the wheel is broken.', revealed: true }, c0);
wm.saveNode(map, { name: 'Ruin', x: 0.8, y: 0.8, info: 'Secret entrance under the altar.', revealed: false }, c0);
const [oak, mill, ruin] = map.nodes.map((n) => n.id);

// Places and reveal
const first = map.nodes[0].id;
wm.saveNode(map, { id: first, x: 2, y: -1 }, c0);
ok(map.nodes[0].x === 1 && map.nodes[0].y === 0, 'coordinates are clamped to the picture');
wm.saveNode(map, { id: first, name: '' }, c0);
ok(map.nodes[0].name === 'Oakhollow', 'an empty name keeps the old one');

// Votes: a strict majority of the seated party sends the party; a tie does not
ok(wm.startVote(map, [oak, mill, ruin], ctx(1)) === true, 'DM opens a vote with three candidates');
ok(wm.castVote(map, 'a', mill, ctx(2, 3)) && map.travel === null, 'one of three votes is not a majority');
ok(wm.castVote(map, 'b', mill, ctx(3, 3)) && map.travel?.to === mill, 'two of three seated characters is a majority: the party goes');
ok(map.vote.open === false && map.vote.result === mill, 'the vote closes with its result');
ok(!wm.castVote(map, 'c', oak, ctx(4, 3)), 'no vote once the vote is closed');

// Travel: slow, token glides, arrives at the end of the leg, cards come up on the way
const t0 = 10000;
const map2 = wm.fresh();
wm.saveNode(map2, { name: 'A', x: 0, y: 0 }, c0); wm.saveNode(map2, { name: 'B', x: 1, y: 1 }, c0);
const [a, b] = map2.nodes.map((n) => n.id);
map2.here = a; // the party starts at A
wm.go(map2, b, ctx(t0));
ok(map2.travel && map2.here === a, 'the party sets out from A; it has not arrived yet');
ok(wm.tick(map2, ctx(t0 + 30000)) === true && map2.here === a, 'mid-leg: no arrival');
const mid = wm.posAt(map2, t0 + 30000);
ok(Math.abs(mid.x - 0.5) < 0.01 && Math.abs(mid.y - 0.5) < 0.01, 'the token is halfway along the line');
ok(map2.cards.length === 1, 'a flavour card comes up during travel (every 20 s)');
wm.tick(map2, ctx(t0 + 60000));
ok(map2.here === b && map2.travel === null, 'the party arrives at the end of the leg');
ok(map2.cards.length === 2, 'cards came up along the way, not after arrival');

// DM override mid-leg starts from where the token is
wm.go(map2, a, ctx(t0 + 100000)); // back toward A
wm.go(map2, b, ctx(t0 + 130000)); // rerouted to B: the token is between A and B now
ok(wm.posAt(map2, t0 + 130000) && map2.travel.fromPt.x > 0 && map2.travel.fromPt.x < 1, 'an override keeps the token where it is mid-leg');
ok(wm.go(map2, b, ctx(t0 + 131000)) === false, 'going to the place already travelled to is refused');

// Tie leaves it to the DM; DM override wins
const map3 = wm.fresh();
wm.saveNode(map3, { name: 'X', x: 0, y: 0 }, c0); wm.saveNode(map3, { name: 'Y', x: 1, y: 1 }, c0);
const [x, y] = map3.nodes.map((n) => n.id);
wm.startVote(map3, [x, y], ctx(1));
wm.castVote(map3, 'a', x, ctx(2, 4)); wm.castVote(map3, 'b', y, ctx(3, 4));
wm.closeVote(map3, ctx(4));
ok(map3.vote.result === 'tie' && map3.travel === null, 'a tied vote does not move the party');
ok(wm.go(map3, x, ctx(5)) && map3.travel.to === x, 'the DM overrides a tie');

// Cards: DM deck first, then the table; table entries can be switched off; vetoes hide from players
const map4 = wm.fresh();
map4.table = [{ id: 't1', text: 'Only this one', weight: 1, on: true }, { id: 't2', text: 'Switched off', weight: 1, on: false }];
wm.addDeck(map4, { text: 'A cart with a broken axle', lore: 'The axle was cut, not broken.' }, ctx(1));
const deckCard = wm.drawNow(map4, ctx(2)) && map4.cards[0];
ok(deckCard.text === 'A cart with a broken axle' && deckCard.source === 'dm', 'the DM deck is drawn first');
wm.drawNow(map4, ctx(3));
ok(map4.cards[0].text === 'Only this one' && map4.cards[0].source === 'table', 'then the table, skipping switched-off entries');
wm.saveTable(map4, { id: 't1', on: false }, ctx(4));
ok(wm.drawNow(map4, ctx(5)) === false, 'with every table entry off, nothing is drawn');
wm.vetoCard(map4, map4.cards[0].id, true);
ok(map4.cards[0].vetoed === true, 'the DM can veto a card after it shows');
const seen = wm.viewFor(map4, { role: 'screen' }, 3);
ok(seen.cards.length === 1 && seen.cards[0].text === 'A cart with a broken axle', 'vetoed cards leave the TV and phones');
const dmSees = wm.viewFor(map4, { role: 'dm' }, 3);
ok(dmSees.cards.length === 2 && dmSees.cards[0].vetoed, 'the DM still sees the vetoed card, flagged');

// Lore: hidden until the DM reveals it
const lore0 = seen.cards.find((c) => c.text.startsWith('A cart'));
ok(lore0.lore === null && lore0.hasLore === true, 'lore is hidden from the table until revealed');
wm.revealLore(map4, deckCard.id, true);
ok(wm.viewFor(map4, { role: 'dm' }, 3).cards.find((c) => c.id === deckCard.id).lore === 'The axle was cut, not broken.', 'the DM reads the lore');
ok(wm.viewFor(map4, { role: 'screen' }, 3).cards[0].lore === 'The axle was cut, not broken.', 'once revealed, the lore reaches the TV');

// Comments: phones only, on a visible card
wm.vetoCard(map4, deckCard.id, false);
ok(wm.comment(map4, deckCard.id, 'p1', 'Thorn', 'That cloud is definitely bread.', ctx(9)), 'a phone comments on a card');
ok(!wm.comment(map4, 'nope', 'p1', 'Thorn', 'hi', ctx(9)), 'comments on an unknown card are refused');
ok(wm.viewFor(map4, { role: 'player', charId: 'p2' }, 3).cards[0].comments[0].charId === undefined, 'comments do not expose the character id');

// Secrets: info is DM-only until revealed; votes show counts, not names; deck and table are DM-only
const map5 = map;
const player = wm.viewFor(map5, { role: 'player', charId: 'a' }, 3);
const info = Object.fromEntries(player.nodes.map((n) => [n.name, n.info]));
ok(info.Oakhollow === null && info.Mill === 'Old mill, the wheel is broken.', 'a phone sees revealed info only');
ok(player.vote.votes === undefined && player.vote.counts.length === player.vote.candidates.length, 'a phone sees vote counts, not who voted');
ok(player.vote.needed === 2 && player.vote.mine === mill, 'a phone sees its own vote and how many it needs');
ok(player.deck === undefined && player.table === undefined, 'the deck and the table are DM-only');
const dmView = wm.viewFor(map5, { role: 'dm' }, 3);
ok(dmView.nodes[0].info === 'A hamlet of woodcutters.' && dmView.deck && dmView.table, 'the DM sees everything');

// Removing a place cancels travel to it, clears here, and drops it from votes
const map6 = wm.fresh();
wm.saveNode(map6, { name: 'P', x: 0.1, y: 0.1 }, c0); wm.saveNode(map6, { name: 'Q', x: 0.9, y: 0.9 }, c0);
const [p, q] = map6.nodes.map((n) => n.id);
wm.go(map6, p, ctx(1));
wm.removeNode(map6, p);
ok(map6.travel === null && map6.nodes.length === 1, 'removing the destination cancels the trip');

// Timing limits
wm.setTiming(map6, { legSeconds: 1, cardSeconds: 9999 });
ok(map6.legSeconds === 5 && map6.cardSeconds === 600, 'leg and card timers are clamped');

// Server: the DM edits the map, a phone votes, a phone sees only what it should
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a1 = await h.player(room, 'Thorn', 'Fighter');
  const a2 = await h.player(room, 'Lyra', 'Cleric');
  await h.until(() => a2.last && a2.last.players.length === 2);
  const n1 = await h.call(dm, 'dm:worldmap:node', { name: 'Hollow', x: 0.3, y: 0.3, info: 'Secret cellar below the inn.', revealed: false });
  const n2 = await h.call(dm, 'dm:worldmap:node', { name: 'Keep', x: 0.7, y: 0.6, info: 'The keep gate is open.', revealed: true });
  ok(n1.id && n2.id, 'DM places two places on the map');
  ok(!(await h.call(a1, 'dm:worldmap:node', { name: 'Cheat', x: 0, y: 0 }))?.id, 'a phone cannot place a place');
  await h.until(() => a1.last?.worldMap?.nodes?.length === 2);
  ok(a1.last.worldMap.nodes.find((n) => n.id === n1.id).info === null, 'the phone does not see unrevealed info');
  ok(a1.last.worldMap.nodes.find((n) => n.id === n2.id).info === 'The keep gate is open.', 'the phone sees revealed info');
  dm.emit('dm:worldmap:vote:start', { candidates: [n1.id, n2.id] });
  await h.until(() => a1.last.worldMap.vote?.open);
  a1.emit('player:worldmap:vote', { node: n1.id });
  a2.emit('player:worldmap:vote', { node: n1.id });
  ok(await h.until(() => a1.last.worldMap.travel?.to === n1.id), 'two of two seated characters send the party');
  dm.emit('dm:worldmap:go', { node: n2.id });
  ok(await h.until(() => a1.last.worldMap.travel?.to === n2.id), 'the DM override sends the party elsewhere');
  a1.emit('player:worldmap:comment', { card: 'nope', text: 'hi' });
  dm.emit('dm:worldmap:show', { on: true });
  ok(await h.until(() => a1.last.worldMap.onTv === true), 'the DM can put the world map on the TV');
  dm.emit('dm:worldmap:table:set', { text: 'A bird that sings in reverse.', weight: 2, on: true });
  await h.until(() => dm.last.worldMap.table.some((e) => e.text.startsWith('A bird')));
  ok(!('deck' in a1.last.worldMap) && dm.last.worldMap.deck, 'the phone has no deck, the DM does');
  ok(dm.last.worldMap.travel?.to === n2.id, 'DM state shows the trip');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
