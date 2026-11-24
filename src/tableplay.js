// Table play (PR AD, Nov 24): the profession key bank with quick rolls, battle cries, NPC voices, phone tips and
// backdrop drift. Bookkeeping only: the DM answers every ask and can take back every automatic step.
const { state, log, nextId, sys } = require('./state');
const { str } = require('./util');

const MAX_KEYS = 6;
const CRY_MAX = 60;
const MAX_VOICES = 60;

function ensure(s) {
  s.keyBank ??= {}; // class -> [{ label, skill }], the DM's own lists; a class without one uses the rules file
  s.asks = []; // phones asking to roll: { id, charId, name, skill, label } (not saved)
  s.cry = null; // last battle cry on the TV: { n, id, who, text, hue } (not saved)
  s.tipsN ??= 0; // the DM resets the phone tips by raising this
  s.tts ??= { on: false, npcs: {} }; // NPC voices: name -> { voice, pitch, rate, mute }
  s.stillBackdrops ??= []; // backdrops that do not drift on the TV
}

// ----- key bank -----
const listFor = (cls) => state.keyBank?.[cls] || (sys().keyBank?.[cls] || []).map((skill) => ({ label: skill, skill }));
// The quick rolls of one character, with the bonus the active rules give.
const keysFor = (c) => listFor(c.cls).filter((k) => sys().skills.includes(k.skill)).map((k) => ({ ...k, bonus: sys().bonus(c, k.skill) }));
// "Stealth, Sneak = Stealth": a skill, or the DM's own name for one. Empty text goes back to the rules file.
function setKeys(cls, text) {
  if (!Object.hasOwn(sys().classes, cls)) return { error: 'No such profession.' };
  const parts = str(text, 400).split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) { delete state.keyBank[cls]; return { ok: true }; }
  const out = [];
  for (const part of parts.slice(0, MAX_KEYS)) {
    const [a, b] = part.split('=').map((x) => x.trim());
    const skill = sys().skills.find((x) => x.toLowerCase() === (b || a).toLowerCase());
    if (!skill) return { error: `${b || a} is not a skill in these rules.` };
    out.push({ label: (b && str(a, 24)) || skill, skill });
  }
  state.keyBank[cls] = out;
  return { ok: true };
}
const bankView = () => Object.keys(sys().classes).map((cls) => ({ cls, custom: !!state.keyBank[cls], keys: listFor(cls).map((k) => (k.label === k.skill ? k.skill : `${k.label} = ${k.skill}`)).join(', ') }));

// A phone taps a quick roll: the DM is asked. Tapping it again takes the ask back.
function ask(c, skill) {
  const k = keysFor(c).find((x) => x.skill === skill);
  if (!k) return { error: 'Not on your key bank.' };
  const had = state.asks.find((a) => a.charId === c.id);
  state.asks = state.asks.filter((a) => a !== had);
  if (had?.skill === skill) return { ok: true, asked: false };
  state.asks.push({ id: nextId(), charId: c.id, name: c.name, skill, label: k.label });
  return { ok: true, asked: true };
}
// The DM's answer: no, a roll with a DC (a roll call on that phone), or a plain roll now.
// A DC replaces the roll call on screen, as a new roll call from the DM does.
function answer(id, { no, dc, hideDc } = {}) {
  const a = state.asks.find((x) => x.id === id);
  if (!a) return null;
  state.asks = state.asks.filter((x) => x !== a);
  const c = state.players[a.charId];
  if (!c || no) return null;
  const rolls = require('./rolls');
  if (dc !== undefined && dc !== null && dc !== '') { rolls.call({ kind: 'skill', key: a.skill, dc, hideDc, targets: [c.id] }); return null; }
  return rolls.free(c, 'skill', a.skill);
}
// The DM's own one-tap roll for a character.
function quickRoll(charId, skill) {
  const c = state.players[charId];
  return c && sys().skills.includes(skill) ? require('./rolls').free(c, 'skill', skill) : null;
}

// ----- battle cry -----
function cry(c, text) {
  const t = str(text, CRY_MAX);
  if (!t) return;
  log('combat', `${c.name}: “${t}”`, { said: t });
  state.cry = { n: nextId(), id: state.log[state.log.length - 1].id, who: c.name, text: t, hue: c.hue };
}
// One tap: off the TV and out of the table's log (the DM still sees the line).
function hideCry() {
  if (!state.cry) return;
  const line = state.log.find((l) => l.id === state.cry.id);
  if (line) line.vis = 'dm';
  state.cry = null;
}

// ----- NPC voices -----
const clampTo = (v, lo, hi, d) => { const n = Number(v); return v !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
function setVoice(name, f = {}) {
  const who = str(name, 40);
  const known = Object.hasOwn(state.tts.npcs, who);
  if (!who || who === '__proto__' || (!known && Object.keys(state.tts.npcs).length >= MAX_VOICES)) return;
  const v = known ? state.tts.npcs[who] : { voice: '', pitch: 1, rate: 1, mute: false };
  state.tts.npcs[who] = {
    voice: f.voice !== undefined ? str(f.voice, 80) : v.voice,
    pitch: clampTo(f.pitch, 0.5, 1.8, v.pitch),
    rate: clampTo(f.rate, 0.6, 1.6, v.rate),
    mute: f.mute !== undefined ? !!f.mute : v.mute,
  };
}

// ----- backdrop drift -----
function setDrift(id, on) {
  if (!state.backdrop.library.some((b) => b.id === id)) return;
  state.stillBackdrops = state.stillBackdrops.filter((x) => x !== id);
  if (!on) state.stillBackdrops = [...state.stillBackdrops, id].slice(-200);
}

module.exports = { ensure, keysFor, setKeys, bankView, ask, answer, quickRoll, cry, hideCry, setVoice, setDrift };
