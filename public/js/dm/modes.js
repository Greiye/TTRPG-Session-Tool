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
const MODE_NAMES = { exploration: '🧭 Explore', combat: '⚔️ Combat', social: '💬 Social' };
const KIND_NAMES = { action: 'Actions', check: 'Checks', combat: 'Combat', downtime: 'Downtime', narrate: 'Narration', npc: 'NPC speech', say: 'Player speech', shop: 'Shops', system: 'System', notice: 'Notices' };
const SUB_NAMES = {
  scene: 'Scene', stage: 'Stage and music', sound: 'Soundscape', clocks: 'Clocks', moments: 'TV moments', puzzle: 'Puzzles',
  npc: 'NPCs', legends: 'Legends', lights: 'Smart lights', table: 'Table tools', quiz: 'Recap quiz', web: 'Relations web', journal: 'Notes and journal', camp: 'Camp and downtime', roads: 'Road cards', rules: 'Rules system', codm: 'Co-DM', data: 'Campaign data',
};
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

let tab = load('dmSideTab', 'rolls');
let subs = {};
try { subs = JSON.parse(load('dmSideSubs', '{}')) || {}; } catch { subs = {}; }
let planning = load('dmPlanning', '') === '1';
let mapPage = load('dmMapPage', '') === '1';
let mode = 'exploration';
let lastMode = null; // the mode the last state had: a change brings that mode's window to the top
let kindsKey = null;
let lastShown = '';
// The window that belongs to each pillar (Mike, Nov 18): Explore puts the Scene window on top, Combat the
// Battle Window. The tab opens, its button moves to the top of the tab list, and its first window unfolds.
const MODE_TAB = { exploration: ['scene', 'scene'], combat: ['combat', null] };

const inMode = (c) => !c.dataset.panel || c.dataset.panel.split(' ').includes(mode);
// Battle and Social Masters (src/roles.js) see only their cards, in every mode, so they can prep ahead.
// The Battle Master sees only the combat window, and only once the DM switches to combat (Mike, Nov 16).
// The Social Master's controls live in the Social window on the main page (public/js/dm/social.js), not the tools column.
// The Music Co-DM gets the Soundscape card only (Scene › Soundscape).
const MASTER_CARDS = { battle: (c) => c.dataset.tab === 'combat' && mode === 'combat', social: () => false, music: (c) => c.id === 'soundscape' };
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
  const top = MODE_TAB[mode]?.[0];
  $$('[data-stab]').forEach((b) => b.classList.toggle('mode-top', b.dataset.stab === top));
  $$('.tab-group').forEach((g) => g.classList.toggle('mode-top', !!g.querySelector('.mode-top')));
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
  // One window open at a time in the tools column (public/js/dm/fold.js), checked when the shown tab changes.
  const shownKey = `${tab}:${sub}:${mode}:${planning}`;
  if (shownKey !== lastShown) { lastShown = shownKey; window.dmCascade?.(); }
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
  // The live mode's button is pressed in (darker), not only gold text (Mike, Nov 16). The folded Modes card
  // names the live mode in its title.
  $$('[data-mode]').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === s.mode);
    b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode));
  });
  const now = $('#modeNow');
  if (now) now.textContent = MODE_NAMES[s.mode] || '';
  const changed = lastMode !== null && lastMode !== s.mode;
  lastMode = s.mode;
  const pick = MODE_TAB[s.mode];
  if (changed && pick && !masterRole()) {
    tab = pick[0];
    if (pick[1]) subs[tab] = pick[1];
    apply();
    window.dmCascade?.({ openFirst: true });
  } else apply();
  drawKinds(s);
});

$('#tvLogKinds')?.addEventListener('change', (e) => {
  const kind = e.target.dataset.showKind;
  if (!kind) return;
  const cur = new Set(state()?.settings?.display?.showLog || []);
  if (e.target.checked) cur.add(kind); else cur.delete(kind);
  emit('dm:settings', { display: { showLog: [...cur] } });
});

// Logs on this screen: the same switch as Display settings > Show logs, also in the Logs tab (Mike, Nov 16).
const logBox = $('#logShowHere');
const syncLog = () => { if (logBox) logBox.checked = window.Settings?.local().log === 'show'; };
logBox?.addEventListener('change', () => window.Settings?.setLocal('log', logBox.checked ? 'show' : 'hide'));
window.addEventListener('settings:local', syncLog);
syncLog();

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

// Entering social mode opens the Social window's NPC list (public/js/dm/social.js).
onClick('mode', (m) => emit('dm:mode', { mode: m }));
onClick('act', (act) => {
  if (act === 'testparty') emit('dm:testparty');
});
apply();
