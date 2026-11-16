// End of session (Mike, Nov 16): once the DM ends the session, the phone shows "Thanks for playing."
import { onState } from '../client.js';

let el = null;
onState((s) => {
  if (!el) {
    el = document.createElement('div');
    el.id = 'endCard';
    el.className = 'end-card phone';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="end-inner"><i aria-hidden="true">🌙</i><h2>Thanks for playing.</h2><p class="end-sub"></p></div>';
    document.body.appendChild(el);
  }
  const on = !!s.ended;
  el.hidden = !on;
  if (on) el.querySelector('.end-sub').textContent = s.ended.session ? `Session ${s.ended.session}` : '';
});
