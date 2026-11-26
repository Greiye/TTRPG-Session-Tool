// Right-click menus on the DM screen (Mike, Nov 16): everything sensible gets a menu like the 3D battle map's
// unit menu. Specific menus come first (characters, creatures, world map places and roads, points of interest,
// NPCs, lore, log lines); anything else with buttons gets a menu listing those buttons. The menu itself is
// public/js/ctxmenu.js. Shift + right-click still opens the browser's menu.
import { $, emit, call, onState, state } from '../client.js';
import { contextMenus, refreshMenu } from '../ctxmenu.js';
import { condMenu } from './conds.js';

const CONDS = ['Prone', 'Poisoned', 'Frightened', 'Restrained', 'Grappled', 'Invisible', 'Stunned', 'Unconscious'];
const q = (sel) => document.querySelector(sel);
const attr = (name, v) => `[${name}="${CSS.escape(v)}"]`;
const clip = (t, n = 40) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});
const clickEl = (el) => { if (el && !el.disabled) { el.click(); return true; } return false; };
const off = (id) => !!window.Features?.off(state(), id); // Planning › Modules (src/features.js)
const toLore = async (cat, name, text = '') => {
  const r = await call('dm:lore:add', { cat, name, text });
  if (r?.error) alert(r.error);
};
// Fold a sidebar card open and bring it into view (used by "Edit" items that show an editor).
const reveal = (el) => { if (!el) return; const card = el.closest('.card[data-fold]'); if (card?.classList.contains('folded')) card.querySelector(':scope > h3')?.click(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };

// ---------- characters and creatures ----------

// The character or creature an element stands for, wherever it is drawn: party list, hero column, the TV
// preview's party bar and tokens, combat cards and the saved characters list.
function unitIdOf(el) {
  const d = el.dataset;
  if (d.heroPick) return d.heroPick;
  if (d.pid) return d.pid;
  if (d.tok) return d.tok;
  if (d.oid) return d.oid;
  return el.querySelector('[data-hero-edit]')?.dataset.heroEdit
    || el.querySelector('[data-hp]')?.dataset.hp
    || el.querySelector('[data-edit]')?.dataset.edit
    || null;
}

function unitMenu(id) {
  const s = state();
  if (!s) return null;
  const pc = s.players.find((p) => p.id === id);
  const foe = !pc && s.combat.enemies.find((e) => e.id === id);
  const x = pc || foe;
  if (!x) return null;
  const c = s.combat;
  const conds = x.conditions || [];
  const def = s.rules?.defenseLabel || 'AC';
  const turnId = c.active ? c.order[c.turn]?.id : null;
  const actor = c.enemies.find((e) => e.id === turnId);
  const canHit = actor && actor.id !== id && actor.hp > 0 && x.hp > 0 && c.acted?.[actor.id] !== c.round;
  const conc = (s.timers || []).find((t) => t.charId === id && t.kind === 'concentration');
  const tok = s.tokens?.[id];
  const sub = [`HP ${x.hp ?? 0}/${x.maxHp || x.hp || 0}`, `${def} ${x.ac ?? '?'}`, pc ? `✨ ${pc.inspiration || 0}` : (x.cr != null && x.cr !== '' ? `CR ${x.cr}` : ''), conds.length ? conds.join(', ') : ''].filter(Boolean).join(' · ');
  const pick = q(`.dm-hero ${attr('data-hero-pick', id)}`);
  return {
    title: x.name,
    sub,
    sections: [
      canHit && { h: `Attack with ${actor.name}`, items: (actor.attacks?.length ? actor.attacks : [{ name: 'Attack', atk: null }]).map((a, i) => ({ label: `⚔ ${a.name}${a.atk != null ? ` ${a.atk >= 0 ? '+' : ''}${a.atk}` : ''}`, run: () => emit('dm:enemy:attack', { target: id, attack: i }) })) },
      { h: 'Hit points', row: true, wrap: false, items: [-10, -5, -1, 1, 5, 10].map((d) => ({ label: `${d > 0 ? '+' : ''}${d}`, tone: d < 0 ? 'neg' : 'pos', keep: true, run: () => emit('dm:hp', { id, delta: d }) })) },
      { h: 'Conditions', row: true, items: CONDS.map((n) => ({ label: n, on: conds.includes(n), keep: true, run: () => emit('dm:condition', { id, name: n, on: !conds.includes(n) }) })) },
      pc && !off('inspiration') && { h: `Inspiration (${pc.inspiration || 0})`, row: true, wrap: false, items: [
        { label: '− Take one', tone: 'neg', keep: true, disabled: !pc.inspiration, run: () => emit('dm:inspiration', { id, delta: -1 }) },
        { label: '+ Give one', tone: 'pos', keep: true, run: () => emit('dm:inspiration', { id, delta: 1 }) },
      ] },
      { items: [
        pick && { label: '👤 Show in the hero column', run: () => pick.click() },
        pc && { label: '⭐ Spotlight on the TV', run: () => emit('dm:spotlight', { id }) },
        pc && pc.hitDice?.die && !off('camp') && { label: '🎲 Offer hit dice on their phone', run: () => emit('dm:hitdice:offer', { id }) },
        foe?.boss && (s.bossCard?.id === id ? { label: '👑 Hide boss card', run: () => emit('dm:boss:clear') } : { label: '👑 Show boss card', run: () => emit('dm:boss:card', { id }) }),
        tok && window.IsoDm?.battle && { label: '🎯 Centre the 3D map on it', run: () => window.IsoDm.battle.camera.focus(tok.x, tok.y) },
        conc && { label: `💫 Drop concentration (${conc.name})`, run: () => emit('dm:concentrate:drop', { id }) },
        pc && q(attr('data-edit', id)) && { label: '✎ Edit character', run: () => { const b = q(attr('data-edit', id)); b.click(); } },
        pc && q(attr('data-takeover', id)) && { label: '🎮 Play this character', run: () => clickEl(q(attr('data-takeover', id))) },
        pc && q(attr('data-drop', id)) && { label: '🎮 Give back to the player', run: () => clickEl(q(attr('data-drop', id))) },
        pc && { label: '✕ Remove from the table', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:kick', { id }) },
        foe && { label: '✕ Remove creature', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:enemy:remove', { id }) },
      ] },
    ],
    rebuild: () => unitMenu(id),
  };
}

// ---------- world map ----------

const wmState = () => state()?.worldMap;
const nodeOf = (id) => wmState()?.nodes.find((n) => n.id === id);

function nodeMenu(id) {
  const wm = wmState();
  const n = nodeOf(id);
  if (!n) return null;
  const here = wm.here === id && !wm.travel;
  const town = (state().living?.towns || []).find((t) => t.id === n.town);
  const nodeEl = () => q(`#wmBoard ${attr('data-node', id)}`);
  return {
    title: n.name,
    sub: [n.dungeon ? '🏰 dungeon entrance' : '📍 place', here ? 'the party is here' : '', town ? `town: ${town.name}` : '', n.revealed ? 'info shown to the table' : 'info hidden'].filter(Boolean).join(' · '),
    sections: [
      { items: [
        { label: '✎ Edit place', run: () => { clickEl(nodeEl()); setTimeout(() => reveal(q('#wmEdit')), 50); } },
        { label: '🚶 Send the party here now', disabled: here, run: () => emit('dm:worldmap:go', { node: id }) },
        { label: '🗳 Vote: here or stay', disabled: !!wm.vote?.open || here || !wm.here, title: 'Starts a party vote between this place and where they are', run: () => emit('dm:worldmap:vote:start', { candidates: [id, wm.here].filter(Boolean) }) },
        { label: '🛤 Draw a road from here', run: () => { if (!q('#wmRoad')?.classList.contains('on')) q('#wmRoad')?.click(); clickEl(nodeEl()); } },
      ] },
      { h: 'Show the table', items: [
        { label: '👁 Info revealed', on: !!n.revealed, keep: true, run: () => emit('dm:worldmap:reveal', { id, on: !n.revealed }) },
        wm.fog && { label: '☁ Out of the fog', on: !!n.seen, keep: true, run: () => emit('dm:worldmap:node', { id, seen: !n.seen }) },
        { label: '🏰 Dungeon entrance', on: !!n.dungeon, keep: true, run: () => emit('dm:worldmap:node', { id, dungeon: !n.dungeon }) },
      ] },
      { items: [
        !off('lore') && { label: '📚 Add to lore', run: () => toLore(n.dungeon ? 'dungeon' : 'location', n.name, n.info || '') },
        { label: '✕ Remove place', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:worldmap:node:remove', { id }) },
      ] },
    ],
    rebuild: () => nodeMenu(id),
  };
}

function roadMenu(id) {
  const wm = wmState();
  const r = wm?.roads?.find((x) => x.id === id);
  if (!r) return null;
  const a = nodeOf(r.a)?.name || '?'; const b = nodeOf(r.b)?.name || '?';
  return {
    title: `${a} ↔ ${b}`,
    sub: `Road · ${r.length} leg${r.length === 1 ? '' : 's'}${wm.fog ? (r.known ? ' · known' : ' · unknown') : ''}`,
    sections: [
      { h: 'Length', row: true, wrap: false, items: [
        { label: '− 1 leg', tone: 'neg', keep: true, disabled: r.length <= 1, run: () => emit('dm:worldmap:road', { id, length: r.length - 1 }) },
        { label: '+ 1 leg', tone: 'pos', keep: true, disabled: r.length >= 10, run: () => emit('dm:worldmap:road', { id, length: r.length + 1 }) },
      ] },
      wm.fog && { items: [{ label: '🗺 Known to the party', on: !!r.known, keep: true, run: () => emit('dm:worldmap:road', { id, known: !r.known }) }] },
      { items: [
        { label: `🚶 Send the party to ${a}`, run: () => emit('dm:worldmap:go', { node: r.a }) },
        { label: `🚶 Send the party to ${b}`, run: () => emit('dm:worldmap:go', { node: r.b }) },
        { label: '✕ Remove road', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:worldmap:road:remove', { id }) },
      ] },
    ],
    rebuild: () => roadMenu(id),
  };
}

// ---------- scene, social, lore, logs ----------

function poiMenu(poi) {
  const s = state();
  if (!s?.scene.poi.includes(poi)) return null;
  const open = (s.scene.revealed || []).includes(poi);
  return {
    title: poi,
    sub: `Point of interest · ${open ? 'shown on the TV' : 'hidden'}`,
    sections: [
      { items: [
        { label: open ? '☁ Hide from the TV' : '👁 Reveal on the TV', run: () => emit('dm:reveal', { poi, hide: open }) },
        { label: '🔎 Call for an Investigation check', title: 'Uses the DC in the Scene card', run: () => emit('dm:check', { skill: s.rules.skills.find((k) => /investigation/i.test(k)) || s.rules.skills[0], dc: q('#checkDc')?.value || 12 }) },
        !off('lore') && { label: '📚 Add to lore', run: () => toLore('location', poi) },
        { label: '✕ Remove from the scene', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:scene', { ...s.scene, poi: s.scene.poi.filter((p) => p !== poi) }) },
      ] },
    ],
    rebuild: () => poiMenu(poi),
  };
}

function castMenu(id) {
  const s = state();
  const c = (s?.social.cast || []).find((x) => x.id === id);
  if (!c) return null;
  const talking = s.social.npc.id === id;
  const EMO = window.Stage?.EMO || {};
  return {
    title: c.name,
    sub: `${c.kind === 'item' ? 'Item' : 'NPC'} on the scene${talking ? ' · talking now' : ''}`,
    sections: [
      { items: [{ label: talking ? '💬 Talking now' : '💬 Talk as this NPC', disabled: talking, run: () => emit('dm:cast:pick', { id }) }] },
      talking && c.kind !== 'item' && { h: 'Emotion', row: true, items: Object.entries(EMO).map(([k, e]) => ({ label: `${e.icon} ${e.label}`, on: s.social.npc.emotion === k, keep: true, run: () => emit('dm:emotion', { emotion: k }) })) },
      { items: [
        !off('lore') && { label: '📚 Add to lore', run: () => toLore(c.kind === 'item' ? 'item' : 'npc', c.name) },
        { label: '✕ Remove from the scene', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:cast:remove', { id }) },
      ] },
    ],
    rebuild: () => castMenu(id),
  };
}

const LORE_CATS = { location: 'Location', dungeon: 'Dungeon', npc: 'NPC', item: 'Item', book: 'Book', note: 'Note' };
function loreMenu(el) {
  const id = el.dataset.lore;
  const e = (state()?.lore || []).find((x) => x.id === id);
  if (!e) return null;
  return {
    title: e.name,
    sub: `${LORE_CATS[e.cat] || 'Lore'} · ${e.shared ? 'shared with phones' : 'DM only'}`,
    sections: [
      { items: [
        { label: el.open ? '▴ Close' : '▾ Open to edit', run: () => { el.open = !el.open; if (el.open) reveal(el); } },
        { label: '📱 Share with phones', on: !!e.shared, keep: true, run: () => emit('dm:lore:edit', { id, shared: !e.shared }) },
        e.text && { label: '📜 Read it out on the TV', title: 'Narrates what the party can learn', run: () => emit('dm:narrate', { text: e.text }) },
        { label: '📋 Copy text', run: () => copy([e.name, e.text, e.dm && `DM: ${e.dm}`].filter(Boolean).join('\n\n')) },
        { label: '✕ Delete entry', danger: true, arm: '✕ Click again to delete', run: () => emit('dm:lore:remove', { id }) },
      ] },
    ],
    rebuild: () => (el.isConnected ? loreMenu(el) : loreMenu(q(`details${attr('data-lore', id)}`) || el)),
  };
}

function lineMenu(el) {
  const text = el.querySelector('.dlg-box p')?.textContent.replace(/^“|”$/g, '') || el.textContent.trim();
  if (!text) return null;
  const who = el.querySelector('.dlg-name')?.textContent.trim() || el.querySelector('b')?.textContent.replace(/:$/, '').trim() || '';
  return {
    title: who || 'Log line',
    sub: clip(text, 60),
    sections: [
      { items: [
        { label: '📋 Copy', run: () => copy(who ? `${who}: ${text}` : text) },
        { label: '📜 Narrate it again on the TV', run: () => emit('dm:narrate', { text }) },
        { label: '📚 Save as a lore note', run: () => toLore('note', clip(text, 60), text) },
      ] },
    ],
  };
}

// ---------- anything else with buttons ----------

// The nearest container around the click that holds a handful of controls: its buttons and checkboxes become
// the menu, in the order they appear. Labels use the button's title when its face is only an icon.
const CTL = 'button, input[type=checkbox]';
const usable = (b) => !b.closest('.ctx-menu') && !b.classList.contains('hold-btn') && b.offsetParent !== null && b.getAttribute('role') !== 'tab';
function controlsIn(el) { return [...el.querySelectorAll(CTL)].filter(usable); }
function labelOf(b) {
  if (b.type === 'checkbox') return (b.closest('label')?.textContent || b.title || b.getAttribute('aria-label') || 'Toggle').trim();
  const face = b.textContent.replace(/\s+/g, ' ').trim();
  const tip = (b.title || b.getAttribute('aria-label') || '').trim();
  if (!face) return tip || 'Button';
  if (tip && face.length <= 3 && !/^[+−-]?\d+$/.test(face)) return `${face} ${tip}`;
  return face;
}
function genericMenu(target) {
  let el = target;
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.matches('#stage, .ctx-menu, dialog:not([open])')) return null;
    const n = controlsIn(el).length;
    if (n > 16) return null; // a whole card or page: too broad to be useful
    if (n) break;
    if (el.matches('.card, .dm-hero, header')) return null;
  }
  if (!el || el === document.body) return null;
  const ctls = controlsIn(el);
  const title = el.matches(CTL) ? '' : el.querySelector('b, strong, h3, h4, summary, .wm-text')?.textContent;
  const own = el.matches(CTL) ? [el] : ctls;
  return {
    title: clip(title || '', 48),
    sections: [{ items: own.map((b) => (b.type === 'checkbox'
      ? { label: labelOf(b), on: b.checked, disabled: b.disabled, run: () => b.click() }
      : { label: labelOf(b), disabled: b.disabled, danger: b.classList.contains('danger'), on: b.classList.contains('on') || undefined, run: () => b.click() })) }],
  };
}

contextMenus(document, [
  // Conditions on a portrait: the badge row and the hero portrait open the conditions menu (Mike, Nov 16).
  { sel: '.cond-badges', build: (el) => condMenu(el.dataset.condUnit) },
  { sel: '.dm-hero .hero-art', build: (el) => { const id = el.querySelector('.cond-badges')?.dataset.condUnit; return id ? condMenu(id) : null; } },
  { sel: '#wmBoard [data-node]', build: (el) => nodeMenu(el.dataset.node) },
  { sel: '#wmBoard [data-road]', build: (el) => roadMenu(el.dataset.road) },
  { sel: '[data-fog]', build: (el) => poiMenu(el.dataset.fog) },
  { sel: '.cast-chip', build: (el) => castMenu(el.querySelector('[data-cast-pick]')?.dataset.castPick) },
  { sel: '[data-cast-pick], [data-enter]', build: (el) => castMenu(el.dataset.castPick || el.dataset.enter) },
  { sel: '[data-hero-pick], .pc[data-pid], .tok[data-tok], [data-oid], .dm-hero .hero, #party .item, .char-row', build: (el) => { const id = unitIdOf(el); return id ? unitMenu(id) : null; } },
  { sel: 'details[data-lore]', build: loreMenu },
  { sel: '#feed .fe, #stage .narration li', build: lineMenu },
  { sel: '*', build: genericMenu },
]);

onState(() => refreshMenu());

export { unitMenu, nodeMenu, roadMenu, poiMenu, castMenu, genericMenu };
