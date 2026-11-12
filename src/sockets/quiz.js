// Recap quiz events (see src/quiz.js). Phones answer; the DM starts, marks and closes.
const { state, log, broadcast } = require('../state');
const { roster } = require('../roster');
const quiz = require('../quiz');

module.exports = function quizSockets(socket) {
  const isDm = () => socket.data.role === 'dm';
  const me = () => {
    const c = state.players[socket.data.charId];
    return c && c.socketId === socket.id ? c : null;
  };

  // DM: start a quiz from "Question | Answer" lines. Replaces any quiz still open.
  socket.on('dm:quiz:start', ({ text } = {}) => {
    if (!isDm()) return;
    const q = quiz.start(text, `quiz${Date.now()}`);
    if (!q) return;
    state.quiz = q;
    log('system', `Recap quiz: ${q.questions.length} question(s) about the last session.`, { tone: 'call' });
    broadcast();
  });

  // DM: mark a phone's answer right or wrong (null clears). Each correct mark is one inspiration point.
  socket.on('dm:quiz:mark', ({ pid, qid, correct } = {}) => {
    if (!isDm() || !state.quiz) return;
    const delta = quiz.mark(state.quiz, pid, qid, correct === null ? null : !!correct);
    const c = roster[pid];
    if (!delta || !c) return broadcast();
    const total = quiz.adjust(c, delta);
    if (delta > 0) log('system', `${c.name} earns inspiration (${total}) from the recap quiz.`, { tone: 'good' });
    broadcast();
  });

  socket.on('dm:quiz:close', () => {
    if (!isDm() || !state.quiz?.open) return;
    state.quiz.open = false;
    log('system', 'The recap quiz is closed.');
    broadcast();
  });

  socket.on('dm:quiz:clear', () => {
    if (!isDm()) return;
    state.quiz = null;
    broadcast();
  });

  // Phone: answer one question (an empty answer clears it). Only while the quiz is open.
  socket.on('player:quiz:answer', ({ qid, text } = {}) => {
    const p = me();
    if (!p || !quiz.answer(state.quiz, p.id, qid, text)) return;
    broadcast();
  });
};
