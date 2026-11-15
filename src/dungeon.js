// Dungeon nodes (exploration): a branching tree of rooms the party moves through, drawn on the TV as cards
// on levels joined by ropes. Each node lists its parents, so a room can be reached from more than one place.
// The DM sees everything. The TV and phones see only the rooms the party has discovered (Mike, Nov 15).
//
// The dungeon is a pop-up over the world map. It opens only while the party stands on a dungeon entrance
// place on the world map, and the party can leave it only from its start or its end room (enter, canExit).
//
// Pure logic: functions take the dungeon object; the socket layer (src/sockets/dungeon.js) broadcasts.
const { str } = require('./util');

const KINDS = ['entrance', 'passage', 'room', 'crypt', 'trap', 'treasure', 'monster', 'scroll', 'puzzle', 'secret', 'boss', 'exit'];
const MAX_NODES = 40;
const MAX_PARENTS = 4;

// The example from Mike's mockup: an entrance, three ways in, and what lies beyond.
const EXAMPLE = [
  ['d1', 'Dungeon Entrance', 'entrance', [], ''],
  ['d2', 'Explore Left Tunnel', 'passage', ['d1'], ''],
  ['d3', 'Explore Right Tunnel', 'passage', ['d1'], ''],
  ['d4', 'Search Ancient Crypt', 'crypt', ['d1'], 'DC 13'],
  ['d5', 'Hidden Trap', 'trap', ['d2'], 'DC 14'],
  ['d6', 'Treasure Chest', 'treasure', ['d2', 'd3', 'd4'], ''],
  ['d7', 'Lesser Monster', 'monster', ['d3'], 'CR 1'],
  ['d8', 'Lesser Monster', 'monster', ['d4'], 'CR 1'],
  ['d9', 'Mimic Chest', 'treasure', ['d5'], 'CR 2'],
  ['d10', 'Ancient Scroll', 'scroll', ['d5', 'd6', 'd8'], ''],
  ['d11', 'Goblin Ambush', 'monster', ['d7'], 'CR 2'],
  ['d12', 'Sealed Vault', 'secret', ['d9'], 'DC 16'],
  ['d13', 'Lost Archive', 'scroll', ['d9'], ''],
  ['d14', 'Goblin Warren', 'monster', ['d10', 'd11'], 'CR 3'],
  ['d15', 'Throne of Bones', 'boss', ['d12'], 'CR 5'],
  ['d16', 'Way Out', 'exit', ['d13', 'd14'], ''],
];

// Every room starts hidden; entering the dungeon puts the party in the entrance, which reveals it.
function example() {
  const nodes = EXAMPLE.map(([id, name, kind, parents, pill]) => ({ id, name, kind, parents, pill, note: '', revealed: false, visited: false }));
  return { on: false, here: null, nodes, seq: EXAMPLE.length };
}
const fresh = example;
const blank = () => ({ on: false, here: null, nodes: [], seq: 0 });

const byId = (d, id) => d.nodes.find((n) => n.id === id);

// True when `anc` can be reached by walking up the parents of `id` (or is `id`). Guards against loops.
function isAncestor(d, anc, id, seen = new Set()) {
  if (anc === id) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return (byId(d, id)?.parents || []).some((p) => isAncestor(d, anc, p, seen));
}

// Depth of each node: 1 for a node with no parents, else one more than its deepest parent.
function levels(nodes) {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const out = {};
  const depth = (n, guard = 0) => {
    if (out[n.id]) return out[n.id];
    if (guard > nodes.length) return 1;
    const ps = n.parents.map((p) => map.get(p)).filter(Boolean);
    out[n.id] = ps.length ? 1 + Math.max(...ps.map((p) => depth(p, guard + 1))) : 1;
    return out[n.id];
  };
  nodes.forEach((n) => depth(n));
  return out;
}

// DM: add a node, or edit one when spec.id names an existing node. Returns { node } or { error }.
function save(d, spec = {}) {
  const name = str(spec.name, 40);
  const kind = KINDS.includes(spec.kind) ? spec.kind : 'room';
  const pill = str(spec.pill, 10);
  const note = str(spec.note, 300);
  const old = spec.id && byId(d, spec.id);
  if (old) {
    if (name) old.name = name;
    Object.assign(old, { kind, pill, note });
    return { node: old };
  }
  if (!name) return { error: 'Give the room a name.' };
  if (d.nodes.length >= MAX_NODES) return { error: `Too many rooms (${MAX_NODES}). Remove one first.` };
  const parent = spec.parent && byId(d, spec.parent) ? [spec.parent] : [];
  const node = { id: `d${++d.seq}`, name, kind, parents: parent, pill, note, revealed: !!spec.revealed, visited: false };
  d.nodes.push(node);
  return { node };
}

// DM: join or cut a rope from `from` down to `to`. A rope never points back up the tree.
function link(d, from, to, on = true) {
  const child = byId(d, to);
  if (!child || !byId(d, from) || from === to) return { error: 'Pick two different rooms.' };
  if (!on) { child.parents = child.parents.filter((p) => p !== from); return { ok: true }; }
  if (child.parents.includes(from)) return { ok: true };
  if (isAncestor(d, to, from)) return { error: 'That would make a loop.' };
  if (child.parents.length >= MAX_PARENTS) return { error: `A room has at most ${MAX_PARENTS} ways in.` };
  child.parents.push(from);
  return { ok: true };
}

// DM: remove a room. Its children keep their other parents; the party leaves it if it was there.
function remove(d, id) {
  if (!byId(d, id)) return false;
  d.nodes = d.nodes.filter((n) => n.id !== id);
  d.nodes.forEach((n) => { n.parents = n.parents.filter((p) => p !== id); });
  if (d.here === id) d.here = null;
  return true;
}

function reveal(d, id, on = true) {
  if (id === '*') { d.nodes.forEach((n) => { n.revealed = !!on; }); return true; }
  const n = byId(d, id);
  if (!n) return false;
  n.revealed = !!on;
  if (!on && d.here === id) d.here = null;
  return true;
}

// DM: the party moves into a room. It is revealed and marked as visited.
function moveTo(d, id) {
  const n = byId(d, id);
  if (!n) return null;
  d.here = id;
  n.revealed = true;
  n.visited = true;
  return n;
}

// ----- the way in and the way out -----
// Start rooms: the entrance rooms, or the rooms with no way in when none is marked as an entrance.
function starts(d) {
  const ent = d.nodes.filter((n) => n.kind === 'entrance');
  return ent.length ? ent : d.nodes.filter((n) => !n.parents.length);
}
// End rooms: the exit rooms, or the rooms with no way on when none is marked as an exit.
function ends(d) {
  const ex = d.nodes.filter((n) => n.kind === 'exit');
  return ex.length ? ex : d.nodes.filter((n) => !d.nodes.some((c) => c.parents.includes(n.id)));
}
// The party may leave the dungeon from a start or an end room (or before it has stepped into any room).
function canExit(d) {
  if (!d.here || !byId(d, d.here)) return true;
  return starts(d).some((n) => n.id === d.here) || ends(d).some((n) => n.id === d.here);
}
// Open the dungeon. A party that is not inside yet steps into the first start room, which reveals it.
function enter(d) {
  if (!d.nodes.length) return { error: 'The dungeon has no rooms yet.' };
  d.on = true;
  if (!byId(d, d.here)) moveTo(d, starts(d)[0]?.id || d.nodes[0].id);
  return { ok: true, here: byId(d, d.here) };
}
// Close the dungeon, only from a start or end room. The party's room is kept for the next visit.
function leave(d) {
  if (!d.on) return { ok: true };
  if (!canExit(d)) return { error: 'The party can only leave the dungeon from its entrance or its end.' };
  d.on = false;
  return { ok: true };
}

// What a viewer sees. The DM gets everything; anyone else gets the discovered (revealed) rooms only, with
// ropes between them. Hidden rooms do not reach the table at all. DM notes never leave the DM.
function viewFor(d, viewer) {
  if (!d) return null;
  if (viewer.role === 'dm') return { ...d, canExit: canExit(d) };
  if (!d.on) return { on: false, here: null, nodes: [] };
  const open = new Set(d.nodes.filter((n) => n.revealed).map((n) => n.id));
  const nodes = d.nodes.filter((n) => open.has(n.id)).map((n) => ({ id: n.id, name: n.name, kind: n.kind, pill: n.pill, parents: n.parents.filter((p) => open.has(p)), revealed: true, visited: n.visited }));
  return { on: true, here: open.has(d.here) ? d.here : null, nodes, canExit: canExit(d) };
}

module.exports = { KINDS, MAX_NODES, fresh, blank, example, byId, levels, save, link, remove, reveal, moveTo, viewFor, isAncestor, starts, ends, canExit, enter, leave };
