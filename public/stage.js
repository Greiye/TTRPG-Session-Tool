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
        document.querySelectorAll(`[data-tw="${id}"]`).forEach((el) => {
          el.textContent = tw.text.slice(0, tw.i);
          el.closest('.vn')?.classList.toggle('talking', tw.i < tw.text.length); // mouths move while text is typing
        });
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

  // Layered sprites (src/layered.js): stacked PNG layers from a character manifest, with state overrides.
  // Manifests load async; the placeholder is filled in by refillLayered() once they arrive.
  const layeredCache = new Map(); // url -> manifest | 'loading' | null (failed)
  const canWebm = (() => { try { return document.createElement('video').canPlayType('video/webm; codecs="vp9"') !== ''; } catch { return false; } })();
  const SAFARI = /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
  function loadManifest(url) {
    if (!layeredCache.has(url)) {
      layeredCache.set(url, 'loading');
      fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => { layeredCache.set(url, m); refillLayered(); });
    }
    const v = layeredCache.get(url);
    return v === 'loading' ? null : v;
  }
  // Per-device choices (Settings): playback WebM or sheet, and animation on or off (Static). The phone's
  // profile editor is always static, so its portrait never moves while being edited.
  const profileOpen = () => !!document.querySelector('#profile:not([hidden])');
  const stillNow = () => window.Settings?.get().anim === 'off' || profileOpen();
  const useSheet = () => {
    const pb = window.Settings?.get().sprite || 'auto';
    if (pb === 'sheet') return true;
    if (pb === 'webm') return !canWebm;
    return !canWebm || SAFARI;
  };
  function layeredInner(id, state) {
    const dir = `/uploads/layered/${id}/`;
    const m = loadManifest(dir + 'manifest.json');
    if (!m) return '';
    const baseDir = m.base ? `/uploads/layered/${m.base}/` : dir;
    const ov = (m.states || {})[state] || {};
    const replaced = new Set(Object.keys(ov));
    const shown = new Set(m.layers.map((l) => l.id).filter((x) => !replaced.has(x)).concat(Object.values(ov)));
    const pieces = m.layers
      .filter((l) => shown.has(l.id))
      .map((l) => ({ z: l.z, html: `<img class="lay-l" alt="" src="${(l.from === 'base' ? baseDir : dir) + l.file}">` }));
    const still = stillNow();
    for (const a of still ? [] : m.animations || []) {
      if (useSheet()) {
        pieces.push({ z: a.z, html: `<div class="lay-l lay-sheet" data-sheet="${dir}anim/${a.name}.sheet" data-frames="${a.frames}" data-fps="${a.fps}" data-kind="${a.kind}"></div>` });
      } else {
        pieces.push({ z: a.z, html: `<video class="lay-l" data-kind="${a.kind}" src="${dir}anim/${a.name}.webm" autoplay loop muted playsinline></video>` });
      }
    }
    return pieces.sort((a, b) => a.z - b.z).map((p) => p.html).join('');
  }
  // Sprite placeholder for a character or NPC: { id, state } points at uploads/layered/<id>/.
  function layeredSprite(id, state, cls = '') {
    return `<span class="lay ${cls}" data-lay="${esc(id)}|${esc(state || 'neutral')}">${layeredInner(id, state || 'neutral')}</span>`;
  }
  function refillLayered() {
    if (typeof document === 'undefined') return;
    for (const el of document.querySelectorAll('[data-lay]')) {
      const [id, state] = el.dataset.lay.split('|');
      const inner = layeredInner(id, state);
      if (el.dataset.filled !== inner) { el.innerHTML = inner; el.dataset.filled = inner; }
    }
  }
  // One ticker drives every sprite-sheet animation: frame k lives in sheet floor(k/12), cell k%12 of a 4x3 grid.
  const SHEET_COLS = 4, SHEET_ROWS = 3;
  // Mouth layers move only for the speaker while its line is typing (typewriter mouth sync).
  const talking = (el) => {
    const vn = el.closest('.vn.talking');
    if (!vn) return false;
    if (el.closest('.vn-pc-l.speaking')) return true;
    return !!el.closest('.vn-portrait') && !vn.classList.contains('pc-speaking');
  };
  setInterval(() => {
    const t = performance.now();
    for (const v of document.querySelectorAll('video[data-kind="mouth"]')) {
      const want = talking(v);
      if (want && v.paused) v.play().catch(() => {});
      else if (!want && !v.paused) v.pause();
    }
    for (const el of document.querySelectorAll('.lay-sheet')) {
      const frames = +el.dataset.frames, fps = +el.dataset.fps;
      const k = el.dataset.kind === 'mouth' && !talking(el) ? 0 : Math.floor((t / 1000) * fps) % frames;
      const sheet = Math.floor(k / (SHEET_COLS * SHEET_ROWS));
      const cell = k % (SHEET_COLS * SHEET_ROWS);
      const col = cell % SHEET_COLS, row = Math.floor(cell / SHEET_COLS);
      el.style.backgroundImage = `url(${el.dataset.sheet}${sheet}.png)`;
      el.style.backgroundSize = `${SHEET_COLS * 100}% ${SHEET_ROWS * 100}%`;
      el.style.backgroundPosition = `${(col / (SHEET_COLS - 1)) * 100}% ${(row / (SHEET_ROWS - 1)) * 100}%`;
    }
  }, 42);

  // Character avatar: layered sprite, uploaded portrait, or the procedural face tinted with the character's hue.
  function avatar(p, cls = '') {
    if (!p) return '';
    if (p.sprite) return layeredSprite(p.sprite.id, p.sprite.state, `av ${cls}`);
    return p.portrait
      ? Anim.media(p.portrait, `av ${cls}`, `--hue:${p.hue ?? 40}`)
      : `<span class="av ${cls}" style="--hue:${p.hue ?? 40}">${portrait('neutral', p.hue ?? 40)}</span>`;
  }
  const accent = (p) => `--hue:${p.hue ?? 40}`;

  // Phase 3 scene: party portraits on the left (up to 3), the cast on the right (up to 5, focus enlarged), dialogue below.
  const MAX_PARTY = 3;
  function vn(s, { compact = false } = {}) {
    const { npc, line, caption } = s.social;
    const cast = s.social.cast || [];
    const emo = line.emotion || 'neutral';
    const key = `${line.speaker}|${line.text}`;
    const text = typewrite('vn', key, line.text);
    const pc = line.player && s.players.find((p) => p.id === line.pid);
    const left = s.players.slice(0, MAX_PARTY).map((p) => `
      <div class="vn-pc-l hold-zoom ${line.pid === p.id ? 'speaking' : ''}" style="${accent(p)}">${avatar(p, 'av-vn')}<small>${esc(p.name)}</small></div>`).join('');
    // Without a cast the single speaker stands on the right, as before.
    // A speaker who is not on the cast (or no cast yet) stands at the far right, enlarged.
    const inCast = cast.some((m) => m.id === npc.id);
    const members = [...cast, ...(inCast && cast.length ? [] : [{ id: npc.id || 'npc', name: npc.name, hue: npc.hue, emotion: npc.emotion, kind: 'npc', spoke: true }])];
    const right = members.map((m) => {
      const on = m.spoke || m.id === npc.id;
      if (m.kind === 'item') return `<div class="vn-cast-m item ${on ? 'on' : ''}"><span class="vn-item hold-zoom">${esc(m.icon || '🗝️')}</span><small>${esc(m.name)}</small></div>`;
      if (on) return `<div class="vn-cast-m on"><div class="vn-portrait hold-zoom bounce-${npc.emotion}" data-emo="${npc.emotion}">${npc.sprite ? layeredSprite(npc.sprite.id, npc.sprite.state || npc.emotion, 'vn-lay') : portrait(npc.emotion, npc.hue)}</div><small>${esc(npc.name)} <i>${EMO[npc.emotion].icon}</i></small></div>`;
      return `<div class="vn-cast-m"><div class="vn-portrait-s hold-zoom">${portrait(m.emotion || 'neutral', m.hue)}</div><small>${esc(m.name)}</small></div>`;
    }).join('');
    return `<div class="vn ${compact ? 'compact' : ''} ${pc ? 'pc-speaking' : ''}">
      <div class="vn-left">${left}</div>
      <div class="vn-right">${right}</div>
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

  // Only entries new since the last render slide in; re-rendering the whole log must not replay old animations.
  let logSeen = null;
  function logFeed(s, n = 9, hideKinds = null) {
    const shown = (hideKinds ? s.log.filter((l) => !hideKinds.has(l.kind)) : s.log).slice(-n);
    const first = !logSeen;
    const seen = logSeen || new Set();
    const fresh = (l) => !first && !seen.has(l.id);
    shown.forEach((l) => seen.add(l.id));
    logSeen = seen;
    return `<ul class="log">${shown.map((l) => `
      <li class="k-${l.kind} ${l.tone ? 't-' + l.tone : ''} ${fresh(l) ? 'new' : ''}">${l.who ? `<b>${esc(l.who)}:</b> ` : ''}${l.roll === 20 ? '<em class="nat">NAT 20</em> ' : l.roll === 1 ? '<em class="nat one">NAT 1</em> ' : ''}${esc(l.text)}</li>`).join('')}</ul>`;
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
    // Fog of war (Phase B, src/vision.js): tiles outside the party's sight are covered. The DM sees through it, dimmed.
    const vis = s.mapVision ? new Set(s.mapVision) : null;
    const fogDm = s.viewer?.role === 'dm' ? ' dm' : '';
    let fog = '';
    if (vis) for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) if (!vis.has(`${x},${y}`)) fog += `<i class="fog-t${fogDm}" style="left:${(100 * x) / m.cols}%;top:${(100 * y) / m.rows}%;width:${100 / m.cols}%;height:${100 / m.rows}%"></i>`;
    const toks = Object.entries(s.tokens || {}).filter(([id]) => byId[id]).map(([id, t]) => {
      const c = byId[id];
      const side = c.side ? c.side : c.enemy ? 'enemy' : 'player';
      const dm = s.viewer?.role === 'dm';
      const pending = (s.pendingPlace || [])[0] === id;
      return `<div class="tok side-${side} ${turn === id ? 'now' : ''} ${c.hp === 0 ? 'down' : ''} ${pending ? 'pending' : ''}" data-tok="${esc(id)}" ${dm ? 'draggable="true"' : ''} style="left:${(100 * t.x) / m.cols}%;top:${(100 * t.y) / m.rows}%;width:${100 / m.cols}%;height:${100 / m.rows}%">
        <span>${esc((c.name || '?')[0])}</span>${t.z ? `<em class="z">↑${t.z}</em>` : ''}</div>`;
    }).join('');
    // The DM clicks and drags on this map directly (public/js/dm/map.js); phones and the TV only look.
    return `<div class="bmap" data-cols="${m.cols}" data-rows="${m.rows}" style="aspect-ratio:${m.cols} / ${m.rows}">${m.image ? `<img src="${esc(m.image)}" alt="">` : ''}
      <div class="grid" style="background-size:${100 / m.cols}% ${100 / m.rows}%"></div>${tiles}${fog}${toks}</div>`;
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
        <div class="sp-text">${sp.kind === 'nat20'
          ? `<div class="sp-kicker">NATURAL 20!</div><h2>${esc(p.name)}</h2>
          <p>${esc([p.race, p.cls].filter(Boolean).join(' '))}${p.level ? ` · Level ${p.level}` : ''}${p.player ? ` · played by ${esc(p.player)}` : ''}</p>
          ${p.catchphrase ? `<q>${esc(p.catchphrase)}</q>` : ''}`
          : `<h2>${esc(p.name)}</h2>`}
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
      root.innerHTML = '<div class="bd"></div><div class="fx"></div><div class="wx"></div><div class="stage-ui"></div>';
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
    root.className = `stage theme-${s.scene.theme} mode-${s.mode} layout-${s.stageLayout || 'auto'} ${s.backdrop?.image ? 'has-bd' : ''}`;
    root.classList.add(`light-${s.scene.light || 'day'}`);
    for (const l of ['day', 'dusk', 'night', 'dawn', 'torchlight']) if (l !== (s.scene.light || 'day')) root.classList.remove(`light-${l}`);
    const ui = layers(root, s);
    window.Weather?.render(root.querySelector(':scope > .wx'), s.weather, window.Settings?.reducedMotion?.()); // Phase B weather
    // Mode title: a short card fades in and out when the table changes mode (not on the first draw).
    const prevMode = root.dataset.mode;
    if (prevMode && prevMode !== s.mode) {
      const t = document.createElement('div');
      t.className = 'mode-title';
      t.textContent = `— ${s.mode.toUpperCase()} —`;
      root.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    }
    root.dataset.mode = s.mode;
    ui.innerHTML = `
      <header class="stage-top">
        <div class="mode-pill">${MODE_ICON[s.mode]} ${s.mode}</div>
        ${s.room && !s.settings?.display?.hideJoin ? `<div class="join"><img src="/qr.svg?r=${esc(s.room)}${KEY_QS}" alt="Join QR"><div><b>Join the party</b><span class="room-code">Room <b>${esc(s.room)}</b></span><code>${esc(s.joinUrl.replace(/\/play\?room=.*/, '/j/' + s.room))}</code><small>${s.players.length} adventurer${s.players.length === 1 ? '' : 's'}</small></div></div>` : ''}
      </header>
      <main class="stage-main">
        <section class="stage-center">${s.mode === 'social' ? vn(s) : s.mode === 'combat' ? combat(s) : exploration(s)}</section>
        <aside class="stage-log">${logFeed(s, 9, new Set(s.settings?.display?.hideLog || []))}</aside>
      </main>
      <footer>${party(s)}</footer>
      ${spotlightCard(s)}${bossCard(s)}${memorialCard(s)}${clocks(s)}${shared(s)}${campCard(s)}${tension(s)}${canon(s)}${montage(s)}${payoffs(s)}`;
    const p = ui.querySelector('.vn-portrait');
    if (p && prevEmo && prevEmo !== s.social.npc.emotion) p.classList.add('changed');
    Anim.hydrate(ui);
    // A handout the group shares to the TV unfolds once, when it first appears.
    const arrived = [...ui.querySelectorAll('.shared .hand[data-hid]')].filter((el) => !root.dataset.shownHid?.split(',').includes(el.dataset.hid));
    if (root.dataset.shownHid !== undefined) arrived.forEach((el) => Anim.play(el, 'unfold', null));
    root.dataset.shownHid = [...ui.querySelectorAll('.shared .hand[data-hid]')].map((el) => el.dataset.hid).join(',');
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
    const objs = (s.objectives || []).filter((o) => o.revealed && o.vis?.screen).slice(-2); // secret objectives the DM revealed (item 9)
    const v = s.vote;
    if (!items.length && !objs.length && !(v && v.options)) return '';
    return `<div class="shared">${objs.map((o) => `<div class="hand objective-tv"><b>🎯 ${esc(o.name)}: ${esc(o.title)}</b>${o.text ? `<p>${esc(o.text)}</p>` : ''}</div>`).join('')}${items.map((h) => `<div class="hand" data-hid="${esc(h.id)}"><b>${esc(h.title)}</b>${h.text ? `<p>${esc(h.text)}</p>` : ''}</div>`).join('')}${v && v.open ? `<div class="hand vote-tv"><b>The party votes</b>${v.options.map((o, i) => `<span>${esc(o)} <em>${v.counts?.[i] ?? 0}</em></span>`).join('')}</div>` : ''}</div>`;
  }

  // Camp (src/camp.js): an image over the stage while the DM has camp open, with the vote count so far.
  function campCard(s) {
    const c = s.camp;
    if (!c?.open) return '';
    const im = c.image;
    return `<div class="camp-tv"><div class="camp-tv-box">
      <div class="camp-kicker">Camp ${c.n}</div>
      ${im ? (im.video ? `<video src="${esc(im.url)}" autoplay muted loop playsinline></video>` : `<img src="${esc(im.url)}" alt="">`) : ''}
      <h2>Make camp</h2>
      <p>Short rest: <b>${c.counts?.short || 0}</b> · Long rest: <b>${c.counts?.long || 0}</b></p>
    </div></div>`;
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

  // Table tools (Phase I, src/table.js). Tension: the DM's dread bar. Canon: details the players framed.
  function tension(s) {
    const t = s.tension;
    if (!t?.on) return '';
    return `<div class="tension" role="meter" aria-label="${esc(t.label)}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${t.value}"><small>${esc(t.label)}</small><div class="tension-bar"><i style="width:${t.value * 10}%"></i></div></div>`;
  }
  function canon(s) {
    const items = (s.canon || []).slice(-2);
    if (!items.length) return '';
    return `<div class="canon-tv">${items.map((c) => `<p><small>Canon · ${esc(c.by)}</small> ${esc(c.text)}</p>`).join('')}</div>`;
  }
  // Montage: the prompt and how many answered; answers appear together once the DM reveals them.
  function montage(s) {
    const m = s.montage;
    if (!m?.prompt) return '';
    if (!m.reveal) return `<div class="montage-tv"><div class="mt-kicker">Montage</div><h2>${esc(m.prompt)}</h2><p>${m.count || 0} of ${m.total || 0} answered</p></div>`;
    const answers = (m.answers || []).map((a) => `<li><b>${esc(a.name)}</b> ${esc(a.text)}</li>`).join('');
    return `<div class="montage-tv revealed"><div class="mt-kicker">Montage</div><h2>${esc(m.prompt)}</h2><ul>${answers}</ul></div>`;
  }
  // Payoffs: the recap of foreshadowing the DM has paid off (rest layout shows them in full).
  function payoffs(s) {
    const paid = (s.foreshadow || []).filter((h) => h.paid);
    if (!paid.length) return '';
    return `<div class="payoffs-tv"><div class="mt-kicker">Foreshadowing paid off</div>${paid.map((h) => `<p>${esc(h.text)} <em>${esc(h.payoff)}</em></p>`).join('')}</div>`;
  }

  window.Stage = { stage, vn, portrait, avatar, layeredSprite, refillLayered, hpBar, logFeed, checkBanner, esc, EMO };
})();

// Press and hold a portrait for a moment to see it full screen; Back returns. Works on the TV and the phone.
(() => {
  let timer = null;
  const cancel = () => clearTimeout(timer);
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.hold-zoom');
    if (!el || document.querySelector('.vn-full')) return;
    cancel();
    timer = setTimeout(() => zoomIn(el), 600);
  });
  ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach((t) => document.addEventListener(t, cancel));
  function zoomIn(el) {
    const o = document.createElement('div');
    o.className = 'vn-full';
    o.innerHTML = `<div class="vn-full-art">${el.innerHTML}</div><button class="btn vn-full-back">‹ Back</button>`;
    o.querySelector('.vn-full-back').onclick = () => o.remove();
    document.body.appendChild(o);
    navigator.vibrate?.(25);
    if (typeof Anim !== 'undefined') Anim.hydrate(o);
  }
})();
