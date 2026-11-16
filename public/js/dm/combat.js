// Party HP, enemies, initiative and enemy turns.
import { $, emit, onState, onClick } from '../client.js';

const { esc, hpBar } = Stage;
const SIDE = { enemy: '👹', ally: '🛡', neutral: '🕊' };
let atkFor = null;
let atkIdx = 0;
let lastOrder = '';
const slotText = (p) => { const s = Object.entries(p.slots || {}); return s.length ? ` · ✨ ${s.map(([l, x]) => `${x.max - x.used}/${x.max}`).join(' ')}` : ''; };
const hpButtons = (id, steps) => steps.map((d) => `<button class="btn small" data-hp="${id}" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('');

onState((s) => {
  const turn = s.combat.active ? s.combat.order[s.combat.turn]?.id : null;
  const def = s.rules.defenseLabel;
  $('#party').innerHTML = s.players.map((p) => `
    <div class="item ${turn === p.id ? 'turn' : ''}">
      <span>${p.online ? '🟢' : '⚪'} <b>${esc(p.name)}</b> <small class="muted">${esc(p.cls)} ${esc(def)}${p.ac}${p.derived?.passive?.Perception ? ` · 👁 ${p.derived.passive.Perception}` : ''}${slotText(p)}${p.tempHp ? ` · +${p.tempHp} temp` : ''}</small></span>
      ${hpBar(p)}
      <span class="row">${hpButtons(p.id, [-5, -1, 1, 5])}<button class="btn small danger" data-kick="${p.id}">✕</button></span>
    </div>`).join('') || '<p class="note">No players yet. They scan the QR on the TV.</p>';

  renderOrder(s, turn, def);
});

// Everyone in the fight, in initiative order once it is rolled. Creatures get one card with all of their info:
// HP, AC, speed, attacks and targets. A creature that has acted this round has its actions greyed out.
function renderOrder(s, turn, def) {
  const c = s.combat;
  const byId = Object.fromEntries([...s.players, ...c.enemies].map((x) => [x.id, x]));
  const ids = c.active ? c.order.map((o) => o.id).filter((id) => byId[id]) : [...c.enemies.map((e) => e.id), ...s.players.map((p) => p.id)];
  const extra = c.active ? [...c.enemies, ...s.players].filter((x) => !ids.includes(x.id)).map((x) => x.id) : [];
  const init = Object.fromEntries(c.order.map((o) => [o.id, o.init]));
  $('#encRound').textContent = c.active ? `Round ${c.round}` : 'not started';
  const foe = c.enemies.find((e) => e.id === turn);
  if (foe?.id !== atkFor) { atkFor = foe?.id; atkIdx = 0; }
  const targetsFor = (f) => (f.side === 'enemy'
    ? [...s.players, ...c.enemies.filter((e) => e.side !== 'enemy')]
    : c.enemies.filter((e) => e.side !== f.side && e.id !== f.id)).filter((t) => t.hp > 0);
  const card = (id) => {
    const x = byId[id];
    const pc = !!s.players.find((p) => p.id === id);
    const now = turn === id;
    const ini = init[id] != null ? `<em class="ini" title="Initiative">${init[id]}</em>` : '';
    if (pc) {
      return `<div class="item cbt cbt-pc ${now ? 'turn' : ''}" data-oid="${esc(id)}">
        <span class="cbt-head">${ini}${x.online ? '🟢' : '⚪'} <b>${esc(x.name)}</b> <small class="muted">${esc(x.cls || '')} ${esc(def)}${x.ac}</small></span>${hpBar(x)}</div>`;
    }
    const spent = c.active && c.acted?.[id] === c.round;
    const down = x.hp <= 0;
    const left = Math.max(0, (x.speed?.fly && x.flying !== false ? x.speed.fly : x.speed?.walk ?? 30) - (c.moved?.[id] || 0));
    const atks = (x.attacks || []).map((a, i) => {
      const on = now && !spent && !down;
      return `<button class="btn small atk ${on && i === atkIdx ? 'on' : ''} ${spent ? 'spent' : ''}" ${on ? `data-atk-pick="${i}"` : 'disabled'} title="${spent ? 'Already acted this round' : now ? 'Pick this attack, then a target' : 'Not its turn'}">${esc(a.name)} ${a.atk >= 0 ? '+' : ''}${a.atk} · ${esc(a.dmg)}</button>`;
    }).join('');
    const targets = now && !spent && !down
      ? `<div class="row cbt-targets">${targetsFor(x).map((t) => `<button class="btn small primary" data-atk="${esc(t.id)}">🎯 ${esc(t.name)}</button>`).join('') || '<span class="note">No targets.</span>'}</div>` : '';
    return `<div class="item cbt cbt-foe ${now ? 'turn' : ''} ${spent ? 'acted' : ''} ${down ? 'down' : ''}" data-oid="${esc(id)}">
      <span class="cbt-head" title="${esc((x.traits || []).map((t) => `${t.name}: ${t.text}`).join('\n'))}">${ini}${SIDE[x.side] || '👹'} <b>${esc(x.name)}</b>
        <small class="muted">${esc(def)}${x.ac} · ${left} ft${x.cr != null && x.cr !== '' ? ` · CR ${esc(x.cr)}` : ''}${x.traits?.length ? ' · ⓘ' : ''}</small>
        ${spent ? '<small class="cbt-tag">Acted</small>' : now ? '<small class="cbt-tag now">Its turn</small>' : ''}</span>
      <span class="row cbt-ctl">${x.boss ? `<button class="btn small" data-boss="${esc(id)}" title="Show the title card on the TV">👑</button>` : ''}${hpButtons(id, [-5, -1, 1])}<button class="btn small danger" data-rm="${esc(id)}" title="Remove">✕</button></span>
      ${hpBar(x)}
      <div class="row cbt-atks">${atks || '<span class="note">No attacks.</span>'}</div>
      ${targets}
    </div>`;
  };
  const list = $('#initOrder');
  // FLIP: remember where each card was, re-render, then slide each card from its old place to its new one.
  const before = Object.fromEntries([...list.children].map((el) => [el.dataset.oid, el.getBoundingClientRect().top]));
  const order = [...ids, ...extra];
  list.innerHTML = order.map(card).join('') || '<p class="note">Add creatures from the library or Quick add below, then hold Roll initiative.</p>';
  const key = order.join();
  if (key !== lastOrder && lastOrder && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const el of list.children) {
      const was = before[el.dataset.oid];
      if (was == null) continue;
      const dy = was - el.getBoundingClientRect().top;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  lastOrder = key;
}

// Roll initiative is press and hold: the button fills while held; releasing once it is full rolls and sorts the order.
// The button fires a DOM event 'inithold' with detail.phase 'start' | 'cancel' | 'complete' (complete = rolled),
// so other features (e.g. a TV "Get ready" filter) can follow the hold.
const HOLD_MS = 3000;
(function holdToRoll() {
  const b = $('#initHold');
  if (!b) return;
  const label = b.querySelector('span');
  let t0 = 0; let raf = 0; let ready = false;
  const hook = (phase) => b.dispatchEvent(new CustomEvent('inithold', { bubbles: true, detail: { phase } }));
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; ready = false; b.classList.remove('holding', 'ready'); b.style.setProperty('--hold', 0); label.textContent = '🎲 Hold to roll initiative'; };
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / HOLD_MS);
    b.style.setProperty('--hold', k);
    if (k >= 1 && !ready) { ready = true; b.classList.add('ready'); label.textContent = '🎲 Release to roll'; }
    if (t0) raf = requestAnimationFrame(tick);
  };
  const start = () => { t0 = performance.now(); b.classList.add('holding'); label.textContent = '🎲 Keep holding…'; raf = requestAnimationFrame(tick); hook('start'); };
  const release = () => { if (!t0) return; const go = ready; reset(); if (go) { emit('dm:combat:start'); hook('complete'); } else hook('cancel'); };
  b.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; b.setPointerCapture(e.pointerId); start(); });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', () => { if (t0) { reset(); hook('cancel'); } });
  b.addEventListener('lostpointercapture', () => { if (t0) { reset(); hook('cancel'); } });
  // Keyboard: hold Enter or Space the same way.
  b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !t0) { e.preventDefault(); start(); } });
  b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') release(); });
})();

const actions = {
  combatStart: () => emit('dm:combat:start'),
  combatNext: () => emit('dm:combat:next'),
  combatEnd: () => emit('dm:combat:end'),
  enemyAdd: () => emit('dm:enemy:add', { name: $('#enName').value, hp: $('#enHp').value, ac: $('#enAc').value, atk: $('#enAtk').value, dmg: $('#enDmg').value }),
};
onClick('act', (act) => actions[act]?.());
onClick('hp', (id, b) => emit('dm:hp', { id, delta: Number(b.dataset.d) }));
onClick('kick', (id) => confirm('Remove this player?') && emit('dm:kick', { id }));
onClick('rm', (id) => emit('dm:enemy:remove', { id }));
onClick('boss', (id) => emit('dm:boss:card', { id }));
onClick('atk', (target) => emit('dm:enemy:attack', { target, attack: atkIdx }));
onClick('atk-pick', (i, b) => { atkIdx = Number(i); b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });

