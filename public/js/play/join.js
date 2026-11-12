// Join flow: room code entry, saved-character picker, new character form, reconnect, takeover.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { show, onShow, current } from './nav.js';
import { spectate, watching } from './spectate.js';

const { esc } = Stage;
const ERR = {
  room: 'Wrong or old room code. Scan the QR on the TV again, or type the code shown there.',
  taken: 'Your character was opened on another device, or the DM removed it.',
  fallen: 'Your character has fallen. Rest in peace, and thanks for playing.',
};
let cls = null;
let classKey = null;

export function showJoin(msg = '') {
  $('#joinErr').textContent = msg;
  show('join');
}
onShow((v) => { if (v === 'join') renderRoster(); });

function join(payload) {
  socket.emit('join', { room: me.room, ...payload }, (res) => {
    if (res.error === 'gone') { me.charId = null; return showJoin(); }
    if (res.error === 'room') { me.room = ''; return showJoin(ERR.room); }
    if (res.error === 'fallen') { me.charId = null; return showJoin(ERR.fallen); }
    if (res.error === 'in-use') {
      if (confirm('Someone is already playing this character on another phone. Take over?')) return join({ ...payload, takeover: true });
      return showJoin();
    }
    if (res.error) { $('#joinErr').textContent = res.error; return; }
    me.charId = res.id;
    me.setToken(res.id, res.token);
    me.room = res.room;
    show('game');
  });
}

function renderClasses(s) {
  const key = JSON.stringify(s.rules.classes);
  if (key === classKey) return;
  classKey = key;
  $('#classes').innerHTML = Object.entries(s.rules.classes).map(([k, v]) => `<button class="cls" data-cls="${esc(k)}"><b>${esc(k)}</b><small>${esc(v)}</small></button>`).join('');
}

function renderRoster() {
  const s = state();
  $('#roomForm').hidden = !!me.room;
  if (!s) return;
  $('#roster').innerHTML = s.roster.map((c) => `
    <button class="rcard" data-claim="${esc(c.id)}" style="--hue:${c.hue}">
      ${Stage.avatar(c, 'av-rc')}
      <b>${esc(c.name)}</b><small>${esc([c.race, c.cls].filter(Boolean).join(' '))}${c.level > 1 ? ` ${c.level}` : ''}</small>
      ${c.player ? `<small class="muted">${esc(c.player)}</small>` : ''}${c.online ? '<em>in use</em>' : ''}
    </button>`).join('');
  Anim.hydrate($('#roster'));
  if (!s.roster.length) { $('#newForm').hidden = false; $('#newBtn').hidden = true; }
}

onState((s) => {
  renderClasses(s);
  // Server restarted or DM removed us from the table: back to the picker.
  if (current() === 'game' && !s.players.some((p) => p.id === me.charId)) showJoin();
  if (current() === 'join') renderRoster();
});

$('#classes').onclick = (e) => {
  const b = e.target.closest('[data-cls]');
  if (!b) return;
  cls = b.dataset.cls;
  document.querySelectorAll('.cls').forEach((x) => x.classList.toggle('sel', x === b));
};
$('#newBtn').onclick = () => { $('#newForm').hidden = false; $('#newBtn').hidden = true; $('#name').focus(); };
$('#joinBtn').onclick = () => join({ name: $('#name').value, cls, race: $('#race').value, player: $('#player').value });
$('#roster').onclick = (e) => {
  const b = e.target.closest('[data-claim]');
  if (b) join({ id: b.dataset.claim, token: me.tokenFor(b.dataset.claim) });
};
$('#roomForm').onsubmit = (e) => {
  e.preventDefault();
  const code = $('#roomIn').value.trim().toUpperCase();
  socket.emit('room:check', { room: code }, ({ ok }) => {
    if (!ok) return showJoin('That code doesn\'t match the one on the TV.');
    me.room = code;
    showJoin();
  });
};
$('#specBtn').onclick = () => {
  if (!me.room) return showJoin('Enter the room code from the TV first.');
  spectate(showJoin);
};
socket.on('connect', () => {
  if (watching) return spectate(showJoin);
  const id = me.charId;
  if (id && me.tokenFor(id)) join({ id, token: me.tokenFor(id) }); else showJoin();
});
socket.on('taken', () => showJoin(ERR.taken));
socket.on('fallen', () => { me.charId = null; showJoin(ERR.fallen); });
