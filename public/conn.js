// Connection pill: when a page loses the laptop (Wi-Fi drop, laptop asleep, server restart) a small
// "Reconnecting" pill slides in, so nobody acts on a frozen screen. It waits a moment first, so a
// quick blip shows nothing, and slides away once Socket.IO is back (it reconnects on its own).
(function () {
  const SHOW_AFTER = 1500;
  window.ConnPill = function (socket) {
    let el = null;
    let t = null;
    const pill = () => {
      if (!el) {
        el = document.createElement('div');
        el.className = 'conn-pill';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<i aria-hidden="true"></i><span>Reconnecting to the table…</span>';
        document.body.append(el);
      }
      return el;
    };
    socket.on('disconnect', () => {
      clearTimeout(t);
      t = setTimeout(() => { const p = pill(); p.classList.remove('back'); p.classList.add('on'); }, SHOW_AFTER);
    });
    socket.on('connect', () => {
      clearTimeout(t);
      if (!el?.classList.contains('on')) return;
      el.classList.add('back');
      el.querySelector('span').textContent = 'Back at the table';
      t = setTimeout(() => {
        el.classList.remove('on', 'back');
        setTimeout(() => { if (!el.classList.contains('on')) el.querySelector('span').textContent = 'Reconnecting to the table…'; }, 400);
      }, 1200);
    });
  };
})();
