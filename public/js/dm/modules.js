// Planning › Modules (Mike, Nov 26): switch whole features on or off for this table. Off hides the module on
// the DM page, the TV and phones, and the server refuses its events (src/features.js). Nothing is deleted:
// switching it back on brings everything back as it was. Everything is on until the DM says otherwise.
import { $, call, mount, onState, state } from '../client.js';

const PILLARS = [['explore', '🧭 Exploration'], ['combat', '⚔️ Combat'], ['social', '💬 Social'], ['table', '🎲 Table and story'], ['prep', '📝 Planning']];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The tab button, first in the Planning group.
const group = $('[data-group="plan"]');
if (group) {
  const b = document.createElement('button');
  b.setAttribute('role', 'tab');
  b.dataset.stab = 'modules';
  b.title = 'Modules: switch whole features on or off for this table';
  b.setAttribute('aria-label', 'Modules');
  b.innerHTML = '<i>🧩</i><span>Modules</span>';
  group.prepend(b);
}

const card = mount(`<div class="card mod-card" data-tab="modules" data-dm-only data-fold-key="modules" id="modCard">
  <h3>🧩 Modules <span class="note" id="modCount"></span></h3>
  <p class="note">Switch off what this table does not use. Off hides it on this page, the TV and phones. Nothing is deleted: switch it back on and it is all there.</p>
  <div class="row"><button class="btn small" id="modAllOn">All on</button><span class="note grow" id="modMsg" role="status"></span></div>
  <div id="modList"></div>
</div>`);

let shape = null;
// The rows are drawn once; later states only flip each switch, so the knob slides (CSS) instead of redrawing.
function build(list) {
  $('#modList').innerHTML = PILLARS.map(([p, label]) => {
    const rows = list.filter((f) => f.pillar === p);
    if (!rows.length) return '';
    return `<h4 class="mod-pillar">${label}</h4><ul class="mod-rows">${rows.map((f) => `<li class="mod-row" data-row="${f.id}">
        <button class="mod-sw" role="switch" aria-checked="true" data-mod="${f.id}" aria-label="${esc(f.name)}"><i></i></button>
        <span class="mod-txt"><b>${esc(f.name)}</b><small class="note">${esc(f.text)} <em class="mod-needs"></em></small></span>
      </li>`).join('')}</ul>`;
  }).join('');
}
function draw(s) {
  const list = s.featureList || [];
  const sh = list.map((f) => f.id).join();
  if (sh !== shape) { shape = sh; build(list); }
  const byId = Object.fromEntries(list.map((f) => [f.id, f]));
  for (const f of list) {
    const row = card.querySelector(`[data-row="${f.id}"]`);
    if (!row) continue;
    const sw = row.querySelector('.mod-sw');
    sw.classList.toggle('on', f.on);
    sw.setAttribute('aria-checked', String(f.on));
    sw.title = `${f.on ? 'Switch off' : 'Switch on'} ${f.name}`;
    row.classList.toggle('is-off', !f.live);
    const waits = f.on && !f.live ? f.needs.filter((n) => !byId[n]?.live).map((n) => byId[n]?.name || n) : [];
    row.querySelector('.mod-needs').textContent = waits.length ? `Needs ${waits.join(', ')}.` : '';
  }
  const off = list.filter((f) => !f.live).length;
  $('#modCount').textContent = off ? `${list.length - off} of ${list.length} on` : `all ${list.length} on`;
}

async function send(data) {
  const r = await call('dm:features:set', data);
  $('#modMsg').textContent = r?.error || (r?.skipped ? r.skipped.join(' ') : '');
  if (r?.error && state()) draw(state()); // refused: the switch goes back
}
card.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-mod]');
  if (sw) {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.classList.toggle('on', on); // answer the tap at once; the next state confirms it
    send({ id: sw.dataset.mod, on });
  }
  if (e.target.closest('#modAllOn')) send({ all: true, on: true });
});
onState(draw);
