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

// Soundscape ambience (Nov 16): more placeholder layers for the environments in src/soundscape.js.
Object.assign(LOOPS, {
  'loop-creek': {
    name: 'Creek (placeholder)',
    make(n, r) {
      const h = hiss(n, r, 0.5); const b = blips(n, r, 0.004, 600, 1400, 0.012, 0.18);
      return at(h, (i) => h[i] * 0.25 * swell(n, i, 4, 0.3) + b[i]);
    },
  },
  'loop-birds': {
    name: 'Birdsong (placeholder)',
    make(n, r) {
      const b = blips(n, r, 0.0006, 2600, 4600, 0.025, 0.35); const w = hiss(n, r, 0.02);
      return at(b, (i) => b[i] + w[i] * 0.1);
    },
  },
  'loop-fire': {
    name: 'Fire crackle (placeholder)',
    make(n, r) {
      const roar = hiss(n, r, 0.03); const c = blips(n, r, 0.002, 900, 3000, 0.002, 0.5);
      return at(roar, (i) => roar[i] * 0.9 + c[i]);
    },
  },
  'loop-drips': {
    name: 'Cave drips (placeholder)',
    make(n, r) {
      const d = blips(n, r, 0.00025, 700, 1300, 0.06, 0.5); const air = hiss(n, r, 0.008);
      return at(d, (i) => d[i] + air[i] * 0.2);
    },
  },
  'loop-waves': {
    name: 'Waves (placeholder)',
    make(n, r) {
      const h = hiss(n, r, 0.15);
      return at(h, (i) => h[i] * 0.6 * swell(n, i, 2, 1) ** 3);
    },
  },
  'loop-crowd': {
    name: 'Town crowd (placeholder)',
    make(n, r) {
      const m = hiss(n, r, 0.07); const v = blips(n, r, 0.0008, 180, 420, 0.08, 0.15);
      return at(m, (i) => m[i] * 1.1 * swell(n, i, 5, 0.4) + v[i]);
    },
  },
  'loop-storm': {
    name: 'Storm wind (placeholder)',
    make(n, r) {
      const w = hiss(n, r, 0.02); const g = hiss(n, r, 0.2);
      return at(w, (i) => w[i] * 2.4 * swell(n, i, 1, 0.7) + g[i] * 0.3);
    },
  },
  'loop-night': {
    name: 'Night crickets (placeholder)',
    make(n, r) {
      const c = blips(n, r, 0.0015, 4200, 4800, 0.006, 0.3); const a = hiss(n, r, 0.01);
      return at(c, (i) => c[i] * swell(n, i, 8, 0.9) + a[i] * 0.15);
    },
  },
});

const LOOP_IDS = Object.keys(LOOPS);

// Mood music for the soundscape mood wheel: eight-second PLACEHOLDER pads, one per mood, so the wheel can be
// tried without real music. Each mood is a short chord loop (Hz) plus a flavour; swap for licensed tracks later.
const NOTE = (m) => 440 * 2 ** ((m - 69) / 12); // MIDI note to Hz
const MOOD_SECS = 8;
const MOOD_MUSIC = {
  calm: { chords: [[60, 64, 67, 71], [57, 60, 64, 67]], pulse: 0, arp: 0 },
  happy: { chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]], pulse: 0, arp: 4 },
  funny: { chords: [[60, 64, 67], [62, 65, 69], [64, 67, 71], [62, 65, 69]], pulse: 0, arp: 8, pluck: true },
  epic: { chords: [[45, 52, 57, 64], [41, 48, 53, 60], [43, 50, 55, 62], [45, 52, 57, 64]], pulse: 2, arp: 0 },
  sad: { chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], pulse: 0, arp: 0 },
  creepy: { chords: [[48, 51, 54], [49, 52, 55]], pulse: 0, arp: 0, detune: true },
  tense: { chords: [[45, 48, 52], [46, 49, 52]], pulse: 4, arp: 0 },
  mystic: { chords: [[50, 57, 62, 69], [48, 55, 62, 67]], pulse: 0, arp: 2 },
  magical: { chords: [[64, 68, 71, 75], [61, 64, 68, 73]], pulse: 0, arp: 6 },
};
const MOOD_IDS = Object.keys(MOOD_MUSIC);

function moodMake(m) {
  return (n, r) => {
    const out = new Float32Array(n);
    const seg = n / m.chords.length;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const c = m.chords[Math.min(m.chords.length - 1, Math.floor(i / seg))];
      const k = (i % seg) / seg;
      const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * k); // each chord breathes in and out, so the loop never clicks
      let v = 0;
      for (const note of c) {
        const f = NOTE(note);
        v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t);
        if (m.detune) v += 0.7 * Math.sin(2 * Math.PI * f * 1.013 * t);
      }
      out[i] = (v / c.length) * env * (m.pluck ? 0.25 : 0.5);
      if (m.pulse) out[i] += Math.sin(2 * Math.PI * 55 * t) * Math.exp(-((t * m.pulse) % 1) * 9) * 0.5; // drum or heartbeat
    }
    if (m.arp) { // arpeggio sparkles over the chords
      const step = Math.floor(RATE / m.arp);
      const tau = RATE * (m.pluck ? 0.05 : 0.18);
      for (let s = 0, j = 0; s < n; s += step, j++) {
        const c = m.chords[Math.min(m.chords.length - 1, Math.floor(s / seg))];
        const f = NOTE(c[j % c.length] + 12);
        for (let q = 0; q < tau * 4 && s + q < n; q++) out[s + q] += 0.25 * Math.exp(-q / tau) * Math.sin((2 * Math.PI * f * q) / RATE);
      }
    }
    if (m.detune) { const b = blips(n, r, 0.0002, 3000, 5000, 0.2, 0.1); for (let i = 0; i < n; i++) out[i] += b[i]; }
    return out;
  };
}
for (const id of MOOD_IDS) {
  LOOPS[`mood-${id}`] = { name: `${id[0].toUpperCase()}${id.slice(1)} mood music (PLACEHOLDER)`, secs: MOOD_SECS, make: moodMake(MOOD_MUSIC[id]) };
}
// Track entries for state.audio.moods: the music the mood wheel cross-fades to.
function moodItems() {
  return MOOD_IDS.map((m) => ({ id: `mood-${m}`, mood: m, name: LOOPS[`mood-${m}`].name, url: `/sounds/mood-${m}.wav`, video: false, audio: true, builtin: true, placeholder: true }));
}

// Track entries for state.audio.loops. They look like uploaded audio, flagged as built in.
function loopItems() {
  return LOOP_IDS.map((id) => ({ id, name: LOOPS[id].name, url: `/sounds/${id}.wav`, video: false, audio: true, builtin: true, placeholder: true }));
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
  const n = (LOOPS[id].secs || SECS) * RATE;
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

module.exports = { LOOP_IDS, MOOD_IDS, MOOD_SECS, loopItems, moodItems, wavFor, RATE };
