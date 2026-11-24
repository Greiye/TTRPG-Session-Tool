// Drag-to-roll die (PR AD, Nov 24): flick the die in a roll call to roll it. The flick only sets the tumble; the
// server rolls, as it does for the Roll button beside it. Off with the phone setting "Drag dice to roll".
const FLICK = 24; // px of drag that counts as a throw

export const dragOn = () => window.Settings?.get().dragroll !== 'off';
export const dieHtml = () => `<div class="drag-die-wrap"><button type="button" class="drag-die" data-drag-die aria-label="Flick or tap the die to roll">
  <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,1 22,6.5 22,17.5 12,23 2,17.5 2,6.5"/><polygon points="12,6 18,16 6,16"/></svg></button><small class="note">Flick the die, or tap Roll</small></div>`;

// onRoll fires once, on a flick or a tap.
export function wireDie(root, onRoll) {
  const die = root.querySelector('[data-drag-die]');
  if (!die) return;
  let from = null; let dx = 0; let dy = 0; let done = false;
  const roll = () => {
    if (done) return;
    done = true;
    die.disabled = true;
    const reach = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, 110 / reach);
    if (window.Anim && !Anim.reduced()) {
      const turn = (dx < 0 ? -1 : 1) * Math.min(1080, 360 + reach * 3);
      die.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx * k * 1.2}px, ${dy * k * 1.2}px) rotate(${turn * 0.7}deg)`, offset: 0.5 }, { transform: `translate(0, 0) rotate(${turn}deg)` }], { duration: 700, easing: Anim.ease() });
    }
    die.style.transform = '';
    navigator.vibrate?.([15, 40, 15, 40, 40]);
    onRoll();
  };
  die.addEventListener('pointerdown', (e) => {
    if (done || e.button > 0) return;
    e.preventDefault(); // the drag must not scroll the sheet
    from = { x: e.clientX, y: e.clientY }; dx = 0; dy = 0;
    die.setPointerCapture(e.pointerId);
    die.classList.add('held');
  });
  die.addEventListener('pointermove', (e) => {
    if (!from) return;
    dx = e.clientX - from.x; dy = e.clientY - from.y;
    die.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx}deg)`;
  });
  const drop = (throwIt) => {
    if (!from) return;
    from = null;
    die.classList.remove('held');
    const far = Math.hypot(dx, dy);
    if (throwIt && far >= FLICK) roll();
    else die.style.transform = '';
  };
  die.addEventListener('pointerup', () => drop(true));
  die.addEventListener('pointercancel', () => drop(false));
  die.addEventListener('click', () => { if (Math.hypot(dx, dy) < FLICK) { dx = 0; dy = 0; roll(); } }); // a tap, or Enter
}
