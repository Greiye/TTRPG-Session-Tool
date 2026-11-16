// One right-click menu for the whole DM screen (Mike, Nov 16: "make everything like the combat window").
// It looks and behaves like the 3D battle map's unit menu: a header with the thing's name and key numbers,
// sections of buttons, rows of small buttons for repeated taps, and a two-click arm on anything destructive.
//
//   openMenu({ x, y, title, sub, sections, rebuild })
//     sections: [{ h: 'Hit points', row: true, items: [item, …] }]
//     item:     { label, run(), keep, on, danger, arm: 'Click again to remove', disabled, title, tone: 'neg' | 'pos' }
//               keep: true leaves the menu open (HP taps, condition toggles). arm: the first click arms it.
//     rebuild:  () => spec | null. Called by refreshMenu() after a state change so numbers stay live; null closes.
//   closeMenu(), refreshMenu(), isOpen()
//   contextMenus(root, providers): providers are [{ sel, build(el, event) => spec | null }], tried in order
//     against the right-clicked element and its ancestors. Shift + right-click and text fields keep the
//     browser's own menu.
let menu = null;
let current = null; // the spec the menu shows
let returnFocus = null;

const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)

function html(spec) {
  const head = spec.title || spec.sub ? `<header><b>${esc(spec.title || '')}</b>${spec.sub ? `<small>${esc(spec.sub)}</small>` : ''}</header>` : '';
  const body = (spec.sections || []).filter((s) => s && s.items?.some(Boolean)).map((s, si) => {
    const items = s.items.filter(Boolean).map((it, ii) => {
      const cls = [it.on ? 'on' : '', it.danger ? 'danger' : '', it.tone || ''].filter(Boolean).join(' ');
      return `<button type="button" role="${it.on !== undefined ? 'menuitemcheckbox' : 'menuitem'}" data-i="${si}.${ii}" class="${cls}" ${it.on !== undefined ? `aria-checked="${!!it.on}"` : ''} ${it.disabled ? 'disabled' : ''} ${it.title ? `title="${esc(it.title)}"` : ''}>${esc(it.label)}</button>`;
    }).join('');
    return `<section>${s.h ? `<h5>${esc(s.h)}</h5>` : ''}${s.row ? `<div class="ctx-row ${s.wrap === false ? '' : 'wrap'}">${items}</div>` : items}</section>`;
  }).join('');
  return head + (body || '<section><p class="ctx-empty">Nothing to do here.</p></section>');
}

const itemAt = (spec, key) => { const [s, i] = key.split('.').map(Number); return spec.sections.filter((x) => x && x.items?.some(Boolean))[s]?.items.filter(Boolean)[i]; };

export const isOpen = () => !!menu;

export function closeMenu() {
  if (!menu) return;
  const m = menu;
  menu = current = null;
  m.classList.add('closing');
  setTimeout(() => m.remove(), 140);
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('keydown', keys, true);
  window.removeEventListener('blur', closeMenu);
  window.removeEventListener('resize', closeMenu);
  document.removeEventListener('scroll', onScroll, true);
  if (returnFocus?.isConnected && m.contains(document.activeElement)) returnFocus.focus?.({ preventScroll: true });
  returnFocus = null;
}
const outside = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };
const onScroll = (e) => { if (menu && !menu.contains(e.target)) closeMenu(); };
function keys(e) {
  if (!menu) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const bs = [...menu.querySelectorAll('button:not([disabled])')];
  if (!bs.length) return;
  const i = bs.indexOf(document.activeElement);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : e.key === 'ArrowDown' ? (i + 1) % bs.length : (i - 1 + bs.length) % bs.length;
  bs[n].focus();
}

function place(x, y) {
  const r = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, innerWidth - r.width - 8));
  const top = Math.max(8, Math.min(y, innerHeight - r.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.transformOrigin = `${x - left}px ${y - top}px`;
}

export function openMenu(spec) {
  closeMenu();
  if (!spec) return null;
  returnFocus = document.activeElement;
  current = spec;
  menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.setAttribute('role', 'menu');
  if (spec.title) menu.setAttribute('aria-label', spec.title);
  menu.innerHTML = html(spec);
  document.body.append(menu);
  place(spec.x ?? 0, spec.y ?? 0);
  menu.addEventListener('contextmenu', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b || !current) return;
    const it = itemAt(current, b.dataset.i);
    if (!it || it.disabled) return;
    if (it.arm && !b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = it.arm; return; }
    const keep = it.keep;
    try { it.run?.(b); } catch (err) { console.error(err); }
    if (!keep) closeMenu();
  });
  // Listen from the next tick so the event that opened the menu does not close it.
  setTimeout(() => {
    if (!menu) return;
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', keys, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    document.addEventListener('scroll', onScroll, true);
  });
  if (spec.focus) menu.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
  return menu;
}

// Redraw the open menu from its rebuild() so HP, conditions and toggles stay current. A button that is armed
// for a second click keeps the menu as it is, so a state change never disarms it under the pointer.
export function refreshMenu() {
  if (!menu || !current?.rebuild || menu.querySelector('.armed')) return;
  const next = current.rebuild();
  if (!next) return closeMenu();
  const focused = document.activeElement?.dataset?.i;
  current = { ...next, rebuild: current.rebuild, x: current.x, y: current.y };
  menu.innerHTML = html(current);
  if (focused) menu.querySelector(`button[data-i="${focused}"]`)?.focus({ preventScroll: true });
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
