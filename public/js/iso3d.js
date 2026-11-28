// 3D isometric battle map (replaces the flat image grid). Shared by the DM page, the TV and phones.
// The server stays the authority: this file turns the table state into the iso view's units and tiles,
// and turns clicks in the view into the socket events the tool already has (player:move, dm:token:move, ...).
// The view itself is lib/iso-battle, built to /iso/iso-battle.js (npm run build:iso).
import { mountBattle, diffView } from '/iso/iso-battle.js';
import { actionIcon, actionDetail } from './actions.js';
import * as Ctx from './ctxmenu.js';

const STEP_FT = 5;
const COVER = { rock: 2, crate: 2, tree: 5, wall: 5, pillar: 5, barrel: 2, chest: 2 }; // same as src/iso.js
const GROUNDS = ['grass', 'dirt', 'stone', 'sand', 'water', 'snow', 'floor', 'flagstone', 'cobble', 'moss'];
const OBSTACLES = { // same as src/iso.js
  wall: { height: 2.5, blocksMove: true, cover: true }, tree: { height: 2.5, blocksMove: true, cover: true },
  rock: { height: 1, blocksMove: true, cover: true }, crate: { height: 1, blocksMove: true, cover: true },
  door: { height: 2.5, blocksMove: false, cover: false }, pillar: { height: 2.5, blocksMove: true, cover: true },
  barrel: { height: 1, blocksMove: true, cover: true }, chest: { height: 0.8, blocksMove: true, cover: true },
};
// Light on the map (Mike, Nov 22): the DM's override, else the story clock; a dungeon is always dark.
export function lightOf(s) {
  const m = s.map || {};
  if (m.daylight && m.daylight !== 'auto') return m.daylight;
  if (m.theme === 'dungeon') return 'dark';
  return s.story?.light || 'day';
}

// Sprite looks. Each unit picks one by class or creature name; a character's colour tints the clothes.
const KINDS = {
  hero: { name: 'Hero', palette: { skin: '#e0ac7e', cloth: '#3f6fb5', trim: '#c9c9d6', hair: '#5a3a1e', weapon: 'sword' } },
  archer: { name: 'Archer', palette: { skin: '#c98e62', cloth: '#3d7a3a', trim: '#7a5a32', hair: '#2b1d12', weapon: 'bow' } },
  caster: { name: 'Caster', palette: { skin: '#f0c8a0', cloth: '#7b3fa8', trim: '#e8c64a', hair: '#d8d8d8', weapon: 'staff' } },
  rogue: { name: 'Rogue', palette: { skin: '#d9a47a', cloth: '#3a3a48', trim: '#8a2a2a', hair: '#1a1410', weapon: 'dagger' } },
  goblin: { name: 'Goblin', palette: { skin: '#7fae3e', cloth: '#7a4b2a', trim: '#4a3020', hair: '#2a3a14', weapon: 'dagger' } },
  skeleton: { name: 'Skeleton', palette: { skin: '#e8e4d0', cloth: '#5a5a66', trim: '#8a2a2a', hair: '#e8e4d0', weapon: 'sword', body: 'skeleton' } },
  brute: { name: 'Brute', palette: { skin: '#b08a5a', cloth: '#6a4a2a', trim: '#3a2a1a', hair: '#3a2a1a', weapon: 'club', scale: 1.6 } },
  slime: { name: 'Ooze', palette: { skin: '#4ac0c0', cloth: '#2a8a9a', trim: '#ffffff', hair: '#2a8a9a', body: 'slime' } },
  bandit: { name: 'Bandit', palette: { skin: '#c99a72', cloth: '#6a3a2a', trim: '#2a2a2a', hair: '#3a2614', weapon: 'sword' } },
};
const CLASS_KIND = [[/wizard|sorcer|warlock|cleric|druid|bard|mage|priest/i, 'caster'], [/ranger|archer|hunter/i, 'archer'], [/rogue|thief|assassin/i, 'rogue']];
const FOE_KIND = [[/skelet|zombie|undead|ghoul|wight|lich/i, 'skeleton'], [/ooze|slime|jelly|pudding/i, 'slime'], [/ogre|troll|giant|bear|owlbear|brute/i, 'brute'], [/goblin|kobold|hobgob|orc|gnoll/i, 'goblin'], [/archer|scout/i, 'archer'], [/mage|cultist|priest|shaman|witch/i, 'caster'], [/bandit|guard|thug|knight|soldier|veteran/i, 'bandit']];
const kindOf = (c) => {
  const list = c.enemy || c.side ? FOE_KIND : CLASS_KIND;
  const text = c.enemy || c.side ? `${c.name} ${c.ref || ''} ${c.kind || ''}` : c.cls || '';
  return (list.find(([re]) => re.test(text)) || [null, c.enemy || c.side ? 'goblin' : 'hero'])[1];
};
function hueHex(h, s = 0.45, l = 0.42) {
  const f = (n) => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// A character's colour tints the clothes; a creature's accessory colour (set by the creature randomizer) tints its trim.
const ACCENTS = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d35400'];
function paletteOf(x, pc) {
  if (pc) return x.hue != null ? { cloth: hueHex(x.hue) } : undefined;
  return { trim: /^#[0-9a-f]{6}$/i.test(x.accent || '') ? x.accent : ACCENTS[[...String(x.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ACCENTS.length] };
}
export const lookOf = (x, pc) => ({ kind: kindOf(x), palette: paletteOf(x, pc) });

const key = (x, y) => `${x},${y}`;
const speedOf = (c) => {
  const fly = c.speed?.fly || 0;
  return fly > 0 && c.flying !== false ? fly : (c.speed?.walk ?? (typeof c.speed === 'number' ? c.speed : 30));
};

function tilesOf(m) {
  const tiles = [];
  for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
    const k = key(x, y);
    const t = m.terrain?.[k];
    tiles.push({ h: m.elev?.[k] || 0, type: t === 'difficult' ? 'difficult' : m.ground?.[k] || 'grass', obstacle: t === 'wall' ? 'wall' : m.props?.[k] || null });
  }
  return tiles;
}

// Rules the iso view needs: tile costs and heights (as in src/iso.js), sprite looks, and one ability per attack.
function rulesOf(s) {
  const abilities = { attack: { name: 'Attack', ap: 0, range: 99, accuracy: 0, damage: '', needsLOS: true, icon: '⚔️', detail: '<b>Attack</b><br>Pick a target, then roll.' } };
  const def = s.rules?.defenseLabel || 'AC ';
  for (const e of s.combat.enemies) (e.attacks || []).forEach((a, i) => { abilities[`${e.id}:${i}`] = { name: a.name || `Attack ${i + 1}`, ap: 0, range: 99, accuracy: 0, damage: '', needsLOS: true, icon: actionIcon(a), detail: actionDetail(a, def) }; });
  return {
    heightStep: 0.5, visionHeight: 1.2, abilities,
    grid: { maxClimb: 2, maxDrop: 3, climbCostPerStep: 1 },
    obstacles: OBSTACLES,
    terrain: Object.fromEntries([...GROUNDS.map((g) => [g, { moveCost: g === 'water' ? 2 : 1 }]), ['difficult', { moveCost: 2 }]]),
    combat: { coverPenalty: 0, heightBonusPerStep: 0, maxHeightBonus: 0, minHit: 0, maxHit: 100 },
    units: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { ...v, team: 'monsters', hp: 1, ap: 6, init: 0, defense: 10, sight: 8, abilities: [] }])),
  };
}

// The table state as the iso view's { meta, tiles, units, visible, log }.
function viewOf(s, you) {
  const m = s.map;
  const c = s.combat;
  const all = [...s.players, ...c.enemies];
  const byId = Object.fromEntries(all.map((x) => [x.id, x]));
  const turnId = c.active ? c.order[c.turn]?.id : null;
  const units = {};
  for (const [id, t] of Object.entries(s.tokens || {})) {
    const x = byId[id];
    if (!x || t.x >= m.cols || t.y >= m.rows) continue;
    const pc = !!s.players.find((p) => p.id === id);
    const speedTiles = Math.floor(speedOf(x) / STEP_FT);
    // Movement left in tiles. Negative when the DM moved it past its speed (the Move button turns red).
    const left = Math.floor((speedOf(x) - (c.moved?.[id] || 0)) / STEP_FT);
    const kind = kindOf(x);
    units[id] = {
      id, kind, name: x.name, x: t.x, y: t.y, z: t.z || 0, facing: t.facing ?? (pc ? 0 : 4),
      team: pc || x.side === 'ally' ? 'players' : x.side === 'neutral' ? 'neutral' : 'monsters',
      owner: pc ? id : null, hp: x.hp ?? 0, maxHp: x.maxHp || x.hp || 1, dead: (x.hp ?? 1) <= 0,
      ap: c.active ? left : speedTiles, maxAp: speedTiles, defense: x.ac,
      abilities: pc ? ['attack'] : (x.attacks?.length ? x.attacks.map((_, i) => `${id}:${i}`) : ['attack']),
      palette: paletteOf(x, pc),
    };
  }
  const order = c.order.map((o) => o.id);
  const visible = s.mapVision ? s.mapVision.map((k) => { const [x, y] = k.split(',').map(Number); return y * m.cols + x; }) : null;
  return {
    meta: { w: m.cols, h: m.rows, round: c.round || 1, turn: Math.max(0, order.indexOf(turnId)), initiative: order, fog: !!m.fog, seed: m.seed || 0, active: turnId && units[turnId] ? turnId : null, players: [], freeMove: !c.active, theme: m.theme === 'dungeon' ? 'dungeon' : 'outdoor', light: lightOf(s) },
    tiles: tilesOf(m), units, visible, revealed: [],
    log: (s.log || []).filter((l) => l.kind === 'combat').slice(-30).map((l) => ({ seq: l.id, msg: l.text })),
    you,
  };
}

// A transport for mountBattle that reads the table state and writes socket events.
class TableTransport {
  constructor({ role, charId, socket, emit }) { this.role = role; this.charId = charId; this.socket = socket; this.emitDm = emit; this.status = ''; }
  connect(onMsg) { this.onMsg = onMsg; if (this.pending) this.push(this.pending); }
  get you() { return this.role === 'dm' ? { name: 'dm', isDM: true } : { name: this.charId || this.role, isDM: false }; }
  push(s) {
    if (!this.onMsg) { this.pending = s; return; }
    const next = viewOf(s, this.you);
    const rules = rulesOf(s);
    const rkey = JSON.stringify(rules.abilities);
    const events = [];
    const lm = s.combat.lastMove;
    if (this.view && lm && lm.n !== this.moveN && next.units[lm.id]) events.push({ type: 'move', unitId: lm.id, path: lm.path });
    this.moveN = lm?.n;
    if (this.view) for (const u of Object.values(next.units)) {
      const was = this.view.units[u.id];
      if (!was || was.hp === u.hp) continue;
      // Numbers are the DM's unless the table shares them (Mike, Nov 17): other screens float the health word.
      const label = this.role !== 'dm' && Stage.numbersHidden(s) ? Stage.hpWord(u.hp, u.maxHp) : undefined;
      events.push({ type: 'attack', unitId: next.meta.active !== u.id ? next.meta.active : null, targetId: u.id, hit: true, amount: was.hp - u.hp, ...(label !== undefined ? { label } : {}) });
    }
    if (!this.view || rkey !== this.rulesKey) {
      this.rulesKey = rkey;
      this.onMsg({ t: 'welcome', you: this.you, view: next, rules });
    } else {
      const d = diffView(this.view, next);
      if (d || events.length) this.onMsg({ t: 'diff', diff: d || {}, events });
    }
    this.view = next;
  }
  send({ intent: i, reqId }) {
    const done = (error) => this.onMsg({ t: 'ack', reqId, ok: !error, error });
    const dm = (ev, data) => { this.emitDm(ev, data); done(); };
    const isDm = this.role === 'dm';
    switch (i.type) {
      case 'move':
        if (isDm) return dm('dm:token:move', { id: i.unitId, x: i.to[0], y: i.to[1] });
        return this.socket.emit('player:move', { x: i.to[0], y: i.to[1] }, (r) => done(r?.error));
      case 'attack':
        if (isDm) { const n = Number(String(i.ability).split(':')[1]) || 0; return dm('dm:enemy:attack', { target: i.targetId, attack: n }); }
        this.socket.emit('player:combat', { act: 'attack', target: i.targetId }); return done();
      case 'endTurn': return isDm ? dm('dm:combat:next') : done('Pick an action below to end your turn.');
      case 'teleport': return isDm ? dm('dm:token', { id: i.unitId, x: i.to[0], y: i.to[1] }) : done('DM only');
      case 'setFog': return isDm ? dm('dm:fog', { on: i.enabled }) : done('DM only');
      case 'setTile': {
        if (!isDm) return done('DM only');
        const at = { x: i.x, y: i.y };
        if (i.h !== undefined) return dm('dm:map:tile', { ...at, elev: i.h });
        if (i.type2 === 'difficult') return dm('dm:map:paint', { ...at, kind: 'difficult' });
        if (i.type2) { this.emitDm('dm:map:paint', { ...at, kind: null }); return dm('dm:map:tile', { ...at, ground: i.type2 }); }
        if (i.obstacle === 'wall') return dm('dm:map:paint', { ...at, kind: 'wall' });
        if (i.obstacle === null) { this.emitDm('dm:map:paint', { ...at, kind: null }); return dm('dm:map:tile', { ...at, prop: null }); }
        return dm('dm:map:tile', { ...at, prop: i.obstacle });
      }
      default: return done('Use the Combat tab for that.');
    }
  }
  close() {}
}

// Cover the target would get, as the server works it out (src/iso.js), for the hover hint.
function coverOf(v, a, b) {
  if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1) return 0;
  const dx = Math.sign(a.x - b.x); const dy = Math.sign(a.y - b.y);
  const at = (x, y) => (x < 0 || y < 0 || x >= v.meta.w || y >= v.meta.h ? null : v.tiles[y * v.meta.w + x]);
  const hb = at(b.x, b.y).h;
  let best = 0;
  for (const [x, y] of [[b.x + dx, b.y + dy], ...(dx && dy ? [[b.x + dx, b.y], [b.x, b.y + dy]] : [])]) {
    const t = at(x, y); if (!t) continue;
    if (t.obstacle) best = Math.max(best, COVER[t.obstacle] || 0);
    if (t.h - hb >= 2) best = Math.max(best, 2);
  }
  return best;
}

/**
 * Show the 3D battle map over `slotSel` inside `root` while the table is in combat on a battle map.
 * role: 'dm' | 'player' | 'screen'. emit: DM socket emit (dm events). socket: the page socket.
 * when(state): extra condition for showing it. Returns { update(state) }: call it after each state render.
 */
export function isoStage(root, { role, socket, emit = () => {}, charId = () => null, slotSel = '.stage-center', layerClass = '', when = null, onSelect = null, pad = false } = {}) {
  let layer = null; let battle = null; let transport = null; let last = null; let ro = null; let camKey = '';
  const phone = role === 'player';

  function place() {
    if (!layer) return;
    if (!slotSel) { Object.assign(layer.style, { left: '0', top: '0', width: '100%', height: '100%' }); battle?.resize(); return; }
    const slot = root.querySelector(slotSel);
    if (!slot) return;
    const r = slot.getBoundingClientRect(); const rr = root.getBoundingClientRect();
    Object.assign(layer.style, { left: `${r.left - rr.left + root.scrollLeft}px`, top: `${r.top - rr.top + root.scrollTop}px`, width: `${r.width}px`, height: `${r.height}px` });
    battle?.resize();
  }
  function mount() {
    layer = document.createElement('div');
    layer.className = `iso-layer ${layerClass}`;
    root.appendChild(layer);
    transport = new TableTransport({ role, charId: charId(), socket, emit });
    const dm = role === 'dm';
    battle = mountBattle(layer, {
      transport,
      keyboard: role !== 'screen',
      // Phones (Mike, Nov 21): just the overhead map; moves come from the D-pad, a gamepad or a tap on a tile.
      // DM tools (Mike, Nov 27): closed until the 🛠 Tools button in the map's bar opens them (see dmChrome).
      ui: { topBar: role === 'dm', initiative: false, actions: role === 'dm', log: false, dmPanel: dm, hint: role === 'dm', party: false, toolsButton: false },
      strainMs: dm ? 700 : 0, // DM arrow keys: a step past the creature's speed is a longer hold (Mike, Nov 21)
      dmTools: ['select', 'teleport', 'raise', 'lower', 'paint', 'obstacle'],
      dmOptions: { inspector: false, initiative: false, fog: false, maps: false },
      terrainChoices: [...GROUNDS, 'difficult'],
      obstacleChoices: ['none', 'wall', 'rock', 'tree', 'crate', 'door', 'pillar', 'barrel', 'chest'],
      // A creature the DM just added must be placed first: the next tile clicked puts it there.
      onTileClick: dm ? ({ x, y }) => { const pend = (last?.pendingPlace || [])[0]; if (!pend) return false; emit('dm:token', { id: pend, x, y }); return true; } : undefined,
      moveLabel: (u) => (u.ap < 0 ? `Move · ${-u.ap * STEP_FT} ft over [M]` : `Move · ${u.ap * STEP_FT} ft left [M]`),
      // DM drags a token: a move that uses its movement (it may go past its speed). The Teleport tool stays free.
      onUnitDrop: dm ? ({ unitId, x, y }) => { emit('dm:token:move', { id: unitId, x, y }); return true; } : undefined,
      onUnitMenu: dm ? ({ unit, clientX, clientY }) => openMenu(unit.id, clientX, clientY) : undefined,
      formatCost: (tiles) => `${tiles * STEP_FT} ft`,
      showPips: false,
      showHp: dm, // health bars are for the DM only; the TV shows names (Mike, Nov 16)
      transparent: role === 'screen', // the TV keeps its backdrop behind the map
      // The TV recentres on the whole map at each turn instead of chasing the active unit (Mike, Nov 21).
      camera: phone ? { followActive: false, zoom: 7, overhead: true } : { followActive: role !== 'screen', zoom: 6 },
      describeAttack: (u, ab, tgt) => { const cv = coverOf(battle.getView(), u, tgt); return `Attack ${tgt.name} · AC ${tgt.defense ?? '?'}${cv ? ` +${cv} ${cv === 5 ? 'three-quarters' : 'half'} cover` : ''}`; },
    });
    ro = new ResizeObserver(place); ro.observe(root);
    if (onSelect) battle.on('select', (u) => onSelect(u?.id || null));
    if (dm) { dmChrome(); requestAnimationFrame(() => requestAnimationFrame(() => battle?.camera.fit())); }
    if (role === 'screen') {
      battle.on('ready', () => applyCam(true));
      battle.on('turnStart', () => battle?.camera.fit());
    }
    if (phone) { battle.on('ready', () => followMe()); battle.on('turnStart', () => followMe()); if (pad) dpad(); }
    anchors();
  }
  function unmount() { stopPad(); closeMenu(); onSelect?.(null); tray = cov = padEl = null; camKey = ''; ro?.disconnect(); battle?.destroy(); layer?.remove(); layer = battle = transport = ro = null; }

  // TV camera (Mike, Nov 21): the DM turns it a quarter turn at a time, or looks straight down (state.combat.cam).
  function applyCam(force = false) {
    const cam = last?.combat?.cam || { rot: 0, top: false };
    const k = `${cam.rot || 0}|${!!cam.top}`;
    if (!battle || (!force && k === camKey)) return;
    camKey = k;
    battle.camera.setView({ rot: cam.rot || 0, top: !!cam.top });
    requestAnimationFrame(() => battle?.camera.fit());
  }
  const meUnit = () => { const id = charId(); return id && battle?.getView()?.units[id]; };
  function followMe() { const u = meUnit(); if (u) battle.camera.focus(u.x, u.y); }

  // Combat effects land on the 3D tokens: public/combatfx.js asks where a unit is drawn and flashes it.
  function anchors() {
    window.CombatFx?.setMap?.({
      at: (id) => { const p = battle?.screenOf(id); return p ? { x: p.x, y: p.y, size: p.size } : null; },
      flash: (id, color) => battle?.flash(id, { color, shake: !window.Settings?.reducedMotion?.() }),
    });
  }

  // Phone D-pad (Mike, Nov 21): eight arrows step your character one tile in the direction they point on screen.
  // A gamepad's d-pad or left stick does the same; the middle button (or Y) centres the map on you.
  let padEl = null; let padTimer = null; let padBusy = false;
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], null, [1, 0], [-1, 1], [0, 1], [1, 1]];
  const ARROW = ['↖', '↑', '↗', '←', '◎', '→', '↙', '↓', '↘'];
  function step(sx, sy) {
    const u = meUnit(); const s = last;
    if (!u || !battle || padBusy) return;
    const turn = s?.combat?.active ? s.combat.order[s.combat.turn]?.id : null;
    if (turn !== u.id) { padNote('Wait for your turn.'); return; }
    const to = battle.stepTile(u.id, sx, sy, true);
    if (!to) return;
    padBusy = true;
    socket.emit('player:move', { x: to[0], y: to[1] }, (r) => { padBusy = false; if (r?.error) padNote(r.error); else navigator.vibrate?.(15); });
    setTimeout(() => { padBusy = false; }, 600);
  }
  function padNote(t) { const n = padEl?.querySelector('.iso-pad-note'); if (!n) return; n.textContent = t; clearTimeout(padNote.h); padNote.h = setTimeout(() => { n.textContent = ''; }, 1800); }
  function dpad() {
    padEl = document.createElement('div');
    padEl.className = 'iso-pad';
    padEl.innerHTML = `<div class="iso-pad-grid">${DIRS.map((d, i) => `<button type="button" class="iso-pad-b ${d ? '' : 'mid'}" data-i="${i}" aria-label="${d ? `Step ${ARROW[i]}` : 'Centre on me'}">${ARROW[i]}</button>`).join('')}</div><p class="iso-pad-note" aria-live="polite"></p>`;
    padEl.addEventListener('click', (e) => {
      const b = e.target.closest('.iso-pad-b'); if (!b) return;
      const d = DIRS[Number(b.dataset.i)];
      if (d) step(d[0], d[1]); else followMe();
    });
    layer.append(padEl);
    // Gamepad: poll while the map is up. One step per press, repeating every 250 ms while held.
    let held = null; let next = 0; let yWas = false;
    const poll = () => {
      padTimer = requestAnimationFrame(poll);
      const gp = [...(navigator.getGamepads?.() || [])].find(Boolean);
      if (!gp) return;
      const b = (i) => !!gp.buttons[i]?.pressed;
      let sx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0); let sy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      const ax = gp.axes[0] || 0; const ay = gp.axes[1] || 0;
      if (!sx && !sy && Math.hypot(ax, ay) > 0.5) { sx = Math.abs(ax) > 0.38 ? Math.sign(ax) : 0; sy = Math.abs(ay) > 0.38 ? Math.sign(ay) : 0; }
      const k = sx || sy ? `${sx},${sy}` : null;
      const now = performance.now();
      if (k && (k !== held || now >= next)) { step(sx, sy); next = now + (k !== held ? 400 : 250); }
      held = k;
      if (b(3) && !yWas) followMe();
      yWas = b(3);
    };
    padTimer = requestAnimationFrame(poll);
  }
  function stopPad() { if (padTimer) cancelAnimationFrame(padTimer); padTimer = null; }

  // DM only: a coverage slider (how much of the field the view shows) and a tray of tokens not yet on the map.
  let tray = null; let cov = null; let trayKey = '';
  function dmChrome() {
    cov = document.createElement('div');
    cov.className = 'iso-cov';
    cov.innerHTML = '<button type="button" class="iso-tools" aria-pressed="false" title="Show or hide the DM tools (T)">🛠 Tools</button><button type="button" class="iso-fit" title="Show the whole battle map">⛶ Fit</button><label>Coverage <input type="range" min="3" max="60" step="0.5" aria-label="Map coverage"></label>'
      + '<span class="iso-tvcam" title="Turn the TV view of the battle map"><b>TV</b><button type="button" data-tvcam="-1" aria-label="Turn the TV view left">⟲</button><button type="button" data-tvcam="1" aria-label="Turn the TV view right">⟳</button><button type="button" data-tvcam="top" aria-label="TV overhead view" aria-pressed="false">⬒ Top</button></span>'
      + '<label class="iso-daylight" title="Light on the battle map. Auto follows the time of day; a dungeon is always dark.">☀ <select aria-label="Battle map light"><option value="auto">Auto</option><option value="dawn">Dawn</option><option value="day">Day</option><option value="dusk">Dusk</option><option value="night">Night</option><option value="dark">Dark</option></select></label>';
    cov.querySelector('.iso-daylight select').onchange = (e) => emit('dm:map:daylight', { light: e.target.value });
    cov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tvcam]'); if (!b) return;
      const v = b.dataset.tvcam;
      if (v === 'top') emit('dm:tv:cam', { top: !last?.combat?.cam?.top }); else emit('dm:tv:cam', { turn: Number(v) });
    });
    const range = cov.querySelector('input');
    range.oninput = () => battle?.camera.zoom(Number(range.value));
    cov.querySelector('.iso-fit').onclick = () => battle?.camera.fit();
    const tools = cov.querySelector('.iso-tools');
    const syncTools = () => { const on = !!battle?.dmPanelOpen; tools.setAttribute('aria-pressed', String(on)); tools.classList.toggle('on', on); tools.style.borderColor = on ? '#f2c96e' : ''; };
    tools.onclick = () => battle?.setDmPanel(!battle.dmPanelOpen);
    battle.on('dmPanel', syncTools); battle.on('ready', syncTools); syncTools();
    battle.on('zoom', (z) => { range.value = z; });
    tray = document.createElement('div');
    tray.className = 'iso-tray';
    tray.hidden = true;
    tray.addEventListener('pointerdown', dragFromTray);
    layer.append(cov, tray);
  }
  function renderTray(s) {
    if (!tray) return;
    const all = [...s.players.map((p) => [p, true]), ...s.combat.enemies.map((e) => [e, false])];
    const pend = s.pendingPlace || [];
    const off = all.filter(([x]) => !s.tokens?.[x.id] || s.tokens[x.id].x >= s.map.cols || s.tokens[x.id].y >= s.map.rows)
      .sort(([a], [b]) => (pend.indexOf(a.id) + 1 || 999) - (pend.indexOf(b.id) + 1 || 999));
    const k = off.map(([x]) => x.id + x.name + (x.accent || '') + (x.hue ?? '') + pend.indexOf(x.id)).join('|');
    if (k === trayKey) return;
    trayKey = k;
    tray.hidden = !off.length;
    const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
    tray.innerHTML = `<b>Drag onto the map</b>${off.map(([x, pc], i) => {
      let src = ''; try { src = battle.portraitOf(lookOf(x, pc)); } catch { /* rules not loaded yet */ }
      const locked = pend.length && pend[0] !== x.id && pend.includes(x.id);
      return `<button type="button" class="iso-chip ${pc ? 'chip-pc' : 'chip-foe'} ${i === 0 && pend[0] === x.id ? 'next' : ''}" data-tok="${esc(x.id)}" ${locked ? 'disabled title="Place the first creature first"' : ''}><img src="${src}" alt="" draggable="false"><span>${esc(x.name)}</span></button>`;
    }).join('')}`;
  }
  function dragFromTray(e) {
    const chip = e.target.closest('.iso-chip');
    if (!chip || chip.disabled || e.button !== 0) return;
    e.preventDefault();
    const id = chip.dataset.tok;
    const ghost = chip.querySelector('img').cloneNode();
    ghost.className = 'iso-ghost';
    document.body.append(ghost);
    const at = (ev) => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
    at(e);
    chip.classList.add('lifted');
    const move = (ev) => at(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      ghost.remove(); chip.classList.remove('lifted');
      if (ev.type !== 'pointerup' || !battle) return;
      const canvas = layer?.querySelector('canvas');
      if (!canvas || document.elementFromPoint(ev.clientX, ev.clientY) !== canvas) return;
      const p = battle.pick(ev.clientX, ev.clientY);
      if (p.tile != null && !p.unitId) emit('dm:token', { id, x: p.x, y: p.y });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // DM right-click menu on a unit. Picked for what a DM reaches for mid-fight: attack it with the creature whose turn
  // it is, damage or heal, conditions, movement back, light, boss card, take it off the map, remove it.
  // The menu itself is the shared DM right-click menu (public/js/ctxmenu.js), so it matches the rest of the screen.
  let menuFor = null;
  const MENU_CONDITIONS = ['Prone', 'Restrained', 'Grappled', 'Frightened', 'Poisoned', 'Invisible'];
  const LIGHT_CHOICES = [['none', 'No light'], ['torch', 'Torch'], ['lantern', 'Lantern'], ['darkvision', 'Darkvision']];
  function closeMenu() { if (menuFor) { menuFor = null; Ctx.closeMenu(); } }
  function menuSpec(id) {
    const s = last;
    if (!s || !s.tokens?.[id] || menuFor !== id) return null;
    const c = s.combat;
    const pc = s.players.find((p) => p.id === id);
    const x = pc || c.enemies.find((e) => e.id === id);
    if (!x) return null;
    const moved = c.moved?.[id] || 0;
    const left = speedOf(x) - moved;
    const turnId = c.active ? c.order[c.turn]?.id : null;
    const foe = c.enemies.find((e) => e.id === turnId);
    const canHit = foe && foe.id !== id && foe.hp > 0 && x.hp > 0 && c.acted?.[foe.id] !== c.round;
    const conds = x.conditions || [];
    const light = s.tokens?.[id]?.light || 'none';
    return {
      title: x.name,
      sub: `HP ${x.hp ?? 0}/${x.maxHp || x.hp || 0} · AC ${x.ac ?? '?'} · ${left < 0 ? `${-left} ft over` : `${left} ft left`}`,
      sections: [
        canHit && { h: `Attack with ${foe.name}`, items: (foe.attacks?.length ? foe.attacks : [{ name: 'Attack', atk: null }]).map((a, i) => ({ label: `⚔ ${a.name}${a.atk != null ? ` ${a.atk >= 0 ? '+' : ''}${a.atk}` : ''}`, run: () => emit('dm:enemy:attack', { target: id, attack: i }) })) },
        { h: 'Hit points', row: true, wrap: false, items: [-5, -1, 1, 5].map((d) => ({ label: `${d > 0 ? '+' : ''}${d}`, tone: d < 0 ? 'neg' : 'pos', keep: true, run: () => emit('dm:hp', { id, delta: d }) })) },
        { h: 'Conditions', row: true, items: MENU_CONDITIONS.map((n) => ({ label: n, on: conds.includes(n), keep: true, run: () => emit('dm:condition', { id, name: n, on: !conds.includes(n) }) })) },
        { h: 'Light', row: true, items: LIGHT_CHOICES.map(([v, n]) => ({ label: n, on: light === v, keep: true, run: () => emit('dm:token:light', { id, light: v }) })) },
        { items: [
          { label: '🎯 Centre camera', run: () => { const t = last?.tokens?.[id]; if (t) battle?.camera.focus(t.x, t.y); } },
          moved && { label: `↺ Give back movement (${moved} ft used)`, run: () => emit('dm:move:reset', { id }) },
          x.boss && (last?.bossCard?.id === id ? { label: '👑 Hide boss card', run: () => emit('dm:boss:clear') } : { label: '👑 Show boss card', run: () => emit('dm:boss:card', { id }) }),
          { label: '⇩ Take off the map', run: () => emit('dm:token:remove', { id }) },
          !pc && { label: '✕ Remove creature', danger: true, arm: '✕ Click again to remove', run: () => emit('dm:enemy:remove', { id }) },
        ] },
      ],
      rebuild: () => menuSpec(id),
    };
  }
  function openMenu(id, cx, cy) {
    menuFor = id;
    const spec = menuSpec(id);
    if (spec) Ctx.openMenu({ ...spec, x: cx, y: cy });
  }
  // Keep an open menu's numbers live (HP, conditions, light) as the state changes.
  function refreshMenu() { if (menuFor && Ctx.isOpen()) Ctx.refreshMenu(); else menuFor = null; }

  return {
    update(s) {
      last = s;
      const on = s.mode === 'combat' && !!s.map && (!when || when(s));
      root.classList.toggle('iso-on', on);
      if (!on) { if (battle) unmount(); return; }
      if (!battle) mount();
      if (!layer.isConnected) root.appendChild(layer);
      place();
      transport.charId = charId();
      transport.push(s);
      battle.setGroundImage(s.map.image || null);
      renderTray(s);
      refreshMenu();
      if (role === 'screen') applyCam();
      cov?.querySelector('[data-tvcam="top"]')?.setAttribute('aria-pressed', String(!!s.combat?.cam?.top));
      const dl = cov?.querySelector('.iso-daylight select');
      if (dl && document.activeElement !== dl) { dl.value = s.map.daylight || 'auto'; dl.title = `Now: ${lightOf(s)}`; }
    },
    get battle() { return battle; },
    fit: () => battle?.camera.fit(),
    menu: (id, x = 200, y = 200) => openMenu(id, x, y), // for tests and debugging
  };
}
