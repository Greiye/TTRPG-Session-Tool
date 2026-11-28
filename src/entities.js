// The world store (Nov 23: one store for the Lore tab and the Arthuria world library). Every NPC, location,
// faction, event and lore entry is one record shaped by schema/entity.schema.json, keyed by its stable ID, in
// state.world. It is part of the campaign save, so undo, save points and startup backups cover it. The Lore tab
// (src/lore.js) is a view of these records; the campaign bundle (src/bundle.js) exports and imports them.
// Player characters stay in the roster and are exported as type "pc" with id "pc_<roster id>".
//
// Before Nov 23 there were two stores: data/entities.json (bundle imports) and state.lore (the Lore tab).
// migrate() folds both into state.world, losing nothing; see docs/world-store.md.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { DATA_DIR, ROOT } = require('./config');
const { readJson, writeJson } = require('./store');

const LEGACY_FILE = path.join(DATA_DIR, 'entities.json');
const TYPES = ['npc', 'location', 'faction', 'event', 'lore'];
const ID_RE = /^(npc|location|faction|event|lore)_[A-Za-z0-9-]{4,40}$/;
// Fields every type may carry (schema/common.schema.json base); the rest belong to one type.
const BASE = ['id', 'type', 'name', 'summary', 'body', 'dmNotes', 'tags', 'image', 'links', 'source', 'updatedAt', 'createdAt', 'shared', 'sync'];

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
for (const f of ['common', 'entity', 'bundle']) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', `${f}.schema.json`), 'utf8')));
const validateEntity = ajv.getSchema('https://tavern-screen.local/schema/v1/entity.schema.json');
const validateBundle = ajv.getSchema('https://tavern-screen.local/schema/v1/bundle.schema.json');
const errorsText = (v) => (v.errors || []).slice(0, 5).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const newId = (type) => `${type}_${crypto.randomBytes(5).toString('hex')}`;
const now = () => new Date().toISOString();
const world = () => require('./state').state.world; // read each time: undo and save points replace the object

// A clean world object: only records with a valid ID under their own key and a known type.
function ensure(w) {
  const out = {};
  if (w && typeof w === 'object' && !Array.isArray(w)) for (const [k, e] of Object.entries(w)) if (e && e.id === k && ID_RE.test(k) && TYPES.includes(e.type)) out[k] = e;
  return out;
}

// Fields that only make sense at this table: kept when another app writes the record again.
const LOCAL = ['shared', 'sync', 'createdAt'];

// Write one record after checking it against the schema. `touch` (default) stamps updatedAt; the lore repo sync
// passes false when it only records where a page lives, so the entry does not read as changed at the table.
function put(w, e, { touch = true } = {}) {
  if (touch || !e.updatedAt) e.updatedAt = now();
  if (!validateEntity(e)) return { error: errorsText(validateEntity) };
  w[e.id] = e;
  return { entity: e };
}

// Create or update from outside the Lore tab (DM editor, bundle import). Returns { entity } or { error }.
function upsert(input, source = 'tavern-screen', w = world()) {
  const e = { ...input };
  if (!TYPES.includes(e.type)) return { error: `type must be one of ${TYPES.join(', ')}` };
  if (!e.id) e.id = newId(e.type);
  const prev = w[e.id];
  if (prev && prev.type !== e.type) return { error: 'An entity with that ID has a different type.' };
  for (const k of LOCAL) if (e[k] === undefined && prev?.[k] !== undefined) e[k] = prev[k];
  e.createdAt ??= now();
  e.source = source;
  return put(w, e);
}
function remove(id, w = world()) { if (w[id]) { delete w[id]; return true; } return false; }
const all = (w = world()) => Object.values(w || {});

// ----- migration (Nov 23) -----

// An old Lore tab entry as a world record. Lore tab categories map onto entity types.
const CAT_TYPE = { npc: ['npc'], location: ['location'], dungeon: ['location', { dungeon: true }], creature: ['lore', { category: 'creature' }], item: ['lore', { category: 'item' }], book: ['lore', { category: 'book' }], note: ['lore', { category: 'note' }] };
const iso = (ms) => new Date(Number(ms) || Date.now()).toISOString();
function fromLoreEntry(old) {
  const [type, extra] = CAT_TYPE[old.cat] || CAT_TYPE.note;
  // The old id becomes the key, so the same entry from an older save point lands on the same record.
  let key = String(old.id || '').replace(/[^A-Za-z0-9-]/g, '-').slice(0, 40);
  if (key.length < 4) key = `old-${crypto.createHash('sha1').update(`${old.cat}|${old.name}`).digest('hex').slice(0, 10)}`;
  const e = { id: `${type}_${key}`, type, name: String(old.name || 'Untitled').slice(0, 120), ...(extra || {}), source: 'tavern-screen', createdAt: iso(old.created || old.at), updatedAt: iso(old.at) };
  if (old.text) e.body = String(old.text);
  if (old.dm) e.dmNotes = String(old.dm);
  if (old.shared) e.shared = true;
  if (old.src && typeof old.src === 'object') e.sync = { folder: String(old.src.folder || ''), path: String(old.src.path || ''), sha: String(old.src.sha || ''), hash: String(old.src.hash || ''), at: Number(old.src.at) || 0 };
  return e;
}

// A Lore tab entry and a library record with the same type and name are one thing when their words do not
// disagree: the entry fills the record's empty fields. If both hold different words, both are kept.
function sameThing(rec, e) {
  if (rec.type !== e.type || rec.name.toLowerCase() !== e.name.toLowerCase()) return false;
  if (e.type === 'lore' && (rec.category || 'note') !== e.category) return false;
  if (e.type === 'location' && !!rec.dungeon !== !!e.dungeon) return false;
  const fits = (a, b) => !a || !b || a === b;
  return fits(rec.body, e.body) && fits(rec.dmNotes, e.dmNotes) && !(rec.sync && e.sync);
}

// Fold the old stores into the world: data/entities.json (once) and any Lore tab list (state.lore, also found
// in save points and undo steps from before the merge). Returns counts for the log. Nothing is deleted:
// data/entities.json stays on disk, and the first migration copies the old Lore tab to data/lore-before-merge.json.
function migrate(state) {
  const w = (state.world = ensure(state.world));
  const out = { library: 0, lore: 0, joined: 0, skipped: [] };
  if (!state.worldMerged) {
    const legacy = readJson(LEGACY_FILE);
    for (const [k, e] of Object.entries(legacy || {})) {
      if (w[k]) continue;
      if (e && e.id === k && ID_RE.test(k) && validateEntity(e)) { w[k] = e; out.library++; } else out.skipped.push(`${k}: ${(e && errorsText(validateEntity)) || 'not a record'}`);
    }
    const copy = path.join(DATA_DIR, 'lore-before-merge.json');
    if (Array.isArray(state.lore) && state.lore.length && !fs.existsSync(copy)) { try { writeJson(copy, state.lore); } catch { /* the startup backup has it too */ } }
    state.worldMerged = 1;
  }
  for (const old of Array.isArray(state.lore) ? state.lore : []) {
    if (!old || !old.name) continue;
    const e = fromLoreEntry(old);
    const twin = !w[e.id] && all(w).find((rec) => sameThing(rec, e));
    if (twin) {
      const copy = { ...twin };
      for (const k of ['body', 'dmNotes', 'shared', 'sync', 'createdAt']) if (e[k] !== undefined && copy[k] === undefined) copy[k] = e[k];
      if (!validateEntity(copy)) { out.skipped.push(`${old.name}: ${errorsText(validateEntity)}`); continue; }
      w[twin.id] = copy;
      out.joined++;
      continue;
    }
    if (!validateEntity(e)) { out.skipped.push(`${old.name}: ${errorsText(validateEntity)}`); continue; }
    w[e.id] = e;
    out.lore++;
  }
  delete state.lore;
  return out;
}

module.exports = { TYPES, BASE, ID_RE, CAT_TYPE, LEGACY_FILE, upsert, put, remove, all, ensure, migrate, fromLoreEntry, newId, validateEntity, validateBundle, errorsText, world, flush: () => {} };
