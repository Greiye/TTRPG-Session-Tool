const str = (v, n) => String(v ?? '').trim().slice(0, n);
const int = (v, lo, hi, dflt) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; };
// File- and id-safe name: "Goblin Boss!" -> "goblin-boss". Used by saves, spells and the SRD import.
const slug = (s, n = 60) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n);
module.exports = { str, int, slug };
