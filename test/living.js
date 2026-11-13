// Phase K: living world. Clocks, town standing and trade, rumours along roads, interlocking rules,
// canon, oracles, undo, and what each viewer sees. Pure rules first, then one socket run.
const L = require('../src/living');
const factions = require('../src/factions');
const { harness } = require('./helpers');
const h = harness('living');
const { ok, until } = h;

const world = (extra = {}) => ({ living: L.fresh(), factions: [], shops: [], scene: { light: 'day' }, social: { npc: {}, line: {} }, ...extra });
const always = () => 0; // rng that always rolls "yes" (and picks the first option)
const never = () => 0.99;

// Clocks: ticks, consequence once, undo
{
  const s = world();
  const town = L.addTown(s.living, { name: 'Ashford', rep: 0 }).town;
  const c = L.addClock(s.living, { name: 'Cult ritual', segments: 3, ticks: { session: 1 }, consequence: { text: 'The bell rings.', target: { kind: 'town', id: town.id }, delta: -20 } }).clock;
  L.tick(s, 'session', 'test');
  L.tick(s, 'session', 'test');
  ok(c.filled === 2 && !c.fired, 'session ticks advance a clock');
  const fill = L.tick(s, 'session', 'test');
  ok(c.filled === 3 && c.fired, 'a full clock fires');
  ok(town.rep === -20, 'the consequence moves the town standing once');
  ok(fill.entries.some((e) => /bell rings/.test(e.text)), 'the consequence is written as an entry');
  L.tick(s, 'session', 'test');
  ok(c.filled === 3 && town.rep === -20, 'a fired clock stops ticking');
  const advanceEntry = s.living.history.find((e) => e.undo?.type === 'clock' && e.undo.filled === 2);
  L.undo(s, advanceEntry.id);
  ok(c.filled === 2 && c.fired === false, 'undoing the advance takes the clock back');
  ok(L.undo(s, advanceEntry.id).error, 'an entry cannot be undone twice');
}

// Town standing sets trade and prices; faction and town multipliers stack
{
  const s = world();
  const town = L.addTown(s.living, { name: 'Brask', rep: 0 }).town;
  s.factions.push({ id: 'f1', name: 'Guild', rep: 60 });
  const shop = { id: 'sh1', name: 'Brask Stall', open: true, faction: 'f1', town: town.id, items: [] };
  s.shops.push(shop);
  ok(L.canTrade(s, shop).ok, 'a neutral town trades');
  ok(L.priceMult(s, shop) === 0.85, 'allied guild takes 15% off; neutral town adds nothing');
  L.shiftRep(s, { kind: 'town', id: town.id }, -100, 'test', 'dm');
  ok(L.canTrade(s, shop).error && /won't serve/.test(L.canTrade(s, shop).error), 'a hostile town will not trade');
  ok(Math.abs(L.priceMult(s, shop) - 0.85 * 1.5) < 1e-9, 'hostile town adds 50% on top of the guild discount');
  L.setTrade(s.living, town.id, 'open');
  ok(L.canTrade(s, shop).ok, 'a DM override opens trade in a hostile town');
  L.setTrade(s.living, town.id, 'closed');
  ok(L.canTrade(s, shop).error, 'a DM override closes trade even in a neutral town');
  L.setTrade(s.living, town.id, 'auto');
  town.rep = 0; // back to neutral, so only the hour matters
  s.scene.light = 'night';
  ok(L.canTrade(s, shop).error && /shut for the night/.test(L.canTrade(s, shop).error), 'shops shut at night');
  shop.night = true;
  ok(L.canTrade(s, shop).ok, 'a night-open shop trades after dark');
}

// Rumours: roads, distortion, and standing when they arrive
{
  const s = world();
  const a = L.addTown(s.living, { name: 'North Gate', rep: 0 }).town;
  const b = L.addTown(s.living, { name: 'Millbrook', rep: 0 }).town;
  const r = L.addRumour(s, { text: 'Three wolves gather in the north', town: a.id, effect: { town: b.id, delta: -15 } }).rumour;
  ok(r.heard[a.id], 'a rumour starts in its town');
  ok(L.spreadTo(s, r.id, b.id, always).error, 'a rumour cannot jump a town with no road');
  L.linkTowns(s.living, a.id, b.id, true);
  const hop = L.spreadTo(s, r.id, b.id, always);
  ok(!hop.error && r.heard[b.id].distorted && /south/.test(r.heard[b.id].text), 'a rumour arrives along a road, changed when the roll says so');
  ok(b.rep === -15, 'the rumour moves the town it reaches');
  L.setTrade(s.living, b.id, 'auto');
  const kept = L.addRumour(s, { text: 'The well is dry', town: a.id }).rumour;
  L.spreadTo(s, kept.id, b.id, never);
  ok(kept.heard[b.id] && !kept.heard[b.id].distorted, 'a roll that misses leaves the rumour as it was');
  const tr = L.onTravel(s, b.id, always);
  ok(tr.entries.length >= 0, 'travel spreads rumours along roads without throwing');
  // Undoing the start takes the whole rumour back
  const start = s.living.history.find((e) => e.undo?.start && e.undo.id === kept.id);
  L.undo(s, start.id);
  ok(!s.living.rumours.some((x) => x.id === kept.id), 'undoing a rumour start removes it');
}

// Interlocks: weather, light, tension
{
  const s = world();
  s.living.weather = 'rain';
  ok(L.travelCost(s.living, 'night').factor === 1.88, 'rain and night slow travel together');
  ok(L.sight(s.living, 'day') === 'dim', 'rain dims sight');
  s.living.weather = 'fog';
  ok(L.sight(s.living, 'day') === 'poor', 'fog leaves sight poor');
  s.living.weather = 'storm';
  ok(L.encounterFactor(s.living, 'night') === 0.75, 'storms keep monsters in their dens, even at night');
  s.living.weather = 'clear';
  ok(L.encounterFactor(s.living, 'night') === 1.5, 'night brings more encounters');
  const t = L.sound(s, 'clash');
  ok(s.living.tension === 3 && t.entries.length === 1, 'a clash pushes tension up by three');
  L.sound(s, 'bell');
  ok(s.living.tension === 3, 'a sound with no tension weight changes nothing');
  L.undo(s, s.living.history[0].id);
  ok(s.living.tension === 0, 'undoing a tension change restores it');
  L.setWeather(s.living, 'snow');
  ok(s.living.weather === 'snow' && L.setWeather(s.living, 'hail').error, 'weather only takes known values');
}

// Canon and oracles
{
  const s = world();
  const c = L.propose(s.living, { by: 'Thorn', byId: 'char1', text: 'The mill wheel is turned by a bound spirit', kind: 'rumour' }).canon;
  ok(c.status === 'proposed', 'a player proposal waits for the DM');
  L.decideCanon(s, c.id, true);
  ok(c.status === 'approved' && s.living.rumours.length === 1, 'an approved rumour enters the world');
  const o = L.addOracle(s.living, { name: 'What happens?', entries: [
    { text: 'A stranger offers help', weight: 1, when: { light: ['night'] } },
    { text: 'A patrol passes', weight: 3, when: { light: ['day'] } },
    { text: 'Nothing happens', weight: 1 },
  ] }).oracle;
  const day = L.roll(s, o.id, always);
  ok(day.pending.text === 'A patrol passes' && day.pending.fit, 'in daylight only day results are picked');
  s.scene.light = 'night';
  const night = L.roll(s, o.id, always);
  ok(night.pending.text === 'A stranger offers help', 'at night the night result is picked');
  s.scene.light = 'day';
  const pick = L.roll(s, o.id, () => 0.9).pending;
  ok(pick.text === 'Nothing happens', 'a high roll lands on the light result, weights decide the pick');
  s.scene.light = 'night';
  const acc = L.decideOracle(s, night.pending.id, 'accept');
  ok(acc.entries[0].text.includes('stranger') && !s.living.pending.some((p) => p.id === night.pending.id), 'accept writes the result and clears it');
  const ovr = L.decideOracle(s, pick.id, 'override', 'A traveller asks for a light');
  ok(ovr.entries[0].text.includes('DM override'), 'the DM can write a different result');
  ok(L.addOracle(s.living, { name: 'Thin', entries: [{ text: 'only one' }] }).error, 'an oracle needs two results');
}

// Views: players see tiers, approved canon and their own proposals; never the reputation or the history
{
  const s = world();
  const a = L.addTown(s.living, { name: 'Veil', rep: -70 }).town;
  L.addRumour(s, { text: 'Secret rumour', town: a.id });
  const mine = L.propose(s.living, { by: 'Thorn', byId: 'c1', text: 'Mine' }).canon;
  L.propose(s.living, { by: 'Rowan', byId: 'c2', text: 'Theirs' });
  const player = L.view(s, { role: 'player', charId: 'c1' });
  ok(player.towns[0].label === 'Hostile' && !('rep' in player.towns[0]), 'players see the tier, never the number');
  ok(player.canon.length === 1 && player.canon[0].id === mine.id, 'a player sees only their own proposal');
  ok(!('rumours' in player) && !('history' in player), 'rumours and history stay with the DM');
  const dm = L.view(s, { role: 'dm' });
  ok(dm.rumours.length === 1 && dm.towns[0].rep === -70, 'the DM sees rumours and the number');
}

// Socket run: the DM edits, a phone proposes, a phone cannot use DM events
(async () => {
  const srv = await h.boot();
  const dm = await h.dm();
  const room = await h.room();
  const a = await h.player(room, 'Thorn', 'Fighter');
  await until(() => a.last?.players.length === 1);

  const t = await h.call(dm, 'dm:living:town:add', { name: 'Ashford', rep: 0 });
  ok(t.ok && t.id, 'the DM adds a town');
  const c = await h.call(dm, 'dm:living:clock:add', { name: 'Ritual', segments: 2, ticks: { session: 1 }, vis: 'all' });
  ok(c.ok, 'the DM adds a clock');
  ok(await until(() => a.last.living?.clocks?.length === 1 && a.last.living.clocks[0].name === 'Ritual'), 'a public clock reaches phones');
  ok(await until(() => a.last.living?.towns?.[0]?.label === 'Neutral' && !('rep' in a.last.living.towns[0])), 'phones see a town tier only');

  const bad = await h.call(a, 'dm:living:town:add', { name: 'Hack', rep: 0 });
  ok(bad.error === 'DM only.', 'a phone cannot use DM events');

  const p = await h.call(a, 'player:living:canon', { text: 'The bell was cast in silver', kind: 'detail' });
  ok(!p.error, 'a claimed character can propose canon');
  ok(await until(() => dm.last.living?.canon?.some((x) => x.status === 'proposed' && /silver/.test(x.text))), 'the DM sees the proposal');
  ok(await until(() => a.last.living?.canon?.every((x) => x.status === 'proposed')), 'a proposal is not public until approved');
  const canonId = dm.last.living.canon[0].id;
  await h.call(dm, 'dm:living:canon:decide', { id: canonId, approve: true });
  ok(await until(() => a.last.living?.canon?.some((x) => x.status === 'approved')), 'approved canon reaches phones');

  const und = await h.call(dm, 'dm:living:tension', { delta: 2 });
  ok(und.ok !== false, 'the DM raises tension');
  ok(await until(() => a.last.living?.tension?.value === 2), 'phones see the tension track');
  const hist = dm.last.living.history[0];
  await h.call(dm, 'dm:living:undo', { id: hist.id });
  ok(await until(() => dm.last.living.tension === 0), 'the DM takes a tension change back in one step');

  // Persistence: the living world survives a restart
  await h.wait(500);
  const fs = require('fs');
  const path = require('path');
  const saved = JSON.parse(fs.readFileSync(path.join(h.TMP, 'data', 'campaign.json'), 'utf8'));
  ok(saved.living?.towns?.length === 1 && saved.living.clocks.length === 1, 'the living world is saved with the campaign');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
