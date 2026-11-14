// World map (Phase G): one drawing for the TV, the phones and the DM page. State comes from the server
// (src/worldmap.js viewFor). Classic script: exposes the global WorldMap. Plain HTML, no build step.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const byId = (wm, id) => wm.nodes.find((n) => n.id === id);

  // Where the party token is now. Mid-leg it glides on the line from its last point to the target.
  function posAt(wm, now = Date.now()) {
    const t = wm.travel;
    const to = t && byId(wm, t.to);
    if (t && to) {
      const p = clamp((now - t.startAt) / (t.endAt - t.startAt));
      return { x: t.fromPt.x + (to.x - t.fromPt.x) * p, y: t.fromPt.y + (to.y - t.fromPt.y) * p };
    }
    const here = byId(wm, wm.here);
    return here ? { x: here.x, y: here.y } : null;
  }

  // Roads on this trip: the leg under way plus the rest of the route.
  function tripRoads(wm) {
    const t = wm.travel;
    if (!t) return new Set();
    const ids = new Set(t.road ? [t.road] : []);
    const stops = [t.to, ...(t.route || [])];
    for (let i = 1; i < stops.length; i++) {
      const r = roadOf(wm, stops[i - 1], stops[i]);
      if (r) ids.add(r.id);
    }
    return ids;
  }
  const roadOf = (wm, a, b) => (wm.roads || []).find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

  // Shortest road route, as the table sees it (src/worldmap.js route on the roads this viewer has).
  function route(wm, from, to) {
    if (!from || !to || from === to) return null;
    const dist = { [from]: 0 }; const prev = {}; const open = new Set([from]); const done = new Set();
    while (open.size) {
      let u = null;
      for (const id of open) if (u === null || dist[id] < dist[u]) u = id;
      open.delete(u); if (u === to) break; done.add(u);
      for (const r of wm.roads || []) {
        if (!r.known || (r.a !== u && r.b !== u)) continue;
        const v = r.a === u ? r.b : r.a;
        if (done.has(v)) continue;
        const d = dist[u] + r.length;
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; open.add(v); }
      }
    }
    if (dist[to] === undefined) return null;
    const path = [];
    for (let v = to; v !== from; v = prev[v]) path.unshift(v);
    return { path, legs: dist[to] };
  }

  // Roads as SVG lines in picture fractions (0..100). Unknown roads (DM only, under fog) are faint.
  function roadsSvg(wm, opts) {
    const trip = tripRoads(wm);
    const lines = (wm.roads || []).map((r) => {
      const a = byId(wm, r.a); const b = byId(wm, r.b);
      if (!a || !b) return '';
      const cls = ['wm-road', r.known ? '' : 'unknown', trip.has(r.id) ? 'trip' : '', opts.selRoad === r.id ? 'sel' : ''].join(' ');
      return `<line class="${cls}" data-road="${esc(r.id)}" x1="${a.x * 100}" y1="${a.y * 100}" x2="${b.x * 100}" y2="${b.y * 100}"/>`;
    }).join('');
    return `<svg class="wm-roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  }

  // Fog of war: a cloud layer with clear holes around seen places and the party. Light on the DM page.
  let fogSeq = 0;
  function fogSvg(wm, p, opts) {
    if (!wm.fog) return '';
    const id = `wmfog${++fogSeq}`;
    const holes = wm.nodes.filter((n) => n.seen).map((n) => `<circle cx="${n.x * 100}" cy="${n.y * 100}" r="12"/>`).join('')
      + (p ? `<circle cx="${p.x * 100}" cy="${p.y * 100}" r="9"/>` : '');
    return `<svg class="wm-fog ${opts.dm ? 'dm' : ''}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="${id}t"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .08  0 0 0 0 .07  0 0 0 0 .1  0 0 0 -1.1 1.25"/></filter>
        <mask id="${id}m"><rect width="100" height="100" fill="#fff"/><g fill="#000" filter="url(#${id}b)">${holes}</g></mask>
      </defs>
      <g mask="url(#${id}m)"><rect width="100" height="100" fill="#120d16"/><rect class="wm-fog-drift" width="100" height="100" filter="url(#${id}t)"/></g>
    </svg>`;
  }

  // The map: picture, roads, fog, places and the party token. opts: { selected, selRoad, dm, tv, from }.
  function board(s, opts = {}) {
    const wm = s.worldMap;
    const p = posAt(wm);
    const t = wm.travel;
    const to = t && byId(wm, t.to);
    const token = p
      ? `<div class="wm-token ${t ? 'moving' : ''}" ${t && to ? `data-travel="${t.fromPt.x},${t.fromPt.y},${to.x},${to.y},${t.startAt},${t.endAt}"` : ''} style="left:${pct(p.x)};top:${pct(p.y)}" title="The party"><span>⚑</span></div>`
      : '';
    const nodes = wm.nodes.map((n) => `<div class="wm-node ${n.id === wm.here ? 'here' : ''} ${n.id === opts.selected ? 'sel' : ''} ${n.id === opts.from ? 'from' : ''} ${n.revealed ? '' : 'unrevealed'} ${n.fogged ? 'fogged' : ''} ${opts.dm && wm.fog && !n.seen ? 'unseen' : ''} ${t && n.id === (t.dest || t.to) ? 'dest' : ''}" data-node="${esc(n.id)}" style="left:${pct(n.x)};top:${pct(n.y)}"><i></i><span>${esc(n.name)}${opts.dm && !n.revealed ? ' <small>(hidden)</small>' : ''}</span></div>`).join('');
    const pic = wm.image ? `<img src="${esc(wm.image)}" alt="">` : '<div class="wm-blank"></div>';
    return `<div class="wm-board ${opts.tv ? 'tv' : ''} ${opts.dm ? 'dm' : ''}"><div class="wm-pic">${pic}<div class="wm-layer">${roadsSvg(wm, opts)}${fogSvg(wm, p, opts)}${nodes}${token}</div></div></div>`;
  }

  // "Travelling to Dun, via Bree and Cole" for the title lines.
  function tripLine(wm) {
    const t = wm.travel;
    if (!t) return '';
    const dest = byId(wm, t.dest || t.to);
    const stops = [t.to, ...(t.route || [])].slice(0, -1).map((id) => byId(wm, id)?.name).filter(Boolean);
    return `Travelling to ${dest?.name || '???'}${stops.length ? `, via ${stops.join(', ')}` : ''}`;
  }

  // "Ruin 2 · Mill 1 · needs 3 of 5" for a vote, without who voted for what.
  function voteLine(wm) {
    const v = wm.vote;
    if (!v) return '';
    const parts = v.candidates.map((id, i) => `${esc(byId(wm, id)?.name || '?')} ${v.counts[i]}`);
    return `${parts.join(' · ')} <small>(${v.open ? `needs ${v.needed}` : v.result === 'tie' ? 'tied' : 'closed'})</small>`;
  }

  // One road card. opts: { phone } adds the comment box and comments; the DM page builds its own controls.
  function card(c, opts = {}) {
    const comments = c.comments.length ? `<ul class="wm-comments">${c.comments.map((m) => `<li><b>${esc(m.who)}:</b> ${esc(m.text)}</li>`).join('')}</ul>` : '';
    const form = opts.phone && !c.vetoed ? `<form class="wm-cform" data-card="${esc(c.id)}"><input class="grow" maxlength="200" placeholder="Say something about this…" autocomplete="off"><button class="btn small">Say</button></form>` : '';
    return `<article class="wm-card ${c.vetoed ? 'vetoed' : ''}" data-card="${esc(c.id)}">
      <p class="wm-text">${esc(c.text)}</p>
      ${c.lore ? `<p class="wm-lore"><b>Lore</b> ${esc(c.lore)}</p>` : ''}
      ${comments}${form}
    </article>`;
  }

  // Full-screen world map on the TV (the TV shows it while the DM has it on).
  function tv(root, s) {
    const wm = s.worldMap;
    const here = byId(wm, wm.here);
    const title = wm.travel ? tripLine(wm) : here ? `At ${here.name}` : 'Where to next?';
    const latest = wm.cards.find((c) => !c.vetoed);
    const showCard = latest && (wm.travel || Date.now() - latest.at < 15000);
    root.className = 'stage wm-stage';
    root.innerHTML = `<div class="wm-tv">
      <header class="wm-head"><div class="wm-title">🧭 ${esc(title)}</div>${wm.vote ? `<div class="wm-vote-line">${voteLine(wm)}</div>` : ''}</header>
      <main class="wm-main">${board(s, { tv: true })}</main>
      ${showCard ? `<aside class="wm-card-tv" data-card="${esc(latest.id)}"><p>${esc(latest.text)}</p>${latest.lore ? `<p class="wm-lore"><b>Lore</b> ${esc(latest.lore)}</p>` : ''}</aside>` : ''}
    </div>`;
    if (showCard && window.Anim) Anim.once(root.querySelector('.wm-card-tv'), `wm:${latest.id}`, 'unfold');
  }

  // The party token glides along its leg. A timer moves it, so no re-render is needed while travelling.
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-travel]').forEach((el) => {
      const [fx, fy, tx, ty, st, en] = el.dataset.travel.split(',').map(Number);
      const p = clamp((now - st) / (en - st));
      el.style.left = pct(fx + (tx - fx) * p);
      el.style.top = pct(fy + (ty - fy) * p);
    });
  }, 100);

  window.WorldMap = { esc, posAt, board, voteLine, card, tv, byId, route, roadOf, tripLine };
})();
