// Group Map View button (Mike, Nov 18) on the Play tab. Every seated player presses it to open the world map on
// the TV; with the map up it reads Close Map and the same vote puts the TV back. Press again to take it back.
// The count shows on the button and on the TV. Server: src/mapview.js.
import { socket, $, onState, state } from '../client.js';

const host = document.createElement('div');
host.className = 'mapview';
host.hidden = true;
$('#dicePool')?.before(host);
let key = '';

onState((S) => {
  const mv = S.mapVote;
  const wm = S.worldMap;
  const show = !!mv && !mv.blocked && !S.lobby && S.viewer?.role === 'player' && !!(wm?.image || wm?.nodes?.length);
  host.hidden = !show;
  if (!show) return;
  const k = JSON.stringify(mv);
  if (k === key) return;
  const fresh = key && JSON.parse(key).dir !== mv.dir;
  key = k;
  const label = mv.dir === 'close' ? '✕ Close Map' : '🗺 Group Map View';
  host.innerHTML = `<button class="btn mapview-btn ${mv.mine ? 'on' : ''}" aria-pressed="${mv.mine}" data-mapview>
    <span>${label}</span><small>${mv.want ? `${mv.want} / ${mv.total} ${mv.dir === 'close' ? 'want to close it' : 'want the map'}` : 'everyone has to press it'}</small></button>`;
  if (fresh) window.Anim?.play?.(host.firstElementChild, 'pop', null);
});

host.addEventListener('click', (e) => {
  if (!e.target.closest('[data-mapview]')) return;
  const mine = !!state()?.mapVote?.mine;
  socket.emit('player:mapview', { on: !mine });
  navigator.vibrate?.(30);
});
