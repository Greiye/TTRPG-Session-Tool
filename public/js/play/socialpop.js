// "Join the Conversation?" pop-up (Mike, Nov 16). When the DM starts a conversation (social.entered
// changes), every seated phone asks. No closes it. Yes turns it into a speech box: what the character
// says on top, then a wheel of the 8 emotions around a round Send button (tap, or drag one onto Send). The emotion reaches the TV only
// with the line (player:social:say). The pop-up closes for everyone when the conversation ends.
import { onState, socket, state } from '../client.js';
import { current } from './nav.js';

// Emotion wheel (Mike, Nov 16): the 8 emotions are ring segments around a round Send button, clockwise
// from the top. Each segment is the whole wheel clipped to its 45° slice (an outer arc, cut square at the
// centre, which the Send button covers), pushed out a little from the centre so the gaps stay even.
const WHEEL = ['happy', 'surprised', 'smug', 'suspicious', 'neutral', 'fearful', 'sad', 'angry'];
const GAP_DEG = 1.5;
function slice(i) {
  const step = 360 / WHEEL.length;
  const a0 = -90 - step / 2 + i * step + GAP_DEG, a1 = a0 + step - 2 * GAP_DEG;
  const pts = ['50% 50%'];
  for (let k = 0; k <= 8; k++) { const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180; pts.push(`${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`); }
  const mid = ((-90 + i * step) * Math.PI) / 180;
  // label sits at 70% of the radius, along the slice's middle
  return { clip: `polygon(${pts.join(',')})`, dx: Math.cos(mid), dy: Math.sin(mid) };
}
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
    <div class="convo-wheel" role="group" aria-label="Emotion">${WHEEL.map((k, i) => {
      const { clip, dx, dy } = slice(i);
      return `<button class="wheel-emo ${k === emotion ? 'on' : ''}" data-emo="${k}" aria-pressed="${k === emotion}" aria-label="${emo[k]?.label || k}" style="clip-path:${clip};--dx:${dx.toFixed(3)};--dy:${dy.toFixed(3)}"><span class="wheel-lbl"><span>${emo[k]?.icon || ''}</span><small>${emo[k]?.label || k}</small></span></button>`;
    }).join('')}<button class="btn primary wheel-send" data-cv="send">Send</button></div>
    <p class="convo-tip">Tip: hold an emotion and drag it onto Send to say your line with that emotion.</p>`;
  wireDrag(sheet.querySelector('.convo-wheel'));
  sheet.querySelector('textarea').focus();
}

function pickEmotion(k) {
  emotion = k;
  el?.querySelectorAll('[data-emo]').forEach((x) => { const on = x.dataset.emo === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
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

// Drag to send: press an emotion, drag it onto Send and let go. A ghost of the emoji follows the finger and
// Send glows while it is under it. A press that does not reach Send just picks the emotion.
function wireDrag(wheel) {
  let drag = null;
  const sendBtn = wheel.querySelector('.wheel-send');
  const overSend = (x, y) => { const r = sendBtn.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return Math.hypot(x - cx, y - cy) <= r.width / 2 + 6; };
  wheel.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-emo]');
    if (!b) return;
    e.preventDefault();
    pickEmotion(b.dataset.emo);
    navigator.vibrate?.(15);
    b.setPointerCapture(e.pointerId);
    drag = { b, x: e.clientX, y: e.clientY, ghost: null };
  });
  wheel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'wheel-ghost';
      drag.ghost.textContent = Stage.EMO[emotion]?.icon || '';
      document.body.appendChild(drag.ghost);
      wheel.classList.add('dragging');
    }
    if (!drag.ghost) return;
    drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    sendBtn.classList.toggle('drop', overSend(e.clientX, e.clientY));
  });
  const end = (e, cancel) => {
    if (!drag) return;
    const { ghost } = drag;
    drag = null;
    wheel.classList.remove('dragging');
    sendBtn.classList.remove('drop');
    if (!ghost) return;
    ghost.remove();
    if (!cancel && overSend(e.clientX, e.clientY)) send();
  };
  wheel.addEventListener('pointerup', (e) => end(e, false));
  wheel.addEventListener('pointercancel', (e) => end(e, true));
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
