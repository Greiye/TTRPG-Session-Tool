// Dungeon nodes (exploration): one drawing for the TV, the DM preview and the phones. Rooms sit on levels,
// joined by rope lines; horizontal ropes divide the levels; torches flicker on a stone wall. The server
// filters what each viewer sees (src/dungeon.js viewFor). Classic script: exposes the global Dungeon.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  // Rows of nodes, one per level. Each row is ordered by where its parents sit, so ropes cross less.
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

  // The whole board. opts: { dm, title, selected, phone }.
  function board(d, opts = {}) {
    if (!d || !d.nodes?.length) return '';
    const R = rows(d.nodes);
    const kids = new Set(d.here ? d.nodes.filter((n) => n.parents.includes(d.here)).map((n) => n.id) : []);
    const hereLevel = d.here ? levels(d.nodes)[d.here] : 0;
    const body = R.map((row, i) => `
      <div class="dg-row ${i + 1 === hereLevel ? 'now' : ''}" style="--n:${row.length}">
        <div class="dg-level"><b>LEVEL ${i + 1}</b>${i === 0 ? '<small>(Entrance)</small>' : i + 1 === hereLevel ? '<small>(Party here)</small>' : ''}</div>
        <div class="dg-cards">${row.map((n) => card(n, d, opts, kids.has(n.id))).join('')}</div>
      </div>${i < R.length - 1 ? '<div class="dg-rope" aria-hidden="true"></div>' : ''}`).join('');
    return `<div class="dg ${opts.phone ? 'phone' : ''} ${opts.dm ? 'dm' : ''}" style="--levels:${R.length}">
      <div class="dg-wall" aria-hidden="true"><div class="dg-arch"></div><div class="dg-torch l"><i></i></div><div class="dg-torch r"><i></i></div></div>
      ${opts.title ? `<div class="dg-title">${esc(opts.title)}</div>` : ''}
      <div class="dg-body">${body}</div>
      <svg class="dg-links" aria-hidden="true"></svg>
    </div>`;
  }

  // Draw the ropes once the cards are laid out: from the bottom of each parent to the top of the child.
  function draw(el, d) {
    const svg = el.querySelector('.dg-links');
    if (!svg || !d) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const at = {};
    el.querySelectorAll('.dg-card').forEach((c) => {
      const r = c.getBoundingClientRect();
      const pill = c.querySelector('.dg-pill')?.getBoundingClientRect();
      at[c.dataset.dg] = { x: r.left - box.left + r.width / 2, top: r.top - box.top, bot: Math.max(r.bottom, pill?.bottom || 0) - box.top };
    });
    const byId = new Map(d.nodes.map((n) => [n.id, n]));
    const paths = [];
    for (const n of d.nodes) {
      for (const p of n.parents) {
        const a = at[p];
        const b = at[n.id];
        if (!a || !b) continue;
        const y1 = a.bot + 2;
        const y2 = b.top - 4;
        const mid = (y1 + y2) / 2;
        const path = `M${a.x.toFixed(1)},${y1.toFixed(1)} C${a.x.toFixed(1)},${mid.toFixed(1)} ${b.x.toFixed(1)},${mid.toFixed(1)} ${b.x.toFixed(1)},${y2.toFixed(1)}`;
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
  function hydrate(root, d) {
    const el = root?.querySelector('.dg');
    if (!el) return;
    draw(el, d);
    requestAnimationFrame(() => draw(el, d));
    if (window.ResizeObserver) {
      obs.get(root)?.disconnect();
      const ro = new ResizeObserver(() => draw(el, d));
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

  window.Dungeon = { ICON, levels, rows, board, draw, hydrate };
})();
