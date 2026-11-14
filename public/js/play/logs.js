// Phone Logs tab: the table's recent log, hidden from the main screen by default and filtered by type.
import { $, onState, state } from '../client.js';
import { addTab, tab, onTab } from './tabs.js';

addTab('logs', '📜 Logs');
const root = () => $('#tabLogs');

// Filter groups: each one lists the log kinds it shows.
const GROUPS = {
  all: null,
  story: ['narrate', 'npc', 'say'],
  checks: ['check', 'roll'],
  combat: ['combat'],
  other: ['system', 'action', 'downtime', 'shop', 'notice'],
};
const NAMES = { all: 'All', story: 'Story', checks: 'Checks', combat: 'Combat', other: 'Other' };
let filter = 'all';

function render() {
  const S = state();
  if (!S || tab() !== 'logs') return;
  const kinds = GROUPS[filter];
  root().innerHTML = `
    <div class="chips" role="group" aria-label="Filter the log">${Object.keys(GROUPS).map((g) => `<button class="chip ${g === filter ? 'on' : ''}" data-log-filter="${g}" aria-pressed="${g === filter}">${NAMES[g]}</button>`).join('')}</div>
    <section class="feed log-full" aria-label="Table log"></section>`;
  // Story-style feed (public/chronicle.js): speech in portrait boxes, newest at the bottom.
  Chronicle.feed(root().querySelector('.feed'), S, { n: 40, kinds: kinds || Object.values(GROUPS).flat().filter(Boolean) });
}
onState(render);
onTab((id) => { if (id === 'logs') render(); });
root().addEventListener('click', (e) => {
  const b = e.target.closest('[data-log-filter]');
  if (!b) return;
  filter = b.dataset.logFilter;
  render();
});
