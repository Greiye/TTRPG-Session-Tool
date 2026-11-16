// Lore tab (Mike, Nov 16): Locations, Dungeons, NPCs, Items, Books and Notes. Each entry has text the
// party may learn and a DM-only note; "Share" puts the entry (without the note) on the phones' Journal > Lore.
import { $, call, onState, state } from '../client.js';

const { esc } = Stage;
const CATS = { location: ['🏰', 'Locations'], dungeon: ['🕳', 'Dungeons'], npc: ['🧑', 'NPCs'], item: ['🗡', 'Items'], book: ['📖', 'Books'], note: ['📝', 'Notes'] };
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

let cat = load('dmLoreCat', 'all');
if (cat !== 'all' && !CATS[cat]) cat = 'all';
const openIds = new Set();
let drawn = null;
let fresh = null; // id of an entry just added: opened and flashed once

$('#loreCat').innerHTML = Object.entries(CATS).map(([k, [i, n]]) => `<option value="${k}">${i} ${n}</option>`).join('');
const msg = (t) => { $('#loreMsg').textContent = t || ''; };

function drawCats(list) {
  const count = (k) => list.filter((e) => e.cat === k).length;
  const chip = (k, label) => `<button role="tab" class="chip ${cat === k ? 'on' : ''}" aria-selected="${cat === k}" data-lore-cat="${k}">${label}${k === 'all' ? '' : ` <small>${count(k)}</small>`}</button>`;
  $('#loreCats').innerHTML = chip('all', 'All') + Object.entries(CATS).map(([k, [i, n]]) => chip(k, `${i} ${n}`)).join('');
  $('#loreCount').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
  if (cat !== 'all') $('#loreCat').value = cat;
}

function entry(e) {
  const [icon, catName] = CATS[e.cat] || CATS.note;
  return `<details class="lore-entry ${e.shared ? 'shared' : ''} ${e.id === fresh ? 'fresh' : ''}" data-lore="${esc(e.id)}" ${openIds.has(e.id) ? 'open' : ''}>
    <summary><i>${icon}</i><b>${esc(e.name)}</b>${cat === 'all' ? `<small class="muted">${catName}</small>` : ''}${e.shared ? '<span class="lore-badge" title="Phones can read this">👁 shared</span>' : ''}</summary>
    <div class="lore-body">
      <div class="row"><input class="grow" data-lore-f="name" maxlength="80" value="${esc(e.name)}" aria-label="Name"><select data-lore-f="cat" style="width:auto" aria-label="Category">${Object.entries(CATS).map(([k, [i, n]]) => `<option value="${k}" ${k === e.cat ? 'selected' : ''}>${i} ${n}</option>`).join('')}</select></div>
      <label class="fld">What the party can learn<textarea data-lore-f="text" rows="3" maxlength="2000" placeholder="Description, history, what people say">${esc(e.text)}</textarea></label>
      <label class="fld">DM only<textarea data-lore-f="dm" rows="2" maxlength="2000" placeholder="Secrets, stats, hooks. Never leaves this screen.">${esc(e.dm)}</textarea></label>
      <div class="row"><label class="chk grow"><input type="checkbox" data-lore-f="shared" ${e.shared ? 'checked' : ''}> Share with phones (Journal › Lore)</label><button class="btn small danger" data-lore-del="${esc(e.id)}">Delete</button></div>
    </div>
  </details>`;
}

function draw(force = false) {
  const s = state();
  if (!s?.lore) return;
  const list = s.lore;
  const q = $('#loreFind').value.trim().toLowerCase();
  const key = JSON.stringify([list, cat, q]);
  // Don't redraw under the DM's cursor: an edit in progress would lose its caret.
  if (!force && (key === drawn || $('#loreList').contains(document.activeElement))) return;
  drawn = key;
  drawCats(list);
  const shown = list.filter((e) => (cat === 'all' || e.cat === cat) && (!q || `${e.name} ${e.text} ${e.dm}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  $('#loreList').innerHTML = shown.length ? shown.map(entry).join('')
    : `<p class="note">${list.length ? 'Nothing matches.' : 'No lore yet. Add a name above, or pull the places and NPCs the table already has.'}</p>`;
  fresh = null;
}
onState(() => draw());

$('#loreCats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lore-cat]');
  if (!b) return;
  cat = b.dataset.loreCat;
  save('dmLoreCat', cat);
  draw(true);
});
$('#loreFind').addEventListener('input', () => draw(true));

async function add() {
  const name = $('#loreName').value.trim();
  if (!name) return $('#loreName').focus();
  const r = await call('dm:lore:add', { cat: $('#loreCat').value, name });
  if (r?.error) return msg(r.error);
  msg('');
  $('#loreName').value = '';
  openIds.add(r.id);
  fresh = r.id;
  draw(true);
}
$('#loreAdd').onclick = add;
$('#loreName').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
$('#lorePull').onclick = async () => {
  const r = await call('dm:lore:pull');
  msg(r?.added ? `Added ${r.added} from the world map and the scene.` : 'Nothing new on the table.');
};

const list = $('#loreList');
list.addEventListener('toggle', (e) => {
  const d = e.target.closest?.('[data-lore]');
  if (!d) return;
  if (d.open) openIds.add(d.dataset.lore); else openIds.delete(d.dataset.lore);
}, true);
// Text saves when the field loses focus; the category and Share save at once.
list.addEventListener('change', async (e) => {
  const f = e.target.dataset.loreF;
  const id = e.target.closest('[data-lore]')?.dataset.lore;
  if (!f || !id) return;
  const value = f === 'shared' ? e.target.checked : e.target.value;
  const r = await call('dm:lore:edit', { id, [f]: value });
  if (r?.error) msg(r.error);
  if (f === 'shared' || f === 'cat') { e.target.blur(); draw(true); }
});
list.addEventListener('focusout', () => setTimeout(() => { if (!list.contains(document.activeElement)) draw(); }, 0));
list.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-lore-del]');
  if (!del) return;
  const d = del.closest('[data-lore]');
  if (!confirm(`Delete “${d.querySelector('summary b').textContent}” from the lore?`)) return;
  d.classList.add('leaving');
  setTimeout(() => call('dm:lore:remove', { id: del.dataset.loreDel }), 220);
});
