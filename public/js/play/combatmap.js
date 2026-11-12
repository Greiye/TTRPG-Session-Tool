// Phone: the move pad during your turn on a battle map (item 25).
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';

const { esc } = Stage;
onState((s) => {
  const main = $('#main');
  if (!main) return;
  const c = s.players.find((p) => p.id === me.charId);
  const turn = s.combat.active && s.combat.order[s.combat.turn]?.id === me.charId;
  const existing = document.getElementById('movePad');
  if (!s.map || !c || !turn || !s.tokens?.[c.id]) { existing?.remove(); return; }
  const flying = (c.speed?.fly || 0) > 0;
  const budget = flying ? c.speed.fly : c.speed?.walk ?? c.speed ?? 30;
  const left = budget - (s.combat.moved?.[c.id] || 0);
  const html = `<div class="card" id="movePad"><h3>Move (${left} ft left)</h3>
    <div class="pad">
      <span></span><button class="btn" data-mv="0,-1">▲</button><span></span>
      <button class="btn" data-mv="-1,0">◀</button><span class="muted" style="text-align:center">${esc(c.name[0])}</span><button class="btn" data-mv="1,0">▶</button>
      <span></span><button class="btn" data-mv="0,1">▼</button><span></span>
    </div>
    <p class="note">One tile is 5 ft.${flying ? ' You fly, so difficult ground does not slow you.' : ''}</p></div>`;
  if (existing) existing.outerHTML = html; else main.insertAdjacentHTML('afterbegin', html);
});
$('#main').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mv]');
  if (!b) return;
  const [dx, dy] = b.dataset.mv.split(',').map(Number);
  const t = state()?.tokens?.[me.charId];
  if (!t) return;
  socket.emit('player:move', { x: t.x + dx, y: t.y + dy }, (res) => { if (res?.error) navigator.vibrate?.([40, 40, 40]); });
});
