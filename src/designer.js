// Creature Designer (Mike, Nov 16, backlog PR W): the DM's own peoples, beasts, monsters and named persons,
// system-agnostic. Every number is a free name/value pair (a Daggerheart, 5e or homebrew stat line all fit),
// and each design round-trips to one Markdown page in the lore wiki (src/wiki.js, docs/creature-wiki-format.md).
//
// Design: { id, kind, name, title, summary, image, tags[], race, details[{name,value}], stats[{name,value}],
//   vitals[{name,value}], skills[{name,value}], abilities[{name,cost,roll,text}], inventory[{name,qty,note}],
//   lore (Markdown), dm (DM-only Markdown), wiki: { path, sha, at } | null, updatedAt }
const crypto = require('crypto');
const { library } = require('./library');
const { str, int, slug } = require('./util');

const KINDS = {
  people: { icon: '🧝', name: 'People', hint: 'A sentient race or ancestry: elves, Emberkin, goblins' },
  beast: { icon: '🐺', name: 'Beast', hint: 'An animal or mount: wolves, desert walking catfish' },
  monster: { icon: '👹', name: 'Monster', hint: 'An aberration, demon or other horror' },
  person: { icon: '🧑', name: 'Person', hint: 'One named sentient: an NPC, villain or hero' },
};
// Details each kind starts with; the DM can rename, clear or add any.
const DETAILS = {
  people: ['Size', 'Lifespan', 'Homeland', 'Languages', 'Appearance', 'Society', 'Names'],
  beast: ['Size', 'Habitat', 'Diet', 'Temperament', 'Tameable', 'Pack size'],
  monster: ['Size', 'Habitat', 'Origin', 'Threat', 'Weakness'],
  person: ['Role', 'Faction', 'Location', 'Age', 'Personality', 'Wants', 'Fears', 'Voice'],
};
// Stat and vitals presets: buttons that fill the rows. The DM's own system is "Custom".
const PRESETS = {
  daggerheart: { name: 'Daggerheart', stats: ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'], vitals: ['HP', 'Stress', 'Evasion', 'Armor', 'Thresholds', 'Difficulty'] },
  dnd5e: { name: 'D&D 5e', stats: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], vitals: ['HP', 'AC', 'Speed', 'CR'] },
};
const MAX = { rows: 40, abilities: 40, inventory: 60, text: 20000 };
const SECTIONS = ['Details', 'Stats', 'Vitals', 'Skills', 'Abilities', 'Inventory', 'DM notes', 'Lore'];

const lib = library('designs');

const pairs = (list, n = MAX.rows) => (Array.isArray(list) ? list : []).slice(0, n)
  .map((p) => ({ name: str(p?.name, 40), value: str(p?.value, 300) })).filter((p) => p.name || p.value);

function normalize(input = {}, prev = {}) {
  const f = { ...prev, ...input };
  const kind = KINDS[f.kind] ? f.kind : 'people';
  const tags = (Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(','))
    .map((t) => slug(t, 30)).filter(Boolean).slice(0, 12);
  return {
    id: prev.id || str(f.id, 60).replace(/[^\w-]/g, '') || `ds_${crypto.randomBytes(5).toString('hex')}`,
    kind,
    name: str(f.name, 60) || 'Unnamed',
    title: str(f.title, 80),
    summary: str(f.summary, 400),
    image: typeof f.image === 'string' && /^\/uploads\/|^https?:\/\//.test(f.image) ? str(f.image, 300) : null,
    tags: [...new Set(tags)],
    race: kind === 'person' ? str(f.race, 60) : '',
    details: pairs(f.details),
    stats: pairs(f.stats),
    vitals: pairs(f.vitals),
    skills: pairs(f.skills),
    abilities: (Array.isArray(f.abilities) ? f.abilities : []).slice(0, MAX.abilities).map((a) => ({
      name: str(a?.name, 60), cost: str(a?.cost, 40), roll: str(a?.roll, 30), text: str(a?.text, 1500),
    })).filter((a) => a.name || a.text),
    inventory: (Array.isArray(f.inventory) ? f.inventory : []).slice(0, MAX.inventory).map((i) => ({
      name: str(i?.name, 60), qty: int(i?.qty, 1, 9999, 1), note: str(i?.note, 200),
    })).filter((i) => i.name),
    lore: str(f.lore, MAX.text),
    dm: str(f.dm, MAX.text),
    wiki: f.wiki && typeof f.wiki === 'object' && f.wiki.path ? { path: str(f.wiki.path, 200), sha: str(f.wiki.sha, 64), at: Number(f.wiki.at) || 0 } : null,
    updatedAt: Date.now(),
  };
}

function save(input) {
  const prev = input?.id ? lib.get(input.id) : undefined;
  return lib.set(normalize(input, prev));
}

// ----- Markdown (one wiki page per design) -----
const fileSlug = (d) => slug(d.name) || d.id;
const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const oneLine = (s) => String(s).replace(/\s*\n\s*/g, ' ');
const today = () => new Date().toISOString().slice(0, 10);

// The front block uses only `key: value` and `key: [a, b]`, like the lore repo's own pages.
function toMarkdown(d, { dm = false, author = 'mike', credit = 'Mike', created } = {}) {
  const front = [
    '---',
    `title: ${q(d.name)}`,
    `contributor: ${q(author)}`,
    `credit_as: ${q(credit)}`,
    `created: ${created || today()}`,
    'type: creature',
    `kind: ${d.kind}`,
    d.title && `epithet: ${q(d.title)}`,
    d.race && `race: ${q(d.race)}`,
    `tags: [${d.tags.join(', ')}]`,
    d.image && /^https?:\/\//.test(d.image) && `image: ${q(d.image)}`,
    `designer_id: ${d.id}`,
    '---',
  ].filter(Boolean);
  const out = [...front, `# ${d.name}`];
  if (d.title) out.push(`*${oneLine(d.title)}*`);
  if (d.summary) out.push('', `> ${oneLine(d.summary)}`);
  const list = (head, rows) => { if (rows.length) out.push('', `## ${head}`, ...rows); };
  list('Details', d.details.map((p) => `- **${oneLine(p.name)}:** ${oneLine(p.value)}`));
  list('Stats', d.stats.map((p) => `- **${oneLine(p.name)}:** ${oneLine(p.value)}`));
  list('Vitals', d.vitals.map((p) => `- **${oneLine(p.name)}:** ${oneLine(p.value)}`));
  list('Skills', d.skills.map((p) => `- **${oneLine(p.name)}:** ${oneLine(p.value)}`));
  list('Abilities', d.abilities.map((a) => `- **${oneLine(a.name || 'Ability')}**${a.cost ? ` (${oneLine(a.cost)})` : ''}${a.roll ? ` \`${oneLine(a.roll)}\`` : ''}: ${oneLine(a.text)}`.replace(/: $/, '')));
  list('Inventory', d.inventory.map((i) => `- ${i.qty > 1 ? `${i.qty} × ` : ''}${oneLine(i.name)}${i.note ? `: ${oneLine(i.note)}` : ''}`));
  if (dm && d.dm) out.push('', '## DM notes', '<!-- private -->', d.dm.trim());
  if (d.lore) out.push('', '## Lore', d.lore.trim());
  return out.join('\n') + '\n';
}

function frontmatter(src) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw.replace(/\s+#.*$/, ''));
    if (!kv) continue;
    const v = kv[2].trim();
    const unq = (s) => { const t = s.trim(); return /^"(.*)"$/.test(t) ? JSON.parse(t) : t.replace(/^'(.*)'$/, '$1'); };
    let val;
    try { val = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(unq).filter(Boolean) : unq(v); } catch { val = v; }
    data[kv[1]] = val;
  }
  return { data, body: m[2] };
}

const bullets = (text) => text.split(/\r?\n/).map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1]).filter(Boolean);
const plain = (s) => s.replace(/\*\*/g, '').trim();
function pairLine(line) {
  const m = /^\*\*(.+?):?\*\*:?\s*(.*)$/.exec(line) || /^([^:]+):\s*(.*)$/.exec(line);
  return m ? { name: plain(m[1]).replace(/:$/, ''), value: m[2].trim() } : { name: plain(line), value: '' };
}
function abilityLine(line) {
  const m = /^\*\*(.+?)\*\*\s*(?:\(([^)]*)\))?\s*(?:`([^`]*)`)?\s*:?\s*(.*)$/.exec(line);
  if (m) return { name: m[1].replace(/[.:]$/, ''), cost: m[2] || '', roll: m[3] || '', text: m[4] || '' };
  const p = pairLine(line);
  return { name: p.name, cost: '', roll: '', text: p.value };
}
function itemLine(line) {
  const m = /^(?:(\d+)\s*[×x]\s*)?([^:]+?)(?::\s*(.*))?$/.exec(plain(line));
  return m ? { qty: Number(m[1]) || 1, name: m[2].trim(), note: (m[3] || '').trim() } : { qty: 1, name: plain(line), note: '' };
}

// Read a wiki page back into a design. Unknown sections stay in the lore text, so nothing is lost.
function fromMarkdown(src, prev = {}) {
  const { data, body } = frontmatter(String(src || ''));
  const parts = body.split(new RegExp(`^##\\s+(${SECTIONS.join('|')})\\s*$`, 'mi'));
  const head = parts[0];
  const sec = {};
  const spill = []; // a section of the DM's own (## Habits) under a list section moves to the lore
  for (let i = 1; i < parts.length; i += 2) {
    const name = SECTIONS.find((s) => s.toLowerCase() === parts[i].toLowerCase());
    let text = parts[i + 1] || '';
    const cut = name === 'Lore' ? -1 : text.search(/^#{1,6}\s/m);
    if (cut >= 0) { spill.push(text.slice(cut).trim()); text = text.slice(0, cut); }
    sec[name] = text;
  }
  const h1 = /^#\s+(.+)$/m.exec(head)?.[1]?.trim();
  const epithet = /^\*([^*].*?)\*\s*$/m.exec(head)?.[1];
  const summary = head.split(/\r?\n/).filter((l) => /^>\s?/.test(l)).map((l) => l.replace(/^>\s?/, '')).join(' ').trim();
  // Text in the head that is not the title, epithet or summary belongs to the lore.
  const extra = head.split(/\r?\n/).filter((l) => !/^#\s|^>\s?/.test(l) && l.trim() !== `*${epithet}*`).join('\n').trim();
  const dmText = (sec['DM notes'] || '').replace(/<!--\s*private\s*-->/i, '').trim();
  return normalize({
    id: prev.id || (typeof data.designer_id === 'string' ? data.designer_id : undefined),
    kind: data.kind,
    name: data.title || h1,
    title: data.epithet || epithet || '',
    race: data.race || '',
    tags: data.tags || [],
    image: data.image || prev.image || null,
    summary,
    details: bullets(sec.Details || '').map(pairLine),
    stats: bullets(sec.Stats || '').map(pairLine),
    vitals: bullets(sec.Vitals || '').map(pairLine),
    skills: bullets(sec.Skills || '').map(pairLine),
    abilities: bullets(sec.Abilities || '').map(abilityLine),
    inventory: bullets(sec.Inventory || '').map(itemLine),
    dm: dmText || prev.dm || '',
    lore: [extra, (sec.Lore || '').trim(), ...spill].filter(Boolean).join('\n\n'),
  }, prev.id ? prev : {});
}

// ----- into the rest of the tool -----
const num = (rows, re, dflt) => { const p = rows.find((r) => re.test(r.name)); const n = parseInt(p?.value, 10); return Number.isFinite(n) ? n : dflt; };
// A combat stat block for the creature library. Vitals named HP, AC/Armor/Evasion and Speed carry over;
// abilities with a roll (2d6+3) become attacks, the rest become traits.
function toStatBlock(d) {
  const all = [...d.vitals, ...d.stats];
  const rolled = d.abilities.filter((a) => /\d*d\d+/i.test(a.roll) || /^\d+$/.test(a.roll));
  return {
    name: d.name,
    side: d.kind === 'person' ? 'neutral' : 'enemy',
    kind: d.kind === 'person' ? (d.race || 'Person') : KINDS[d.kind].name,
    cr: str(d.vitals.find((p) => /^(cr|tier|level|difficulty)$/i.test(p.name))?.value, 8),
    hp: num(all, /^(hp|hit points?|health)$/i, 10),
    ac: num(all, /^(ac|armou?r class|armou?r|evasion|defen[cs]e)$/i, 12),
    speed: { walk: num(all, /^(speed|move|movement)$/i, 30) },
    attacks: rolled.map((a) => {
      const m = /([+-]\d+)\s*(?:to hit)?/i.exec(a.text);
      return { name: a.name, atk: m ? Number(m[1]) : 0, dmg: a.roll, type: '', range: '' };
    }),
    traits: d.abilities.filter((a) => !rolled.includes(a)).map((a) => ({ name: a.name + (a.cost ? ` (${a.cost})` : ''), text: a.text })),
    notes: [d.summary, d.dm].filter(Boolean).join('\n\n').slice(0, 2000),
    image: d.image && d.image.startsWith('/uploads/') ? d.image : null,
    title: d.title,
    source: 'designer',
  };
}
// A Lore tab entry: the public text is the summary and lore, the DM note is the DM notes.
function toLore(d) {
  const facts = d.details.filter((p) => p.value).map((p) => `${p.name}: ${p.value}`).join('\n');
  return { cat: d.kind === 'person' ? 'npc' : 'creature', name: d.name, text: [d.summary, facts, d.lore].filter(Boolean).join('\n\n').slice(0, 2000), dm: d.dm.slice(0, 2000) };
}

module.exports = { KINDS, DETAILS, PRESETS, SECTIONS, lib, normalize, save, toMarkdown, fromMarkdown, fileSlug, toStatBlock, toLore, frontmatter };
