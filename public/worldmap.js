// World map (Phase G): one drawing for the TV, the phones and the DM page. State comes from the server
// (src/worldmap.js viewFor). Classic script: exposes the global WorldMap. Plain HTML, no build step.
(function () {
  const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
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

  // Fog of war: unpainted parchment (Nov 16 paper look) with clear holes around seen places and the party.
  // Light on the DM page.
  let fogSeq = 0;
  function fogSvg(wm, p, opts) {
    if (!wm.fog) return '';
    const id = `wmfog${++fogSeq}`;
    const holes = wm.nodes.filter((n) => n.seen).map((n) => `<circle cx="${n.x * 100}" cy="${n.y * 100}" r="12"/>`).join('')
      + (p ? `<circle cx="${p.x * 100}" cy="${p.y * 100}" r="9"/>` : '');
    return `<svg class="wm-fog ${opts.dm ? 'dm' : ''}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="${id}t"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .44  0 0 0 0 .3  0 0 0 -1.1 1.05"/></filter>
        <mask id="${id}m"><rect width="100" height="100" fill="#fff"/><g fill="#000" filter="url(#${id}b)">${holes}</g></mask>
      </defs>
      <g mask="url(#${id}m)"><rect width="100" height="100" fill="#e3d2ac"/><rect class="wm-fog-drift" width="100" height="100" filter="url(#${id}t)"/></g>
    </svg>`;
  }

  // Paper map look (Mike, Nov 16): a parchment sheet with light watercolour washes when no picture is
  // uploaded, a paper grain and darkened edges over any picture, and a compass rose at the bottom right.
  // All plain SVG (filters, no images), so it works offline. Ids are unique per drawing.
  let paperSeq = 0;
  function watercolor() {
    const id = `wmwc${++paperSeq}`;
    // [cx, cy, rx, ry, colour, opacity]: soft land and water washes on a 160 x 100 sheet.
    const washes = [
      [38, 62, 34, 22, '#9fbf8a', 0.55], [52, 30, 30, 16, '#7fa772', 0.5], [118, 40, 30, 20, '#b7c68e', 0.5],
      [128, 74, 28, 16, '#c9b98a', 0.45], [86, 52, 18, 12, '#a7c49a', 0.4], [20, 20, 22, 12, '#93b4c4', 0.45],
      [150, 14, 18, 10, '#93b4c4', 0.4], [100, 92, 40, 9, '#8fb0c6', 0.4], [74, 18, 10, 7, '#6f9a6a', 0.45],
    ];
    const blobs = washes.map(([cx, cy, rx, ry, c, o]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c}" fill-opacity="${o}"/>`).join('');
    return `<svg class="wm-wc" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="${id}w" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="11" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="14" result="d"/>
          <feGaussianBlur in="d" stdDeviation="1.4" result="b"/>
          <feComposite in="b" in2="d" operator="arithmetic" k1="0" k2=".7" k3=".5" k4="0"/>
        </filter>
        <filter id="${id}r"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>
      </defs>
      <rect width="160" height="100" fill="#efe2c4"/>
      <g filter="url(#${id}w)">${blobs}</g>
      <path filter="url(#${id}r)" d="M-2 34 C 22 40, 40 30, 62 42 S 98 64, 118 58 S 150 70, 164 66" fill="none" stroke="#7fa6c0" stroke-width="1.6" stroke-opacity=".7" stroke-linecap="round"/>
    </svg>`;
  }
  function paperSvg() {
    const id = `wmpp${++paperSeq}`;
    return `<svg class="wm-paper" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="${id}g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .34  0 0 0 0 .2  0 0 0 .22 0"/></filter>
        <radialGradient id="${id}v" cx="50%" cy="50%" r="72%"><stop offset="62%" stop-color="#5a3d1c" stop-opacity="0"/><stop offset="100%" stop-color="#5a3d1c" stop-opacity=".42"/></radialGradient>
      </defs>
      <rect width="100" height="100" filter="url(#${id}g)"/>
      <rect width="100" height="100" fill="url(#${id}v)"/>
    </svg>`;
  }
  function compass() {
    // Eight-point rose in sepia ink: long N/E/S/W points, short diagonals, a ring and an N.
    const pt = (a, len, w, dark) => {
      const r = (d) => (d * Math.PI) / 180;
      const tip = [50 + Math.sin(r(a)) * len, 50 - Math.cos(r(a)) * len];
      const l = [50 + Math.sin(r(a - 90)) * w, 50 - Math.cos(r(a - 90)) * w];
      const rr = [50 + Math.sin(r(a + 90)) * w, 50 - Math.cos(r(a + 90)) * w];
      const f = (q) => q.map((v) => v.toFixed(2)).join(' ');
      return `<path d="M50 50 L${f(l)} L${f(tip)} Z" fill="${dark ? '#4a3420' : '#e9d9b4'}"/><path d="M50 50 L${f(tip)} L${f(rr)} Z" fill="${dark ? '#e9d9b4' : '#4a3420'}"/>`;
    };
    const diag = [45, 135, 225, 315].map((a) => pt(a, 22, 5, false)).join('');
    const main = [0, 90, 180, 270].map((a) => pt(a, 38, 7, true)).join('');
    return `<svg class="wm-compass" viewBox="0 0 100 100" aria-hidden="true" style="--wm-sway:${-(Date.now() % 18000)}ms">
      <circle cx="50" cy="50" r="30" fill="none" stroke="#4a3420" stroke-width="1.2" opacity=".8"/>
      <circle cx="50" cy="50" r="26" fill="none" stroke="#4a3420" stroke-width=".6" stroke-dasharray="1.5 2.5" opacity=".8"/>
      <g stroke="#4a3420" stroke-width=".6" stroke-linejoin="round">${diag}${main}</g>
      <circle cx="50" cy="50" r="2.6" fill="#b0402a" stroke="#4a3420" stroke-width=".6"/>
      <text x="50" y="9" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="11" fill="#4a3420">N</text>
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
    // The party's place is marked ("You are here"); a dungeon entrance carries a gate icon.
    const nodes = wm.nodes.map((n) => `<div class="wm-node ${n.id === wm.here ? 'here' : ''} ${n.dungeon && !n.fogged ? 'dungeon' : ''} ${n.id === opts.selected ? 'sel' : ''} ${n.id === opts.from ? 'from' : ''} ${n.revealed ? '' : 'unrevealed'} ${n.fogged ? 'fogged' : ''} ${opts.dm && wm.fog && !n.seen ? 'unseen' : ''} ${t && n.id === (t.dest || t.to) ? 'dest' : ''}" data-node="${esc(n.id)}" style="left:${pct(n.x)};top:${pct(n.y)}"><i></i><span>${n.dungeon && !n.fogged ? '🏰 ' : ''}${esc(n.name)}${opts.dm && !n.revealed ? ' <small>(hidden)</small>' : ''}</span>${n.id === wm.here && !t ? '<b class="wm-here">You are here</b>' : ''}</div>`).join('');
    const pic = wm.image ? `<img src="${esc(wm.image)}" alt="">` : `<div class="wm-blank">${watercolor()}</div>`;
    return `<div class="wm-board paper ${opts.tv ? 'tv' : ''} ${opts.dm ? 'dm' : ''}"><div class="wm-pic">${pic}${paperSvg()}<div class="wm-layer">${roadsSvg(wm, opts)}${fogSvg(wm, p, opts)}${nodes}${token}</div>${compass()}</div></div>`;
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
  // opts.revealAt: when the DM put the map on the TV. For the first seconds the map unrolls and the places
  // drop in. A negative animation delay keeps the animation going across re-renders instead of restarting it.
  const REVEAL_MS = 2600;
  function tv(root, s, opts = {}) {
    const wm = s.worldMap;
    const since = opts.revealAt ? Date.now() - opts.revealAt : Infinity;
    const here = byId(wm, wm.here);
    const title = wm.travel ? tripLine(wm) : here ? `At ${here.name}` : 'Where to next?';
    const latest = wm.cards.find((c) => !c.vetoed);
    const showCard = latest && (wm.travel || Date.now() - latest.at < 15000);
    root.className = 'stage wm-stage';
    const reveal = since < REVEAL_MS ? ` wm-revealing" style="--wm-t:${-since}ms` : '';
    root.innerHTML = `<div class="wm-tv${reveal}">
      <header class="wm-head"><div class="wm-title">🧭 ${esc(title)}</div>${wm.vote ? `<div class="wm-vote-line">${voteLine(wm)}</div>` : ''}</header>
      <main class="wm-main">${board(s, { tv: true })}</main>
      ${showCard && !dungeonOn(s) ? `<aside class="wm-card-tv" data-card="${esc(latest.id)}"><p>${esc(latest.text)}</p>${latest.lore ? `<p class="wm-lore"><b>Lore</b> ${esc(latest.lore)}</p>` : ''}</aside>` : ''}
      ${dungeonPop(s, here, opts)}
    </div>`;
    if (reveal) root.querySelectorAll('.wm-node').forEach((el, i) => el.style.setProperty('--i', i));
    if (showCard && window.Anim) Anim.once(root.querySelector('.wm-card-tv'), `wm:${latest.id}`, 'unfold');
    const pop = root.querySelector('.wm-dg-pop');
    if (pop) {
      if (root.dataset.dgPop !== '1' && window.Anim) Anim.play(pop.firstElementChild, 'unfold', null);
      window.Dungeon?.hydrate(pop, s.dungeon);
    }
    root.dataset.dgPop = pop ? '1' : '';
  }

  // The dungeon pop-up (Mike, Nov 15): while the party stands on a dungeon entrance and the DM has opened it,
  // the dungeon's rooms show over the world map for everyone. Only discovered rooms reach the table.
  const dungeonOn = (s) => !!(s.dungeon?.on && s.dungeon.nodes?.length && window.Dungeon);
  function dungeonPop(s, here, opts = {}) {
    if (!dungeonOn(s)) return '';
    const exit = s.dungeon.canExit ? '<small class="wm-dg-exit ok">The way out is here</small>' : '<small class="wm-dg-exit">Leave from the entrance or the end</small>';
    return `<div class="wm-dg-pop"><div class="wm-dg-box">
      <header class="wm-dg-head"><b>🏰 ${esc(here?.name || 'The dungeon')}</b>${exit}</header>
      ${Dungeon.board(s.dungeon, { dm: !!opts.dm, selected: opts.dm ? window.DungeonSel : null })}
    </div></div>`;
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

    // The party trail (src/trail.js): newest first. opts.max limits the rows.
  const TRAIL_ICON = { world: '🧭', enter: '⬇', leave: '⬆', room: '⚑' };
  const TRAIL_VERB = { world: 'At', enter: 'Entered', leave: 'Left', room: 'In' };
  function trail(list, opts = {}) {
    const rows = (list || []).slice(-(opts.max || 30)).reverse();
    if (!rows.length) return '<p class="note">No places yet.</p>';
    return `<ol class="wm-trail">${rows.map((e) => `<li class="k-${esc(e.kind)}"><span>${TRAIL_ICON[e.kind] || '•'}</span> ${TRAIL_VERB[e.kind] || 'At'} <b>${esc(e.where)}</b>${e.day ? ` <small>Day ${esc(e.day)}</small>` : ''}</li>`).join('')}</ol>`;
  }

  window.WorldMap = { esc, posAt, board, voteLine, card, tv, byId, route, roadOf, tripLine, trail };
})();
