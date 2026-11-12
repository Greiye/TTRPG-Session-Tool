// Phone side of Phase 2: the roll-call button, a dice box for free rolls, and the notice popup.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';

const { esc } = Stage;
let lastCall = null;

// The roll-call banner appears above the Play tab when the DM calls a check you can answer.
onState((s) => {
  const c = s.players.find((p) => p.id === me.charId);
  const chk = s.check;
  const mine = c && chk && (!chk.targets || chk.targets.includes(c.id));
  const done = mine && chk.results[c.id];
  const host = $('#main');
  if (!host) return;
  let box = document.getElementById('callBox');
  if (!mine) { box?.remove(); lastCall = null; return; }
  if (!box) { box = document.createElement('div'); box.id = 'callBox'; box.className = 'card call-box'; host.prepend(box); }
  const bonus = chk.kind === 'skill' ? c.skills?.[chk.key] : chk.kind === 'save' ? c.derived?.saves?.[chk.key] : c.derived?.mods?.[chk.key];
  const label = chk.label;
  const key = `${chk.id}:${!!done}:${c.inspiration || 0}`;
  if (key === lastCall) return;
  lastCall = key;
  box.innerHTML = done
    ? `<h3>${esc(label)}</h3><p class="note">You rolled ${done.roll}${done.total !== undefined ? ` → ${done.total}` : ''}. Waiting for the others…</p>`
    : `<h3>DM calls: ${esc(label)}</h3>
       <p class="note">${chk.hideDc ? 'The DC is secret.' : `${esc(s.rules.dcLabel)} ${chk.dc}`}${chk.mode ? ` · ${chk.mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''}</p>
       <button class="bigbtn" data-answer="1">🎲 Roll ${esc(label)} (${bonus >= 0 ? '+' : ''}${bonus ?? 0})</button>
       ${c.inspiration > 0 && chk.mode !== 'dis' ? `<button class="btn" data-answer="1" data-inspire="1">✨ Roll with inspiration (${c.inspiration} left, advantage)</button>` : ''}`;
});

$('#main').addEventListener('click', (e) => {
  const b = e.target.closest('[data-answer]');
  if (b) { socket.emit('player:answer', { inspire: !!b.dataset.inspire }); navigator.vibrate?.(40); }
});

// Dice box: any expression, plus advantage on a d20 when the box is set to it.
export function rollBox() {
  return `<div class="card"><h3>Dice</h3><div class="roll-box"><input id="dieExpr" placeholder="2d6+3, d20, 4d6kh3" autocomplete="off"><button class="btn primary" id="dieGo">Roll</button></div><div class="row"><button class="btn small" id="dieAdv">Adv</button><button class="btn small" id="dieDis">Dis</button><span class="note" id="dieOut"></span></div></div>`;
}
let mode;
document.addEventListener('click', (e) => {
  if (e.target.id === 'dieAdv') { mode = mode === 'adv' ? null : 'adv'; e.target.classList.toggle('on', mode === 'adv'); }
  if (e.target.id === 'dieDis') { mode = mode === 'dis' ? null : 'dis'; e.target.classList.toggle('on', mode === 'dis'); }
  if (e.target.id === 'dieGo') {
    const expr = $('#dieExpr')?.value.trim();
    if (!expr) return;
    socket.emit('player:roll', { expr, mode }, (res) => { const out = $('#dieOut'); if (out) out.textContent = res.error ? res.error : `= ${res.total}`; });
  }
});
socket.on('rollpop', (p) => window.RollPop?.show(p));
socket.on('notice', ({ text }) => { navigator.vibrate?.([80, 60, 80]); window.RollPop?.show({ who: 'Notice', label: text, anim: 'flip' }); });
