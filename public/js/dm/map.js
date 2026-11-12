// Battle map and creature randomizer on the DM page (items 24, 25, 26).
import { $, emit, onState, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
let mapKey = null;
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
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      const t = m.terrain?.[`${x},${y}`];
      const tok = Object.entries(s.tokens || {}).find(([, p]) => p.x === x && p.y === y);
      const who = tok && tokenList.find((c) => c.id === tok[0]);
      cells.push(`<div class="${t ? `t-${t}` : ''} ${who ? 'has' : ''}" data-x="${x}" data-y="${y}" title="${who ? esc(who.name) : ''}">${who ? esc(who.name[0]) : ''}</div>`);
    }
    const map = $('#dmMap');
    map.style.gridTemplateColumns = `repeat(${m.cols}, 1fr)`;
    map.style.gridTemplateRows = `repeat(${m.rows}, 1fr)`;
    map.innerHTML = cells.join('');
    $('#mapInfo').textContent = m.image ? 'Map image is set.' : 'No image yet: the grid shows on a plain background.';
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
      ? `<div class="item"><span><small class="muted">seed ${r.seed}</small></span></div>` + Object.entries(r.picks).map(([slot, label]) => `<div class="item rolled"><span><b>${esc(slot)}</b>: ${esc(label)}</span><button class="btn small" data-reroll="${esc(slot)}">Reroll</button></div>`).join('')
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
  const tool = $('#mapTool').value;
  if (tool === 'place') { if ($('#mapToken').value) emit('dm:token', { id: $('#mapToken').value, x, y, z: Number($('#mapZ').value) || 0 }); }
  else emit('dm:map:paint', { x, y, kind: tool === 'clear' ? null : tool });
});
$('#rndRoll').onclick = () => emit('dm:roll:creature', { table: $('#rndTable').value, seed: $('#rndSeed').value ? Number($('#rndSeed').value) : undefined });
$('#rndOut').addEventListener('click', (e) => { const b = e.target.closest('[data-reroll]'); if (b) emit('dm:roll:creature', { table: state().roll.table, reroll: b.dataset.reroll }); });
