// World entities shared with Arthuria (0l): NPCs, locations, factions, events, lore entries.
// Stored in data/entities.json keyed by stable ID. Player characters stay in the roster and are
// exported as type "pc" with id "pc_<roster id>".
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const { DATA_DIR, ROOT } = require('./config');
const { writeJson, readJson } = require('./store');

const FILE = path.join(DATA_DIR, 'entities.json');
const TYPES = ['npc', 'location', 'faction', 'event', 'lore'];
const entities = Object.assign(Object.create(null), readJson(FILE) || {}); // null prototype: ids can't hit built-ins

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
for (const f of ['common', 'entity', 'bundle']) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', `${f}.schema.json`), 'utf8')));
const validateEntity = ajv.getSchema('https://tavern-screen.local/schema/v1/entity.schema.json');
const validateBundle = ajv.getSchema('https://tavern-screen.local/schema/v1/bundle.schema.json');
const errorsText = (v) => (v.errors || []).slice(0, 5).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const newId = (type) => `${type}_${crypto.randomBytes(5).toString('hex')}`;
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(() => writeJson(FILE, entities), 300); };

// Create or update. Returns { entity } or { error }.
function upsert(input, source = 'tavern-screen') {
  const e = { ...input };
  if (!TYPES.includes(e.type)) return { error: `type must be one of ${TYPES.join(', ')}` };
  if (!e.id) e.id = newId(e.type);
  if (entities[e.id] && entities[e.id].type !== e.type) return { error: 'An entity with that ID has a different type.' };
  e.source = source;
  e.updatedAt = new Date().toISOString();
  if (!validateEntity(e)) return { error: errorsText(validateEntity) };
  entities[e.id] = e;
  save();
  return { entity: e };
}
function remove(id) { if (entities[id]) { delete entities[id]; save(); return true; } return false; }

module.exports = { entities, TYPES, upsert, remove, newId, validateEntity, validateBundle, errorsText, flush: () => { clearTimeout(timer); writeJson(FILE, entities); } };
