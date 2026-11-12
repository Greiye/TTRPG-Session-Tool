// DM recap quiz: ask the table what happened last session, then mark each phone's answer.
// Correct marks give that character one inspiration point (server side, src/quiz.js).
import { $, emit, onState } from '../client.js';

const { esc } = Stage;

onState((s) => {
  const q = s.quiz;
  const who = s.players.filter((p) => p.inspiration).map((p) => `${esc(p.name)} ✨${p.inspiration}`).join(' · ');
  $('#quizStatus').innerHTML = (q ? (q.open ? 'open' : 'closed') : 'no quiz') + (who ? ` · ${who}` : '');
  if (!q) { $('#quizList').innerHTML = '<p class="note">Nothing yet.</p>'; return; }
  $('#quizList').innerHTML = q.questions.map((x) => {
    const rows = s.players.map((p) => {
      const ans = q.answers[p.id]?.[x.id];
      if (ans === undefined) return '';
      const m = q.marks[p.id]?.[x.id];
      return `<div class="item"><span><b>${esc(p.name)}</b> ${esc(ans)}</span>
        <span class="row"><button class="btn small ${m === true ? 'primary' : ''}" data-qid="${esc(x.id)}" data-pid="${esc(p.id)}" data-correct="1">✓</button>
        <button class="btn small ${m === false ? 'danger' : ''}" data-qid="${esc(x.id)}" data-pid="${esc(p.id)}" data-correct="0">✗</button></span></div>`;
    }).join('');
    const n = s.players.filter((p) => q.answers[p.id]?.[x.id] !== undefined).length;
    return `<div class="item"><span><b>${esc(x.text)}</b> <small class="muted">answer: ${esc(x.answer || '—')} · ${n} answered</small></span></div>${rows}`;
  }).join('');
});

$('#quizStart').onclick = () => {
  const text = $('#quizText').value.trim();
  if (text) emit('dm:quiz:start', { text });
};
$('#quizClose').onclick = () => emit('dm:quiz:close');
$('#quizClear').onclick = () => emit('dm:quiz:clear');

// Clicking the same mark again clears it.
$('#quizList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pid]');
  if (!b) return;
  const want = b.dataset.correct === '1';
  const isOn = b.classList.contains('primary') || b.classList.contains('danger');
  emit('dm:quiz:mark', { pid: b.dataset.pid, qid: b.dataset.qid, correct: isOn ? null : want });
});
