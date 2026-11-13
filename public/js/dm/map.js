// Battle map and creature randomizer on the DM page (items 24, 25, 26).
import { $, emit, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
let mapKey = null;
let selTok = null; // token picked on the map; arrow keys move it one tile
let rndKey = null;
const TABLES = { patron: 'Tavern patron' };

onState((s) => {
  const m = s.map;
  const tokenList = [...s.players, ...s.combat.enemies];
  const tk = tokenList.map((x) => x.id + x.name).join();
  if (tk !== mapKey) {
    mapKey = tk;
    $('#mapToken').innerHTML = tokenList.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') || '<option value="">Add players or enemies first</option>';
  }
  if (m) {
    $('#mapCols').value = m.cols; $('#mapRows').value = m.rows;
    const cells = [];
    const first = (s.pendingPlace || [])[0];
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      const t = m.terrain?.[`${x},${y}`];
      const tok = Object.entries(s.tokens || {}).find(([, p]) => p.x === x && p.y === y);
      const who = tok && tokenList.find((c) => c.id === tok[0]);
      const cls = [t ? `t-${t}` : '', who ? 'has' : '', who && who.id === selTok ? 'sel' : '', who && who.id === first ? 'pending' : ''].join(' ');
      cells.push(`<div class="${cls}" data-x="${x}" data-y="${y}" ${who ? `data-tok="${esc(who.id)}" draggable="true"` : ''} title="${who ? esc(who.name) : ''}">${who ? esc(who.name[0]) : ''}</div>`);
    }
    const map = $('#dmMap');
    map.style.gridTemplateColumns = `repeat(${m.cols}, 1fr)`;
    map.style.gridTemplateRows = `repeat(${m.rows}, 1fr)`;
    map.innerHTML = cells.join('');
    const pend = (s.pendingPlace || []).map((id) => tokenList.find((c) => c.id === id)).find(Boolean);
    $('#mapInfo').textContent = pend
      ? `Place ${pend.name} on the map first. Other changes wait until it is placed.`
      : m.image ? 'Map image is set. Drag tokens, or click a tile. Arrow keys move the selected token.' : 'No image yet: the grid shows on a plain background.';
  } else {
    $('#dmMap').innerHTML = '<p class="note" style="padding:8px">Set a grid to start a battle map.</p>';
    $('#dmMap').style.gridTemplateColumns = ''; $('#dmMap').style.gridTemplateRows = '';
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
$('#dmMap').addEventListener('click', (e) => {
  const t = e.target.closest('[data-x]');
  if (!t || !state()?.map) return;
  const x = Number(t.dataset.x); const y = Number(t.dataset.y);
  const pend = (state().pendingPlace || [])[0];
  if (pend) { emit('dm:token', { id: pend, x, y, z: Number($('#mapZ').value) || 0 }); return; }
  if (t.dataset.tok) { selTok = t.dataset.tok; return; } // selecting a token; the arrow keys move it
  const tool = $('#mapTool').value;
  if (tool === 'place') { if ($('#mapToken').value) emit('dm:token', { id: $('#mapToken').value, x, y, z: Number($('#mapZ').value) || 0 }); }
  else emit('dm:map:paint', { x, y, kind: tool === 'clear' ? null : tool });
});
// Drag a token onto another tile. Same rules as a click: a new creature has to be placed first.
$('#dmMap').addEventListener('dragstart', (e) => {
  const t = e.target.closest('[data-tok]');
  if (!t) return;
  selTok = t.dataset.tok;
  e.dataTransfer?.setData('text/plain', t.dataset.tok);
});
$('#dmMap').addEventListener('dragover', (e) => { if (e.target.closest('[data-x]')) e.preventDefault(); });
$('#dmMap').addEventListener('drop', (e) => {
  const t = e.target.closest('[data-x]');
  const id = e.dataTransfer?.getData('text/plain');
  if (!t || !id || !state()?.map) return;
  e.preventDefault();
  emit('dm:token', { id, x: Number(t.dataset.x), y: Number(t.dataset.y), z: Number($('#mapZ').value) || 0 });
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
