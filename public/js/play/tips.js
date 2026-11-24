// First-time tips (PR AD, Nov 24): the first time a tab opens on this phone, one short line says what it is for.
// Any tap closes it, and the tap still does what it would have done. The DM can reset tips for the table (tipsN).
import { onState, state } from '../client.js';
import { current, onShow } from './nav.js';
import { onTab, tab } from './tabs.js';

const TIPS = {
  play: 'Roll dice here. Quick rolls ask your DM first.',
  sheet: 'Press and hold a skill to roll it. Tap a feature card to flip it.',
  spells: 'Tap a spell card to flip it and read the rules.',
  inventory: 'Everything you carry. Your DM hands out new items.',
  inbox: 'Messages from your DM stay here.',
  map: 'Tap a place to see what is known. Nearby places are listed below the map.',
  notes: 'Notes the whole party can read.',
  lore: 'What the party has learned about the world.',
  logs: 'What happened at the table.',
  dungeon: 'Where the party is in the dungeon.',
  town: 'Pick where to go in town.',
  downtime: 'Choose how you spend your time off.',
};
const KEY = 'tavernTips';
let store = { n: 0, seen: [] };
try { store = { ...store, ...JSON.parse(localStorage[KEY] || '{}') }; } catch { /* private mode */ }
const save = () => { try { localStorage[KEY] = JSON.stringify(store); } catch { /* private mode */ } };

let el = null;
let resetChecked = false;
function close() {
  if (!el) return;
  const old = el;
  el = null;
  old.classList.add('closing');
  setTimeout(() => old.remove(), 220);
}
function show() {
  const S = state();
  const id = tab();
  if (!S || S.lobby || S.viewer?.role !== 'player' || current() !== 'game' || !resetChecked) return;
  if (!TIPS[id] || store.seen.includes(id)) return;
  store.seen = [...store.seen, id];
  save();
  close();
  el = document.createElement('div');
  el.className = 'phone-tip';
  el.setAttribute('role', 'status');
  el.textContent = `💡 ${TIPS[id]}`;
  document.body.append(el);
  window.Anim?.play(el, 'slideUp', null);
}
// The tap that opened the tab must not close its tip at once: pointerdown comes before the tab's click.
document.addEventListener('pointerdown', close, true);
onTab(() => show());
onShow(() => { if (current() !== 'game') close(); else show(); });
onState((S) => {
  const n = S?.tipsN || 0;
  if (n !== store.n) { store = { n, seen: [] }; save(); }
  resetChecked = true;
  show();
});
