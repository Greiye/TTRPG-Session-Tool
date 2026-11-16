// Lore tab (Mike, Nov 16): the DM's record of the world, by category. Each entry has public text and a
// DM-only note. Phones see an entry (without the note) once the DM shares it; the TV and spectators see none.
const { str } = require('./util');

const CATS = { location: 'Locations', dungeon: 'Dungeons', npc: 'NPCs', creature: 'Creatures', item: 'Items', book: 'Books', note: 'Notes' };
const MAX = 500;
const fresh = () => [];
const ensure = (lore) => (Array.isArray(lore) ? lore.filter((e) => e && CATS[e.cat]) : fresh());
const newId = () => `lore${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (e) => ({ name: str(e.name, 80).trim(), text: str(e.text, 2000), dm: str(e.dm, 2000) });

function add(lore, { cat, name, text = '', dm = '' } = {}) {
  if (!CATS[cat]) return { error: 'Pick a category.' };
  const c = clean({ name, text, dm });
  if (!c.name) return { error: 'Give it a name.' };
  if (lore.length >= MAX) return { error: `The lore holds ${MAX} entries.` };
  if (lore.some((e) => e.cat === cat && e.name.toLowerCase() === c.name.toLowerCase())) return { error: `${c.name} is already in ${CATS[cat]}.` };
  const e = { id: newId(), cat, ...c, shared: false, at: Date.now() };
  lore.unshift(e);
  return { ok: true, id: e.id };
}

function edit(lore, { id, ...patch } = {}) {
  const e = lore.find((x) => x.id === id);
  if (!e) return { error: 'No such entry.' };
  if (patch.cat !== undefined && CATS[patch.cat]) e.cat = patch.cat;
  for (const k of ['name', 'text', 'dm']) if (patch[k] !== undefined) e[k] = clean({ ...e, [k]: patch[k] })[k];
  if (!e.name) e.name = 'Untitled';
  if (patch.shared !== undefined) e.shared = !!patch.shared;
  e.at = Date.now();
  return { ok: true };
}

function remove(lore, id) {
  const i = lore.findIndex((x) => x.id === id);
  if (i < 0) return false;
  lore.splice(i, 1);
  return true;
}

// Bookkeeping: pull the names the table already knows (world map places and dungeons, the social cast and
// the NPC speaking now) into the lore, skipping what is there. Returns how many were added.
function pull(lore, state) {
  let n = 0;
  const put = (cat, name, text) => { if (name && add(lore, { cat, name, text }).ok) n++; };
  for (const node of state.worldMap?.nodes || []) put(node.dungeon ? 'dungeon' : 'location', node.name, node.info || '');
  const who = (c) => (c.kind === 'item' ? 'item' : 'npc');
  for (const c of state.social?.cast || []) put(who(c), c.name, '');
  if (state.social?.npc?.name) put(who(state.social.npc), state.social.npc.name, '');
  return n;
}

// Phones get shared entries without the DM note; the TV and spectators get none.
function viewFor(lore, viewer) {
  if (viewer.role === 'dm') return lore || [];
  if (viewer.role !== 'player') return [];
  return (lore || []).filter((e) => e.shared).map(({ dm, ...e }) => e);
}

module.exports = { CATS, MAX, fresh, ensure, add, edit, remove, pull, viewFor };
