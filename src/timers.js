// Phase D timers. A condition with a timer counts down one round at a time (tick, called when a round
// begins). Concentration lasts until the DM drops it; when the caster takes damage, a Constitution save
// goes to their phone (src/rolls.js), DC 10 or half the damage, whichever is higher.
const { state, log, nextId } = require('./state');
const { str, int } = require('./util');

const MAX_ROUNDS = 99;

function conditionTimer(charId, name, rounds) {
  const tracker = require('./tracker');
  if (!tracker.CONDITIONS.includes(name)) return false;
  tracker.setCondition(charId, name, true);
  state.timers = state.timers.filter((t) => !(t.kind === 'condition' && t.charId === charId && t.name === name));
  state.timers.push({ id: 't' + nextId(), kind: 'condition', charId, name, rounds: int(rounds, 1, MAX_ROUNDS, 1) });
  return true;
}

// Called once per new round (src/game.js advanceTurn). Expired conditions are removed from the combatant.
function tick() {
  const tracker = require('./tracker');
  for (const t of state.timers.filter((x) => x.kind === 'condition')) {
    t.rounds -= 1;
    if (t.rounds <= 0) {
      tracker.setCondition(t.charId, t.name, false);
      state.timers = state.timers.filter((x) => x !== t);
    }
  }
}

function concentrate(charId, spell) {
  const c = state.players[charId];
  const name = str(spell, 60);
  if (!c || !name) return false;
  state.timers = state.timers.filter((t) => !(t.kind === 'concentration' && t.charId === charId));
  state.timers.push({ id: 't' + nextId(), kind: 'concentration', charId, name, rounds: null });
  log('system', `${c.name} concentrates on ${name}.`, { tone: 'call' });
  return true;
}

function dropConcentration(charId) {
  const t = state.timers.find((x) => x.kind === 'concentration' && x.charId === charId);
  if (!t) return false;
  state.timers = state.timers.filter((x) => x !== t);
  log('system', `${state.players[charId]?.name || 'Someone'} stops concentrating on ${t.name}.`);
  return true;
}

// Damage taken by a player who is concentrating. At 0 HP the spell ends outright.
function onDamage(target, dealt) {
  if (!(dealt > 0) || !state.players[target.id]) return;
  const t = state.timers.find((x) => x.kind === 'concentration' && x.charId === target.id);
  if (!t) return;
  if (target.hp === 0) return dropConcentration(target.id);
  const dc = Math.max(10, Math.floor(dealt / 2));
  require('./rolls').call({
    kind: 'save', key: 'con', dc, targets: [target.id],
    pass: `keeps concentrating on ${t.name}.`, fail: `loses concentration on ${t.name}.`,
  });
}

module.exports = { MAX_ROUNDS, conditionTimer, tick, concentrate, dropConcentration, onDamage };
