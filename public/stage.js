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

  function hpBar(c) {
    const pct = Math.round((100 * c.hp) / c.maxHp);
    const tone = pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'crit';
    return `<div class="hp ${tone}"><i style="width:${pct}%"></i><span>${c.hp}/${c.maxHp}</span></div>`;
  }

  // Character avatar: uploaded portrait, or the procedural face tinted with the character's hue.
  function avatar(p, cls = '') {
    if (!p) return '';
    return p.portrait
      ? `<img class="av ${cls}" src="${esc(p.portrait)}" alt="" style="--hue:${p.hue ?? 40}">`
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

  function exploration(s) {
    const sc = s.scene;
    return `<div class="explore">
      <h1>${esc(sc.title)}</h1>
      <p class="scene-text">${esc(sc.text)}</p>
      <div class="poi">${sc.poi.map((p) => `<span>🔍 ${esc(p)}</span>`).join('')}</div>
      ${checkBanner(s)}
    </div>`;
  }

  function combat(s) {
    const c = s.combat;
    const byId = Object.fromEntries([...s.players, ...c.enemies].map((x) => [x.id, x]));
    const turn = c.active ? c.order[c.turn]?.id : null;
    return `<div class="combat">
      <div class="init">${c.active ? `<span class="round">Round ${c.round}</span>` : '<span class="round">Combat (not started)</span>'}
        ${c.order.map((o) => byId[o.id] ? `<span class="${o.id === turn ? 'now' : ''} ${byId[o.id].enemy ? 'en' : 'al'} ${byId[o.id].hp === 0 ? 'dead' : ''}">${byId[o.id].enemy ? '' : avatar(byId[o.id], 'av-chip')}${o.init} ${esc(byId[o.id].name)}</span>` : '').join('')}</div>
      ${byId[turn] && !byId[turn].enemy ? `<div class="turn-card" style="${accent(byId[turn])}">${avatar(byId[turn], 'av-turn')}<div><small>Your move</small><b>${esc(byId[turn].name)}</b>${byId[turn].catchphrase ? `<q>${esc(byId[turn].catchphrase)}</q>` : ''}</div></div>` : ''}
      <div class="foes">${c.enemies.map((e) => `
        <div class="foe ${e.hp === 0 ? 'dead' : ''} ${turn === e.id ? 'turn' : ''}">
          <div class="foe-icon">${e.hp === 0 ? '💀' : '👹'}</div><b>${esc(e.name)}</b><small>AC ${e.ac}</small>${hpBar(e)}
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
    const ui = layers(root, s);
    ui.innerHTML = `
      <header class="stage-top">
        <div class="mode-pill">${MODE_ICON[s.mode]} ${s.mode}</div>
        <div class="join"><img src="/qr.svg?r=${esc(s.room)}" alt="Join QR"><div><b>Join the party</b><span class="room-code">Room <b>${esc(s.room)}</b></span><code>${esc(s.joinUrl.replace(/\/play\?room=.*/, '/j/' + s.room))}</code><small>${s.players.length} adventurer${s.players.length === 1 ? '' : 's'}</small></div></div>
      </header>
      <main class="stage-main">
        <section class="stage-center">${s.mode === 'social' ? vn(s) : s.mode === 'combat' ? combat(s) : exploration(s)}</section>
        <aside class="stage-log">${logFeed(s)}</aside>
      </main>
      <footer>${party(s)}</footer>
      ${spotlightCard(s)}`;
    const p = ui.querySelector('.vn-portrait');
    if (p && prevEmo && prevEmo !== s.social.npc.emotion) p.classList.add('changed');
  }

  window.Stage = { stage, vn, portrait, avatar, hpBar, logFeed, checkBanner, esc, EMO };
})();
