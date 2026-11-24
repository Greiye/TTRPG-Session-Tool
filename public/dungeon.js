// Dungeon nodes (exploration): one drawing for the TV, the DM preview and the phones. The tree starts on the
// left and branches to the right: each level is a column, joined by rope lines, on a stone wall (no torches, Mike Nov 15).
// The board adapts as the party moves: on the TV and phones, levels the party has left behind shrink to a
// narrow trail of icons, so the rooms ahead get the room, and every card glides to its new place. The server
// filters what each viewer sees (src/dungeon.js viewFor). Classic script: exposes the global Dungeon.
(function () {
  const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
  const ICON = { entrance: '🚪', passage: '👣', room: '🏛', crypt: '⚰', trap: '🗡', treasure: '💰', monster: '💀', scroll: '📜', puzzle: '🧩', secret: '🗝', boss: '👑', exit: '🌅' };

  function levels(nodes) {
    const map = new Map(nodes.map((n) => [n.id, n]));
    const out = {};
    const depth = (n, guard = 0) => {
      if (out[n.id]) return out[n.id];
      if (guard > nodes.length) return 1;
      const ps = n.parents.map((p) => map.get(p)).filter(Boolean);
      out[n.id] = ps.length ? 1 + Math.max(...ps.map((p) => depth(p, guard + 1))) : 1;
      return out[n.id];
    };
    nodes.forEach((n) => depth(n));
    return out;
  }

  // Columns of nodes, one per level. Each column is ordered by where its parents sit, so ropes cross less.
  function rows(nodes) {
    const lv = levels(nodes);
    const depth = Math.max(0, ...Object.values(lv));
    const pos = {};
    const out = [];
    for (let l = 1; l <= depth; l++) {
      const row = nodes.map((n, i) => ({ n, i })).filter(({ n }) => lv[n.id] === l);
      const key = ({ n, i }) => {
        const ps = n.parents.filter((p) => p in pos);
        return ps.length ? ps.reduce((a, p) => a + pos[p], 0) / ps.length : i / 1000;
      };
      row.sort((a, b) => key(a) - key(b) || a.i - b.i);
      row.forEach(({ n }, k) => { pos[n.id] = (k + 0.5) / row.length; });
      out.push(row.map(({ n }) => n));
    }
    return out;
  }

  function card(n, d, opts, choice) {
    const here = n.id === d.here;
    const cls = ['dg-card', n.fog ? 'fog' : n.visited ? 'iron' : 'parch', here ? 'here' : '', choice ? 'choice' : '', !n.fog && !n.revealed ? 'hidden' : '', n.id === opts.selected ? 'sel' : ''].filter(Boolean).join(' ');
    const tag = n.fog ? 'UNEXPLORED' : `${(n.kind || 'room').toUpperCase()}${opts.dm && !n.revealed ? ' · HIDDEN' : ''}`;
    const name = n.fog ? '???' : esc(n.name);
    const pill = n.fog ? '?' : n.pill ? esc(n.pill) : ICON[n.kind] || '◆';
    return `<div class="${cls}" data-dg="${esc(n.id)}" tabindex="${opts.dm ? 0 : -1}">
      ${here ? '<span class="dg-party">⚑ Party</span>' : ''}
      <i class="dg-gem"></i>
      <b class="dg-name">${n.fog ? '' : `<span class="dg-ico">${ICON[n.kind] || '◆'}</span>`}${name}</b>
      <small class="dg-tag">(${tag})</small>
      <span class="dg-pill ${n.pill && !n.fog ? 'txt' : ''}">${pill}</span>
    </div>`;
  }

  // The whole board. opts: { dm, title, selected, phone }. Not for the DM: levels two or more behind the
  // party collapse into a trail of icons.
  function board(d, opts = {}) {
    if (!d || !d.nodes?.length) return '';
    const R = rows(d.nodes);
    const kids = new Set(d.here ? d.nodes.filter((n) => n.parents.includes(d.here)).map((n) => n.id) : []);
    const hereLevel = d.here ? levels(d.nodes)[d.here] : 0;
    const trail = (i) => !opts.dm && hereLevel && i + 1 < hereLevel - 1;
    const nTrail = R.filter((_, i) => trail(i)).length;
    const maxRows = Math.max(1, ...R.filter((_, i) => !trail(i)).map((c) => c.length));
    const body = R.map((col, i) => `
      <div class="dg-col ${i + 1 === hereLevel ? 'now' : ''} ${trail(i) ? 'trail' : ''}">
        <div class="dg-level"><b>${trail(i) ? `L${i + 1}` : `LEVEL ${i + 1}`}</b>${trail(i) ? '' : i === 0 ? '<small>(Entrance)</small>' : i + 1 === hereLevel ? '<small>(Party here)</small>' : ''}</div>
        <div class="dg-cards">${col.map((n) => card(n, d, opts, kids.has(n.id))).join('')}</div>
      </div>`).join('');
    // The TV keeps the party's room in the middle of the screen (Mike, Nov 16, PR R): see centre() below.
    return `<div class="dg ${opts.phone ? 'phone' : ''} ${opts.dm ? 'dm' : ''} ${!opts.dm && !opts.phone && d.here ? 'center' : ''}" style="--cols:${R.length - nTrail};--trail:${nTrail};--rows:${maxRows}">
      <div class="dg-wall" aria-hidden="true"><div class="dg-arch"></div></div>
      ${opts.title ? `<div class="dg-title">${esc(opts.title)}</div>` : ''}
      <div class="dg-body">${body}</div>
      <svg class="dg-links" aria-hidden="true"></svg>
    </div>`;
  }

  // Draw the ropes once the cards are laid out: from the right side of each parent to the left side of the child.
  function draw(el, d) {
    const svg = el.querySelector('.dg-links');
    if (!svg || !d) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const at = {};
    el.querySelectorAll('.dg-card').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (!r.width) return; // hidden (a fogged room on the trail)
      at[c.dataset.dg] = { y: r.top - box.top + r.height / 2, left: r.left - box.left, right: r.right - box.left };
    });
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const paths = [];
    for (const n of d.nodes) {
      for (const p of n.parents) {
        const a = at[p];
        const b = at[n.id];
        if (!a || !b) continue;
        const x1 = a.right + 2;
        const x2 = b.left - 4;
        const mid = (x1 + x2) / 2;
        const f = (v) => v.toFixed(1);
        const path = `M${f(x1)},${f(a.y)} C${f(mid)},${f(a.y)} ${f(mid)},${f(b.y)} ${f(x2)},${f(b.y)}`;
        const live = p === d.here;
        const fog = byId.get(n.id)?.fog || (!byId.get(n.id)?.revealed && !byId.get(n.id)?.fog);
        paths.push(`<g class="dg-rope-line ${live ? 'live' : ''} ${fog ? 'faint' : ''}"><path class="r1" d="${path}"/><path class="r2" d="${path}"/>${live ? `<path class="r3" d="${path}"/>` : ''}</g>`);
      }
    }
    const aw = Math.max(8, Math.min(16, box.width / 90)).toFixed(1);
    svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(0)} ${box.height.toFixed(0)}`);
    svg.innerHTML = `<defs><marker id="dgArrow" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="${aw}" markerHeight="${aw}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c9a46a" stroke="#3a2a17" stroke-width="1"/></marker></defs>${paths.join('')}`;
  }

  // Wire a freshly rendered board: draw the ropes now and whenever its size changes, and reveal new rooms.
  const seen = new WeakMap();
  const obs = new WeakMap();
  const places = new WeakMap();
  const reduce = () => window.Settings?.reducedMotion?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hydrate(root, d) {
    const el = root?.querySelector('.dg');
    if (!el) return;
    // Cards glide from where they were to where the new layout puts them (FLIP), and the ropes follow.
    const prev = places.get(root);
    const now = {};
    el.querySelectorAll('.dg-card').forEach((c) => { const r = c.getBoundingClientRect(); now[c.dataset.dg] = { x: r.left, y: r.top, w: r.width }; });
    places.set(root, now);
    if (prev && !reduce() && el.animate) {
      let moved = false;
      el.querySelectorAll('.dg-card').forEach((c) => {
        const a = prev[c.dataset.dg];
        const b = now[c.dataset.dg];
        if (!a || !b || (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1)) return;
        moved = true;
        c.animate([{ translate: `${a.x - b.x}px ${a.y - b.y}px` }, { translate: '0 0' }], { duration: 650, easing: Anim.ease() });
      });
      if (moved) { const end = performance.now() + 700; const tick = () => { draw(el, d); if (performance.now() < end && el.isConnected) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    }
    centre(el, d, root);
    draw(el, d);
    requestAnimationFrame(() => draw(el, d));
    if (window.ResizeObserver) {
      obs.get(root)?.disconnect();
      const ro = new ResizeObserver(() => { centre(el, d, root); draw(el, d); });
      ro.observe(el);
      obs.set(root, ro);
    }
    // Rooms that were not on the board last time fade in, one after another.
    const before = seen.get(root);
    const ids = [...el.querySelectorAll('.dg-card')].map((c) => c.dataset.dg + (c.classList.contains('fog') ? '?' : ''));
    if (before) {
      const fresh = [...el.querySelectorAll('.dg-card')].filter((c) => !before.has(c.dataset.dg + (c.classList.contains('fog') ? '?' : '')));
      fresh.forEach((c, i) => { c.style.animationDelay = `${i * 120}ms`; c.classList.add('arrive'); });
    }
    seen.set(root, new Set(ids));
    // The party flag moved: the new room flares once.
    const prevHere = root.dataset.dgHere;
    if (prevHere !== undefined && prevHere !== (d.here || '')) el.querySelector('.dg-card.here')?.classList.add('flare');
    root.dataset.dgHere = d.here || '';
    // Phones: scroll the board so the party's room is in view.
    const sc = el.closest('.dg-scroll');
    const h = el.querySelector('.dg-card.here');
    if (sc && h) { const a = sc.getBoundingClientRect(); const b = h.getBoundingClientRect(); sc.scrollLeft += b.left + b.width / 2 - (a.left + a.width / 2); }
  }

  // TV: slide the board so the party's room sits in the middle of the screen. The shift is kept per root, so a
  // re-render starts from where the last one ended and the board glides to the new room; the ropes follow.
  const shifts = new WeakMap();
  function centre(el, d, root) {
    if (!el.classList.contains('center')) return;
    const body = el.querySelector('.dg-body');
    const h = el.querySelector('.dg-card.here');
    if (!body || !h) return;
    const was = shifts.get(root) || { x: 0, y: 0 };
    body.style.transition = 'none';
    body.style.transform = `translate(${was.x}px, ${was.y}px)`;
    const a = el.getBoundingClientRect();
    const b = h.getBoundingClientRect();
    if (!a.width) return;
    const x = Math.round(was.x + a.left + a.width / 2 - (b.left + b.width / 2));
    const y = Math.round(was.y + a.top + a.height / 2 - (b.top + b.height / 2));
    shifts.set(root, { x, y });
    if (x === was.x && y === was.y) return;
    void body.offsetWidth;
    body.style.transition = reduce() ? 'none' : 'transform .7s var(--ease)';
    body.style.transform = `translate(${x}px, ${y}px)`;
    const end = performance.now() + 760;
    const tick = () => { draw(el, d); if (performance.now() < end && el.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // The dungeon gate on the TV (Mike, Nov 16, PR R): the dungeon's picture, its name, and how many players are
  // holding Enter Dungeon on their phones. Shown over whatever the TV shows while the server reports a gate.
  let gateEl = null;
  let gateKey = '';
  function tvGate(s) {
    const g = s?.dungeon?.gate;
    if (!g) {
      if (gateEl && !gateEl.classList.contains('out')) { gateEl.classList.add('out'); const el = gateEl; setTimeout(() => { el.remove(); if (gateEl === el) gateEl = null; }, 450); }
      gateKey = '';
      return;
    }
    if (!gateEl || gateEl.classList.contains('out')) {
      gateEl?.remove();
      gateEl = document.createElement('div');
      gateEl.className = 'dg-gate';
      document.body.appendChild(gateEl);
      gateKey = '';
    }
    const key = JSON.stringify(g);
    if (key === gateKey) return;
    const before = gateKey ? JSON.parse(gateKey).ready.length : null;
    gateKey = key;
    const art = g.image ? `<img src="${esc(g.image)}" alt="">` : '<div class="dg-gate-arch" aria-hidden="true"><div class="dg-wall"><div class="dg-arch"></div></div><span>🏰</span></div>';
    const pips = Array.from({ length: g.total }, (_, i) => `<i class="${i < g.ready.length ? 'on' : ''}"></i>`).join('');
    gateEl.innerHTML = `<div class="dg-gate-card">
      <div class="dg-gate-art">${art}</div>
      <div class="dg-gate-text">
        <small>A dungeon entrance</small>
        <h2>${esc(g.name)}</h2>
        ${g.info ? `<p>${esc(g.info)}</p>` : ''}
        <div class="dg-gate-count"><b>${g.ready.length}</b> / ${g.total} ready</div>
        <div class="dg-gate-pips">${pips}</div>
        <p class="dg-gate-hint">Hold <b>Enter Dungeon</b> on your phone</p>
      </div>
    </div>`;
    if (before !== null && before !== g.ready.length) gateEl.querySelector('.dg-gate-count b')?.classList.add('bump');
  }

  window.Dungeon = { ICON, levels, rows, board, draw, hydrate, tvGate };
})();
