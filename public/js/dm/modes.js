// Modes card: the live mode switch, Planning Mode, the world map page, the list of sidebar tabs, and the
// small part chips inside a tab (Scene and Miscellaneous). Session reset lives here too.
//
// Cards say where they live with data attributes:
//   data-tab="scene"     the tab that shows the card
//   data-sub="clocks"    the part of that tab (a chip row appears when a tab has parts)
//   data-panel="combat"  the live modes the card shows in (no attribute: every mode)
// Planning Mode (a DM-only view, saved on this laptop) shows the tab groups marked data-plan.
import { $, $$, emit, onState, onClick, state } from '../client.js';
import { masterRole } from './auth.js';

const KINDS = ['action', 'check', 'combat', 'downtime', 'narrate', 'npc', 'say', 'shop', 'system', 'notice'];
const KIND_NAMES = { action: 'Actions', check: 'Checks', combat: 'Combat', downtime: 'Downtime', narrate: 'Narration', npc: 'NPC speech', say: 'Player speech', shop: 'Shops', system: 'System', notice: 'Notices' };
const SUB_NAMES = {
  scene: 'Scene', stage: 'Stage and music', clocks: 'Clocks', moments: 'TV moments', puzzle: 'Puzzles',
  npc: 'NPCs', legends: 'Legends', lights: 'Smart lights', table: 'Table tools', quiz: 'Recap quiz', web: 'Relations web', journal: 'Notes and journal', camp: 'Camp and downtime', codm: 'Co-DM', data: 'Campaign data', roads: 'Road cards',
};
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

let tab = load('dmSideTab', 'rolls');
let subs = {};
try { subs = JSON.parse(load('dmSideSubs', '{}')) || {}; } catch { subs = {}; }
let planning = load('dmPlanning', '') === '1';
let mapPage = load('dmMapPage', '') === '1';
let mode = 'exploration';
let kindsKey = null;

const inMode = (c) => !c.dataset.panel || c.dataset.panel.split(' ').includes(mode);
// Battle and Social Masters (src/roles.js) see only their cards, in every mode, so they can prep ahead.
// The Battle Master sees only the combat window, and only once the DM switches to combat (Mike, Nov 16).
const MASTER_CARDS = { battle: (c) => c.dataset.tab === 'combat' && mode === 'combat', social: (c) => c.dataset.tab === 'misc' && c.dataset.sub === 'npc' };
// data-dm-only keeps a card from helpers even when it sits in their tab.
const fits = (c) => { const m = MASTER_CARDS[masterRole()]; return m ? m(c) && !c.hasAttribute('data-dm-only') : inMode(c); };
// A planning tab marked data-live (Shops) also shows during play.
const planTab = (id) => !!$(`[data-group][data-plan] [data-stab="${id}"]:not([data-live])`);

// A tab shows when a card under it fits this mode; planning tabs only in Planning Mode.
function visibleTabs() {
  const ok = new Set();
  $$('[data-tab]').forEach((c) => { if (fits(c) && (masterRole() || planning || !planTab(c.dataset.tab))) ok.add(c.dataset.tab); });
  return ok;
}

function apply() {
  if (masterRole()) { planning = false; mapPage = false; } // not saved: the laptop keeps the DM's choice
  const waiting = masterRole() === 'battle' && mode !== 'combat';
  document.body.classList.toggle('battle-waiting', waiting);
  $('#battleWait').hidden = !waiting;
  document.body.classList.toggle('planning', planning);
  document.body.classList.toggle('map-page', mapPage);
  $('#planToggle')?.classList.toggle('on', planning);
  $('#planToggle')?.setAttribute('aria-pressed', String(planning));
  $('#mapToggle')?.classList.toggle('on', mapPage);
  $('#mapToggle')?.setAttribute('aria-pressed', String(mapPage));
  $('#tablePage').hidden = mapPage;
  $('#wmPage').hidden = !mapPage;

  const vis = visibleTabs();
  if (!vis.has(tab)) tab = $$('[data-stab]').map((b) => b.dataset.stab).find((id) => vis.has(id)) || tab;
  $$('[data-stab]').forEach((b) => {
    const show = vis.has(b.dataset.stab);
    b.hidden = !show;
    b.classList.toggle('on', show && b.dataset.stab === tab);
    b.setAttribute('aria-selected', String(b.dataset.stab === tab));
  });
  $$('.tab-group').forEach((g) => { g.hidden = ![...g.querySelectorAll('[data-stab]')].some((b) => !b.hidden); });
  const title = $('#sideTitle');
  if (title) title.textContent = $(`[data-stab="${tab}"]`)?.title || '';

  // Parts of the open tab that have a card in this mode, in SUB_NAMES order.
  const parts = [];
  $$(`[data-tab="${tab}"][data-sub]`).forEach((c) => { if (fits(c) && !parts.includes(c.dataset.sub)) parts.push(c.dataset.sub); });
  const order = Object.keys(SUB_NAMES);
  parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  let sub = subs[tab];
  if (!parts.includes(sub)) sub = parts[0] || null;
  $('#subTabs').innerHTML = parts.length > 1 ? parts.map((p) => `<button role="tab" class="chip ${p === sub ? 'on' : ''}" aria-selected="${p === sub}" data-sub-pick="${p}">${SUB_NAMES[p] || p}</button>`).join('') : '';
  $('#subTabs').hidden = parts.length < 2;

  $$('[data-tab]').forEach((c) => {
    c.hidden = !(c.dataset.tab === tab && fits(c) && (!c.dataset.sub || c.dataset.sub === sub));
  });
  $$('[data-panel]:not([data-tab])').forEach((p) => { p.hidden = !p.dataset.panel.split(' ').includes(mode); });
}

function showTab(id) {
  tab = id;
  save('dmSideTab', id);
  apply();
}
// Other modules can open a tab (and a part of it): window.dmShowTab('scene', 'clocks').
window.dmShowTab = (id, sub) => { if (sub) { subs[id] = sub; save('dmSideSubs', JSON.stringify(subs)); } showTab(id); };

// TV log: one "Show ___ log" checkbox per log type, saved to the table setting (showLog). None by default.
function drawKinds(s) {
  const box = $('#tvLogKinds');
  if (!box) return;
  const shown = new Set(s.settings?.display?.showLog || []);
  const key = [...shown].sort().join();
  if (kindsKey === key) return;
  kindsKey = key;
  box.innerHTML = KINDS.map((k) => `<label class="chk"><input type="checkbox" data-show-kind="${k}" ${shown.has(k) ? 'checked' : ''}> Show ${KIND_NAMES[k].toLowerCase()} log</label>`).join('');
}

onState((s) => {
  mode = s.mode;
  $$('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
  apply();
  drawKinds(s);
});

$('#tvLogKinds')?.addEventListener('change', (e) => {
  const kind = e.target.dataset.showKind;
  if (!kind) return;
  const cur = new Set(state()?.settings?.display?.showLog || []);
  if (e.target.checked) cur.add(kind); else cur.delete(kind);
  emit('dm:settings', { display: { showLog: [...cur] } });
});

window.addEventListener('dm:role', () => { if (state()) apply(); });

$('#sideTabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-stab]');
  if (b) showTab(b.dataset.stab);
});
$('#subTabs')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sub-pick]');
  if (!b) return;
  subs[tab] = b.dataset.subPick;
  save('dmSideSubs', JSON.stringify(subs));
  apply();
});
$('#planToggle')?.addEventListener('click', () => {
  planning = !planning;
  save('dmPlanning', planning ? '1' : '');
  if (planning) tab = 'shops'; // open on the first planning tab (Road cards moved to Miscellaneous, Nov 15)
  apply();
});
$('#mapToggle')?.addEventListener('click', () => {
  mapPage = !mapPage;
  save('dmMapPage', mapPage ? '1' : '');
  apply();
  document.dispatchEvent(new CustomEvent('dm:page', { detail: { map: mapPage } }));
});

// Entering social mode with a cast on the scene asks who speaks first (the DM picks an NPC or item).
onClick('mode', (m) => {
  const s = state();
  $('#castPick').hidden = true;
  if (m === 'social' && s?.mode !== 'social' && s?.social?.cast?.length) { $('#castPick').hidden = false; return; }
  emit('dm:mode', { mode: m });
});
onClick('enter', (id) => {
  $('#castPick').hidden = true;
  emit('dm:mode', id === 'none' ? { mode: 'social' } : { mode: 'social', npcId: id });
});
onClick('act', (act) => {
  if (act === 'reset' && confirm('Reset log, remove enemies and heal the party?')) emit('dm:reset');
  if (act === 'testparty') emit('dm:testparty');
});
apply();
