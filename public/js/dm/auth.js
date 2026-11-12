// DM auth: localhost is trusted, other devices need ?key= (or the key typed once, then remembered).
import { socket, $ } from '../client.js';

export const dmKey = () => new URLSearchParams(location.search).get('key') || localStorage.dmKey || '';

socket.on('connect', () => socket.emit('dm:auth', { key: dmKey() }, ({ ok }) => { $('#auth').hidden = ok; }));
$('#authBtn').onclick = () => socket.emit('dm:auth', { key: $('#key').value.trim() }, ({ ok }) => {
  $('#auth').hidden = ok;
  if (ok) localStorage.dmKey = $('#key').value.trim();
});
