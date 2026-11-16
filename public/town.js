// Town maps (PR V): one drawing for the TV, the DM page and the phones. A town is a picture with places on it;
// the server sends only discovered places to the table (src/town.js viewFor). The party token glides from
// place to place. Also the Enter Town gate on the TV, and the hover list of what a town has on the world map.
// Classic script: exposes the global Town.
(function () {
  const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
  const ICON = { entrance: '🚪', farm: '🌾', market: '🛒', smithy: '⚒', tower: '🔮', inn: '🍺', temple: '⛪', house: '🏠', guild: '🛡', dock: '⚓', other: '📍' };
  const KINDS = Object.keys(ICON);
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const segs = (n) => (n ? `${n} segment${n === 1 ? '' : 's'}` : 'no time');

  // The board. t: the town view (or { nodes, here } for a DM map being edited). opts: { dm, selected, pick, key }.
  function board(t, opts = {}) {
    const here = t.nodes.find((n) => n.id === t.here);
    const counts = t.tally?.counts || {};
    const nodes = t.nodes.map((n) => {
      const c = counts[n.id] || 0;
      const cls = ['tn-node', `k-${n.kind}`, n.id === t.here ? 'here' : '', n.id === opts.selected ? 'sel' : '', n.id === opts.pick ? 'pick' : '', !n.seen ? 'unseen' : '', n.visited ? 'visited' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" data-tn="${esc(n.id)}" style="left:${pct(n.x)};top:${pct(n.y)}">
        <i>${ICON[n.kind] || '📍'}</i><span>${esc(n.name)}${opts.dm && !n.seen ? ' <small>(hidden)</small>' : ''}</span>
        ${c ? `<b class="tn-count" title="Confirmed">${c}</b>` : ''}
      </div>`;
    }).join('');
    const token = here ? `<div class="tn-token" data-tn-token="${esc(opts.key || 'board')}" style="left:${pct(here.x)};top:${pct(here.y)}"><span>⚑</span></div>` : '';
    const pic = t.image ? `<img src="${esc(t.image)}" alt="">` : '<div class="tn-blank" aria-hidden="true"></div>';
    return `<div class="tn-board ${opts.dm ? 'dm' : ''}"><div class="tn-pic">${pic}<div class="tn-layer">${nodes}${token}</div></div></div>`;
  }

  // After drawing: the party token glides from where it was last drawn (per board key), and new places pop in.
  const lastPos = {};
  const lastSeen = {};
  function hydrate(root, opts = {}) {
    const key = opts.key || 'board';
    const tok = root.querySelector('.tn-token');
    if (tok) {
      const now = { x: parseFloat(tok.style.left), y: parseFloat(tok.style.top) };
      const was = lastPos[key];
      lastPos[key] = now;
      const pic = root.querySelector('.tn-pic');
      if (was && (was.x !== now.x || was.y !== now.y) && pic && tok.animate && !(window.Anim?.reduced?.())) {
        const r = pic.getBoundingClientRect();
        const dx = ((was.x - now.x) / 100) * r.width;
        const dy = ((was.y - now.y) / 100) * r.height;
        tok.animate([{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` }, { transform: 'translate(-50%, -50%)' }], { duration: 1400, easing: 'cubic-bezier(.45,.05,.3,1)' });
      }
    }
    const ids = [...root.querySelectorAll('[data-tn]')].map((el) => el.dataset.tn);
    const seen = lastSeen[key];
    if (seen) root.querySelectorAll('[data-tn]').forEach((el) => { if (!seen.has(el.dataset.tn)) el.classList.add('tn-new'); });
    lastSeen[key] = new Set(ids);
  }

  // The hover list on the world map: what a town has (discovered places for the table, every place for the DM).
  function contents(c) {
    if (!c) return '';
    const rows = c.places.map((p) => `<li class="${p.seen ? '' : 'hid'}">${ICON[p.kind] || '📍'} ${esc(p.name)}${p.seen ? '' : ' <small>(hidden)</small>'}</li>`).join('');
    const more = c.hidden ? `<li class="more">❔ ${c.hidden} place${c.hidden === 1 ? '' : 's'} not yet found</li>` : '';
    return `<ul class="wm-has">${rows || (more ? '' : '<li class="more">Nothing found yet</li>')}${more}</ul>`;
  }

  // The town pop-up over the world map on the TV (and the DM preview): the town, where the party is, and how
  // many players have chosen where to go next.
  function pop(s, opts = {}) {
    const t = s.town;
    if (!t?.on) return '';
    const here = t.nodes.find((n) => n.id === t.here);
    const tal = t.tally;
    const line = tal ? `${tal.confirmed} / ${tal.total} chose where to go` : '';
    return `<div class="wm-dg-pop tn-pop"><div class="wm-dg-box tn-box">
      <header class="wm-dg-head"><b>🏘 ${esc(t.name || 'Town')}</b><small class="tn-here">${here ? `${ICON[here.kind] || '📍'} ${esc(here.name)}` : ''}</small><small class="tn-line">${esc(line)}</small></header>
      ${board(t, { dm: !!opts.dm, key: opts.dm ? 'dm-pop' : 'tv' })}
    </div></div>`;
  }

  // The Enter Town gate on the TV: like the dungeon gate (public/dungeon.js tvGate).
  let gateEl = null;
  let gateKey = '';
  function tvGate(s) {
    const g = s?.town?.gate;
    if (!g) {
      if (gateEl && !gateEl.classList.contains('out')) { gateEl.classList.add('out'); const el = gateEl; setTimeout(() => { el.remove(); if (gateEl === el) gateEl = null; }, 450); }
      gateKey = '';
      return;
    }
    if (!gateEl || gateEl.classList.contains('out')) {
      gateEl?.remove();
      gateEl = document.createElement('div');
      gateEl.className = 'dg-gate tn-gate';
      document.body.appendChild(gateEl);
      gateKey = '';
    }
    const key = JSON.stringify(g);
    if (key === gateKey) return;
    const before = gateKey ? JSON.parse(gateKey).ready.length : null;
    gateKey = key;
    const art = g.image ? `<img src="${esc(g.image)}" alt="">` : '<div class="dg-gate-arch tn-gate-art" aria-hidden="true"><span>🏘</span></div>';
    const pips = Array.from({ length: g.total }, (_, i) => `<i class="${i < g.ready.length ? 'on' : ''}"></i>`).join('');
    gateEl.innerHTML = `<div class="dg-gate-card">
      <div class="dg-gate-art">${art}</div>
      <div class="dg-gate-text">
        <small>A settlement</small>
        <h2>${esc(g.name)}</h2>
        ${g.info ? `<p>${esc(g.info)}</p>` : ''}
        <div class="dg-gate-count"><b>${g.ready.length}</b> / ${g.total} ready</div>
        <div class="dg-gate-pips">${pips}</div>
        <p class="dg-gate-hint">Hold <b>Enter Town</b> on your phone</p>
      </div>
    </div>`;
    if (before !== null && before !== g.ready.length) gateEl.querySelector('.dg-gate-count b')?.classList.add('bump');
  }

  window.Town = { ICON, KINDS, board, hydrate, contents, pop, tvGate, segs };
})();
