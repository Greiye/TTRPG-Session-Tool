// Live mode switch, sidebar icon tabs, panel visibility, session reset.
import { $, $$, emit, onState, onClick, state } from '../client.js';

// Sidebar tabs: each card has data-tab. Cards with data-panel also follow the live mode.
const KINDS = ['action', 'check', 'combat', 'downtime', 'narrate', 'npc', 'say', 'shop', 'system', 'notice'];
const KIND_NAMES = { action: 'Actions', check: 'Checks', combat: 'Combat', downtime: 'Downtime', narrate: 'Narration', npc: 'NPC speech', say: 'Player speech', shop: 'Shops', system: 'System', notice: 'Notices' };
let tab = localStorage.getItem('dmSideTab') || 'rolls';
let mode = 'exploration';
let kindsKey = null;

function apply() {
  $$('[data-stab]').forEach((b) => { b.classList.toggle('on', b.dataset.stab === tab); b.setAttribute('aria-selected', String(b.dataset.stab === tab)); });
  const title = $('#sideTitle');
  if (title) title.textContent = $(`[data-stab="${tab}"]`)?.title || '';
  $$('[data-tab]').forEach((c) => {
    const panelOk = !c.dataset.panel || c.dataset.panel.split(' ').includes(mode);
    c.hidden = !(c.dataset.tab === tab && panelOk);
  });
  $$('[data-panel]:not([data-tab])').forEach((p) => { p.hidden = !p.dataset.panel.split(' ').includes(mode); });
}

function showTab(id) {
  tab = id;
  try { localStorage.setItem('dmSideTab', id); } catch { /* private mode */ }
  apply();
}

// TV log filter: one checkbox per log type, saved to the table setting (hideLog).
function drawKinds(s) {
  const box = $('#tvLogKinds');
  if (!box) return;
  const hidden = new Set(s.settings?.display?.hideLog || []);
  const key = [...hidden].sort().join();
  if (kindsKey === key) return;
  kindsKey = key;
  box.innerHTML = KINDS.map((k) => `<label class="chk"><input type="checkbox" data-hide-kind="${k}" ${hidden.has(k) ? 'checked' : ''}> ${KIND_NAMES[k]}</label>`).join('');
}

onState((s) => {
  mode = s.mode;
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  apply();
  drawKinds(s);
});

$('#tvLogKinds')?.addEventListener('change', (e) => {
  const kind = e.target.dataset.hideKind;
  if (!kind) return;
  const cur = new Set(state()?.settings?.display?.hideLog || []);
  if (e.target.checked) cur.add(kind); else cur.delete(kind);
  emit('dm:settings', { display: { hideLog: [...cur] } });
});

$('#sideTabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-stab]');
  if (b) showTab(b.dataset.stab);
});

onClick('mode', (m) => emit('dm:mode', { mode: m }));
onClick('act', (act) => { if (act === 'reset' && confirm('Reset log, remove enemies and heal the party?')) emit('dm:reset'); });
apply();
