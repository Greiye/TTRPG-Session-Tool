// Phone: when this character gains an inspiration point (DM Inspiration tab or the recap quiz), a short
// sparkle toast rises from the bottom of the screen.
import { onState } from '../client.js';
import { me } from './identity.js';

let had = null; // points last seen for this character
let forId = null;

onState((S) => {
  const c = me.charId && S.players?.find((p) => p.id === me.charId);
  if (!c) { had = null; return; }
  const n = c.inspiration || 0;
  if (forId !== c.id) { forId = c.id; had = n; return; }
  if (had != null && n > had) toast(n);
  had = n;
});

function toast(n) {
  const el = document.createElement('div');
  el.className = 'insp-toast';
  el.setAttribute('role', 'status');
  el.textContent = `✨ Inspiration! (${n})`;
  document.body.appendChild(el);
  navigator.vibrate?.([20, 40, 20]);
  setTimeout(() => el.remove(), 2600);
}
