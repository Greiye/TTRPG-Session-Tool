// Phones and the dungeon (Mike, Nov 16, PR R). At a dungeon entrance the phone gets a Dungeon tab and a window
// with the dungeon's name, what the party knows, and an Enter Dungeon button held for one second. The TV counts
// who is ready; once every player is ready the party goes in. Inside, the tab says which room the party is in; in an
// end room an Exit Dungeon window sends the party back to the world map. Rules: src/dungeon.js (gate, atEnd).
import { $, onState, call } from '../client.js';
import { me } from './identity.js';
import { current } from './nav.js';
import { addTab, setTabOn, setBadge } from './tabs.js';
import { holdButton } from '../dm/hold.js';

const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
addTab('dungeon', '🏰 Dungeon');
setTabOn('dungeon', false);

let pop = null; // the window: { kind: 'gate' | 'exit', key, el }
let tabKey = '';
let seenGate = null; // the gate id this phone already popped up for
let seenEnd = null; // the end room this phone already popped up for

const ready = (g) => !!me.charId && g.ready.includes(me.charId);

// Gate body: shared by the tab and the window.
function gateHtml(g) {
  const art = g.image ? `<img class="dgp-art" src="${esc(g.image)}" alt="">` : '<div class="dgp-art dgp-arch" aria-hidden="true">🏰</div>';
  const left = g.total - g.ready.length;
  return `${art}
    <h3>${esc(g.name)}</h3>
    ${g.info ? `<p class="dgp-info">${esc(g.info)}</p>` : ''}
    ${ready(g)
      ? `<p class="dgp-wait">✔ Ready. Waiting for ${left} more…</p><button class="btn small" data-dgp="unready">Not ready yet</button>`
      : '<button class="btn primary hold-btn dgp-hold"><i class="hold-fill"></i><span>Hold to enter the dungeon</span></button>'}
    <p class="note dgp-count">${g.ready.length} / ${g.total} ready</p>`;
}
const exitHtml = (S) => `<div class="dgp-art dgp-arch exit" aria-hidden="true">🌅</div>
  <h3>The way out</h3>
  <p class="dgp-info">The party has reached the end of ${esc(placeName(S))}.</p>
  <button class="btn primary dgp-exit" data-dgp="exit">⬆ Exit dungeon</button>`;
const placeName = (S) => S.worldMap?.nodes?.find((n) => n.id === S.worldMap.here)?.name || 'the dungeon';

// Inside: where the party is. The rooms themselves are on the TV (no dungeon board on phones, PR #69).
function insideHtml(S, d) {
  const room = d.nodes.find((n) => n.id === d.here);
  return `<div class="dgp inside">
    <div class="dgp-art dgp-arch" aria-hidden="true">${room ? Dungeon.ICON[room.kind] || '🏛' : '🏰'}</div>
    <h3>${esc(placeName(S))}</h3>
    <p class="dgp-info">${room ? `The party is in <b>${esc(room.name)}</b>.` : 'The party is inside.'} Follow the rooms on the TV.</p>
    ${d.atEnd ? '<button class="btn primary dgp-exit" data-dgp="exit">⬆ Exit dungeon</button>' : ''}
  </div>`;
}

// Wire the hold button and the other buttons inside a freshly drawn body.
function wire(root) {
  const h = root.querySelector('.dgp-hold');
  if (h) holdButton(h, { ms: 1000, idle: 'Hold to enter the dungeon', holding: 'Keep holding…', onFire: () => call('player:dungeon:ready', { on: true }) });
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dgp]');
  if (!b) return;
  if (b.dataset.dgp === 'unready') call('player:dungeon:ready', { on: false });
  if (b.dataset.dgp === 'exit') { b.disabled = true; const r = await call('player:dungeon:exit'); if (r?.error) b.disabled = false; }
  if (b.dataset.dgp === 'close') closePop();
});

// A finger is on the hold button: redrawing would drop the hold, so only the ready count is updated.
function holding(root, html) {
  if (!root.querySelector('.dgp-hold.holding')) return false;
  const count = html.match(/<p class="note dgp-count">([^<]*)<\/p>/)?.[1];
  const el = root.querySelector('.dgp-count');
  if (el && count) el.textContent = count.replace('&#39;', "'");
  return true;
}
function closePop() { pop?.el.remove(); pop = null; }
function showPop(kind, key, html) {
  if (pop?.kind === kind && pop.key === key) return;
  const fresh = pop?.kind !== kind;
  if (fresh) closePop();
  if (!pop) {
    const el = document.createElement('div');
    el.className = 'pop-scrim dgp-scrim';
    el.innerHTML = '<div class="pop-sheet dgp-sheet" role="dialog" aria-modal="true" aria-label="Dungeon"></div>';
    el.addEventListener('click', (e) => { if (e.target === el) closePop(); });
    document.body.appendChild(el);
    pop = { kind, key: '', el };
  }
  pop.key = key;
  const sheet = pop.el.firstElementChild;
  if (holding(sheet, html)) return;
  sheet.innerHTML = `${html}<button class="btn small dgp-later" data-dgp="close">Later</button>`;
  wire(sheet);
}

onState((S) => {
  const d = S?.dungeon;
  const g = d?.gate || null;
  const inside = !!(d?.on && d.nodes?.length);
  const seated = !!me.charId && S.players?.some((p) => p.id === me.charId);
  setTabOn('dungeon', !!(seated && (g || inside)));
  setBadge('dungeon', g && !ready(g) ? 1 : d?.atEnd ? 1 : 0);

  // The tab: the gate, or where the party is, with the way out when it is at the end.
  const tab = $('#tabDungeon');
  const key = JSON.stringify([g, inside && d.nodes.find((n) => n.id === d.here), d?.atEnd, me.charId, placeName(S)]);
  if (tab && key !== tabKey && !(g && holding(tab, gateHtml(g)))) {
    tabKey = key;
    tab.innerHTML = g ? `<div class="dgp">${gateHtml(g)}</div>`
      : inside ? insideHtml(S, d)
      : '';
    wire(tab);
  }

  // The windows: once per gate, and once per arrival in an end room. "Later" closes it; the tab keeps it.
  if (!seated || current() !== 'game') { closePop(); return; }
  if (g) {
    if (seenGate !== g.id || pop?.kind === 'gate') { seenGate = g.id; showPop('gate', JSON.stringify([g, me.charId]), `<div class="dgp">${gateHtml(g)}</div>`); }
  } else {
    if (!d?.on) seenGate = null;
    if (pop?.kind === 'gate') closePop();
  }
  if (d?.atEnd) {
    if (seenEnd !== d.here || pop?.kind === 'exit') { seenEnd = d.here; showPop('exit', d.here, `<div class="dgp">${exitHtml(S)}</div>`); }
  } else {
    seenEnd = null;
    if (pop?.kind === 'exit') closePop();
  }
});
