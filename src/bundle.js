// Campaign bundle export/import (0l) and session transcript export.
// A bundle is one JSON file (schema/bundle.schema.json): entities, player characters as "pc"
// entities, and their portrait files embedded as base64, so it can be emailed or dropped into Arthuria.
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('./config');
const { entities, upsert, validateBundle, validateEntity, errorsText } = require('./entities');
const { roster, saveRoster } = require('./roster');
const { state } = require('./state');
const rules = require('./rules');
const { MIME_EXT, KINDS, sniff } = require('./assets');

const STAT_KEYS = ['hp', 'maxHp', 'ac', 'atk', 'dmg', 'init', 'skills', 'hope', 'fear', 'tempHp', 'abilities', 'saveProf', 'speed', 'slots', 'hitDice', 'languages', 'inventory', 'spells'];

function fileFromUrl(url, files) {
  if (!url || !url.startsWith('/uploads/')) return undefined;
  const rel = url.slice('/uploads/'.length);
  const abs = path.join(UPLOAD_DIR, path.normalize(rel));
  if (!abs.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(abs)) return undefined;
  const key = rel.includes('/') ? rel : `media/${rel}`;
  files[key] = fs.readFileSync(abs).toString('base64');
  return key;
}

function pcEntity(c, files) {
  return {
    id: `pc_${c.id}`, type: 'pc', name: c.name || 'Unnamed', summary: [c.race, c.cls].filter(Boolean).join(' '),
    body: c.backstory || '', dmNotes: [c.hooks && `Hooks: ${c.hooks}`, c.secret && `Secret: ${c.secret}`].filter(Boolean).join('\n\n'),
    system: c.system || rules.DEFAULT, cls: c.cls, race: c.race, level: c.level, player: c.player, catchphrase: c.catchphrase || '', hue: c.hue,
    stats: Object.fromEntries(STAT_KEYS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])),
    ...(c.anim ? { anim: c.anim } : {}),
    ...(c.portrait ? { image: fileFromUrl(c.portrait, files) } : {}),
    source: 'tavern-screen',
  };
}

function exportBundle({ includeDmNotes = true } = {}) {
  const files = {};
  const list = [...Object.values(entities).map((e) => ({ ...e })), ...Object.values(roster).map((c) => pcEntity(c, files))];
  for (const e of list) {
    if (e.type !== 'pc' && e.image) e.image = fileFromUrl(`/uploads/${e.image}`, files);
    if (!e.image) delete e.image;
    if (!includeDmNotes || !e.dmNotes) delete e.dmNotes;
  }
  return { format: 'tavern-bundle', version: 1, exportedAt: new Date().toISOString(), source: 'tavern-screen', campaign: { name: state.scene.title, system: state.system }, entities: list,
    creatures: require('./creatures').lib.list(), spells: require('./spells').lib.list(), files };
}

// Import: upserts by stable ID (same ID = same record, newer import wins). Returns a summary.
function importBundle(bundle) {
  if (!validateBundle(bundle)) return { error: errorsText(validateBundle) };
  const written = {};
  const saveFile = (key) => {
    if (!key || written[key] !== undefined) return written[key];
    const b64 = bundle.files?.[key];
    if (!b64) return (written[key] = null);
    const buf = Buffer.from(b64, 'base64');
    const ext = path.extname(key).slice(1).toLowerCase();
    // Only known image/video types, matching their bytes, within the portrait size limit.
    if (!Object.values(MIME_EXT).includes(ext) || !sniff(buf).includes(ext) || buf.length > KINDS.creature.maxBytes) return (written[key] = null);
    const dir = key.startsWith('portraits/') ? 'portraits' : 'creatures';
    const name = `${Date.now().toString(36)}-${path.basename(key).replace(/[^\w.-]/g, '')}`;
    fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, dir, name), buf);
    return (written[key] = `/uploads/${dir}/${name}`);
  };
  const out = { entities: 0, characters: 0, skipped: [] };
  for (const e of bundle.entities) {
    if (e.type === 'pc') {
      const id = e.id.slice(3);
      const c = roster[id] || (roster[id] = { id, skills: {}, dmg: [1, 6, 0], hp: 10, maxHp: 10, ac: 10, atk: 0, init: 0, theme: null, secret: '', hooks: '' });
      Object.assign(c, { name: e.name, system: e.system || c.system || rules.DEFAULT, cls: e.cls ?? c.cls, race: e.race ?? c.race, level: e.level ?? c.level ?? 1,
        player: e.player ?? c.player ?? '', catchphrase: e.catchphrase ?? c.catchphrase ?? '', hue: e.hue ?? c.hue ?? 40, backstory: e.body ?? c.backstory ?? '' });
      if (e.stats) for (const k of STAT_KEYS) if (e.stats[k] !== undefined) c[k] = e.stats[k];
      if (e.anim) c.anim = e.anim;
      const img = saveFile(e.image);
      if (img) c.portrait = img;
      out.characters++;
      continue;
    }
    const copy = { ...e };
    const img = saveFile(e.image);
    if (img) copy.image = img.slice('/uploads/'.length); else delete copy.image;
    const r = upsert(copy, bundle.source || 'arthuria');
    if (r.error) out.skipped.push(`${e.id}: ${r.error}`); else out.entities++;
  }
  for (const c of Object.values(roster)) require('./sheet').ensureSheet(c);
  const lib = require('./srd').importJson({ monsters: bundle.creatures || [], spells: bundle.spells || [] });
  out.creatures = lib.monsters; out.spells = lib.spells;
  saveRoster();
  return out;
}

// Session transcript as Markdown: a script, scene by scene, for recaps and Arthuria.
function transcript({ title } = {}) {
  const lines = [`# ${title || state.scene.title}`, '', `_Session transcript, exported ${new Date().toLocaleString()}_`, ''];
  for (const l of state.log) {
    if (l.vis && l.vis !== 'all') continue; // DM-only and private entries stay out
    const time = new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const mode = l.kind === 'system' && l.text.match(/^— (\w+) —$/);
    if (mode) { lines.push('', `## ${mode[1][0]}${mode[1].slice(1).toLowerCase()} (${time})`, ''); continue; }
    if (l.kind === 'npc') lines.push(`**${l.who}**${l.emotion && l.emotion !== 'neutral' ? ` _(${l.emotion})_` : ''}: ${l.text}`, '');
    else if (l.kind === 'say') lines.push(`**${l.who}**: ${l.text}`, '');
    else if (l.kind === 'narrate') lines.push(`> ${l.text}`, '');
    else if (l.kind === 'action') lines.push(`_${l.who} ${l.text.replace(/^I /, '')}_`, '');
    else lines.push(`- ${l.text}`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

module.exports = { exportBundle, importBundle, transcript, validateEntity };
