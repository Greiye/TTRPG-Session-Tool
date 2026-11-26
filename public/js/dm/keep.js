// Keep star and Storybook link in the DM's top bar (src/storybook.js, Mike Nov 19). One tap (or K) keeps the newest
// thing the table saw as a moment for the story pack; a second tap un-keeps it. The tool keeps a natural 20, a
// chapter card, a TV moment and the end of a fight by itself; the star fills in so the DM can un-keep with one tap.
import { $, call, mount, onState, socket } from '../client.js';
import { dmKey, masterRole } from './auth.js';

const bar = mount(`<span class="keep-bar" id="keepBar" data-feature="storybook">
  <button class="btn small keep-btn" id="keepBtn" aria-pressed="false" aria-keyshortcuts="K" title="Keep the last moment for the storybook (K)">☆ Keep</button>
  <a class="btn small" id="storyLink" target="_blank" title="Replay past sessions and download a story pack">📖 Storybook</a>
  <span class="undo-note" id="keepNote" role="status" aria-live="polite"></span>
</span>`, null);
$('#barMin').after(bar);
$('#storyLink').href = `/story${dmKey() ? `?key=${encodeURIComponent(dmKey())}` : ''}`;

const short = (t) => (t && t.length > 50 ? `${t.slice(0, 47)}…` : t || '');
let lastId = null;
let noteTimer = null;
let filledAt = 0;
function show({ id, kept, text, auto }) {
  lastId = id;
  const b = $('#keepBtn');
  b.textContent = kept ? '★ Kept' : '☆ Keep';
  b.classList.toggle('kept', kept);
  b.classList.toggle('on', kept);
  b.setAttribute('aria-pressed', String(kept));
  b.dataset.id = id;
  filledAt = Date.now();
  const n = $('#keepNote');
  n.textContent = text ? `${kept ? (auto ? 'Kept for you' : 'Kept') : 'Un-kept'}: ${short(text)}` : kept ? 'Kept' : 'Un-kept';
  n.className = 'undo-note show';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { n.className = 'undo-note'; }, 2600);
  if (kept) window.Anim?.play(b, 'pop', null);
}
// Tapping the star right after an automatic keep un-keeps that one (the one-tap override); otherwise it keeps the newest.
async function keep() {
  const b = $('#keepBtn');
  const r = b.classList.contains('kept') && lastId != null ? await call('dm:keep', { id: lastId, on: false }) : await call('dm:keep');
  if (r?.error) { $('#keepNote').textContent = r.error; $('#keepNote').className = 'undo-note show err'; return; }
  show(r);
}
$('#keepBtn').onclick = keep;
socket.on('story:kept', (k) => { if (!masterRole()) show(k); });
// A new line (from 1.5 s after the keep) clears the filled star, so the next tap keeps the new line.
let seenLine = null;
onState((s) => {
  bar.hidden = !!masterRole();
  const top = s.log?.[s.log.length - 1]?.id;
  if (seenLine !== null && top !== seenLine && $('#keepBtn').classList.contains('kept') && Date.now() - filledAt > 1500) {
    const b = $('#keepBtn');
    b.textContent = '☆ Keep'; b.classList.remove('kept', 'on'); b.setAttribute('aria-pressed', 'false');
    lastId = null;
  }
  seenLine = top;
});
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'k' || masterRole()) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
  e.preventDefault();
  keep();
});
