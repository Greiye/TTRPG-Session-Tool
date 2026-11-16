// Camp (DM): open or close camp, pick the TV image from the backdrop library, and see each phone's vote and downtime note.
// Ending camp applies the rest: by vote, or the DM's override in #campApply.
import { $, emit, onState, state } from '../client.js';

const { esc } = Stage;
let libKey = null;

onState((s) => {
  const c = s.camp;
  if (!c) return;
  const btn = $('#campToggle');
  const restName = { short: 'short rest', long: 'long rest' }[c.rest] || 'no rest';
  if (btn) {
    btn.textContent = c.open ? `End camp · ${restName}` : 'Open camp';
    btn.classList.toggle('primary', !c.open);
  }
  const ap = $('#campApply');
  if (ap && document.activeElement !== ap) ap.value = c.apply || 'auto';
  const rb = $('#campRest');
  if (rb) {
    const txt = c.open ? `→ ${restName}` : '';
    if (rb.textContent !== txt) { rb.textContent = txt; rb.classList.remove('pop'); void rb.offsetWidth; if (txt) rb.classList.add('pop'); }
  }
  const lib = s.backdrop?.library || [];
  const key = lib.map((b) => b.id).join() + '|' + (c.image ? 'x' : '');
  const sel = $('#campImg');
  if (sel && key !== libKey) {
    libKey = key;
    sel.innerHTML = '<option value="">No image (plain camp)</option>' + lib.map((b) => `<option value="${esc(b.id)}">${esc(b.name || b.id)}</option>`).join('');
  }
  if (sel) sel.value = c.image ? (lib.find((b) => b.url === c.image.url)?.id || '') : '';
  const names = Object.fromEntries([...s.players, ...(s.roster || [])].map((p) => [p.id, p.name]));
  $('#campStatus').textContent = c.open ? `Camp ${c.n} open · short ${c.counts?.short || 0} · long ${c.counts?.long || 0}` : (c.n ? `Camp ${c.n} closed` : 'no camp yet');
  $('#campList').innerHTML = Object.entries(c.votes || {}).map(([id, v]) => {
    const note = c.notes?.[id];
    const dice = v === 'short' && c.dice?.[id] ? ` · ${c.dice[id]} hit di${c.dice[id] > 1 ? 'ce' : 'e'}` : '';
    return `<div class="item"><span><b>${esc(names[id] || id)}</b> · ${v === 'long' ? 'long rest' : 'short rest'}${dice}${note ? `<br><small>${esc(note)}</small>` : ''}</span></div>`;
  }).join('') || '<p class="note">No votes yet.</p>';
});

$('#campToggle').onclick = () => {
  const open = !state()?.camp?.open;
  emit('dm:camp:open', { open });
};
$('#campApply').onchange = (e) => emit('dm:camp:apply', { apply: e.target.value });
$('#campImg').onchange = (e) => emit('dm:camp:image', { id: e.target.value || null });
