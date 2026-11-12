// Party HP, enemies, initiative and enemy turns.
import { $, emit, onState, onClick, state } from '../client.js';

const { esc, hpBar } = Stage;
const hpButtons = (id, steps) => steps.map((d) => `<button class="btn small" data-hp="${id}" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('');

onState((s) => {
  const turn = s.combat.active ? s.combat.order[s.combat.turn]?.id : null;
  const def = s.rules.defenseLabel;
  $('#party').innerHTML = s.players.map((p) => `
    <div class="item ${turn === p.id ? 'turn' : ''}">
      <span>${p.online ? '🟢' : '⚪'} <b>${esc(p.name)}</b> <small class="muted">${esc(p.cls)} ${esc(def)}${p.ac}</small></span>
      ${hpBar(p)}
      <span class="row">${hpButtons(p.id, [-5, -1, 1, 5])}<button class="btn small danger" data-kick="${p.id}">✕</button></span>
    </div>`).join('') || '<p class="note">No players yet. They scan the QR on the TV.</p>';

  $('#enemies').innerHTML = s.combat.enemies.map((e) => `
    <div class="item ${turn === e.id ? 'turn' : ''}">
      <span>👹 <b>${esc(e.name)}</b> <small class="muted">${esc(def)}${e.ac} +${e.atk}</small></span>
      ${hpBar(e)}
      <span class="row">${hpButtons(e.id, [-5, -1, 1])}<button class="btn small danger" data-rm="${e.id}">✕</button></span>
    </div>`).join('');

  const foe = s.combat.enemies.find((e) => e.id === turn);
  $('#enemyTurn').innerHTML = foe && foe.hp > 0
    ? `<div class="note">${esc(foe.name)}'s turn. Attack:</div><div class="row">${s.players.filter((p) => p.hp > 0).map((p) => `<button class="btn small primary" data-atk="${p.id}">${esc(p.name)}</button>`).join('')}</div>`
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
onClick('atk', (target) => emit('dm:enemy:attack', { target }));
onClick('preset', (preset) => {
  const [name, hp, ac, atk, dmg] = preset.split(',');
  const n = (state()?.combat.enemies.filter((e) => e.name.startsWith(name)).length || 0) + 1;
  emit('dm:enemy:add', { name: `${name} ${n}`, hp, ac, atk, dmg });
});
