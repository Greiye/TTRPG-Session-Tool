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

  // The map: picture, places and the party token. opts: { selected, dm, tv }.
  function board(s, opts = {}) {
    const wm = s.worldMap;
    const p = posAt(wm);
    const t = wm.travel;
    const to = t && byId(wm, t.to);
    const token = p
      ? `<div class="wm-token ${t ? 'moving' : ''}" ${t && to ? `data-travel="${t.fromPt.x},${t.fromPt.y},${to.x},${to.y},${t.startAt},${t.endAt}"` : ''} style="left:${pct(p.x)};top:${pct(p.y)}" title="The party"><span>⚑</span></div>`
      : '';
    const nodes = wm.nodes.map((n) => `<div class="wm-node ${n.id === wm.here ? 'here' : ''} ${n.id === opts.selected ? 'sel' : ''} ${n.revealed ? '' : 'unrevealed'}" data-node="${esc(n.id)}" style="left:${pct(n.x)};top:${pct(n.y)}"><i></i><span>${esc(n.name)}${opts.dm && !n.revealed ? ' <small>(hidden)</small>' : ''}</span></div>`).join('');
    const pic = wm.image ? `<img src="${esc(wm.image)}" alt="">` : '<div class="wm-blank"></div>';
    return `<div class="wm-board ${opts.tv ? 'tv' : ''}"><div class="wm-pic">${pic}<div class="wm-layer">${nodes}${token}</div></div></div>`;
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
    const to = wm.travel && byId(wm, wm.travel.to);
    const title = to ? `Travelling to ${to.name}` : here ? `At ${here.name}` : 'Where to next?';
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

  window.WorldMap = { esc, posAt, board, voteLine, card, tv, byId };
})();
