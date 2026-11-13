// Living world (phase K): clocks that tick between sessions and during travel, town reputation that
// moves prices and willingness to trade, rumours that spread along the roads between towns (and can
// come out changed), interlocking rules (weather, light, tension), player canon and weighted oracles.
//
// Every automated or DM change is a `record` in L.history with an undo, so the DM can take any one back.
// These are pure rules: nothing here imports the live state. Callers pass `state` and log what comes back.
const crypto = require('crypto');
const { str, int } = require('./util');
const factions = require('./factions');

// Weather is the shared source state.weather = { kind, intensity } (also read by the TV, src/sockets/dm.js).
const WEATHER = ['none', 'rain', 'snow', 'fog', 'storm'];
const LIGHTS = ['day', 'dusk', 'night', 'dawn', 'torchlight'];
const TRIGGERS = ['session', 'travel', 'event'];
const CANON_KINDS = ['detail', 'npc', 'rumour'];
const MAX = { clocks: 12, towns: 20, rumours: 40, canon: 100, oracles: 12, entries: 30, pending: 20, history: 80 };
const SOUND_TENSION = { door: 2, clash: 3, roar: 3, hit: 2, thunder: 1, magic: 1 };
const TENSION_MAX = 10;
const TENSION_LABELS = ['Calm', 'Calm', 'Calm', 'Uneasy', 'Uneasy', 'Tense', 'Tense', 'Tense', 'Peak', 'Peak', 'Peak'];
// Words a rumour can flip when it has no number to change.
const SWAPS = [[/\bnorth\b/i, 'south'], [/\bsouth\b/i, 'north'], [/\beast\b/i, 'west'], [/\bwest\b/i, 'east'], [/\balive\b/i, 'dead'], [/\bdead\b/i, 'alive'], [/\bgold\b/i, 'silver'], [/\bsafe\b/i, 'cursed']];
const WEATHER_TRAVEL = { none: 1, rain: 1.25, fog: 1.25, snow: 1.5, storm: 1.75 };
const LIGHT_TRAVEL = { night: 1.5, dusk: 1.2, dawn: 1.1 };
const LIGHT_ENCOUNTER = { night: 1.5, dusk: 1.25, dawn: 1.1 };
const TENSION_TIER = (v) => TENSION_LABELS[clamp(v, 0, TENSION_MAX)];

const idOf = (p) => p + crypto.randomBytes(4).toString('hex');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const arrOf = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);

function fresh() {
  return { clocks: [], towns: [], links: [], rumours: [], canon: [], oracles: [], pending: [], history: [] };
}
// A save from before this phase has no living world; keep what it has and fill in the rest.
const ensure = (saved) => ({ ...fresh(), ...(saved || {}) });

// Every change is an entry. `undo` says how to take it back; vis 'dm' keeps it off phones and the TV.
function record(L, text, { tone = 'call', vis, undo = null } = {}) {
  const e = { id: idOf('h'), text, tone, vis: vis || null, undo, undone: false, at: Date.now() };
  L.history.unshift(e);
  L.history.length = Math.min(L.history.length, MAX.history);
  return e;
}

// ----- reputation: towns and factions share one rule -----
const targetOf = (state, t) => {
  if (!t) return null;
  if (t.kind === 'town') return state.living.towns.find((x) => x.id === t.id) || null;
  if (t.kind === 'faction') return (state.factions || []).find((x) => x.id === t.id) || null;
  return null;
};
// Set a reputation exactly. Returns false if the target is gone. Faction moods follow their tier.
function setRep(state, t, value) {
  const o = targetOf(state, t);
  if (!o) return false;
  o.rep = factions.clampRep(value);
  if (t.kind === 'faction') factions.applyMood(state, t.id);
  return true;
}
// Move a reputation by delta, recorded with an undo. Returns entries.
function shiftRep(state, t, delta, why, vis = 'dm') {
  const o = targetOf(state, t);
  if (!o || !delta) return [];
  const from = o.rep;
  const before = factions.tierOf(from).label;
  setRep(state, t, from + delta);
  const after = factions.tierOf(o.rep).label;
  const note = before !== after ? ` ${o.name} is now ${after.toLowerCase()}.` : '';
  return [record(state.living, `${o.name} standing ${delta > 0 ? 'rises' : 'falls'} (${why}).${note}`, { tone: delta > 0 ? 'good' : 'bad', vis, undo: { type: 'rep', target: t, from } })];
}

// ----- clocks: a countdown that advances on events, between sessions and during travel -----
function addClock(L, f) {
  if (L.clocks.length >= MAX.clocks) return { error: 'Too many clocks. Remove one first.' };
  const name = str(f.name, 60);
  if (!name) return { error: 'A clock needs a name.' };
  const ticks = Object.fromEntries(TRIGGERS.map((t) => [t, int(f.ticks?.[t], 0, 3, 0)]));
  const c = f.consequence || {};
  const clock = {
    id: idOf('c'), name, segments: int(f.segments, 2, 12, 4), filled: 0, fired: false, ticks,
    consequence: {
      text: str(c.text, 200),
      target: c.target?.kind && c.target?.id ? { kind: c.target.kind, id: c.target.id } : null,
      delta: int(c.delta, -100, 100, 0),
    },
    vis: f.vis === 'all' ? 'all' : 'dm',
  };
  L.clocks.push(clock);
  return { clock };
}
// Move a clock by delta (the DM's hand or an automatic tick). When it fills, its consequence fires once.
function advance(state, id, delta, why) {
  const L = state.living;
  const c = L.clocks.find((x) => x.id === id);
  if (!c) return { error: 'No such clock.' };
  const n = int(delta, -12, 12, 0);
  const before = { filled: c.filled, fired: c.fired };
  c.filled = clamp(c.filled + n, 0, c.segments);
  if (c.filled === before.filled) return { entries: [] };
  const vis = c.vis === 'all' ? undefined : 'dm';
  const out = [record(L, `${c.name} ${n > 0 ? 'advances' : 'steps back'} to ${c.filled}/${c.segments}${why ? ` (${why})` : ''}.`, { tone: n > 0 ? 'call' : 'good', vis, undo: { type: 'clock', id, ...before } })];
  if (n > 0 && c.filled === c.segments && !c.fired) {
    c.fired = true;
    out[0].undo.fired = false;
    const con = c.consequence;
    if (con?.text) out.push(record(L, `${c.name} fills: ${con.text}`, { tone: 'bad', vis }));
    if (con?.target && con.delta) out.push(...shiftRep(state, con.target, con.delta, `${c.name} fills`, vis || 'dm'));
  }
  return { entries: out };
}
// Every live clock with a tick for this trigger advances by it. Filled clocks stop.
function tick(state, trigger, why) {
  const entries = state.living.clocks
    .filter((c) => !c.fired && c.ticks[trigger])
    .flatMap((c) => advance(state, c.id, c.ticks[trigger], why).entries || []);
  return { entries };
}

// ----- towns: standing moves prices and whether traders will serve the party -----
function addTown(L, f) {
  if (L.towns.length >= MAX.towns) return { error: 'Too many towns. Remove one first.' };
  const name = str(f.name, 60);
  if (!name) return { error: 'A town needs a name.' };
  if (L.towns.some((t) => t.name.toLowerCase() === name.toLowerCase())) return { error: `${name} already exists.` };
  const town = { id: idOf('t'), name, rep: factions.clampRep(f.rep), trade: 'auto' };
  L.towns.push(town);
  return { town };
}
// Traders: 'auto' serves everyone but hostile towns; the DM can force 'open' or 'closed'.
const TRADE_MODES = ['auto', 'open', 'closed'];
function setTrade(L, id, mode) {
  const t = L.towns.find((x) => x.id === id);
  if (!t || !TRADE_MODES.includes(mode)) return { error: 'No such town.' };
  t.trade = mode;
  return {};
}
function removeTown(state, id) {
  const L = state.living;
  L.towns = L.towns.filter((t) => t.id !== id);
  L.links = L.links.filter(([a, b]) => a !== id && b !== id);
  for (const r of L.rumours) { delete r.heard[id]; if (r.origin === id) r.origin = null; if (r.effect?.town === id) r.effect = null; }
  for (const s of state.shops || []) if (s.town === id) s.town = null;
}
// The living town that matches a world map node, by name (phase G arrival calls onTravel with it).
const townFor = (L, name) => L.towns.find((t) => t.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
const townWilling = (t) => !t || t.trade === 'open' || (t.trade !== 'closed' && factions.tierOf(t.rep).id !== 'hostile');
// Roads between towns: the map nodes rumours travel along.
const adjacent = (L, a, b) => L.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
function linkTowns(L, a, b, on) {
  if (a === b || !L.towns.some((t) => t.id === a) || !L.towns.some((t) => t.id === b)) return { error: 'Pick two different towns.' };
  const has = adjacent(L, a, b);
  if (on && !has) L.links.push([a, b]);
  if (!on && has) L.links = L.links.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
  return {};
}
// A shop belongs to a town (its standing sets the price) and may stay open at night.
function setShop(state, id, f) {
  const s = (state.shops || []).find((x) => x.id === id);
  if (!s) return { error: 'No such shop.' };
  if (f.town !== undefined) s.town = state.living.towns.some((t) => t.id === f.town) ? f.town : null;
  if (f.night !== undefined) s.night = !!f.night;
  return {};
}
// Price multiplier: the faction's tier times the town's tier. Shops with neither charge list price.
function priceMult(state, shop) {
  const town = shop?.town && state.living.towns.find((t) => t.id === shop.town);
  return factions.multFor(state, shop) * (town ? factions.tierOf(town.rep).mult : 1);
}
// Can this character buy here right now? Closed shops, unwilling towns and night closing all say no.
function canTrade(state, shop) {
  if (!shop.open) return { error: `${shop.name} is closed right now.` };
  const town = shop.town && state.living.towns.find((t) => t.id === shop.town);
  if (town && !townWilling(town)) return { error: `${town.name}'s traders won't serve you right now.` };
  if (state.scene?.light === 'night' && !shop.night) return { error: `${shop.name} is shut for the night.` };
  return { ok: true };
}

// ----- rumours: spread along roads, distort on the way, and can move a town's standing -----
// Change a rumour's words with chance `p`: swap a number, flip a known word, or hedge it.
function distort(text, p, rng) {
  if (!(rng() < p)) return { text, changed: false };
  const num = text.match(/\d+/);
  if (num) return { text: text.replace(num[0], String(Math.max(1, Number(num[0]) + (rng() < 0.5 ? -1 : 2)))), changed: true };
  const hit = SWAPS.find(([re]) => re.test(text));
  if (hit) return { text: text.replace(hit[0], hit[1]), changed: true };
  return { text: `${text} (so they say)`, changed: true };
}
function addRumour(state, f) {
  const L = state.living;
  if (L.rumours.length >= MAX.rumours) return { error: 'Too many rumours. Remove one first.' };
  const text = str(f.text, 240);
  if (!text) return { error: 'A rumour needs words.' };
  const hasTown = (id) => !!id && L.towns.some((t) => t.id === id);
  const origin = hasTown(f.town) ? f.town : null;
  const effect = hasTown(f.effect?.town) && int(f.effect?.delta, -100, 100, 0) ? { town: f.effect.town, delta: int(f.effect.delta, -100, 100, 0) } : null;
  const r = {
    id: idOf('r'), text, origin, truth: f.truth !== false, effect,
    distortion: clamp(Number(f.distortion ?? 0.3), 0, 1), spread: clamp(Number(f.spread ?? 0.5), 0, 1),
    heard: origin ? { [origin]: { text, distorted: false } } : {},
  };
  L.rumours.push(r);
  const out = [record(L, `Rumour started: "${text}"${origin ? ` in ${L.towns.find((t) => t.id === origin).name}` : ''}.`, { vis: 'dm', undo: { type: 'rumour', id: r.id, town: origin, start: true } })];
  if (effect && origin === effect.town) out.push(...shiftRep(state, { kind: 'town', id: effect.town }, effect.delta, `rumour: ${text.slice(0, 40)}`));
  return { rumour: r, entries: out };
}
// The rumour reaches `town`. The first hop may seed it anywhere; later hops need a road from a town that holds it.
function spreadTo(state, rid, town, rng = Math.random) {
  const L = state.living;
  const r = L.rumours.find((x) => x.id === rid);
  const t = L.towns.find((x) => x.id === town);
  if (!r || !t) return { error: 'No such rumour or town.' };
  if (r.heard[t.id]) return { entries: [] };
  const holders = Object.keys(r.heard);
  if (holders.length && !holders.some((h) => adjacent(L, h, t.id))) return { error: 'The rumour has to reach a neighbouring town first.' };
  const d = distort(r.text, r.distortion, rng);
  r.heard[t.id] = { text: d.text, distorted: d.changed };
  const out = [record(L, `"${d.text}" reaches ${t.name}${d.changed ? ', changed on the way' : ''}.`, { vis: 'dm', undo: { type: 'rumour', id: rid, town: t.id } })];
  if (r.effect?.town === t.id) out.push(...shiftRep(state, { kind: 'town', id: t.id }, r.effect.delta, `rumour: ${r.text.slice(0, 40)}`));
  return { entries: out };
}
// Each rumour spreads to every neighbour of a town that holds it, with the rumour's own chance.
function spreadAll(state, rng = Math.random) {
  const L = state.living;
  const out = [];
  for (const r of L.rumours) {
    const holders = Object.keys(r.heard);
    if (!holders.length) continue;
    for (const t of L.towns) {
      if (!r.heard[t.id] && holders.some((h) => adjacent(L, h, t.id)) && rng() < r.spread) out.push(...spreadTo(state, r.id, t.id, rng).entries || []);
    }
  }
  return { entries: out };
}
// Between sessions: session clocks tick and rumours spread along the roads.
function onSession(state, rng = Math.random) {
  return { entries: [...tick(state, 'session', 'between sessions').entries, ...spreadAll(state, rng).entries] };
}
// Travel hook (phase G calls this with its destination): travel clocks tick, and a rumour the party's
// road passes can carry into the town they reach.
function onTravel(state, town, rng = Math.random) {
  const L = state.living;
  const out = tick(state, 'travel', 'travelling').entries;
  for (const r of L.rumours) {
    const holders = Object.keys(r.heard);
    if (town && !r.heard[town] && holders.some((h) => adjacent(L, h, town)) && rng() < r.spread) out.push(...spreadTo(state, r.id, town, rng).entries || []);
  }
  return { entries: out };
}

// ----- interlocking rules: weather, light, tension -----
const weatherOf = (state) => state.weather?.kind || 'none';
const context = (state) => ({ light: state.scene?.light || 'day', weather: weatherOf(state) });
// Travel takes longer in bad weather and in the dark. Returns the factor and why.
function travelCost(weather, light) {
  const reasons = [];
  let factor = WEATHER_TRAVEL[weather] || 1;
  if (factor > 1) reasons.push(weather);
  if (LIGHT_TRAVEL[light]) { factor *= LIGHT_TRAVEL[light]; reasons.push(light); }
  return { factor: Math.round(factor * 100) / 100, reasons };
}
// How far the party can see: poor in fog, storms and full dark; dim in rain, snow, dusk and torchlight.
function sight(weather, light) {
  if (['fog', 'storm'].includes(weather) || light === 'night') return 'poor';
  if (['rain', 'snow'].includes(weather) || ['dusk', 'torchlight'].includes(light)) return 'dim';
  return 'clear';
}
// Encounters come more often at dusk and night; storms keep monsters in their dens.
function encounterFactor(weather, light) {
  const f = (LIGHT_ENCOUNTER[light] || 1) * (weather === 'storm' ? 0.5 : 1);
  return Math.round(f * 100) / 100;
}
// Set the shared weather. Intensity is 1 (light) to 3 (heavy) and keeps its old value if not given.
function setWeather(state, kind, intensity) {
  if (!WEATHER.includes(kind)) return { error: 'Unknown weather.' };
  const from = { kind: state.weather?.kind || 'none', intensity: state.weather?.intensity || 2 };
  if (from.kind === kind && (intensity === undefined || int(intensity, 1, 3, from.intensity) === from.intensity)) return { entries: [] };
  state.weather = { kind, intensity: intensity === undefined ? from.intensity : int(intensity, 1, 3, 2) };
  return { entries: [record(state.living, `The weather turns to ${kind === 'none' ? 'clear' : kind}.`, { tone: 'call', undo: { type: 'weather', from } })] };
}
// Tension: the shared tension track (phase I, state.tension = { on, value, label }, shown on the TV when on).
// Sounds from the soundboard push it up; the DM can ease it down. Its label and on/off stay the DM's.
const tensionOf = (state) => (state.tension ??= { on: false, value: 0, label: 'Dread' });
function bump(state, delta, why) {
  const t = tensionOf(state);
  const from = t.value || 0;
  t.value = clamp(from + int(delta, -10, 10, 0), 0, TENSION_MAX);
  if (t.value === from) return { entries: [] };
  return { entries: [record(state.living, `Tension ${t.value > from ? 'rises' : 'eases'} to ${t.value} (${why}).`, { tone: 'call', undo: { type: 'tension', from } })] };
}
const sound = (state, sfxId) => (SOUND_TENSION[sfxId] ? bump(state, SOUND_TENSION[sfxId], `${sfxId} sound`) : { entries: [] });

// ----- canon: a player proposes a detail, NPC or rumour; the DM approves -----
function propose(L, { by, byId, text, kind }) {
  if (L.canon.length >= MAX.canon) return { error: 'The canon list is full.' };
  const t = str(text, 280);
  if (!t) return { error: 'Write the detail first.' };
  const c = { id: idOf('n'), by: str(by, 60), byId: byId || null, text: t, kind: CANON_KINDS.includes(kind) ? kind : 'detail', status: 'proposed', at: Date.now() };
  L.canon.unshift(c);
  return { canon: c };
}
// Approve or reject. An approved rumour enters the world unplaced; the DM seeds it in a town.
function decideCanon(state, id, approve) {
  const L = state.living;
  const c = L.canon.find((x) => x.id === id);
  if (!c || c.status !== 'proposed') return { error: 'Nothing to decide.' };
  const from = c.status;
  c.status = approve ? 'approved' : 'rejected';
  const out = [record(L, approve ? `Canon: ${c.text}` : `Canon refused: ${c.text}`, { tone: approve ? 'good' : 'call', vis: approve ? undefined : 'dm', undo: { type: 'canon', id, from } })];
  // Approved canon joins the table's shared canon list (phase I scene framing), which the TV shows.
  if (approve && Array.isArray(state.canon)) {
    state.canon.push({ id: c.id, by: c.by, text: c.text, at: Date.now(), vis: 'all' });
    if (state.canon.length > 30) state.canon.shift();
  }
  if (approve && c.kind === 'rumour') out.push(...addRumour(state, { text: c.text }).entries || []);
  return { entries: out };
}

// ----- oracles: "what happens?" with weighted results that fit the scene; the DM accepts or overrides -----
function addOracle(L, f) {
  if (L.oracles.length >= MAX.oracles) return { error: 'Too many oracles. Remove one first.' };
  const name = str(f.name, 60);
  if (!name) return { error: 'An oracle needs a name.' };
  const entries = (Array.isArray(f.entries) ? f.entries : []).slice(0, MAX.entries).map((e) => ({
    text: str(e?.text, 200), weight: int(e?.weight, 1, 10, 1), when: { light: arrOf(e?.when?.light, LIGHTS), weather: arrOf(e?.when?.weather, WEATHER) },
  })).filter((e) => e.text);
  if (entries.length < 2) return { error: 'An oracle needs at least two results.' };
  const o = { id: idOf('o'), name, entries };
  L.oracles.push(o);
  return { oracle: o };
}
// Weighted pick among the results that fit the scene now (all results if none fit).
// Creates a pending result: nothing is final until the DM accepts it or writes another.
function roll(state, oracleId, rng = Math.random) {
  const L = state.living;
  const o = L.oracles.find((x) => x.id === oracleId);
  if (!o) return { error: 'No such oracle.' };
  const ctx = context(state);
  const fit = o.entries.filter((e) => (!e.when.light.length || e.when.light.includes(ctx.light)) && (!e.when.weather.length || e.when.weather.includes(ctx.weather)));
  const pool = fit.length ? fit : o.entries;
  let x = rng() * pool.reduce((s, e) => s + e.weight, 0);
  let pick = pool[pool.length - 1];
  for (const e of pool) { if ((x -= e.weight) < 0) { pick = e; break; } }
  const p = { id: idOf('p'), oracleId, name: o.name, text: pick.text, ctx, fit: fit.length > 0, at: Date.now() };
  L.pending.unshift(p);
  L.pending.length = Math.min(L.pending.length, MAX.pending);
  return { pending: p };
}
// accept keeps the roll; override replaces it with the DM's words. Either way it becomes world history.
function decideOracle(state, pid, action, text) {
  const L = state.living;
  const i = L.pending.findIndex((x) => x.id === pid);
  if (i < 0) return { error: 'Nothing pending.' };
  if (action !== 'accept' && action !== 'override') return { error: 'Accept or override.' };
  const p = L.pending[i];
  const result = action === 'override' ? str(text, 200) : p.text;
  if (!result) return { error: 'Write what happens instead.' };
  L.pending.splice(i, 1);
  return { entries: [record(L, `${p.name}: ${result}${action === 'override' ? ' (DM override)' : ''}`, { tone: 'call' })] };
}

// ----- one-tap override: take back a recorded change -----
function undo(state, id) {
  const L = state.living;
  const e = L.history.find((x) => x.id === id);
  if (!e) return { error: 'Nothing to undo.' };
  if (e.undone) return { error: 'Already undone.' };
  if (!e.undo) return { error: 'This one cannot be undone.' };
  const u = e.undo;
  if (u.type === 'clock') { const c = L.clocks.find((x) => x.id === u.id); if (c) { c.filled = u.filled; c.fired = u.fired; } }
  else if (u.type === 'rep') setRep(state, u.target, u.from);
  else if (u.type === 'rumour') {
    const r = L.rumours.find((x) => x.id === u.id);
    if (u.start) L.rumours = L.rumours.filter((x) => x.id !== u.id); // taking back the start removes the rumour
    else if (r) delete r.heard[u.town];
  }
  else if (u.type === 'tension') tensionOf(state).value = u.from;
  else if (u.type === 'weather') state.weather = { ...u.from };
  else if (u.type === 'canon') {
    const c = L.canon.find((x) => x.id === u.id);
    if (c) c.status = u.from;
    if (Array.isArray(state.canon)) state.canon = state.canon.filter((x) => x.id !== u.id);
  }
  e.undone = true;
  return { entries: [record(L, `Undone: ${e.text}`, { vis: 'dm' })] };
}

// What a viewer may see. The DM sees all. Everyone else sees weather, tension, the derived rules, towns by
// tier (never the number), links, approved canon (plus their own proposals) and clocks marked for all.
function view(base, viewer) {
  const L = base.living || fresh(); // a test state or old snapshot may have none
  const light = base.scene?.light || 'day';
  const weather = weatherOf(base);
  const derived = { light, sight: sight(weather, light), travel: travelCost(weather, light), encounters: encounterFactor(weather, light) };
  if (viewer.role === 'dm') return { ...L, derived, tension: base.tension?.value || 0, tensionLabel: TENSION_TIER(base.tension?.value || 0), towns: L.towns.map((t) => ({ ...t, label: factions.tierOf(t.rep).label, trade: townWilling(t) ? 'open' : 'closed' })) };
  return {
    weather,
    tension: { value: base.tension?.value || 0, label: TENSION_TIER(base.tension?.value || 0) },
    derived,
    towns: L.towns.map((t) => ({ id: t.id, name: t.name, label: factions.tierOf(t.rep).label, trade: townWilling(t) ? 'open' : 'closed' })),
    links: L.links,
    canon: L.canon.filter((c) => c.status === 'approved' || (c.status === 'proposed' && viewer.role === 'player' && c.byId === viewer.charId)).map(({ byId, ...c }) => c),
    clocks: L.clocks.filter((c) => c.vis === 'all').map(({ consequence, ticks, ...c }) => c),
  };
}

module.exports = {
  WEATHER, LIGHTS, TRIGGERS, CANON_KINDS, TRADE_MODES, MAX, SOUND_TENSION, TENSION_MAX,
  fresh, ensure, record, setRep, shiftRep, addClock, advance, tick,
  addTown, setTrade, removeTown, townFor, townWilling, linkTowns, setShop, priceMult, canTrade,
  distort, addRumour, spreadTo, spreadAll, onSession, onTravel,
  context, weatherOf, travelCost, sight, encounterFactor, setWeather, bump, sound,
  propose, decideCanon, addOracle, roll, decideOracle, undo, view, TENSION_TIER,
};
