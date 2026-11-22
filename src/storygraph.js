// Story Nodes Graph (Mike, Nov 21): a DM-only board in Planning that connects what the DM knows, such as a PC's
// plot hook, the NPC who carries it, the place it leads to and the clue that points there. Choice echoes
// (src/moments.js, state.tv.echoes) live here too: each planted echo is an "echo" node, so it can be linked
// to the hook or choice it answers.
//
// state.storyGraph = { nodes: [{ id, kind, title, note, x, y, pc?, echoId?, done? }], links: [{ id, a, b, label }] }
// x and y are 0..1000 and 0..700 on the board. Never sent to phones, the TV or helpers (src/visibility.js).
// Pure logic: src/sockets/storygraph.js broadcasts.
const crypto = require('crypto');
const { str } = require('./util');

// Kinds are labels for colour and filtering; nothing in the rules reads them (system-agnostic).
const KINDS = ['hook', 'pc', 'npc', 'place', 'clue', 'event', 'secret', 'echo'];
const W = 1000;
const H = 700;
const MAX_NODES = 200;
const MAX_LINKS = 400;

const fresh = () => ({ nodes: [], links: [] });
const id = (p) => p + crypto.randomBytes(4).toString('hex');
const clampX = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Math.max(0, Math.min(W, Number(v)))) : d);
const clampY = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Math.max(0, Math.min(H, Number(v)))) : d);

// Older saves have no board.
function ensure(s) {
  if (!s.storyGraph || !Array.isArray(s.storyGraph.nodes) || !Array.isArray(s.storyGraph.links)) s.storyGraph = fresh();
  return s.storyGraph;
}

// A free spot for a new node: a loose spiral out from the centre, away from the nodes already there.
function spot(g) {
  for (let i = 0; i < 80; i++) {
    const a = i * 2.4;
    const r = 40 + i * 9;
    const x = Math.round(W / 2 + Math.cos(a) * r * 1.3);
    const y = Math.round(H / 2 + Math.sin(a) * r * 0.8);
    if (x < 70 || x > W - 70 || y < 40 || y > H - 40) continue;
    if (g.nodes.every((n) => Math.abs(n.x - x) > 150 || Math.abs(n.y - y) > 70)) return { x, y };
  }
  return { x: 80 + Math.round(Math.random() * (W - 160)), y: 50 + Math.round(Math.random() * (H - 100)) };
}

// Add a node: { kind, title, note, x?, y?, pc?, echoId? }. Returns the node or { error }.
function add(g, f = {}) {
  if (g.nodes.length >= MAX_NODES) return { error: `The board holds ${MAX_NODES} nodes.` };
  const title = str(f.title, 80).trim();
  if (!title) return { error: 'Give the node a title.' };
  const kind = KINDS.includes(f.kind) ? f.kind : 'hook';
  const at = f.x === undefined || f.y === undefined ? spot(g) : { x: clampX(f.x, W / 2), y: clampY(f.y, H / 2) };
  const n = { id: id('n'), kind, title, note: str(f.note, 400), ...at };
  if (f.pc) n.pc = str(f.pc, 40);
  if (f.echoId) n.echoId = str(f.echoId, 20);
  g.nodes.push(n);
  return n;
}

// Edit a node: title, note, kind, pc, or move it (x, y).
function edit(g, f = {}) {
  const n = g.nodes.find((x) => x.id === f.id);
  if (!n) return { error: 'No such node.' };
  if (f.title !== undefined) n.title = str(f.title, 80).trim() || n.title;
  if (f.note !== undefined) n.note = str(f.note, 400);
  if (f.kind !== undefined && KINDS.includes(f.kind) && !n.echoId) n.kind = f.kind;
  if (f.pc !== undefined) { if (f.pc) n.pc = str(f.pc, 40); else delete n.pc; }
  if (f.x !== undefined) n.x = clampX(f.x, n.x);
  if (f.y !== undefined) n.y = clampY(f.y, n.y);
  return n;
}

// Remove a node and its links. Returns the node (the caller cancels its echo, if any).
function remove(g, nodeId) {
  const n = g.nodes.find((x) => x.id === nodeId);
  if (!n) return null;
  g.nodes = g.nodes.filter((x) => x !== n);
  g.links = g.links.filter((l) => l.a !== nodeId && l.b !== nodeId);
  return n;
}

// Connect two nodes (one link per pair, either way round). Returns the link or { error }.
function link(g, { a, b, label } = {}) {
  if (!a || !b || a === b) return { error: 'Pick two different nodes.' };
  if (!g.nodes.some((n) => n.id === a) || !g.nodes.some((n) => n.id === b)) return { error: 'No such node.' };
  const have = g.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (have) { if (label !== undefined) have.label = str(label, 40); return have; }
  if (g.links.length >= MAX_LINKS) return { error: `The board holds ${MAX_LINKS} links.` };
  const l = { id: id('l'), a, b, label: str(label, 40) };
  g.links.push(l);
  return l;
}
const unlink = (g, linkId) => { g.links = g.links.filter((l) => l.id !== linkId); };
function relabel(g, { id: linkId, label } = {}) {
  const l = g.links.find((x) => x.id === linkId);
  if (l) l.label = str(label, 40);
  return l || null;
}

// Keep echo nodes in step with the planted echoes, however they were planted, fired or cancelled:
// a planted echo without a node gets one; a node whose echo has gone (fired or cancelled) is marked done.
// Returns true if anything changed.
function sync(s) {
  const g = ensure(s);
  const echoes = s.tv?.echoes || [];
  let changed = false;
  for (const e of echoes) {
    if (g.nodes.some((n) => n.echoId === e.id)) continue;
    if (g.nodes.length >= MAX_NODES) break;
    g.nodes.push({ id: id('n'), kind: 'echo', title: str(e.decision, 80), note: str(e.consequence, 400), echoId: e.id, ...spot(g) });
    changed = true;
  }
  for (const n of g.nodes) {
    if (!n.echoId || n.done) continue;
    if (!echoes.some((e) => e.id === n.echoId)) { n.done = true; changed = true; }
  }
  return changed;
}

module.exports = { KINDS, W, H, fresh, ensure, add, edit, remove, link, unlink, relabel, sync };
