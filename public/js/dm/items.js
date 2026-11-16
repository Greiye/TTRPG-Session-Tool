// Items tab (DM, Mike Nov 16): players can't add items on their phones, so the DM gives them here. Pick a
// character (or everyone), type an item (names from the shops and packs are suggested), set a count and a
// description, and Give. The list shows that character's pack with − / + and ✕. Uses dm:sheet inv ops.
import { $, emit, onState, state } from '../client.js';

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
  const nk = [...names.keys()].join('|');
  if (nk !== namesKey) { namesKey = nk; $('#itNames').innerHTML = [...names].map(([n, d]) => `<option value="${esc(n)}">${esc(d)}</option>`).join(''); }
  $('#itNames').dataset.notes = JSON.stringify(Object.fromEntries(names));
  draw();
});

function draw() {
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
