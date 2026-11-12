// Creature stat blocks (item 3): a DM-editable library in data/creatures.json, and spawning
// combatants from it. A creature can be an enemy, an ally, or neutral.
//
// Stat block: { id, name, side, kind, cr, hp, ac, speed: { walk, fly, swim, climb }, abilities,
//   attacks: [{ name, atk, dmg: '1d6+2', type, range }], traits: [{ name, text }], notes, image,
//   boss, title, source }
const crypto = require('crypto');
const { library } = require('./library');
const dice = require('./dice');
const { str, int } = require('./util');

const SIDES = ['enemy', 'ally', 'neutral'];
const lib = library('creatures');

// "2d6+3" -> [2, 6, 3]; the adapters roll damage from this triple.
function dmgTriple(expr) {
  const m = String(expr || '').replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (m) return [int(m[1] || 1, 1, 40, 1), int(m[2], 2, 100, 6), int(m[3] || 0, -20, 60, 0)];
  const flat = Number(expr);
  return Number.isFinite(flat) && String(expr).trim() !== '' ? [0, 2, int(flat, 0, 500, 0)] : [1, 6, 0];
}
const dmgText = ([n, s, m]) => (n ? `${n}d${s}${m ? (m > 0 ? '+' : '') + m : ''}` : `${m}`);

function normalize(input, prev = {}) {
  const f = { ...prev, ...input };
  const speed = typeof f.speed === 'object' && f.speed ? f.speed : { walk: f.speed };
  const c = {
    id: prev.id || str(f.id, 80).replace(/[^\w-]/g, '') || `cr_${crypto.randomBytes(5).toString('hex')}`,
    name: str(f.name, 60) || 'Creature',
    side: SIDES.includes(f.side) ? f.side : 'enemy',
    kind: str(f.kind, 60),
    cr: str(f.cr, 8),
    hp: int(f.hp, 1, 9999, 10),
    ac: int(f.ac, 1, 40, 12),
    speed: { walk: int(speed.walk, 0, 400, 30), fly: int(speed.fly, 0, 400, 0), swim: int(speed.swim, 0, 400, 0), climb: int(speed.climb, 0, 400, 0) },
    init: int(f.init, -5, 20, 0),
    abilities: {},
    attacks: (Array.isArray(f.attacks) ? f.attacks : []).slice(0, 12).map((a) => ({
      name: str(a.name, 40) || 'Attack', atk: int(a.atk, -5, 30, 0), dmg: dmgText(dmgTriple(a.dmg)), type: str(a.type, 30), range: str(a.range, 40),
    })),
    traits: (Array.isArray(f.traits) ? f.traits : []).slice(0, 30).map((t) => ({ name: str(t.name, 60), text: str(t.text, 1500) })).filter((t) => t.name || t.text),
    notes: str(f.notes, 2000),
    image: f.image ? str(f.image, 200) : null,
    boss: !!f.boss,
    title: str(f.title, 80),
    source: str(f.source, 60) || 'custom',
  };
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) if (f.abilities?.[k] !== undefined) c.abilities[k] = int(f.abilities[k], 1, 30, 10);
  if (f.init === undefined && c.abilities.dex) c.init = Math.floor((c.abilities.dex - 10) / 2);
  if (!c.attacks.length) c.attacks.push({ name: 'Strike', atk: 3, dmg: '1d6+1', type: '', range: '' });
  return c;
}

function upsert(input) {
  const prev = input.id ? lib.get(input.id) : undefined;
  return lib.set(normalize(input, prev));
}

// A combatant for the encounter, copied from the stat block so later edits don't change a running fight.
function spawn(block, { id, name, hp } = {}) {
  const first = block.attacks[0];
  const max = hp ?? block.hp;
  return {
    id, ref: block.id, name: name || block.name, side: block.side, enemy: block.side === 'enemy',
    hp: max, maxHp: max, ac: block.ac, init: block.init, speed: block.speed,
    atk: first.atk, dmg: dmgTriple(first.dmg), attacks: block.attacks, traits: block.traits,
    notes: block.notes, image: block.image, boss: block.boss, title: block.title, cr: block.cr, conditions: [], traits: block.traits,
  };
}
// Use one named attack for an adapter roll.
function withAttack(c, index) {
  const a = c.attacks?.[index] || c.attacks?.[0];
  return a ? { ...c, atk: a.atk, dmg: dmgTriple(a.dmg), attackName: a.name } : c;
}
const rollHp = (expr) => dice.roll(expr)?.total;

module.exports = { lib, SIDES, normalize, upsert, spawn, withAttack, dmgTriple, dmgText, rollHp };
