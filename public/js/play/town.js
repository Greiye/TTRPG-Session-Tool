// Phones and towns (PR V). At a town on the world map the phone gets a Town tab and an Enter Town window held for
// one second, like the dungeon gate. Inside, the tab is the town window: the place the party is at (what is
// there), the town map, and the discovered places to go next. A player taps a place and holds the town action
// button; once every player has confirmed, the party goes and the day clock moves on by the place's time.
// Arriving somewhere pops the place's window. Rules: src/town.js.
import { $, onState, call } from '../client.js';
import { me } from './identity.js';
import { current } from './nav.js';
import { addTab, setTabOn, setBadge } from './tabs.js';
import { holdButton } from '../dm/hold.js';

const esc = (s) => Stage.esc(s);
const ICON = () => window.Town?.ICON || {};
addTab('town', '🏘 Town');
setTabOn('town', false);

let pop = null; // { kind: 'gate' | 'place', key, el }
let tabKey = '';
let choice = null; // the place this phone has tapped (before holding)
let seenGate = null;
let seenPlace = null; // the visit counter (town.n) this phone already showed the place window for
let last = null;

const ready = (g) => !!me.charId && g.ready.includes(me.charId);
function gateHtml(g) {
  const art = g.image ? `<img class="dgp-art" src="${esc(g.image)}" alt="">` : '<div class="dgp-art dgp-arch tn-gate-art" aria-hidden="true">🏘</div>';
  return `<div class="dgp">${art}
    <h3>${esc(g.name)}</h3>
    ${g.info ? `<p class="dgp-info">${esc(g.info)}</p>` : ''}
    ${ready(g)
      ? `<p class="dgp-wait">✔ Ready. Waiting for ${g.total - g.ready.length} more…</p><button class="btn small" data-tnp="unready">Not ready yet</button>`
      : '<button class="btn primary hold-btn tnp-enter"><i class="hold-fill"></i><span>Hold to enter town</span></button>'}
    <p class="note dgp-count">${g.ready.length} / ${g.total} ready</p></div>`;
}

const hereOf = (t) => t.nodes.find((n) => n.id === t.here);
const placeCard = (n) => `<div class="tnp-here"><i>${ICON()[n.kind] || '📍'}</i><div><b>${esc(n.name)}</b>${n.info ? `<p>${esc(n.info)}</p>` : ''}</div></div>`;

// The town window: where the party is, the map, and where to go next.
function townHtml(t) {
  const here = hereOf(t);
  const mine = t.mine;
  const pickId = mine?.node || choice;
  const opts = t.nodes.filter((n) => n.id !== t.here);
  const counts = t.tally?.counts || {};
  const list = opts.map((n) => `<button class="tnp-opt ${n.id === pickId ? 'on' : ''}" data-tnp-pick="${esc(n.id)}" ${mine?.at ? 'disabled' : ''}>
      <i>${ICON()[n.kind] || '📍'}</i><span><b>${esc(n.name)}</b><small>⏳ ${Town.segs(n.time)}${n.visited ? ' · visited' : ''}</small></span>${counts[n.id] ? `<span class="tnp-n">${counts[n.id]} going</span>` : ''}
    </button>`).join('');
  const target = t.nodes.find((n) => n.id === pickId);
  const left = t.tally ? t.tally.total - t.tally.confirmed : 0;
  const action = mine?.at
    ? `<p class="tnp-wait">✔ Going to ${esc(target?.name || '?')}. Waiting for ${left} more…</p><button class="btn small" data-tnp="change">Change my mind</button>`
    : target ? `<button class="btn primary hold-btn tnp-go"><i class="hold-fill"></i><span>Hold to go to ${esc(target.name)}</span></button>`
    : '<p class="note">Tap a place, then hold the button to go.</p>';
  return `<div class="tnp">
    <h3>🏘 ${esc(t.name || 'Town')}</h3>
    ${here ? placeCard(here) : ''}
    ${t.canLeave ? '<button class="btn small" data-tnp="leave">⬆ Leave town</button>' : ''}
    ${Town.board(t, { pick: pickId, key: 'phone' })}
    <h4>Where next?</h4>
    <div class="tnp-list">${list || '<p class="note">No other places found yet.</p>'}</div>
    ${opts.length ? action : ''}
    ${t.tally ? `<p class="note tnp-count">${t.tally.confirmed} / ${t.tally.total} confirmed</p>` : ''}
  </div>`;
}
const goName = (t) => t.nodes.find((n) => n.id === (t.mine?.node || choice))?.name || '';

function wire(root) {
  const g = root.querySelector('.tnp-enter');
  if (g) holdButton(g, { ms: 1000, idle: 'Hold to enter town', holding: 'Keep holding…', onFire: () => call('player:town:ready', { on: true }) });
  const b = root.querySelector('.tnp-go');
  if (b && last?.town) {
    const name = goName(last.town);
    holdButton(b, { ms: 1000, idle: `Hold to go to ${name}`, holding: 'Keep holding…', onFire: () => call('player:town:pick', { node: last.town.mine?.node || choice, confirm: true }) });
  }
  if (root.querySelector('.tn-board')) window.Town?.hydrate(root, { key: root.closest('.pop-sheet') ? 'phone-pop' : 'phone' });
}
// A finger is on a hold button: redrawing would drop the hold.
const holding = (root) => !!root?.querySelector('.hold-btn.holding');

document.addEventListener('click', async (e) => {
  const p = e.target.closest('[data-tnp-pick]');
  if (p && !p.disabled) {
    choice = p.dataset.tnpPick;
    call('player:town:pick', { node: choice, confirm: false });
    if (last) render(last, true);
    return;
  }
  const b = e.target.closest('[data-tnp]');
  if (!b) return;
  const k = b.dataset.tnp;
  if (k === 'unready') call('player:town:ready', { on: false });
  if (k === 'change') { call('player:town:pick', { node: last?.town?.mine?.node, confirm: false }); }
  if (k === 'leave') { b.disabled = true; const r = await call('player:town:leave'); if (r?.error) b.disabled = false; }
  if (k === 'close') closePop();
});

function closePop() { pop?.el.remove(); pop = null; }
function showPop(kind, key, html) {
  if (pop?.kind === kind && pop.key === key) return;
  if (pop && pop.kind !== kind) closePop();
  if (!pop) {
    const el = document.createElement('div');
    el.className = 'pop-scrim dgp-scrim';
    el.innerHTML = '<div class="pop-sheet dgp-sheet" role="dialog" aria-modal="true" aria-label="Town"></div>';
    el.addEventListener('click', (e) => { if (e.target === el) closePop(); });
    document.body.appendChild(el);
    pop = { kind, key: '', el };
  }
  const sheet = pop.el.firstElementChild;
  if (holding(sheet)) return;
  pop.key = key;
  sheet.innerHTML = `${html}<button class="btn small dgp-later" data-tnp="close">${kind === 'place' ? 'OK' : 'Later'}</button>`;
  wire(sheet);
}

function render(S, force = false) {
  const t = S?.town;
  const g = t?.gate || null;
  const inside = !!t?.on;
  const seated = !!me.charId && S.players?.some((p) => p.id === me.charId);
  if (seenPlace === null) seenPlace = t?.n ?? 0; // a phone that just loaded does not replay the last arrival
  setTabOn('town', !!(seated && (g || inside)));
  setBadge('town', g && !ready(g) ? 1 : inside && !t.mine?.at ? 1 : 0);
  if (!inside) choice = null;
  if (inside && t.mine?.node) choice = t.mine.node;
  if (inside && choice && (choice === t.here || !t.nodes.some((n) => n.id === choice))) choice = null;

  const tab = $('#tabTown');
  const key = JSON.stringify([g, inside && t, choice, me.charId]);
  if (tab && (force || key !== tabKey) && !holding(tab)) {
    tabKey = key;
    tab.innerHTML = g ? gateHtml(g) : inside ? townHtml(t) : '';
    wire(tab);
  }

  // Windows: the gate once per town, and the place window each time the party arrives somewhere.
  if (!seated || current() !== 'game') { closePop(); return; }
  if (g) {
    if (seenGate !== g.id || pop?.kind === 'gate') { seenGate = g.id; showPop('gate', JSON.stringify([g, me.charId]), gateHtml(g)); }
  } else {
    if (!inside) seenGate = null;
    if (pop?.kind === 'gate') closePop();
  }
  if (inside && seenPlace !== t.n) {
    seenPlace = t.n;
    const here = hereOf(t);
    if (here) showPop('place', String(t.n), `<div class="tnp">${placeCard(here)}<p class="note">Open the 🏘 Town tab to choose where to go next.</p></div>`);
  }
  if (!inside && pop?.kind === 'place') closePop();
}
onState((S) => { last = S; render(S); });
