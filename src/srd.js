// SRD / Open5e import (item 3b). Turns monster and spell JSON from the common open sources into
// our stat block and spell shapes, so the DM doesn't type them in.
//
// Understood formats:
//   - Open5e API v1 (api.open5e.com/v1/monsters, /v1/spells): a page { results: [...] }, an array, or one record
//   - 5e-bits / dnd5eapi "5e-SRD" JSON (5e-SRD-Monsters.json, 5e-SRD-Spells.json)
//   - our own shapes (re-importing an export)
// Online search (optional, needs internet on the laptop) asks Open5e for SRD-licensed entries only.
const creatures = require('./creatures');
const spells = require('./spells');
const { str } = require('./util');

const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function speedOf(s) {
  if (typeof s === 'number') return { walk: s };
  if (typeof s === 'string') { // "30 ft., fly 60 ft."
    const out = { walk: num(s.match(/^\s*(\d+)/)?.[1]) };
    for (const k of ['fly', 'swim', 'climb']) out[k] = num(s.match(new RegExp(`${k}\\s+(\\d+)`, 'i'))?.[1]);
    return out;
  }
  const o = s || {};
  return { walk: num(o.walk), fly: num(o.fly), swim: num(o.swim), climb: num(o.climb) };
}
function acOf(v) {
  if (Array.isArray(v)) return num(first(v[0]?.value, v[0]), 10); // 5e-bits: [{ type, value }]
  return num(v, 10);
}
// Pull "+4 to hit" and "(1d6 + 2)" out of action text when the structured fields are missing.
function attackOf(a) {
  const desc = String(a.desc || a.description || '');
  const hit = first(a.attack_bonus, desc.match(/([+-]\d+) to hit/)?.[1]);
  if (hit === undefined) return null;
  let dmg = a.damage_dice ? `${a.damage_dice}${a.damage_bonus ? (a.damage_bonus > 0 ? '+' : '') + a.damage_bonus : ''}` : null;
  if (!dmg && Array.isArray(a.damage) && a.damage[0]?.damage_dice) dmg = a.damage[0].damage_dice;
  if (!dmg) dmg = desc.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/)?.[1] || desc.match(/Hit: (\d+)/)?.[1] || '1';
  const type = first(Array.isArray(a.damage) ? a.damage[0]?.damage_type?.name : undefined, desc.match(/\)\s+(\w+) damage/)?.[1], '');
  const range = desc.match(/(reach \d+ ft\.|range \d+(?:\/\d+)? ft\.)/)?.[1] || '';
  return { name: a.name, atk: num(hit), dmg: String(dmg).replace(/\s/g, ''), type: String(type).toLowerCase(), range };
}
function monster(m, source) {
  const actions = Array.isArray(m.actions) ? m.actions : [];
  const attacks = m.attacks || actions.map(attackOf).filter(Boolean);
  const traits = m.traits || [
    ...(Array.isArray(m.special_abilities) ? m.special_abilities : []),
    ...actions.filter((a) => !attackOf(a)),
    ...(Array.isArray(m.legendary_actions) ? m.legendary_actions.map((a) => ({ ...a, name: `Legendary: ${a.name}` })) : []),
  ].map((t) => ({ name: t.name, text: t.desc || t.text || '' }));
  const ab = m.abilities || Object.fromEntries([['str', 'strength'], ['dex', 'dexterity'], ['con', 'constitution'], ['int', 'intelligence'], ['wis', 'wisdom'], ['cha', 'charisma']]
    .filter(([, long]) => m[long] !== undefined).map(([k, long]) => [k, m[long]]));
  const cr = first(m.cr, m.challenge_rating, '');
  return creatures.normalize({
    id: m.id && String(m.id).startsWith('cr_') ? m.id : `srd_${slug(first(m.slug, m.index, m.name))}`,
    name: m.name, side: m.side || 'enemy', kind: [m.size, m.type || m.kind].filter(Boolean).join(' '),
    cr: typeof cr === 'number' ? ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] || String(cr)) : String(cr),
    hp: first(m.hp, m.hit_points), ac: acOf(first(m.ac, m.armor_class)), speed: speedOf(m.speed), abilities: ab,
    attacks, traits, notes: m.notes || [m.senses && `Senses: ${typeof m.senses === 'string' ? m.senses : JSON.stringify(m.senses)}`, m.languages && `Languages: ${m.languages}`].filter(Boolean).join('\n'),
    boss: !!m.boss || (Array.isArray(m.legendary_actions) && m.legendary_actions.length > 0), title: m.title,
    source: m.source || source || first(m.document__title, m.document__slug, 'SRD'),
  });
}
function spell(s, source) {
  const level = first(s.level_int, typeof s.level === 'number' ? s.level : undefined, num(String(s.level).match(/\d/)?.[0]));
  const text = Array.isArray(s.desc) ? s.desc.join('\n\n') : first(s.text, s.desc, '');
  const higher = Array.isArray(s.higher_level) ? s.higher_level.join('\n\n') : first(s.higher, s.higher_level, '');
  const comps = Array.isArray(s.components) ? s.components.join(', ') : first(s.components, '');
  const yes = (v) => v === true || v === 'yes';
  return spells.normalize({
    id: `srd_${slug(first(s.slug, s.index, s.name))}`, name: s.name, level,
    school: typeof s.school === 'object' ? s.school?.name : s.school, time: first(s.time, s.casting_time), range: s.range,
    components: s.material && !String(comps).includes('(') ? `${comps} (${s.material})` : comps, duration: s.duration,
    concentration: yes(s.concentration), ritual: yes(s.ritual),
    classes: Array.isArray(s.classes) ? s.classes.map((c) => (typeof c === 'object' ? c.name : c)) : first(s.dnd_class, s.classes, ''),
    text, higher, source: s.source || source || first(s.document__title, s.document__slug, 'SRD'),
  });
}

const isMonster = (x) => x && typeof x === 'object' && x.name && (x.hit_points !== undefined || x.hp !== undefined);
const isSpell = (x) => x && typeof x === 'object' && x.name && (x.casting_time !== undefined || x.time !== undefined || x.school !== undefined);

// Accepts a page, an array, a single record, or { monsters: [], spells: [] }. Saves into the libraries.
function importJson(data, source) {
  const out = { monsters: 0, spells: 0, skipped: 0 };
  const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results
    : data && (data.monsters || data.spells || data.creatures) ? [...(data.monsters || []), ...(data.creatures || []), ...(data.spells || [])] : [data];
  for (const x of list) {
    try {
      if (isMonster(x)) { creatures.lib.set(monster(x, source)); out.monsters++; } else if (isSpell(x)) { spells.lib.set(spell(x, source)); out.spells++; } else out.skipped++;
    } catch { out.skipped++; }
  }
  return out;
}

// First run: a small starter set so the app works offline out of the box.
function seed() {
  if (!creatures.lib.fresh && !spells.lib.fresh) return;
  const starter = require('../srd/starter.json');
  if (creatures.lib.fresh) for (const m of starter.monsters) creatures.lib.set(monster(m, starter.source));
  if (spells.lib.fresh) for (const s of starter.spells) spells.lib.set(spell(s, starter.source));
}

const OPEN5E = process.env.OPEN5E_URL || 'https://api.open5e.com';
// Search Open5e for SRD entries. Returns normalized previews; nothing is saved until the DM adds one.
async function search(kind, q) {
  const path = kind === 'spell' ? 'spells' : 'monsters';
  const url = `${OPEN5E}/v1/${path}/?search=${encodeURIComponent(str(q, 60))}&document__slug__in=wotc-srd,srd-2024&limit=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open5e answered ${res.status}`);
  const page = await res.json();
  return (page.results || []).map((x) => (kind === 'spell' ? spell(x) : monster(x)));
}

module.exports = { monster, spell, importJson, seed, search, isMonster, isSpell };
