// Press, hold and drag (Mike, Nov 21): hold a chip for a moment, it lifts, then drag it onto a drop zone and let go.
// A quick tap is still a click, and moving before the hold is up scrolls as usual. With a mouse, dragging
// starts as soon as the pointer moves (Nov 28).
//   holdDrag(root, { item: '[data-drag]', zone: '[data-drop]', onDrop(el, zoneEl) })
// The lifted chip is a copy that follows the pointer; the zone under it glows (.drop-over).
const HOLD_MS = 280;
const SLOP = 8;

export function holdDrag(root, { item = '[data-drag]', zone = '[data-drop]', onDrop }) {
  let press = null; // { el, x, y, timer, ghost, over, id }
  const zoneAt = (x, y) => document.elementFromPoint(x, y)?.closest(zone) || null;
  const clear = () => {
    if (!press) return;
    clearTimeout(press.timer);
    press.el.classList.remove('lifting', 'lifted');
    press.over?.classList.remove('drop-over');
    press.ghost?.remove();
    document.body.classList.remove('dragging-chip');
    press = null;
  };
  const lift = () => {
    if (!press || press.ghost) return;
    clearTimeout(press.timer);
    const { el } = press;
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.classList.add('drag-ghost');
    g.removeAttribute('id');
    g.style.width = `${r.width}px`;
    g.style.left = `${r.left}px`;
    g.style.top = `${r.top}px`;
    press.dx = press.x - r.left; press.dy = press.y - r.top;
    document.body.appendChild(g);
    press.ghost = g;
    el.classList.remove('lifting');
    el.classList.add('lifted');
    document.body.classList.add('dragging-chip');
    try { el.setPointerCapture(press.id); } catch { /* pointer already gone */ }
    navigator.vibrate?.(20);
  };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(item);
    if (!el || e.button > 0 || el.disabled) return;
    clear();
    press = { el, x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null, over: null, mouse: e.pointerType === 'mouse' };
    el.classList.add('lifting');
    press.timer = setTimeout(lift, HOLD_MS); // a mouse also lifts on its first move, before the hold is up
  });
  // A portrait image inside a chip would start the browser's own image drag and cancel ours.
  root.addEventListener('dragstart', (e) => { if (e.target.closest?.(item)) e.preventDefault(); });
  document.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.ghost) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= SLOP) return;
      // A mouse drags at once (Nov 28); on touch, moving before the hold is up scrolls instead.
      if (!press.mouse) { clear(); return; }
      lift();
    }
    e.preventDefault();
    press.ghost.style.left = `${e.clientX - press.dx}px`;
    press.ghost.style.top = `${e.clientY - press.dy}px`;
    const z = zoneAt(e.clientX, e.clientY);
    if (z !== press.over) { press.over?.classList.remove('drop-over'); z?.classList.add('drop-over'); press.over = z; }
  }, { passive: false });
  const end = (e, cancel) => {
    if (!press || e.pointerId !== press.id) return;
    const { el, ghost } = press;
    const z = ghost && !cancel ? zoneAt(e.clientX, e.clientY) : null;
    clear();
    if (ghost) {
      // The click that follows a drag must not also toggle the chip.
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 50);
    }
    if (z) onDrop(el, z);
  };
  document.addEventListener('pointerup', (e) => end(e, false));
  document.addEventListener('pointercancel', (e) => end(e, true));
  // A long press on touch would open the browser's menu over the lifted chip; a mouse right-click still gets
  // the DM right-click menu (public/js/dm/menus.js).
  root.addEventListener('contextmenu', (e) => { if (e.target.closest(item) && (press?.ghost || (e.pointerType && e.pointerType !== 'mouse'))) e.preventDefault(); });
}
