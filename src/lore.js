// Lore tab (Mike, Nov 16): the DM's record of the world, by category. Each entry has public text and a
// DM-only note. Phones see an entry (without the note) once the DM shares it; the TV and spectators see none.
//
// Since Nov 23 the Lore tab has no list of its own: it is a view of the world store (src/entities.js), where
// each entry is an entity record. The tab's fields map onto the record like this (docs/world-store.md):
//   cat  -> type (+ lore category or the location's dungeon flag)   text -> body   dm -> dmNotes
//   at   -> updatedAt (ms)   created -> createdAt (ms)   src -> sync (where the page lives in the lore repo)
const { str } = require('./util');
const E = require('./entities');

const CATS = { location: 'Locations', dungeon: 'Dungeons', npc: 'NPCs', faction: 'Factions', event: 'Events', creature: 'Creatures', item: 'Items', book: 'Books', note: 'Notes' };
const CAT_TYPE = { ...E.CAT_TYPE, faction: ['faction'], event: ['event'] };
const LORE_CATS = ['creature', 'item', 'book', 'note'];
const MAX = 500;
const LIMIT = { name: 80, text: 2000, dm: 2000 }; // what the tab's fields take when typing
const SCHEMA = { name: 120, text: 50000, dm: 20000 }; // what a record may hold (records from Arthuria can be longer)
const FIELD = { name: 'name', text: 'body', dm: 'dmNotes' };
// The fields the Lore tab knows. A record with any other type-specific field (an NPC's race, a location's map)
// came from Arthuria and keeps its type: the tab can rename and re-word it but not move it to another type.
const KNOWN = new Set([...E.BASE, 'category', 'dungeon']);

const ms = (iso) => Date.parse(iso) || 0;
function catOf(rec) {
  if (rec.type === 'location') return rec.dungeon ? 'dungeon' : 'location';
  if (rec.type === 'lore') return LORE_CATS.includes(rec.category) ? rec.category : 'note';
  return rec.type;
}
// A record as the Lore tab entry the pages draw.
function view(rec) {
  const e = { id: rec.id, cat: catOf(rec), name: rec.name, text: rec.body || '', dm: rec.dmNotes || '', shared: !!rec.shared, at: ms(rec.updatedAt), created: ms(rec.createdAt) || ms(rec.updatedAt), source: rec.source || 'tavern-screen' };
  if (rec.sync) e.src = { ...rec.sync };
  return e;
}
const records = (w) => Object.values(w || {}).filter((r) => CATS[catOf(r)]);
// Newest first, as the tab always listed them.
const list = (w) => records(w).sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || a.name.localeCompare(b.name)).map(view);
const find = (w, cat, name) => list(w).find((e) => e.cat === cat && e.name.toLowerCase() === String(name || '').trim().toLowerCase());

const clip = (k, v, prev = '') => str(v, Math.min(SCHEMA[k], Math.max(LIMIT[k], String(prev || '').length))); // never cuts words already there
function shape(rec, cat) {
  const [type, extra = {}] = CAT_TYPE[cat];
  rec.type = type;
  delete rec.category; delete rec.dungeon;
  Object.assign(rec, extra);
}

function add(w, { cat, name, text = '', dm = '' } = {}) {
  if (!CATS[cat]) return { error: 'Pick a category.' };
  const n = str(name, LIMIT.name).trim();
  if (!n) return { error: 'Give it a name.' };
  if (records(w).length >= MAX) return { error: `The lore holds ${MAX} entries.` };
  if (find(w, cat, n)) return { error: `${n} is already in ${CATS[cat]}.` };
  const rec = { name: n, source: 'tavern-screen', createdAt: new Date().toISOString() };
  shape(rec, cat);
  rec.id = E.newId(rec.type);
  if (text) rec.body = str(text, LIMIT.text);
  if (dm) rec.dmNotes = str(dm, LIMIT.dm);
  const r = E.put(w, rec);
  return r.error ? r : { ok: true, id: rec.id };
}

// Every reference to `from` in the world now points at `to` (a record moved to another type changes its ID).
function repoint(w, from, to) {
  const walk = (v) => (v === from ? to : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  for (const id of Object.keys(w)) w[id] = walk(w[id]);
}

// Edit from the tab. Lore tab edits leave `source` alone, so a record from Arthuria stays Arthuria's (and is not
// pushed to the lore repo). Returns { ok, id }: the ID changes when the category moves the entry to another type.
function edit(w, { id, ...patch } = {}) {
  const prev = w[id];
  if (!prev) return { error: 'No such entry.' };
  const rec = structuredClone(prev);
  if (patch.cat !== undefined && CATS[patch.cat] && patch.cat !== catOf(rec)) {
    const [type] = CAT_TYPE[patch.cat];
    if (type !== rec.type) {
      const odd = Object.keys(rec).filter((k) => !KNOWN.has(k));
      if (odd.length) return { error: `${rec.name} has ${rec.type} details from Arthuria (${odd.join(', ')}). Change its type there.` };
    }
    shape(rec, patch.cat);
    if (type !== prev.type) {
      const key = id.slice(id.indexOf('_') + 1);
      rec.id = w[`${type}_${key}`] ? E.newId(type) : `${type}_${key}`;
    }
  }
  for (const k of ['name', 'text', 'dm']) {
    if (patch[k] === undefined) continue;
    const v = clip(k, patch[k], prev[FIELD[k]]);
    if (k === 'name') rec.name = v.trim() || 'Untitled';
    else if (v) rec[FIELD[k]] = v; else delete rec[FIELD[k]];
  }
  if (patch.shared !== undefined) { if (patch.shared) rec.shared = true; else delete rec.shared; }
  const r = E.put(w, rec);
  if (r.error) return r;
  if (rec.id !== id) { delete w[id]; repoint(w, id, rec.id); }
  return { ok: true, id: rec.id };
}

const remove = (w, id) => E.remove(id, w);

// The lore repo sync records where an entry's page lives without making the entry read as changed here.
function setSync(w, id, src) {
  const rec = w[id];
  if (!rec) return false;
  const copy = { ...rec, sync: { folder: String(src.folder || ''), path: String(src.path || ''), sha: String(src.sha || ''), hash: String(src.hash || ''), at: Number(src.at) || 0 } };
  return !E.put(w, copy, { touch: false }).error;
}

// Bookkeeping: pull the names the table already knows (world map places and dungeons, the social cast and
// the NPC speaking now) into the lore, skipping what is there. Returns how many were added.
function pull(w, state) {
  let n = 0;
  const put = (cat, name, text) => { if (name && add(w, { cat, name, text }).ok) n++; };
  for (const node of state.worldMap?.nodes || []) put(node.dungeon ? 'dungeon' : 'location', node.name, node.info || '');
  const who = (c) => (c.kind === 'item' ? 'item' : 'npc');
  for (const c of state.social?.cast || []) put(who(c), c.name, '');
  if (state.social?.npc?.name) put(who(state.social.npc), state.social.npc.name, '');
  // The DM's own item cards (not the samples), so the lore sync can carry them to the lore repo.
  for (const it of require('./itemlib').lib.list()) if (!it.sample) put('item', it.name, it.note || '');
  return n;
}

// Phones get shared entries without the DM note, the lore repo link or the source; the TV and spectators get none.
function viewFor(w, viewer) {
  if (viewer.role === 'dm') return list(w);
  if (viewer.role !== 'player') return [];
  return list(w).filter((e) => e.shared).map(({ dm, src, source, ...e }) => e);
}

module.exports = { CATS, MAX, catOf, view, list, find, add, edit, remove, setSync, pull, viewFor };
