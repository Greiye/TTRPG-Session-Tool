// DM auth: localhost is trusted, other devices need ?key= (or the key typed once, then remembered).
// A Battle or Social Master key opens this page as that helper: body[data-role] hides the DM-only parts
// and modes.js shows only the helper's cards. The server refuses everything else anyway (src/roles.js).
import { socket, $ } from '../client.js';

export const dmKey = () => new URLSearchParams(location.search).get('key') || localStorage.dmKey || '';

const MASTERS = { battle: { icon: '⚔️', name: 'Battle Master' }, social: { icon: '💬', name: 'Social Master' }, music: { icon: '🎻', name: 'Music Co-DM' } };
let role = null;
// 'battle', 'social', 'music', or null for the DM.
export const masterRole = () => (MASTERS[role] ? role : null);

function authed({ ok, role: r } = {}) {
  $('#auth').hidden = ok;
  role = ok ? r : null;
  const m = MASTERS[masterRole()];
  if (m) document.body.dataset.role = role; else document.body.removeAttribute('data-role');
  const h = $('#dmBar h2');
  if (h) h.textContent = m ? `${m.icon} ${m.name}` : '🐉 DM Screen';
  document.title = `${m ? m.name : 'DM Screen'} — TTRPG Session Tool`;
  window.dispatchEvent(new CustomEvent('dm:role', { detail: masterRole() }));
}

socket.on('connect', () => socket.emit('dm:auth', { key: dmKey() }, authed));
$('#authBtn').onclick = () => socket.emit('dm:auth', { key: $('#key').value.trim() }, (res) => {
  authed(res);
  if (res?.ok) localStorage.dmKey = $('#key').value.trim();
});
