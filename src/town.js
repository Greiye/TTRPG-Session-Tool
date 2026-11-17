// Town visits (Mike, Nov 16, PR V): a town map for a place on the world map, visited the way the party enters a
// dungeon. A world map place with `settlement` on has a town map: a picture with places (nodes) on it. Every node
// starts hidden; entering the town puts the party at the Settlement entrance, which reveals it and the nodes it
// leads to. In town, each player picks a discovered node on the phone and holds the town action button. Once every
// online player has confirmed, the party goes to the most picked node (a tie goes to the pick confirmed first), the
// node's discoveries open, and the story clock advances by the node's time cost (src/clock.js).
//
// Pure logic: functions take the town object `T` (state.town) and the world map; src/sockets/town.js broadcasts.
const { str, int } = require('./util');

const KINDS = ['entrance', 'farm', 'market', 'smithy', 'tower', 'inn', 'temple', 'house', 'guild', 'dock', 'other'];
const ICON = { entrance: '🚪', farm: '🌾', market: '🛒', smithy: '⚒', tower: '🔮', inn: '🍺', temple: '⛪', house: '🏠', guild: '🛡', dock: '⚓', other: '📍' };
const MAX_NODES = 24;
const MAX_TIME = 5;

// The starting town (Mike, Nov 16): five hidden places. The entrance leads to the farm and the marketplace; the
// marketplace to the smithy and the wizards tower.
const STARTER = [
  ['t1', 'Settlement entrance', 'entrance', 0.5, 0.86, 'A wooden gate with a lantern. The road from the world map ends here.', 0, ['t2', 't3']],
  ['t2', 'Farm', 'farm', 0.22, 0.6, 'Fields of barley and a barn with a sagging roof. The farmer watches the road.', 1, []],
  ['t3', 'Marketplace', 'market', 0.52, 0.5, 'Stalls under striped awnings. Someone is always shouting a price.', 1, ['t4', 't5']],
  ['t4', 'Smithy', 'smithy', 0.78, 0.58, 'Hammer on anvil, all day long. The smith takes repairs and commissions.', 1, []],
  ['t5', 'Wizards Tower', 'tower', 0.66, 0.18, 'A crooked stone tower. A light burns at the top at all hours.', 2, []],
];
const starter = () => ({
  image: '',
  seq: STARTER.length,
  nodes: STARTER.map(([id, name, kind, x, y, info, time, reveals]) => ({ id, name, kind, x, y, info, time, reveals, shop: '', seen: false, visited: false })),
});
const blankMap = () => ({ image: '', seq: 1, nodes: [{ id: 't1', name: 'Settlement entrance', kind: 'entrance', x: 0.5, y: 0.86, info: '', time: 0, reveals: [], shop: '', seen: false, visited: false }] });

// state.town: the maps by world place id, and the visit in progress.
const fresh = () => ({ maps: {}, share: null, on: false, at: null, here: null, ready: [], readyAt: null, skipAt: null, picks: {}, n: 0 });
// A new table: Millbrook (w1 in the example world) has the starter town (Mike, Nov 16). The party wakes there
// with the gate shut, so phones are not greeted by a pop-up on joining; arriving by road, or the DM's Open the
// gate, offers Enter Town.
const withStarter = () => { const t = fresh(); t.maps.w1 = starter(); t.skipAt = 'w1'; return t; };
function ensure(T) {
  const t = T && typeof T === 'object' ? T : fresh();
  t.maps ||= {};
  t.ready ||= [];
  t.picks ||= {};
  t.n ||= 0;
  return t;
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const worldNode = (wm, id) => (wm?.nodes || []).find((n) => n.id === id);
// The town map of a world place, made on first use: the starter town for the example's village, else a blank one.
function mapFor(T, wid, kind = 'blank') {
  if (!wid) return null;
  T.maps[wid] ||= kind === 'starter' ? starter() : blankMap();
  return T.maps[wid];
}
const byId = (m, id) => (m?.nodes || []).find((n) => n.id === id);
const entrance = (m) => (m?.nodes || []).find((n) => n.kind === 'entrance') || m?.nodes?.[0] || null;
const current = (T) => (T.on ? T.maps[T.at] || null : null);
// The settlement the party stands on (not travelling), or null.
const settlementHere = (wm) => { const n = !wm?.travel && worldNode(wm, wm?.here); return n?.settlement ? n : null; };

// ----- DM: edit a town map -----
function save(m, f = {}) {
  let n = f.id ? byId(m, f.id) : null;
  if (!n) {
    if (m.nodes.length >= MAX_NODES) return { error: `A town has at most ${MAX_NODES} places.` };
    n = { id: `t${++m.seq}`, name: 'New place', kind: 'house', x: 0.5, y: 0.5, info: '', time: 1, reveals: [], shop: '', seen: false, visited: false };
    m.nodes.push(n);
  }
  if (f.name !== undefined) n.name = str(f.name, 40) || n.name;
  if (f.kind !== undefined) n.kind = KINDS.includes(f.kind) ? f.kind : 'other';
  if (f.x !== undefined) n.x = clamp01(f.x);
  if (f.y !== undefined) n.y = clamp01(f.y);
  if (f.info !== undefined) n.info = str(f.info, 800);
  if (f.time !== undefined) n.time = int(f.time, 0, MAX_TIME, n.time);
  if (f.shop !== undefined) n.shop = str(f.shop, 40);
  if (f.seen !== undefined) n.seen = !!f.seen;
  if (Array.isArray(f.reveals)) n.reveals = [...new Set(f.reveals)].filter((id) => id !== n.id && byId(m, id)).slice(0, MAX_NODES);
  return { node: n };
}
function remove(T, m, id) {
  if (!byId(m, id)) return false;
  m.nodes = m.nodes.filter((n) => n.id !== id);
  m.nodes.forEach((n) => { n.reveals = (n.reveals || []).filter((x) => x !== id); });
  if (current(T) === m) {
    if (T.here === id) T.here = entrance(m)?.id || null;
    for (const [who, p] of Object.entries(T.picks)) if (p.node === id) delete T.picks[who];
  }
  return true;
}

// ----- moving around -----
// The party arrives at a node: it is seen and visited, and the places it leads to are discovered.
function arrive(m, id) {
  const n = byId(m, id);
  if (!n) return null;
  n.seen = true;
  n.visited = true;
  for (const r of n.reveals || []) { const o = byId(m, r); if (o) o.seen = true; }
  return n;
}
// Open the town: the party stands at the entrance (or where it left off). Returns { ok, here } or { error }.
function enter(T, wm) {
  const at = settlementHere(wm);
  if (!at) return { error: 'The party must stand on a town on the world map.' };
  const m = mapFor(T, at.id);
  if (!m.nodes.length) return { error: 'This town has no places yet.' };
  T.on = true;
  T.at = at.id;
  T.picks = {};
  if (!byId(m, T.here) || T.lastAt !== at.id) T.here = entrance(m).id;
  T.lastAt = at.id;
  T.n += 1;
  return { ok: true, here: arrive(m, T.here), town: at };
}
// Leave: only from the entrance (or a town with no entrance node left).
const canLeave = (T) => { const m = current(T); return !m || !byId(m, T.here) || entrance(m)?.id === T.here; };
function leave(T, force = false) {
  if (!T.on) return { ok: true };
  if (!force && !canLeave(T)) return { error: 'The party leaves town from the Settlement entrance.' };
  T.on = false;
  T.picks = {};
  T.skipAt = T.at; // the gate stays shut here until the party moves on
  return { ok: true };
}
// DM override: move the party to any node now (no clock).
function moveTo(T, id) {
  const m = current(T);
  const n = m && arrive(m, id);
  if (!n) return null;
  T.here = id;
  T.picks = {};
  T.n += 1;
  return n;
}

// ----- the gate: hold Enter Town (like the dungeon gate, PR R) -----
function gate(T, wm, players = []) {
  const at = settlementHere(wm);
  if (T.skipAt && T.skipAt !== at?.id) T.skipAt = null;
  if (!at || T.on || T.skipAt === at.id) return null;
  if (T.readyAt !== at.id) { T.ready = []; T.readyAt = at.id; }
  const online = players.filter((p) => p.online).map((p) => p.id);
  const m = T.maps[at.id];
  return { id: at.id, name: at.name, info: at.revealed ? at.info || '' : '', image: m?.image || '', ready: T.ready.filter((id) => online.includes(id)), total: online.length };
}
function setReady(T, wm, players, id, on = true) {
  if (!gate(T, wm, players)) return null;
  T.ready = T.ready.filter((x) => x !== id);
  if (on) T.ready.push(id);
  return gate(T, wm, players);
}
const allReady = (g) => !!g && g.total > 0 && g.ready.length >= g.total;

// ----- picks: every player chooses a discovered node and holds the town action -----
// A pick is { node, at } where `at` is when it was confirmed; null `at` means picked but not held yet.
function pick(T, charId, nodeId, confirm, now) {
  const m = current(T);
  const n = m && byId(m, nodeId);
  if (!n || !n.seen || n.id === T.here || !charId) return false;
  const old = T.picks[charId];
  T.picks[charId] = { node: nodeId, at: confirm ? (old?.node === nodeId && old.at) || now : null };
  return true;
}
function unpick(T, charId) { delete T.picks[charId]; return true; }
// Who is still deciding, and where the party would go if everyone had confirmed.
function tally(T, players = []) {
  const online = players.filter((p) => p.online).map((p) => p.id);
  const sure = online.filter((id) => T.picks[id]?.at);
  const counts = {};
  const first = {};
  for (const id of sure) {
    const { node, at } = T.picks[id];
    counts[node] = (counts[node] || 0) + 1;
    first[node] = Math.min(first[node] ?? Infinity, at);
  }
  const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || first[a] - first[b])[0] || null;
  return { total: online.length, confirmed: sure.length, counts, leader: top };
}
// Every online player confirmed: the party goes to the leader. Returns the node it arrived at, or null.
function resolve(T, players, force = false) {
  const t = tally(T, players);
  if (!t.leader || (!force && (t.total === 0 || t.confirmed < t.total))) return null;
  const m = current(T);
  const n = arrive(m, t.leader);
  if (!n) return null;
  T.here = n.id;
  T.picks = {};
  T.n += 1;
  return n;
}

// ----- what each screen sees -----
const nodeView = (n, dm) => ({ id: n.id, name: n.name, kind: n.kind, x: n.x, y: n.y, info: n.info, time: n.time, shop: n.shop || '', seen: !!n.seen, visited: !!n.visited, ...(dm ? { reveals: n.reveals || [] } : {}) });
// The hover list on the world map (Mike, Nov 16): what a town has. The DM sees every place (hidden ones marked);
// the table sees discovered places and a count of the rest.
function contents(T, wid, dm) {
  const m = T.maps[wid];
  if (!m) return null;
  const list = m.nodes.filter((n) => dm || n.seen).map((n) => ({ name: n.name, kind: n.kind, seen: !!n.seen }));
  return { places: list, hidden: dm ? 0 : m.nodes.length - list.length };
}
// Paths between places (Mike, Nov 17: drawn as footprints): one per `reveals` link, both ends visible to the viewer.
function links(m, dm) {
  const vis = new Set((m?.nodes || []).filter((n) => dm || n.seen).map((n) => n.id));
  const out = [];
  const seen = new Set();
  for (const n of m?.nodes || []) for (const r of n.reveals || []) {
    const k = [n.id, r].sort().join('|');
    if (vis.has(n.id) && vis.has(r) && !seen.has(k)) { seen.add(k); out.push([n.id, r]); }
  }
  return out;
}
// A town map the DM shares on the TV without a visit (Mike, Nov 17): discovered places only, unless it is the DM.
function sharedView(T, wm, dm) {
  const m = !T.on && T.share && T.maps[T.share];
  if (!m) return null;
  return { at: T.share, name: worldNode(wm, T.share)?.name || 'Town', image: m.image || '', nodes: m.nodes.filter((n) => dm || n.seen).map((n) => nodeView(n, dm)), links: links(m, dm) };
}
function viewFor(T, wm, viewer, players = []) {
  const dm = viewer.role === 'dm';
  const m = current(T);
  const tal = T.on ? tally(T, players) : null;
  const out = {
    on: !!T.on,
    at: T.on ? T.at : null,
    name: T.on ? worldNode(wm, T.at)?.name || 'Town' : null,
    here: T.on ? T.here : null,
    n: T.n,
    image: m?.image || '',
    nodes: m ? m.nodes.filter((n) => dm || n.seen).map((n) => nodeView(n, dm)) : [],
    links: links(m, dm),
    share: sharedView(T, wm, dm),
    canLeave: T.on && canLeave(T),
    tally: tal ? { total: tal.total, confirmed: tal.confirmed, counts: tal.counts } : null,
    mine: viewer.role === 'player' && T.on ? T.picks[viewer.charId] || null : null,
    gate: gate(T, wm, players),
    // Hover lists for every settlement on the world map, by world place id.
    contents: Object.fromEntries((wm?.nodes || []).filter((n) => n.settlement && T.maps[n.id]).map((n) => [n.id, contents(T, n.id, dm)])),
  };
  if (dm) {
    out.maps = T.maps; // the DM edits every town map
    out.picks = T.on ? T.picks : {};
  }
  return out;
}

module.exports = { KINDS, ICON, MAX_NODES, MAX_TIME, fresh, withStarter, ensure, starter, blankMap, mapFor, byId, entrance, current, settlementHere, save, remove, arrive, enter, canLeave, leave, moveTo, gate, setReady, allReady, pick, unpick, tally, resolve, contents, links, viewFor };
