// Phone side of Phase 2: the dice pool for free rolls, and the notice popup.
import { socket, $ } from '../client.js';

const { esc } = Stage;
// Roll calls from the DM are a phone pop-up now (public/js/play/popups.js, Mike Nov 16).

// Dice pool (top of the Play tab): D4 to D20, each with ◀ ▶ to take away or add a die, and a Roll button.
// Adv and Dis apply when the pool is a single D20. The pool stays as it is after a roll, for repeat rolls.
const DICE = [4, 6, 8, 10, 12, 20];
const MAX_DIE = 20;
// Die outlines: triangle, square, diamond, kite, pentagon, hexagon. Inline SVG, no network needed.
const SHAPE = {
  4: '<polygon points="12,2 22,21 2,21"/>',
  6: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
  8: '<polygon points="12,1 23,12 12,23 1,12"/><line x1="1" y1="12" x2="23" y2="12"/>',
  10: '<polygon points="12,1 22,10 12,23 2,10"/><polyline points="2,10 12,14 22,10"/><line x1="12" y1="14" x2="12" y2="23"/>',
  12: '<polygon points="12,1 23,9 19,22 5,22 1,9"/><polygon points="12,6 17,10 15,16 9,16 7,10"/>',
  20: '<polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"/><polygon points="12,6 18,16 6,16"/>',
};
const icon = (n) => `<svg class="die-ico" viewBox="0 0 24 24" aria-hidden="true">${SHAPE[n]}</svg>`;
const pool = Object.fromEntries(DICE.map((n) => [n, 0]));
let mode = null;
let last = '';
const exprOf = () => DICE.filter((n) => pool[n]).map((n) => `${pool[n]}d${n}`).join('+');
const soloD20 = () => pool[20] === 1 && DICE.every((n) => n === 20 || !pool[n]);

function drawPool() {
  const el = $('#dicePool');
  if (!el) return;
  const expr = exprOf();
  el.innerHTML = `<h3>🎲 Dice</h3>
    <div class="dice-grid">${DICE.map((n) => `<div class="die ${pool[n] ? 'has' : ''}">
      <button class="die-step" data-die="${n}" data-step="-1" aria-label="One less D${n}" ${pool[n] ? '' : 'disabled'}>◀</button>
      <span class="die-face">${icon(n)}<b>D${n}</b>${pool[n] ? `<i class="die-n">${pool[n]}</i>` : ''}</span>
      <button class="die-step" data-die="${n}" data-step="1" aria-label="One more D${n}" ${pool[n] >= MAX_DIE ? 'disabled' : ''}>▶</button>
    </div>`).join('')}</div>
    <div class="row dice-opts">
      <button class="btn small ${mode === 'adv' ? 'on' : ''}" data-dmode="adv" ${soloD20() ? '' : 'disabled'} title="Advantage on a single D20">Adv</button>
      <button class="btn small ${mode === 'dis' ? 'on' : ''}" data-dmode="dis" ${soloD20() ? '' : 'disabled'} title="Disadvantage on a single D20">Dis</button>
      <span class="grow"></span>
      <button class="btn small" data-dclear ${expr ? '' : 'disabled'}>Clear</button>
    </div>
    <button class="bigbtn" id="dieGo" ${expr ? '' : 'disabled'}>${expr ? `Roll ${expr}` : 'Add dice to roll'}</button>
    <p class="note dice-out" id="dieOut" aria-live="polite">${esc(last)}</p>`;
}
drawPool();

$('#dicePool').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.die) {
    const n = Number(b.dataset.die);
    pool[n] = Math.max(0, Math.min(MAX_DIE, pool[n] + Number(b.dataset.step)));
    if (!soloD20()) mode = null;
    navigator.vibrate?.(10);
    drawPool();
    if (Number(b.dataset.step) > 0) $('#dicePool').querySelector(`[data-die="${n}"]`)?.closest('.die')?.classList.add('bump');
    return;
  }
  if (b.dataset.dmode) { mode = mode === b.dataset.dmode ? null : b.dataset.dmode; return drawPool(); }
  if (b.hasAttribute('data-dclear')) { DICE.forEach((n) => { pool[n] = 0; }); mode = null; last = ''; return drawPool(); }
  if (b.id === 'dieGo') {
    const expr = exprOf();
    if (!expr) return;
    b.classList.add('rolling');
    navigator.vibrate?.(30);
    socket.emit('player:roll', { expr, mode: soloD20() ? mode : undefined }, (res) => {
      last = res.error ? res.error : `${expr} = ${res.total}`;
      drawPool();
    });
  }
});
socket.on('rollpop', (p) => window.RollPop?.show(p));
socket.on('notice', ({ text }) => { navigator.vibrate?.([80, 60, 80]); window.RollPop?.show({ who: 'Notice', label: text, anim: 'flip' }); });
