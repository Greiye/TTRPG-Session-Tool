// DM whispers: a popup when one arrives, plus the history the server keeps for this character.
import { socket, $, onState } from '../client.js';
import { me } from './identity.js';

const { esc } = Stage;
let key = '';

socket.on('whisper', (w) => {
  $('#whisperText').textContent = w.text;
  $('#whisperPop').hidden = false;
  navigator.vibrate?.([60, 60, 60]);
});
$('#whisperOk').onclick = () => { $('#whisperPop').hidden = true; };

onState((s) => {
  const list = (s.whispers || []).filter((w) => w.to === me.charId).slice().reverse();
  const k = me.charId + list.map((w) => w.id).join();
  if (k === key) return; // keep the <details> open/closed state between renders
  key = k;
  $('#whispers').innerHTML = list.length ? `<details class="card whispers"><summary>🤫 Whispers from the DM (${list.length})</summary>${list.map((w) => `<p>${esc(w.text)}</p>`).join('')}</details>` : '';
});
