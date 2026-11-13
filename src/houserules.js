// House rules (phase J): table rulings the tool enforces. The DM turns each one on or off on the DM
// screen; an enabled rule is checked at the moment it matters, and a switch-off overrides it at once.
const RULES = {
  'potion-once': { label: 'One potion per turn', text: 'A character can drink one potion per combat turn.' },
  'no-camp-in-combat': { label: 'No camp during combat', text: 'Camp opens only when the fight is over.' },
};

// The turn each character last drank a potion in, e.g. "2:1" (round:turn). Not saved: a restart clears it.
const potionTurns = new Map();
const on = (state, id) => !!RULES[id] && !!state.houseRules?.[id];

function list(state) {
  return Object.entries(RULES).map(([id, r]) => ({ id, label: r.label, text: r.text, on: on(state, id) }));
}

// Returns { error } for an unknown rule. Otherwise turns the rule on or off.
function set(state, id, value) {
  if (!RULES[id]) return { error: 'No such house rule.' };
  state.houseRules ??= {};
  state.houseRules[id] = !!value;
  return { ok: true };
}

const turnKey = (state) => `${state.combat.round}:${state.combat.turn}`;

// Why a potion is refused, or null when it may be drunk.
function blockPotion(state, c) {
  if (!on(state, 'potion-once') || !c) return null;
  return potionTurns.get(c.id) === turnKey(state) ? `${c.name} has already had a potion this turn (house rule).` : null;
}
function markPotion(state, c) { if (c) potionTurns.set(c.id, turnKey(state)); }

// Why camp cannot open, or null.
function blockCamp(state) {
  return on(state, 'no-camp-in-combat') && state.combat.active ? 'No camp during combat (house rule). Switch the rule off to override.' : null;
}

module.exports = { RULES, list, set, on, blockPotion, markPotion, blockCamp, _potionTurns: potionTurns };
