// DM: the world map. It is a page, not a sidebar card (Mike, Nov 14): the Modes card's World map button swaps
// the DM's main column for it. Place towns and sites on the picture (tap to edit, drag to move), run votes
// and travel (with an override), and veto or reveal road cards as they come up. Road cards draw on their own
// while the party travels; the deck, the auto table and how often a card shows are edited in Planning Mode
// (the Road cards tab).
import { $, emit, call, onState, onClick, mount, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const WM = () => window.WorldMap;

mount(`<div class="card wm-page-card">
  <h3>World map <span class="note">places, votes, travel and road cards</span></h3>
  <div class="row wrap">
    <label class="chk" title="Shows on the TV in any mode. Changing mode gives the TV back to the scene."><input type="checkbox" id="wmTv"> Show on TV</label>
    <label class="chk" title="When the server starts and on Next session: exploration mode with the world map on the TV"><input type="checkbox" id="wmOpen"> Open each session here</label>
    <label class="note tight">Leg (s) <input id="wmLeg" type="number" min="5" max="1800" style="width:72px"></label>
  </div>
  <div class="row wrap">
    <label class="chk"><input type="checkbox" id="wmFog"> Fog of war</label>
    <button class="btn small" id="wmFogAll">Reveal all</button>
    <button class="btn small" id="wmFogNone">Fog all</button>
    <span class="note">Under fog the table sees places the party has seen and roads it knows. Arriving uncovers the roads out and the places at their ends.</span>
  </div>
  <div class="row wrap wm-tools">
    <span class="note">Drag onto the map:</span>
    <span class="wm-chip" data-wm-new="town" title="Drag onto the map to add a town">🏘 Town</span>
    <span class="wm-chip" data-wm-new="site" title="Drag onto the map to add a site">📍 Site</span>
    <span class="wm-chip" data-wm-new="dungeon" title="Drag onto the map to add a dungeon entrance">🏰 Dungeon</span>
    <button class="btn small" id="wmRoad">+ Road</button>
    <span class="wm-trash" id="wmTrash" title="Drag a place here to delete it">🗑</span>
    <span class="note" id="wmHint">Tap a place to edit it, drag it to move it.</span>
  </div>
  <div id="wmBoard"></div>
  <div id="wmDungeon"></div>
  <div id="wmEdit"></div>
  <h4>Vote</h4>
  <div id="wmVote"></div>
  <h4>Road cards <span class="note">drawn on their own while the party travels · edit them in Planning Mode</span></h4>
  <div id="wmCards"></div>
  <div class="row wrap wm-foot">
    <label class="btn small">⬆ Map picture<input type="file" accept="image/*" id="wmFile" hidden></label>
    <button class="btn small" id="wmExample" title="Replace the places and roads with the example world">Load example world</button>
  </div>
</div>`, '#wmPageEnd');

// Planning Mode: the road card deck, the auto table and how often a card comes up.
mount(`<div class="card" data-tab="roads">
  <h3>Road cards <span class="note">a DM deck drawn first, then the auto table</span></h3>
  <div class="row"><label class="note tight">A card every <input id="wmCard" type="number" min="5" max="600" style="width:72px"> seconds while travelling</label></div>
  <form id="wmDeck" class="row wrap">
    <input id="wmDeckText" class="grow" maxlength="200" placeholder="DM card, e.g. A cart with a broken axle">
    <input id="wmDeckLore" class="grow" maxlength="600" placeholder="Lore (hidden until you reveal it)">
    <button class="btn small">Add to deck</button>
  </form>
  <div class="row"><button class="btn small" id="wmDraw">Draw a card now</button><span class="note">Deck first, then the table.</span></div>
  <div id="wmDeckList"></div>
  <h4>Auto table <span class="note">random picks for road cards: edit, switch off, or weight</span></h4>
  <div id="wmTable"></div>
  <form id="wmTableForm" class="row"><input id="wmTableText" class="grow" maxlength="200" placeholder="New table entry"><button class="btn small">Add</button></form>
</div>`, '#atmo');

let selId = null;
let placing = false;
let roading = false; // road mode: tap one place, then another
let roadFrom = null;
let selRoad = null;
const keys = {};
const once = (name, key, html) => { key ??= html; if (keys[name] === key) return; keys[name] = key; $(name).innerHTML = html; };
let pressing = false; // a pointer is down on the board
const setVal = (sel, v) => { const el = $(sel); if (el && document.activeElement !== el) el.value = v; };
const nameOf = (S, charId) => S.players.find((p) => p.id === charId)?.name || '?';

function voteHtml(S) {
  const wm = S.worldMap;
  const v = wm.vote;
  if (!v) {
    const options = wm.nodes.filter((n) => n.id !== wm.here).map((n) => `<label class="chk"><input type="checkbox" data-cand="${esc(n.id)}" checked> ${esc(n.name)}</label>`).join('');
    return `<div class="row wrap">${options || '<span class="note">Place at least two places first.</span>'}</div>
      <div class="row"><button class="btn small primary" id="wmVoteStart">Start vote</button></div>`;
  }
  const lines = v.candidates.map((id, i) => {
    const who = Object.entries(v.votes || {}).filter(([, n]) => n === id).map(([c]) => nameOf(S, c)).join(', ');
    return `<li>${esc(WM().byId(wm, id)?.name || '?')}: <b>${v.counts[i]}</b> ${who ? `<small class="muted">${esc(who)}</small>` : ''}</li>`;
  }).join('');
  return `<p class="note">${v.open ? `Open. ${v.needed} votes send the party.` : v.result === 'tie' ? 'Tied. Send the party yourself.' : 'Closed.'}</p>
    <ul>${lines}</ul>
    <div class="row">${v.open ? '<button class="btn small primary" id="wmVoteClose">Close and send the leader</button><button class="btn small" id="wmVoteCancel">Cancel vote</button>' : '<button class="btn small" id="wmVoteNew">New vote</button>'}</div>`;
}

function editorHtml(S, sel) {
  const wm = S.worldMap;
  const towns = S.living?.towns || [];
  const townOpts = `<option value="">No town${towns.some((t) => t.name.toLowerCase() === sel.name.toLowerCase()) && !sel.town ? ' (same name links)' : ''}</option>`
    + towns.map((t) => `<option value="${esc(t.id)}" ${sel.town === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const roads = (wm.roads || []).filter((r) => r.a === sel.id || r.b === sel.id);
  const roadRows = roads.map((r) => {
    const other = WM().byId(wm, r.a === sel.id ? r.b : r.a);
    return `<div class="item ${selRoad === r.id ? 'on' : ''}"><span class="grow">↔ ${esc(other?.name || '?')}</span>
      <label class="note tight">Legs <input type="number" min="1" max="10" value="${r.length}" data-wm-rlen="${esc(r.id)}" style="width:56px"></label>
      ${wm.fog ? `<label class="chk"><input type="checkbox" data-wm-rknown="${esc(r.id)}" ${r.known ? 'checked' : ''}> Known</label>` : ''}
      <button class="btn small" data-wm-rrm="${esc(r.id)}">✕</button></div>`;
  }).join('');
  const path = wm.here && wm.here !== sel.id ? WM().route({ ...wm, roads: (wm.roads || []).map((r) => ({ ...r, known: true })) }, wm.here, sel.id) : null;
  return `<div class="item wm-edit">
    <label class="fld">Name<input id="wmName" maxlength="40" value="${esc(sel.name)}"></label>
    <label class="fld">What the party knows <small class="muted">(shown to the table only when revealed)</small><textarea id="wmInfo" rows="3" maxlength="1200">${esc(sel.info)}</textarea></label>
    <label class="fld">Town <small class="muted">(living world: prices, clocks and rumours)</small><select id="wmTown">${townOpts}</select></label>
    <div class="row wrap">
      <label class="chk"><input type="checkbox" id="wmRev" ${sel.revealed ? 'checked' : ''}> Info revealed to the table</label>
      <label class="chk" title="Standing here opens the dungeon pop-up for everyone"><input type="checkbox" id="wmDg" ${sel.dungeon ? 'checked' : ''}> 🏰 Dungeon entrance</label>
      ${wm.fog ? `<label class="chk"><input type="checkbox" id="wmSeen" ${sel.seen ? 'checked' : ''}> On the map (out of the fog)</label>` : ''}
      <button class="btn small primary" id="wmSave">Save place</button>
      <button class="btn small" id="wmGo" ${wm.here === sel.id && !wm.travel ? 'disabled' : ''}>Send the party here now</button>
      <button class="btn small" id="wmDel">Remove place</button>
    </div>
    <p class="note">${path ? `By road: ${path.legs} leg${path.legs === 1 ? '' : 's'}${path.path.length > 1 ? `, via ${path.path.slice(0, -1).map((id) => esc(WM().byId(wm, id)?.name)).join(', ')}` : ''}.` : wm.here && wm.here !== sel.id ? 'No road from the party: they would go straight there (one leg).' : ''}</p>
    <h4>Roads</h4>
    <div class="wm-roadlist">${roadRows || '<p class="note">No roads. Use + Road, then tap two places.</p>'}</div>
  </div>`;
}

// The dungeon line: shown while the party stands on a dungeon entrance (or is inside one).
function dungeonHtml(S) {
  const wm = S.worldMap;
  const at = !wm.travel && wm.nodes.find((n) => n.id === wm.here);
  if (!at?.dungeon) return '';
  const d = S.dungeon;
  return `<div class="item row wrap"><span class="grow">🏰 <b>${esc(at.name)}</b> ${d?.on ? (d.canExit ? '· inside, at the way out' : '· inside, away from the entrance and end') : '· the party stands at the entrance'}</span>
    ${d?.on ? `<button class="btn small" id="wmDgLeave" ${d.canExit ? '' : 'disabled'}>⬆ Leave dungeon</button>` : '<button class="btn small primary" id="wmDgEnter">⬇ Enter dungeon</button>'}
    <span class="note" id="wmDgMsg"></span></div>`;
}

function cardHtml(c) {
  const comments = c.comments.length ? `<ul class="wm-comments">${c.comments.map((m) => `<li><b>${esc(m.who)}:</b> ${esc(m.text)}</li>`).join('')}</ul>` : '';
  return `<article class="item wm-card ${c.vetoed ? 'vetoed' : ''}">
    <div><p class="wm-text">${esc(c.text)}</p><small class="muted">${c.source === 'dm' ? 'DM card' : 'table'}${c.vetoed ? ' · vetoed' : ''}</small></div>
    ${c.hasLore ? `<p class="wm-lore"><b>Lore</b> ${esc(c.lore)} <small class="muted">${c.loreRevealed ? '(revealed)' : '(hidden from the table)'}</small></p>` : ''}
    ${comments}
    <div class="row wrap">
      <button class="btn small" data-wm-veto="${esc(c.id)}" data-on="${!c.vetoed}">${c.vetoed ? 'Restore' : 'Veto'}</button>
      ${c.hasLore ? `<button class="btn small" data-wm-lore="${esc(c.id)}" data-on="${!c.loreRevealed}">${c.loreRevealed ? 'Hide lore' : 'Reveal lore'}</button>` : ''}
    </div>
  </article>`;
}

let last = null;
onState((S) => { last = S; draw(S); });

function draw(S) {
  const wm = S.worldMap;
  if (!wm?.deck) return; // the DM view carries the deck and table; the first state before dm:auth does not
  setVal('#wmLeg', wm.legSeconds);
  setVal('#wmCard', wm.cardSeconds);
  $('#wmTv').checked = !!wm.onTv;
  $('#wmOpen').checked = wm.openOnSession !== false;
  $('#wmFog').checked = !!wm.fog;
  hint();

  // Redraw the board only when it changed, and never under a press: replacing the places between pointerdown
  // and click lost the click, so places were hard to select (Mike, Nov 15).
  if (!drag && !pressing) once('#wmBoard', null, WM().board(S, { dm: true, selected: selId, selRoad, from: roadFrom }));
  const sel = wm.nodes.find((n) => n.id === selId);
  if (!sel) selId = null;
  once('#wmEdit', JSON.stringify([sel, wm.here, !!wm.travel, wm.fog, wm.roads, selRoad, (S.living?.towns || []).map((t) => t.id + t.name)]), sel ? editorHtml(S, sel) : '');
  once('#wmTrail', JSON.stringify(S.trail || []), WM().trail(S.trail, { max: 40 }));
  once('#wmDungeon', JSON.stringify([wm.here, !!wm.travel, wm.nodes.map((n) => n.id + n.name + !!n.dungeon), !!S.dungeon?.on, !!S.dungeon?.canExit]), dungeonHtml(S));
  once('#wmVote', JSON.stringify([wm.vote, wm.nodes.map((n) => n.id + n.name), wm.here, S.players.map((p) => p.id + p.name)]), voteHtml(S));
  once('#wmDeckList', JSON.stringify(wm.deck), wm.deck.length
    ? wm.deck.map((d) => `<div class="item"><span>${esc(d.text)}${d.lore ? ' <small class="muted">+ lore</small>' : ''}</span><button class="btn small" data-wm-deck-rm="${esc(d.id)}">✕</button></div>`).join('')
    : '<p class="note">The deck is empty. The table fills in.</p>');
  once('#wmCards', JSON.stringify(wm.cards), wm.cards.length ? wm.cards.map(cardHtml).join('') : '<p class="note">No road cards yet.</p>');
  once('#wmTable', JSON.stringify(wm.table), wm.table.map((e) => `<div class="item wm-table-row">
      <input type="checkbox" data-wm-on="${esc(e.id)}" ${e.on ? 'checked' : ''} title="On">
      <input class="grow" maxlength="200" value="${esc(e.text)}" data-wm-text="${esc(e.id)}">
      <input type="number" min="1" max="10" value="${e.weight}" data-wm-weight="${esc(e.id)}" style="width:56px" title="Weight">
      <button class="btn small" data-wm-trm="${esc(e.id)}">✕</button>
    </div>`).join(''));
}

function hint() {
  $('#wmRoad').classList.toggle('on', roading);
  $('#wmHint').textContent = placing ? 'Tap the picture to place it there.'
    : roading ? (roadFrom ? 'Now tap the place the road leads to.' : 'Tap the place the road starts from.')
    : 'Tap a place to edit it, drag it to move it or into the bin, or tap a road to pick it.';
}

// Drag a place to move it. A press that moves less than a few pixels is a tap, so the click below still selects.
let drag = null;
let dragged = false;
$('#wmBoard').addEventListener('pointerdown', () => { pressing = true; }, true);
document.addEventListener('pointerup', () => { if (pressing) setTimeout(() => { pressing = false; if (last) draw(last); }, 0); }, true);
$('#wmBoard').addEventListener('pointerdown', (e) => {
  const n = e.target.closest('[data-node]');
  if (!n || e.button !== 0 || placing || roading) return;
  const pic = n.closest('.wm-pic');
  drag = { id: n.dataset.node, el: n, pic: pic.getBoundingClientRect(), x0: e.clientX, y0: e.clientY, moved: false };
  n.setPointerCapture(e.pointerId);
});
$('#wmBoard').addEventListener('pointermove', (e) => {
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
  $('#wmTrash').classList.toggle('hot', drag.trash);
  drag.el.classList.toggle('binning', drag.trash);
});
const overTrash = (e) => { const r = $('#wmTrash').getBoundingClientRect(); return e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8; };
function dragEnd(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved || e.type === 'pointercancel') { keys['#wmBoard'] = null; if (last) draw(last); return; }
  dragged = true; // swallow the click that follows the drag
  setTimeout(() => { dragged = false; }, 0);
  $('#wmTrash').classList.remove('hot');
  if (d.trash || overTrash(e)) {
    // Dropped in the bin: delete the place. The board is redrawn without it.
    if (selId === d.id) selId = null;
    keys['#wmBoard'] = null;
    emit('dm:worldmap:node:remove', { id: d.id });
    return;
  }
  selId = d.id;
  emit('dm:worldmap:node', { id: d.id, x: d.x, y: d.y });
}
$('#wmBoard').addEventListener('pointerup', dragEnd);
$('#wmBoard').addEventListener('pointercancel', dragEnd);

// Palette: drag a Town, Site or Dungeon chip onto the picture to add a place there. A tap on a chip arms it
// instead, and the next tap on the picture places it (for touch screens where dragging is awkward).
const NEW_PLACE = { town: { name: 'New town' }, site: { name: 'New site' }, dungeon: { name: 'New dungeon', dungeon: true } };
let newKind = null;
let ghost = null;
async function addPlace(kind, e, pic) {
  const r = pic.getBoundingClientRect();
  const res = await call('dm:worldmap:node', { ...NEW_PLACE[kind], x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, info: '', revealed: false });
  if (res?.error) alert(res.error);
  if (res?.id) selId = res.id;
  if (last) draw(last);
}
document.querySelector('.wm-tools').addEventListener('pointerdown', (e) => {
  const chip = e.target.closest('[data-wm-new]');
  if (!chip || e.button !== 0) return;
  e.preventDefault();
  const kind = chip.dataset.wmNew;
  const x0 = e.clientX; const y0 = e.clientY;
  let moved = false;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
    if (!moved) { moved = true; ghost = chip.cloneNode(true); ghost.classList.add('wm-ghost'); document.body.append(ghost); }
    ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
  };
  const up = (ev) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost?.remove(); ghost = null;
    if (!moved) { placing = newKind !== kind || !placing; newKind = placing ? kind : null; roading = false; roadFrom = null; hint(); chips(); return; }
    const pic = document.elementsFromPoint(ev.clientX, ev.clientY).map((el) => el.closest?.('#wmBoard .wm-pic')).find(Boolean);
    if (pic) addPlace(kind, ev, pic);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
const chips = () => document.querySelectorAll('[data-wm-new]').forEach((c) => c.classList.toggle('on', placing && c.dataset.wmNew === newKind));

// Board: tap a place to select it; with Place on, tap the picture to add one there; with Road on, tap two places.
$('#wmBoard').addEventListener('click', async (e) => {
  if (dragged) return;
  const n = e.target.closest('[data-node]');
  if (n && roading) {
    if (!roadFrom) roadFrom = n.dataset.node;
    else if (roadFrom !== n.dataset.node) {
      const res = await call('dm:worldmap:road', { a: roadFrom, b: n.dataset.node, known: false });
      if (res?.error) alert(res.error);
      selId = roadFrom; selRoad = res?.id || null; roadFrom = null; roading = false;
    }
    return last && draw(last);
  }
  if (n) { selId = n.dataset.node; selRoad = null; return last && draw(last); }
  const road = e.target.closest('[data-road]');
  if (road && last) {
    const r = last.worldMap.roads.find((x) => x.id === road.dataset.road);
    if (r) { selRoad = r.id; if (selId !== r.a && selId !== r.b) selId = r.a; }
    return draw(last);
  }
  if (!placing) return;
  const pic = e.target.closest('.wm-pic');
  if (!pic) return;
  const kind = newKind || 'site';
  placing = false; newKind = null; chips();
  addPlace(kind, e, pic);
});

$('#wmDungeon').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const r = await call('dm:dungeon:show', { on: b.id === 'wmDgEnter' });
  const m = $('#wmDgMsg');
  if (m) m.textContent = r?.error || '';
});
$('#wmExample').onclick = async () => {
  if (last?.worldMap.nodes.length && !confirm('Replace the places and roads with the example world?')) return;
  const r = await call('dm:worldmap:example');
  if (r?.error) alert(r.error);
  selId = null; selRoad = null;
};
$('#wmRoad').onclick = () => { roading = !roading; placing = false; newKind = null; chips(); roadFrom = null; if (last) draw(last); };
$('#wmFog').onchange = (e) => emit('dm:worldmap:fog', { on: e.target.checked });
$('#wmFogAll').onclick = () => emit('dm:worldmap:fog:all', { on: true });
$('#wmFogNone').onclick = () => emit('dm:worldmap:fog:all', { on: false });
$('#wmTv').onchange = (e) => emit('dm:worldmap:show', { on: e.target.checked });
$('#wmOpen').onchange = (e) => emit('dm:worldmap:opensession', { on: e.target.checked });
$('#wmLeg').onchange = (e) => emit('dm:worldmap:timing', { legSeconds: e.target.value });
$('#wmCard').onchange = (e) => emit('dm:worldmap:timing', { cardSeconds: e.target.value });
$('#wmFile').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const res = await fetch('/api/assets/map', { method: 'POST', headers: { 'content-type': file.type, 'x-dm-key': dmKey() }, body: file });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return alert(out.error || 'Upload failed');
  emit('dm:worldmap:image', { image: out.url });
};

$('#wmEdit').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !selId) return;
  if (b.id === 'wmSave') emit('dm:worldmap:node', { id: selId, name: $('#wmName').value.trim() || 'Unnamed place', info: $('#wmInfo').value, revealed: $('#wmRev').checked, town: $('#wmTown').value, dungeon: $('#wmDg').checked, ...($('#wmSeen') ? { seen: $('#wmSeen').checked } : {}) });
  else if (b.dataset.wmRrm) { emit('dm:worldmap:road:remove', { id: b.dataset.wmRrm }); if (selRoad === b.dataset.wmRrm) selRoad = null; }
  else if (b.id === 'wmGo') emit('dm:worldmap:go', { node: selId });
  else if (b.id === 'wmDel') { emit('dm:worldmap:node:remove', { id: selId }); selId = null; }
});

$('#wmEdit').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.wmRlen) emit('dm:worldmap:road', { id: t.dataset.wmRlen, length: t.value });
  else if (t.dataset.wmRknown) emit('dm:worldmap:road', { id: t.dataset.wmRknown, known: t.checked });
});

$('#wmVote').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'wmVoteStart') {
    const candidates = [...document.querySelectorAll('#wmVote [data-cand]:checked')].map((x) => x.dataset.cand);
    emit('dm:worldmap:vote:start', { candidates });
  } else if (b.id === 'wmVoteClose') emit('dm:worldmap:vote:close');
  else if (b.id === 'wmVoteCancel') emit('dm:worldmap:vote:cancel');
  else if (b.id === 'wmVoteNew') emit('dm:worldmap:vote:start', {});
});

$('#wmDeck').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#wmDeckText').value.trim();
  if (!text) return;
  emit('dm:worldmap:deck:add', { text, lore: $('#wmDeckLore').value.trim() });
  $('#wmDeckText').value = ''; $('#wmDeckLore').value = '';
};
$('#wmDraw').onclick = () => emit('dm:worldmap:draw');
onClick('wm-deck-rm', (id) => emit('dm:worldmap:deck:remove', { id }));
onClick('wm-veto', (id, b) => emit('dm:worldmap:card:veto', { id, on: b.dataset.on === 'true' }));
onClick('wm-lore', (id, b) => emit('dm:worldmap:lore', { id, on: b.dataset.on === 'true' }));
onClick('wm-trm', (id) => emit('dm:worldmap:table:remove', { id }));

$('#wmTable').addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.wmOn) emit('dm:worldmap:table:set', { id: t.dataset.wmOn, on: t.checked });
  else if (t.dataset.wmText) emit('dm:worldmap:table:set', { id: t.dataset.wmText, text: t.value.trim() });
  else if (t.dataset.wmWeight) emit('dm:worldmap:table:set', { id: t.dataset.wmWeight, weight: t.value });
});
$('#wmTableForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#wmTableText').value.trim();
  if (!text) return;
  emit('dm:worldmap:table:set', { text, on: true });
  $('#wmTableText').value = '';
};
