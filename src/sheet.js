// Character sheets (item 2): the fields a player keeps up to date on their phone, live to the DM.
// Stored on the roster entry next to the combat stats. Rules-specific parts (abilities, saves,
// passive scores) come from the active rules adapter.
const crypto = require('crypto');
const rules = require('./rules');
const { str, int } = require('./util');
const { clampGold } = require('./shops');
const { featureList } = require('./rests');

// Fields only the owner and the DM see (other phones and the TV get the public card).
const PRIVATE = ['abilities', 'saveProf', 'slots', 'hitDice', 'inventory', 'notes', 'spells', 'derived', 'gold', 'bond', 'uses', 'features', 'moves', 'hdOffer', 'keys'];

// Optional resource pools (phase 4). A pool with max 0 is not kept by the character and is hidden on phones.
const RESOURCES = ['stamina', 'mana'];
const pool = (r) => { const max = int(r?.max, 0, 999, 0); return { max, cur: int(r?.cur, 0, max, max) }; };

// Special moves (Mike, Nov 17): chains a player lays out on the phone and picks in the strike pop-up
// (public/js/play/strike.js). Nov 21: players name and rename them, keep at least one, and pick them from the
// combat choices on their turn.
// A step: k, and points in the silhouette's 200 x 300 box (x,y; slash and twin add x2,y2; twinslash x3..y4).
const MOVE_STEPS = { hit: 1, pierce: 1, spell: 1, slash: 2, twin: 2, twinslash: 4 };
const MAX_MOVES = 6, MAX_STEPS = 8, MIN_STEPS = 2, MIN_MOVES = 1;
const STARTER_MOVE = () => ({ name: 'Quick combo', steps: [{ k: 'hit', x: 100, y: 90 }, { k: 'hit', x: 100, y: 170 }] });
function cleanMoves(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, MAX_MOVES).map((m, i) => ({
    name: str(m?.name, 30) || `Move ${i + 1}`,
    steps: (Array.isArray(m?.steps) ? m.steps : []).filter((s) => MOVE_STEPS[s?.k]).slice(0, MAX_STEPS).map((s) => {
      const o = { k: s.k };
      for (let i = 0; i < MOVE_STEPS[s.k]; i++) { const n = i ? i + 1 : ''; o[`x${n}`] = int(s[`x${n}`], 0, 200, 100); o[`y${n}`] = int(s[`y${n}`], 0, 300, 150); }
      return o;
    }),
  })).filter((m) => m.steps.length >= MIN_STEPS);
}

// Bring any character (new, imported, or saved before sheets existed) up to the current shape.
function ensureSheet(c) {
  const sys = rules.get(c.system);
  const d = sys.sheetDefaults(c.cls);
  for (const [k, v] of Object.entries(d)) if (c[k] === undefined) c[k] = v;
  c.tempHp ??= 0;
  c.inventory ??= [];
  c.gold = clampGold(c.gold); // spent at NPC shops (src/shops.js); the DM sets it
  c.spells ??= [];
  c.notes ??= '';
  c.conditions ??= [];
  for (const k of RESOURCES) c[k] = pool(c[k]);
  c.uses ??= {};
  if (!Array.isArray(c.moves) || !c.moves.length) c.moves = [STARTER_MOVE()]; // every character has at least one move
  c.moves.forEach((m, i) => { m.name ||= `Move ${i + 1}`; });
  c.features = featureList(c); // class features with their maximum, for the owner's sheet
  return c;
}

// A spellcaster (Nov 21): has spell slots or knows a spell. System-agnostic; the phone shows the Spells tab only then.
const isCaster = (c) => Object.values(c.slots || {}).some((s) => s?.max > 0) || (c.spells || []).length > 0;

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

// Languages a character can speak (Nov 21): only the player sets these, from their phone. Free text, so a
// homebrew tongue works too; the rules' list is offered as suggestions.
const cleanLanguages = (list) => [...new Set(list.map((x) => str(x, 30)).filter(Boolean))].slice(0, 30);

// Apply a sheet patch. Stats and health are the DM's alone (Mike, Nov 21). A player keeps notes, names their
// special moves, uses up or drops items, and sets the languages they know (which the DM cannot change).
function applySheet(c, f, isDm) {
  ensureSheet(c);
  if (f.notes !== undefined) c.notes = str(f.notes, 4000);
  if (f.moves !== undefined) { const m = cleanMoves(f.moves); if (m && m.length >= MIN_MOVES) c.moves = m; }
  if (f.inv) {
    const { op, id } = f.inv;
    const item = c.inventory.find((x) => x.id === id);
    // Players can't add items or raise a count (Mike, Nov 16): the DM gives items from the Items tab.
    // A phone may still use one up (lower the count) or drop an item.
    if (op === 'add' && isDm && c.inventory.length < 200 && str(f.inv.name, 60)) {
      const it = { id: crypto.randomBytes(4).toString('hex'), name: str(f.inv.name, 60), qty: int(f.inv.qty, 0, 9999, 1), note: str(f.inv.note, 200) };
      // From an item card (Nov 18): its art and rarity go along, so the phone can show the card too.
      if (typeof f.inv.img === 'string' && /^\/uploads\/|^\/samples\/|^https?:\/\//.test(f.inv.img)) it.img = str(f.inv.img, 300);
      if (f.inv.icon) it.icon = str(f.inv.icon, 4);
      if (f.inv.rarity) it.rarity = str(f.inv.rarity, 20);
      c.inventory.push(it);
    } else if (op === 'set' && item) {
      if (f.inv.name !== undefined && isDm) item.name = str(f.inv.name, 60) || item.name;
      if (f.inv.qty !== undefined) item.qty = int(f.inv.qty, 0, isDm ? 9999 : item.qty, item.qty);
      if (f.inv.note !== undefined) item.note = str(f.inv.note, 200);
    } else if (op === 'del' && item) c.inventory = c.inventory.filter((x) => x !== item);
  }
  if (Array.isArray(f.spells)) c.spells = [...new Set(f.spells.map((x) => str(x, 80)).filter(Boolean))].slice(0, 200); // the spells a caster knows (their pick, before a rest too)
  if (!isDm) {
    if (Array.isArray(f.languages)) c.languages = cleanLanguages(f.languages);
    return;
  }
  if (f.hp !== undefined) c.hp = int(f.hp, 0, c.maxHp, c.hp);
  if (f.tempHp !== undefined) c.tempHp = int(f.tempHp, 0, 999, c.tempHp);
  if (f.slot) {
    const s = c.slots[String(f.slot.level)];
    if (s) s.used = int(f.slot.used, 0, s.max, s.used);
  }
  if (f.hitDiceUsed !== undefined) c.hitDice.used = int(f.hitDiceUsed, 0, c.level, c.hitDice.used);
  if (f.gold !== undefined) c.gold = clampGold(f.gold, c.gold);
  for (const k of RESOURCES) {
    const r = c[k];
    if (f[k]?.max !== undefined) { r.max = int(f[k].max, 0, 999, r.max); r.cur = Math.min(r.cur, r.max); }
    if (f[k]?.cur !== undefined) r.cur = int(f[k].cur, 0, r.max, r.cur);
  }
  if (f.speed !== undefined) c.speed = int(f.speed, 0, 300, c.speed);
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

module.exports = { PRIVATE, ensureSheet, derived, applySheet, cleanMoves, isCaster, MIN_MOVES };
