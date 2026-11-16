// Tabs inside the phone's game screen. Each top tab owns one container (#tabPlay, #tabSheet, ...).
// A top tab can hold sections (Journal: Inbox, Map, Notes; Misc: Logs, World, Legends, Bond) shown as
// a chip bar inside it; each section owns its own container (#tabInbox, #tabMap, ...).
// Top tabs show their symbol only (Mike, Nov 16); the word is the button's title and aria-label.
// tab() returns the open section when the open top tab has sections, so feature modules check their own id.
import { $ } from '../client.js';

const ORDER = ['play', 'sheet', 'inventory', 'journal', 'misc', 'downtime', 'shop'];
const tabs = []; // { id, label, badge, sections: [{ id, label, badge }], sec }
const hiddenTabs = new Set(['shop']); // tabs not shown on this phone: Downtime outside camp; the old Shops tab never (shops are a DM pop-up)
const subs = [];
let active = 'play';
const cap = (id) => id[0].toUpperCase() + id.slice(1);
const parentOf = (id) => tabs.find((t) => t.sections.some((s) => s.id === id));
const badgeOf = (t) => t.badge + t.sections.reduce((n, s) => n + s.badge, 0);

function draw() {
  if (active !== 'play' && hiddenTabs.has(active)) active = 'play';
  const shown = tabs.filter((t) => !hiddenTabs.has(t.id)).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  $('#tabs').innerHTML = shown.map((t) => { const n = badgeOf(t); const [icon, ...words] = t.label.split(' '); const name = words.join(' ') || icon; return `<button class="${t.id === active ? 'on' : ''}" data-tab="${t.id}" title="${name}" aria-label="${name}"><span class="tab-ico" aria-hidden="true">${icon}</span>${n ? `<i>${n}</i>` : ''}</button>`; }).join('');
  for (const t of tabs) {
    const el = $(`#tab${cap(t.id)}`);
    if (!el) continue;
    el.hidden = t.id !== active; // style.css fades a tab in when it appears
    if (!t.sections.length) continue;
    el.querySelector(':scope > .subtabs').innerHTML = t.sections.map((s) => `<button class="chip ${s.id === t.sec ? 'on' : ''}" data-tab="${s.id}" aria-pressed="${s.id === t.sec}">${s.label}${s.badge ? `<i>${s.badge}</i>` : ''}</button>`).join('');
    for (const s of t.sections) { const se = $(`#tab${cap(s.id)}`); if (se) se.hidden = s.id !== t.sec; }
  }
}
export const tab = () => { const t = tabs.find((x) => x.id === active); return t?.sections.length ? t.sec : active; };
// Show or hide a top tab on this phone. A hidden tab's content stays hidden too.
export function setTabOn(id, on) {
  const was = hiddenTabs.has(id);
  if (on && was) hiddenTabs.delete(id);
  if (!on && !was) hiddenTabs.add(id);
  if (on !== !was) draw();
}
export const onTab = (fn) => subs.push(fn);
function container(id, parent, cls) {
  let d = $(`#tab${cap(id)}`);
  if (!d) { d = document.createElement('div'); d.id = `tab${cap(id)}`; d.className = cls; d.hidden = true; }
  if (parent) parent.append(d); else if (!d.parentNode) $('#tabPlay').before(d);
  return d;
}
export function addTab(id, label) {
  if (tabs.some((t) => t.id === id)) return;
  container(id, null, 'tab-body');
  tabs.push({ id, label, badge: 0, sections: [], sec: null });
  draw();
}
// A section inside a top tab (created on first use). The first section added opens by default.
export function addSection(parentId, id, label) {
  const t = tabs.find((x) => x.id === parentId);
  if (!t || t.sections.some((s) => s.id === id)) return;
  const host = $(`#tab${cap(parentId)}`);
  if (!host.querySelector(':scope > .subtabs')) { const bar = document.createElement('nav'); bar.className = 'chips subtabs'; bar.setAttribute('aria-label', `${label} sections`); host.prepend(bar); }
  container(id, host, 'tab-sec');
  t.sections.push({ id, label, badge: 0 });
  t.sec ??= id;
  draw();
}
export function setBadge(id, n) {
  const t = tabs.find((x) => x.id === id) || parentOf(id)?.sections.find((s) => s.id === id);
  if (t && t.badge !== n) { t.badge = n; draw(); }
}
export function showTab(id) {
  const parent = parentOf(id);
  const top = parent || tabs.find((t) => t.id === id);
  if (!top) return;
  active = top.id;
  if (parent) parent.sec = id;
  if (id === 'inbox' && parent) parent.sections.find((s) => s.id === 'inbox').badge = 0;
  draw();
  for (const fn of subs) fn(tab());
}
$('#gameView').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && (b.closest('#tabs') || b.closest('.subtabs'))) showTab(b.dataset.tab);
});
addTab('play', '🎲 Play');
addTab('journal', '📓 Journal');
addTab('misc', '✦ Misc');
