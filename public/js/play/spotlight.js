// Phone initiative spotlight (Phase C): on your turn the phone buzzes and glows; the next in order
// gets a short "on deck" buzz. Only changes buzz, so a phone that reconnects mid-turn stays quiet.
import { onState } from '../client.js';
import { me } from './identity.js';

let last = null; // `${round}:${turn}` of the last state seen
let mounted = null;

function glow() {
  if (mounted) return mounted;
  mounted = document.createElement('div');
  mounted.id = 'spotGlow';
  mounted.className = 'spot-glow';
  mounted.hidden = true;
  mounted.setAttribute('aria-live', 'polite');
  mounted.innerHTML = '<span class="spot-tag"></span>';
  document.body.appendChild(mounted);
  return mounted;
}

onState((S) => {
  const el = glow();
  const c = S?.combat;
  const key = c?.active ? `${c.round}:${c.turn}` : null;
  const order = c?.order || [];
  const cur = order[c?.turn]?.id;
  const next = order.length > 1 ? order[(c.turn + 1) % order.length]?.id : null;
  const mine = me.charId;
  const role = !c?.active || !mine ? null : cur === mine ? 'now' : next === mine ? 'deck' : null;

  el.hidden = !role;
  el.dataset.role = role || '';
  el.classList.toggle('still', !!window.Anim?.reduced());
  el.querySelector('.spot-tag').textContent = role === 'now' ? 'Your turn' : role === 'deck' ? 'You are on deck' : '';

  if (key && key !== last && last !== null) {
    if (role === 'now') navigator.vibrate?.([300, 120, 300]);
    else if (role === 'deck') navigator.vibrate?.([80]);
  }
  if (key) last = key;
});
