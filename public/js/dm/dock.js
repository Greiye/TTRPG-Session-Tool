// Tools column minimize. The « button tucks the column away (animated); a grip on the left screen
// edge brings it back with a click, or a drag to the right that pulls the column out under the pointer.
import { $ } from '../client.js';

const body = document.body;
const grip = $('#toolsGrip');
const KEY = 'dmToolsHidden';
const OPEN_AT = 0.35; // release past this share of the full width to reopen

function set(hidden) {
  body.classList.toggle('tools-hidden', hidden);
  grip?.setAttribute('aria-expanded', String(!hidden));
  $('#toolsMin')?.setAttribute('aria-expanded', String(!hidden));
  try { localStorage.setItem(KEY, hidden ? '1' : ''); } catch { /* private mode */ }
  if (!hidden) $('#toolsMin')?.focus({ preventScroll: true });
  else grip?.focus({ preventScroll: true });
}

const fullWidth = () => parseFloat(getComputedStyle(body).getPropertyValue('--tools-full')) || 360;

$('#toolsMin')?.addEventListener('click', () => set(true));

let drag = null;
grip?.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.clientX, full: fullWidth(), moved: false };
  grip.setPointerCapture(e.pointerId);
});
grip?.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = Math.max(0, Math.min(drag.full, e.clientX - drag.x));
  if (!drag.moved && dx < 4) return;
  drag.moved = true;
  body.classList.add('tools-dragging');
  body.style.setProperty('--tools-w', `${dx}px`);
  body.style.setProperty('--grip-x', `${dx}px`);
});
function end(e) {
  if (!drag) return;
  const { moved, full } = drag;
  const dx = e.cancel ? 0 : Math.max(0, e.clientX - drag.x);
  drag = null;
  body.classList.remove('tools-dragging');
  body.style.removeProperty('--grip-x');
  // Let the inline width snap to the class value through the CSS transition.
  requestAnimationFrame(() => body.style.removeProperty('--tools-w'));
  if (e.cancel) return;
  if (!moved || dx >= full * OPEN_AT) set(false);
}
grip?.addEventListener('pointerup', end);
grip?.addEventListener('pointercancel', () => { if (drag) end({ clientX: drag.x, cancel: true }); });
grip?.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') set(false); });

let saved = '';
try { saved = localStorage.getItem(KEY) || ''; } catch { /* private mode */ }
if (saved) {
  body.classList.add('tools-hidden');
  grip?.setAttribute('aria-expanded', 'false');
}
