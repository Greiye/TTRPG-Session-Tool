// Dungeon nodes (exploration): a branching tree of rooms the party moves through, drawn on the TV as cards
// on levels joined by ropes. Each node lists its parents, so a room can be reached from more than one place.
// The DM sees everything. The TV and phones see revealed rooms, plus a fogged "???" card for each unrevealed
// room that leads off a revealed one, so the party knows a way exists without knowing what is there.
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

function example() {
  const nodes = EXAMPLE.map(([id, name, kind, parents, pill]) => ({ id, name, kind, parents, pill, note: '', revealed: id === 'd1', visited: id === 'd1' }));
  return { on: true, here: 'd1', nodes, seq: EXAMPLE.length };
}
const fresh = example;
const blank = () => ({ on: true, here: null, nodes: [], seq: 0 });

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

// What a viewer sees. The DM gets everything; anyone else gets revealed rooms, and fogged rooms one step
// past a revealed room (no name, kind, pill or note). DM notes never leave the DM.
function viewFor(d, viewer) {
  if (!d) return null;
  if (viewer.role === 'dm') return d;
  if (!d.on) return { on: false, here: null, nodes: [] };
  const open = new Set(d.nodes.filter((n) => n.revealed).map((n) => n.id));
  const nodes = [];
  for (const n of d.nodes) {
    if (open.has(n.id)) nodes.push({ id: n.id, name: n.name, kind: n.kind, pill: n.pill, parents: n.parents, revealed: true, visited: n.visited });
    else if (n.parents.some((p) => open.has(p))) nodes.push({ id: n.id, name: null, kind: null, pill: '', parents: n.parents.filter((p) => open.has(p)), revealed: false, visited: false, fog: true });
  }
  const shown = new Set(nodes.map((n) => n.id));
  nodes.forEach((n) => { n.parents = n.parents.filter((p) => shown.has(p)); });
  return { on: true, here: open.has(d.here) ? d.here : null, nodes };
}

module.exports = { KINDS, MAX_NODES, fresh, blank, example, byId, levels, save, link, remove, reveal, moveTo, viewFor, isAncestor };
