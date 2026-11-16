// "Join the Conversation?" pop-up (Mike, Nov 16). When the DM starts a conversation (social.entered
// changes), every seated phone asks. No closes it. Yes turns it into a speech box: what the character
// says on top, then a 3x3 pad of the 8 emotions with Send in the centre. The emotion reaches the TV only
// with the line (player:social:say). The pop-up closes for everyone when the conversation ends.
import { onState, socket, state } from '../client.js';
import { current } from './nav.js';

// Pad order: the 8 emotions around the centre Send button, left to right, top to bottom.
const PAD = ['happy', 'surprised', 'smug', 'angry', null, 'suspicious', 'sad', 'fearful', 'neutral'];
let seen = null; // social.entered counter the phone has already reacted to
let el = null;
let emotion = 'neutral';

const live = (S) => S?.mode === 'social' && S.social.convo?.live && !S.social.convo.ending;
function close() {
  if (!el) return;
  const box = el;
  el = null;
  box.classList.add('closing');
  setTimeout(() => box.remove(), 220);
}

function ask() {
  close();
  el = document.createElement('div');
  el.className = 'pop-scrim convo-pop';
  el.innerHTML = `<div class="pop-sheet convo-sheet" role="dialog" aria-modal="true" aria-label="Join the conversation">
    <h3>Join the Conversation?</h3>
    <div class="convo-yn">
      <button class="btn go convo-yes" data-cv="yes">Yes</button>
      <button class="btn convo-no" data-cv="no">No</button>
    </div>
  </div>`;
  el.addEventListener('click', onClick);
  document.body.appendChild(el);
}

function speak() {
  const sheet = el.querySelector('.convo-sheet');
  const emo = Stage.EMO;
  sheet.classList.add('speaking');
  sheet.innerHTML = `<div class="convo-head"><h3>What do you say?</h3><button class="btn small" data-cv="no" aria-label="Close">✕</button></div>
    <textarea id="convoText" rows="3" maxlength="200" placeholder="Say something in character…"></textarea>
    <div class="convo-pad" role="group" aria-label="Emotion">${PAD.map((k) => (k
      ? `<button class="btn pad-emo ${k === emotion ? 'on' : ''}" data-emo="${k}" aria-pressed="${k === emotion}"><span>${emo[k]?.icon || ''}</span><small>${emo[k]?.label || k}</small></button>`
      : '<button class="btn primary pad-send" data-cv="send">Send</button>')).join('')}</div>`;
  sheet.querySelector('textarea').focus();
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.emo) {
    emotion = b.dataset.emo;
    el.querySelectorAll('[data-emo]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    navigator.vibrate?.(15);
    return;
  }
  const act = b.dataset.cv;
  if (act === 'no') return close();
  if (act === 'yes') return speak();
  if (act === 'send') {
    const t = el.querySelector('#convoText');
    const text = t.value.trim();
    if (!text) { t.focus(); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); return; }
    socket.emit('player:social:say', { text, emotion });
    t.value = '';
    b.classList.remove('sent'); void b.offsetWidth; b.classList.add('sent');
    navigator.vibrate?.(30);
  }
}

// The phone's Social view has a button to open the speech box again after No.
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-convo-join]') || !live(state())) return;
  ask();
  speak();
});

onState((S) => {
  if (!S) return;
  if (seen === null) seen = S.social.entered; // joining mid-scene does not pop up
  if (S.social.entered !== seen) {
    seen = S.social.entered;
    emotion = 'neutral';
    if (live(S) && current() === 'game') ask();
  }
  if (!live(S)) close();
});
