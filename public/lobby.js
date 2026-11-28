// TV: the landing page (Mike, Nov 18) and the Group Map View count.
//   Lobby.render(root, s, socket)  the landing page while s.lobby: "Landing Page" at the top centre, character
//                                  slots with "Join Game" under each (3, more if more join), the join QR, and a
//                                  faded Start game that lights up once one player has joined. It is display only
//                                  (arcade feel, Mike Nov 18): the first player to join starts the game from their phone.
//   Lobby.mapCount(s)              "🗺 2 / 4 want the map" over the TV while a Group Map View vote is running.
(function () {
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SLOTS = 3;
  const KEY_QS = (() => { const k = new URLSearchParams(location.search).get('key'); return k ? `&key=${encodeURIComponent(k)}` : ''; })();
  let lastKey = '';
  const seen = new Set(); // characters already in a slot, so a new one pops in once

  function render(root, s, socket) {
    // Test mode (Mike, Nov 27): test characters in the party take a slot like any playable character. They have no
    // phone, so Start game still waits for a real player (or the DM).
    const isTest = (p) => p.player === 'Test' && /^\[Test\]/.test(p.name || '');
    const real = (s.players || []).filter((p) => p.online);
    const joined = [...real, ...(s.settings?.testMode ? (s.players || []).filter((p) => !p.online && isTest(p)) : [])];
    const key = JSON.stringify([joined.map((p) => [p.id, p.name, p.portrait, p.hue]), s.room]);
    if (root.dataset.lobby === '1' && key === lastKey) return;
    lastKey = key;
    const n = Math.max(SLOTS, joined.length);
    const slots = Array.from({ length: n }, (_, i) => {
      const p = joined[i];
      if (!p) return '<li class="lb-slot"><div class="lb-card empty" aria-hidden="true"><span>?</span></div><b class="lb-join">Join Game</b></li>';
      const art = p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : `<span>${esc((p.name || '?')[0])}</span>`;
      return `<li class="lb-slot filled ${seen.has(p.id) ? '' : 'lb-new'}"><div class="lb-card" style="--hue:${Number(p.hue) || 40}">${art}</div><b class="lb-join">${esc(p.name)}</b></li>`;
    }).join('');
    joined.forEach((p) => seen.add(p.id));
    const ready = real.length > 0;
    const first = root.dataset.lobby !== '1';
    root.className = 'stage lb-stage';
    root.dataset.lobby = '1';
    root.innerHTML = `<div class="lb ${first ? 'lb-enter' : ''}">
      <h1 class="lb-title">Landing Page</h1>
      <ol class="lb-slots">${slots}</ol>
      <p class="lb-start ${ready ? 'ready' : ''}" aria-live="polite">Start game</p>
      <p class="lb-hint">${ready ? `${esc(real[0].name)} can start the game from their phone` : 'Scan the code with your phone to join'}</p>
      ${s.room ? `<div class="lb-qr"><img src="/qr.svg?r=${esc(s.room)}${KEY_QS}" alt="Join QR"><span>Scan to join · Room <b>${esc(s.room)}</b></span></div>` : ''}
    </div>`;
  }
  // Leaving the landing page: the next render owns the stage again.
  function leave(root) { if (root.dataset.lobby === '1') { delete root.dataset.lobby; lastKey = ''; } }

  let countEl = null;
  function mapCount(s) {
    const mv = s.mapVote;
    const on = !!mv && mv.want > 0 && !mv.blocked && !s.lobby;
    if (!on) {
      if (countEl && !countEl.classList.contains('out')) { const el = countEl; el.classList.add('out'); setTimeout(() => { el.remove(); if (countEl === el) countEl = null; }, 350); }
      return;
    }
    if (!countEl || countEl.classList.contains('out')) {
      countEl?.remove();
      countEl = document.createElement('div');
      countEl.className = 'lb-mapcount';
      countEl.setAttribute('role', 'status');
      document.body.appendChild(countEl);
    }
    const text = `<i>🗺</i><b>${mv.want} / ${mv.total}</b><span>${mv.dir === 'close' ? 'want to close the map' : 'want the map'}</span>`;
    if (countEl.innerHTML !== text) {
      countEl.innerHTML = text;
      countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
    }
  }

  window.Lobby = { render, leave, mapCount };
})();
