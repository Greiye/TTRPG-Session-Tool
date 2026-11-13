// Chronicle skin pieces shared by the DM page and the phone (not the TV): the top pill bar,
// the story feed with portrait dialogue boxes, and the hero panel. Classic script: window.Chronicle.
(function () {
  const { esc, portrait, avatar } = Stage;

  const TOD = [[5, 'Dawn', '🌅'], [7, 'Morning', '☀️'], [12, 'Afternoon', '🌤'], [17, 'Dusk', '🌇'], [19, 'Evening', '🌙'], [23, 'Night', '🌑']];
  function timeOfDay(h = 9) {
    let out = ['Night', '🌑'];
    for (const [from, name, icon] of TOD) if (h >= from) out = [name, icon];
    return out;
  }
  const money = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // Pills flash when their value changes, so a time skip or a purchase is noticed.
  const lastPill = new Map();
  function pill(key, icon, label, value, title = '') {
    const changed = lastPill.has(key) && lastPill.get(key) !== value;
    lastPill.set(key, value);
    return `<span class="pill ${changed ? 'flash' : ''}" data-pill="${key}" title="${esc(title || label)}"><i>${icon}</i>${label ? `<small>${esc(label)}</small>` : ''}<b>${esc(value)}</b></span>`;
  }

  // Day, time of day, location, quest, coins. `me` is the phone's character; the DM passes none.
  function pills(S, me = null) {
    const st = S.story || { day: 1, hour: 9 };
    const [tod, todIcon] = timeOfDay(st.hour);
    const objs = (S.objectives || []).filter((o) => !o.done && (!me || o.charId === me.id));
    const quest = objs[0] ? objs[0].title + (objs.length > 1 ? ` +${objs.length - 1}` : '') : '—';
    const coins = me ? me.gold : (S.players || []).reduce((n, p) => n + (p.gold || 0), 0);
    return [
      pill('day', '📅', 'Day', String(st.day)),
      pill('tod', todIcon, '', tod, `${String(st.hour).padStart(2, '0')}:00`),
      pill('loc', '📍', '', S.scene?.title || 'Somewhere'),
      pill('quest', '📜', 'Quest', quest),
      pill('coins', '🪙', me ? 'Coins' : 'Party coins', money(coins)),
    ].join('');
  }

  // Who said a line: a seated character (by name) or an NPC (social NPC, cast member, or a tinted placeholder).
  function speakerArt(S, who, emotion) {
    const pc = (S.players || []).find((p) => p.name === who);
    if (pc) return avatar(pc, 'av-feed');
    const npc = S.social?.npc;
    if (npc && npc.name === who) return `<span class="av av-feed">${portrait(emotion || npc.emotion, npc.hue)}</span>`;
    const m = (S.social?.cast || []).find((x) => x.name === who);
    let hue = m?.hue;
    if (hue == null) { hue = 0; for (const ch of String(who)) hue = (hue * 31 + ch.charCodeAt(0)) % 360; }
    return `<span class="av av-feed">${portrait(emotion || 'neutral', hue)}</span>`;
  }

  // Story feed. Narration reads as prose, spoken lines get a portrait and a bordered box,
  // everything else is a quiet one-liner. Only entries new since the last render animate in.
  const seenBy = new WeakMap();
  const KEEP = new Set(['narrate', 'npc', 'say', 'action', 'check', 'roll', 'combat', 'system', 'shop', 'downtime', 'notice']);
  function feed(root, S, { n = 40, kinds = null } = {}) {
    if (!root) return;
    const items = (S.log || []).filter((l) => (kinds ? kinds.includes(l.kind) : KEEP.has(l.kind))).slice(-n);
    const seen = seenBy.get(root);
    const fresh = (l) => seen && !seen.has(l.id);
    seenBy.set(root, new Set(items.map((l) => l.id)));
    const atBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 40;
    root.innerHTML = items.map((l) => {
      const cls = `fe k-${esc(l.kind)} ${l.tone ? 't-' + esc(l.tone) : ''} ${fresh(l) ? 'new' : ''}`;
      const nat = l.roll === 20 ? '<em class="nat">NAT 20</em> ' : l.roll === 1 ? '<em class="nat one">NAT 1</em> ' : '';
      if ((l.kind === 'npc' || l.kind === 'say') && l.who) {
        const pc = l.kind === 'say';
        return `<div class="${cls} dlg ${pc ? 'dlg-pc' : ''}">${speakerArt(S, l.who, l.emotion)}<div class="dlg-box"><small class="dlg-name">${esc(l.who)}${l.emotion && !pc ? ` <i>${Stage.EMO[l.emotion]?.icon || ''}</i>` : ''}</small><p>${pc ? '' : '“'}${esc(l.text)}${pc ? '' : '”'}</p></div></div>`;
      }
      if (l.kind === 'narrate') return `<p class="${cls}">${nat}${esc(l.text)}</p>`;
      return `<p class="${cls} quiet">${l.who ? `<b>${esc(l.who)}:</b> ` : ''}${nat}${esc(l.text)}</p>`;
    }).join('') || '<p class="fe quiet">The story starts here. Narrate to begin.</p>';
    if (typeof Anim !== 'undefined') Anim.hydrate(root);
    if (atBottom || !seen) root.scrollTop = root.scrollHeight;
  }

  function bar(icon, label, cur, max, tone) {
    const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((100 * cur) / max))) : 0;
    return `<div class="hbar ${tone}"><i>${icon}</i><small>${esc(label)}</small><span class="hb-track"><span class="hb-fill" style="width:${pct}%"></span></span><b>${cur}/${max}</b></div>`;
  }
  // Spell slots, else a mana or stamina pool, else hit dice.
  function resource(c) {
    const slots = Object.values(c.slots || {});
    const smax = slots.reduce((n, s) => n + (s.max || 0), 0);
    if (smax) return ['✨', 'Slots', smax - slots.reduce((n, s) => n + (s.used || 0), 0), smax];
    for (const [k, icon] of [['mana', '💧'], ['stamina', '⚡']]) if (c[k]?.max) return [icon, k[0].toUpperCase() + k.slice(1), c[k].cur, c[k].max];
    if (c.hitDice) return ['🎲', 'Hit dice', (c.level || 1) - (c.hitDice.used || 0), c.level || 1];
    return null;
  }

  // Hero panel: portrait, name with edit, level, HP and resource bars, then Stats or Bio.
  function hero(c, S, { view = 'stats', editAttr = 'data-hero-edit', compact = false } = {}) {
    if (!c) return '<p class="note">No one at the table yet.</p>';
    const pct = c.maxHp ? c.hp / c.maxHp : 1;
    const res = resource(c);
    const abil = S.rules?.abilities || [];
    const mods = c.derived?.mods || {};
    const stats = c.abilities
      ? abil.map(([k, label]) => `<li><span>${esc(label)}</span><b>${c.abilities[k] ?? '—'}</b><small>${mods[k] != null ? (mods[k] >= 0 ? '+' : '') + mods[k] : ''}</small></li>`).join('')
      : '';
    const extra = `<li><span>${esc(S.rules?.defenseLabel || 'AC')}</span><b>${c.ac ?? '—'}</b><small></small></li>`;
    const bio = [c.catchphrase && `<p class="quote">“${esc(c.catchphrase)}”</p>`, c.backstory && `<p>${esc(c.backstory)}</p>`].filter(Boolean).join('') || '<p class="note">No backstory yet.</p>';
    return `<div class="hero ${compact ? 'compact' : ''}" style="--hue:${c.hue ?? 40}">
      <div class="hero-art">${avatar(c, 'av-hero')}</div>
      <div class="hero-head"><h2>${esc(c.name)}</h2><button class="icon-btn" ${editAttr}="${esc(c.id)}" title="Edit ${esc(c.name)}" aria-label="Edit ${esc(c.name)}">✎</button></div>
      <small class="hero-sub">${esc([c.race, c.cls].filter(Boolean).join(' '))}${c.player ? ` · ${esc(c.player)}` : ''}</small>
      <div class="hero-bars">
        <div class="hbar lv"><i>🏅</i><small>Lv</small><b class="lvnum">${c.level || 1}</b></div>
        ${bar('❤', 'HP', c.hp, c.maxHp, pct > 0.5 ? 'life' : pct > 0.2 ? 'life warn' : 'life crit')}
        ${res ? bar(res[0], res[1], res[2], res[3], 'res') : ''}
      </div>
      <div class="seg" role="tablist"><button role="tab" data-hero-view="stats" class="${view === 'stats' ? 'on' : ''}" aria-selected="${view === 'stats'}">Stats</button><button role="tab" data-hero-view="bio" class="${view === 'bio' ? 'on' : ''}" aria-selected="${view === 'bio'}">Bio</button></div>
      ${view === 'none' ? '' : `<div class="hero-body">${view === 'bio' ? `<div class="hero-bio">${bio}</div>` : `<ul class="stat-list">${stats}${extra}</ul>`}</div>`}
    </div>`;
  }

  window.Chronicle = { pills, feed, hero, timeOfDay };
})();
