// Strike gestures (Mike, Nov 17; docs/combat-aesthetic.md feature 2). After a player picks an enemy, a pop-up
// shows its silhouette. Press and drag across it to slash; press and hold for a piercing strike while a ring
// closes in on the finger. Then a short pause, and the attack is rolled on the server as before: the gesture
// is for show and never changes the roll (Mike's decision 1). The result plays on the silhouette.
//
// Switches: the table's "Strike gestures" setting (DM) and this phone's "One-tap attacks" setting. Every pop-up
// also has a Quick strike button, and after WINDOW_MS the strike goes by itself so turns stay fast.
// Silhouettes, ring speed and effects are PLACEHOLDER; weapon speeds and the body part hit are still open.
//
// Node strikes (Mike, Nov 17): martial artists and unique weapons drag through numbered nodes on the silhouette
// instead, 1 then 2 then 3..., each node a kick or a punch. Finishing the chain makes the attack (style 'combo').
// Who gets nodes, how many, and how fast they pulse are PLACEHOLDER until Mike sets them.
import { socket } from '../client.js';
import { me } from './identity.js';

const HOLD_MS = 1000; // PLACEHOLDER ring time until weapon speeds are set
const WINDOW_MS = 5000; // the gesture window (Mike, Nov 17: "keep turns fast")
const SLASH_SPAN = 0.5; // a slash must cross half the silhouette
const PAUSE_MS = 350; // the beat between the strike and the roll
const NODE_COUNT = 4; // PLACEHOLDER: nodes in a chain
const NODE_R = 30; // how close (px) the finger must pass to a node
const NODE_PULSE_MS = 900; // PLACEHOLDER: node pulse speed until weapon speeds are set (dagger fast, mace slow)
// PLACEHOLDER: who strikes with nodes. Classes that fight unarmed, and items that read as unique weapons.
const NODE_CLASSES = /monk|martial|brawl|pugil|unarmed|fist|boxer|wrestl/i;
const NODE_WEAPONS = /nunchaku|gauntlet|knuckle|cestus|claw|tonfa|kusari|chakram|whip|sai\b|bo staff/i;

const esc = (s) => Stage.esc(s);
// 'nodes' for martial artists and unique weapons, otherwise 'free' (slash or pierce).
export function strikeMode(hero) {
  if (!hero) return 'free';
  if (NODE_CLASSES.test(hero.cls || '')) return 'nodes';
  if ((hero.inventory || []).some((i) => i.qty !== 0 && NODE_WEAPONS.test(i.name || ''))) return 'nodes';
  return 'free';
}
export const wantGesture = (S) => S?.settings?.display?.gestures !== 'off' && Settings.get().onetap !== 'on';

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

// Where nodes can sit on each silhouette, in its viewBox (head, chest, arms, belly, legs...). PLACEHOLDER.
const SPOTS = {
  humanoid: [[100, 42], [100, 105], [50, 130], [150, 130], [100, 155], [83, 235], [117, 235]],
  beast: [[168, 122], [60, 155], [110, 150], [150, 165], [45, 225], [155, 225], [20, 120]],
  blob: [[84, 160], [122, 160], [60, 220], [140, 220], [100, 120], [100, 205]],
  winged: [[100, 88], [100, 150], [40, 120], [160, 120], [100, 195], [89, 245], [111, 245]],
};
// A random chain of distinct spots, so every strike is a little different.
export function pickChain(shape, n = NODE_COUNT, rnd = Math.random) {
  const pool = [...(SPOTS[shape] || SPOTS.humanoid)];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

let open = null;
export const isOpen = () => !!open;

// Opens the pop-up for `foe`; `hero` is this phone's character (it picks node strikes). Resolves when it closes.
export function openStrike(foe, hero) {
  if (open) return open.done;
  const nodes = strikeMode(hero) === 'nodes';
  const shape = shapeOf(foe);
  const el = document.createElement('div');
  el.id = 'strike';
  el.className = 'strike-pop';
  if (nodes) el.dataset.mode = 'nodes';
  el.innerHTML = `<div class="strike-card" role="dialog" aria-label="Strike ${esc(foe.name)}">
      <header><b>Strike ${esc(foe.name)}</b><button type="button" class="icon-btn strike-x" aria-label="Cancel">✕</button></header>
      <div class="strike-field">
        <svg class="strike-sil" viewBox="0 0 200 300" aria-hidden="true"><g>${SHAPES[shape]}</g></svg>
        <svg class="strike-ink" aria-hidden="true"><polyline points=""/></svg>
        <i class="strike-ring" hidden></i>
        <b class="strike-result" hidden></b>
      </div>
      <p class="strike-hint">${nodes ? `Drag through the nodes, 1 to ${NODE_COUNT}` : 'Drag across to slash · Hold to pierce'}</p>
      <div class="strike-time" aria-hidden="true"><i style="animation-duration:${WINDOW_MS}ms"></i></div>
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
    // The strike mark (PLACEHOLDER): a white streak along the slash, or a puncture where the finger held.
    if (style === 'pierce' && at) {
      const p = document.createElement('i');
      p.className = 'strike-stab';
      p.style.left = `${at.x}px`; p.style.top = `${at.y}px`;
      field.append(p);
    }
    if (style === 'combo') dots.forEach((d, i) => { d.style.animationDelay = `${i * 70}ms`; d.classList.add('burst'); });
    navigator.vibrate?.(style === 'pierce' ? [10, 30, 60] : style === 'combo' ? [] : [45]);
    later(() => socket.emit('player:combat', { act: 'attack', target: foe.id, style }), PAUSE_MS);
    later(close, 4000); // no answer (no line of sight, turn moved on): close anyway
  }

  // Layout pixels inside the field, even while the card is still scaling in.
  const local = (e) => { const r = field.getBoundingClientRect(), s = r.width / (field.offsetWidth || r.width) || 1; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
  // Node strikes: numbered nodes on the silhouette, reached in order with one finger.
  const chain = nodes ? pickChain(shape) : [];
  const dots = chain.map((_, i) => {
    const d = document.createElement('i');
    d.className = 'strike-node';
    d.textContent = i + 1;
    d.style.animationDuration = `${NODE_PULSE_MS}ms`;
    d.style.animationDelay = `${-i * 120}ms`;
    field.append(d);
    return d;
  });
  let reached = 0;
  const nodeAt = () => {
    // In layout pixels (the card scales in as it opens). The silhouette's box is inset 6% 12% (style.css) and
    // keeps its aspect ratio inside it (xMidYMid meet), like the SVG does.
    const W = field.clientWidth, H = field.clientHeight, sw = W * 0.76, sh = H * 0.88;
    const k = Math.min(sw / 200, sh / 300);
    const ox = W * 0.12 + (sw - 200 * k) / 2, oy = H * 0.06 + (sh - 300 * k) / 2;
    return chain.map(([x, y]) => ({ x: ox + x * k, y: oy + y * k }));
  };
  let spots = [];
  const placeNodes = () => { spots = nodeAt(); spots.forEach((p, i) => { dots[i].style.left = `${p.x}px`; dots[i].style.top = `${p.y}px`; }); };
  if (nodes) requestAnimationFrame(placeNodes);
  const resetChain = (msg) => {
    reached = 0;
    dots.forEach((d) => d.classList.remove('on'));
    ink.setAttribute('points', '');
    if (msg) hint.textContent = msg;
  };
  // Lights the next node when the finger passes over it. Returns true when the chain is done.
  const touchNode = (p) => {
    const t = spots[reached];
    if (!t || Math.hypot(p.x - t.x, p.y - t.y) > NODE_R) return false;
    dots[reached].classList.add('on');
    reached++;
    navigator.vibrate?.(reached === chain.length ? [30, 20, 50] : [25]);
    ink.setAttribute('points', spots.slice(0, reached).map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
    if (reached === chain.length) { strike('combo', p); return true; }
    hint.textContent = `${reached} of ${chain.length}`;
    return false;
  };
  if (nodes) {
    field.addEventListener('pointerdown', (e) => {
      if (struck) return;
      e.preventDefault();
      field.setPointerCapture?.(e.pointerId);
      placeNodes();
      resetChain();
      press = { nodes: true };
      if (!touchNode(local(e)) && !reached) hint.textContent = 'Start on node 1';
    });
    field.addEventListener('pointermove', (e) => { if (press?.nodes && !struck && reached) touchNode(local(e)); });
    const lift = () => {
      if (!press || struck) return;
      press = null;
      if (reached) resetChain(`Keep your finger down from 1 to ${chain.length}`);
    };
    field.addEventListener('pointerup', lift);
    field.addEventListener('pointercancel', lift);
  }

  if (!nodes) field.addEventListener('pointerdown', (e) => {
    if (struck) return;
    e.preventDefault();
    field.setPointerCapture?.(e.pointerId);
    const p = local(e);
    press = { start: p, pts: [p], slash: false };
    hint.textContent = 'Drag across to slash · Hold to pierce';
    ink.setAttribute('points', '');
    // Hold: the ring closes in on the finger; when it meets it, the piercing strike lands.
    ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`;
    ring.style.animationDuration = `${HOLD_MS}ms`;
    ring.hidden = false; ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go');
    buzz = setInterval(() => navigator.vibrate?.(8), 160);
    holdTimer = setTimeout(() => strike('pierce', p), HOLD_MS);
  });
  if (!nodes) field.addEventListener('pointermove', (e) => {
    if (!press || struck) return;
    const p = local(e);
    press.pts.push(p);
    if (!press.slash && Math.hypot(p.x - press.start.x, p.y - press.start.y) > 22) {
      press.slash = true; // moving: a slash, not a hold
      clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true;
    }
    if (press.slash) {
      ink.setAttribute('points', press.pts.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
      if (press.pts.length % 4 === 0) navigator.vibrate?.(6);
    }
  });
  const up = () => {
    if (!press || struck) return;
    clearTimeout(holdTimer); clearInterval(buzz); ring.hidden = true;
    const { pts, slash } = press;
    press = null;
    if (slash) {
      const fr = field.getBoundingClientRect(), sr = sil.getBoundingClientRect();
      const xs = pts.map((q) => q.x + fr.left), ys = pts.map((q) => q.y + fr.top);
      const span = Math.max(Math.min(Math.max(...xs), sr.right) - Math.max(Math.min(...xs), sr.left), Math.min(Math.max(...ys), sr.bottom) - Math.max(Math.min(...ys), sr.top));
      if (span >= SLASH_SPAN * sr.width) return strike('slash');
      hint.textContent = 'Drag all the way across it to slash';
    } else hint.textContent = 'Hold until the ring closes to pierce';
    ink.setAttribute('points', '');
  };
  if (!nodes) { field.addEventListener('pointerup', up); field.addEventListener('pointercancel', up); }
  $('.strike-tap').onclick = () => strike('tap');
  $('.strike-x').onclick = () => { if (!struck) close(); };
  later(() => strike('tap'), WINDOW_MS); // the window ran out: an ordinary strike

  open = { done };
  return done;
}

// For tests and the TV echo later: what the pop-up would do with a foe.
window.Strike = { shapeOf, wantGesture, strikeMode, pickChain, openStrike, isOpen };
