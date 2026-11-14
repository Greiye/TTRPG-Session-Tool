// DM: dungeon nodes for exploration. Build the tree of rooms, reveal them, and move the party.
// Click a room on the stage preview to edit it; double-click it to move the party there. Rules: src/dungeon.js.
import { $, emit, call, onState, mount, state } from '../client.js';

const { esc } = Stage;
const KINDS = ['entrance', 'passage', 'room', 'crypt', 'trap', 'treasure', 'monster', 'scroll', 'puzzle', 'secret', 'boss', 'exit'];
const kindOpts = (sel) => KINDS.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${Dungeon.ICON[k]} ${k}</option>`).join('');

mount(`<div class="card" data-tab="scene" data-panel="exploration" id="dgCard">
  <h3>Dungeon nodes <span class="note">rooms on levels, joined by ropes</span></h3>
  <div class="row wrap">
    <label class="chk"><input type="checkbox" id="dgShow"> Show on TV</label>
    <button class="btn small" id="dgRevealAll">👁 Reveal all</button>
    <button class="btn small" id="dgHideAll">☁ Hide all</button>
    <button class="btn small" id="dgExample">Load example</button>
    <button class="btn small" id="dgClear">Clear</button>
  </div>
  <p class="note">Click a room on the stage to edit it. Double-click to move the party there. Unrevealed rooms show as <b>???</b> on the TV once a room before them is revealed.</p>
  <form id="dgAdd" class="row wrap">
    <input id="dgName" class="grow" maxlength="40" placeholder="New room, e.g. Flooded Cellar" aria-label="Room name">
    <select id="dgKind" style="width:auto" aria-label="Kind">${kindOpts('room')}</select>
    <select id="dgFrom" style="width:auto" aria-label="Reached from"></select>
    <input id="dgPill" maxlength="10" placeholder="DC 14" style="width:72px" aria-label="Badge">
    <button class="btn small primary">Add room</button>
  </form>
  <div id="dgEdit"></div>
  <div id="dgMsg" class="note" role="status"></div>
</div>`, '[data-tab="rolls"]');

let sel = null;
let editKey = null;
const msg = (r) => { $('#dgMsg').textContent = r?.error || ''; };
const D = () => state()?.dungeon;
const node = (id) => D()?.nodes.find((n) => n.id === id);

function select(id) {
  sel = id || null;
  window.DungeonSel = sel;
  editKey = null;
  render(state());
  document.querySelectorAll('#stage .dg-card').forEach((c) => c.classList.toggle('sel', c.dataset.dg === sel));
  if (sel) $('#dgFrom').value = sel;
}

function render(s) {
  const d = s?.dungeon;
  if (!d) return;
  $('#dgShow').checked = !!d.on;
  const from = $('#dgFrom');
  const opts = `<option value="">— top level —</option>${d.nodes.map((n) => `<option value="${esc(n.id)}">from ${esc(n.name)}</option>`).join('')}`;
  if (from.dataset.k !== opts) { const v = from.value; from.innerHTML = opts; from.dataset.k = opts; from.value = v; }
  const n = sel && d.nodes.find((x) => x.id === sel);
  if (!n) { sel = null; window.DungeonSel = null; $('#dgEdit').innerHTML = ''; editKey = null; return; }
  const key = JSON.stringify([n, d.here, d.nodes.map((x) => x.id + x.name)]);
  if (key === editKey) return;
  editKey = key;
  const parents = n.parents.map((p) => node(p)).filter(Boolean);
  const linkable = d.nodes.filter((x) => x.id !== n.id && !n.parents.includes(x.id));
  $('#dgEdit').innerHTML = `<div class="dg-edit">
    <div class="row wrap">
      <input id="dgeName" class="grow" maxlength="40" value="${esc(n.name)}" aria-label="Name">
      <select id="dgeKind" style="width:auto" aria-label="Kind">${kindOpts(n.kind)}</select>
      <input id="dgePill" maxlength="10" value="${esc(n.pill)}" placeholder="Badge" style="width:72px" aria-label="Badge">
    </div>
    <textarea id="dgeNote" rows="2" maxlength="300" placeholder="DM note (never shown to players)" style="width:100%">${esc(n.note || '')}</textarea>
    <div class="row wrap">
      <button class="btn small primary" data-dge="save">Save</button>
      <button class="btn small ${d.here === n.id ? 'on' : ''}" data-dge="here">⚑ Party here</button>
      <button class="btn small" data-dge="reveal">${n.revealed ? '☁ Hide' : '👁 Reveal'}</button>
      <button class="btn small" data-dge="remove">🗑 Remove</button>
      <button class="btn small" data-dge="close">Done</button>
    </div>
    <div class="row wrap"><span class="note">Ways in:</span>${parents.map((p) => `<button class="btn small" data-dgcut="${esc(p.id)}" title="Cut this rope">${esc(p.name)} ✕</button>`).join('') || '<span class="note">none (top level)</span>'}</div>
    ${linkable.length ? `<div class="row"><select id="dgeLink" class="grow" aria-label="Add a rope from">${linkable.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button class="btn small" data-dge="link">+ Rope from</button></div>` : ''}
  </div>`;
}
onState(render);

$('#dgShow').addEventListener('change', (e) => emit('dm:dungeon:show', { on: e.target.checked }));
$('#dgRevealAll').onclick = () => emit('dm:dungeon:reveal', { id: '*', on: true });
$('#dgHideAll').onclick = () => emit('dm:dungeon:reveal', { id: '*', on: false });
$('#dgExample').onclick = () => { if (!D()?.nodes.length || confirm('Replace the dungeon with the example?')) { select(null); emit('dm:dungeon:example'); } };
$('#dgClear').onclick = () => { if (confirm('Remove every room?')) { select(null); emit('dm:dungeon:clear'); } };
$('#dgAdd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await call('dm:dungeon:node', { name: $('#dgName').value, kind: $('#dgKind').value, parent: $('#dgFrom').value, pill: $('#dgPill').value });
  msg(r);
  if (r?.ok) { $('#dgName').value = ''; $('#dgPill').value = ''; select(r.id); }
});

$('#dgEdit').addEventListener('click', async (e) => {
  const cut = e.target.closest('[data-dgcut]');
  if (cut) return msg(await call('dm:dungeon:link', { from: cut.dataset.dgcut, to: sel, on: false }));
  const b = e.target.closest('[data-dge]');
  if (!b || !sel) return;
  const n = node(sel);
  const act = b.dataset.dge;
  if (act === 'save') msg(await call('dm:dungeon:node', { id: sel, name: $('#dgeName').value, kind: $('#dgeKind').value, pill: $('#dgePill').value, note: $('#dgeNote').value }));
  if (act === 'here') msg(await call('dm:dungeon:here', { id: sel }));
  if (act === 'reveal') msg(await call('dm:dungeon:reveal', { id: sel, on: !n?.revealed }));
  if (act === 'link') msg(await call('dm:dungeon:link', { from: $('#dgeLink').value, to: sel }));
  if (act === 'remove' && confirm(`Remove ${n?.name}?`)) { emit('dm:dungeon:remove', { id: sel }); select(null); }
  if (act === 'close') select(null);
});

// The stage preview is the map: click a room to edit it, double-click to move the party.
$('#stage').addEventListener('click', (e) => {
  const c = e.target.closest('.dg-card');
  if (c) select(c.dataset.dg);
});
$('#stage').addEventListener('dblclick', (e) => {
  const c = e.target.closest('.dg-card');
  if (c) emit('dm:dungeon:here', { id: c.dataset.dg });
});
$('#stage').addEventListener('keydown', (e) => {
  const c = e.target.closest?.('.dg-card');
  if (c && e.key === 'Enter') select(c.dataset.dg);
});
