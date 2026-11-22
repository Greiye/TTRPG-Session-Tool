// Embeddable battle view: mountBattle(container, options) -> controller.
// Owns only the DOM it creates inside `container`; all listeners are removed by destroy().
import { applyDiff } from '../core/room.js';
import { findPath, reachable, hasLOS, idx } from '../core/grid.js';
import { attackPreview, canControl, blockedSet } from '../core/engine.js';
import { BattleScene } from './scene.js';
import { portraitDataURL, getSheet } from './sprites.js';
import { injectStyles } from './styles.js';

const MAX_ZOOM = 60;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TEMPLATE = `
<div class="isob-view" data-r="view"></div>
<div class="isob-panel isob-top" data-r="top"><span data-r="status"></span><span data-r="round"></span>
  <button data-r="roleToggle" hidden title="Switch between DM and player view">Role: DM</button>
  <button data-r="camOver" title="R">Overhead</button><button data-r="camL" title="Q">⟲</button><button data-r="camR" title="E">⟳</button></div>
<div class="isob-panel isob-init" data-r="init"><h3>Initiative</h3><div data-r="initList"></div><div data-r="party"></div></div>
<div class="isob-panel isob-actions" data-r="actions"></div>
<div class="isob-hint" data-r="hint" hidden></div>
<div class="isob-toast" data-r="toast" hidden></div>
<div class="isob-panel isob-log" data-r="log"></div>
<button type="button" class="isob-compass" data-r="compass" title="North. Tap to turn the map a quarter turn." aria-label="Compass: turn the map a quarter turn"><svg viewBox="-50 -50 100 100" aria-hidden="true" data-r="rose">
  <circle r="46" class="ring"/><circle r="38" class="face"/>
  <path d="M0-36 L8 0 L0 6 L-8 0Z" class="n"/><path d="M0 36 L8 0 L0-6 L-8 0Z" class="s"/>
  <path d="M-30 0 L0-5 L30 0 L0 5Z" class="ew"/>
  <text y="-23" class="nl">N</text><text x="27" y="4" class="l">E</text><text y="31" class="l">S</text><text x="-27" y="4" class="l">W</text></svg></button>
<div class="isob-panel isob-dm" data-r="dm" hidden>
  <h3>DM tools</h3><div class="tools" data-r="tools"></div><div class="row" data-r="toolOpts"></div><hr>
  <div class="row" data-r="fogRow"><label><input type="checkbox" data-r="fogOn"> Fog of war</label><label><input type="checkbox" data-r="fogPreview" checked> Tint party view</label></div>
  <div class="row" data-r="mapRow"><button data-r="reroll">Reroll initiative</button><button data-r="newMap">New map</button></div>
  <div data-r="inspWrap"><hr><h3>Selected unit</h3><div data-r="inspector"><span class="k">click a unit</span></div></div>
</div>`;

const TOOLS = [['select', 'Select / move'], ['teleport', 'Teleport'], ['spawn', 'Spawn'], ['delete', 'Delete'], ['raise', 'Raise'], ['lower', 'Lower'], ['paint', 'Paint'], ['obstacle', 'Obstacle'], ['reveal', 'Reveal fog'], ['hide', 'Hide fog']];
// The DM tools panel shows the tools in two sections: things done to units, and things done to the ground.
const TOOL_GROUPS = [['Unit actions', ['select', 'teleport', 'spawn', 'delete']], ['Landscaping', ['raise', 'lower', 'paint', 'obstacle', 'reveal', 'hide']]];
const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const PAINT_TOOLS = ['raise', 'lower', 'paint', 'obstacle', 'reveal', 'hide'];

/**
 * @param {HTMLElement} container  element to render into (give it a size)
 * @param {object} options
 *   transport   (required) LocalTransport | WebSocketTransport | any {connect(onMsg, onStatus?), send(msg), close()}
 *   ui          {topBar, initiative, actions, log, dmPanel, hint}: booleans, all default true
 *   keyboard    true: Q/E/R/WASD/1-4/M/Space/Esc while the battle has focus
 *   camera      {zoom, overhead:boolean, followActive:true}
 *   dmTools     DM tool ids to offer (default all): select, teleport, spawn, delete, raise, lower, paint, obstacle, reveal, hide
 *   dmOptions   {inspector, initiative, fog, maps}: booleans for the DM panel's extra sections, all default true
 *   obstacleChoices / terrainChoices  lists for the obstacle and paint tools (default: from rules)
 *   onTileClick({x, y, unit}) -> true to consume the click before the built-in handling
 *   describeAttack(unit, abilityId, target, preview) -> string to replace the built-in hit-chance hint
 *   moveLabel(unit) -> label for the Move button (default 'Move [M]')
 *   showPips        false hides the AP pips in the action bar
 *   onUnitMenu({unit, clientX, clientY}, api)  DM right-click (no drag) on a unit; the host draws the menu
 *   arrowMove       false turns off DM arrow keys (default: arrow keys move the selected unit one tile, screen-relative)
 *   strainMs        ms the DM must hold an arrow key to step a unit past its movement (default 0: no strain)
 *   xray            false: no outline of units standing behind walls and hills (default true)
 *   Movement over budget: a unit's ap may be negative (moved past its speed); the Move button gets class "over".
 *   view.meta.freeMove true: DM moves cost nothing (e.g. before initiative), so no red over-budget tiles.
 *   transparent     true: no background, so the page behind shows through
 *   compass         false: no compass rose (default true). It turns with the view so north is always marked;
 *                   tapping it turns the map a quarter turn (or calls options.onCompass(api) when given).
 *   showHp          false: no health bars over units and no HP in the hover hint, panels or initiative (default true)
 */
export function mountBattle(container, options = {}) {
  if (!container) throw new Error('mountBattle: container required');
  if (!options.transport) throw new Error('mountBattle: options.transport required');
  injectStyles(container.ownerDocument);
  const ui = { topBar: true, initiative: true, actions: true, log: true, dmPanel: true, hint: true, party: true, ...(options.ui || {}) };
  const dmOptions = { inspector: true, initiative: true, fog: true, maps: true, ...(options.dmOptions || {}) };
  const root = container.ownerDocument.createElement('div');
  root.className = 'isob'; root.tabIndex = 0; root.innerHTML = TEMPLATE;
  container.appendChild(root);
  const R = {}; root.querySelectorAll('[data-r]').forEach((el) => (R[el.dataset.r] = el));
  if (!ui.topBar) R.top.remove();
  if (!ui.initiative) R.init.remove();
  if (!ui.actions) R.actions.remove();
  if (!ui.log) R.log.remove();
  if (!ui.hint) R.hint.remove();
  if (options.compass === false) R.compass.remove();
  if (!dmOptions.fog) R.fogRow.hidden = true;
  if (!dmOptions.maps) R.mapRow.hidden = true;
  if (!dmOptions.inspector) R.inspWrap.hidden = true;
  const show = (el, on) => { if (el) el.hidden = !on; };
  const set = (el, txt) => { if (el) el.textContent = txt; };

  // ---------- events ----------
  const listeners = {};
  const emit = (ev, ...a) => { for (const f of listeners[ev] || []) { try { f(...a); } catch (e) { console.error('[iso-battle] listener error', e); } } };

  // ---------- state ----------
  const transport = options.transport;
  let scene, rules, view, you, sv;
  let selected = null, mode = 'move', hover = null, dmTool = 'select';
  const dmOpts = { kind: null, team: 'monsters', terrain: 'grass', obstacle: 'rock' };
  let reqId = 0, stroke = null, destroyed = false;
  const pending = new Map();
  const cleanups = [];
  const listen = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cleanups.push(() => el.removeEventListener(ev, fn, opt)); };

  function send(intent) {
    const id = ++reqId;
    return new Promise((resolve) => { pending.set(id, resolve); transport.send({ t: 'intent', intent, reqId: id }); });
  }
  function toast(msg) { if (!R.toast) return; R.toast.textContent = msg; R.toast.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (R.toast.hidden = true), 2200); }

  function onMsg(m) {
    if (destroyed) return;
    if (m.t === 'welcome') {
      const first = !scene;
      you = m.you; rules = m.rules; view = m.view;
      dmOpts.kind ||= Object.keys(rules.units).find((k) => rules.units[k].team === 'monsters') || Object.keys(rules.units)[0];
      if (first) { scene = new BattleScene(R.view, rules, { transparent: !!options.transparent, showHp: options.showHp !== false, xray: options.xray !== false }); if (options.transparent) root.style.background = 'transparent'; if (options.camera?.overhead) scene.rig.toggleOverhead(); scene.onFrame = turnCompass; bindInput(); }
      rebuild(true, []);
      if (first && options.camera?.zoom) scene.rig.goalZoom = options.camera.zoom;
      autoSelect(true);
      emit(first ? 'ready' : 'roleChange', api);
    } else if (m.t === 'diff') {
      const prev = view;
      const prevActive = view.meta.active;
      const prevDead = new Set(Object.values(view.units).filter((u) => u.dead).map((u) => u.id));
      view = applyDiff(view, m.diff);
      const d = m.diff;
      rebuild(!!(d.full || d.tilesFull || 'visible' in d || d.revealed), m.events, d.tiles ? Object.keys(d.tiles).map(Number) : null);
      for (const e of m.events) emit(e.type, e, api);
      for (const u of Object.values(view.units)) if (u.dead && !prevDead.has(u.id)) emit('unitDown', u, api);
      if (view.meta.active !== prevActive) { autoSelect(true); emit('turnStart', view.units[view.meta.active] || null, api); }
      emit('update', view, d, api);
      void prev;
    } else if (m.t === 'ack') {
      if (!m.ok) { toast(m.error); emit('error', m.error, api); }
      pending.get(m.reqId)?.({ ok: m.ok, error: m.error }); pending.delete(m.reqId);
    } else if (m.t === 'notice') toast(m.msg);
  }

  function rebuild(fullTiles, events, changedTiles) {
    view.isDM = you.isDM;
    sv = { w: view.meta.w, h: view.meta.h, tiles: view.tiles, units: view.units, initiative: view.meta.initiative, turn: view.meta.turn };
    scene.setAmbience(view.meta); // time of day and dungeon look (Mike, Nov 22)
    if (fullTiles) scene.buildTerrain(view);
    else if (changedTiles) scene.updateTiles(view, changedTiles);
    if (selected && !view.units[selected]) selected = null;
    scene.syncUnits(view, events, selected);
    renderUI(); refreshHighlights();
  }

  function autoSelect(focus) {
    const a = view.units[view.meta.active];
    if (a && canControl(sv, you, a)) { selected = a.id; mode = 'move'; if (focus) scene.focusTile(a.x, a.y); if (!you.isDM) toast(`Your turn: ${a.name}`); }
    else if (a && focus && options.camera?.followActive) scene.focusTile(a.x, a.y);
    else if (focus && !you.isDM) { const mine = Object.values(view.units).find((u) => u.owner === you.name && !u.dead); if (mine) scene.focusTile(mine.x, mine.y); }
    scene.syncUnits(view, [], selected); renderUI(); refreshHighlights();
  }

  const selUnit = () => (selected ? view.units[selected] : null);
  const controllable = (u) => u && !u.dead && canControl(sv, you, u);
  function select(id) { selected = id; mode = 'move'; scene.syncUnits(view, [], selected); renderUI(); refreshHighlights(); emit('select', id ? view.units[id] : null, api); }

  // ---------- highlights ----------
  function around(x, y, r) {
    const out = [];
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (xx >= 0 && yy >= 0 && xx < sv.w && yy < sv.h) out.push(idx(sv, xx, yy));
    return out;
  }
  function refreshHighlights() {
    if (!scene || !view) return;
    scene.clearOverlay(); scene.setPathLine(null);
    let hint = '';
    const u = selUnit(); const active = u && u.id === view.meta.active;
    if (hover?.tile != null) { const t = view.tiles[hover.tile]; hint = `(${hover.x},${hover.y}) h${t.h} ${t.type}${t.obstacle ? ' · ' + t.obstacle : ''}`; }
    if (you.isDM && dmTool !== 'select') {
      if (hover?.tile != null) for (const i of around(hover.x, hover.y, dmTool === 'reveal' || dmTool === 'hide' ? 1 : 0)) scene.setOverlay(i, '#ffffff');
    } else if (controllable(u) && mode === 'move') {
      // DM: tiles within the unit's movement are blue, tiles past it red (the DM may still move there; it goes negative).
      const free = you.isDM && view.meta.freeMove;
      const budget = you.isDM ? (free ? 99 : u.ap) : active ? u.ap : 0;
      const reachCap = you.isDM ? 30 : Math.min(budget, 30);
      const blocked = blockedSet(sv, u.id);
      const reach = reachable(sv, rules, [u.x, u.y], blocked, reachCap);
      const fmt = (c) => (options.formatCost ? options.formatCost(c) : `${c} AP`);
      for (const [i, c] of reach) if (i !== idx(sv, u.x, u.y)) scene.setOverlay(i, c > budget ? '#c84a3a' : active ? '#3a8ad8' : '#8a5ad8');
      if (hover?.tile != null && reach.has(hover.tile) && hover.tile !== idx(sv, u.x, u.y) && !hover.unitId) {
        const p = findPath(sv, rules, [u.x, u.y], [hover.x, hover.y], blocked, reachCap);
        if (p) {
          scene.setPathLine([[u.x, u.y], ...p.path]); scene.setOverlay(hover.tile, p.cost > budget ? '#ff8a6a' : '#ffe066');
          hint += free ? ' · DM move (free)' : ` · move ${fmt(p.cost)}${p.cost > budget ? ` · ${fmt(p.cost - Math.max(0, budget))} over` : ''}`;
        }
      }
    } else if (controllable(u) && rules.abilities[mode]) {
      const ab = rules.abilities[mode]; const r = Math.ceil(ab.range);
      for (let y = u.y - r; y <= u.y + r; y++) for (let x = u.x - r; x <= u.x + r; x++) {
        if (x < 0 || y < 0 || x >= sv.w || y >= sv.h || Math.hypot(x - u.x, y - u.y) > ab.range || (x === u.x && y === u.y)) continue;
        const los = !ab.needsLOS || hasLOS(sv, rules, u.x, u.y, x, y, 1.0);
        scene.setOverlay(idx(sv, x, y), los ? (ab.targetsAllies ? '#3ad86a' : '#d84a3a') : '#4a3030');
      }
      const tgt = hover?.unitId ? view.units[hover.unitId] : null;
      if (tgt) {
        const pv = attackPreview(sv, rules, u, mode, tgt);
        scene.setOverlay(idx(sv, tgt.x, tgt.y), pv.ok ? '#ffe066' : '#666666');
        const custom = pv.ok && options.describeAttack ? options.describeAttack(u, mode, tgt, pv) : null;
        hint += !pv.ok ? ` · ${pv.error}` : custom != null ? ` · ${custom}` : ` · ${ab.name} → ${tgt.name}: ${pv.chance}% ${ab.damage}${pv.cover ? ' (cover)' : ''}${pv.heightBonus ? ` (height ${pv.heightBonus > 0 ? '+' : ''}${pv.heightBonus})` : ''}`;
      }
    }
    if (hover?.unitId && view.units[hover.unitId]) { const h = view.units[hover.unitId]; hint += ` · ${h.name}${options.showHp !== false ? ` ${h.hp}/${h.maxHp}HP` : ''}${h.owner ? ' [' + h.owner + ']' : ''}`; }
    if (R.hint) { R.hint.textContent = hint; R.hint.hidden = !hint; }
  }

  // ---------- clicks ----------
  function dmApply(p, isStrokeMove) {
    if (p.tile == null) return;
    const t = view.tiles[p.tile];
    if (stroke) { if (stroke.has(p.tile)) return; stroke.add(p.tile); }
    switch (dmTool) {
      case 'raise': send({ type: 'setTile', x: p.x, y: p.y, h: t.h + 1 }); break;
      case 'lower': send({ type: 'setTile', x: p.x, y: p.y, h: t.h - 1 }); break;
      case 'paint': send({ type: 'setTile', x: p.x, y: p.y, type2: dmOpts.terrain }); break;
      case 'obstacle': send({ type: 'setTile', x: p.x, y: p.y, obstacle: dmOpts.obstacle === 'none' ? null : dmOpts.obstacle }); break;
      case 'reveal': case 'hide': send({ type: 'reveal', tiles: around(p.x, p.y, 1), on: dmTool === 'reveal' }); break;
      case 'spawn': if (!isStrokeMove) send({ type: 'spawn', kind: dmOpts.kind, team: dmOpts.team, at: [p.x, p.y] }); break;
      case 'delete': if (p.unitId && !isStrokeMove) send({ type: 'delete', unitId: p.unitId }); break;
      case 'teleport': if (selected && !isStrokeMove) send({ type: 'teleport', unitId: selected, to: [p.x, p.y] }); break;
    }
  }
  function handleClick(p) {
    const info = { x: p.x, y: p.y, unit: p.unitId ? view.units[p.unitId] : null };
    emit('tileClick', info, api);
    if (p.tile != null && options.onTileClick?.(info, api) === true) return;
    if (you.isDM && dmTool !== 'select') return dmApply(p, false);
    const u = selUnit();
    if (controllable(u) && rules.abilities[mode]) {
      if (p.unitId && view.units[p.unitId]) send({ type: 'attack', unitId: u.id, ability: mode, targetId: p.unitId });
      mode = 'move'; renderUI(); refreshHighlights(); return;
    }
    if (p.unitId && p.unitId !== selected) return select(p.unitId);
    if (p.unitId) { emit('select', view.units[p.unitId], api); return; }
    if (controllable(u) && p.tile != null && !p.unitId) send({ type: 'move', unitId: u.id, to: [p.x, p.y] });
  }

  // ---------- input (scoped to the battle element) ----------
  function bindInput() {
    const el = scene.renderer.domElement;
    let down = null;
    listen(el, 'contextmenu', (e) => e.preventDefault());
    listen(el, 'pointerdown', (e) => {
      root.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      const kind = e.button === 2 || (e.button === 0 && e.altKey) ? 'orbit' : e.button === 1 || (e.button === 0 && e.shiftKey) ? 'pan' : 'click';
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, kind, moved: false, button: e.button };
      if (kind === 'click' && you.isDM && PAINT_TOOLS.includes(dmTool)) { stroke = new Set(); down.kind = 'paint'; dmApply(scene.pick(e.clientX, e.clientY), false); }
      // DM, select tool: press on a token and drag it to another tile to place it there.
      else if (kind === 'click' && you.isDM && dmTool === 'select' && options.dmDrag !== false) {
        const p = scene.pick(e.clientX, e.clientY);
        if (p.unitId && view.units[p.unitId]) { down.kind = 'drag'; down.unitId = p.unitId; down.from = p.tile; }
      }
    });
    listen(el, 'pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        if (down.kind === 'click' && down.moved) down.kind = 'orbit';
        if (down.kind === 'orbit') { scene.rig.dragging = true; scene.rig.orbit(dx, dy); return; }
        if (down.kind === 'pan') { const k = (scene.rig.zoom * 2) / el.clientHeight; scene.rig.pan(-dx * k, dy * k / Math.sin(scene.rig.el)); return; }
        if (down.kind === 'paint') dmApply(scene.pick(e.clientX, e.clientY), true);
        if (down.kind === 'drag' && down.moved) {
          const p = scene.pick(e.clientX, e.clientY, down.unitId); const o = scene.unitObjs.get(down.unitId);
          if (o && p.tile != null) { o.path = null; o.pos.copy(scene.unitPos(p.x, p.y)); o.pos.y += 0.25; }
          root.classList.add('dragging');
        }
      }
      const p = scene.pick(e.clientX, e.clientY);
      if (p.tile !== hover?.tile || p.unitId !== hover?.unitId) { hover = p; refreshHighlights(); }
    });
    listen(el, 'pointerup', (e) => {
      if (!down) return;
      if (down.kind === 'orbit') {
        scene.rig.dragging = false; scene.rig.snap();
        // DM right-click on a unit without dragging: the host opens its unit menu.
        if (down.button === 2 && !down.moved && you.isDM && options.onUnitMenu) {
          const p = scene.pick(e.clientX, e.clientY);
          const u = p.unitId && view.units[p.unitId];
          if (u) { if (u.id !== selected) select(u.id); options.onUnitMenu({ unit: u, clientX: e.clientX, clientY: e.clientY }, api); }
        }
      }
      else if (down.kind === 'click' && !down.moved) handleClick(scene.pick(e.clientX, e.clientY));
      else if (down.kind === 'drag') {
        root.classList.remove('dragging');
        if (!down.moved) handleClick(scene.pick(e.clientX, e.clientY));
        else {
          const id = down.unitId;
          // Pick the tile under the pointer, ignoring the dragged token itself.
          const o = scene.unitObjs.get(id);
          const p = scene.pick(e.clientX, e.clientY, id);
          const u = view.units[id];
          if (p.tile != null && p.tile !== down.from && !p.unitId) {
            if (options.onUnitDrop?.({ unitId: id, x: p.x, y: p.y }, api) !== true) send({ type: 'teleport', unitId: id, to: [p.x, p.y] });
          } else if (u && o) o.pos.copy(scene.unitPos(u.x, u.y));
        }
      }
      stroke = null; down = null;
    });
    listen(el, 'wheel', (e) => { e.preventDefault(); scene.rig.goalZoom = Math.max(3, Math.min(MAX_ZOOM, scene.rig.goalZoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); emit('zoom', scene.rig.goalZoom, api); }, { passive: false });
    if (options.keyboard !== false) {
      const keys = new Set();
      listen(root, 'keydown', (e) => {
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (ARROWS[e.key] && you.isDM && options.arrowMove !== false) { e.preventDefault(); arrowMove(e.key, e.repeat); return; }
        const k = e.key.toLowerCase(); keys.add(k);
        if (k === 'q') scene.rig.rotateStep(-1);
        else if (k === 'e') scene.rig.rotateStep(1);
        else if (k === 'r') scene.rig.toggleOverhead();
        else if (k === ' ') { e.preventDefault(); api.endTurn(); }
        else if (k === 'escape') { mode = 'move'; dmTool = 'select'; renderUI(); refreshHighlights(); }
        else if (k === 'm') { mode = 'move'; renderUI(); refreshHighlights(); }
        else if (['w', 'a', 's', 'd'].includes(k)) e.preventDefault();
        const n = +k; const u = selUnit();
        if (n >= 1 && n <= 4 && u && u.abilities[n - 1] && u.ap >= rules.abilities[u.abilities[n - 1]].ap) { mode = u.abilities[n - 1]; renderUI(); refreshHighlights(); }
      });
      listen(root, 'keyup', (e) => { keys.delete(e.key.toLowerCase()); if (strain?.key === e.key) stopStrain(); });
      listen(root, 'blur', () => { keys.clear(); stopStrain(); });
      const iv = setInterval(() => {
        const s = scene.rig.zoom * 0.02;
        if (keys.has('w')) scene.rig.pan(0, s); if (keys.has('s')) scene.rig.pan(0, -s);
        if (keys.has('a')) scene.rig.pan(-s, 0); if (keys.has('d')) scene.rig.pan(s, 0);
      }, 16);
      cleanups.push(() => clearInterval(iv));
    }
    if (R.camOver) { R.camOver.onclick = () => scene.rig.toggleOverhead(); R.camL.onclick = () => scene.rig.rotateStep(-1); R.camR.onclick = () => scene.rig.rotateStep(1); }
  }

  // Compass rose (Mike, Nov 22): turns with the camera so north stays marked on the map, on every screen.
  let compassAz = null;
  function turnCompass() {
    if (!R.rose?.isConnected) return;
    const a = scene.rig.northAngle;
    if (compassAz !== null && Math.abs(a - compassAz) < 0.002) return;
    compassAz = a; R.rose.style.transform = `rotate(${(a * 180 / Math.PI).toFixed(2)}deg)`;
  }
  if (R.compass) R.compass.onclick = (e) => { e.stopPropagation(); if (!scene) return; if (options.onCompass) options.onCompass(api); else scene.rig.rotateStep(1); };

  // The tile next to a unit that lies in a screen direction (sx right, sy down), whatever the camera angle.
  // diagonal: also consider the four corner tiles (a D-pad press between two arrows).
  function stepTarget(u, sx, sy, diagonal = false) {
    const scr = (x, y) => { const v = scene.unitPos(x, y); scene.world.localToWorld(v); v.project(scene.camera); return [v.x, -v.y]; };
    const o = scr(u.x, u.y);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(diagonal ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [])];
    const want = Math.hypot(sx, sy) || 1;
    let best = null; let bestDot = -Infinity;
    for (const [dx, dy] of dirs) {
      const nx = u.x + dx, ny = u.y + dy;
      if (nx < 0 || ny < 0 || nx >= sv.w || ny >= sv.h) continue;
      const p = scr(nx, ny); const vx = p[0] - o[0], vy = p[1] - o[1]; const len = Math.hypot(vx, vy) || 1;
      const dot = (vx * sx + vy * sy) / len / want;
      if (dot > bestDot) { bestDot = dot; best = [nx, ny]; }
    }
    return best && bestDot >= 0.3 ? best : null;
  }
  // Feet-free cost of a one-tile step in tiles: the tile's move cost plus one per step climbed.
  function stepCost(u, to) {
    const t = view.tiles[to[1] * view.meta.w + to[0]]; const f = view.tiles[u.y * view.meta.w + u.x];
    if (!t) return 1;
    return (rules.terrain?.[t.type]?.moveCost || 1) + Math.max(0, (t.h || 0) - (f?.h || 0)) * (rules.grid?.climbCostPerStep || 0);
  }

  // DM arrow keys: move the selected unit one tile in the direction the arrow points on screen.
  // Strain (Mike, Nov 21): a step past the unit's movement needs the key held for strainMs; the token trembles meanwhile.
  let strain = null;
  function stopStrain() { if (!strain) return; clearTimeout(strain.timer); const o = scene?.unitObjs.get(strain.id); if (o) o.strain = 0; strain = null; emit('strain', null, api); }
  cleanups.push(() => stopStrain());
  function arrowMove(key, repeat = false) {
    const u = selUnit();
    if (!u || u.dead) return;
    const [sx, sy] = ARROWS[key];
    const best = stepTarget(u, sx, sy);
    if (!best) return;
    if (Object.values(view.units).some((x) => !x.dead && x.id !== u.id && x.x === best[0] && x.y === best[1])) { if (!repeat) toast('Someone is standing there.'); return; }
    const ms = options.strainMs || 0;
    if (ms > 0 && !view.meta.freeMove && u.ap - stepCost(u, best) < 0) {
      if (strain) return; // already straining: key repeats wait for the hold to finish
      const id = u.id;
      const o = scene.unitObjs.get(id); if (o) o.strain = 1;
      strain = { key, id, timer: setTimeout(() => { const to = stepTarget(view.units[id] || u, sx, sy) || best; stopStrain(); send({ type: 'move', unitId: id, to }); }, ms) };
      emit('strain', { unitId: id, ms }, api);
      return;
    }
    send({ type: 'move', unitId: u.id, to: best });
  }

  // ---------- UI ----------
  const portraits = {};
  const portrait = (kind) => (portraits[kind] ||= portraitDataURL(kind, rules.units[kind]));

  function renderUI() {
    if (!view) return;
    const m = view.meta;
    set(R.status, transport.status || '');
    const mine = !you.isDM && Object.values(view.units).find((u) => u.owner === you.name);
    set(R.round, `Round ${m.round}${you.isDM ? ' · DM' : ' · ' + (mine?.name || you.name)}`);
    if (R.roleToggle) { R.roleToggle.hidden = typeof transport.setRole !== 'function'; R.roleToggle.textContent = `Role: ${you.isDM ? 'DM' : 'Players'}`; }
    if (R.initList) renderInitiative(m);
    if (R.party) renderParty();
    if (R.actions) renderActions();
    renderDM();
    if (R.log) { R.log.innerHTML = view.log.map((l) => `<div>${esc(l.msg)}</div>`).join(''); R.log.scrollTop = R.log.scrollHeight; }
  }

  function renderInitiative(m) {
    const il = R.initList; il.innerHTML = '';
    m.initiative.forEach((id, i) => {
      const u = view.units[id];
      const row = document.createElement('div');
      row.className = `ini ${u ? u.team : ''} ${id === m.active ? 'active' : ''} ${id === selected ? 'sel' : ''} ${u?.dead ? 'dead' : ''}`;
      row.innerHTML = u ? `<img alt="" src="${portrait(u.kind)}"><span class="nm">${esc(u.name)}${u.owner ? ` <span class="hp">[${esc(u.owner)}]</span>` : ''}</span>${options.showHp !== false ? `<span class="hp">${u.hp}/${u.maxHp}</span>` : ''}` : '<span style="width:28px;text-align:center">?</span><span class="nm k">unseen</span>';
      if (you.isDM && dmOptions.initiative) {
        const mv = (d) => (e) => { e.stopPropagation(); const o = [...m.initiative]; const j = i + d; if (j >= 0 && j < o.length) { [o[j], o[i]] = [o[i], o[j]]; send({ type: 'setInitiative', order: o }); } };
        const up = document.createElement('button'); up.textContent = '▲'; up.title = 'move up'; up.onclick = mv(-1);
        const dn = document.createElement('button'); dn.textContent = '▼'; dn.title = 'move down'; dn.onclick = mv(1);
        row.append(up, dn);
      }
      if (u) row.onclick = () => { scene.focusTile(u.x, u.y); select(id); };
      il.appendChild(row);
    });
  }

  function renderParty() {
    const party = R.party; party.innerHTML = '';
    if (!ui.party || you.isDM || typeof transport.setRole === 'function') return;
    party.innerHTML = '<h3 style="margin-top:8px">Party</h3>';
    for (const u of Object.values(view.units).filter((u) => u.team === 'players')) {
      const r = document.createElement('div'); r.className = 'row';
      const mine = u.owner === you.name;
      r.textContent = u.name + ' ';
      const b = document.createElement('button');
      b.textContent = mine ? 'release' : u.owner || 'claim'; b.disabled = !!u.owner && !mine;
      b.onclick = () => send({ type: 'claim', unitId: u.id, release: mine });
      r.appendChild(b); party.appendChild(r);
    }
  }

  // An action: an icon button with its name under it; the details (AP, range, hit chance, damage) show on hover.
  function mkAct(box, { icon, label, tip }, on, fn, dis) {
    const w = document.createElement('span'); w.className = 'act';
    const b = document.createElement('button'); b.className = on ? 'on' : ''; b.disabled = !!dis; b.onclick = fn; b.setAttribute('aria-label', label);
    b.innerHTML = `<i aria-hidden="true">${esc(icon)}</i><span>${esc(label)}</span>`;
    const t = document.createElement('span'); t.className = 'act-tip'; t.setAttribute('role', 'tooltip'); t.innerHTML = tip;
    w.append(b, t); box.appendChild(w);
  }
  const abilityDetail = (ab) => [`<b>${esc(ab.name)}</b>`, ab.ap ? `${ab.ap} AP` : '', ab.range && ab.range < 99 ? `Range ${ab.range}` : '', ab.accuracy ? `Hit ${ab.accuracy}%` : '', ab.damage ? `${String(ab.damage).startsWith('-') ? 'Heals' : 'Damage'} ${esc(String(ab.damage).replace(/^-/, ''))}` : ''].filter(Boolean).join('<br>');

  function renderActions() {
    const box = R.actions; box.innerHTML = '';
    const u = selUnit(); const active = view.units[view.meta.active];
    if (u) {
      const img = document.createElement('img'); img.alt = ''; img.src = portrait(u.kind); box.appendChild(img);
      const name = document.createElement('span'); name.textContent = options.showHp !== false ? `${u.name} ${u.hp}/${u.maxHp}` : u.name; box.appendChild(name);
      const pips = document.createElement('span'); pips.className = 'pips';
      const cost = rules.abilities[mode]?.ap || 0;
      for (let i = 0; i < u.maxAp; i++) { const p = document.createElement('span'); p.className = 'pip' + (i < u.ap ? (i >= u.ap - cost ? ' cost' : ' f') : ''); pips.appendChild(p); }
      if (options.showPips !== false) box.appendChild(pips);
      const ctrl = controllable(u);
      mkAct(box, { icon: '🦶', label: 'Move', tip: `<b>${esc(options.moveLabel ? options.moveLabel(u) : 'Move')}</b><br>Click a tile to move.<small>Key: M</small>` }, mode === 'move', () => { mode = 'move'; renderUI(); refreshHighlights(); }, !ctrl);
      if (u.ap < 0) box.lastChild.querySelector('button').classList.add('over'); // moved past its speed (DM moves): the Move button shows red
      u.abilities.forEach((a, i) => { const ab = rules.abilities[a]; mkAct(box, { icon: ab.icon || '⚔️', label: ab.name, tip: `${ab.detail || abilityDetail(ab)}<small>Key: ${i + 1}</small>` }, mode === a, () => { mode = a; renderUI(); refreshHighlights(); }, !ctrl || u.ap < ab.ap || (u.id !== view.meta.active && !you.isDM)); });
    }
    const canEnd = active && (you.isDM || active.owner === you.name);
    mkAct(box, { icon: '⏭', label: 'End turn', tip: '<b>End turn</b><small>Key: Space</small>' }, false, () => api.endTurn(), !canEnd);
    if (!u && !canEnd) box.insertAdjacentHTML('afterbegin', `<span class="k">Waiting: ${esc(active?.name || 'enemy turn')}</span>`);
  }

  function renderDM() {
    const on = you.isDM && ui.dmPanel;
    show(R.dm, on);
    if (!on) return;
    R.tools.innerHTML = '';
    const offered = (t) => !options.dmTools || options.dmTools.includes(t);
    const label = Object.fromEntries(TOOLS);
    for (const [title, ids] of TOOL_GROUPS) {
      const list = ids.filter(offered);
      if (!list.length) continue;
      const sec = document.createElement('section'); sec.className = `tool-group ${list.includes(dmTool) ? 'cur' : ''}`;
      sec.innerHTML = `<h4>${esc(title)}</h4>`;
      const grid = document.createElement('div'); grid.className = 'tool-grid';
      for (const id of list) { const b = document.createElement('button'); b.textContent = label[id]; b.className = dmTool === id ? 'on' : ''; b.dataset.tool = id; b.onclick = () => { dmTool = id; renderUI(); refreshHighlights(); }; grid.appendChild(b); }
      sec.appendChild(grid); R.tools.appendChild(sec);
    }
    const opts = R.toolOpts; opts.innerHTML = '';
    const sel = (key, values) => { const s = document.createElement('select'); for (const v of values) s.add(new Option(v, v, false, dmOpts[key] === v)); s.onchange = () => (dmOpts[key] = s.value); opts.appendChild(s); };
    if (dmTool === 'spawn') { sel('kind', Object.keys(rules.units)); sel('team', ['monsters', 'players']); }
    if (dmTool === 'paint') sel('terrain', options.terrainChoices || Object.keys(rules.terrain));
    if (dmTool === 'obstacle') sel('obstacle', options.obstacleChoices || ['none', ...Object.keys(rules.obstacles)]);
    if (dmTool === 'teleport') opts.textContent = 'Select a unit first, then click a tile.';
    R.fogOn.checked = view.meta.fog;
    const ins = R.inspector; const u = selUnit();
    if (!u) { ins.innerHTML = '<span class="k">click a unit</span>'; return; }
    const players = [...new Set([...view.meta.players.filter((p) => !p.isDM).map((p) => p.name), ...(u.owner ? [u.owner] : [])])];
    ins.innerHTML = `
      <div><b>${esc(u.name)}</b> <span class="k">${esc(u.kind)} · ${esc(u.team)} · (${u.x},${u.y})</span></div>
      <div class="row"><span class="k">HP</span><input type="number" data-i="hp" value="${u.hp}"> / <input type="number" data-i="max" value="${u.maxHp}"><button data-i="setHp">set</button></div>
      <div class="row"><span class="k">AP</span><input type="number" data-i="ap" value="${u.ap}"><button data-i="setAp">set</button></div>
      <div class="row"><span class="k">Owner</span><select data-i="owner"><option value="">(none)</option>${players.map((p) => `<option ${p === u.owner ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <select data-i="team"><option ${u.team === 'players' ? 'selected' : ''}>players</option><option ${u.team === 'monsters' ? 'selected' : ''}>monsters</option></select></div>
      <div class="row"><button data-i="turn">Give turn</button><button data-i="face">Rotate</button><button data-i="del">Delete</button></div>`;
    const I = (k) => ins.querySelector(`[data-i="${k}"]`);
    I('setHp').onclick = () => send({ type: 'setHp', unitId: u.id, hp: +I('hp').value, maxHp: +I('max').value });
    I('setAp').onclick = () => send({ type: 'setAp', unitId: u.id, ap: +I('ap').value });
    I('owner').onchange = I('team').onchange = () => send({ type: 'assign', unitId: u.id, owner: I('owner').value || null, team: I('team').value });
    I('turn').onclick = () => send({ type: 'setActive', unitId: u.id });
    I('face').onclick = () => send({ type: 'setFacing', unitId: u.id, facing: u.facing + 1 });
    I('del').onclick = () => send({ type: 'delete', unitId: u.id });
  }

  R.fogOn.onchange = (e) => send({ type: 'setFog', enabled: e.target.checked });
  R.fogPreview.onchange = (e) => { scene.fogPreview = e.target.checked; scene.buildTerrain(view); };
  R.reroll.onclick = () => send({ type: 'rerollInitiative' });
  R.newMap.onclick = () => send({ type: 'newMap' });
  if (R.roleToggle) R.roleToggle.onclick = () => api.setRole(!you.isDM);

  // ---------- public API ----------
  const api = {
    /** Subscribe: ready, update, move, attack, turn, turnStart, spawn, unitDown, select, tileClick, roleChange, error. Returns an unsubscribe fn. */
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => api.off(ev, fn); },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
    /** Send any intent (see README). Resolves {ok, error} when the authority answers. */
    send,
    endTurn: () => send({ type: 'endTurn' }),
    /** Current client view (fog-filtered for players). Treat as read-only. */
    getView: () => view,
    get you() { return you; },
    get rules() { return rules; },
    get selected() { return selUnit(); },
    select: (unitId) => select(unitId),
    /** Hot-seat only (LocalTransport): switch between DM and player view. */
    setRole(isDM) { if (typeof transport.setRole !== 'function') throw new Error('transport does not support setRole'); transport.setRole(isDM); },
    camera: {
      rotate: (dir) => scene?.rig.rotateStep(dir),
      /** A fixed view: quarter turns (0..3) from the starting angle, iso or straight down (top). */
      setView({ rot = 0, top = false } = {}) {
        if (!scene) return;
        const r = scene.rig; const DEG = Math.PI / 180;
        const base = (top ? 0 : 45 * DEG) + rot * 90 * DEG;
        const tau = Math.PI * 2;
        r.goalAz = base + Math.round((r.goalAz - base) / tau) * tau; // the short way round
        r.goalEl = top ? 89.5 * DEG : 35 * DEG;
      },
      overhead: (on) => { if (!scene) return; if (on === undefined || on !== scene.rig.goalEl > 1.08) scene.rig.toggleOverhead(); },
      focus: (x, y) => scene?.focusTile(x, y),
      zoom: (z) => { if (scene) { scene.rig.goalZoom = Math.max(3, Math.min(MAX_ZOOM, z)); emit('zoom', scene.rig.goalZoom, api); } },
      getZoom: () => scene?.rig.goalZoom ?? null,
      /** Where the view is heading: { az (radians, 0 = north up), overhead }. */
      angle: () => (scene ? { az: scene.rig.goalAz, overhead: scene.rig.goalEl > 1.08 } : null),
      /** Zoom and centre so the whole map fits the view (the zoom it picked, or null before the map loads). */
      fit(margin = 1.08) {
        if (!scene || !view) return null;
        const { w, h } = view.meta; const az = scene.rig.goalAz, el = scene.rig.goalEl;
        const top = Math.max(0, ...view.tiles.map((t) => t.h)) * (rules.heightStep || 0.5) + 2;
        const across = w * Math.abs(Math.cos(az)) + h * Math.abs(Math.sin(az));
        const deep = (w * Math.abs(Math.sin(az)) + h * Math.abs(Math.cos(az))) * Math.sin(el) + top * Math.cos(el);
        const z = Math.min(MAX_ZOOM, Math.max(3, Math.max(across / 2 / (scene.aspect || 1), deep / 2) * margin));
        scene.rig.goalTarget.set(0, top / 4, 0); scene.rig.goalZoom = z; emit('zoom', z, api);
        return z;
      },
    },
    /** The map's light and look: { light, theme, torches, sconces } (counts of lit party torches and wall torches). */
    ambience: () => (scene ? { light: scene.lightName, theme: scene.theme, torches: scene.torches.length, sconces: scene.sconces.length } : null),
    /** Flash a unit and shake it (shake: false for reduced motion). */
    flash: (unitId, opts) => !!scene?.flashUnit(unitId, opts),
    /** Where a unit is drawn on the page: { x, y, size } in client pixels, or null when off screen. */
    screenOf: (unitId) => scene?.screenOf(unitId) || null,
    /** The tile one step from a unit in a screen direction (sx right, sy down), or null. diagonal adds the corners. */
    stepTile: (unitId, sx, sy, diagonal = true) => { const u = view?.units[unitId]; return u && scene ? stepTarget(u, sx, sy, diagonal) : null; },
    /** The tile and unit under a page point ({tile, x, y, unitId}), e.g. to drop a token dragged in from outside. */
    pick: (clientX, clientY, skipUnitId) => (scene ? scene.pick(clientX, clientY, skipUnitId) : { tile: null, x: null, y: null, unitId: null }),
    /** A data URL of a unit look's front frame: { kind, palette? } as in the view's units. */
    portraitOf(u) {
      if (!rules) return '';
      const base = rules.units[u.kind] || Object.values(rules.units)[0];
      const def = u.palette ? { ...base, palette: { ...base.palette, ...u.palette } } : base;
      return getSheet(u.palette ? `${u.kind}|${JSON.stringify(u.palette)}` : u.kind, def).frameCanvases[0].toDataURL();
    },
    /** Low-level access to the Three.js renderer/scene/camera for host customisation. */
    get three() { return scene ? { renderer: scene.renderer, scene: scene.scene, camera: scene.camera } : null; },
    resize: () => scene?.resize(),
    /** Lay an image over the ground (ground level tiles); null removes it. */
    setGroundImage: (url) => scene?.setGroundImage(url),
    focus: () => root.focus(),
    destroy() {
      if (destroyed) return; destroyed = true;
      for (const c of cleanups) c();
      clearTimeout(toast.h);
      try { transport.close?.(); } catch { /* ignore */ }
      scene?.dispose();
      root.remove();
      for (const k of Object.keys(listeners)) delete listeners[k];
    },
    element: root,
  };

  transport.connect(onMsg, (s) => set(R.status, s));
  return api;
}
