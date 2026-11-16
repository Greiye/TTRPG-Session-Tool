// Phone Logs, a section of the Misc tab: the table's recent log, hidden from the main screen by default and filtered by type.
import { $, onState, state } from '../client.js';
import { addSection, tab, onTab } from './tabs.js';

addSection('misc', 'logs', '🗒 Logs');
const root = () => $('#tabLogs');

// Filter groups: each one lists the log kinds it shows.
const GROUPS = {
  all: null,
  story: ['narrate', 'npc', 'say'],
  checks: ['check', 'roll'],
  combat: ['combat'],
  other: ['system', 'action', 'downtime', 'shop', 'notice'],
  places: 'trail', // the party trail (src/trail.js), not log lines
};
const NAMES = { all: 'All', story: 'Story', checks: 'Checks', combat: 'Combat', other: 'Other', places: 'Places' };
let filter = 'all';

function render() {
  const S = state();
  if (!S || tab() !== 'logs') return;
  const kinds = GROUPS[filter];
  // The show/hide switch is here as well as in ⚙ Display settings › Show logs (Mike, Nov 16).
  const on = window.Settings?.local().log === 'show';
  const toggle = `<label class="chk log-toggle"><input type="checkbox" data-log-here ${on ? 'checked' : ''}> Show logs on this phone</label>
    <p class="note logs-off">Logs are off on this phone.</p>`;
  const chips = `${toggle}<div class="chips" role="group" aria-label="Filter the log">${Object.keys(GROUPS).map((g) => `<button class="chip ${g === filter ? 'on' : ''}" data-log-filter="${g}" aria-pressed="${g === filter}">${NAMES[g]}</button>`).join('')}</div>`;
  if (kinds === 'trail') { root().innerHTML = `${chips}<div class="card">${WorldMap.trail(S.trail, { max: 40 })}</div>`; return; }
  root().innerHTML = `${chips}<section class="feed log-full" aria-label="Table log"></section>`;
  // Story-style feed (public/chronicle.js): speech in portrait boxes, newest at the bottom.
  Chronicle.feed(root().querySelector('.feed'), S, { n: 40, kinds: kinds || Object.values(GROUPS).filter(Array.isArray).flat() });
}
onState(render);
onTab((id) => { if (id === 'logs') render(); });
window.addEventListener('settings:local', (e) => { if (e.detail?.name === 'log') render(); });
root().addEventListener('change', (e) => {
  if (e.target.matches('[data-log-here]')) window.Settings?.setLocal('log', e.target.checked ? 'show' : 'hide');
});
root().addEventListener('click', (e) => {
  const b = e.target.closest('[data-log-filter]');
  if (!b) return;
  filter = b.dataset.logFilter;
  render();
});
