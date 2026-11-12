const str = (v, n) => String(v ?? '').trim().slice(0, n);
const int = (v, lo, hi, dflt) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; };
module.exports = { str, int };
