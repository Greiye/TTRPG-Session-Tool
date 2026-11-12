// Spectator view: the public table (mode, scene, NPC line, party, the TV's log) and a box for suggestions.
// No seat, no sheet, no actions. The server filters everything to what a spectator may see.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { show, onShow, current } from './nav.js';

const { esc, logFeed } = Stage;
export let watching = false;

// Join as a spectator. `onError(message)` gets the reason when the room code is wrong.
export function spectate(onError = () => {}) {
  socket.emit('spectate', { room: me.room }, (res) => {
    if (res?.error) {
      watching = false;
      if (res.error === 'room') me.room = '';
      return onError(res.error === 'room' ? 'Wrong or old room code. Scan the QR on the TV again, or type the code shown there.' : res.error);
    }
    watching = true;
    show('spectate');
    render();
  });
}

function render() {
  const S = state();
  if (!S || current() !== 'spectate') return;
  const cmb = S.combat.active ? ` · Round ${S.combat.round}` : '';
  const npc = S.mode === 'social' ? `<div class="card"><b>${esc(S.social.npc.name)}</b> <small class="muted">${esc(S.social.npc.emotion)}</small><p>${esc(S.social.line.text)}</p></div>` : '';
  $('#specMain').innerHTML = `
    <div class="card"><b>${esc(S.mode.toUpperCase())}${esc(cmb)}</b> · ${esc(S.scene.title)}<p class="muted">${esc(S.scene.text)}</p></div>
    ${npc}
    <div class="card"><small class="muted">Party</small><p>${S.players.map((p) => esc(p.name)).join(', ') || 'No one at the table yet.'}</p></div>`;
  $('#specLog').innerHTML = logFeed(S, 12);
}

onState(() => { if (current() === 'spectate') render(); });
onShow((v) => { if (v === 'spectate') render(); });

$('#specLeave').onclick = () => {
  watching = false;
  socket.emit('spectate:leave');
  show('join');
};
$('#specForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#specIn').value.trim();
  if (!text) return;
  socket.emit('spectator:suggest', { text }, (res) => {
    $('#specMsg').textContent = res?.error || 'Sent. The DM and players can see it.';
    if (!res?.error) $('#specIn').value = '';
  });
};
