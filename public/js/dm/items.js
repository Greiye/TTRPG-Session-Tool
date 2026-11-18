// Items tab (DM, Mike Nov 16): players can't add items on their phones, so the DM gives them here. Pick a
// character (or everyone), type an item (names from the shops and packs are suggested), set a count and a
// description, and Give. The list shows that character's pack with − / + and ✕. Uses dm:sheet inv ops.
// Nov 18 (Mike): item cards from the item library, in a list or a gallery, with search. Click a card to pick it,
// 🎁 to give it to the picked character, or drag it onto a portrait (the row at the top of this window, the party
// sidebar). ✎ and 🛠 Item Designer edit and make cards (itemdesigner.js).
import { $, emit, call, onState, state } from '../client.js';
import { items, cardHtml, openItemDesigner, KINDS } from './itemdesigner.js';

const { esc } = Stage;
const ALL = '*';
let whoKey = '';
let listKey = '';
let namesKey = '';
const seen = new Set(); // item ids already drawn, so a new one slides in once
let primed = false;

const party = () => state()?.players || [];
const who = () => $('#itWho').value;

onState((s) => {
  const ps = s.players || [];
  const wk = ps.map((p) => p.id + p.name).join();
  if (wk !== whoKey) {
    whoKey = wk;
    const cur = who();
    $('#itWho').innerHTML = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + (ps.length > 1 ? `<option value="${ALL}">Everyone</option>` : '');
    if (cur && [...$('#itWho').options].some((o) => o.value === cur)) $('#itWho').value = cur;
  }
  // Suggested names: every shop ware and every item in a pack, with its description.
  const names = new Map();
  for (const sh of s.shops || []) for (const i of sh.items) if (i.name !== 'Item Name') names.set(i.name, i.note || '');
  for (const p of ps) for (const i of p.inventory || []) if (!names.has(i.name)) names.set(i.name, i.note || '');
  for (const i of items.items) if (!names.has(i.name)) names.set(i.name, i.note || '');
  drawParty(ps);
  const nk = [...names.keys()].join('|');
  if (nk !== namesKey) { namesKey = nk; $('#itNames').innerHTML = [...names].map(([n, d]) => `<option value="${esc(n)}">${esc(d)}</option>`).join(''); }
  $('#itNames').dataset.notes = JSON.stringify(Object.fromEntries(names));
  draw();
});

// Gold (Nov 18): the Party gold window is gone (Mike: players tell each other); the DM sets one character's
// gold here, next to their pack.
function drawGold() {
  const p = party().find((x) => x.id === who());
  $('#itGold').hidden = !p;
  if (p && document.activeElement !== $('#itGoldIn')) $('#itGoldIn').value = Number(p.gold || 0);
}
$('#itGoldSet').addEventListener('click', () => {
  const v = Number($('#itGoldIn').value);
  if (Number.isFinite(v) && who() !== ALL) emit('dm:sheet', { id: who(), gold: v });
});

function draw() {
  drawGold();
  const id = who();
  const list = $('#itList');
  if (!list) return;
  const shown = id === ALL ? [] : party().filter((p) => p.id === id);
  const key = id + JSON.stringify(shown.map((p) => p.inventory));
  if (key === listKey) return;
  listKey = key;
  if (id === ALL) { list.innerHTML = '<p class="note">Give gives the item to everyone at the table.</p>'; return; }
  const p = shown[0];
  const items = p?.inventory || [];
  list.innerHTML = items.map((i) => `<div class="item it-row ${primed && !seen.has(i.id) ? 'it-new' : ''}"><span><b>${esc(i.name)}</b>${i.note ? `<br><small class="muted">${esc(i.note)}</small>` : ''}</span>
    <span class="row"><button class="btn small" data-it="${esc(i.id)}" data-q="${i.qty - 1}" ${i.qty ? '' : 'disabled'} aria-label="One less ${esc(i.name)}">−</button><b>${i.qty}</b><button class="btn small" data-it="${esc(i.id)}" data-q="${i.qty + 1}" aria-label="One more ${esc(i.name)}">+</button><button class="btn small danger" data-it-del="${esc(i.id)}" aria-label="Take back ${esc(i.name)}">✕</button></span></div>`).join('')
    || `<p class="note">${p ? `${esc(p.name)} carries nothing yet.` : 'No one is seated yet.'}</p>`;
  items.forEach((i) => seen.add(i.id));
  primed = true;
}

$('#itWho').addEventListener('change', () => { listKey = ''; draw(); });
// Picking a suggested name fills its description if the box is empty.
$('#itName').addEventListener('change', () => {
  let notes = {};
  try { notes = JSON.parse($('#itNames').dataset.notes || '{}'); } catch { /* none */ }
  const n = notes[$('#itName').value.trim()];
  if (n && !$('#itNote').value.trim()) $('#itNote').value = n;
});

function give() {
  const name = $('#itName').value.trim();
  if (!name) return;
  const qty = Math.max(1, Math.min(9999, Math.floor(Number($('#itQty').value)) || 1));
  const note = $('#itNote').value.trim();
  const targets = who() === ALL ? party() : party().filter((p) => p.id === who());
  for (const p of targets) {
    const have = (p.inventory || []).find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (have) emit('dm:sheet', { id: p.id, inv: { op: 'set', id: have.id, qty: have.qty + qty, ...(note ? { note } : {}) } });
    else emit('dm:sheet', { id: p.id, inv: { op: 'add', name, qty, note } });
  }
  $('#itName').value = ''; $('#itNote').value = ''; $('#itQty').value = 1;
  $('#itName').focus();
}
$('#itGive').addEventListener('click', give);
$('#itName').addEventListener('keydown', (e) => { if (e.key === 'Enter') give(); });

$('#itList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.it) emit('dm:sheet', { id: who(), inv: { op: 'set', id: b.dataset.it, qty: Number(b.dataset.q) } });
  else if (b.dataset.itDel) {
    b.closest('.it-row')?.classList.add('it-gone');
    setTimeout(() => emit('dm:sheet', { id: who(), inv: { op: 'del', id: b.dataset.itDel } }), 180);
  }
});

// ----- portraits to give to (Nov 18) -----
var partyKey = ''; // var: onState may draw before this line runs
function drawParty(ps) {
  const k = ps.map((p) => p.id + p.name + p.portrait + (p.id === who())).join();
  if (k === partyKey) return;
  partyKey = k;
  $('#itParty').innerHTML = ps.map((p) => `<button class="it-to ${p.id === who() ? 'on' : ''}" data-give="${esc(p.id)}" title="${esc(p.name)}: click to pick, drop a card to give" aria-pressed="${p.id === who()}" style="--hue:${p.hue ?? 40}">${Stage.avatar(p, 'av-pick')}<small>${esc(p.name.replace(/^\[Test\]\s*/, ''))}</small></button>`).join('');
  window.Anim?.hydrate?.($('#itParty'));
}
$('#itParty').addEventListener('click', (e) => {
  const b = e.target.closest('[data-give]');
  if (!b) return;
  $('#itWho').value = b.dataset.give;
  listKey = ''; partyKey = '';
  draw(); drawParty(party());
});

// ----- item cards: list or gallery, search -----
const VIEW_KEY = 'dmItemView';
let view = 'gallery';
try { view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'gallery'; } catch { /* private mode */ }
let picked = null;
let libKey = '';
const words = (it) => [it.name, it.kind, KINDS[it.kind]?.[1], it.rarity, it.value, it.note, ...(it.tags || []), ...(it.props || []).flatMap((p) => [p.name, p.value])].join(' ').toLowerCase();
function drawLib(force) {
  const q = $('#itSearch').value.trim().toLowerCase();
  const key = [items.version, q, view, picked].join('|');
  if (key === libKey && !force) return;
  libKey = key;
  const terms = q.split(/\s+/).filter(Boolean);
  const all = [...items.items].sort((a, b) => a.name.localeCompare(b.name));
  const shown = all.filter((it) => { const w = words(it); return terms.every((t) => w.includes(t)); });
  const lib = $('#itLib');
  lib.dataset.view = view;
  document.querySelectorAll('[data-itview]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.itview === view)));
  $('#itCount').textContent = q ? `${shown.length} of ${all.length}` : `${all.length}`;
  lib.innerHTML = shown.map((it) => cardHtml(it, { actions: true, draggable: true, picked: it.id === picked })).join('')
    || `<p class="note">${all.length ? 'No item matches that search.' : 'No item cards yet. Make one in the Item Designer.'} ${all.length ? '' : '<button class="btn small" id="itSamples">Add the sample items</button>'}</p>`;
}
items.onChange(() => { drawLib(true); });
$('#itSearch').addEventListener('input', () => drawLib());
document.querySelectorAll('[data-itview]').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.itview;
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ }
  drawLib();
}));
$('#itNew').addEventListener('click', () => openItemDesigner(null));

// Give one card (count from the box above) to one character, or everyone when Everyone is picked.
async function giveCard(id, to) {
  const ids = to === ALL ? party().map((p) => p.id) : [to];
  if (!ids.length || !ids[0]) return;
  const qty = Math.max(1, Math.min(9999, Math.floor(Number($('#itQty').value)) || 1));
  const r = await call('dm:item:give', { id, to: ids, qty });
  if (r?.error) return;
  for (const pid of ids) {
    for (const el of document.querySelectorAll(`[data-give="${CSS.escape(pid)}"], [data-hero-pick="${CSS.escape(pid)}"]`)) {
      el.classList.remove('it-got'); void el.offsetWidth; el.classList.add('it-got');
    }
  }
}
$('#itLib').addEventListener('click', (e) => {
  if (e.target.id === 'itSamples') { call('dm:item:samples'); return; }
  const g = e.target.closest('[data-it-give]');
  if (g) { giveCard(g.dataset.itGive, who()); return; }
  const ed = e.target.closest('[data-it-edit]');
  if (ed) { openItemDesigner(items.byId(ed.dataset.itEdit)); return; }
  const c = e.target.closest('.it-card');
  if (!c) return;
  // Picking a card fills the Give boxes above, so a count or a new description can be set first.
  picked = picked === c.dataset.lib ? null : c.dataset.lib;
  const it = items.byId(c.dataset.lib);
  if (picked && it) { $('#itName').value = it.name; $('#itNote').value = it.note || ''; }
  drawLib();
});
$('#itLib').addEventListener('keydown', (e) => {
  const c = e.target.closest?.('.it-card');
  if (c && e.key === 'Enter' && e.target === c) giveCard(c.dataset.lib, who());
});

// Drag a card onto a portrait: the row above, the party sidebar's portraits, its hero, or a Party row.
const DROP = '[data-give], [data-hero-pick], #party .item, .dm-hero .hero';
const dropId = (el) => el.dataset.give || el.dataset.heroPick
  || el.querySelector('[data-hero-edit]')?.dataset.heroEdit || el.querySelector('[data-hp]')?.dataset.hp || el.querySelector('[data-edit]')?.dataset.edit || null;
let dragging = null;
$('#itLib').addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.it-card');
  if (!c) return;
  e.stopPropagation(); // not a window move (reorder.js)
  dragging = c.dataset.lib;
  c.classList.add('it-dragging');
  document.body.classList.add('it-drag');
  e.dataTransfer.effectAllowed = 'copy';
  try { e.dataTransfer.setData('text/x-item', dragging); e.dataTransfer.setData('text/plain', items.byId(dragging)?.name || ''); } catch { /* old browsers */ }
});
document.addEventListener('dragend', () => {
  if (!dragging) return;
  dragging = null;
  document.body.classList.remove('it-drag');
  document.querySelectorAll('.it-dragging, .it-over').forEach((el) => el.classList.remove('it-dragging', 'it-over'));
});
document.addEventListener('dragover', (e) => {
  if (!dragging) return;
  const t = e.target.closest?.(DROP);
  document.querySelectorAll('.it-over').forEach((el) => el !== t && el.classList.remove('it-over'));
  if (!t || !dropId(t)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  t.classList.add('it-over');
});
document.addEventListener('drop', (e) => {
  if (!dragging) return;
  const t = e.target.closest?.(DROP);
  const pid = t && dropId(t);
  if (!pid) return;
  e.preventDefault();
  e.stopPropagation();
  giveCard(dragging, pid);
});
drawLib(true);

// Big view: the column is short, so ⤢ moves the portraits, search and cards into a big window over the map
// (not modal: the party sidebar's portraits still take drops). ⤢ again, ✕ or Esc puts them back.
const big = document.createElement('dialog');
big.className = 'it-big';
big.setAttribute('aria-label', 'Item cards');
big.innerHTML = '<div class="it-big-head"><b>🎒 Item cards</b><span class="note">drag a card onto a portrait to give it</span><span class="grow"></span><button class="btn small" id="itBigClose" aria-label="Close the big view">✕</button></div><div class="it-big-body"></div>';
document.body.appendChild(big);
const home = $('#itParty').parentElement;
home.insertAdjacentHTML('beforeend', '<p class="note it-big-note" hidden>The cards are open in the big window. <button class="btn small" data-it-back>Bring them back</button></p>');
home.querySelector('[data-it-back]').addEventListener('click', () => setBig(false));
const moved = () => [$('#itParty'), $('#itSearch').parentElement, $('#itLib')];
function setBig(on) {
  if (on === big.open) return;
  if (on) {
    big.querySelector('.it-big-body').append(...moved());
    big.show();
  } else {
    home.append(...moved());
    big.close();
  }
  $('#itBig').setAttribute('aria-pressed', String(on));
  home.querySelector('.it-big-note').hidden = !on;
  libKey = '';
  drawLib();
}
$('#itBig').addEventListener('click', () => setBig(!big.open));
big.addEventListener('click', (e) => { if (e.target.closest('#itBigClose')) setBig(false); });
big.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); setBig(false); } });
