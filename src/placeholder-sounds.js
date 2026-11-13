// Placeholder ambience loops for the soundboard. Generated in memory from fixed seeds, so no binary
// files live in git. Made for this project and dedicated to the public domain (CC0). Swap for licensed
// library files later and list their sources in docs/sounds.md.
const RATE = 11025; // mono 16-bit: small enough to generate on demand
const SECS = 4; // loop length
const FADE = 0.25; // seconds blended from the end into the start, so the loop has no click

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// One-pole low-pass on white noise: soft hiss. Smaller k is darker.
function hiss(n, r, k) {
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) { y += ((r() * 2 - 1) - y) * k; out[i] = y; }
  return out;
}

// Random chirps: short exponentially decaying sines.
function blips(n, r, rate, lo, hi, decay, amp) {
  const out = new Float32Array(n);
  const tau = decay * RATE;
  const len = Math.floor(tau * 5);
  for (let i = 0; i < n; i++) {
    if (r() >= rate) continue;
    const f = lo + r() * (hi - lo);
    const a = amp * (0.4 + r() * 0.6);
    for (let k = 0; k < len && i + k < n; k++) out[i + k] += a * Math.exp(-k / tau) * Math.sin((2 * Math.PI * f * k) / RATE);
  }
  return out;
}

// Slow swell that repeats `cycles` times over the loop, so it joins up seamlessly.
const swell = (n, i, cycles, depth) => 1 - depth + depth * (0.5 + 0.5 * Math.sin((2 * Math.PI * cycles * i) / n));
const at = (arr, f) => Float32Array.from({ length: arr.length }, (_, i) => f(i));

const LOOPS = {
  'loop-rain': {
    name: 'Rain (placeholder)',
    make(n, r) {
      const h = hiss(n, r, 0.3); const b = blips(n, r, 0.0015, 1400, 2600, 0.004, 0.25);
      return at(h, (i) => h[i] * 0.35 * swell(n, i, 3, 0.2) + b[i]);
    },
  },
  'loop-tavern': {
    name: 'Tavern murmur (placeholder)',
    make(n, r) {
      const m = hiss(n, r, 0.04); const c = blips(n, r, 0.0005, 1800, 3200, 0.05, 0.12);
      return at(m, (i) => m[i] * 1.6 * swell(n, i, 6, 0.6) + c[i]);
    },
  },
  'loop-dungeon': {
    name: 'Dungeon drone (placeholder)',
    make(n, r) {
      const d = hiss(n, r, 0.01);
      return at(d, (i) => {
        const t = i / RATE;
        const drone = Math.sin(2 * Math.PI * 55 * t) * 0.12 + Math.sin(2 * Math.PI * 82.4 * t) * 0.05;
        return drone * (0.8 + 0.2 * swell(n, i, 1, 1)) + d[i] * 0.08 * swell(n, i, 1, 0.5);
      });
    },
  },
  'loop-forest': {
    name: 'Forest wind (placeholder)',
    make(n, r) {
      const w = hiss(n, r, 0.06); const b = blips(n, r, 0.0009, 2400, 4200, 0.03, 0.08);
      return at(w, (i) => w[i] * 0.5 * swell(n, i, 2, 0.8) ** 2 + b[i]);
    },
  },
};

const LOOP_IDS = Object.keys(LOOPS);

// Track entries for state.audio.loops. They look like uploaded audio, flagged as built in.
function loopItems() {
  return LOOP_IDS.map((id) => ({ id, name: LOOPS[id].name, url: `/sounds/${id}.wav`, video: false, audio: true, builtin: true }));
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

function render(id) {
  const x = Math.round(FADE * RATE);
  const n = SECS * RATE;
  const seed = [...id].reduce((s, c) => Math.imul(s, 31) + c.charCodeAt(0), 7) >>> 0;
  const raw = LOOPS[id].make(n + x, rng(seed));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = i < x ? raw[i] * (i / x) + raw[n + i] * (1 - i / x) : raw[i];
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak ? 0.7 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return wav(out);
}

const cache = new Map();
// The WAV bytes for a placeholder loop, or null when the id is not one of ours.
function wavFor(id) {
  if (!LOOPS[id]) return null;
  if (!cache.has(id)) cache.set(id, render(id));
  return cache.get(id);
}

module.exports = { LOOP_IDS, loopItems, wavFor, RATE };
