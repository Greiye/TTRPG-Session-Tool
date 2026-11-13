// One Socket.IO connection per page plus a tiny state store, shared by every feature module.
// Feature modules call onState(fn) to render and emit(...) to act. Classic scripts (Stage, Atmo,
// AudioOut, Anim, Settings) stay globals; `window.socket` is kept for tools and tests.
/* global io */
export const socket = io();
window.socket = socket;

// Phase 5: phone, tablet or laptop. Spectators must watch from a phone.
export const deviceKind = () => {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const small = Math.min(screen.width, screen.height) < 600;
  if (/iPad|Tablet/i.test(ua) || (touch && !small)) return 'tablet';
  if (touch || /Mobi|Android|iPhone/i.test(ua)) return 'phone';
  return 'laptop';
};
socket.on('connect', () => socket.emit('client:device', { device: deviceKind() }));

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

// Feature modules add their own cards and dialogs, so the HTML pages stay small.
export function mount(html, before = '#atmo') {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const el = t.content.firstElementChild;
  const anchor = before && document.querySelector(before);
  if (anchor) anchor.before(el); else document.body.append(el);
  return el;
}
// Libraries (creatures, spells) are fetched over HTTP and refetched when their version in the state changes.
const libs = {};
export function library(name, { headers } = {}) {
  if (libs[name]) return libs[name];
  const lib = (libs[name] = { items: [], version: 0, subs: [], byId: (id) => lib.items.find((x) => x.id === id), onChange: (fn) => { lib.subs.push(fn); if (lib.version) fn(lib.items); } });
  onState(async (s) => {
    const v = s.lib?.[name];
    if (!v || v === lib.version || lib.loading === v) return;
    lib.loading = v;
    try {
      const res = await fetch(`/api/${name}`, { headers: typeof headers === 'function' ? headers() : headers });
      if (!res.ok) return;
      lib.items = await res.json();
      lib.version = v;
      for (const fn of lib.subs) fn(lib.items);
    } finally { lib.loading = null; }
  });
  return lib;
}
