// DM: town maps and town visits (PR V), under the world map. Shows the town map of the selected world place when
// it is a town, else of the town the party stands on. Drag 🏠 Place onto the picture to add a place, drag a place
// to move it or into the bin to remove it, tap one to edit it. While the party is in town: who picked what,
// settle now, move the party, and leave. Rules and events: src/town.js, src/sockets/town.js.
import { $, call, onState } from '../client.js';
import { dmKey } from './auth.js';

const esc = (s) => Stage.esc(s);
const host = document.createElement('section');
host.className = 'card tn-ed';
host.hidden = true;
host.innerHTML = `<h3>🏘 <span id="tnTitle">Town</span> <span class="note">town map: places the party discovers and visits</span></h3>
  <div id="tnVisit"></div>
  <div class="row wrap tn-tools">
    <span class="wm-chip tn-chip" id="tnNew" title="Drag onto the town map to add a place (tap, then tap the map, on touch screens)">🏠 Place</span>
    <span class="wm-trash" id="tnTrash" title="Drag a place here to remove it">🗑</span>
    <button class="btn small" data-tn="share" id="tnShare" aria-pressed="false" title="Show this town map on the TV (discovered places only), without a visit">📺 Show on TV</button>
    <button class="btn small" data-tn="revealAll">👁 Reveal all</button>
    <button class="btn small" data-tn="hideAll">☁ Hide all</button>
    <label class="btn small">🖼 Picture<input type="file" accept="image/*" id="tnPic" hidden></label>
    <button class="btn small" data-tn="starter" title="Replace this town with the starter town: entrance, farm, marketplace, smithy, wizards tower">Starter town</button>
    <span class="note grow" id="tnHint">Tap a place to edit it, drag it to move it.</span>
  </div>
  <div id="tnBoard"></div>
  <div id="tnEdit"></div>
  <div class="note" id="tnMsg" role="status"></div>`;
(document.querySelector('#wmEdit') || document.querySelector('#wmBoard'))?.after(host);

let last = null;
let sel = null;
let placing = false;
let drag = null;
let pressing = false;
const keys = {};
const once = (id, key, html) => { if (keys[id] === key) return false; keys[id] = key; $(id).innerHTML = html; return true; };
const msg = (t) => { $('#tnMsg').textContent = t || ''; };

// Which town: the selected world place if it is a town, else the party's town (inside, or at its gate).
function target(S) {
  const wm = S.worldMap;
  const picked = wm.nodes.find((n) => n.id === window.WmSel);
  if (picked?.settlement) return picked;
  if (S.town?.on) return wm.nodes.find((n) => n.id === S.town.at) || null;
  const here = !wm.travel && wm.nodes.find((n) => n.id === wm.here);
  return here?.settlement ? here : null;
}
const mapOf = (S, at) => S.town?.maps?.[at] || { image: '', nodes: [] };
const nameOf = (S, id) => S.players.find((p) => p.id === id)?.name || '?';

function visitHtml(S, at) {
  const T = S.town;
  const m = mapOf(S, at.id);
  const inside = T.on && T.at === at.id;
  const atGate = !S.worldMap.travel && S.worldMap.here === at.id;
  if (!inside) {
    const g = T.gate;
    return `<div class="item row wrap"><span class="grow">${atGate ? `The party stands at ${esc(at.name)}.${g ? ` ${g.ready.length} / ${g.total} holding Enter Town.` : ''}` : `The party is not at ${esc(at.name)}.`}</span>
      ${atGate && !g && !S.dungeon?.on ? '<button class="btn small" data-tn="gate" title="Give phones the Enter Town window">🚪 Open the gate</button>' : ''}
      <button class="btn small primary" data-tn="enter" ${atGate && !S.dungeon?.on ? '' : 'disabled'} title="Take the party in now">⬇ Enter town</button></div>`;
  }
  const here = m.nodes.find((n) => n.id === T.here);
  const picks = Object.entries(T.picks || {}).map(([cid, p]) => `<li>${esc(nameOf(S, cid))}: ${esc(m.nodes.find((n) => n.id === p.node)?.name || '?')} ${p.at ? '✔' : '<small class="muted">(not held yet)</small>'}</li>`).join('');
  const tal = T.tally;
  return `<div class="item">
    <div class="row wrap"><span class="grow">Inside. The party is at <b>${esc(here?.name || '?')}</b>. ${tal ? `${tal.confirmed} / ${tal.total} confirmed.` : ''}</span>
      <button class="btn small" data-tn="resolve" ${tal?.confirmed ? '' : 'disabled'} title="Go to the most picked place now">Settle now</button>
      <button class="btn small" data-tn="clearpicks">Clear picks</button>
      <button class="btn small" data-tn="leave">⬆ Leave town</button></div>
    ${picks ? `<ul class="tn-picks">${picks}</ul>` : '<p class="note">Nobody has picked a place yet.</p>'}
  </div>`;
}

function editHtml(S, at, n) {
  const m = mapOf(S, at.id);
  const kinds = Town.KINDS.map((k) => `<option value="${k}" ${n.kind === k ? 'selected' : ''}>${Town.ICON[k]} ${k}</option>`).join('');
  const shops = `<option value="">No shop</option>${(S.shops || []).map((s) => `<option value="${esc(s.id)}" ${n.shop === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
  const reveals = m.nodes.filter((o) => o.id !== n.id).map((o) => `<label class="chk"><input type="checkbox" data-tn-rev="${esc(o.id)}" ${(n.reveals || []).includes(o.id) ? 'checked' : ''}> ${Town.ICON[o.kind] || ''} ${esc(o.name)}</label>`).join('');
  const inside = S.town.on && S.town.at === at.id;
  return `<div class="item wm-edit">
    <div class="row wrap">
      <label class="fld grow">Name<input id="tnName" maxlength="40" value="${esc(n.name)}"></label>
      <label class="fld">Kind<select id="tnKind">${kinds}</select></label>
      <label class="fld" title="Story clock segments the visit takes (Dawn, Day, Noon, Dusk, Night)">Time<input id="tnTime" type="number" min="0" max="5" value="${n.time}" style="width:64px"></label>
    </div>
    <label class="fld">What is here <small class="muted">(shown on phones and the TV once found)</small><textarea id="tnInfo" rows="2" maxlength="800">${esc(n.info)}</textarea></label>
    <label class="fld">Shop <small class="muted">(opens its pop-up when the party arrives)</small><select id="tnShop">${shops}</select></label>
    <div class="fld">Visiting it reveals <div class="tn-reveals">${reveals || '<span class="note">No other places.</span>'}</div></div>
    <div class="row wrap">
      <label class="chk"><input type="checkbox" id="tnSeen" ${n.seen ? 'checked' : ''}> Discovered</label>
      <button class="btn small primary" data-tn="save">Save place</button>
      <button class="btn small" data-tn="here" ${inside && S.town.here !== n.id ? '' : 'disabled'} title="Move the party here now (no time)">Party here</button>
      <button class="btn small" data-tn="hereTime" ${inside && S.town.here !== n.id ? '' : 'disabled'} title="Move the party here and spend the place's time">Party here + time</button>
      <button class="btn small" data-tn="remove">Remove</button>
    </div>
  </div>`;
}

function draw(S) {
  if (!S?.town?.maps || !window.Town) return;
  const at = target(S);
  host.hidden = !at;
  if (!at) return;
  $('#tnTitle').textContent = at.name;
  const m = mapOf(S, at.id);
  if (sel && !m.nodes.some((n) => n.id === sel)) sel = null;
  once('#tnVisit', JSON.stringify([at.id, S.town.on, S.town.at, S.town.here, S.town.picks, S.town.tally, S.town.gate, S.worldMap.here, !!S.worldMap.travel, m.nodes.map((n) => n.name), S.players.map((p) => p.id + p.name), !!S.dungeon?.on]), visitHtml(S, at));
  const view = { nodes: m.nodes, image: m.image, here: S.town.on && S.town.at === at.id ? S.town.here : null, tally: S.town.on && S.town.at === at.id ? S.town.tally : null };
  if (!drag && !pressing && once('#tnBoard', JSON.stringify([at.id, view, sel]), Town.board(view, { dm: true, selected: sel, key: 'dm-ed' }))) Town.hydrate($('#tnBoard'), { key: 'dm-ed' });
  const n = m.nodes.find((x) => x.id === sel);
  const ek = JSON.stringify([at.id, n, m.nodes.map((x) => x.id + x.name + x.kind), (S.shops || []).map((s) => s.id + s.name), S.town.on, S.town.at, S.town.here]);
  if (!$('#tnEdit').contains(document.activeElement) || !n) once('#tnEdit', ek, n ? editHtml(S, at, n) : '');
  $('#tnHint').textContent = placing ? 'Tap the town map to place it there.' : 'Tap a place to edit it, drag it to move it or into the bin.';
  $('#tnNew').classList.toggle('on', placing);
  const shared = S.town.share?.at === at.id;
  const sb = $('#tnShare');
  sb.classList.toggle('on', shared);
  sb.setAttribute('aria-pressed', String(shared));
  sb.textContent = shared ? '📺 Hide from TV' : '📺 Show on TV';
  sb.disabled = !!S.town.on; // a visit already puts its town on the TV
}
onState((S) => { last = S; draw(S); });
document.addEventListener('wm:sel', () => { if (last) draw(last); });

const at = () => (last ? target(last)?.id : null);
async function act(ev, data = {}) {
  const r = await call(ev, { at: at(), ...data });
  msg(r?.error || '');
  return r;
}

// Buttons.
host.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-tn]');
  if (!b) return;
  const k = b.dataset.tn;
  if (k === 'enter') act('dm:town:show', { on: true });
  else if (k === 'leave') act('dm:town:show', { on: false });
  else if (k === 'resolve') act('dm:town:resolve');
  else if (k === 'gate') act('dm:town:gate');
  else if (k === 'share') act('dm:town:share', { on: last?.town?.share?.at !== at() });
  else if (k === 'clearpicks') act('dm:town:clearpicks');
  else if (k === 'revealAll') act('dm:town:reveal', { id: '*', on: true });
  else if (k === 'hideAll') act('dm:town:reveal', { id: '*', on: false });
  else if (k === 'starter') { if (confirm('Replace this town map with the starter town?')) { sel = null; act('dm:town:starter'); } }
  else if (!sel) return;
  else if (k === 'save') {
    const reveals = [...host.querySelectorAll('[data-tn-rev]:checked')].map((x) => x.dataset.tnRev);
    act('dm:town:node', { id: sel, name: $('#tnName').value.trim(), kind: $('#tnKind').value, time: $('#tnTime').value, info: $('#tnInfo').value, shop: $('#tnShop').value, seen: $('#tnSeen').checked, reveals });
  } else if (k === 'here' || k === 'hereTime') act('dm:town:here', { id: sel, spend: k === 'hereTime' });
  else if (k === 'remove') { act('dm:town:remove', { id: sel }); sel = null; }
});

$('#tnPic').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/map', { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return msg(out.error || 'Upload failed');
  act('dm:town:image', { url: out.url });
};

// Add a place: drag the chip onto the picture, or tap it and then tap the picture.
const fracAt = (pic, x, y) => { const r = pic.getBoundingClientRect(); return { x: (x - r.left) / r.width, y: (y - r.top) / r.height }; };
async function addAt(pic, x, y) {
  const r = await act('dm:town:node', { ...fracAt(pic, x, y), name: 'New place', kind: 'house', seen: false });
  if (r?.id) sel = r.id;
  keys['#tnBoard'] = null;
  if (last) draw(last);
}
$('#tnNew').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const chip = e.currentTarget;
  const x0 = e.clientX; const y0 = e.clientY;
  let ghost = null;
  const move = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!ghost) { ghost = chip.cloneNode(true); ghost.classList.add('wm-ghost'); document.body.append(ghost); }
    ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (!ghost) { placing = !placing; if (last) draw(last); return; }
    ghost.remove();
    const pic = document.elementsFromPoint(ev.clientX, ev.clientY).map((el) => el.closest?.('#tnBoard .tn-pic')).find(Boolean);
    if (pic) addAt(pic, ev.clientX, ev.clientY);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});

// Move a place by dragging; into the bin removes it. A short press is a tap that selects it.
const overTrash = (e) => { const r = $('#tnTrash').getBoundingClientRect(); return e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8; };
document.addEventListener('pointerup', () => { if (pressing) setTimeout(() => { pressing = false; if (last) draw(last); }, 0); }, true);
$('#tnBoard').addEventListener('pointerdown', (e) => {
  pressing = true;
  const n = e.target.closest('[data-tn]');
  if (!n || e.button !== 0 || placing) return;
  drag = { id: n.dataset.tn, el: n, pic: n.closest('.tn-pic').getBoundingClientRect(), x0: e.clientX, y0: e.clientY, moved: false };
  n.setPointerCapture(e.pointerId);
});
$('#tnBoard').addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
  drag.moved = true;
  drag.el.classList.add('dragging');
  const r = drag.pic;
  drag.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  drag.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  drag.el.style.left = `${drag.x * 100}%`;
  drag.el.style.top = `${drag.y * 100}%`;
  drag.trash = overTrash(e);
  $('#tnTrash').classList.toggle('hot', drag.trash);
  drag.el.classList.toggle('binning', drag.trash);
});
function dragEnd(e) {
  const d = drag;
  drag = null;
  if (!d) return;
  $('#tnTrash').classList.remove('hot');
  if (!d.moved || e.type === 'pointercancel') { sel = d.id; keys['#tnBoard'] = null; return; }
  keys['#tnBoard'] = null;
  if (d.trash || overTrash(e)) { if (sel === d.id) sel = null; act('dm:town:remove', { id: d.id }); return; }
  sel = d.id;
  act('dm:town:node', { id: d.id, x: d.x, y: d.y });
}
$('#tnBoard').addEventListener('pointerup', dragEnd);
$('#tnBoard').addEventListener('pointercancel', dragEnd);
$('#tnBoard').addEventListener('click', (e) => {
  if (!placing) return;
  const pic = e.target.closest('.tn-pic');
  if (!pic) return;
  placing = false;
  addAt(pic, e.clientX, e.clientY);
});
// Double-click a place while the party is in town: move the party there (no time).
$('#tnBoard').addEventListener('dblclick', (e) => {
  const n = e.target.closest('[data-tn]');
  if (n && last?.town?.on && last.town.at === at()) act('dm:town:here', { id: n.dataset.tn, spend: false });
});
