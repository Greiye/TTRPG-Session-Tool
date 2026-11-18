// "Join the Conversation?" pop-up (Mike, Nov 16). When the DM starts a conversation (social.entered
// changes), every seated phone asks. No closes it. Yes turns it into a speech box: what the character
// says on top, then a wheel of the 8 emotions around a round Send button (tap, or drag one onto Send). The emotion reaches the TV only
// with the line (player:social:say). The pop-up closes for everyone when the conversation ends.
import { onState, socket, state } from '../client.js';
import { current } from './nav.js';
import { wheelHtml, wireWheel, markWheel } from '../wheel.js';

// Emotion wheel (Mike, Nov 16): shared with the DM's NPC wheel since Nov 18 (public/js/wheel.js).
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
    <div class="convo-textwrap"><textarea id="convoText" rows="3" maxlength="200" placeholder="Say something in character…"></textarea>
    <p class="convo-tip">Tip: use phone speech to text function to help DM process transcript.</p></div>
    ${wheelHtml(emotion, { label: 'Send', attrs: 'data-cv="send"' })}
    <p class="convo-tip">Tip: hold an emotion and drag it onto Send to say your line with that emotion.</p>`;
  wireWheel(sheet.querySelector('.convo-wheel'), { onPick: pickEmotion, onSend: send });
  sheet.querySelector('textarea').focus();
}

function pickEmotion(k) {
  emotion = k;
  markWheel(el, k);
}

function send() {
  const t = el?.querySelector('#convoText');
  if (!t) return;
  const text = t.value.trim();
  if (!text) { t.focus(); t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); return; }
  socket.emit('player:social:say', { text, emotion });
  t.value = '';
  const b = el.querySelector('.wheel-send');
  b.classList.remove('sent'); void b.offsetWidth; b.classList.add('sent');
  navigator.vibrate?.(30);
}

function onClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.emo) return pickEmotion(b.dataset.emo); // also picked on pointerdown (wireDrag); this covers the keyboard
  const act = b.dataset.cv;
  if (act === 'no') return close();
  if (act === 'yes') return speak();
  if (act === 'send') send();
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
