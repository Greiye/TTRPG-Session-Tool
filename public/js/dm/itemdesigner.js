// Item cards and the Item Designer (Mike, Nov 18: "Items have cards", "Add Item Designer, just like NPC designer").
// An item is a card: art (or the kind's icon), name, kind, rarity, value, the description the phone shows, and free
// name/value properties for any system (Damage 1d8, Armor +2, Charges 3). The designer is a DM-only pop-up with a
// live preview of the card. Items live in data/items.json (src/itemlib.js) and come down over /api/items.
import { $, call, library } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const hdr = () => ({ 'x-dm-key': dmKey() });
export const items = library('items', { headers: hdr });

export const KINDS = {
  weapon: ['⚔️', 'Weapon'], armor: ['🛡️', 'Armor'], potion: ['🧪', 'Potion'], scroll: ['📜', 'Scroll'], wand: ['🪄', 'Wand or staff'],
  ring: ['💍', 'Ring'], wondrous: ['✨', 'Wondrous'], gear: ['🎒', 'Gear'], tool: ['🛠️', 'Tool'], ammo: ['🏹', 'Ammunition'],
  food: ['🍞', 'Food'], treasure: ['💎', 'Treasure'], key: ['🗝️', 'Key or quest item'], other: ['📦', 'Other'],
};
export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'];
// Property names offered in the designer (any other name can be typed).
const PROPS = ['Damage', 'Armor', 'Range', 'Bonus', 'Charges', 'Uses', 'Effect', 'Duration', 'Attunement', 'Rules', 'Property', 'Hands', 'Recharge', 'Material'];
const rarCls = (r) => `rar-${String(r || 'common').replace(/ /g, '-')}`;
const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

// One item card. opts.actions adds Give and Edit buttons; opts.draggable makes it a drag source.
export function cardHtml(it, { actions = false, draggable = false, picked = false } = {}) {
  const [icon, kindName] = KINDS[it.kind] || KINDS.other;
  return `<article class="it-card ${rarCls(it.rarity)}${picked ? ' picked' : ''}" data-lib="${esc(it.id || '')}" ${draggable ? 'draggable="true" tabindex="0"' : ''} aria-label="${esc(it.name)}, ${esc(it.rarity)} ${esc(kindName)}">
    <div class="it-art">${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" draggable="false">` : `<span aria-hidden="true">${icon}</span>`}</div>
    <div class="it-body">
      <b class="it-name">${esc(it.name || 'Unnamed item')}</b>
      <small class="it-meta">${icon} ${esc(kindName)} · <span class="it-rar">${esc(cap(it.rarity))}</span>${it.value ? ` · ${esc(it.value)}` : ''}</small>
      ${it.note ? `<p class="it-note">${esc(it.note)}</p>` : ''}
      ${it.props?.length ? `<dl class="it-props">${it.props.map((p) => `<div><dt>${esc(p.name)}</dt><dd>${esc(p.value)}</dd></div>`).join('')}</dl>` : ''}
    </div>
    ${actions ? `<div class="it-acts"><button class="btn small primary" data-it-give="${esc(it.id)}" title="Give to the picked character (or drag the card onto a portrait)">🎁 Give</button><button class="btn small" data-it-edit="${esc(it.id)}" title="Edit in the Item Designer" aria-label="Edit ${esc(it.name)}">✎</button></div>` : ''}
  </article>`;
}

// ----- the pop-up -----
const dlg = document.createElement('dialog');
dlg.id = 'idDlg';
dlg.className = 'cd-dlg id-dlg';
dlg.setAttribute('aria-labelledby', 'idHead');
dlg.innerHTML = `
<form method="dialog" class="id-shell" id="idForm">
  <div class="id-preview"><h3 id="idHead">🛠 Item Designer</h3><div id="idCard"></div>
    <label class="btn small id-art-btn">🖼 Art<input type="file" id="idArt" accept="image/*" hidden></label>
    <button type="button" class="btn small" id="idArtClear">No art</button>
    <p class="note" id="idMsg" aria-live="polite"></p>
  </div>
  <div class="id-fields">
    <label class="fld">Name<input name="name" maxlength="60" required placeholder="Lantern of the Deep"></label>
    <div class="row">
      <label class="fld grow">Kind<select name="kind">${Object.entries(KINDS).map(([k, [i, n]]) => `<option value="${k}">${i} ${n}</option>`).join('')}</select></label>
      <label class="fld grow">Rarity<select name="rarity">${RARITIES.map((r) => `<option value="${r}">${cap(r)}</option>`).join('')}</select></label>
      <label class="fld grow">Value<input name="value" maxlength="30" placeholder="50 gp"></label>
    </div>
    <label class="fld">Description <small class="muted">shown on the phone</small><textarea name="note" maxlength="200" rows="2" placeholder="Burns without oil; the flame leans toward secrets."></textarea></label>
    <div class="id-props-head"><b>Properties</b> <small class="muted">any system: Damage 1d8, Armor +2, Charges 3</small> <button type="button" class="btn small" id="idPropAdd">+ Property</button></div>
    <div id="idProps" class="id-props"></div>
    <datalist id="idPropNames">${PROPS.map((p) => `<option value="${p}">`).join('')}</datalist>
    <label class="fld">Tags <small class="muted">comma separated</small><input name="tags" maxlength="200" placeholder="light, cursed"></label>
    <label class="fld">DM notes <small class="muted">only you see these</small><textarea name="dm" rows="3" maxlength="4000"></textarea></label>
    <div class="row id-btns">
      <button type="button" class="btn primary" id="idSave">Save</button>
      <button type="button" class="btn" id="idCopy">Duplicate</button>
      <button type="button" class="btn danger" id="idDel">Delete</button>
      <span class="grow"></span>
      <button type="button" class="btn" id="idClose">Close</button>
    </div>
  </div>
</form>`;
document.body.appendChild(dlg);

const blank = () => ({ name: '', kind: 'gear', rarity: 'common', value: '', note: '', props: [], image: null, tags: [], dm: '' });
let cur = blank();
const form = () => $('#idForm');
const msg = (t, k = '') => { const m = $('#idMsg'); m.textContent = t; m.className = `note ${k}`; };

function drawProps() {
  $('#idProps').innerHTML = cur.props.map((p, i) => `<div class="row id-prop" data-i="${i}"><input data-k="name" list="idPropNames" maxlength="40" placeholder="Property" value="${esc(p.name)}" aria-label="Property name"><input data-k="value" class="grow" maxlength="200" placeholder="Value" value="${esc(p.value)}" aria-label="Property value"><button type="button" class="btn small danger" data-prop-del="${i}" aria-label="Remove property">✕</button></div>`).join('');
}
function read() {
  const f = form().elements;
  for (const k of ['name', 'kind', 'rarity', 'value', 'note', 'dm']) cur[k] = f[k].value;
  cur.tags = f.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
  cur.props = [...dlg.querySelectorAll('.id-prop')].map((r) => ({ name: r.querySelector('[data-k="name"]').value.trim(), value: r.querySelector('[data-k="value"]').value.trim() }));
}
function preview() { $('#idCard').innerHTML = cardHtml(cur); }
function fill() {
  const f = form().elements;
  for (const k of ['name', 'kind', 'rarity', 'value', 'note', 'dm']) f[k].value = cur[k] || '';
  f.tags.value = (cur.tags || []).join(', ');
  drawProps();
  preview();
  $('#idDel').hidden = !cur.id;
  $('#idCopy').hidden = !cur.id;
}

export function openItemDesigner(item) {
  cur = item ? JSON.parse(JSON.stringify(item)) : blank();
  cur.props ||= [];
  msg('');
  fill();
  if (!dlg.open) dlg.showModal();
  form().elements.name.focus();
}
window.openItemDesigner = openItemDesigner; // for tests and other windows
function close() {
  dlg.classList.add('closing');
  setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 180);
}
dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
$('#idClose').onclick = close;
dlg.addEventListener('input', () => { read(); preview(); });
dlg.addEventListener('change', () => { read(); preview(); });
$('#idPropAdd').onclick = () => {
  read();
  cur.props.push({ name: '', value: '' });
  drawProps();
  dlg.querySelector('.id-prop:last-child')?.classList.add('fresh');
  dlg.querySelector('.id-prop:last-child input')?.focus();
};
$('#idProps').addEventListener('click', (e) => {
  const b = e.target.closest('[data-prop-del]');
  if (!b) return;
  read();
  cur.props.splice(Number(b.dataset.propDel), 1);
  drawProps();
  preview();
});
$('#idArt').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/item', { method: 'POST', headers: { 'content-type': file.type, ...hdr() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return msg(out.error || 'Upload failed.', 'bad');
  cur.image = out.url;
  preview();
};
$('#idArtClear').onclick = () => { cur.image = null; preview(); };
$('#idSave').onclick = async () => {
  read();
  if (!cur.name.trim()) return form().elements.name.reportValidity();
  const r = await call('dm:item:save', cur);
  if (r?.error) return msg(r.error, 'bad');
  cur = r.item;
  fill();
  msg(`Saved ${cur.name}.`, 'good');
};
$('#idCopy').onclick = () => {
  read();
  cur = { ...cur, id: undefined, sample: undefined, name: `${cur.name} (copy)` };
  fill();
  msg('A copy. Save to keep it.');
};
$('#idDel').onclick = async () => {
  if (!cur.id || !confirm(`Delete ${cur.name}? Characters who carry it keep theirs.`)) return;
  const r = await call('dm:item:delete', { id: cur.id });
  if (r?.error) return msg(r.error, 'bad');
  close();
};
