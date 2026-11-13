// Phone pop-up when the DM enters social mode: enter the dialogue, change expression, say something, or leave.
import { $, onState, socket } from '../client.js';
import { current } from './nav.js';

let seen = null; // social.entered counter the phone has already reacted to
let el = null;

function close() { el?.remove(); el = null; }

function show(S) {
  close();
  const emo = Stage.EMO;
  el = document.createElement('div');
  el.className = 'pop-scrim';
  el.innerHTML = `<div class="pop-sheet" role="dialog" aria-modal="true" aria-label="Social scene">
    <h3>💬 Social scene</h3>
    <div class="list">
      <button class="btn" data-sp="enter">📖 Enter the dialogue</button>
      <button class="btn" data-sp="expr">🎭 Change expression</button>
      <button class="btn" data-sp="say">🗣 Say something</button>
      <button class="btn" data-sp="leave">🚪 Leave</button>
    </div>
    <div class="pop-emos" hidden>${(S.emotions || []).map((k) => `<button class="btn small" data-emo="${k}">${emo[k]?.icon || ''} ${emo[k]?.label || k}</button>`).join('')}</div>
  </div>`;
  el.addEventListener('click', (e) => {
    if (e.target === el) return close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.emo) { socket.emit('player:expression', { emotion: b.dataset.emo }); return close(); }
    const act = b.dataset.sp;
    if (act === 'expr') return (el.querySelector('.pop-emos').hidden = false);
    close();
    if (act === 'say') $('#say')?.focus();
  });
  document.body.appendChild(el);
}

onState((S) => {
  if (!S) return;
  if (seen === null) seen = S.social.entered; // joining mid-scene does not pop up
  if (S.social.entered !== seen) {
    seen = S.social.entered;
    if (S.mode === 'social' && current() === 'game') show(S);
  }
  if (S.mode !== 'social') close();
});
