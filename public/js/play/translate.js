// Translation notification (Mike, Nov 18). When an NPC speaks in a language other than Common, a player whose
// character knows it (or that the DM glossed it for) gets the line, translated, as a notification on the phone.
// It stays long enough to read the whole line: about 3 words a second, plus a moment to notice it, 4 s at least
// and 30 s at most. A tap closes it early. Everyone else keeps the scrambled glyphs (src/speech.js).
import { onState } from '../client.js';

const { esc } = Stage;
let el = null;
let timer = null;

export const readMs = (text) => {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(4000, Math.min(30000, 1500 + words * 340));
};

function close() {
  clearTimeout(timer);
  if (!el) return;
  const box = el;
  el = null;
  box.classList.add('out');
  setTimeout(() => box.remove(), 300);
}

function show(line) {
  close();
  el = document.createElement('div');
  el.className = 'tr-note';
  el.setAttribute('role', 'status');
  const ms = readMs(line.text);
  el.style.setProperty('--tr-ms', `${ms}ms`);
  el.innerHTML = `<p class="tr-kicker">🔤 ${esc(line.lang)} · you understand</p><p class="tr-who">${esc(line.speaker || 'NPC')} says</p><p class="tr-text">“${esc(line.text)}”</p><i class="tr-bar" aria-hidden="true"></i>`;
  el.addEventListener('click', close);
  document.body.appendChild(el);
  navigator.vibrate?.(40);
  timer = setTimeout(close, ms);
}

// One notification per line. A line glossed for this player after it was spoken shows then.
let first = true;
const shown = new Set();
onState((S) => {
  const line = S.social?.line;
  const was = first;
  first = false;
  if (S.viewer?.role !== 'player' || !line?.lang || line.n == null || shown.has(line.n)) return;
  if (was) { shown.add(line.n); return; } // spoken before this phone loaded: stays quiet
  if (line.scrambled) return;
  shown.add(line.n);
  show(line);
});
