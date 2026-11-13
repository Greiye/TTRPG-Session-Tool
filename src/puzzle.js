// Teamwork puzzles (Phase F). The DM sets a riddle, a cipher or an order puzzle and splits its clues
// across the phones, so the table has to talk to solve it. Phones send guesses; the DM marks wrong ones
// and confirms the solve. The TV shows the prompt, then the solution with an animation.
//
// Visibility: the DM sees the answer, every clue and whether each guess matches. A phone sees the clues
// addressed to it ('*' means every phone) and the shared guesses, plus the solution once solved. The TV
// sees the prompt, the items and the solution once solved, never the clues or the guesses.
const { str, int } = require('./util');

const TYPES = ['riddle', 'cipher', 'order'];
const MAX_CLUES = 12;
const MAX_ITEMS = 8;
const MAX_GUESSES = 60;

// Lower case, letters and digits only, single spaces. "The Mill!" and "the  mill" compare equal.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Riddle answers may list alternatives: "Mirela / the innkeeper".
const alts = (s) => String(s || '').split('/').map((x) => x.trim()).filter(Boolean);
const splitList = (text) => String(text || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

// Caesar shift forward on letters; case and punctuation stay. The phones shift back to read it.
function caesar(text, shift) {
  const k = int(shift, 0, 25, 0);
  return String(text).replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + k) % 26) + base);
  });
}

// Fisher-Yates with crypto-free randomness: the order only has to look shuffled on the TV.
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (a.length > 1 && a.every((x, i) => x === list[i])) a.reverse(); // never show the true order
  return a;
}

// "Clue text" per line. Clues start unassigned; create() spreads them over the seated players.
function parseClues(text) {
  return String(text || '').split('\n').map((l) => l.trim().replace(/^[-*\d.)\s]+/, '')).filter(Boolean)
    .slice(0, MAX_CLUES).map((t, i) => ({ id: `c${i + 1}`, text: str(t, 240), pid: null }));
}

// Spread unassigned clues over the seated players in turn. With nobody seated, clues wait for the DM.
function spread(clues, pids) {
  if (!pids.length) return clues;
  return clues.map((c, i) => (c.pid == null ? { ...c, pid: pids[i % pids.length] } : c));
}

// spec: { type, title, prompt, answer, shift, clues (text, one per line) }. pids: seated character ids.
// Returns { puzzle } or { error }. Nothing is stored here; the caller keeps the puzzle.
function create(spec, pids, id) {
  const type = TYPES.includes(spec.type) ? spec.type : null;
  if (!type) return { error: 'Pick a puzzle type: riddle, cipher or order.' };
  const title = str(spec.title, 80);
  if (!title) return { error: 'A puzzle needs a title.' };
  const clues = parseClues(spec.clues);
  if (!clues.length) return { error: 'Add at least one clue, one per line.' };
  const p = { id, type, title, status: 'open', clues: spread(clues, pids), guesses: [], at: Date.now(), solvedAt: null };
  if (type === 'riddle') {
    p.prompt = str(spec.prompt, 600);
    p.answer = str(spec.answer, 200);
    if (!p.prompt || !alts(p.answer).length) return { error: 'A riddle needs its text and an answer.' };
  } else if (type === 'cipher') {
    const plain = str(spec.prompt, 300);
    if (!plain) return { error: 'Write the message to encode.' };
    p.shift = int(spec.shift, 0, 25, 3);
    p.answer = plain;
    p.prompt = caesar(plain, p.shift);
  } else {
    const items = splitList(spec.prompt).map((x) => str(x, 60)).slice(0, MAX_ITEMS);
    if (items.length < 3) return { error: 'An order puzzle needs at least three items, in the true order, comma separated.' };
    p.order = items;
    p.answer = items.join(', ');
    p.prompt = 'Put these in order.';
    p.shown = shuffle(items);
  }
  return { puzzle: p };
}

// Does a guess solve it? Riddle and cipher: any listed alternative. Order: the same items in the same order.
function matches(p, text) {
  if (p.type === 'order') {
    const got = splitList(text).map(norm).filter(Boolean);
    return got.length === p.order.length && got.every((x, i) => x === norm(p.order[i]));
  }
  const g = norm(text);
  return !!g && alts(p.answer).some((a) => norm(a) === g);
}

const solution = (p) => (p.type === 'order' ? p.order.join(' → ') : alts(p.answer)[0] || p.answer);

// A phone's guess. Ignored once solved. Returns the guess or null.
function guess(p, pid, name, text, id) {
  if (!p || p.status !== 'open') return null;
  const t = str(text, 200);
  if (!t) return null;
  const g = { id, pid, name: str(name, 40), text: t, at: Date.now(), wrong: false };
  p.guesses.push(g);
  if (p.guesses.length > MAX_GUESSES) p.guesses.shift();
  return g;
}

// Clue assignment: a seated character id, '*' for every phone, or null to hold it back.
function assign(p, clueId, pid) {
  const c = p?.clues.find((x) => x.id === clueId);
  if (!c) return false;
  c.pid = pid ?? null;
  return true;
}

// DM: mark a guess wrong (greyed on phones) or clear the mark.
function markGuess(p, gid, wrong) {
  const g = p?.guesses.find((x) => x.id === gid);
  if (!g) return false;
  g.wrong = !!wrong;
  return true;
}

function solve(p, now = Date.now()) {
  if (!p || p.status === 'solved') return false;
  p.status = 'solved';
  p.solvedAt = now;
  return true;
}

function reopen(p) {
  if (!p || p.status !== 'solved') return false;
  p.status = 'open';
  p.solvedAt = null;
  return true;
}

// What one viewer may see (see visibility.js). `me` is the phone's character id.
function viewFor(p, viewer) {
  if (!p) return null;
  const solved = p.status === 'solved';
  const base = { id: p.id, type: p.type, title: p.title, prompt: p.prompt, items: p.shown || null, status: p.status, solvedAt: p.solvedAt, solution: solved ? solution(p) : undefined };
  if (viewer.role === 'dm') {
    return { ...p, solution: solution(p), guesses: p.guesses.map((g) => ({ ...g, match: matches(p, g.text) })) };
  }
  if (viewer.role === 'screen') return { ...base, clueCount: p.clues.length, guesses: [] };
  if (viewer.role === 'player') {
    const me = viewer.charId;
    return {
      ...base,
      clues: p.clues.filter((c) => c.pid === me || c.pid === '*').map(({ id, text }) => ({ id, text })),
      guesses: p.guesses.map(({ id, pid, name, text, wrong }) => ({ id, name, text, wrong, mine: pid === me })),
    };
  }
  return null;
}

module.exports = { TYPES, MAX_CLUES, MAX_ITEMS, norm, alts, caesar, parseClues, create, matches, solution, guess, assign, markGuess, solve, reopen, viewFor };
