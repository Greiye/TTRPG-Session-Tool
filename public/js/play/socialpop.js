// "Join the Conversation?" pop-up (Mike, Nov 16). When the DM starts a conversation (social.entered
// changes), every seated phone asks. No closes it. Yes turns it into a speech box: what the character
// says on top, then a wheel of the 8 emotions around a round Send button (tap, or drag one onto Send). The emotion reaches the TV only
// with the line (player:social:say). The pop-up closes for everyone when the conversation ends.
import { onState, socket, state } from '../client.js';
import { current } from './nav.js';
import { me } from './identity.js';
import { sheetPop } from '../dialog.js';
import { wheelHtml, wireWheel, markWheel } from '../wheel.js';

// Emotion wheel (Mike, Nov 16): shared with the DM's NPC wheel since Nov 18 (public/js/wheel.js).
let seen = null; // social.entered counter the phone has already reacted to
let pop = null;
let el = null;
let emotion = 'neutral';
let lang = ''; // language of this phone's lines ('' = Common), from the languages the character knows (Nov 21)

const live = (S) => S?.mode === 'social' && S.social.convo?.live && !S.social.convo.ending;
function close() {
  if (!el) return;
  pop.close();
  pop = null; el = null;
}

function ask() {
  close();
  pop = sheetPop({
    cls: 'convo-pop', sheetCls: 'convo-sheet', label: 'Join the conversation', onClick, dismiss: close,
    html: `<h3>Join the Conversation?</h3>
    <div class="convo-yn">
      <button class="btn go convo-yes" data-cv="yes">Yes</button>
      <button class="btn convo-no" data-cv="no">No</button>
    </div>`,
  });
  el = pop.el;
}

// The tongues this character can speak in: Common plus the languages on their sheet.
const tongues = () => {
  const c = state()?.players.find((p) => p.id === me.charId);
  return (c?.languages || []).filter((l) => l && l.toLowerCase() !== 'common');
};
// The speech box comes down from the top (Nov 21), so the phone keyboard never covers what is being typed.
function speak() {
  const sheet = el.querySelector('.convo-sheet');
  const { esc } = Stage;
  el.classList.add('speaking');
  sheet.classList.add('speaking');
  const list = tongues();
  if (!list.includes(lang)) lang = '';
  sheet.innerHTML = `<div class="convo-head"><h3>What do you say?</h3><button class="btn small" data-cv="no" aria-label="Close">✕</button></div>
    ${list.length ? `<label class="convo-lang note">Speak in <select id="convoLang" aria-label="Language of your line"><option value="">Common</option>${list.map((l) => `<option value="${esc(l)}" ${l === lang ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
    <div class="convo-textwrap"><textarea id="convoText" rows="3" maxlength="200" placeholder="Say something in character…"></textarea>
    <p class="convo-tip">Tip: use phone speech to text function to help DM process transcript.</p></div>
    ${wheelHtml(emotion, { label: 'Send', attrs: 'data-cv="send"' })}
    <p class="convo-tip">Tip: hold an emotion and drag it onto Send to say your line with that emotion.</p>`;
  wireWheel(sheet.querySelector('.convo-wheel'), { onPick: pickEmotion, onSend: send });
  sheet.querySelector('#convoLang')?.addEventListener('change', (e) => { lang = e.target.value; });
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
  socket.emit('player:social:say', { text, emotion, lang });
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
  if (act === 'yes') { socket.emit('player:convo:join'); return speak(); }
  if (act === 'send') send();
}

// The phone's Social view has a button to open the speech box again after No.
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-convo-join]') || !live(state())) return;
  socket.emit('player:convo:join');
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
