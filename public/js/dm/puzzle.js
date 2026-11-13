// DM puzzle card: start a riddle, cipher or order puzzle, give each clue to a player (or every phone),
// mark wrong guesses and confirm the solve. The rules live in src/puzzle.js.
import { $, emit, call, onState } from '../client.js';

const { esc } = Stage;
const HINT = {
  riddle: 'Riddle text, as the table hears it',
  cipher: 'The message to encode. Phones get the shifted text and shift it back.',
  order: 'The items in their true order, comma separated. The TV shows them shuffled.',
};

function syncFields() {
  const t = $('#puzType').value;
  $('#puzAnswer').hidden = t !== 'riddle';
  $('#puzShift').hidden = t !== 'cipher';
  $('#puzPrompt').placeholder = HINT[t];
}
$('#puzType').addEventListener('change', syncFields);
syncFields();

$('#puzStart').onclick = async () => {
  const r = await call('dm:puzzle:start', {
    type: $('#puzType').value,
    title: $('#puzTitle').value.trim(),
    prompt: $('#puzPrompt').value.trim(),
    answer: $('#puzAnswer').value.trim(),
    shift: $('#puzShift').value,
    clues: $('#puzClues').value,
  });
  $('#puzMsg').textContent = r?.error || 'Puzzle started. Clues are with the players.';
};
$('#puzSolve').onclick = () => emit('dm:puzzle:solve');
$('#puzReopen').onclick = () => emit('dm:puzzle:reopen');
$('#puzClear').onclick = () => { if (confirm('Clear the puzzle for everyone?')) emit('dm:puzzle:clear'); };

// Clue owner: a seated player, every phone, or held back.
$('#puzList').addEventListener('change', (e) => {
  const id = e.target.dataset.clue;
  if (id) emit('dm:puzzle:assign', { clueId: id, pid: e.target.value || null });
});
$('#puzList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-gwrong]');
  if (b) emit('dm:puzzle:guessmark', { guessId: b.dataset.gwrong, wrong: b.dataset.on === '1' });
});

onState((s) => {
  const p = s.puzzle;
  const box = $('#puzList');
  $('#puzStatus').textContent = !p ? 'no puzzle' : p.status === 'solved' ? 'solved' : 'open';
  $('#puzSolve').hidden = !p || p.status === 'solved';
  $('#puzReopen').hidden = !p || p.status !== 'solved';
  if (!p) { box.innerHTML = '<p class="note">Nothing yet.</p>'; return; }

  const seat = (pid) => `<option value="" ${pid == null ? 'selected' : ''}>Held back</option><option value="*" ${pid === '*' ? 'selected' : ''}>Every phone</option>${s.players.map((x) => `<option value="${esc(x.id)}" ${pid === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const clues = p.clues.map((c) => `<div class="item"><span>${esc(c.text)}</span><select data-clue="${esc(c.id)}" aria-label="Who gets this clue">${seat(c.pid)}</select></div>`).join('');
  const guesses = p.guesses.slice().reverse().map((g) => `<div class="item"><span><b>${esc(g.name)}</b> ${esc(g.text)} ${g.match ? '<small class="muted">✓ matches</small>' : ''}</span><button class="btn small ${g.wrong ? 'danger' : ''}" data-gwrong="${esc(g.id)}" data-on="${g.wrong ? 0 : 1}">${g.wrong ? '✗ wrong' : 'Mark wrong'}</button></div>`).join('') || '<p class="note">No guesses yet.</p>';
  box.innerHTML = `<p><b>${esc(p.title)}</b> <small class="muted">${esc(p.type)} · answer: ${esc(p.answer || (p.order || []).join(', '))}${p.type === 'cipher' ? ` · shows as: ${esc(p.prompt)}` : ''}</small></p>
    <h4>Clues</h4>${clues}<h4>Guesses</h4>${guesses}`;
});
