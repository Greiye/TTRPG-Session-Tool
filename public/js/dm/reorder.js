// Re-orderable windows (Mike, Nov 17): the cards of a sidebar tab (Roll call, Roll dice, Hidden details, ...) can
// be dragged into a new order once unlocked. The lock is the 🔒 button under the tab row and Settings › Window
// order (the same local setting, `reorder`). The order is saved per tab on this laptop.
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
  const c = e.target.closest?.(':scope > .card[data-tab]');
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
window.dmCardOrder = { move: (tab, keys) => { order[tab] = keys; save(); applyTab(tab); }, keys: (tab) => cardsOf(tab).map(keyOf) };
