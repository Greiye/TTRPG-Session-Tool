// Show / Hide toggles (Mike, Nov 18: "any button that shows should change into a hide"). A "Show … on TV"
// checkbox marked data-show / data-hide becomes one button that reads Show while off and Hide while on. The
// checkbox stays (hidden) as the source of truth, so the code that reads or sets it keeps working; the button
// follows it after every state update and on every change.
import { onState } from '../client.js';

const pairs = [];
function sync({ box, btn }) {
  const on = box.checked;
  btn.textContent = on ? box.dataset.hide : box.dataset.show;
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.disabled = box.disabled;
}
document.querySelectorAll('input[type="checkbox"][data-show][data-hide]').forEach((box) => {
  const label = box.closest('label') || box;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small show-toggle';
  btn.title = label.title || '';
  label.after(btn);
  label.hidden = true;
  const pair = { box, btn };
  pairs.push(pair);
  btn.addEventListener('click', () => {
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    sync(pair);
    window.Anim?.play?.(btn, 'pop', null);
  });
  box.addEventListener('change', () => sync(pair));
  sync(pair);
});
onState(() => requestAnimationFrame(() => pairs.forEach(sync)));
