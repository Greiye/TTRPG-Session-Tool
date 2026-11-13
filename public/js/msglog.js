// Table message log (phase 5): one list for the whole table, with a box to write in.
// The list redraws on every update; the form stays put so typing is never lost.
import { socket, onState } from './client.js';

const { esc } = Stage;

export function mountTableLog(root) {
  if (!root) return;
  root.innerHTML = `<div class="msglog" aria-live="polite"></div>
    <form class="row msgform"><input class="grow" maxlength="300" placeholder="Write to the table" aria-label="Message to the table" autocomplete="off"><button class="btn">Send</button></form>
    <p class="note msgerr" role="alert"></p>`;
  const list = root.querySelector('.msglog');
  onState((S) => {
    const msgs = (S?.messages || []).slice(-40);
    list.innerHTML = msgs.length
      ? msgs.map((m) => `<div class="msg ${esc(m.role)}"><b>${esc(m.from)}</b> <span>${esc(m.text)}</span></div>`).join('')
      : '<p class="note">No messages yet.</p>';
    list.scrollTop = list.scrollHeight;
  });
  const form = root.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('msg:post', { text }, (r) => {
      root.querySelector('.msgerr').textContent = r?.error || '';
      if (r?.ok) input.value = '';
    });
  });
}
