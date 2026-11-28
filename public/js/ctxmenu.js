// One right-click menu for the whole DM screen (Mike, Nov 16: "make everything like the combat window").
// It looks and behaves like the 3D battle map's unit menu: a header with the thing's name and key numbers,
// sections of buttons, rows of small buttons for repeated taps, and a two-click arm on anything destructive.
// Cascading (Mike, Nov 28): an item with `sub` opens a side menu on hover, click or Right arrow, to any depth.
//
//   openMenu({ x, y, title, sub, sections, rebuild })
//     sections: [{ h: 'Hit points', row: true, items: [item, …] }]
//     item:     { label, run(), keep, on, danger, arm: 'Click again to remove', disabled, title, tone: 'neg' | 'pos',
//                 sub: { title, sections } | () => ({ title, sections }) }
//               keep: true leaves the menu open (HP taps, condition toggles). arm: the first click arms it.
//               sub: a cascading side menu. A function is called each time it opens or the menu refreshes.
//     rebuild:  () => spec | null. Called by refreshMenu() after a state change so numbers stay live; null closes.
//   closeMenu(), refreshMenu(), isOpen()
//   contextMenus(root, providers): providers are [{ sel, build(el, event) => spec | null }], tried in order
//     against the right-clicked element and its ancestors. Shift + right-click and text fields keep the
//     browser's own menu.
let levels = []; // [{ el, spec, key }]: the root menu, then each open side menu; key is the item that opened it
let returnFocus = null;
let hoverTimer = null;
const HOVER_MS = 140;

const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
const subOf = (it) => (typeof it.sub === 'function' ? it.sub() : it.sub) || null;

function html(spec) {
  const head = spec.title || spec.sub ? `<header><b>${esc(spec.title || '')}</b>${spec.sub && typeof spec.sub === 'string' ? `<small>${esc(spec.sub)}</small>` : ''}</header>` : '';
  const body = (spec.sections || []).filter((s) => s && s.items?.some(Boolean)).map((s, si) => {
    const items = s.items.filter(Boolean).map((it, ii) => {
      const cls = [it.on ? 'on' : '', it.danger ? 'danger' : '', it.tone || '', it.sub ? 'has-sub' : ''].filter(Boolean).join(' ');
      const role = it.on !== undefined ? 'menuitemcheckbox' : 'menuitem';
      return `<button type="button" role="${role}" data-i="${si}.${ii}" class="${cls}" ${it.on !== undefined ? `aria-checked="${!!it.on}"` : ''} ${it.sub ? 'aria-haspopup="menu" aria-expanded="false"' : ''} ${it.disabled ? 'disabled' : ''} ${it.title ? `title="${esc(it.title)}"` : ''}><span>${esc(it.label)}</span>${it.sub ? '<i class="ctx-caret" aria-hidden="true">▸</i>' : ''}</button>`;
    }).join('');
    return `<section>${s.h ? `<h5>${esc(s.h)}</h5>` : ''}${s.row ? `<div class="ctx-row ${s.wrap === false ? '' : 'wrap'}">${items}</div>` : items}</section>`;
  }).join('');
  return head + (body || '<section><p class="ctx-empty">Nothing to do here.</p></section>');
}

const itemAt = (spec, key) => { const [s, i] = key.split('.').map(Number); return spec?.sections?.filter((x) => x && x.items?.some(Boolean))[s]?.items.filter(Boolean)[i]; };
const levelOf = (node) => levels.findIndex((l) => l.el.contains(node));

export const isOpen = () => levels.length > 0;

function removeEl(m) { m.classList.add('closing'); setTimeout(() => m.remove(), 140); }

// Close every side menu deeper than `depth` (0 keeps only the root open).
function closeFrom(depth) {
  clearTimeout(hoverTimer);
  while (levels.length > depth + 1) {
    const l = levels.pop();
    removeEl(l.el);
    const parent = levels[levels.length - 1]?.el.querySelector(`button[data-i="${l.key}"]`);
    parent?.classList.remove('sub-open');
    parent?.setAttribute('aria-expanded', 'false');
  }
}

export function closeMenu() {
  if (!levels.length) return;
  clearTimeout(hoverTimer);
  const els = levels.map((l) => l.el);
  const focusWasIn = els.some((m) => m.contains(document.activeElement));
  levels = [];
  els.forEach(removeEl);
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('keydown', keys, true);
  window.removeEventListener('blur', closeMenu);
  window.removeEventListener('resize', closeMenu);
  document.removeEventListener('scroll', onScroll, true);
  if (returnFocus?.isConnected && focusWasIn) returnFocus.focus?.({ preventScroll: true });
  returnFocus = null;
}
const outside = (e) => { if (levels.length && levelOf(e.target) < 0) closeMenu(); };
const onScroll = (e) => { if (levels.length && levelOf(e.target) < 0) closeMenu(); };
function keys(e) {
  if (!levels.length) return;
  keyAt = Date.now();
  const at = Math.max(0, levelOf(document.activeElement));
  const lvl = levels[at] || levels[0];
  const focused = document.activeElement?.closest?.('button[data-i]');
  if (e.key === 'Escape' || (e.key === 'ArrowLeft' && at > 0)) {
    e.preventDefault(); e.stopPropagation();
    if (at === 0 && e.key === 'Escape' && levels.length === 1) return closeMenu();
    const depth = e.key === 'Escape' ? levels.length - 2 : at - 1;
    const key = levels[depth + 1]?.key;
    closeFrom(depth);
    levels[depth]?.el.querySelector(`button[data-i="${key}"]`)?.focus({ preventScroll: true });
    return;
  }
  if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && focused?.classList.contains('has-sub')) {
    e.preventDefault(); e.stopPropagation();
    openSub(at, focused, { focus: true });
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const bs = [...lvl.el.querySelectorAll('button:not([disabled])')];
  if (!bs.length) return;
  const i = bs.indexOf(document.activeElement);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : e.key === 'ArrowDown' ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length;
  bs[n].focus();
}

function place(m, x, y) {
  const r = m.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, innerWidth - r.width - 8));
  const top = Math.max(8, Math.min(y, innerHeight - r.height - 8));
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  m.style.transformOrigin = `${x - left}px ${y - top}px`;
}

// A side menu sits against the right edge of the item that opened it, or flips to the left when there is no
// room; it slides up when it would run off the bottom.
function placeSub(m, btn) {
  const b = btn.getBoundingClientRect();
  const r = m.getBoundingClientRect();
  const parent = btn.closest('.ctx-menu').getBoundingClientRect();
  const right = parent.right - 3;
  const flip = right + r.width > innerWidth - 8;
  const left = flip ? Math.max(8, parent.left - r.width + 3) : right;
  const top = Math.max(8, Math.min(b.top - 7, innerHeight - r.height - 8));
  m.classList.toggle('flip', flip);
  m.style.left = `${left}px`;
  m.style.top = `${top}px`;
  m.style.transformOrigin = `${flip ? r.width : 0}px ${b.top - top + b.height / 2}px`;
}

function makeEl(spec, label) {
  const m = document.createElement('div');
  m.className = 'ctx-menu';
  m.setAttribute('role', 'menu');
  if (label) m.setAttribute('aria-label', label);
  m.innerHTML = html(spec);
  m.addEventListener('contextmenu', (e) => e.preventDefault());
  m.addEventListener('click', onClick);
  m.addEventListener('pointerover', onHover);
  document.body.append(m);
  return m;
}

function onClick(e) {
  const b = e.target.closest('button[data-i]');
  const at = levelOf(b);
  if (!b || at < 0) return;
  const it = itemAt(levels[at].spec, b.dataset.i);
  if (!it || it.disabled) return;
  if (it.sub) {
    if (levels[at + 1]?.key === b.dataset.i) closeFrom(at);
    else openSub(at, b, { focus: e.detail === 0 });
    return;
  }
  if (it.arm && !b.classList.contains('armed')) { b.classList.add('armed'); b.querySelector('span').textContent = it.arm; return; }
  const keep = it.keep;
  try { it.run?.(b); } catch (err) { console.error(err); }
  if (!keep) closeMenu();
}

// Hovering an item with a side menu opens it after a short pause; hovering a plain item closes deeper menus.
let keyAt = 0; // last arrow or Enter key in the menu: hover that is not a real pointer move is ignored right after
function onHover(e) {
  if (e.pointerType === 'touch' || Date.now() - keyAt < 600) return;
  const b = e.target.closest('button[data-i]');
  const at = levelOf(e.target);
  if (!b || at < 0) return;
  clearTimeout(hoverTimer);
  const it = itemAt(levels[at].spec, b.dataset.i);
  if (levels[at + 1]?.key === b.dataset.i) return; // already open
  hoverTimer = setTimeout(() => {
    if (!b.isConnected || levelOf(b) !== at) return;
    if (it?.sub && !it.disabled) openSub(at, b);
    // A side menu opened from the keyboard stays open while focus is in it, even if the pointer rests on the menu.
    else if (levels.length > at + 1 && levelOf(document.activeElement) <= at) closeFrom(at);
  }, HOVER_MS);
}

function openSub(at, btn, { focus = false } = {}) {
  const it = itemAt(levels[at]?.spec, btn.dataset.i);
  const spec = it && !it.disabled && subOf(it);
  closeFrom(at);
  if (!spec) return null;
  levels[at].el.querySelectorAll('.sub-open').forEach((x) => { x.classList.remove('sub-open'); x.setAttribute('aria-expanded', 'false'); });
  btn.classList.add('sub-open');
  btn.setAttribute('aria-expanded', 'true');
  const m = makeEl(spec, it.label);
  m.classList.add('ctx-sub');
  levels.push({ el: m, spec, key: btn.dataset.i });
  placeSub(m, btn);
  if (focus) m.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  return m;
}

export function openMenu(spec) {
  closeMenu();
  if (!spec) return null;
  returnFocus = document.activeElement;
  const m = makeEl(spec, spec.title);
  levels = [{ el: m, spec, key: null }];
  place(m, spec.x ?? 0, spec.y ?? 0);
  // Listen from the next tick so the event that opened the menu does not close it.
  setTimeout(() => {
    if (!levels.length) return;
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('scroll', onScroll, true);
  });
  if (spec.focus) m.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  return m;
}

// Redraw the open menu from its rebuild() so HP, conditions and toggles stay current, side menus included. A
// button that is armed for a second click keeps the menu as it is, so a state change never disarms it under
// the pointer.
export function refreshMenu() {
  const root = levels[0];
  if (!root || levels.some((l) => l.el.querySelector('.armed'))) return;
  const focused = document.activeElement?.dataset?.i;
  const focusAt = levelOf(document.activeElement);
  if (root.spec.rebuild) {
    const next = root.spec.rebuild();
    if (!next) return closeMenu();
    root.spec = { ...next, rebuild: root.spec.rebuild, x: root.spec.x, y: root.spec.y };
    root.el.innerHTML = html(root.spec);
  } else if (levels.length === 1) return; // a menu without rebuild() stays as it is; its side menus still refresh
  for (let i = 1; i < levels.length; i++) {
    const l = levels[i];
    const it = itemAt(levels[i - 1].spec, l.key);
    const spec = it?.sub && !it.disabled && subOf(it);
    if (!spec) { closeFrom(i - 1); break; }
    l.spec = spec;
    l.el.innerHTML = html(spec);
    const opener = levels[i - 1].el.querySelector(`button[data-i="${l.key}"]`);
    opener?.classList.add('sub-open');
    opener?.setAttribute('aria-expanded', 'true');
  }
  if (focused && focusAt >= 0) levels[Math.min(focusAt, levels.length - 1)]?.el.querySelector(`button[data-i="${focused}"]`)?.focus({ preventScroll: true });
}

const NATIVE = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]), textarea, select, [contenteditable=""], [contenteditable=true]';

export function contextMenus(root, providers) {
  root.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || e.shiftKey) return; // the 3D map has its own menu; Shift keeps the browser's
    const t = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!t || t.closest('.ctx-menu') || t.closest(NATIVE)) return;
    if (window.getSelection?.().toString() && t.closest('p, li, .fe')) return; // copying selected text
    for (const p of providers) {
      const el = t.closest(p.sel);
      if (!el || !root.contains(el)) continue;
      let spec;
      try { spec = p.build(el, e); } catch (err) { console.error(err); spec = null; }
      if (!spec) continue;
      e.preventDefault();
      // A menu key or Shift+F10 press has no pointer position: open by the element instead.
      let { clientX: x, clientY: y } = e;
      if (!x && !y) { const r = el.getBoundingClientRect(); x = r.left + 12; y = r.top + Math.min(r.height, 24); }
      el.classList.add('ctx-target');
      setTimeout(() => el.classList.remove('ctx-target'), 600);
      openMenu({ ...spec, x, y, focus: !e.clientX && !e.clientY });
      return;
    }
  });
}
