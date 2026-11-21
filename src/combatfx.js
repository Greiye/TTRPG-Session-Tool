// Combat cues (combat aesthetic, first slice; docs/combat-aesthetic.md). One small event per hit, crit,
// miss, heal, down and turn, which public/combatfx.js plays on the TV, the DM page and phones.
//
// Numbers (Mike, Nov 17): only the DM sees damage and health numbers. The DM room ('dms') gets the amount;
// every other screen gets the cue without it, unless the table setting "Health numbers" is set to Everyone.
// Each screen can switch the effects off with its "Combat effects" setting; the server always sends cues.
const hub = require('./hub');
const { state } = require('./state');

const KINDS = ['hit', 'crit', 'miss', 'heal', 'down', 'turn'];
let seq = 0;

// Health numbers for everyone, or the DM only (the default; a save without the setting is DM only).
const numbersForAll = (s = state) => s.settings?.display?.numbers === 'all';

const sideOf = (c) => (!c ? null : c.enemy || c.side ? (c.side || 'enemy') : 'party');
// Who: id, name, side, and the accent colour the screens draw with (players have a hue, creatures an accent).
function who(c) {
  if (!c) return null;
  const out = { id: c.id, name: String(c.name || '').slice(0, 40), side: sideOf(c) };
  if (Number.isFinite(c.hue)) out.hue = c.hue % 360;
  if (typeof c.accent === 'string' && /^#[0-9a-f]{6}$/i.test(c.accent)) out.accent = c.accent;
  // The attacker pop-up shows this picture; without one the screens draw a placeholder.
  const img = [c.portrait, c.img, c.image].find((u) => typeof u === 'string' && /^(\/uploads\/|\/samples\/|https?:\/\/)/.test(u));
  if (img) out.img = img.slice(0, 300);
  return out;
}

// Builds one cue. Returns null for an unknown kind or a missing target.
const STYLES = ['slash', 'pierce', 'tap', 'combo']; // combo: a node strike (martial artists, unique weapons)
function cue(kind, { target, by, amount, style } = {}) {
  if (!KINDS.includes(kind) || !target) return null;
  const c = { n: ++seq, kind, target: who(target) };
  if (by && by !== target) c.by = who(by);
  if (STYLES.includes(style) && ['hit', 'crit', 'miss'].includes(kind)) c.style = style; // the strike gesture, so the TV draws a slash or a stab
  if (Number.isFinite(amount) && amount > 0 && ['hit', 'crit', 'heal'].includes(kind)) c.amount = Math.round(amount);
  return c;
}
// What a screen without the DM's view gets: the same cue minus the amount.
const forPlayers = (c, s = state) => {
  if (numbersForAll(s) || c.amount == null) return c;
  const { amount, ...rest } = c;
  return rest;
};

function emit(kind, opts) {
  const c = cue(kind, opts);
  if (!c || !hub.io) return c;
  hub.io.to('dms').emit('cfx', c);
  hub.io.except('dms').emit('cfx', forPlayers(c));
  return c;
}

// End of combat (Mike, Nov 21): one pop-up on every screen. won: every enemy is down.
let endSeq = 0;
function end({ won = false } = {}) {
  const c = { n: ++endSeq, won: !!won };
  hub.io?.emit('cfx:end', c);
  return c;
}

module.exports = { KINDS, cue, forPlayers, emit, end, numbersForAll };
