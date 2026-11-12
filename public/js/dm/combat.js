// Party HP, enemies, initiative and enemy turns.
import { $, emit, onState, onClick } from '../client.js';

const { esc, hpBar } = Stage;
const SIDE = { enemy: '👹', ally: '🛡', neutral: '🕊' };
let atkFor = null;
let atkIdx = 0;
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

  $('#enemies').innerHTML = s.combat.enemies.map((e) => `
    <div class="item ${turn === e.id ? 'turn' : ''}">
      <span title="${esc((e.traits || []).map((t) => `${t.name}: ${t.text}`).join('\n'))}">${SIDE[e.side] || '👹'} <b>${esc(e.name)}</b> <small class="muted">${esc(def)}${e.ac}${e.speed?.fly ? ` · fly ${e.speed.fly}` : ''}${e.traits?.length ? ' · ⓘ' : ''}</small></span>
      ${hpBar(e)}
      <span class="row">${hpButtons(e.id, [-5, -1, 1])}<button class="btn small danger" data-rm="${e.id}">✕</button></span>
    </div>`).join('');

  // The DM plays creatures of every side. Enemies aim at the party and its allies; allies aim at enemies.
  // Boss title cards: one button per boss in the encounter.
  $('#bossBtns').innerHTML = s.combat.enemies.filter((e) => e.boss).map((e) => `<button class="btn small" data-boss="${esc(e.id)}">👑 Title card: ${esc(e.name)}</button>`).join('');
  const foe = s.combat.enemies.find((e) => e.id === turn);
  if (foe?.id !== atkFor) { atkFor = foe?.id; atkIdx = 0; }
  const targets = !foe ? [] : foe.side === 'enemy'
    ? [...s.players, ...s.combat.enemies.filter((e) => e.side !== 'enemy')]
    : s.combat.enemies.filter((e) => e.side !== foe.side && e.id !== foe.id);
  $('#enemyTurn').innerHTML = foe && foe.hp > 0
    ? `<div class="note">${esc(foe.name)}'s turn.</div>
       <div class="row">${(foe.attacks || []).map((a, i) => `<button class="btn small ${i === atkIdx ? 'on' : ''}" data-atk-pick="${i}">${esc(a.name)} ${a.atk >= 0 ? '+' : ''}${a.atk} · ${esc(a.dmg)}</button>`).join('')}</div>
       <div class="row">${targets.filter((p) => p.hp > 0).map((p) => `<button class="btn small primary" data-atk="${p.id}">🎯 ${esc(p.name)}</button>`).join('') || '<span class="note">No targets.</span>'}</div>`
    : turn ? '<div class="note">Waiting on the player\'s phone… (or Next turn)</div>' : '';
});

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

