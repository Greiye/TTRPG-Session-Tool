// The DM side panel (tabs) can be minimized to a small handle on the right edge. Click the handle to bring
// the panel back, or drag it left to pull the panel out to the width you want. The panel's left edge is a
// grip too: drag it to resize, or drag it nearly shut to minimize. Width and state are kept per laptop.
import { $ } from '../client.js';

const MIN_W = 320;
const MAX_W = 760;
const CLOSE_AT = 160; // narrower than this when let go: the panel minimizes
const body = document.body;
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const clamp = (w) => Math.max(MIN_W, Math.min(MAX_W, Math.min(w, innerWidth - 360)));

let width = clamp(Number(load('dmSideW', 420)) || 420);
let open = load('dmSideMin', '0') !== '1';

const right = $('.dm-right');
const btn = document.createElement('button');
btn.className = 'side-min-btn';
btn.title = 'Minimize the side panel';
btn.setAttribute('aria-label', 'Minimize the side panel');
btn.textContent = '⇥';
const grip = document.createElement('div');
grip.className = 'side-grip';
grip.title = 'Drag to resize';
const handle = document.createElement('button');
handle.className = 'side-handle';
handle.title = 'Click or drag left to open the tabs';
handle.setAttribute('aria-label', 'Open the side panel');
handle.innerHTML = '<span class="grip-dots" aria-hidden="true"></span><span class="side-handle-label">Tabs</span>';
right.prepend(btn);
right.append(grip);
body.append(handle);

function apply() {
  body.style.setProperty('--side-w', `${open ? width : 0}px`);
  body.classList.toggle('side-min', !open);
  handle.setAttribute('aria-expanded', String(open));
  save('dmSideW', String(width));
  save('dmSideMin', open ? '0' : '1');
}
function setOpen(v) { open = v; apply(); }
btn.onclick = () => setOpen(false);

// Drag from the handle (panel shut) or the grip (panel open). The panel follows the pointer while dragging.
function drag(el, fromOpen) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = fromOpen ? width : 0;
    let moved = false;
    let w = w0;
    el.setPointerCapture(e.pointerId);
    body.classList.add('side-dragging');
    const move = (ev) => {
      const dx = x0 - ev.clientX;
      if (Math.abs(dx) > 4) moved = true;
      if (!moved) return;
      w = Math.max(0, Math.min(MAX_W, w0 + dx));
      body.classList.toggle('side-min', w < 40);
      body.style.setProperty('--side-w', `${w}px`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      body.classList.remove('side-dragging');
      if (!moved) { if (!fromOpen) setOpen(true); return; } // a plain click on the handle opens the panel
      if (w < CLOSE_AT) { setOpen(false); return; }
      width = clamp(w);
      setOpen(true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}
drag(handle, false);
drag(grip, true);
handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } });
// Keyboard: [ minimizes or restores the panel when no field has focus.
document.addEventListener('keydown', (e) => {
  if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable) return;
  setOpen(!open);
});
apply();
