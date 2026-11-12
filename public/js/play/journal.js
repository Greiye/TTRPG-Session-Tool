// Phone party journal tab: shared notes (clues, NPC names, places). Everyone at the table sees them;
// you can remove your own. The DM copies entries into the recap quiz (src/journal.js).
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
const KIND = { clue: '🔎 Clue', npc: '🧑 NPC', note: '📝 Note' };
addTab('journal', '📓 Journal');
const root = () => $('#tabJournal');
let draft = ''; // the text being typed, kept across re-renders
let kind = 'note';

function render() {
  const S = state();
  if (!S || !S.players.some((p) => p.id === me.charId)) return;
  const list = S.journal || [];
  const entries = list.map((e) => `<div class="item journal-entry">
      <p><small class="muted">${esc(KIND[e.kind] || KIND.note)} · ${esc(e.name)}</small><br>${esc(e.text)}</p>
      ${e.by === me.charId ? `<button class="btn small danger" data-journal-del="${esc(e.id)}">Remove</button>` : ''}
    </div>`).join('');
  root().innerHTML = `<div class="card"><h3>📓 Party journal</h3>
      <p class="note">Write what the party learns: clues, names, places. The DM may quiz you on these.</p>
      <div class="row">
        <select id="journalKind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input id="journalText" class="grow" maxlength="300" placeholder="e.g. Mirela runs the inn" value="${esc(draft)}">
        <button class="btn primary" id="journalAdd">Add</button>
      </div></div>
    <div class="list">${entries || '<p class="note" style="text-align:center">The journal is empty.</p>'}</div>`;
}
onState(render);
onTab((id) => { if (id === 'journal') render(); });

root().addEventListener('input', (e) => { if (e.target.id === 'journalText') draft = e.target.value; });
root().addEventListener('change', (e) => { if (e.target.id === 'journalKind') kind = e.target.value; });
root().addEventListener('click', (e) => {
  const del = e.target.closest('[data-journal-del]');
  if (del) { socket.emit('player:journal:remove', { id: del.dataset.journalDel }); return; }
  if (e.target.closest('#journalAdd')) {
    const text = $('#journalText')?.value.trim();
    if (!text) return;
    socket.emit('player:journal:add', { text, kind });
    draft = '';
    navigator.vibrate?.(20);
  }
});
