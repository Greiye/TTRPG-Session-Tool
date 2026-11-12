// Character sheets (item 2): the fields a player keeps up to date on their phone, live to the DM.
// Stored on the roster entry next to the combat stats. Rules-specific parts (abilities, saves,
// passive scores) come from the active rules adapter.
const crypto = require('crypto');
const rules = require('./rules');
const { str, int } = require('./util');

// Fields only the owner and the DM see (other phones and the TV get the public card).
const PRIVATE = ['abilities', 'saveProf', 'slots', 'hitDice', 'inventory', 'notes', 'spells', 'derived'];

// Bring any character (new, imported, or saved before sheets existed) up to the current shape.
function ensureSheet(c) {
  const sys = rules.get(c.system);
  const d = sys.sheetDefaults(c.cls);
  for (const [k, v] of Object.entries(d)) if (c[k] === undefined) c[k] = v;
  c.tempHp ??= 0;
  c.inventory ??= [];
  c.spells ??= [];
  c.notes ??= '';
  c.conditions ??= [];
  return c;
}

// Numbers the clients show but should not compute themselves (system-specific).
function derived(c) {
  const sys = rules.get(c.system);
  return {
    prof: sys.prof(c),
    mods: Object.fromEntries(sys.abilities.map(([k]) => [k, sys.abilityMod(c, k)])),
    saves: Object.fromEntries(sys.abilities.map(([k]) => [k, sys.saveBonus(c, k)])),
    passive: Object.fromEntries(sys.skills.map((k) => [k, sys.passive(c, k)])),
  };
}
const passivePerception = (c) => { const sys = rules.get(c.system); return sys.passive(c, sys.skills.includes('Perception') ? 'Perception' : 'Instinct'); };

// Apply a sheet patch. Players may change what they track at the table; the DM may change everything.
function applySheet(c, f, isDm) {
  ensureSheet(c);
  if (f.hp !== undefined) c.hp = int(f.hp, 0, c.maxHp, c.hp);
  if (f.tempHp !== undefined) c.tempHp = int(f.tempHp, 0, 999, c.tempHp);
  if (f.slot) {
    const s = c.slots[String(f.slot.level)];
    if (s) s.used = int(f.slot.used, 0, s.max, s.used);
  }
  if (f.hitDiceUsed !== undefined) c.hitDice.used = int(f.hitDiceUsed, 0, c.level, c.hitDice.used);
  if (f.notes !== undefined) c.notes = str(f.notes, 4000);
  if (f.inv) {
    const { op, id } = f.inv;
    const item = c.inventory.find((x) => x.id === id);
    if (op === 'add' && c.inventory.length < 200 && str(f.inv.name, 60)) {
      c.inventory.push({ id: crypto.randomBytes(4).toString('hex'), name: str(f.inv.name, 60), qty: int(f.inv.qty, 0, 9999, 1), note: str(f.inv.note, 200) });
    } else if (op === 'set' && item) {
      if (f.inv.name !== undefined) item.name = str(f.inv.name, 60) || item.name;
      if (f.inv.qty !== undefined) item.qty = int(f.inv.qty, 0, 9999, item.qty);
      if (f.inv.note !== undefined) item.note = str(f.inv.note, 200);
    } else if (op === 'del' && item) c.inventory = c.inventory.filter((x) => x !== item);
  }
  if (Array.isArray(f.spells)) c.spells = [...new Set(f.spells.map((x) => str(x, 80)).filter(Boolean))].slice(0, 200);
  if (!isDm) return;
  if (f.speed !== undefined) c.speed = int(f.speed, 0, 300, c.speed);
  if (Array.isArray(f.languages)) c.languages = [...new Set(f.languages.map((x) => str(x, 30)).filter(Boolean))].slice(0, 30);
  if (f.slotMax) {
    for (const [lvl, max] of Object.entries(f.slotMax)) {
      const l = int(lvl, 1, 9, 0);
      if (!l) continue;
      const m = int(max, 0, 9, 0);
      if (m === 0) delete c.slots[l]; else c.slots[l] = { max: m, used: Math.min(c.slots[l]?.used || 0, m) };
    }
  }
  rules.get(c.system).editSheet(c, f);
}

module.exports = { PRIVATE, ensureSheet, derived, passivePerception, applySheet };
