// NPC and faction relationship web (Phase F). The DM draws how NPCs, factions and places feel about the
// party and about each other. An edge value runs from -100 (hostile) to +100 (allied), on the same scale
// as faction reputation (src/factions.js). The DM sees the numbers. The TV sees tiers, and only parts the
// DM has revealed. Phones and spectators see nothing of the web.
const { str, int } = require('./util');
const factions = require('./factions');

const KINDS = ['npc', 'faction', 'place'];
const PARTY = 'party';
const MAX_NODES = 20;
const MAX_EDGES = 60;

// A new web: the party is always there, and it is revealed from the start.
function fresh() {
  return { nodes: [{ id: PARTY, name: 'The party', kind: 'party', ref: null, revealed: true }], edges: [], showTv: false };
}

// DM: add an NPC or place by name, or a faction by its existing id (state.factions). Returns { node } or { error }.
function addNode(w, spec, id, factionList) {
  if (w.nodes.length >= MAX_NODES) return { error: `Too many nodes (${MAX_NODES}). Remove one first.` };
  const kind = KINDS.includes(spec.kind) ? spec.kind : null;
  if (!kind) return { error: 'Pick a kind: NPC, faction or place.' };
  let name = str(spec.name, 60);
  let ref = null;
  if (kind === 'faction') {
    const f = factions.find({ factions: factionList }, spec.ref);
    if (!f) return { error: 'Pick a faction from the reputation list first.' };
    if (w.nodes.some((n) => n.ref === f.id)) return { error: `${f.name} is already on the web.` };
    name = f.name; ref = f.id;
  }
  if (!name) return { error: 'Give it a name.' };
  if (w.nodes.some((n) => n.name.toLowerCase() === name.toLowerCase())) return { error: `${name} is already on the web.` };
  const node = { id, name, kind, ref, revealed: false };
  w.nodes.push(node);
  return { node };
}

// DM: how one node feels about another, from -100 to +100, with an optional label. One edge per ordered pair.
function addEdge(w, spec, id) {
  if (w.edges.length >= MAX_EDGES) return { error: `Too many links (${MAX_EDGES}). Remove one first.` };
  const from = w.nodes.find((n) => n.id === spec.from);
  const to = w.nodes.find((n) => n.id === spec.to);
  if (!from || !to || from === to) return { error: 'Pick two different nodes.' };
  if (w.edges.some((e) => e.from === from.id && e.to === to.id)) return { error: `${from.name} already has a link to ${to.name}. Change that one.` };
  const edge = { id, from: from.id, to: to.id, value: int(spec.value, -100, 100, 0), label: str(spec.label, 40), revealed: false };
  w.edges.push(edge);
  return { edge };
}

// Reveal or hide a node or an edge. An edge also needs both of its nodes revealed to show on the TV.
function reveal(w, kind, id, on) {
  const item = kind === 'edge' ? w.edges.find((e) => e.id === id) : w.nodes.find((n) => n.id === id);
  if (!item || (kind === 'node' && id === PARTY)) return false;
  item.revealed = !!on;
  return true;
}

function setValue(w, edgeId, value) {
  const e = w.edges.find((x) => x.id === edgeId);
  if (!e) return false;
  e.value = int(value, -100, 100, 0);
  return true;
}

// Remove a node (never the party) with its links, or a single link.
function remove(w, kind, id) {
  if (kind === 'edge') { w.edges = w.edges.filter((e) => e.id !== id); return true; }
  if (id === PARTY || !w.nodes.some((n) => n.id === id)) return false;
  w.nodes = w.nodes.filter((n) => n.id !== id);
  w.edges = w.edges.filter((e) => e.from !== id && e.to !== id);
  return true;
}

// Faction nodes take their tier from the reputation list. Edge values show as a tier label.
const tierInfo = (value) => { const t = factions.tierOf(value); return { tier: t.id, tierLabel: t.label }; };
const nodeTier = (n, factionList) => {
  const f = n.ref ? factions.find({ factions: factionList }, n.ref) : null;
  return f ? { tier: factions.tierOf(f.rep).id, tierLabel: factions.tierOf(f.rep).label } : {};
};

// The DM sees everything with numbers. The TV sees only revealed parts, with tiers, and only once shown.
// Phones, spectators and guests get null.
function viewFor(w, viewer, factionList) {
  if (!w) return null;
  if (viewer.role === 'dm') {
    return { ...w, nodes: w.nodes.map((n) => ({ ...n, ...nodeTier(n, factionList) })), edges: w.edges.map((e) => ({ ...e, ...tierInfo(e.value) })) };
  }
  if (viewer.role !== 'screen') return null;
  const nodes = w.nodes.filter((n) => n.revealed).map((n) => ({ id: n.id, name: n.name, kind: n.kind, revealed: true, ...nodeTier(n, factionList) }));
  const shown = new Set(nodes.map((n) => n.id));
  const edges = w.edges.filter((e) => e.revealed && shown.has(e.from) && shown.has(e.to))
    .map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label, revealed: true, ...tierInfo(e.value) }));
  return { showTv: !!w.showTv, nodes, edges };
}

module.exports = { KINDS, PARTY, MAX_NODES, MAX_EDGES, fresh, addNode, addEdge, reveal, setValue, remove, viewFor };
