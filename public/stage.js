// Shared rendering for the TV stage, DM preview and phone mini-views.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const EMO = {
    neutral:    { icon: '😐', label: 'Neutral',    brows: [[95, 95], [95, 95]], eyes: 'open',   mouth: 'M85 168 L115 168' },
    happy:      { icon: '😊', label: 'Happy',      brows: [[90, 88], [88, 90]], eyes: 'smile',  mouth: 'M80 162 Q100 186 120 162 Z' },
    angry:      { icon: '😠', label: 'Angry',      brows: [[88, 102], [102, 88]], eyes: 'narrow', mouth: 'M82 176 Q100 160 118 176' },
    sad:        { icon: '😢', label: 'Sad',        brows: [[100, 88], [88, 100]], eyes: 'open',   mouth: 'M86 176 Q100 165 114 176', tear: true },
    fearful:    { icon: '😨', label: 'Fearful',    brows: [[94, 84], [84, 94]], eyes: 'wide',   mouth: 'M86 172 Q93 164 100 172 Q107 180 114 172' },
    surprised:  { icon: '😲', label: 'Surprised',  brows: [[84, 82], [82, 84]], eyes: 'wide',   mouth: 'O' },
    suspicious: { icon: '🤨', label: 'Suspicious', brows: [[98, 99], [86, 92]], eyes: 'narrow', mouth: 'M86 171 L114 166' },
    smug:       { icon: '😏', label: 'Smug',       brows: [[92, 94], [88, 90]], eyes: 'lidded', mouth: 'M84 168 Q106 176 120 159' },
  };

  function eyes(kind) {
    const out = [];
    for (const cx of [75, 125]) {
      if (kind === 'smile') out.push(`<path d="M${cx - 8} 118 Q${cx} 108 ${cx + 8} 118" class="ln"/>`);
      else if (kind === 'narrow') out.push(`<ellipse cx="${cx}" cy="116" rx="8" ry="3" class="pupil"/>`);
      else if (kind === 'wide') out.push(`<ellipse cx="${cx}" cy="115" rx="10" ry="12" fill="#fff" class="ln"/><circle cx="${cx}" cy="116" r="4.5" class="pupil"/>`);
      else if (kind === 'lidded') out.push(`<ellipse cx="${cx}" cy="117" rx="7" ry="5" class="pupil"/><path d="M${cx - 10} 113 L${cx + 10} 113" class="ln"/>`);
      else out.push(`<ellipse cx="${cx}" cy="116" rx="6" ry="8" class="pupil"/>`);
    }
    return out.join('');
  }

  // Procedural NPC portrait whose expression is driven by the DM's emotion buttons.
  function portrait(emotion = 'neutral', hue = 28) {
    const e = EMO[emotion] || EMO.neutral;
    const [[lo, li], [ri, ro]] = e.brows;
    const mouth = e.mouth === 'O'
      ? '<ellipse cx="100" cy="172" rx="9" ry="12" fill="#3a1d1d"/>'
      : `<path d="${e.mouth}" class="ln" ${e.mouth.endsWith('Z') ? 'fill="#5a2424"' : 'fill="none"'}/>`;
    return `<svg viewBox="0 0 200 260" class="portrait emo-${emotion}" aria-label="${esc(e.label)} NPC">
      <defs><radialGradient id="sk${hue}" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="hsl(28 55% 78%)"/><stop offset="1" stop-color="hsl(22 45% 60%)"/></radialGradient></defs>
      <path d="M20 260 Q30 200 100 196 Q170 200 180 260 Z" fill="hsl(${hue} 45% 30%)"/>
      <path d="M70 200 L100 228 L130 200" fill="none" stroke="hsl(${hue} 60% 65%)" stroke-width="4"/>
      <rect x="85" y="180" width="30" height="24" fill="hsl(22 45% 62%)"/>
      <path d="M34 130 Q28 40 100 36 Q172 40 166 130 Q160 70 100 66 Q40 70 34 130 Z" fill="hsl(${hue} 35% 22%)"/>
      <ellipse cx="100" cy="122" rx="60" ry="74" fill="url(#sk${hue})"/>
      <path d="M40 104 Q50 54 100 52 Q150 54 160 104 Q140 76 100 80 Q60 76 40 104 Z" fill="hsl(${hue} 35% 22%)"/>
      <ellipse cx="62" cy="146" rx="10" ry="6" fill="hsl(0 70% 70% / ${emotion === 'happy' || emotion === 'smug' ? 0.55 : 0.18})"/>
      <ellipse cx="138" cy="146" rx="10" ry="6" fill="hsl(0 70% 70% / ${emotion === 'happy' || emotion === 'smug' ? 0.55 : 0.18})"/>
      <path d="M62 ${lo} L88 ${li}" class="brow"/><path d="M112 ${ri} L138 ${ro}" class="brow"/>
      ${eyes(e.eyes)}
      <path d="M100 124 Q96 142 92 146 Q100 150 106 146" fill="none" class="ln" stroke-width="2"/>
      ${mouth}
      ${e.tear ? '<path d="M128 128 Q124 140 128 146 Q132 140 128 128 Z" fill="#8fd3ff"/>' : ''}
    </svg>`;
  }

  // Typewriter that survives re-renders: it writes into whichever #id element currently exists.
  const tw = { key: null, text: '', i: 0, timer: null };
  function typewrite(id, key, text) {
    if (tw.key !== key) {
      clearInterval(tw.timer);
      Object.assign(tw, { key, text, i: 0 });
      if (window.Settings?.reducedMotion()) { tw.i = text.length; return esc(text); }
      tw.timer = setInterval(() => {
        tw.i = Math.min(tw.text.length, tw.i + 1);
        document.querySelectorAll(`[data-tw="${id}"]`).forEach((el) => (el.textContent = tw.text.slice(0, tw.i)));
        if (tw.i >= tw.text.length) clearInterval(tw.timer);
      }, 24);
    }
    return esc(tw.text.slice(0, tw.i));
  }

  // Enemy health as pips (item 7b): no numbers on the TV, so the table can't read exact HP.
  function pips(c) {
    const n = 5; const filled = c.hp <= 0 ? 0 : Math.max(1, Math.ceil((n * c.hp) / c.maxHp));
    return `<div class="pips-hp" aria-label="${c.hp <= 0 ? 'down' : `${filled} of ${n} health`}">${Array.from({ length: n }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</div>`;
  }
  function hpBar(c) {
    const pct = Math.round((100 * c.hp) / c.maxHp);
    const tone = pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'crit';
    return `<div class="hp ${tone}"><i style="width:${pct}%"></i><span>${c.hp}/${c.maxHp}</span></div>`;
  }

  // Character avatar: uploaded portrait, or the procedural face tinted with the character's hue.
  function avatar(p, cls = '') {
    if (!p) return '';
    return p.portrait
      ? Anim.media(p.portrait, `av ${cls}`, `--hue:${p.hue ?? 40}`)
      : `<span class="av ${cls}" style="--hue:${p.hue ?? 40}">${portrait('neutral', p.hue ?? 40)}</span>`;
  }
  const accent = (p) => `--hue:${p.hue ?? 40}`;

  function vn(s, { compact = false } = {}) {
    const { npc, line, caption } = s.social;
    const emo = line.player ? 'neutral' : line.emotion;
    const key = `${line.speaker}|${line.text}`;
    const text = typewrite('vn', key, line.text);
    const pc = line.player && s.players.find((p) => p.id === line.pid);
    return `<div class="vn ${compact ? 'compact' : ''} ${pc ? 'pc-speaking' : ''}">
      <div class="vn-portrait bounce-${npc.emotion}" data-emo="${npc.emotion}">${portrait(npc.emotion, npc.hue)}</div>
      ${pc ? `<div class="vn-pc" style="${accent(pc)}">${avatar(pc, 'av-vn')}</div>` : ''}
      <div class="vn-box emo-${emo} ${line.player ? 'player-line' : ''}" style="${pc ? accent(pc) : ''}">
        <div class="vn-name">${esc(line.speaker)}${line.player ? '' : ` <small>${EMO[npc.emotion].icon}</small>`}</div>
        <div class="vn-text"><span data-tw="vn">${text}</span></div>
        ${caption ? `<div class="vn-caption">🎙 ${esc(caption)}…</div>` : ''}
        ${!compact && s.social.choices.length ? `<ol class="vn-choices">${s.social.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
      </div>
    </div>`;
  }

  function party(s) {
    if (!s.players.length) return '<div class="party empty">Scan the QR code to join the party</div>';
    const turn = s.combat.active ? s.combat.order[s.combat.turn]?.id : null;
    return `<div class="party">${s.players.map((p) => `
      <div class="pc ${p.hp === 0 ? 'down' : ''} ${turn === p.id ? 'turn' : ''} ${p.online ? '' : 'offline'}" style="${accent(p)}">
        ${avatar(p, 'av-pc')}
        <div class="pc-info"><b>${esc(p.name)}</b><small>${esc([p.race, p.cls].filter(Boolean).join(' '))} ${p.level > 1 ? `${p.level}` : ''} · AC ${p.ac}${p.player ? ` · ${esc(p.player)}` : ''}</small>${hpBar(p)}</div>
      </div>`).join('')}</div>`;
  }

  function logFeed(s, n = 9) {
    return `<ul class="log">${s.log.slice(-n).map((l) => `
      <li class="k-${l.kind} ${l.tone ? 't-' + l.tone : ''}">${l.who ? `<b>${esc(l.who)}:</b> ` : ''}${l.roll === 20 ? '<em class="nat">NAT 20</em> ' : l.roll === 1 ? '<em class="nat one">NAT 1</em> ' : ''}${esc(l.text)}</li>`).join('')}</ul>`;
  }

  function checkBanner(s) {
    const c = s.check;
    if (!c) return '';
    const res = Object.values(c.results);
    return `<div class="check-banner"><b>${esc(c.skill)} check</b> · DC ${c.dc}
      <div class="check-res">${res.map((r) => `<span class="${r.pass ? 'pass' : 'fail'}">${esc(r.name)} ${r.total}</span>`).join('') || '<span class="wait">Roll on your phone!</span>'}</div></div>`;
  }

  // Fog of war (item 7c): POIs the party has not uncovered show as fog.
  function exploration(s) {
    const sc = s.scene;
    // The server sends null for a covered point unless the viewer is the DM.
    const open = new Set(sc.revealed || []);
    const poi = sc.poi.map((p) => (p !== null && open.has(p) ? `<span>🔍 ${esc(p)}</span>` : '<span class="fog">☁ ???</span>')).join('');
    return `<div class="explore">
      <h1>${esc(sc.title)}</h1>
      <p class="scene-text">${esc(sc.text)}</p>
      <div class="poi">${poi}</div>
      ${checkBanner(s)}
    </div>`;
  }

  // Battle map (24, 25): the uploaded map under a grid, tokens by tile, fliers shown with height.
  function battleMap(s) {
    const m = s.map;
    const all = [...s.players, ...s.combat.enemies];
    const byId = Object.fromEntries(all.map((x) => [x.id, x]));
    const turn = s.combat.active ? s.combat.order[s.combat.turn]?.id : null;
    const tiles = [];
    for (const [k, kind] of Object.entries(m.terrain || {})) { const [x, y] = k.split(',').map(Number); tiles.push(`<i class="t-${kind}" style="left:${(100 * x) / m.cols}%;top:${(100 * y) / m.rows}%;width:${100 / m.cols}%;height:${100 / m.rows}%"></i>`); }
    const toks = Object.entries(s.tokens || {}).filter(([id]) => byId[id]).map(([id, t]) => {
      const c = byId[id];
      const side = c.side ? c.side : c.enemy ? 'enemy' : 'player';
      return `<div class="tok side-${side} ${turn === id ? 'now' : ''} ${c.hp === 0 ? 'down' : ''}" style="left:${(100 * t.x) / m.cols}%;top:${(100 * t.y) / m.rows}%;width:${100 / m.cols}%;height:${100 / m.rows}%">
        <span>${esc((c.name || '?')[0])}</span>${t.z ? `<em class="z">↑${t.z}</em>` : ''}</div>`;
    }).join('');
    return `<div class="bmap" style="aspect-ratio:${m.cols} / ${m.rows}">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''}
      <div class="grid" style="background-size:${100 / m.cols}% ${100 / m.rows}%"></div>${tiles}${toks}</div>`;
  }

  function combat(s) {
    if (s.map) return `<div class="combat">${battleMap(s)}</div>`;
    const c = s.combat;
    const byId = Object.fromEntries([...s.players, ...c.enemies].map((x) => [x.id, x]));
    const turn = c.active ? c.order[c.turn]?.id : null;
    return `<div class="combat">
      <div class="init">${c.active ? `<span class="round">Round ${c.round}</span>` : '<span class="round">Combat (not started)</span>'}
        ${c.order.map((o) => byId[o.id] ? `<span class="${o.id === turn ? 'now' : ''} ${byId[o.id].enemy ? 'en' : 'al'} ${byId[o.id].hp === 0 ? 'dead' : ''}">${byId[o.id].side ? '' : avatar(byId[o.id], 'av-chip')}${o.init} ${esc(byId[o.id].name)}${conds(byId[o.id])}</span>` : '').join('')}</div>
      ${byId[turn] && !byId[turn].enemy ? `<div class="turn-card" style="${accent(byId[turn])}">${avatar(byId[turn], 'av-turn')}<div><small>Your move</small><b>${esc(byId[turn].name)}</b>${byId[turn].catchphrase ? `<q>${esc(byId[turn].catchphrase)}</q>` : ''}</div></div>` : ''}
      <div class="foes">${c.enemies.map((e) => `
        <div class="foe side-${e.side || 'enemy'} ${e.hp === 0 ? 'dead' : ''} ${turn === e.id ? 'turn' : ''}">
          <div class="foe-icon">${e.hp === 0 ? '💀' : e.image ? Anim.media(e.image, 'foe-art') : SIDE_ICON[e.side] || '👹'}</div><b>${esc(e.name)}</b><small>AC ${e.ac}</small>${pips(e)}
        </div>`).join('') || '<p class="muted">No enemies yet.</p>'}</div>
    </div>`;
  }

  // Big character moment on the TV: DM intro, or a natural 20.
  function spotlightCard(s) {
    const sp = s.spotlight;
    const p = sp && s.players.find((x) => x.id === sp.id);
    if (!p) return '';
    return `<div class="spotlight ${sp.kind}" style="${accent(p)}">
      <div class="sp-card">${avatar(p, 'av-sp')}
        <div class="sp-text">${sp.kind === 'nat20' ? '<div class="sp-kicker">NATURAL 20!</div>' : '<div class="sp-kicker">Introducing</div>'}
          <h2>${esc(p.name)}</h2>
          <p>${esc([p.race, p.cls].filter(Boolean).join(' '))}${p.level ? ` · Level ${p.level}` : ''}${p.player ? ` · played by ${esc(p.player)}` : ''}</p>
          ${p.catchphrase ? `<q>${esc(p.catchphrase)}</q>` : ''}
        </div>
      </div>
    </div>`;
  }

  // A TV opened remotely (/screen?key=DM_KEY) passes the key on so it may show the join QR.
  const KEY_QS = (() => { const k = new URLSearchParams(location.search).get('key'); return k ? `&key=${encodeURIComponent(k)}` : ''; })();
  const SIDE_ICON = { enemy: '👹', ally: '🛡', neutral: '🕊' };
  const MODE_ICON = { exploration: '🧭', combat: '⚔️', social: '💬' };

  // Backdrop and effect layers persist across re-renders so videos and animations don't restart.
  function layers(root, s) {
    if (!root.querySelector(':scope > .bd')) {
      root.innerHTML = '<div class="bd"></div><div class="fx"></div><div class="stage-ui"></div>';
    }
    const bd = root.querySelector(':scope > .bd');
    const img = s.backdrop?.image;
    const key = img ? img.url : '';
    if (bd.dataset.key !== key) {
      bd.dataset.key = key;
      bd.innerHTML = !img ? '' : img.video
        ? `<video src="${esc(img.url)}" autoplay muted loop playsinline></video>`
        : `<img src="${esc(img.url)}" alt="">`;
    }
    const fx = root.querySelector(':scope > .fx');
    const fxKey = (s.backdrop?.effects || []).join(',');
    if (fx.dataset.key !== fxKey) {
      fx.dataset.key = fxKey;
      fx.innerHTML = (s.backdrop?.effects || []).map((e) => `<div class="fx-${e}"></div>`).join('');
    }
    return root.querySelector(':scope > .stage-ui');
  }

  function stage(root, s) {
    const prevEmo = root.querySelector('.vn-portrait')?.dataset.emo;
    root.className = `stage theme-${s.scene.theme} mode-${s.mode} ${s.backdrop?.image ? 'has-bd' : ''}`;
    root.classList.add(`light-${s.scene.light || 'day'}`);
    for (const l of ['day', 'dusk', 'night', 'dawn', 'torchlight']) if (l !== (s.scene.light || 'day')) root.classList.remove(`light-${l}`);
    const ui = layers(root, s);
    ui.innerHTML = `
      <header class="stage-top">
        <div class="mode-pill">${MODE_ICON[s.mode]} ${s.mode}</div>
        ${s.room ? `<div class="join"><img src="/qr.svg?r=${esc(s.room)}${KEY_QS}" alt="Join QR"><div><b>Join the party</b><span class="room-code">Room <b>${esc(s.room)}</b></span><code>${esc(s.joinUrl.replace(/\/play\?room=.*/, '/j/' + s.room))}</code><small>${s.players.length} adventurer${s.players.length === 1 ? '' : 's'}</small></div></div>` : ''}
      </header>
      <main class="stage-main">
        <section class="stage-center">${s.mode === 'social' ? vn(s) : s.mode === 'combat' ? combat(s) : exploration(s)}</section>
        <aside class="stage-log">${logFeed(s)}</aside>
      </main>
      <footer>${party(s)}</footer>
      ${spotlightCard(s)}${bossCard(s)}${memorialCard(s)}${clocks(s)}${shared(s)}`;
    const p = ui.querySelector('.vn-portrait');
    if (p && prevEmo && prevEmo !== s.social.npc.emotion) p.classList.add('changed');
    Anim.hydrate(ui);
    const mc = ui.querySelector('.memorial');
    if (mc && mc.dataset.n !== root.dataset.memN) { root.dataset.memN = mc.dataset.n; Anim.once(mc, `mem:${mc.dataset.n}`, 'pop'); }
    const bc = ui.querySelector('.boss-card');
    if (bc && bc.dataset.n !== root.dataset.bossN) { root.dataset.bossN = bc.dataset.n; Anim.once(bc, `boss:${bc.dataset.n}`, 'pop'); }
    if (s.spotlight) {
      const who = s.players.find((x) => x.id === s.spotlight.id);
      Anim.once(ui.querySelector('.sp-card'), `${s.spotlight.id}:${s.spotlight.kind}`, s.spotlight.kind === 'nat20' ? 'bounce' : 'pop', who);
    }
  }

  // Segment clocks (17): a pie of segments on the TV, filled as the DM advances them.
  function clocks(s) {
    if (!s.clocks?.length) return '';
    return `<div class="clocks">${s.clocks.map((k) => `<div class="clock"><small>${esc(k.name)}</small><div class="pie" style="--n:${k.segments}">${Array.from({ length: k.segments }, (_, i) => `<i class="${i < k.filled ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}</div>`;
  }
  // Conditions (16): small chips under a combatant's name.
  const conds = (x) => (x?.conditions?.length ? `<em class="conds">${x.conditions.map((c) => esc(c)).join(', ')}</em>` : '');

  // Shared handouts (Phase 4) and the open vote on the TV. Only items the group shared reach here.
  function shared(s) {
    const items = (s.handouts || []).filter((h) => h.kind === 'handout' && h.vis?.screen).slice(-2);
    const v = s.vote;
    if (!items.length && !(v && v.options)) return '';
    return `<div class="shared">${items.map((h) => `<div class="hand"><b>${esc(h.title)}</b>${h.text ? `<p>${esc(h.text)}</p>` : ''}</div>`).join('')}${v && v.open ? `<div class="hand vote-tv"><b>The party votes</b>${v.options.map((o, i) => `<span>${esc(o)} <em>${v.counts?.[i] ?? 0}</em></span>`).join('')}</div>` : ''}</div>`;
  }

  // Memorial card (legacy.js): shown on the TV after a character falls, until the DM dismisses it.
  function memorialCard(s) {
    const m = s.memorial;
    if (!m) return '';
    return `<div class="memorial" data-n="${m.n}" style="${accent(m)}">
      <div class="mem-kicker">In memory of</div>
      ${avatar(m, 'av-mem')}
      <h2>${esc(m.name)}</h2>
      <p class="mem-sub">${esc([m.race, m.cls].filter(Boolean).join(' '))} · level ${m.level}</p>
      ${m.cause ? `<p class="mem-cause">${esc(m.cause)}</p>` : ''}
      ${m.epitaph ? `<blockquote>“${esc(m.epitaph)}”</blockquote>` : ''}
    </div>`;
  }

  // Boss title card (item 7b): a short banner over the stage when a boss fight opens.
  function bossCard(s) {
    const b = s.bossCard;
    if (!b || !s.combat.active) return '';
    return `<div class="boss-card" data-n="${b.n}"><div class="bc-kicker">A boss appears</div><h2>${esc(b.name)}</h2>${b.title ? `<p>${esc(b.title)}</p>` : ''}</div>`;
  }

  window.Stage = { stage, vn, portrait, avatar, hpBar, logFeed, checkBanner, esc, EMO };
})();
