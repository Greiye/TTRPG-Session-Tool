// Tabs inside the phone's game screen (Play, Sheet, and later Inbox and Map). Each tab owns one
// container element (#tabPlay, #tabSheet, ...).
import { $ } from '../client.js';

const tabs = [];
const subs = [];
let active = 'play';
const cap = (id) => id[0].toUpperCase() + id.slice(1);

function draw() {
  $('#tabs').innerHTML = tabs.map((t) => `<button class="${t.id === active ? 'on' : ''}" data-tab="${t.id}">${t.label}${t.badge ? `<i>${t.badge}</i>` : ''}</button>`).join('');
  for (const t of tabs) { const el = $(`#tab${cap(t.id)}`); if (el) el.hidden = t.id !== active; }
}
export const tab = () => active;
export const onTab = (fn) => subs.push(fn);
export function addTab(id, label) {
  if (!$(`#tab${cap(id)}`)) { const d = document.createElement('div'); d.id = `tab${cap(id)}`; d.className = 'tab-body'; d.hidden = true; $('#tabPlay').before(d); }
  tabs.push({ id, label, badge: 0 });
  draw();
}
export function setBadge(id, n) {
  const cur = tabs.find((x) => x.id === id);
  if (cur && cur.badge === n) return;
  const t = tabs.find((x) => x.id === id);
  if (t && t.badge !== n) { t.badge = n; draw(); }
}
export function showTab(id) {
  if (!tabs.some((t) => t.id === id)) return;
  active = id;
  if (id === 'inbox') { const t = tabs.find((x) => x.id === 'inbox'); if (t) t.badge = 0; }
  draw();
  for (const fn of subs) fn(id);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
addTab('play', '🎲 Play');
