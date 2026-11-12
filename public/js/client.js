// One Socket.IO connection per page plus a tiny state store, shared by every feature module.
// Feature modules call onState(fn) to render and emit(...) to act. Classic scripts (Stage, Atmo,
// AudioOut, Anim, Settings) stay globals; `window.socket` is kept for tools and tests.
/* global io */
export const socket = io();
window.socket = socket;

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];
export const emit = (ev, data = {}) => socket.emit(ev, data);
export const call = (ev, data = {}) => new Promise((res) => socket.emit(ev, data, res));

let current = null;
const subs = [];
export const state = () => current;
// Subscribers run in registration order on every state update; one failing module doesn't stop the rest.
export function onState(fn) {
  subs.push(fn);
  if (current) fn(current);
}
socket.on('state', (s) => {
  current = s;
  for (const fn of subs) {
    try { fn(s); } catch (e) { console.error(e); }
  }
});

// Delegated button clicks by data attribute: onClick('emo', (value, button) => ...).
export function onClick(attr, fn, root = document) {
  const key = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest(`button[data-${attr}]`);
    if (!b || b.disabled || !root.contains(b)) return;
    fn(b.dataset[key], b, ev);
  });
}
