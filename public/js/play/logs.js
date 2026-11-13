// Phone Logs tab: the table's recent log, hidden from the main screen by default and filtered by type.
import { $, onState, state } from '../client.js';
import { addTab, tab, onTab } from './tabs.js';

const { esc } = Stage;
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
  const items = (S.log || []).filter((l) => !kinds || kinds.includes(l.kind)).slice(-40).reverse();
  root().innerHTML = `
    <div class="chips" role="group" aria-label="Filter the log">${Object.keys(GROUPS).map((g) => `<button class="chip ${g === filter ? 'on' : ''}" data-log-filter="${g}" aria-pressed="${g === filter}">${NAMES[g]}</button>`).join('')}</div>
    <ul class="log log-full">${items.map((l) => `<li class="k-${esc(l.kind)} ${l.tone ? 't-' + esc(l.tone) : ''}">${l.who ? `<b>${esc(l.who)}:</b> ` : ''}${l.roll === 20 ? '<em class="nat">NAT 20</em> ' : l.roll === 1 ? '<em class="nat one">NAT 1</em> ' : ''}${esc(l.text)}</li>`).join('') || '<li class="note">Nothing logged yet.</li>'}</ul>`;
}
onState(render);
onTab((id) => { if (id === 'logs') render(); });
root().addEventListener('click', (e) => {
  const b = e.target.closest('[data-log-filter]');
  if (!b) return;
  filter = b.dataset.logFilter;
  render();
});
