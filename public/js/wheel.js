// The emotion wheel, shared by the phone's speech box (public/js/play/socialpop.js) and, since Nov 18 (Mike:
// "NPCs have the same emotion circle as the players"), the DM's Emotions card for NPCs (public/js/dm/social.js).
// The 8 emotions are ring segments around a round Send button, clockwise from the top. Each segment is the whole
// wheel clipped to its 45° slice (an outer arc, cut square at the centre, which the Send button covers), pushed
// out a little from the centre so the gaps stay even. Tap a segment to pick it, or drag it onto Send.
export const WHEEL = ['happy', 'surprised', 'smug', 'suspicious', 'neutral', 'fearful', 'sad', 'angry'];
const GAP_DEG = 1.5;
export function slice(i) {
  const step = 360 / WHEEL.length;
  const a0 = -90 - step / 2 + i * step + GAP_DEG, a1 = a0 + step - 2 * GAP_DEG;
  const pts = ['50% 50%'];
  for (let k = 0; k <= 8; k++) { const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180; pts.push(`${(50 + 50 * Math.cos(a)).toFixed(2)}% ${(50 + 50 * Math.sin(a)).toFixed(2)}%`); }
  const mid = ((-90 + i * step) * Math.PI) / 180;
  // label sits at 70% of the radius, along the slice's middle
  return { clip: `polygon(${pts.join(',')})`, dx: Math.cos(mid), dy: Math.sin(mid) };
}

// The wheel's markup. send: the centre button's label and attributes, e.g. { label: 'Send', attrs: 'data-cv="send"' }.
export function wheelHtml(current, { label = 'Send', attrs = '', keys = false } = {}) {
  const emo = window.Stage?.EMO || {};
  return `<div class="convo-wheel" role="group" aria-label="Emotion">${WHEEL.map((k, i) => {
    const { clip, dx, dy } = slice(i);
    const key = keys ? ` title="Key ${Object.keys(emo).indexOf(k) + 1}"` : '';
    return `<button class="wheel-emo ${k === current ? 'on' : ''}" data-emo="${k}" aria-pressed="${k === current}" aria-label="${emo[k]?.label || k}"${key} style="clip-path:${clip};--dx:${dx.toFixed(3)};--dy:${dy.toFixed(3)}"><span class="wheel-lbl"><span>${emo[k]?.icon || ''}</span><small>${emo[k]?.label || k}</small></span></button>`;
  }).join('')}<button class="btn primary wheel-send" ${attrs}>${label}</button></div>`;
}

// Show which emotion is picked without redrawing the wheel.
export function markWheel(root, k) {
  root?.querySelectorAll('.wheel-emo[data-emo]').forEach((x) => { const on = x.dataset.emo === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
}

// Drag to send: press an emotion, drag it onto Send and let go. A ghost of the emoji follows the pointer and
// Send glows while it is under it. A press that does not reach Send just picks the emotion.
// onPick(k) on every press; onSend() when an emotion is dropped on Send.
export function wireWheel(wheel, { onPick, onSend }) {
  let drag = null;
  const sendBtn = wheel.querySelector('.wheel-send');
  const overSend = (x, y) => { const r = sendBtn.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return Math.hypot(x - cx, y - cy) <= r.width / 2 + 6; };
  wheel.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-emo]');
    if (!b || e.button > 0) return;
    e.preventDefault();
    onPick(b.dataset.emo);
    navigator.vibrate?.(15);
    b.setPointerCapture?.(e.pointerId);
    drag = { k: b.dataset.emo, x: e.clientX, y: e.clientY, ghost: null };
  });
  wheel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'wheel-ghost';
      drag.ghost.textContent = window.Stage?.EMO?.[drag.k]?.icon || '';
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
    if (!cancel && overSend(e.clientX, e.clientY)) onSend();
  };
  wheel.addEventListener('pointerup', (e) => end(e, false));
  wheel.addEventListener('pointercancel', (e) => end(e, true));
}
