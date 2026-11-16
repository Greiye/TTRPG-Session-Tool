// Keep the laptop screen and the TV awake during a session (studio review, Nov 16). The DM page and the
// TV page ask the browser for a screen wake lock, so a long speech or a quiet scene does not dim or
// blank the TV. The browser drops the lock when the tab is hidden; it is taken again when it comes back.
// Needs a secure page (localhost or HTTPS); without the Wake Lock API this does nothing.
(() => {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const take = async () => {
    if (lock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { lock = null; } // refused (battery saver, no gesture yet): try again on the next click
  };
  take();
  document.addEventListener('visibilitychange', take);
  document.addEventListener('pointerdown', take, { passive: true });
})();
