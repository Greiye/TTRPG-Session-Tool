// Battle cry (PR AD, Nov 24): an optional short line for your next strike, typed before you strike. It shows on the
// TV under the roll; the DM can hide it with one tap. Sits outside the redrawn turn card, so typing is never lost.
import { $, onState } from '../client.js';
import { me } from './identity.js';

const host = document.createElement('div');
host.className = 'card cry-box';
host.hidden = true;
host.innerHTML = '<label class="fld">Battle cry <small class="muted">optional, shown on the TV with your strike</small><input id="battleCry" maxlength="60" autocomplete="off" placeholder="For the king!"></label>';
$('#main')?.before(host);

onState((S) => {
  const c = S.combat;
  host.hidden = !(S.mode === 'combat' && c.active && c.order[c.turn]?.id === me.charId);
});
// The line for this strike; it is used once.
export function takeCry() {
  const el = $('#battleCry');
  const t = el?.value.trim() || '';
  if (el) el.value = '';
  return t || undefined;
}
