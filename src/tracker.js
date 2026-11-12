// Turn and time systems (Phase 6): conditions on combatants (16), segment clocks (17),
// and short and long rests (18).
const { state, log, nextId } = require('./state');
const { roster, saveRoster } = require('./roster');
const { str, int } = require('./util');
const { ensureSheet } = require('./sheet');

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];

// Conditions live on the combatant: a party member's sheet, or an enemy in the encounter.
function holder(id) {
  return state.players[id] || state.combat.enemies.find((e) => e.id === id) || null;
}
function setCondition(id, name, on) {
  const c = holder(id);
  if (!c || !CONDITIONS.includes(name)) return;
  c.conditions = Array.isArray(c.conditions) ? c.conditions : [];
  const has = c.conditions.includes(name);
  if (on && !has) { c.conditions.push(name); log('combat', `${c.name} is ${name.toLowerCase()}.`, { tone: 'call' }); }
  if (!on && has) { c.conditions = c.conditions.filter((x) => x !== name); log('combat', `${c.name} is no longer ${name.toLowerCase()}.`); }
  if (c.id && roster[c.id]) { roster[c.id].conditions = c.conditions; saveRoster(); }
}

// ----- segment clocks (17): a countdown the DM fills, e.g. "The cult completes the ritual". -----
function addClock({ name, segments }) {
  const n = int(segments, 2, 12, 4);
  const clock = { id: 'k' + nextId(), name: str(name, 60) || 'Clock', segments: n, filled: 0, vis: 'all' };
  state.clocks.push(clock);
  return clock;
}
function fillClock(id, delta) {
  const k = state.clocks.find((c) => c.id === id);
  if (!k) return;
  const was = k.filled;
  k.filled = Math.max(0, Math.min(k.segments, k.filled + int(delta, -12, 12, 0)));
  if (k.filled === k.segments && was < k.segments) log('narrate', `${k.name} completes.`, { tone: 'bad' });
}

// ----- rests (18) -----
// Short rest: players may spend hit dice (each restores ~d(die)+CON, the DM sets the amount through the
// sheet); the rest is recorded and spell slots are untouched. Long rest: full HP, slots and half the
// hit dice back, temp HP cleared, one level of exhaustion removed.
function rest(kind) {
  const short = kind === 'short';
  for (const p of Object.values(state.players)) {
    ensureSheet(p);
    if (!short) {
      p.hp = p.maxHp;
      p.tempHp = 0;
      for (const s of Object.values(p.slots || {})) s.used = 0;
      p.hitDice.used = Math.max(0, (p.hitDice.used || 0) - Math.max(1, Math.floor((p.level || 1) / 2)));
      if (p.conditions?.includes('Exhaustion')) p.conditions = p.conditions.filter((x) => x !== 'Exhaustion');
    }
    if (roster[p.id]) Object.assign(roster[p.id], { hp: p.hp, tempHp: p.tempHp, slots: p.slots, hitDice: p.hitDice, conditions: p.conditions });
  }
  saveRoster();
  log('system', short ? 'The party takes a short rest.' : 'The party takes a long rest. HP, spell slots and half the hit dice are restored.', { tone: 'good' });
}

module.exports = { CONDITIONS, setCondition, addClock, fillClock, rest };
