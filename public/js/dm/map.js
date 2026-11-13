// Battle map setup and creature randomizer on the DM page (items 24, 25, 26).
// The map is edited directly on the stage (in combat): click a tile, drag a token, or select a token and use the arrow keys.
import { $, emit, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
let mapKey = null;
let selTok = null; // token picked on the map; arrow keys move it one tile
let rndKey = null;
const TABLES = { patron: 'Tavern patron' };

function selectToken(id) {
  selTok = id;
  document.querySelectorAll('#stage .tok').forEach((el) => el.classList.toggle('sel', el.dataset.tok === id));
}

onState((s) => {
  const m = s.map;
  const tokenList = [...s.players, ...s.combat.enemies];
  const tk = tokenList.map((x) => x.id + x.name).join();
  if (tk !== mapKey) {
    mapKey = tk;
    $('#mapToken').innerHTML = tokenList.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') || '<option value="">Add players or enemies first</option>';
  }
  $('#mapFog').checked = !!m?.fog;
  const lit = selTok && s.tokens?.[selTok];
  if (lit) $('#mapLight').value = lit.light || 'none';
  if (m) {
    $('#mapCols').value = m.cols; $('#mapRows').value = m.rows;
    const pend = (s.pendingPlace || []).map((id) => tokenList.find((c) => c.id === id)).find(Boolean);
    $('#mapInfo').textContent = pend
      ? `Place ${pend.name} on the battle map first. Other changes wait until it is placed.`
      : m.image ? 'Edit on the battle map: click a tile, drag a token, or select one and use the arrow keys.' : 'No image yet: the grid shows on a plain background.';
  } else {
    $('#mapInfo').textContent = 'Set a grid to start a battle map. Then edit it on the stage during combat.';
  }
  const rk = JSON.stringify(s.roll);
  if (rk !== rndKey) {
    rndKey = rk;
    const r = s.roll;
    $('#rndTable').innerHTML = Object.entries(TABLES).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('');
    $('#rndOut').innerHTML = r
      ? `<div class="item"><span><small class="muted">seed ${r.seed}</small></span></div>` + Object.entries(r.picks).map(([slot, label]) => `<div class="item rolled"><span>${r.art?.[slot] ? `<img class="rnd-art" src="${esc(r.art[slot])}" alt="">` : ''}<b>${esc(slot)}</b>: ${esc(label)}</span><span class="row"><button class="btn small" data-art="${esc(slot)}" data-label="${esc(label)}" title="Attach creature art">🖼</button>${r.art?.[slot] ? `<button class="btn small" data-art-clear="${esc(slot)}" data-label="${esc(label)}" title="Remove art">✕</button>` : ''}<button class="btn small" data-reroll="${esc(slot)}">Reroll</button></span></div>`).join('')
      : '<p class="note">Roll to get a creature.</p>';
    if (r && TABLES[r.table]) $('#rndTable').value = r.table;
  }
  // Keep the selected token highlighted across re-renders.
  if (selTok) selectToken(selTok);
});

$('#mapSet').onclick = () => emit('dm:map', { cols: $('#mapCols').value, rows: $('#mapRows').value, image: state()?.map?.image || null });
$('#mapFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/map', { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return alert(out.error || 'Upload failed');
  emit('dm:map', { cols: $('#mapCols').value, rows: $('#mapRows').value, image: out.url });
};

// Tile under a pointer on the stage's battle map, or null.
function tileAt(e) {
  const bmap = e.target.closest('.bmap');
  const s = state();
  if (!bmap || !s?.map) return null;
  const r = bmap.getBoundingClientRect();
  const cols = Number(bmap.dataset.cols) || s.map.cols;
  const rows = Number(bmap.dataset.rows) || s.map.rows;
  const x = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * cols)));
  const y = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * rows)));
  return { x, y };
}

// All map interaction is delegated from the stage, because the stage re-renders on every state change.
const stage = $('#stage');
stage.addEventListener('click', (e) => {
  const tok = e.target.closest('.tok[data-tok]');
  const at = tileAt(e);
  if (!at) return;
  const pend = (state().pendingPlace || [])[0];
  if (pend) { emit('dm:token', { id: pend, ...at, z: Number($('#mapZ').value) || 0 }); return; }
  if (tok) { selectToken(tok.dataset.tok); return; } // select a token; arrow keys move it
  const tool = $('#mapTool').value;
  if (tool === 'place') { if ($('#mapToken').value) emit('dm:token', { id: $('#mapToken').value, ...at, z: Number($('#mapZ').value) || 0 }); }
  else emit('dm:map:paint', { ...at, kind: tool === 'clear' ? null : tool });
});
// Drag a token onto another tile. Same rules as a click: a new creature has to be placed first.
stage.addEventListener('dragstart', (e) => {
  const tok = e.target.closest?.('.tok[data-tok]');
  if (!tok) return;
  selectToken(tok.dataset.tok);
  e.dataTransfer?.setData('text/plain', tok.dataset.tok);
});
stage.addEventListener('dragover', (e) => { if (tileAt(e)) e.preventDefault(); });
stage.addEventListener('drop', (e) => {
  const at = tileAt(e);
  const id = e.dataTransfer?.getData('text/plain');
  if (!at || !id) return;
  e.preventDefault();
  emit('dm:token', { id, ...at, z: Number($('#mapZ').value) || 0 });
});
// Arrow keys nudge the selected token one tile (not while typing in a field).
document.addEventListener('keydown', (e) => {
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (!d || !selTok || !state()?.map || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const pos = state().tokens?.[selTok];
  if (!pos) return;
  e.preventDefault();
  const m = state().map;
  const x = Math.min(m.cols - 1, Math.max(0, pos.x + d[0]));
  const y = Math.min(m.rows - 1, Math.max(0, pos.y + d[1]));
  if (x !== pos.x || y !== pos.y) emit('dm:token', { id: selTok, x, y, z: pos.z || 0 });
});

// Fog of war and light (Phase B). Only party tokens reveal the map; the light is set on the token selected on the map.
$('#mapFog').onchange = (e) => emit('dm:fog', { on: e.target.checked });
$('#mapLight').onchange = (e) => { if (selTok) emit('dm:token:light', { id: selTok, light: e.target.value }); };

$('#rndRoll').onclick = () => emit('dm:roll:creature', { table: $('#rndTable').value, seed: $('#rndSeed').value ? Number($('#rndSeed').value) : undefined });
$('#rndOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-reroll]');
  if (b) return emit('dm:roll:creature', { table: state().roll.table, reroll: b.dataset.reroll });
  const clr = e.target.closest('[data-art-clear]');
  if (clr) return emit('dm:rnd:art', { table: state().roll.table, slot: clr.dataset.artClear, label: clr.dataset.label, url: null });
  const art = e.target.closest('[data-art]');
  if (art) pickArt(state().roll.table, art.dataset.art, art.dataset.label);
});
// Upload one image as creature art and attach it to the pick (uses the creature asset kind).
function pickArt(table, slot, label) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*,video/webm';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const res = await fetch('/api/assets/creature', { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return alert(out.error || 'Upload failed');
    emit('dm:rnd:art', { table, slot, label, url: out.url });
  };
  inp.click();
}
