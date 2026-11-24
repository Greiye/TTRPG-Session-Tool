// Quick rolls (PR AD, Nov 24): the skills this character's profession leans on, as buttons on the Play tab.
// Tapping one asks the DM, who lets it roll, sets a DC or says no (src/tableplay.js). Tap again to take it back.
import { $, socket, onState, state } from '../client.js';
import { me } from './identity.js';
import { fmt } from './views/common.js';

const { esc } = Stage;
const host = document.createElement('div');
host.className = 'card keybank';
host.hidden = true;
$('#dicePool')?.after(host);
let key = '';

onState((S) => {
  const c = S.players?.find((p) => p.id === me.charId);
  const keys = c?.keys || [];
  host.hidden = !keys.length || !!S.lobby;
  const k = JSON.stringify([keys, S.myAsk]);
  if (host.hidden || k === key) return;
  key = k;
  host.innerHTML = `<h3>⚡ Quick rolls <span class="note">asks your DM</span></h3>
    <div class="kb-grid">${keys.map((x) => `<button class="btn kb ${S.myAsk === x.skill ? 'on' : ''}" data-ask="${esc(x.skill)}" aria-pressed="${S.myAsk === x.skill}"><span>${esc(x.label)} <b>${fmt(x.bonus)}</b></span>${S.myAsk === x.skill ? '<small>Asking the DM…</small>' : ''}</button>`).join('')}</div>`;
});
host.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ask]');
  if (!b || !state()) return;
  socket.emit('player:ask', { skill: b.dataset.ask });
  navigator.vibrate?.(20);
});
