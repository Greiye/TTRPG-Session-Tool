// Downtime between sessions: each week a character picks one activity on its phone (crafting, training
// or research) with a target. The DM resolves each pick before the next game and writes the result.
// A pick or result is private to its character and the DM; the TV and other phones never see it.
const { str } = require('./util');

const KINDS = {
  crafting: { name: 'Crafting', hint: 'Make or repair an item, e.g. a healing potion, a sturdy rope' },
  training: { name: 'Training', hint: 'Practise a skill or weapon, e.g. longsword drills, lockpicking' },
  research: { name: 'Research', hint: 'Look into a lead, e.g. the old mill, a rumoured relic' },
};
const MAX_TARGET = 200;
const MAX_RESULT = 1000;

// A fresh downtime. `n` counts the weeks so far, so a new week is distinct from the last.
const fresh = (n = 0) => ({ open: false, n, picks: {}, results: {} });

// Start a new week: picks and results reset, and picks are open at once.
function start(prev) {
  return { ...fresh((prev?.n || 0) + 1), open: true };
}

// A character chooses an activity. Only while picks are open; a later choice replaces the earlier one.
// Returns { ok: true } or { error }.
function choose(dt, pid, kind, target) {
  if (!dt?.n) return { error: 'No downtime is running.' };
  if (!dt.open) return { error: 'Picks are closed for this week.' };
  if (!KINDS[kind]) return { error: 'Choose crafting, training or research.' };
  const t = str(target, MAX_TARGET);
  if (!t) return { error: 'Say what your character does.' };
  dt.picks[pid] = { kind, target: t, at: Date.now() };
  return { ok: true };
}

// DM writes the outcome for one character. Empty text clears it. False if the character made no pick.
function resolve(dt, pid, text) {
  if (!dt?.n || !dt.picks[pid]) return false;
  const t = str(text, MAX_RESULT);
  if (t) dt.results[pid] = { text: t, at: Date.now() }; else delete dt.results[pid];
  return true;
}

// What one viewer may see: the DM sees every pick and result; a phone sees only its own.
function viewFor(dt, viewer) {
  if (!dt) return null;
  if (viewer.role === 'dm') return { ...dt, kinds: KINDS };
  if (viewer.role !== 'player') return null;
  const me = viewer.charId;
  return {
    n: dt.n, open: dt.open, kinds: KINDS,
    mine: dt.picks[me] || null,
    result: dt.results[me] || null,
  };
}

module.exports = { KINDS, MAX_TARGET, MAX_RESULT, fresh, start, choose, resolve, viewFor };
