// Dice primitives. crypto.randomInt for fair rolls.
const crypto = require('crypto');

const d = (sides) => 1 + crypto.randomInt(sides);
const rollDice = ([n, sides, mod]) => {
  const rolls = Array.from({ length: n }, () => d(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod, expr: `${n}d${sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}` };
};
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

module.exports = { d, rollDice, sign };
