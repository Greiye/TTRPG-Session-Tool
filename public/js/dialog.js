// One dialog shell (Nov 24): the frame, close animation and Escape handling that every pop-up shares.
//   sheetPop()     a phone pop-up: a dark scrim with a parchment sheet on it (.pop-scrim > .pop-sheet)
//   closable()     a <dialog> on the DM page: closes with an animation, from its ✕ and from Escape
// Add new pop-ups here instead of building another frame by hand.
const EXIT_MS = 220; // a little over --t-fast, the length of every .closing animation

// Returns { el, sheet, close }. `dismiss` is what Escape (and, with `backdrop`, a tap beside the sheet) does;
// leave it out for a pop-up the player must answer.
export function sheetPop({ cls = '', sheetCls = '', label, html = '', onClick, dismiss, backdrop = false }) {
  const el = document.createElement('div');
  el.className = `pop-scrim ${cls}`.trim();
  const sheet = document.createElement('div');
  sheet.className = `pop-sheet ${sheetCls}`.trim();
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', label);
  sheet.innerHTML = html;
  el.append(sheet);
  if (onClick) el.addEventListener('click', onClick);
  if (backdrop && dismiss) el.addEventListener('click', (e) => { if (e.target === el) dismiss(); });
  const key = (e) => { if (e.key === 'Escape' && dismiss && !document.querySelector('dialog[open]')) { e.preventDefault(); dismiss(); } };
  document.addEventListener('keydown', key);
  document.body.append(el);
  let gone = false;
  return {
    el, sheet,
    close({ now = false } = {}) {
      if (gone) return;
      gone = true;
      document.removeEventListener('keydown', key);
      if (now) { el.remove(); return; }
      el.classList.add('closing');
      setTimeout(() => el.remove(), EXIT_MS);
    },
  };
}

// `mayClose` can refuse (unsaved changes). Returns close().
export function closable(dlg, { button, mayClose = () => true } = {}) {
  let closing = false;
  const close = () => {
    if (closing || !dlg.open || !mayClose()) return;
    closing = true;
    dlg.classList.add('closing');
    setTimeout(() => { closing = false; dlg.classList.remove('closing'); dlg.close(); }, EXIT_MS);
  };
  button?.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  return close;
}
