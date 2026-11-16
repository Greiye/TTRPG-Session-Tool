// Chronicle layout on the DM page: the pill bar over the stage, the story feed, the hero column
// (the sidebar tab list has its own labels, see modes.js). Pieces are drawn by public/chronicle.js.
import { $, onState, state } from '../client.js';
import { lookOf } from '../iso3d.js';
import { badges } from './conds.js';

let pick = null; // character id shown in the hero column
let sel = null; // unit the DM clicked on the 3D battle map: the hero column shows its stats (Mike, Nov 16)
let selShown = null; // last unit drawn, so a new selection animates in
// The hero opens on Bio (Mike, Nov 16). Stats is one tap away and stays picked until the page reloads.
let view = 'bio';


const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
const speedOf = (c) => ((c.speed?.fly || 0) > 0 && c.flying !== false ? c.speed.fly : (c.speed?.walk ?? (typeof c.speed === 'number' ? c.speed : 30)));

// Combat facts for whoever is selected on the map: movement left (red past its speed), initiative, tile, light, conditions.
function combatFacts(x, S) {
  const c = S.combat;
  const left = speedOf(x) - (c.moved?.[x.id] || 0);
  const init = c.order.find((o) => o.id === x.id)?.init;
  const t = S.tokens?.[x.id];
  const turn = c.active && c.order[c.turn]?.id === x.id;
  const rows = [
    ['Movement', `<b class="${left < 0 ? 'over' : ''}">${left < 0 ? `${-left} ft over` : `${left} ft left`}</b>`, `<small>${speedOf(x)} ft</small>`],
    ['Initiative', `<b>${init ?? '—'}</b>`, `<small>${turn ? 'now' : ''}</small>`],
    t ? ['Tile', `<b>${t.x + 1}, ${t.y + 1}</b>`, `<small>${S.map?.elev?.[`${t.x},${t.y}`] ? `h${S.map.elev[`${t.x},${t.y}`]}` : ''}</small>`] : null,
    t?.light && t.light !== 'none' ? ['Light', `<b>${esc(t.light)}</b>`, '<small></small>'] : null,
  ].filter(Boolean);
  const conds = (x.conditions || []).map((n) => `<span class="sel-cond">${esc(n)}</span>`).join('');
  return `<ul class="stat-list sel-facts">${rows.map(([k, v, n]) => `<li><span>${k}</span>${v}${n}</li>`).join('')}</ul>${conds ? `<div class="sel-conds">${conds}</div>` : ''}`;
}

// A creature selected on the map: portrait, HP, AC, movement, attacks, traits.
function creaturePanel(x, S) {
  let src = '';
  try { src = window.IsoDm?.battle?.portraitOf(lookOf(x, false)) || ''; } catch { /* map not loaded */ }
  const pct = x.maxHp ? x.hp / x.maxHp : 1;
  const tone = pct > 0.5 ? 'life' : pct > 0.2 ? 'life warn' : 'life crit';
  const fill = Math.max(0, Math.min(100, Math.round(100 * pct)));
  const side = { enemy: 'Enemy', ally: 'Ally', neutral: 'Neutral' }[x.side] || 'Enemy';
  const acted = S.combat.active && S.combat.acted?.[x.id] === S.combat.round;
  const atks = (x.attacks || []).map((a) => `<li><span>${esc(a.name)}</span><b>${a.atk >= 0 ? '+' : ''}${a.atk}</b><small>${esc(a.dmg)}</small></li>`).join('');
  const traits = (x.traits || []).map((t) => `<p><b>${esc(t.name)}.</b> ${esc(t.text)}</p>`).join('');
  return `<div class="hero sel-foe" style="--acc:${/^#[0-9a-f]{6}$/i.test(x.accent || '') ? x.accent : '#c0392b'}">
    <div class="hero-art">${src ? `<img src="${src}" alt="" class="sel-sprite">` : '<span class="sel-sprite">👹</span>'}</div>
    <div class="hero-head"><h2>${esc(x.name)}</h2>${x.boss ? '<span title="Boss">👑</span>' : ''}</div>
    <small class="hero-sub">${side}${x.cr != null && x.cr !== '' ? ` · CR ${esc(x.cr)}` : ''}${acted ? ' · <em>acted this round</em>' : ''}</small>
    <div class="hero-bars">
      <div class="hbar ${tone}"><i>❤</i><small>HP</small><span class="hb-track"><span class="hb-fill" style="width:${fill}%"></span></span><b>${x.hp}/${x.maxHp}</b></div>
    </div>
    <div class="hero-body">
      <ul class="stat-list"><li><span>${esc(S.rules?.defenseLabel || 'AC')}</span><b>${x.ac ?? '—'}</b><small></small></li></ul>
      ${combatFacts(x, S)}
      ${atks ? `<h4 class="sel-h">Attacks</h4><ul class="stat-list">${atks}</ul>` : ''}
      ${traits ? `<h4 class="sel-h">Traits</h4><div class="sel-traits">${traits}</div>` : ''}
    </div>
  </div>`;
}

function selHead(name) {
  return `<div class="sel-bar"><span>🎯 Selected on the map${name ? `: <b>${esc(name)}</b>` : ''}</span><button class="icon-btn" data-sel-clear title="Back to the party" aria-label="Back to the party">✕</button></div>`;
}

function renderHero(S) {
  const party = S.players || [];
  const onMap = S.mode === 'combat' && S.map && sel && S.tokens?.[sel];
  const foe = onMap && S.combat.enemies.find((e) => e.id === sel);
  if (onMap && party.some((p) => p.id === sel)) pick = sel;
  if (!onMap) sel = null;
  if (foe) {
    $('#heroPick').innerHTML = '';
    $('#hero').innerHTML = selHead() + creaturePanel(foe, S);
    $('#hero .hero-art')?.insertAdjacentHTML('beforeend', badges(foe, S));
  } else {
    if (!party.some((p) => p.id === pick)) pick = party[0]?.id || null;
    const pc = sel ? party.find((p) => p.id === sel) : null;
    $('#heroPick').innerHTML = party.length > 1 ? party.map((p) => `<button role="tab" class="${p.id === pick ? 'on' : ''}" aria-selected="${p.id === pick}" data-hero-pick="${p.id}" title="${Stage.esc(p.name)}" style="--hue:${p.hue ?? 40}">${Stage.avatar(p, 'av-pick')}${p.conditions?.length ? `<i class="pick-cond" title="${Stage.esc(p.conditions.join(', '))}">${p.conditions.length}</i>` : ''}</button>`).join('') : '';
    const shown = party.find((p) => p.id === pick);
    $('#hero').innerHTML = (pc ? selHead(pc.name) + combatFacts(pc, S) : '') + Chronicle.hero(shown, S, { view });
    $('#hero .hero-art')?.insertAdjacentHTML('beforeend', badges(shown, S));
  }
  // A new selection slides in.
  const now = sel || null;
  if (now !== selShown && now) { const h = $('#hero'); h.classList.remove('sel-in'); void h.offsetWidth; h.classList.add('sel-in'); }
  selShown = now;
  Anim.hydrate($('#heroPick'));
  Anim.hydrate($('#hero'));
}

onState((S) => {
  Chronicle.feed($('#feed'), S);
  renderHero(S);
});

document.querySelector('.dm-hero').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-sel-clear')) { sel = null; window.IsoDm?.battle?.select(null); }
  else if (b.dataset.heroPick) { pick = b.dataset.heroPick; sel = null; }
  else if (b.dataset.heroView) view = b.dataset.heroView;
  else if (b.dataset.heroEdit) { document.querySelector(`[data-edit="${CSS.escape(b.dataset.heroEdit)}"]`)?.click(); return; }
  else return;
  renderHero(state());
});

// The DM clicked a unit on the 3D battle map (public/js/iso3d.js onSelect): show its stats here.
window.addEventListener('iso:select', (e) => {
  sel = e.detail || null;
  const S = state();
  if (S) renderHero(S);
  if (sel && document.body.classList.contains('hero-hidden')) document.getElementById('heroGrip')?.click(); // bring the column back
});
