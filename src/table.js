// Phase I table control tools. Each one is a small piece of state the DM drives, or a phone acts on.
// Nothing here decides an outcome: the DM sees every number and can override each one (see docs/decisions.md, Phase I).
//   cues       DM cue deck: one tap sets the lights, backdrop, layers, mode, a one-shot and a handout
//   nudge      silent prompt to one phone (vibration + line); the player chooses whether to share it
//   balance    spotlight meter: how much each character has acted or spoken (DM only)
//   bonds      each character names a bond with another; the DM is reminded to call it back
//   tension    dread bar on the TV (0 to 10) with a label
//   foreshadow hints the DM plants; paid-off hints form the recap
//   framing    scene framing: a spent token adds a detail to the canon on the TV
//   montage    one prompt, one answer per phone, revealed together on the TV
//   layouts    one-tap TV layouts (auto, social, combat, exploration, rest)
const { state, nextId, log } = require('./state');
const { roster } = require('./roster');
const { str, int } = require('./util');
const world = require('./world');
const hub = require('./hub');
const { fresh, ensure } = require('./table-state');

const MODES = ['exploration', 'combat', 'social'];
const LAYOUTS = ['auto', 'social', 'combat', 'exploration', 'rest'];
const LIMITS = { cues: 30, nudges: 60, hints: 60, canon: 30, layers: 6 };

// ----- 1. DM cue deck -----
function addCue(f = {}) {
  if (state.cues.length >= LIMITS.cues) return null;
  const cue = {
    id: 'q' + nextId(),
    name: str(f.name, 60) || 'Cue',
    mode: MODES.includes(f.mode) ? f.mode : null,
    light: world.LIGHTS.includes(f.light) ? f.light : null,
    backdrop: str(f.backdrop, 80) || null, // backdrop library id
    layers: Array.isArray(f.layers) ? f.layers.map((x) => str(x, 80)).filter(Boolean).slice(0, LIMITS.layers) : null, // soundboard loop ids
    sfx: str(f.sfx, 80) || null, // built-in sfx id or library id
    handout: f.handout && str(f.handout.text, 1) ? { title: str(f.handout.title, 80) || 'Handout', text: str(f.handout.text, 1200) } : null,
  };
  state.cues.push(cue);
  return cue;
}
// Fire a cue: each part applies the same way the single-control version does. Returns what changed.
function fireCue(cue) {
  const did = [];
  if (cue.mode) { state.mode = cue.mode; world.applyMood(cue.mode); state.check = null; did.push('mode'); }
  if (cue.light) { world.setLight(cue.light); did.push('light'); }
  if (cue.backdrop) { state.backdrop.image = state.backdrop.library.find((b) => b.id === cue.backdrop) || null; did.push('backdrop'); }
  if (cue.layers) {
    const tracks = [...state.audio.loops, ...state.audio.library];
    state.audio.mix = cue.layers.map((id) => tracks.find((t) => t.id === id)).filter(Boolean)
      .map((t) => ({ id: t.id, url: t.url, name: t.name, volume: 0.5 }));
    did.push('layers');
  }
  if (cue.sfx) {
    const builtin = require('./media').BUILTIN_SFX.includes(cue.sfx);
    const t = builtin ? null : [...state.audio.loops, ...state.audio.library].find((x) => x.id === cue.sfx);
    if (builtin) hub.io?.emit('sfx', { builtin: cue.sfx }); else if (t) hub.io?.emit('sfx', { url: t.url });
    did.push('sfx');
  }
  if (cue.handout) {
    state.handouts.push({ id: 'h' + nextId(), kind: 'handout', title: cue.handout.title, text: cue.handout.text, image: null, vis: { to: ['*'], screen: true }, at: Date.now() });
    did.push('handout');
  }
  log('narrate', `Cue: ${cue.name}.`);
  return did;
}

// ----- 2. Secret nudge: one phone, silent. The DM sees what was sent and how the player answered. -----
function sendNudge(charId, text) {
  const p = state.players[charId];
  const t = str(text, 160);
  if (!p || !t) return null;
  const rec = { id: 'n' + nextId(), charId, name: p.name, text: t, at: Date.now(), status: 'sent' };
  state.nudges.push(rec);
  if (state.nudges.length > LIMITS.nudges) state.nudges.shift();
  return rec;
}
// The player shares it aloud (their own words, or the prompt) or keeps it to themselves.
function answerNudge(id, charId, share, words) {
  const rec = state.nudges.find((n) => n.id === id && n.charId === charId && n.status === 'sent');
  if (!rec) return false;
  rec.status = share ? 'shared' : 'kept';
  if (share) log('say', `${rec.name} shares: “${str(words, 160) || rec.text}”`, { tone: 'call' });
  return true;
}

// ----- 3. Spotlight balance: counts only. The DM decides who gets the moment. -----
function bump(charId, kind) {
  if (!state.players[charId]) return;
  const b = (state.balance[charId] ||= { acts: 0, talk: 0 });
  b[kind === 'talk' ? 'talk' : 'acts'] += 1;
}
function balanceView() {
  const rows = Object.values(state.players).map((p) => {
    const b = state.balance[p.id] || { acts: 0, talk: 0 };
    return { id: p.id, name: p.name, acts: b.acts, talk: b.talk, total: b.acts + b.talk };
  });
  const sum = rows.reduce((a, r) => a + r.total, 0);
  const avg = rows.length ? sum / rows.length : 0;
  return rows.map((r) => ({ ...r, share: sum ? Math.round((100 * r.total) / sum) : 0, quiet: sum > 0 && r.total <= avg / 2 }));
}

// ----- 4. Bonds and ties: stored on the character (roster), reminders counted in sessions -----
const BOND_GAP = 2; // sessions without a call-back before the DM is reminded
function setBond(charId, toId, text) {
  const c = roster[charId];
  if (!c || !roster[toId] || toId === charId) return false;
  const t = str(text, 160);
  if (!t) return false;
  c.bond = { to: toId, text: t, set: state.sessionNo, called: state.sessionNo };
  if (state.players[charId] && state.players[charId] !== c) state.players[charId].bond = c.bond;
  return true;
}
function callBack(charId) {
  const c = roster[charId];
  if (!c?.bond) return false;
  c.bond.called = state.sessionNo;
  if (state.players[charId] && state.players[charId] !== c) state.players[charId].bond = c.bond;
  return true;
}
// Bonds the DM should call back this session. Reminders are for the DM only.
function dueBonds() {
  return Object.values(state.players)
    .filter((p) => p.bond && state.sessionNo - (p.bond.called ?? p.bond.set ?? 0) >= BOND_GAP)
    .map((p) => ({ charId: p.id, name: p.name, to: p.bond.to, toName: state.players[p.bond.to]?.name || roster[p.bond.to]?.name || '?', text: p.bond.text, since: p.bond.called ?? p.bond.set ?? 0 }));
}

// ----- 5. Live tension track -----
function setTension({ value, label, on } = {}) {
  const t = state.tension;
  if (value !== undefined) t.value = int(value, 0, 10, t.value);
  if (label !== undefined) t.label = str(label, 30) || 'Tension';
  if (on !== undefined) t.on = !!on;
}

// ----- 6. Prophecy and foreshadow tracker -----
function addHint(text) {
  const t = str(text, 200);
  if (!t || state.foreshadow.length >= LIMITS.hints) return null;
  const h = { id: 'f' + nextId(), text: t, paid: false, payoff: '', session: state.sessionNo };
  state.foreshadow.push(h);
  return h;
}
function payOff(id, payoff) {
  const h = state.foreshadow.find((x) => x.id === id);
  if (!h) return false;
  Object.assign(h, { paid: true, payoff: str(payoff, 200), paidSession: state.sessionNo });
  return true;
}
function unpay(id) {
  const h = state.foreshadow.find((x) => x.id === id);
  if (h) Object.assign(h, { paid: false, payoff: '', paidSession: null });
  return !!h;
}
function removeHint(id) { state.foreshadow = state.foreshadow.filter((x) => x.id !== id); }
// The recap: DM sees every hint; the table sees only the payoffs.
const recapFor = (list, viewer) => (list || []).filter((h) => viewer.role === 'dm' || h.paid);

// ----- 7. Player-driven scene framing: one token, one detail, shown as canon -----
const TOKEN_MAX = 3;
function grantToken(charId, n = 1) {
  if (!state.players[charId]) return false;
  state.framing[charId] = Math.min(TOKEN_MAX, (state.framing[charId] || 0) + int(n, 1, TOKEN_MAX, 1));
  return true;
}
function spendToken(charId, text) {
  const p = state.players[charId];
  const t = str(text, 200);
  if (!p || !t || !(state.framing[charId] > 0)) return null;
  state.framing[charId] -= 1;
  const item = { id: 'c' + nextId(), by: p.name, text: t, at: Date.now(), vis: 'all' };
  state.canon.push(item);
  if (state.canon.length > LIMITS.canon) state.canon.shift();
  log('narrate', `${p.name} frames the scene: ${t}`, { tone: 'call' });
  return item;
}
const removeCanon = (id) => { state.canon = state.canon.filter((x) => x.id !== id); };

// ----- 8. Montage mode: one prompt, one answer per phone, revealed together -----
function askMontage(prompt) {
  const p = str(prompt, 160);
  if (!p) return false;
  Object.assign(state.montage, { prompt: p, open: true, reveal: false, n: state.montage.n + 1, answers: {} });
  return true;
}
function answerMontage(charId, text) {
  const m = state.montage;
  if (!m.open || m.reveal || !state.players[charId]) return false;
  const t = str(text, 200);
  if (!t) return false;
  m.answers[charId] = t;
  return true;
}
function revealMontage() {
  if (!state.montage.prompt) return false;
  Object.assign(state.montage, { open: false, reveal: true });
  return true;
}
function closeMontage() { Object.assign(state.montage, { prompt: '', open: false, reveal: false, answers: {} }); }
// DM sees everything. Everyone else sees the count until the reveal, then all answers.
function montageView(m, viewer) {
  if (!m) return null;
  const base = { prompt: m.prompt, open: m.open, reveal: m.reveal, n: m.n, count: Object.keys(m.answers).length, total: Object.keys(state.players).length };
  if (viewer.role === 'dm') return { ...base, answers: m.answers };
  if (!m.reveal) return { ...base, mine: viewer.role === 'player' ? m.answers[viewer.charId] || null : null };
  const answers = Object.entries(m.answers).map(([id, text]) => ({ id, name: state.players[id]?.name || '?', text }));
  return { ...base, answers, mine: viewer.role === 'player' ? m.answers[viewer.charId] || null : null };
}

// ----- 9. One-tap TV layouts -----
function setLayout(name) {
  if (LAYOUTS.includes(name)) state.stageLayout = name;
}

module.exports = {
  MODES, LAYOUTS, LIMITS, fresh, ensure,
  addCue, fireCue, sendNudge, answerNudge, bump, balanceView, setBond, callBack, dueBonds, BOND_GAP,
  setTension, addHint, payOff, unpay, removeHint, recapFor, grantToken, spendToken, removeCanon, TOKEN_MAX,
  askMontage, answerMontage, revealMontage, closeMontage, montageView, setLayout,
};
