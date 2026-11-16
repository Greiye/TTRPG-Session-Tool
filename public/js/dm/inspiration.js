// Inspiration tab (DM): each seated character's inspiration points as gems, with + and − to give or take one.
// Points are capped at 5 (src/quiz.js MAX_INSPIRATION); a phone spends one to roll with advantage.
import { $, emit, onState } from '../client.js';

const { esc } = Stage;
const MAX = 5;
let key = null;
const last = {}; // character id -> points last drawn, so a new point can sparkle

onState((s) => {
  const list = $('#inspList');
  if (!list) return;
  const party = s.players || [];
  const k = party.map((p) => `${p.id}:${p.inspiration || 0}:${p.name}`).join('|');
  if (k === key) return;
  key = k;
  list.innerHTML = party.map((p) => {
    const n = Math.max(0, Math.min(MAX, p.inspiration || 0));
    const fresh = last[p.id] != null && n > last[p.id];
    last[p.id] = n;
    const gems = Array.from({ length: MAX }, (_, i) => `<i class="insp-gem${i < n ? ' on' : ''}${fresh && i === n - 1 ? ' new' : ''}"></i>`).join('');
    return `<div class="item insp-row"><b class="grow">${esc(p.name)}</b><span class="insp-gems" aria-label="${n} of ${MAX} inspiration">${gems}</span>
      <button class="btn small" data-insp="${esc(p.id)}" data-d="-1" ${n ? '' : 'disabled'} aria-label="Take one from ${esc(p.name)}">−</button>
      <button class="btn small primary" data-insp="${esc(p.id)}" data-d="1" ${n < MAX ? '' : 'disabled'} aria-label="Give one to ${esc(p.name)}">+</button></div>`;
  }).join('') || '<p class="note">No one is seated yet.</p>';
});

$('#inspList')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-insp]');
  if (b) emit('dm:inspiration', { id: b.dataset.insp, delta: Number(b.dataset.d) });
});
$('#inspAll')?.addEventListener('click', () => emit('dm:inspiration', { all: true, delta: 1 }));
