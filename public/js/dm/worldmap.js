// DM: the world map. Place towns and sites on the picture, run votes and travel (with an override), and shape
// the road cards: a DM deck drawn first, an auto table the DM can edit or switch off, vetoes and lore.
import { $, emit, call, onState, onClick, mount, state } from '../client.js';
import { dmKey } from './auth.js';

const { esc } = Stage;
const WM = () => window.WorldMap;

mount(`<div class="card" data-tab="world">
  <h3>World map <span class="note">places, votes, travel and road cards</span></h3>
  <div class="row wrap">
    <label class="btn small">⬆ Map picture<input type="file" accept="image/*" id="wmFile" hidden></label>
    <label class="chk"><input type="checkbox" id="wmTv"> Show on TV</label>
    <label class="note tight">Leg (s) <input id="wmLeg" type="number" min="5" max="1800" style="width:72px"></label>
    <label class="note tight">Card every (s) <input id="wmCard" type="number" min="5" max="600" style="width:72px"></label>
  </div>
  <div class="row"><button class="btn small" id="wmPlace">+ Place</button><span class="note" id="wmHint">Tap a place to edit it.</span></div>
  <div id="wmBoard"></div>
  <div id="wmEdit"></div>
  <h4>Vote</h4>
  <div id="wmVote"></div>
  <h4>Road cards</h4>
  <form id="wmDeck" class="row wrap">
    <input id="wmDeckText" class="grow" maxlength="200" placeholder="DM card, e.g. A cart with a broken axle">
    <input id="wmDeckLore" class="grow" maxlength="600" placeholder="Lore (hidden until you reveal it)">
    <button class="btn small">Add to deck</button>
  </form>
  <div class="row"><button class="btn small" id="wmDraw">Draw a card now</button><span class="note">Deck first, then the table.</span></div>
  <div id="wmDeckList"></div>
  <div id="wmCards"></div>
  <h4>Auto table <span class="note">random picks for road cards: edit, switch off, or veto</span></h4>
  <div id="wmTable"></div>
  <form id="wmTableForm" class="row"><input id="wmTableText" class="grow" maxlength="200" placeholder="New table entry"><button class="btn small">Add</button></form>
</div>`, '#atmo');

let selId = null;
let placing = false;
const keys = {};
const once = (name, key, html) => { if (keys[name] === key) return; keys[name] = key; $(name).innerHTML = html; };
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
  return `<div class="item wm-edit">
    <label class="fld">Name<input id="wmName" maxlength="40" value="${esc(sel.name)}"></label>
    <label class="fld">What the party knows <small class="muted">(shown to the table only when revealed)</small><textarea id="wmInfo" rows="3" maxlength="1200">${esc(sel.info)}</textarea></label>
    <div class="row wrap">
      <label class="chk"><input type="checkbox" id="wmRev" ${sel.revealed ? 'checked' : ''}> Revealed to the table</label>
      <button class="btn small primary" id="wmSave">Save place</button>
      <button class="btn small" id="wmGo" ${wm.here === sel.id && !wm.travel ? 'disabled' : ''}>Send the party here now</button>
      <button class="btn small" id="wmDel">Remove place</button>
    </div>
  </div>`;
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
  $('#wmPlace').classList.toggle('on', placing);
  $('#wmHint').textContent = placing ? 'Tap the picture to place a new place.' : 'Tap a place to edit it.';

  $('#wmBoard').innerHTML = WM().board(S, { dm: true, selected: selId });
  const sel = wm.nodes.find((n) => n.id === selId);
  if (!sel) selId = null;
  once('#wmEdit', JSON.stringify([sel, wm.here, !!wm.travel]), sel ? editorHtml(S, sel) : '');
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

// Board: tap a place to select it; with Place on, tap the picture to add one there.
$('#wmBoard').addEventListener('click', async (e) => {
  const n = e.target.closest('[data-node]');
  if (n) { selId = n.dataset.node; return last && draw(last); }
  if (!placing) return;
  const pic = e.target.closest('.wm-pic');
  if (!pic) return;
  const r = pic.getBoundingClientRect();
  const res = await call('dm:worldmap:node', { name: 'New place', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, info: '', revealed: false });
  placing = false;
  if (res?.id) selId = res.id;
  if (last) draw(last);
});

$('#wmPlace').onclick = () => { placing = !placing; $('#wmHint').textContent = placing ? 'Tap the picture to place a new place.' : 'Tap a place to edit it.'; $('#wmPlace').classList.toggle('on', placing); };
$('#wmTv').onchange = (e) => emit('dm:worldmap:show', { on: e.target.checked });
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
  if (b.id === 'wmSave') emit('dm:worldmap:node', { id: selId, name: $('#wmName').value.trim() || 'Unnamed place', info: $('#wmInfo').value, revealed: $('#wmRev').checked });
  else if (b.id === 'wmGo') emit('dm:worldmap:go', { node: selId });
  else if (b.id === 'wmDel') { emit('dm:worldmap:node:remove', { id: selId }); selId = null; }
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
