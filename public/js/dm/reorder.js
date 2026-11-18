// Re-orderable windows (Mike, Nov 17): the cards of a sidebar tab (Roll call, Roll dice, Hidden details, ...) can
// be dragged into a new order once unlocked. The lock is the 🔒 button under the tab row and Settings › Window
// order (the same local setting, `reorder`). The order is saved per tab on this laptop.
// Nov 18 (Mike: "Window Mover not working"): dragstart looked the card up with closest(':scope > .card'), which
// never matches (:scope is the dragged element itself), so no drag ever started. The tabs themselves (Rolls,
// Battle Window, Scene, ...) are movable too: unlocked, a tab button drags to a new place in its group.
const KEY = 'dmCardOrder';
let order = {};
try { order = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { order = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* private mode */ } };
const col = document.getElementById('toolsCol');
const btn = document.getElementById('reorderBtn');
const hint = document.getElementById('reorderHint');
const unlocked = () => window.Settings?.local().reorder === 'on';
// A card's name in the saved order: its id, else its fold key (fold.js), else its title.
const keyOf = (c) => c.id || c.dataset.foldKey || c.querySelector(':scope > h3')?.textContent.trim().slice(0, 40) || '';
const cardsOf = (tab) => [...col.querySelectorAll(`:scope > .card[data-tab="${CSS.escape(tab)}"]`)];

// Put one tab's cards in the saved order, in the slots they already hold (other tabs' cards stay where they are).
function applyTab(tab) {
  const want = order[tab];
  if (!want?.length) return;
  const cards = cardsOf(tab);
  const rank = (c) => { const i = want.indexOf(keyOf(c)); return i < 0 ? want.length + cards.indexOf(c) : i; };
  const sorted = [...cards].sort((a, b) => rank(a) - rank(b));
  if (sorted.every((c, i) => c === cards[i])) return;
  const marks = cards.map((c) => { const m = document.createComment('slot'); c.before(m); return m; });
  marks.forEach((m, i) => { m.replaceWith(sorted[i]); });
}
function applyAll() {
  for (const tab of Object.keys(order)) applyTab(tab);
}

function setLockUi() {
  const on = unlocked();
  document.body.classList.toggle('reorder-on', on);
  col.querySelectorAll(':scope > .card[data-tab]').forEach((c) => { c.draggable = on; });
  tabList?.querySelectorAll('[data-stab]').forEach((b) => { b.draggable = on; });
  if (btn) {
    btn.textContent = on ? '🔓 Windows unlocked' : '🔒 Windows locked';
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  if (hint) hint.hidden = !on;
}
btn?.addEventListener('click', () => window.Settings?.setLocal('reorder', unlocked() ? 'off' : 'on'));
window.addEventListener('settings:local', setLockUi);

// Drag and drop between the cards of one tab.
let dragged = null;
col.addEventListener('dragstart', (e) => {
  const c = e.target.closest?.('.card[data-tab]');
  if (!unlocked() || !c || c.parentElement !== col || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  dragged = c;
  c.classList.add('reorder-drag');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', keyOf(c)); } catch { /* old browsers */ }
});
col.addEventListener('dragover', (e) => {
  if (!dragged) return;
  const over = e.target.closest?.('.card[data-tab]');
  if (!over || over === dragged || over.parentElement !== col || over.dataset.tab !== dragged.dataset.tab) return;
  e.preventDefault();
  const r = over.getBoundingClientRect();
  if (e.clientY < r.top + r.height / 2) over.before(dragged); else over.after(dragged);
});
col.addEventListener('drop', (e) => { if (dragged) e.preventDefault(); });
col.addEventListener('dragend', () => {
  if (!dragged) return;
  const tab = dragged.dataset.tab;
  dragged.classList.remove('reorder-drag');
  window.Anim?.play?.(dragged, 'pop', null);
  dragged = null;
  order[tab] = cardsOf(tab).map(keyOf);
  save();
});

// The tabs are windows too (Mike, Nov 18): unlocked, drag a tab button to a new place in its group.
const TAB_KEY = 'dmTabOrder';
const tabList = document.getElementById('sideTabs');
let tabOrder = {};
try { tabOrder = JSON.parse(localStorage.getItem(TAB_KEY) || '{}') || {}; } catch { tabOrder = {}; }
const tabsOf = (g) => [...g.querySelectorAll(':scope > [data-stab]')];
function applyTabs() {
  tabList?.querySelectorAll('.tab-group').forEach((g) => {
    const want = tabOrder[g.dataset.group];
    if (!want?.length) return;
    const tabs = tabsOf(g);
    const rank = (b) => { const i = want.indexOf(b.dataset.stab); return i < 0 ? want.length + tabs.indexOf(b) : i; };
    const sorted = [...tabs].sort((a, b) => rank(a) - rank(b));
    if (sorted.every((b, i) => b === tabs[i])) return;
    const marks = tabs.map((b) => { const m = document.createComment('tab'); b.before(m); return m; });
    marks.forEach((m, i) => m.replaceWith(sorted[i]));
  });
}
let draggedTab = null;
tabList?.addEventListener('dragstart', (e) => {
  const b = e.target.closest?.('[data-stab]');
  if (!unlocked() || !b) return;
  draggedTab = b;
  b.classList.add('reorder-drag');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', b.dataset.stab); } catch { /* old browsers */ }
});
tabList?.addEventListener('dragover', (e) => {
  if (!draggedTab) return;
  const over = e.target.closest?.('[data-stab]');
  if (!over || over === draggedTab || over.parentElement !== draggedTab.parentElement) return;
  e.preventDefault();
  const r = over.getBoundingClientRect();
  const before = r.width > r.height * 1.5 ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2 || e.clientX < r.left + r.width / 2;
  if (before) over.before(draggedTab); else over.after(draggedTab);
});
tabList?.addEventListener('drop', (e) => { if (draggedTab) e.preventDefault(); });
tabList?.addEventListener('dragend', () => {
  if (!draggedTab) return;
  const g = draggedTab.parentElement;
  draggedTab.classList.remove('reorder-drag');
  window.Anim?.play?.(draggedTab, 'pop', null);
  draggedTab = null;
  tabOrder[g.dataset.group] = tabsOf(g).map((b) => b.dataset.stab);
  try { localStorage.setItem(TAB_KEY, JSON.stringify(tabOrder)); } catch { /* private mode */ }
});
applyTabs();

// Cards mounted later by other modules get the saved order (and the drag switch) too.
let queued = false;
new MutationObserver(() => {
  if (queued || dragged) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; applyAll(); setLockUi(); });
}).observe(col, { childList: true });
applyAll();
setLockUi();
// For tests and other modules: window.dmCardOrder.move('rolls', ['key', ...]) sets an order.
window.dmCardOrder = {
  move: (tab, keys) => { order[tab] = keys; save(); applyTab(tab); },
  keys: (tab) => cardsOf(tab).map(keyOf),
  moveTabs: (group, ids) => { tabOrder[group] = ids; applyTabs(); },
  tabs: (group) => tabsOf(tabList.querySelector(`[data-group="${group}"]`)).map((b) => b.dataset.stab),
};
