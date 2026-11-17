// Combat effects (combat aesthetic, first slice; docs/combat-aesthetic.md). Plays the server's combat cues
// (src/combatfx.js: hit, crit, miss, heal, down, turn) as short overlays on the TV, the DM page and phones.
//
// Every look here is a PLACEHOLDER (CSS shapes and text, no art yet), drawn by public/combatfx.css.
// Switch: the "Combat effects" setting (data-fx on <html>, public/settings.js). Off plays nothing.
// Reduce motion: no shake, no sweep; each cue is a short fade.
// Numbers: a cue carries an amount only on the DM's screens, unless the table shares health numbers.
//
// CombatFx.listen(socket, { role: 'tv' | 'dm' | 'phone', me: () => charId }) wires a page up.
(() => {
  const SIDE_COLOR = { party: 'hsl(42 85% 60%)', enemy: 'hsl(2 75% 58%)', ally: 'hsl(140 55% 50%)', neutral: 'hsl(220 10% 70%)' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const on = () => (window.Settings?.get?.().fx ?? 'on') !== 'off';
  const reduced = () => !!window.Settings?.reducedMotion?.();

  // The colour a combatant is drawn in: a player's hue, a creature's accent, or its side's colour.
  function colorOf(w) {
    if (!w) return SIDE_COLOR.neutral;
    if (Number.isFinite(w.hue)) return `hsl(${w.hue} 70% 58%)`;
    if (w.accent) return w.accent;
    return SIDE_COLOR[w.side] || SIDE_COLOR.enemy;
  }

  // Where the target is on this screen: its party card, foe card or flat map token. Null puts the cue in
  // the middle of the screen (the 3D map and screens without the target).
  function anchorOf(id) {
    if (!id) return null;
    const q = CSS.escape(id);
    for (const sel of [`.tok[data-tok="${q}"]`, `.foe[data-fid="${q}"]`, `.pc[data-pid="${q}"]`]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) return { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }

  let layer = null;
  function root() {
    if (layer?.isConnected) return layer;
    layer = document.createElement('div');
    layer.id = 'cfx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
    return layer;
  }
  // Adds one effect node, removes it after `ms`.
  function spawn(cls, html, { x, y, color, ms = 1200 } = {}) {
    const n = document.createElement('div');
    n.className = `cfx ${cls} ${reduced() ? 'cfx-reduced' : ''}`;
    n.innerHTML = html;
    if (x != null) { n.style.left = `${x}px`; n.style.top = `${y}px`; }
    if (color) n.style.setProperty('--cfx-c', color);
    root().append(n);
    setTimeout(() => n.remove(), reduced() ? Math.min(ms, 700) : ms);
    return n;
  }
  // A short shake on an element (the target card, or the whole stage on a crit). Skipped under reduce motion.
  function shake(el, ms = 380) {
    if (!el?.animate || reduced()) return;
    el.animate([0, -1, 1, -1, 1, 0].map((k) => ({ transform: `translate(${k * 7}px, ${-k * 2}px)` })), { duration: ms, easing: 'ease-out' });
  }

  // What a phone shows: only its own moments (you hit, you were hit, your turn). Returns the text or null.
  function phoneText(c, me) {
    const t = c.target, by = c.by;
    const mine = t?.id === me, mineBy = by?.id === me;
    if (c.kind === 'turn') return mine ? 'Your turn' : null;
    if (!mine && !mineBy) return null;
    if (c.kind === 'miss') return mineBy ? `You miss ${t.name}` : `${by?.name || 'Something'} misses you`;
    if (c.kind === 'hit' || c.kind === 'crit') {
      const verb = c.kind === 'crit' ? 'crit' : 'hit';
      if (mineBy) return `You ${verb} ${t.name}`;
      return by ? `${by.name} ${verb}s you` : 'You are hit';
    }
    if (c.kind === 'heal') return mine ? 'You are healed' : null;
    if (c.kind === 'down') return mine ? 'You are down' : `${t.name} is down`;
    return null;
  }

  const amountTag = (c) => (c.amount != null ? `<b class="cfx-amt">${c.kind === 'heal' ? '+' : '-'}${c.amount}</b>` : '');

  // Plays one cue. role: 'tv' | 'dm' | 'phone'. me: this phone's character id.
  function play(c, { role = 'tv', me = null } = {}) {
    if (!c || !on()) return false;
    const where = role === 'phone' ? null : anchorOf(c.target?.id);
    const at = where ? { x: where.x, y: where.y } : { x: innerWidth / 2, y: innerHeight * 0.42 };
    const tColor = colorOf(c.target);
    const byColor = colorOf(c.by || c.target);

    if (role === 'phone') {
      const text = phoneText(c, me);
      if (!text) return false;
      spawn(`cfx-phone k-${c.kind}`, `<span>${esc(text)}</span>${amountTag(c)}`, { color: c.kind === 'turn' ? tColor : byColor, ms: 1600 });
      if (c.kind === 'turn') navigator.vibrate?.([40, 60, 40]);
      else if (c.target?.id === me && (c.kind === 'hit' || c.kind === 'crit')) navigator.vibrate?.(c.kind === 'crit' ? [120, 40, 120] : [70]);
      if (c.kind === 'crit' && c.target?.id === me) shake(document.body);
      return true;
    }

    switch (c.kind) {
      case 'turn':
        // A sweep in the combatant's colour with their name (PLACEHOLDER bar).
        spawn('cfx-turn', `<span>${esc(c.target.name)}'s turn</span>`, { color: tColor, ms: 1500 });
        break;
      case 'hit':
        spawn('cfx-slash', `<i></i>${amountTag(c)}`, { ...at, color: byColor, ms: 900 });
        shake(where?.el);
        if (c.target.side === 'party' && role === 'tv') spawn('cfx-edge', '', { color: 'hsl(0 80% 45%)', ms: 700 });
        break;
      case 'crit':
        spawn('cfx-slash cfx-x', `<i></i><i></i>${amountTag(c)}`, { ...at, color: byColor, ms: 1300 });
        spawn('cfx-burst', '', { ...at, color: byColor, ms: 1000 });
        spawn('cfx-banner', '<span>Critical!</span>', { color: byColor, ms: 1400 });
        shake(role === 'tv' ? document.getElementById('stage') || document.body : where?.el, 480);
        break;
      case 'miss':
        // Mike's idea: a white slash that glances off for a miss.
        spawn('cfx-slash cfx-glance', '<i></i><b class="cfx-word">Miss</b>', { ...at, color: 'hsl(0 0% 92%)', ms: 1000 });
        break;
      case 'heal':
        spawn('cfx-heal', amountTag(c), { ...at, color: 'hsl(130 65% 55%)', ms: 1100 });
        break;
      case 'down':
        spawn('cfx-down', '<b class="cfx-word">Down</b>', { ...at, color: tColor, ms: 1600 });
        break;
      default: return false;
    }
    return true;
  }

  function listen(socket, opts = {}) {
    socket.on('cfx', (c) => play(c, { role: opts.role, me: opts.me?.() ?? null }));
  }

  window.CombatFx = { play, listen, phoneText, colorOf };
})();
