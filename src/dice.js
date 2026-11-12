// Dice primitives. crypto.randomInt for fair rolls.
// Supports plain expressions ("2d6+3"), keep-highest/lowest ("4d6kh3", "2d20kl1") and d20 advantage.
const crypto = require('crypto');

const d = (sides) => 1 + crypto.randomInt(sides);
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

// [n, sides, mod] -> { rolls, total, expr }  (kept for the 5e damage arrays)
const rollDice = ([n, sides, mod]) => {
  const rolls = Array.from({ length: n }, () => d(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod, expr: `${n}d${sides}${mod ? sign(mod) : ''}` };
};

// "2d6+1d4-1", "4d6kh3", "d20". Returns null when the expression is invalid.
const TERM = /([+-]?)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gi;
function parse(expr) {
  const src = String(expr || '').replace(/\s/g, '');
  if (!src || !/^[+-]?(\d*d\d+((kh|kl)\d+)?|\d+)([+-](\d*d\d+((kh|kl)\d+)?|\d+))*$/i.test(src)) return null;
  const terms = [];
  for (const m of src.matchAll(TERM)) {
    const neg = m[1] === '-';
    if (m[6]) terms.push({ const: Number(m[6]) * (neg ? -1 : 1) });
    else {
      const n = Number(m[2] || 1); const sides = Number(m[3]);
      if (n < 1 || n > 100 || sides < 2 || sides > 1000) return null;
      terms.push({ n, sides, neg, keep: m[4] ? { hi: m[4].toLowerCase() === 'kh', k: Math.min(n, Number(m[5])) } : null });
    }
  }
  return terms;
}
function roll(expr) {
  const terms = parse(expr);
  if (!terms) return null;
  const dice = [];
  let total = 0;
  for (const t of terms) {
    if (t.const !== undefined) { total += t.const; continue; }
    const vals = Array.from({ length: t.n }, () => d(t.sides));
    let kept = vals.map(() => true);
    if (t.keep) {
      const order = vals.map((v, i) => [v, i]).sort((a, b) => (t.keep.hi ? b[0] - a[0] : a[0] - b[0]));
      kept = vals.map(() => false);
      order.slice(0, t.keep.k).forEach(([, i]) => { kept[i] = true; });
    }
    vals.forEach((v, i) => {
      dice.push({ sides: t.sides, value: v, kept: kept[i] });
      if (kept[i]) total += t.neg ? -v : v;
    });
  }
  return { expr: String(expr).replace(/\s/g, ''), dice, total };
}

// One d20 with optional advantage ('adv') or disadvantage ('dis'). `natural` is the kept die.
function d20(mode) {
  if (mode !== 'adv' && mode !== 'dis') { const v = d(20); return { natural: v, dice: [v], mode: null }; }
  const a = d(20); const b = d(20);
  return { natural: mode === 'adv' ? Math.max(a, b) : Math.min(a, b), dice: [a, b], mode };
}

module.exports = { d, d20, roll, parse, rollDice, sign };
