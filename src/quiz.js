// Recap quiz: at the start of a session the DM asks what happened before. Phones answer; the DM marks
// each answer. A correct mark gives that character one inspiration point (capped), which they spend to
// roll with advantage (src/rolls.js). The DM writes the questions as "Question | Answer" lines.
//
// Visibility: the DM sees answers and marks; a phone sees the questions and only its own answers and
// marks; the TV and guests see nothing.
const { str } = require('./util');

const MAX_QUESTIONS = 12;
const MAX_INSPIRATION = 5;

// "What did the innkeeper want? | Rent for the cellar" per line. Leading list markers are dropped.
function parseQuestions(text) {
  return String(text || '').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const [q, ...rest] = line.split('|');
      return { text: str(q.replace(/^[-*\d.)\s]+/, ''), 200), answer: str(rest.join('|'), 200) };
    })
    .filter((x) => x.text)
    .slice(0, MAX_QUESTIONS)
    .map((x, i) => ({ id: `q${i + 1}`, ...x }));
}

function start(text, id) {
  const questions = parseQuestions(text);
  if (!questions.length) return null;
  return { id, questions, open: true, answers: {}, marks: {}, at: Date.now() };
}

// A phone answers one question at a time; an empty answer clears it. Only while the quiz is open.
function answer(quiz, pid, qid, text) {
  if (!quiz?.open || !quiz.questions.some((q) => q.id === qid)) return false;
  const t = str(text, 300);
  quiz.answers[pid] ??= {};
  if (t) quiz.answers[pid][qid] = t; else delete quiz.answers[pid][qid];
  return true;
}

// DM mark: correct true/false, or null to clear. Returns the change in inspiration points (-1, 0 or 1),
// or null if the answer does not exist.
function mark(quiz, pid, qid, correct) {
  if (!quiz || quiz.answers[pid]?.[qid] === undefined) return null;
  quiz.marks[pid] ??= {};
  const prev = quiz.marks[pid][qid] === true;
  const next = correct === true;
  if (correct == null) delete quiz.marks[pid][qid]; else quiz.marks[pid][qid] = next;
  return (next ? 1 : 0) - (prev ? 1 : 0);
}

// Grant or take back points, never below 0 or above the cap.
const adjust = (c, delta) => { c.inspiration = Math.max(0, Math.min(MAX_INSPIRATION, (c.inspiration || 0) + delta)); return c.inspiration; };

// What one viewer may see of the quiz (see visibility.js).
function viewFor(quiz, viewer) {
  if (!quiz) return null;
  if (viewer.role === 'dm') return quiz;
  if (viewer.role !== 'player') return null;
  const me = viewer.charId;
  return {
    id: quiz.id, open: quiz.open, at: quiz.at,
    questions: quiz.questions.map(({ id, text }) => ({ id, text })),
    mine: quiz.answers[me] || {},
    marks: quiz.marks[me] || {},
  };
}

module.exports = { MAX_INSPIRATION, MAX_QUESTIONS, parseQuestions, start, answer, mark, adjust, viewFor };
