// Phase 28: faction reputation. Tiers, DM-only numbers, mood follows the NPC's faction, shop prices follow the tier.
const factions = require('../src/factions');
const { harness } = require('./helpers');
const h = harness('factions');
const { ok, until } = h;

// Tiers (pure)
ok(factions.tierOf(0).id === 'neutral' && factions.tierOf(-14).id === 'neutral', 'the middle band is neutral');
ok(factions.tierOf(15).id === 'friendly' && factions.tierOf(50).id === 'allied' && factions.tierOf(100).id === 'allied', 'friendly from 15, allied from 50');
ok(factions.tierOf(-49).id === 'unfriendly' && factions.tierOf(-50).id === 'hostile', 'unfriendly to -49, hostile at -50');
ok(factions.clampRep(999) === 100 && factions.clampRep(-999) === -100 && factions.clampRep('x') === 0, 'reputation stays within -100..100');

(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);

  // Setup: a faction, a shop that belongs to it, and an NPC that belongs to it.
  const f = await h.call(dm, 'dm:faction:add', { name: 'Thieves’ Guild', rep: 0 });
  ok(f.ok && f.id, 'DM adds a faction');
  const dup = await h.call(dm, 'dm:faction:add', { name: 'thieves’ guild' });
  ok(dup.error, 'duplicate faction names are refused');
  const fid = f.id;
  ok(await until(() => a.last.factions?.length === 1 && a.last.factions[0].label === 'Neutral'), 'phones see the faction tier');
  ok(!('rep' in a.last.factions[0]), 'phones never see the reputation number');
  ok(dm.last.factions[0].rep === 0, 'the DM sees the number');

  const imp = await h.call(dm, 'dm:shop:import', { name: 'Back room', npc: 'Scab', faction: fid, text: 'Lockpicks,10 gp,5,\n' });
  ok(imp.ok, 'DM imports a shop tied to the faction');
  const sid = imp.id;
  dm.emit('dm:sheet', { id: a.me.id, gold: 20 });
  ok(await until(() => a.last.players.find((p) => p.id === a.me.id).gold === 20), 'gold is set');

  // Neutral: list price.
  ok(a.last.shops[0].items[0].price === 10 && a.last.shops[0].standing === 'Neutral', 'neutral standing charges the list price');

  // Allied (+60): 15% off, mood follows once the NPC is linked.
  dm.emit('dm:npc', { faction: fid });
  dm.emit('dm:faction:shift', { id: fid, delta: 60 });
  ok(await until(() => a.last.shops[0].items[0].price === 8.5 && a.last.shops[0].standing === 'Allied'), 'allied standing takes 15% off the phone price');
  ok(await until(() => dm.last.social.npc.emotion === 'happy'), 'an allied NPC is happy');
  const buy1 = await h.call(a, 'player:buy', { shopId: sid, itemId: `${sid}-1`, qty: 2 });
  ok(buy1.ok && buy1.gold === 3, 'buying two at the allied price costs 17 gp');

  // Down to hostile (-100): NPC mood turns, prices rise 50%.
  dm.emit('dm:faction:shift', { id: fid, delta: -100 });
  dm.emit('dm:faction:shift', { id: fid, delta: -100 });
  ok(await until(() => dm.last.factions[0].tier === 'hostile'), 'two steps down reach hostile');
  ok(await until(() => dm.last.social.npc.emotion === 'angry' && dm.last.social.line.emotion === 'angry'), 'a hostile faction makes its NPC angry, on the line too');
  ok(await until(() => a.last.shops[0].items[0].price === 15), 'hostile standing charges 50% more');
  const buy2 = await h.call(a, 'player:buy', { shopId: sid, itemId: `${sid}-1`, qty: 1 });
  ok(buy2.error && /Not enough gold/.test(buy2.error), 'the buy price uses the same multiplier: 15 gp, only 3 gp left');

  // Log: a tier change is written to the DM's log.
  ok(dm.last.log.some((l) => /turns hostile/i.test(l.text) || /hostile/i.test(l.text)), 'a tier change is logged');

  // Removing the faction clears the links and restores list prices.
  dm.emit('dm:faction:remove', { id: fid });
  ok(await until(() => a.last.factions.length === 0), 'the faction is removed');
  ok(await until(() => a.last.shops[0].items[0].price === 10 && !a.last.shops[0].standing), 'shops without a faction charge list price');
  ok(await until(() => dm.last.social.npc.faction === null), 'the NPC loses its faction');

  // Persistence: factions survive a restart.
  dm.emit('dm:shop:faction', { id: sid, faction: null });
  const f2 = await h.call(dm, 'dm:faction:add', { name: 'Harbor Council', rep: 20 });
  ok(f2.ok, 'a second faction');
  await h.wait(500);
  const fs = require('fs');
  const path = require('path');
  const saved = JSON.parse(fs.readFileSync(path.join(h.TMP, 'data', 'campaign.json'), 'utf8'));
  ok(saved.factions?.length === 1 && saved.factions[0].name === 'Harbor Council' && saved.factions[0].rep === 20, 'factions are saved with the campaign');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
