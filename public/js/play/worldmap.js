// Phone: the world map tab. Tap a place to see what is known, vote to go there, and remark on road cards.
import { socket, $, emit, onState, state } from '../client.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
let sel = null; // place the phone has tapped

addTab('map', '🧭 Map');

// A focused comment box holds its text: the re-render waits until it loses focus.
const typing = () => { const el = $('#tabMap'); return !!el && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT'; };

function render() {
  const S = state();
  const el = $('#tabMap');
  if (!S || !el || tab() !== 'map' || typing()) return;
  const wm = S.worldMap;
  if (!wm.image && !wm.nodes.length) { el.innerHTML = '<div class="card"><p class="note">The DM has not drawn the map yet.</p></div>'; return; }
  const place = wm.nodes.find((n) => n.id === sel);
  const v = wm.vote;
  const voteBlock = !v ? '' : v.open
    ? `<p>Vote where to go. ${v.needed} votes send the party. Your vote can change until it closes.</p>
       <div class="wm-votes">${v.candidates.map((id, i) => `<button class="btn wm-vote ${v.mine === id ? 'on' : ''}" data-vote-node="${esc(id)}">${esc(WorldMap.byId(wm, id)?.name || '?')} · ${v.counts[i]}</button>`).join('')}</div>`
    : `<p class="note">${v.result === 'tie' ? 'The vote is tied. The DM decides.' : 'The vote is closed.'}</p>`;
  const placeCard = place ? `<div class="card">
      <h3>${esc(place.name)}</h3>
      <p>${place.info ? esc(place.info) : '<span class="note">Nothing known about this place yet.</span>'}</p>
      ${wm.here === place.id ? '<p class="note">The party is here.</p>' : ''}
      ${v?.open && v.candidates.includes(place.id) ? `<button class="bigbtn" data-vote-node="${esc(place.id)}">Vote to go here</button>` : ''}
    </div>` : '<p class="note">Tap a place on the map.</p>';
  const cards = wm.cards.length ? wm.cards.map((c) => WorldMap.card(c, { phone: true })).join('') : '<p class="note">No road cards yet. They come up while the party travels.</p>';
  el.innerHTML = `
    <div class="card">
      <h3>🧭 ${wm.travel ? 'On the road' : 'Where to?'}</h3>
      ${WorldMap.board(S, { selected: sel })}
      <div style="margin-top:8px">${voteBlock}</div>
    </div>
    ${placeCard}
    <h3 class="muted" style="font-family:var(--display);font-size:13px;letter-spacing:.1em">ROAD CARDS</h3>
    ${cards}`;
}

onState(render);
onTab((id) => { if (id === 'map') render(); });

$('#tabMap').addEventListener('click', (e) => {
  const n = e.target.closest('[data-node]');
  if (n) { sel = n.dataset.node; render(); return; }
  const b = e.target.closest('[data-vote-node]');
  if (b) { emit('player:worldmap:vote', { node: b.dataset.voteNode }); navigator.vibrate?.(30); }
});
$('#tabMap').addEventListener('submit', (e) => {
  const f = e.target.closest('.wm-cform');
  if (!f) return;
  e.preventDefault();
  const input = f.querySelector('input');
  const text = input.value.trim();
  if (text) socket.emit('player:worldmap:comment', { card: f.dataset.card, text });
  input.value = '';
});
$('#tabMap').addEventListener('focusout', () => setTimeout(render, 0));
