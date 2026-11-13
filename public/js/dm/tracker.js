// Phase 6 on the DM page: rests, conditions on combatants, and segment clocks.
import { $, emit, onState, onClick, state } from '../client.js';

const { esc } = Stage;
const CONDS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];
let whoKey = null;

onState((s) => {
  const everyone = [...s.players, ...s.combat.enemies];
  const k = everyone.map((x) => x.id + x.name).join();
  if (k !== whoKey) {
    const cur = $('#condWho').value;
    whoKey = k;
    $('#condWho').innerHTML = everyone.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') || '<option value="">Nobody yet</option>';
    if (everyone.some((x) => x.id === cur)) $('#condWho').value = cur;
  }
  const who = everyone.find((x) => x.id === $('#condWho').value);
  $('#condBtns').innerHTML = who ? CONDS.map((c) => `<button class="btn small ${(who.conditions || []).includes(c) ? 'on' : ''}" data-cond="${c}">${c}</button>`).join('') : '';
  const names = Object.fromEntries(everyone.map((x) => [x.id, x.name]));
  $('#timerList').innerHTML = (s.timers || []).map((t) => `<div class="item"><span><b>${esc(names[t.charId] || 'Someone')}</b> ${esc(t.name)} <small class="muted">${t.kind === 'concentration' ? 'concentrating' : `${t.rounds} round${t.rounds === 1 ? '' : 's'} left`}</small></span></div>`).join('') || '<p class="note">No timers.</p>';
  $('#clockList').innerHTML = (s.clocks || []).map((c) => `<div class="item"><span><b>${esc(c.name)}</b> <small class="muted">${c.filled}/${c.segments}</small></span><span class="clock-row"><button class="btn small" data-clock="${c.id}" data-d="-1">−</button><button class="btn small" data-clock="${c.id}" data-d="1">+</button><button class="btn small danger" data-clock-del="${c.id}">✕</button></span></div>`).join('') || '<p class="note">No clocks yet.</p>';
});

$('#condWho').onchange = () => {};
onClick('cond', (name) => {
  const who = $('#condWho').value;
  const has = state()?.players.concat(state().combat.enemies).find((x) => x.id === who)?.conditions?.includes(name);
  const rounds = Math.round(Number($('#condRounds').value) || 0);
  if (!has && rounds > 0) emit('dm:timer:condition', { id: who, name, rounds });
  else emit('dm:condition', { id: who, name, on: !has });
});
onClick('conc', (a) => {
  const who = $('#condWho').value;
  if (a === 'drop') return emit('dm:concentrate:drop', { id: who });
  const spell = $('#concSpell').value.trim();
  if (!spell) return;
  emit('dm:concentrate', { id: who, spell });
  $('#concSpell').value = '';
});
$('#clockList').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.clockDel) emit('dm:clock:remove', { id: b.dataset.clockDel });
  else emit('dm:clock:fill', { id: b.dataset.clock, delta: Number(b.dataset.d) });
});
$('#clockAdd').onclick = () => { const name = $('#clockName').value.trim(); if (name) { emit('dm:clock:add', { name, segments: $('#clockSegs').value }); $('#clockName').value = ''; } };
onClick('act', (a) => {
  if (a === 'restShort') { if (confirm('Short rest? Players spend hit dice from their sheets.')) emit('dm:rest', { kind: 'short' }); }
  if (a === 'restLong') { if (confirm('Long rest? HP, spell slots and half the hit dice come back.')) emit('dm:rest', { kind: 'long' }); }
});
