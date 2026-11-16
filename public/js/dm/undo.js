// One-tap Undo and Redo in the DM's top bar (src/undo.js). Every change at the table, made by the tool or by
// anyone, can be taken back: the button names what it would undo. Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes,
// except while typing in a field (the browser's own undo works there).
import { $, call, mount, onState } from '../client.js';

const { esc } = Stage;
const bar = mount(`<span class="undo-bar" id="undoBar">
  <button class="btn small undo-btn" id="undoBtn" disabled aria-keyshortcuts="Control+Z">↶ Undo</button>
  <button class="btn small undo-btn" id="redoBtn" hidden aria-keyshortcuts="Control+Shift+Z">↷ Redo</button>
  <span class="undo-note" id="undoNote" role="status" aria-live="polite"></span>
</span>`, null);
$('#barMin').after(bar);

const short = (t) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);
let noteTimer = null;
function note(text, kind = '') {
  const n = $('#undoNote');
  n.textContent = text;
  n.className = `undo-note show ${kind}`;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { n.className = 'undo-note'; }, 2600);
}

let busy = false;
async function go(which) {
  if (busy) return;
  busy = true;
  const r = await call(`dm:${which}`);
  busy = false;
  if (r?.error) return note(r.error, 'err');
  note(which === 'undo' ? `Undone: ${short(r.undone)}` : `Redone: ${short(r.redone)}`);
  window.Anim?.play($(which === 'undo' ? '#undoBtn' : '#redoBtn'), 'flash', null);
  window.Anim?.play($('#stage'), 'fade', null); // the table visibly settles back
}
$('#undoBtn').onclick = () => go('undo');
$('#redoBtn').onclick = () => go('redo');

onState((s) => {
  const u = s.undo;
  if (!u) { bar.hidden = true; return; } // helpers (Battle and Social Masters) never get the history
  bar.hidden = false;
  const ub = $('#undoBtn');
  const rb = $('#redoBtn');
  ub.disabled = !u.undo;
  ub.title = u.undo ? `Undo: ${u.undo} (Ctrl+Z)` : 'Nothing to undo yet';
  ub.setAttribute('aria-label', u.undo ? `Undo: ${u.undo}` : 'Undo (nothing to undo)');
  rb.hidden = !u.redo;
  rb.title = u.redo ? `Redo: ${u.redo} (Ctrl+Shift+Z)` : '';
  rb.setAttribute('aria-label', u.redo ? `Redo: ${u.redo}` : 'Redo');
  ub.innerHTML = `↶ Undo${u.undo ? ` <small>${esc(short(u.undo))}</small>` : ''}`;
});

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); go('undo'); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); go('redo'); }
});
