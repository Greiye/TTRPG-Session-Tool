// DM relations web: NPCs, factions and places, and how each feels about another. Reveal parts as the
// story goes; with "Show on TV" on, the TV draws the revealed parts as tiers. Rules: src/web.js.
import { $, emit, call, onState } from '../client.js';

const { esc } = Stage;
const show = (r) => { $('#webMsg').textContent = r?.error || 'Saved.'; };
let optKey = null;

function syncKind() {
  const f = $('#webKind').value === 'faction';
  $('#webName').hidden = f;
  $('#webRef').hidden = !f;
}
$('#webKind').addEventListener('change', syncKind);
syncKind();

$('#webAddNode').onclick = async () => {
  const kind = $('#webKind').value;
  const r = await call('dm:web:node', { kind, name: $('#webName').value.trim(), ref: $('#webRef').value });
  show(r);
  if (r?.ok && kind !== 'faction') $('#webName').value = '';
};
$('#webAddEdge').onclick = async () => {
  const r = await call('dm:web:edge', { from: $('#webFrom').value, to: $('#webTo').value, label: $('#webLabel').value.trim(), value: Number($('#webValue').value) || 0 });
  show(r);
};
$('#webShow').addEventListener('change', (e) => emit('dm:web:show', { on: e.target.checked }));

function onList(e) {
  const b = e.target.closest('[data-reveal],[data-rm]');
  if (!b) return;
  if (b.dataset.reveal) emit('dm:web:reveal', { kind: b.dataset.kind, id: b.dataset.reveal, on: b.dataset.on === '1' });
  if (b.dataset.rm) emit('dm:web:remove', { kind: b.dataset.kind, id: b.dataset.rm });
}
$('#webNodes').addEventListener('click', onList);
$('#webEdges').addEventListener('click', onList);
// Edge value: type a number, then leave the field.
$('#webEdges').addEventListener('change', (e) => {
  if (e.target.dataset.wval) emit('dm:web:value', { id: e.target.dataset.wval, value: Number(e.target.value) || 0 });
});

onState((s) => {
  const w = s.web || { nodes: [], edges: [], showTv: false };
  const nameOf = Object.fromEntries(w.nodes.map((n) => [n.id, n.name]));
  if (document.activeElement !== $('#webShow')) $('#webShow').checked = !!w.showTv;

  // Dropdowns keep the choice while the list is unchanged.
  const key = w.nodes.map((n) => `${n.id}:${n.name}`).join() + '|' + (s.factions || []).map((f) => `${f.id}:${f.name}`).join();
  if (key !== optKey) {
    optKey = key;
    const opts = w.nodes.map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');
    const from = $('#webFrom').value;
    const to = $('#webTo').value;
    $('#webFrom').innerHTML = opts;
    $('#webTo').innerHTML = opts;
    if (from) $('#webFrom').value = from;
    if (to) $('#webTo').value = to;
    $('#webRef').innerHTML = (s.factions || []).map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('') || '<option value="">Add a faction first</option>';
  }

  $('#webNodes').innerHTML = w.nodes.map((n) => {
    const party = n.kind === 'party';
    const tier = n.tierLabel ? ` · ${esc(n.tierLabel)}` : '';
    return `<div class="item"><span><b>${esc(n.name)}</b> <small class="muted">${esc(n.kind)}${tier}</small></span>
      <span class="row">${party ? '<small class="muted">always known</small>' : `<button class="btn small ${n.revealed ? 'primary' : ''}" data-reveal="${esc(n.id)}" data-kind="node" data-on="${n.revealed ? 0 : 1}">${n.revealed ? 'Revealed' : 'Reveal'}</button><button class="btn small danger" data-rm="${esc(n.id)}" data-kind="node" aria-label="Remove ${esc(n.name)}">✕</button>`}</span></div>`;
  }).join('') || '<p class="note">The party is on the web. Add NPCs, factions or places.</p>';

  $('#webEdges').innerHTML = w.edges.map((e) => `<div class="item"><span>${esc(nameOf[e.from] || '?')} → ${esc(nameOf[e.to] || '?')} <small class="muted">${esc(e.label)}</small></span>
    <span class="row"><input type="number" min="-100" max="100" value="${Number(e.value)}" data-wval="${esc(e.id)}" style="width:72px" aria-label="Feeling, -100 to 100">
    <button class="btn small ${e.revealed ? 'primary' : ''}" data-reveal="${esc(e.id)}" data-kind="edge" data-on="${e.revealed ? 0 : 1}">${e.revealed ? 'Revealed' : 'Reveal'}</button>
    <button class="btn small danger" data-rm="${esc(e.id)}" data-kind="edge" aria-label="Remove link">✕</button></span></div>`).join('') || '<p class="note">No links yet.</p>';
});
