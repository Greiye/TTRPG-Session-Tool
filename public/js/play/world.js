// Phone World tab (living world, src/living.js): the weather, tension and sight the party has, town
// standing by tier, public clocks, approved canon, and a form to propose a detail, NPC or rumour. The DM
// approves every proposal before it reaches the table.
import { socket, $, onState, state } from '../client.js';
import { me } from './identity.js';
import { addTab, onTab } from './tabs.js';

const { esc } = Stage;
const KIND = { detail: '🔍 Detail', npc: '🧑 NPC', rumour: '🗣 Rumour' };
addTab('world', '🌍 World');
const root = () => $('#tabWorld');
let draft = '';
let kind = 'detail';

function render() {
  const S = state();
  if (!S || !S.players.some((p) => p.id === me.charId)) return;
  const L = S.living || {};
  const towns = (L.towns || []).map((t) => `<div class="item"><span>${esc(t.name)}</span><small class="muted">${esc(t.label)} · ${t.trade === 'open' ? 'traders serve you' : 'traders hold back'}</small></div>`).join('');
  const clocks = (L.clocks || []).map((c) => `<div class="item"><span>${esc(c.name)}</span><small class="muted">${c.filled}/${c.segments}</small></div>`).join('');
  const canon = (L.canon || []).map((c) => `<div class="item journal-entry"><p><small class="muted">${esc(KIND[c.kind] || KIND.detail)}${c.status === 'proposed' ? ' · waiting for the DM' : ''}${c.by ? ` · ${esc(c.by)}` : ''}</small><br>${esc(c.text)}</p></div>`).join('');
  const d = L.derived || {};
  root().innerHTML = `<div class="card"><h3>🌍 The world</h3>
      <p class="note">Weather ${esc(L.weather || 'clear')} · sight ${esc(d.sight || 'clear')} · tension ${esc(L.tension?.label || 'Calm')}</p>
      ${towns ? `<div class="list">${towns}</div>` : ''}
      ${clocks ? `<h4>Clocks</h4><div class="list">${clocks}</div>` : ''}
    </div>
    <div class="card"><h3>Propose canon</h3>
      <p class="note">Add a detail, an NPC or a rumour. The DM decides whether it is true in this world.</p>
      <div class="row">
        <select id="canonKind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input id="canonText" class="grow" maxlength="280" placeholder="e.g. The mill wheel is turned by a bound spirit" value="${esc(draft)}">
        <button class="btn primary" id="canonAdd">Propose</button>
      </div></div>
    <div class="list">${canon || '<p class="note" style="text-align:center">No canon yet.</p>'}</div>`;
}
onState(render);
onTab((id) => { if (id === 'world') render(); });

root().addEventListener('input', (e) => { if (e.target.id === 'canonText') draft = e.target.value; });
root().addEventListener('change', (e) => { if (e.target.id === 'canonKind') kind = e.target.value; });
root().addEventListener('click', (e) => {
  if (!e.target.closest('#canonAdd')) return;
  const text = $('#canonText')?.value.trim();
  if (!text) return;
  socket.emit('player:living:canon', { text, kind }, (r) => { if (r?.ok) { draft = ''; render(); } });
  navigator.vibrate?.(20);
});
