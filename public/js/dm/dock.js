// Side columns minimize. The « button tucks the tools column away (animated) and the » button does the same for
// the hero column. A grip on that screen edge brings the column back with a click, or a drag that pulls the
// column out under the pointer. Each column remembers its state on this laptop.
import { $ } from '../client.js';

const body = document.body;
const OPEN_AT = 0.35; // release past this share of the full width to reopen

// side: 'tools' (left edge) or 'hero' (right edge). The CSS uses body.<side>-hidden, --<side>-w and --<side>-full.
function dock({ side, min, grip, fallback }) {
  const minBtn = $(min);
  const gripBtn = $(grip);
  const KEY = side === 'tools' ? 'dmToolsHidden' : `dm${side[0].toUpperCase()}${side.slice(1)}Hidden`;
  const dir = side === 'tools' ? 1 : -1; // tools pull out to the right, hero to the left

  function set(hidden) {
    body.classList.toggle(`${side}-hidden`, hidden);
    gripBtn?.setAttribute('aria-expanded', String(!hidden));
    minBtn?.setAttribute('aria-expanded', String(!hidden));
    try { localStorage.setItem(KEY, hidden ? '1' : ''); } catch { /* private mode */ }
    if (!hidden) minBtn?.focus({ preventScroll: true });
    else gripBtn?.focus({ preventScroll: true });
  }

  const fullWidth = () => parseFloat(getComputedStyle(body).getPropertyValue(`--${side}-full`)) || fallback;

  minBtn?.addEventListener('click', () => set(true));

  let drag = null;
  gripBtn?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, full: fullWidth(), moved: false };
    gripBtn.setPointerCapture(e.pointerId);
  });
  gripBtn?.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = Math.max(0, Math.min(drag.full, (e.clientX - drag.x) * dir));
    if (!drag.moved && dx < 4) return;
    drag.moved = true;
    body.classList.add(`${side}-dragging`);
    body.style.setProperty(`--${side}-w`, `${dx}px`);
    body.style.setProperty(`--${side}-grip-x`, `${dx * dir}px`);
  });
  function end(e) {
    if (!drag) return;
    const { moved, full } = drag;
    const dx = e.cancel ? 0 : Math.max(0, (e.clientX - drag.x) * dir);
    drag = null;
    body.classList.remove(`${side}-dragging`);
    body.style.removeProperty(`--${side}-grip-x`);
    // Let the inline width snap to the class value through the CSS transition.
    requestAnimationFrame(() => body.style.removeProperty(`--${side}-w`));
    if (e.cancel) return;
    if (!moved || dx >= full * OPEN_AT) set(false);
  }
  gripBtn?.addEventListener('pointerup', end);
  gripBtn?.addEventListener('pointercancel', () => { if (drag) end({ clientX: drag.x, cancel: true }); });
  gripBtn?.addEventListener('keydown', (e) => { if (e.key === (dir > 0 ? 'ArrowRight' : 'ArrowLeft')) set(false); });

  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch { /* private mode */ }
  if (saved) {
    body.classList.add(`${side}-hidden`);
    gripBtn?.setAttribute('aria-expanded', 'false');
  }
}

dock({ side: 'tools', min: '#toolsMin', grip: '#toolsGrip', fallback: 360 });
dock({ side: 'hero', min: '#heroMin', grip: '#heroGrip', fallback: 300 });
