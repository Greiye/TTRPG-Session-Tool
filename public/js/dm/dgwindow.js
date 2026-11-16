// DM: the dungeon editing tab under the world map (Mike, Nov 16, PR R). While the party is at or in a dungeon,
// a "Dungeon" tab opens under the world map with the whole dungeon, editable in place:
//   click a room to select and edit it, double-click to move the party there,
//   drag a room onto another to join a rope from the first down to the second,
//   right-click a room for its menu (party here, reveal or hide, add a room after it, rope to, cut ropes, kind, remove).
// Rules and events: src/dungeon.js, src/sockets/dungeon.js.
import { $, call, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const KINDS = ['entrance', 'passage', 'room', 'crypt', 'trap', 'treasure', 'monster', 'scroll', 'puzzle', 'secret', 'boss', 'exit'];
const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)

const host = document.createElement('section');
host.className = 'dgw';
host.hidden = true;
host.innerHTML = `<header class="dgw-tabs" role="tablist">
    <button class="dgw-tab on" role="tab" aria-selected="true" id="dgwTab"><span>🏰</span> <b id="dgwName">Dungeon</b></button>
    <span class="note" id="dgwWhere"></span>
    <button class="btn small" id="dgwFold" title="Fold or unfold the dungeon tab">▾</button>
  </header>
  <div class="dgw-body" id="dgwBody">
    <div class="row wrap dgw-tools">
      <button class="btn small primary" data-dgw="add">＋ Room</button>
      <button class="btn small" data-dgw="revealAll">👁 Reveal all</button>
      <button class="btn small" data-dgw="hideAll">☁ Hide all</button>
      <label class="btn small">🖼 Picture<input type="file" accept="image/*" id="dgwPic" hidden></label>
      <span class="note grow">Click to edit · double-click to move the party · drag onto a room to join a rope · right-click for more</span>
    </div>
    <div class="dgw-board" id="dgwBoard"></div>
    <div class="dgw-edit" id="dgwEdit"></div>
    <div class="note" id="dgwMsg" role="status"></div>
  </div>
  <div class="dgw-menu" id="dgwMenu" hidden role="menu"></div>`;
(document.querySelector('#wmDungeon') || document.querySelector('#wmBoard'))?.after(host);

let sel = null; // selected room
let linkFrom = null; // "Rope to…": the next room clicked gets a rope from this one
let folded = false;
let boardKey = '';
let editKey = '';
const D = () => state()?.dungeon;
const node = (id) => D()?.nodes.find((n) => n.id === id);
const msg = (r) => { $('#dgwMsg').textContent = r?.error || ''; return r; };
const kindOpts = (k) => KINDS.map((x) => `<option value="${x}" ${x === k ? 'selected' : ''}>${Dungeon.ICON[x]} ${x}</option>`).join('');

function render(S) {
  const d = S?.dungeon;
  const wm = S?.worldMap;
  const at = wm && !wm.travel ? wm.nodes?.find((n) => n.id === wm.here) : null;
  const show = !!(d && (d.on || at?.dungeon));
  host.hidden = !show;
  if (!show) { closeMenu(); return; }
  $('#dgwName').textContent = at?.name || 'Dungeon';
  $('#dgwWhere').textContent = d.on ? (d.canExit ? 'The party is inside, at a way out.' : 'The party is inside.') : d.gate ? `At the gate: ${d.gate.ready.length} / ${d.gate.total} ready` : 'At the entrance.';
  $('#dgwBody').hidden = folded;
  $('#dgwFold').textContent = folded ? '▸' : '▾';
  if (folded) return;
  if (sel && !node(sel)) sel = null;
  const key = JSON.stringify([d.nodes, d.here, sel, linkFrom]);
  if (key !== boardKey && !drag) {
    boardKey = key;
    $('#dgwBoard').innerHTML = d.nodes.length ? Dungeon.board(d, { dm: true, selected: sel }) : '<p class="note">No rooms yet. Add one with ＋ Room.</p>';
    $('#dgwBoard').classList.toggle('linking', !!linkFrom);
    if (d.nodes.length) Dungeon.hydrate($('#dgwBoard'), d);
  }
  renderEdit(d);
}

function renderEdit(d) {
  const n = sel && node(sel);
  const box = $('#dgwEdit');
  if (!n) { box.innerHTML = linkFrom ? `<p class="note">Click the room the rope from <b>${esc(node(linkFrom)?.name)}</b> leads to. <button class="btn small" data-dgw="cancelLink">Cancel</button></p>` : ''; editKey = ''; return; }
  const key = JSON.stringify([n, d.here, linkFrom]);
  if (key === editKey || box.contains(document.activeElement)) return;
  editKey = key;
  box.innerHTML = `<div class="row wrap">
      <input class="grow" data-f="name" maxlength="40" value="${esc(n.name)}" aria-label="Room name">
      <select data-f="kind" style="width:auto" aria-label="Kind">${kindOpts(n.kind)}</select>
      <input data-f="pill" maxlength="10" value="${esc(n.pill)}" placeholder="Badge" style="width:72px" aria-label="Badge">
      <button class="btn small primary" data-dgw="save">Save</button>
      <button class="btn small" data-dgw="deselect">Done</button>
    </div>
    <textarea data-f="note" rows="2" maxlength="300" placeholder="DM note (never shown to players)">${esc(n.note || '')}</textarea>
    ${linkFrom ? `<p class="note">Click the room the rope from <b>${esc(node(linkFrom)?.name)}</b> leads to. <button class="btn small" data-dgw="cancelLink">Cancel</button></p>` : ''}`;
}
onState(render);

// ----- actions -----
const field = (f) => $(`#dgwEdit [data-f="${f}"]`)?.value;
async function addRoom(parent) {
  const r = msg(await call('dm:dungeon:node', { name: 'New room', kind: 'room', parent: parent || '' }));
  if (r?.ok) { sel = r.id; editKey = ''; render(state()); $('#dgwEdit [data-f="name"]')?.select(); }
}
async function rope(from, to) {
  if (!from || !to || from === to) return;
  msg(await call('dm:dungeon:link', { from, to }));
}
const ACT = {
  add: () => addRoom(sel),
  revealAll: () => call('dm:dungeon:reveal', { id: '*', on: true }),
  hideAll: () => call('dm:dungeon:reveal', { id: '*', on: false }),
  save: async () => { editKey = ''; msg(await call('dm:dungeon:node', { id: sel, name: field('name'), kind: field('kind'), pill: field('pill'), note: field('note') })); },
  deselect: () => { sel = null; render(state()); },
  cancelLink: () => { linkFrom = null; render(state()); },
};
host.addEventListener('click', (e) => {
  const b = e.target.closest('[data-dgw]');
  if (b && ACT[b.dataset.dgw]) return ACT[b.dataset.dgw]();
});
$('#dgwFold').onclick = () => { folded = !folded; render(state()); };
$('#dgwTab').onclick = () => { folded = !folded; render(state()); };
$('#dgwPic').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  e.target.value = '';
  const res = await fetch('/api/assets/map', { method: 'POST', headers: { 'content-type': f.type, 'x-dm-key': dmKey() }, body: f });
  const out = await res.json().catch(() => ({}));
  msg(res.ok && out.url ? await call('dm:dungeon:image', { url: out.url }) : { error: out.error || 'Upload failed.' });
};

// ----- the board: click, double-click, drag a rope, right-click menu -----
const board = $('#dgwBoard');
const cardAt = (x, y) => document.elementsFromPoint(x, y).map((el) => el.closest?.('#dgwBoard .dg-card')).find(Boolean);
let drag = null; // { id, x0, y0, ghost, moved, over }

board.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.dg-card');
  if (!c || e.button !== 0) return;
  drag = { id: c.dataset.dg, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, over: null, el: c };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'dgw-ghost';
    drag.ghost.textContent = `${Dungeon.ICON[node(drag.id)?.kind] || '◆'} ${node(drag.id)?.name || ''}`;
    document.body.appendChild(drag.ghost);
    drag.el.classList.add('dgw-lifted');
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  const over = cardAt(e.clientX, e.clientY);
  const id = over && over.dataset.dg !== drag.id ? over.dataset.dg : null;
  if (id !== drag.over) {
    board.querySelectorAll('.dgw-drop').forEach((x) => x.classList.remove('dgw-drop'));
    if (id) over.classList.add('dgw-drop');
    drag.over = id;
  }
});
window.addEventListener('pointerup', async () => {
  const d = drag;
  drag = null;
  if (!d) return;
  d.ghost?.remove();
  d.el.classList.remove('dgw-lifted');
  board.querySelectorAll('.dgw-drop').forEach((x) => x.classList.remove('dgw-drop'));
  if (!d.moved) return; // a click: handled below
  board.dataset.dragged = '1';
  setTimeout(() => { delete board.dataset.dragged; }, 0);
  if (d.over) await rope(d.id, d.over);
  boardKey = '';
  render(state());
});
board.addEventListener('click', (e) => {
  if (board.dataset.dragged) return;
  const c = e.target.closest('.dg-card');
  if (!c) return;
  if (linkFrom) { const from = linkFrom; linkFrom = null; rope(from, c.dataset.dg); render(state()); return; }
  sel = c.dataset.dg === sel ? null : c.dataset.dg;
  editKey = '';
  render(state());
});
board.addEventListener('dblclick', async (e) => {
  const c = e.target.closest('.dg-card');
  if (c) msg(await call('dm:dungeon:here', { id: c.dataset.dg }));
});

// Right-click menu.
const menu = $('#dgwMenu');
function closeMenu() { menu.hidden = true; menu.innerHTML = ''; }
board.addEventListener('contextmenu', (e) => {
  const c = e.target.closest('.dg-card');
  if (!c) return;
  e.preventDefault();
  const n = node(c.dataset.dg);
  if (!n) return;
  const d = D();
  const parents = n.parents.map(node).filter(Boolean);
  menu.innerHTML = `<b class="dgw-menu-title">${Dungeon.ICON[n.kind] || '◆'} ${esc(n.name)}</b>
    <button role="menuitem" data-m="edit">✎ Edit</button>
    <button role="menuitem" data-m="here" ${d.here === n.id ? 'disabled' : ''}>⚑ Move the party here</button>
    <button role="menuitem" data-m="reveal">${n.revealed ? '☁ Hide from the table' : '👁 Reveal to the table'}</button>
    <button role="menuitem" data-m="child">＋ Add a room after this</button>
    <button role="menuitem" data-m="link">🔗 Rope to…</button>
    ${parents.map((p) => `<button role="menuitem" data-m="cut" data-p="${esc(p.id)}">✂ Cut rope from ${esc(p.name)}</button>`).join('')}
    <label class="dgw-menu-kind">Kind <select data-m="kind">${kindOpts(n.kind)}</select></label>
    <button role="menuitem" data-m="remove" class="danger">🗑 Remove</button>`;
  menu.dataset.id = n.id;
  menu.hidden = false;
  const r = host.getBoundingClientRect();
  menu.style.left = `${Math.min(e.clientX - r.left, r.width - 230)}px`;
  menu.style.top = `${e.clientY - r.top}px`;
  menu.querySelector('button')?.focus();
});
menu.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  const id = menu.dataset.id;
  const n = node(id);
  closeMenu();
  if (!n) return;
  const m = b.dataset.m;
  if (m === 'edit') { sel = id; editKey = ''; render(state()); $('#dgwEdit [data-f="name"]')?.focus(); }
  if (m === 'here') msg(await call('dm:dungeon:here', { id }));
  if (m === 'reveal') msg(await call('dm:dungeon:reveal', { id, on: !n.revealed }));
  if (m === 'child') addRoom(id);
  if (m === 'link') { linkFrom = id; sel = null; render(state()); }
  if (m === 'cut') msg(await call('dm:dungeon:link', { from: b.dataset.p, to: id, on: false }));
  if (m === 'remove' && confirm(`Remove ${n.name}?`)) { if (sel === id) sel = null; msg(await call('dm:dungeon:remove', { id })); }
});
menu.addEventListener('change', async (e) => {
  if (e.target.dataset.m !== 'kind') return;
  const n = node(menu.dataset.id);
  closeMenu();
  if (n) msg(await call('dm:dungeon:node', { id: n.id, name: n.name, kind: e.target.value, pill: n.pill, note: n.note }));
});
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); if (linkFrom) { linkFrom = null; render(state()); } } });
