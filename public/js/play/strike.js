// Strike gestures (Mike, Nov 17; docs/combat-aesthetic.md feature 2). After a player picks an enemy, a pop-up
// shows its silhouette and the player strikes it. The gesture is for show and never changes the roll (Mike's
// decision 1): after a short pause the attack is rolled on the server as before, and the result plays on the
// silhouette.
//
// The weapon and the attack decide the gesture, not the class (Mike, Nov 17):
// - Strike: the weapon's own gesture. Blades drag across to slash; daggers, spears and bows press and hold
//   while a ring closes (pierce); maces, staves, fists and other unique weapons drag through numbered nodes.
// - Special moves: chains each player lays out once on their sheet (Move 1, Move 2...; players name their moves
//   out loud, so there is no naming here). A chain mixes hit nodes, slashes, pierces and spell runes.
// - After each step the node pulses for as long as the weapon is heavy: a dagger lightly, a mace for a second.
//   The next step waits for the pulse.
//
// Switches: the table's "Strike gestures" setting (DM) and this phone's "One-tap attacks" setting. Every pop-up
// also has a Quick strike button, and after WINDOW_MS the strike goes by itself so turns stay fast.
// Silhouettes, weapon profiles, pulse and ring times and effects are PLACEHOLDER until Mike sets them.
import { socket } from '../client.js';
import { me } from './identity.js';

const WINDOW_MS = 5000; // the gesture window (Mike, Nov 17: "keep turns fast")
const windowMs = () => window.Strike?.windowMs || WINDOW_MS; // tests on slow machines may lengthen it
const SLASH_SPAN = 0.5; // a free slash must cross half the silhouette
const PAUSE_MS = 350; // the beat between the strike and the roll
const NODE_R = 30; // how close (px) the finger must pass to a node
const BASIC_NODES = 3; // PLACEHOLDER: nodes in a weapon's plain strike
const MAX_STEPS = 8, MIN_STEPS = 2, MAX_MOVES = 6; // same limits as src/sheet.js
// PLACEHOLDER: how long a node pulses after a step, by weapon weight (Mike: a dagger lightly, a mace a second).
const PULSE_MS = { light: 200, medium: 500, heavy: 1000 };
// PLACEHOLDER: the pierce ring, quicker for light weapons (Mike: "daggers are quick, maces are slower").
const HOLD_MS = { light: 450, medium: 700, heavy: 1000 };
const SPELL_TURN = Math.PI * 1.7; // a spell rune: circle the finger once around it

const esc = (s) => Stage.esc(s);
export const wantGesture = (S) => S?.settings?.display?.gestures !== 'off' && Settings.get().onetap !== 'on';

// Weapon profiles (PLACEHOLDER): the gesture and the weight, read from an inventory item's name, or else from
// its note ("[1d8 slashing]", "heavy", "finesse"), so the placeholder shop's weapons and the DM's own items work.
const WEAPONS = [
  [/great ?sword|great ?axe|halberd|glaive|zweihander|claymore/i, 'slash', 'heavy'],
  [/maul|war ?hammer|great ?club|morning ?star|flail/i, 'nodes', 'heavy'],
  [/mace|club|hammer|cudgel/i, 'nodes', 'heavy'],
  [/staff|stave|nunchaku|tonfa|whip/i, 'nodes', 'medium'],
  [/gauntlet|knuckle|cestus|claw|fist|wraps/i, 'nodes', 'light'],
  [/dagger|knife|dirk|stiletto|rapier|short ?sword|sai\b/i, 'pierce', 'light'],
  [/spear|pike|lance|trident|javelin/i, 'pierce', 'medium'],
  [/\bbow\b|shortbow|longbow|crossbow|sling/i, 'pierce', 'medium'],
  [/sword|blade|scimitar|sabre|saber|katana|axe|sickle|scythe|machete/i, 'slash', 'medium'],
];
export function weaponOf(item) {
  if (!item?.name || item.qty === 0) return null;
  const hit = WEAPONS.find(([re]) => re.test(item.name));
  if (hit) return { name: item.name, style: hit[1], weight: hit[2] };
  const note = item.note || '';
  const type = /(piercing|slashing|bludgeoning)/i.exec(note)?.[1]?.toLowerCase();
  if (!type) return null;
  const weight = /heavy/i.test(note) ? 'heavy' : /light|finesse/i.test(note) ? 'light' : 'medium';
  return { name: item.name, style: type === 'piercing' ? 'pierce' : type === 'slashing' ? 'slash' : 'nodes', weight };
}
export const UNARMED = { name: 'Unarmed', style: 'nodes', weight: 'light' };
export function weaponsOf(hero) {
  const seen = new Set();
  const list = (hero?.inventory || []).map(weaponOf).filter((w) => w && !seen.has(w.name) && seen.add(w.name));
  return [...list, UNARMED];
}

// Silhouette by creature kind and name (PLACEHOLDER shapes, viewBox 0 0 200 300).
const SHAPES = {
  humanoid: '<circle cx="100" cy="42" r="26"/><rect x="66" y="74" width="68" height="104" rx="22"/><rect x="38" y="80" width="24" height="96" rx="12" transform="rotate(10 50 80)"/><rect x="138" y="80" width="24" height="96" rx="12" transform="rotate(-10 150 80)"/><rect x="70" y="170" width="26" height="118" rx="13"/><rect x="104" y="170" width="26" height="118" rx="13"/>',
  beast: '<ellipse cx="100" cy="160" rx="78" ry="40"/><circle cx="168" cy="122" r="26"/><polygon points="178,98 190,78 186,104"/><rect x="36" y="180" width="18" height="70" rx="9"/><rect x="62" y="186" width="18" height="66" rx="9"/><rect x="122" y="186" width="18" height="66" rx="9"/><rect x="146" y="180" width="18" height="70" rx="9"/><path d="M24 150 Q4 120 14 96" stroke-width="12" stroke-linecap="round" fill="none"/>',
  blob: '<path d="M30 250 Q20 160 70 120 Q100 70 140 110 Q190 150 172 250 Z"/><circle cx="84" cy="160" r="9" class="sil-eye"/><circle cx="122" cy="160" r="9" class="sil-eye"/>',
  winged: '<ellipse cx="100" cy="160" rx="30" ry="58"/><circle cx="100" cy="88" r="20"/><path d="M76 140 L6 86 L34 150 L10 176 L76 176 Z"/><path d="M124 140 L194 86 L166 150 L190 176 L124 176 Z"/><rect x="82" y="210" width="14" height="60" rx="7"/><rect x="104" y="210" width="14" height="60" rx="7"/>',
};
export function shapeOf(foe) {
  const t = `${foe?.kind || ''} ${foe?.name || ''}`.toLowerCase();
  if (/ooze|slime|jelly|pudding|blob/.test(t)) return 'blob';
  if (/dragon|drake|wyvern|eagle|bird|\bbat\b|harpy|griffon|wing/.test(t)) return 'winged';
  if (/beast|wolf|bear|spider|boar|\bdog\b|\bcat\b|horse|rat\b|lion|tiger|owlbear/.test(t)) return 'beast';
  return 'humanoid';
}

// Where a plain node strike's nodes can sit on each silhouette (head, chest, arms, belly, legs...). PLACEHOLDER.
const SPOTS = {
  humanoid: [[100, 42], [100, 105], [50, 130], [150, 130], [100, 155], [83, 235], [117, 235]],
  beast: [[168, 122], [60, 155], [110, 150], [150, 165], [45, 225], [155, 225], [20, 120]],
  blob: [[84, 160], [122, 160], [60, 220], [140, 220], [100, 120], [100, 205]],
  winged: [[100, 88], [100, 150], [40, 120], [160, 120], [100, 195], [89, 245], [111, 245]],
};
// A random chain of distinct spots, so every plain node strike is a little different.
export function pickChain(shape, n = BASIC_NODES, rnd = Math.random) {
  const pool = [...(SPOTS[shape] || SPOTS.humanoid)];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}
// Step kinds. twin: two nodes pressed at the same time; twinslash: two slashes dragged at the same time
// (two fingers, Mike, Nov 17). A step keeps its points in the silhouette's viewBox: x,y (and x2,y2, x3,y3, x4,y4).
export const STEP_KINDS = ['hit', 'slash', 'pierce', 'spell', 'twin', 'twinslash'];
const STEP_LABEL = { hit: 'Hit', slash: 'Slash', pierce: 'Pierce', spell: 'Spell', twin: 'Two-press', twinslash: 'Two-slash' };
const STEP_ICON = { hit: '', slash: '⟋', pierce: '◎', spell: '✦', twin: '✌', twinslash: '✌' };
const TAPS = { hit: 1, pierce: 1, spell: 1, slash: 2, twin: 2, twinslash: 4 }; // taps to place a step in the builder
const ptsOf = (s) => [[s.x, s.y], [s.x2, s.y2], [s.x3, s.y3], [s.x4, s.y4]].slice(0, TAPS[s.k]);

// Silhouette geometry inside a field, in layout pixels (cards scale in as they open). The silhouette's box is
// inset 6% 12% (style.css) and keeps its aspect ratio inside it (xMidYMid meet), like the SVG does.
function geometry(field) {
  const W = field.clientWidth, H = field.clientHeight, sw = W * 0.76, sh = H * 0.88;
  const k = Math.min(sw / 200, sh / 300);
  const ox = W * 0.12 + (sw - 200 * k) / 2, oy = H * 0.06 + (sh - 300 * k) / 2;
  return { toPx: (x, y) => ({ x: ox + x * k, y: oy + y * k }), toBox: (p) => ({ x: (p.x - ox) / k, y: (p.y - oy) / k }) };
}
const localIn = (field, e) => { const r = field.getBoundingClientRect(), s = r.width / (field.offsetWidth || r.width) || 1; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
// Draws a chain's markers in a field: numbered nodes, and a dashed line with an end mark for each slash.
// Each entry: { s, p: [points in px], dots: [node per press point], segs: [line per slash] }.
function drawSteps(field, steps) {
  field.querySelectorAll('.strike-node,.strike-seg').forEach((n) => n.remove());
  const g = geometry(field);
  const seg = (a, b) => {
    const el = document.createElement('i');
    el.className = 'strike-seg';
    Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${Math.hypot(b.x - a.x, b.y - a.y)}px`, transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)` });
    field.append(el);
    return el;
  };
  const dot = (q, s, i) => {
    const d = document.createElement('i');
    d.className = `strike-node k-${s.k}`;
    d.dataset.step = i + 1;
    d.innerHTML = `${i + 1}${STEP_ICON[s.k] ? `<small>${STEP_ICON[s.k]}</small>` : ''}`;
    d.style.left = `${q.x}px`; d.style.top = `${q.y}px`;
    field.append(d);
    return d;
  };
  return steps.map((s, i) => {
    const p = ptsOf(s).map(([x, y]) => g.toPx(x, y));
    const out = { s, p, dots: [], segs: [] };
    if (s.k === 'slash' || s.k === 'twinslash') {
      for (let j = 0; j < p.length; j += 2) { out.segs.push(seg(p[j], p[j + 1])); out.dots.push(dot(p[j], s, i)); }
    } else p.forEach((q) => out.dots.push(dot(q, s, i)));
    return out;
  });
}

let open = null;
export const isOpen = () => !!open;
const pref = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Opens the pop-up for `foe`; `hero` is this phone's character (weapons and saved moves). Resolves when it closes.
// opts.move: index of a special move picked from the combat choices (Nov 21).
export function openStrike(foe, hero, opts = {}) {
  if (open) return open.done;
  const shape = shapeOf(foe);
  const weapons = weaponsOf(hero);
  const moves = (hero?.moves || []).filter((m) => m?.steps?.length >= MIN_STEPS);
  let weapon = weapons.find((w) => w.name === pref.get('strike.weapon')) || weapons[0];
  let pick = Number.isInteger(opts.move) && moves[opts.move] ? opts.move : 'strike'; // 'strike' or a move index
  const el = document.createElement('div');
  el.id = 'strike';
  el.className = 'strike-pop';
  el.innerHTML = `<div class="strike-card" role="dialog" aria-label="Strike ${esc(foe.name)}">
      <header><b>Strike ${esc(foe.name)}</b><button type="button" class="icon-btn strike-x" aria-label="Cancel">✕</button></header>
      ${weapons.length > 1 ? `<div class="strike-chips" data-row="weapon">${weapons.map((w, i) => `<button type="button" class="chip" data-weapon="${i}">${esc(w.name)}</button>`).join('')}</div>` : ''}
      ${moves.length ? `<div class="strike-chips" data-row="move"><button type="button" class="chip" data-move="strike">Strike</button>${moves.map((m, i) => `<button type="button" class="chip" data-move="${i}">${esc(m.name || `Move ${i + 1}`)}</button>`).join('')}</div>` : ''}
      <div class="strike-field">
        <svg class="strike-sil" viewBox="0 0 200 300" aria-hidden="true"><g>${SHAPES[shape]}</g></svg>
        <svg class="strike-ink" aria-hidden="true"><polyline points=""/></svg>
        <i class="strike-ring" hidden></i>
        <b class="strike-result" hidden></b>
      </div>
      <p class="strike-hint"></p>
      <div class="strike-time" aria-hidden="true"><i style="animation-duration:${windowMs()}ms"></i></div>
      <button type="button" class="btn strike-tap">⚡ Quick strike</button>
    </div>`;
  document.body.append(el);
  const $ = (s) => el.querySelector(s);
  const field = $('.strike-field'), sil = $('.strike-sil'), ink = $('.strike-ink polyline'), ring = $('.strike-ring'), hint = $('.strike-hint');
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  let struck = false, press = null, holdTimer = null, buzz = null;
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const local = (e) => localIn(field, e);

  function close() {
    timers.forEach(clearTimeout); clearTimeout(holdTimer); clearInterval(buzz);
    socket.off('cfx', onCue);
    el.classList.add('closing');
    setTimeout(() => el.remove(), 250);
    open = null;
    resolve();
  }
  // The result of the roll comes back as a combat cue (src/combatfx.js) naming this phone's character.
  function onCue(c) {
    if (!struck || c.by?.id !== me.charId || c.target?.id !== foe.id || !['hit', 'crit', 'miss'].includes(c.kind)) return;
    const res = $('.strike-result');
    res.hidden = false;
    res.textContent = c.kind === 'crit' ? 'Critical!' : c.kind === 'hit' ? 'Hit!' : 'Miss';
    field.classList.add(`res-${c.kind}`);
    navigator.vibrate?.(c.kind === 'crit' ? [120, 50, 160] : c.kind === 'hit' ? [90] : [20, 40, 20]);
    later(close, 1200);
  }
  socket.on('cfx', onCue);

  function strike(style, at) {
    if (struck) return;
    struck = true;
    clearTimeout(holdTimer); clearInterval(buzz);
    ring.hidden = true;
    el.classList.add('struck', `st-${style}`);
    hint.textContent = '…';
    if (style === 'pierce' && at) {
      const p = document.createElement('i');
      p.className = 'strike-stab';
      p.style.left = `${at.x}px`; p.style.top = `${at.y}px`;
      field.append(p);
    }
    if (style === 'combo') field.querySelectorAll('.strike-node').forEach((d, i) => { d.style.animationDelay = `${i * 70}ms`; d.classList.add('burst'); });
    navigator.vibrate?.(style === 'pierce' ? [10, 30, 60] : style === 'combo' ? [] : [45]);
    const move = pick !== 'strike' ? moves[pick]?.name : undefined; // a named special move is called out on the TV log
    later(() => socket.emit('player:combat', { act: 'attack', target: foe.id, style, move }), PAUSE_MS);
    later(close, 4000); // no answer (no line of sight, turn moved on): close anyway
  }

  // --- The chain runner: hit nodes, slashes, pierces, spell runes and two-finger steps, in order. The first
  // finger stays down from node 1 to the end; a two-finger step adds a second finger for that step. ---
  let chain = [], live = [], at = 0, lockUntil = 0, step = null;
  const fingers = new Map(); // pointerId -> position; `lead` is the finger that started the chain
  let lead = null;
  const ringAt = (p, ms) => {
    ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`; ring.style.animationDuration = `${ms}ms`;
    ring.hidden = false; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
  };
  const lit = (n, cls, on = true) => { n.dots.forEach((d) => d.classList.toggle(cls, on)); };
  const resetChain = (msg) => {
    at = 0; step = null; lockUntil = 0;
    clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true;
    live.forEach((n) => { lit(n, 'on', false); lit(n, 'pulse', false); lit(n, 'armed', false); n.segs.forEach((g) => g.classList.remove('on')); });
    ink.setAttribute('points', '');
    hint.textContent = msg || chainHint();
  };
  const chainHint = () => (chain.length && chain.some((s) => s.k !== 'hit')
    ? `Follow the chain, 1 to ${chain.length}: ${chain.map((s) => STEP_LABEL[s.k].toLowerCase()).join(', ')}`
    : `Drag through the nodes, 1 to ${chain.length}`);
  const inkTo = () => ink.setAttribute('points', live.slice(0, at).filter((n) => n.s.k !== 'twin' && n.s.k !== 'twinslash').flatMap((n) => n.p).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
  const stepHint = { slash: 'Slash along the line', spell: 'Circle the rune', pierce: 'Hold on the node until the ring closes', twin: 'Press both nodes at once', twinslash: 'Slash both lines at once, two fingers' };
  // A step is done: light it, pulse for the weapon's weight, then the next step goes live.
  function stepDone(p) {
    const n = live[at];
    clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true;
    lit(n, 'armed', false); lit(n, 'on'); lit(n, 'pulse');
    n.segs.forEach((g) => g.classList.add('on'));
    const ms = PULSE_MS[weapon.weight] || PULSE_MS.medium;
    n.dots.forEach((d) => d.style.setProperty('--pulse', `${ms}ms`));
    navigator.vibrate?.(ms);
    at++; step = null;
    inkTo();
    if (at === live.length) return strike('combo', p);
    lockUntil = Date.now() + ms;
    hint.textContent = `${at} of ${live.length}`;
    later(() => { lit(n, 'pulse', false); if (press?.chain) chainMove(); }, ms + 10); // a finger already waiting on the next step goes on
  }
  const near = (p, q, r = NODE_R) => Math.hypot(p.x - q.x, p.y - q.y) <= r;
  // Follows the fingers through the current step.
  function chainMove() {
    if (struck || at >= live.length || Date.now() < lockUntil) return;
    const n = live[at], s = n.s, p = fingers.get(lead);
    if (!p) return;
    const all = [...fingers.values()];
    if (s.k === 'twin') {
      // Two fingers, one on each node, at the same time.
      n.dots.forEach((d, j) => d.classList.toggle('armed', all.some((q) => near(q, n.p[j]))));
      const ok = [...fingers.entries()].some(([i, q]) => near(q, n.p[0]) && [...fingers.entries()].some(([k, r]) => k !== i && near(r, n.p[1])));
      if (ok) return stepDone(n.p[0]);
      if (!step && all.some((q) => near(q, n.p[0]) || near(q, n.p[1]))) { step = { k: s.k }; hint.textContent = stepHint.twin; }
      return;
    }
    if (s.k === 'twinslash') {
      // Each finger takes a line from its start; both lines must be slashed while both fingers are down.
      step ??= { k: s.k, own: new Map(), done: [false, false] };
      for (const [id, q] of fingers) {
        const j = step.own.get(id);
        if (j == null) {
          const free = [0, 1].find((m) => !step.done[m] && ![...step.own.values()].includes(m) && near(q, n.p[m * 2]));
          if (free != null) { step.own.set(id, free); n.dots[free].classList.add('armed'); hint.textContent = stepHint.twinslash; }
        } else if (!step.done[j]) {
          if (segDist(q, n.p[j * 2], n.p[j * 2 + 1]) > NODE_R * 1.5) { step.own.delete(id); n.dots[j].classList.remove('armed'); }
          else if (near(q, n.p[j * 2 + 1])) { step.done[j] = true; n.segs[j].classList.add('on'); navigator.vibrate?.(20); }
        }
      }
      if (step.done[0] && step.done[1]) stepDone(p);
      return;
    }
    const a = n.p[0];
    if (!step) {
      if (!near(p, a)) return;
      step = { k: s.k, a0: Math.atan2(p.y - a.y, p.x - a.x), turn: 0 };
      lit(n, 'armed');
      if (s.k === 'hit') return stepDone(p);
      if (s.k === 'pierce') {
        const ms = HOLD_MS[weapon.weight] || HOLD_MS.medium;
        ringAt(a, ms);
        buzz = setInterval(() => navigator.vibrate?.(8), 160);
        holdTimer = setTimeout(() => stepDone(a), ms);
      }
      hint.textContent = stepHint[s.k] || hint.textContent;
      return;
    }
    if (s.k === 'pierce' && !near(p, a)) { // slipped off: hold again
      clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true; step = null; lit(n, 'armed', false);
      hint.textContent = stepHint.pierce;
    } else if (s.k === 'slash') {
      const b = n.p[1];
      if (segDist(p, a, b) > NODE_R * 1.5) { step = null; lit(n, 'armed', false); hint.textContent = 'Stay on the line to slash'; return; }
      ink.setAttribute('points', [...live.slice(0, at).filter((q) => q.s.k !== 'twin' && q.s.k !== 'twinslash').flatMap((q) => q.p), a, p].map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
      if (near(p, b)) stepDone(p);
    } else if (s.k === 'spell') {
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (d < 8) return;
      const ang = Math.atan2(p.y - a.y, p.x - a.x);
      let da = ang - step.a0;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      step.turn += da; step.a0 = ang;
      n.dots[0].style.setProperty('--turn', `${Math.min(1, Math.abs(step.turn) / SPELL_TURN)}`);
      if (d > NODE_R * 4) { step = null; lit(n, 'armed', false); hint.textContent = 'Circle close to the rune'; return; }
      if (Math.abs(step.turn) >= SPELL_TURN) stepDone(a);
    }
  }

  // --- The free gestures: drag across to slash, press and hold to pierce. ---
  function freeDown(p) {
    press = { start: p, pts: [p], slash: false };
    ink.setAttribute('points', '');
    if (weapon.style === 'pierce') {
      const ms = HOLD_MS[weapon.weight] || HOLD_MS.medium;
      ringAt(p, ms);
      buzz = setInterval(() => navigator.vibrate?.(8), 160);
      holdTimer = setTimeout(() => strike('pierce', p), ms);
    }
  }
  function freeMove(p) {
    press.pts.push(p);
    if (weapon.style !== 'slash') {
      if (Math.hypot(p.x - press.start.x, p.y - press.start.y) > 22) { clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true; hint.textContent = 'Keep still and hold to pierce'; }
      return;
    }
    if (!press.slash && Math.hypot(p.x - press.start.x, p.y - press.start.y) > 22) press.slash = true;
    if (press.slash) {
      ink.setAttribute('points', press.pts.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
      if (press.pts.length % 4 === 0) navigator.vibrate?.(6);
    }
  }
  function freeUp() {
    clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true;
    const { pts, slash } = press;
    if (weapon.style === 'slash' && slash) {
      const fr = field.getBoundingClientRect(), sr = sil.getBoundingClientRect(), s = fr.width / (field.offsetWidth || fr.width) || 1;
      const xs = pts.map((q) => q.x * s + fr.left), ys = pts.map((q) => q.y * s + fr.top);
      const span = Math.max(Math.min(Math.max(...xs), sr.right) - Math.max(Math.min(...xs), sr.left), Math.min(Math.max(...ys), sr.bottom) - Math.max(Math.min(...ys), sr.top));
      if (span >= SLASH_SPAN * sr.width) return strike('slash');
      hint.textContent = 'Drag all the way across it to slash';
    } else hint.textContent = weapon.style === 'slash' ? 'Drag across to slash' : 'Hold until the ring closes to pierce';
    ink.setAttribute('points', '');
  }

  const isChain = () => pick !== 'strike' || weapon.style === 'nodes';
  // Sets up the field for the chosen weapon and attack.
  function setup() {
    clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true; press = null;
    el.querySelectorAll('[data-weapon]').forEach((b) => b.classList.toggle('on', weapons[b.dataset.weapon] === weapon));
    el.querySelectorAll('[data-move]').forEach((b) => b.classList.toggle('on', b.dataset.move === String(pick)));
    if (pick !== 'strike') chain = moves[pick].steps;
    else if (weapon.style === 'nodes') chain = pickChain(shape).map(([x, y]) => ({ k: 'hit', x, y }));
    else chain = [];
    el.dataset.mode = isChain() ? 'nodes' : weapon.style;
    live = drawSteps(field, chain);
    if (isChain()) resetChain();
    else { field.querySelectorAll('.strike-node,.strike-seg').forEach((n) => n.remove()); ink.setAttribute('points', ''); hint.textContent = weapon.style === 'slash' ? 'Drag across to slash' : 'Press and hold to pierce'; }
  }
  requestAnimationFrame(setup);
  setup();

  field.addEventListener('pointerdown', (e) => {
    if (struck) return;
    e.preventDefault();
    try { field.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
    const p = local(e);
    if (isChain()) {
      if (lead != null && fingers.has(lead)) { fingers.set(e.pointerId, p); chainMove(); return; } // a second finger
      live = drawSteps(field, chain); // re-place in case the layout moved
      resetChain();
      fingers.clear(); fingers.set(e.pointerId, p); lead = e.pointerId;
      press = { chain: true };
      chainMove();
      if (!at && !step) hint.textContent = 'Start on node 1';
    } else if (!press) freeDown(p);
  });
  field.addEventListener('pointermove', (e) => {
    if (!press || struck) return;
    const p = local(e);
    if (press.chain) { if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, p); if (at || step || e.pointerId !== lead) chainMove(); } else freeMove(p);
  });
  const up = (e) => {
    if (!press || struck) return;
    if (press.chain && e.pointerId !== lead) {
      // The second finger lifted: a two-finger step starts over.
      fingers.delete(e.pointerId);
      const n = live[at];
      if (step && n && (n.s.k === 'twin' || n.s.k === 'twinslash')) { step = null; lit(n, 'armed', false); n.segs.forEach((g) => g.classList.remove('on')); }
      return;
    }
    const wasChain = press.chain;
    if (!wasChain) freeUp();
    press = null; fingers.clear(); lead = null;
    if (wasChain && (at || step)) resetChain(`Keep your finger down from 1 to ${live.length}`);
  };
  field.addEventListener('pointerup', up);
  field.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-weapon],[data-move]');
    if (!b || struck) return;
    if (b.dataset.weapon) { weapon = weapons[b.dataset.weapon]; pref.set('strike.weapon', weapon.name); }
    if (b.dataset.move) pick = b.dataset.move === 'strike' ? 'strike' : Number(b.dataset.move);
    setup();
  });
  $('.strike-tap').onclick = () => strike('tap');
  $('.strike-x').onclick = () => { if (!struck) close(); };
  later(() => strike('tap'), windowMs()); // the window ran out: an ordinary strike

  // Client coordinates of every step's points, for tests.
  const points = () => { const r = field.getBoundingClientRect(), s = r.width / (field.offsetWidth || r.width) || 1; return live.map((n) => n.p.map((q) => ({ x: r.left + q.x * s, y: r.top + q.y * s }))); };
  open = { done, points };
  return done;
}

// --- Special move builder (on the sheet): tap the silhouette to lay out a chain, then save it. ---
// Saved on the character as `moves` (src/sheet.js). Nov 21: each move has a name the player picks.
export function openMoveBuilder(hero, index = null) {
  if (document.getElementById('moveBuild')) return;
  const moves = (hero?.moves || []).map((m, i) => ({ name: m.name || `Move ${i + 1}`, steps: [...m.steps] }));
  const steps = index != null && moves[index] ? moves[index].steps.map((s) => ({ ...s })) : [];
  let kind = 'hit', taps = []; // taps placed so far for a step that needs several
  const el = document.createElement('div');
  el.id = 'moveBuild';
  el.className = 'strike-pop';
  el.innerHTML = `<div class="strike-card" role="dialog" aria-label="Special move">
      <header><input class="move-title" maxlength="30" value="${esc(index != null && moves[index] ? moves[index].name : `Move ${moves.length + 1}`)}" aria-label="Move name"><button type="button" class="icon-btn" data-b="cancel" aria-label="Cancel">✕</button></header>
      <div class="strike-chips">${STEP_KINDS.map((k) => `<button type="button" class="chip" data-kind="${k}">${STEP_ICON[k] ? `${STEP_ICON[k]} ` : ''}${STEP_LABEL[k]}</button>`).join('')}</div>
      <div class="strike-field build">
        <svg class="strike-sil" viewBox="0 0 200 300" aria-hidden="true"><g>${SHAPES.humanoid}</g></svg>
        <svg class="strike-ink" aria-hidden="true"><polyline points=""/></svg>
      </div>
      <p class="strike-hint"></p>
      <div class="row"><button type="button" class="btn small" data-b="undo">↶ Undo</button><span class="grow"></span><button type="button" class="btn primary" data-b="save">Save move</button></div>
    </div>`;
  document.body.append(el);
  const field = el.querySelector('.strike-field'), hint = el.querySelector('.strike-hint'), ink = el.querySelector('.strike-ink polyline');
  const draw = () => {
    el.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    const live = drawSteps(field, steps);
    ink.setAttribute('points', live.filter((n) => n.s.k !== 'twin' && n.s.k !== 'twinslash').flatMap((n) => n.p).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
    field.querySelectorAll('.strike-start').forEach((m) => m.remove());
    taps.forEach((t) => {
      const p = geometry(field).toPx(t.x, t.y);
      const m = document.createElement('i');
      m.className = 'strike-node strike-start';
      m.style.left = `${p.x}px`; m.style.top = `${p.y}px`;
      field.append(m);
    });
    el.querySelector('[data-b="save"]').disabled = steps.length < MIN_STEPS;
    const tapHint = { slash: ['Tap where the slash ends'], twin: ['Tap the second node'], twinslash: ['Tap where the first slash ends', 'Tap where the second slash starts', 'Tap where the second slash ends'] };
    hint.textContent = taps.length ? tapHint[kind][taps.length - 1]
      : steps.length >= MAX_STEPS ? `That's ${MAX_STEPS} steps, the most a move can have`
      : `Pick a step, then tap the body to place it (${steps.length} of ${MAX_STEPS})`;
  };
  const close = () => { el.classList.add('closing'); setTimeout(() => el.remove(), 250); };
  field.addEventListener('click', (e) => {
    if (steps.length >= MAX_STEPS) return;
    const b = geometry(field).toBox(localIn(field, e));
    const q = { x: Math.round(Math.max(0, Math.min(200, b.x))), y: Math.round(Math.max(0, Math.min(300, b.y))) };
    taps.push(q);
    if (taps.length >= TAPS[kind]) {
      const st = { k: kind };
      taps.forEach((t, i) => { st[i ? `x${i + 1}` : 'x'] = t.x; st[i ? `y${i + 1}` : 'y'] = t.y; });
      steps.push(st);
      taps = [];
    }
    navigator.vibrate?.(15);
    draw();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.kind) { kind = b.dataset.kind; taps = []; draw(); }
    else if (b.dataset.b === 'undo') { if (taps.length) taps.pop(); else steps.pop(); draw(); }
    else if (b.dataset.b === 'cancel') close();
    else if (b.dataset.b === 'save' && steps.length >= MIN_STEPS) {
      const name = el.querySelector('.move-title').value.trim().slice(0, 30) || `Move ${(index ?? moves.length) + 1}`;
      if (index != null && moves[index]) moves[index] = { name, steps }; else moves.push({ name, steps });
      socket.emit('player:sheet', { moves: moves.slice(0, MAX_MOVES) });
      close();
    }
  });
  requestAnimationFrame(draw);
  draw();
}

// For tests and the TV echo later.
window.Strike = { shapeOf, wantGesture, weaponOf, weaponsOf, pickChain, openStrike, openMoveBuilder, isOpen, chainPoints: () => open?.points() };
