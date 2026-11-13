// DM weather controls (Phase B): what the TV shows over the scene. Strength is the level for the chosen kind.
import { $, emit, onState } from '../client.js';

const KINDS = [['none', 'Clear'], ['rain', '🌧 Rain'], ['snow', '❄️ Snow'], ['fog', '🌫 Fog'], ['storm', '⛈ Storm']];
let shown = null;

$('#weatherBtns').innerHTML = KINDS.map(([k, l]) => `<button class="btn" data-weather="${k}">${l}</button>`).join('');
$('#weatherBtns').addEventListener('click', (e) => {
  const b = e.target.closest('[data-weather]');
  if (b) emit('dm:weather', { kind: b.dataset.weather, intensity: Number($('#weatherStrength').value) });
});
$('#weatherStrength').onchange = (e) => {
  const w = shown;
  if (w && w.kind !== 'none') emit('dm:weather', { kind: w.kind, intensity: Number(e.target.value) });
};

onState((s) => {
  shown = s.weather || { kind: 'none', intensity: 2 };
  $('#weatherStrength').value = String(shown.intensity);
  for (const b of $('#weatherBtns').querySelectorAll('[data-weather]')) b.classList.toggle('on', b.dataset.weather === shown.kind);
});
