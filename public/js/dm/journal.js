// DM party journal: read the phones' notes. "→ quiz" copies an entry into the recap quiz box as a question.
import { $, emit, onState } from '../client.js';

const { esc } = Stage;
const KIND = { clue: '🔎', npc: '🧑', note: '📝' };

onState((s) => {
  const list = s.journal;
  if (!list) return;
  $('#journalList').innerHTML = list.length
    ? list.map((e) => `<div class="item"><span><small class="muted">${KIND[e.kind] || KIND.note} ${esc(e.name)}</small> ${esc(e.text)}</span>
        <span class="row"><button class="btn small" data-quiz-from="${esc(e.text)}" title="Add to the recap quiz box">→ quiz</button>
        <button class="btn small danger" data-journal-del="${esc(e.id)}">✕</button></span></div>`).join('')
    : '<p class="note">No notes yet. Phones add clues and names here.</p>';
});

$('#journalList').addEventListener('click', (e) => {
  const del = e.target.closest('[data-journal-del]');
  if (del) { emit('dm:journal:remove', { id: del.dataset.journalDel }); return; }
  const q = e.target.closest('[data-quiz-from]');
  if (q) {
    const box = $('#quizText');
    box.value = (box.value.trimEnd() ? box.value.trimEnd() + '\n' : '') + q.dataset.quizFrom + ' | ';
    box.focus();
  }
});
