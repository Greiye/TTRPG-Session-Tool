// Three.js rendering: ortho camera rig with 9-preset snapping, cel-shaded low-poly terrain, billboard units and scenery, overlays.
import * as THREE from 'three';
import { getSheet } from './sprites.js';
import { mulberry32 } from '../core/grid.js';

const DEG = Math.PI / 180;
const ISO_EL = 35 * DEG, TOP_EL = 89.5 * DEG, TOP_THRESHOLD = 62 * DEG;

const TILE_COLORS = { grass: '#6a9a48', dirt: '#8a6a44', stone: '#8a8a90', sand: '#cdb878', water: '#3a78a8', difficult: '#6b5a3a', floor: '#7c7468', snow: '#dfe6ee', flagstone: '#958b7c', cobble: '#7a7066', moss: '#5f7348' };
const FOG_TINT = new THREE.Color('#0c1426');
// Cel shading: lit surfaces step between CEL_STEPS flat tones instead of blending smoothly.
const CEL_STEPS = 8;
let celRamp = null;
function celGradient() {
  if (celRamp) return celRamp;
  const data = new Uint8Array(CEL_STEPS);
  for (let i = 0; i < CEL_STEPS; i++) data[i] = Math.round(255 * (i + 1) / CEL_STEPS);
  celRamp = new THREE.DataTexture(data, CEL_STEPS, 1, THREE.RedFormat);
  celRamp.minFilter = celRamp.magFilter = THREE.NearestFilter;
  celRamp.generateMipmaps = false; celRamp.needsUpdate = true;
  return celRamp;
}
function toon(opts = {}) { return new THREE.MeshToonMaterial({ gradientMap: celGradient(), ...opts }); }
const SIDE_COLORS = { grass: '#6a5038', dirt: '#5e4630', stone: '#606068', sand: '#9a8458', water: '#4a3a2a', difficult: '#4e4030', floor: '#5a544c', snow: '#8a96a4', flagstone: '#55504a', cobble: '#4c4642', moss: '#4a4a3a' };

// Light by time of day (Mike, Nov 22). The host sends meta.light: dawn, day, dusk, night or dark (a dungeon).
// tint darkens the unlit sprites and cards; torch is how bright the party's torches burn, sconce the wall torches.
const AMBIENCE = {
  dawn: { sky: '#ffd2bc', ground: '#3a2a3a', hemi: 1.15, sun: '#ffb27a', sunI: 1.9, sunPos: [-14, 6, 6], bg: '#2e2436', tint: '#f0d8cc', torch: 0, sconce: 0.5 },
  day: { sky: '#dfe8ff', ground: '#4a3a2a', hemi: 1.4, sun: '#fff2d8', sunI: 2.2, sunPos: [-8, 14, 5], bg: '#1d2230', tint: '#ffffff', torch: 0, sconce: 0.35 },
  dusk: { sky: '#d6a2c4', ground: '#2a1a2a', hemi: 0.95, sun: '#ff8a4a', sunI: 1.6, sunPos: [14, 5, -5], bg: '#261a2c', tint: '#e6c2bc', torch: 0.55, sconce: 0.8 },
  night: { sky: '#5a6cb0', ground: '#0e0e1c', hemi: 0.6, sun: '#9ab0ff', sunI: 0.5, sunPos: [6, 14, -6], bg: '#0a0e1c', tint: '#8792c4', torch: 1, sconce: 1 },
  dark: { sky: '#3c3e5c', ground: '#08080e', hemi: 0.42, sun: '#6a78a8', sunI: 0.22, sunPos: [4, 14, -4], bg: '#07070b', tint: '#6e7090', torch: 1, sconce: 1 },
};
const TORCH_COLOR = '#ffae5a';
const MAX_SCONCES = 8;
const reducedMotion = () => { const m = document.documentElement.dataset.motion; return m === 'reduce' || (m !== 'full' && !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches); };

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.goalTarget = new THREE.Vector3();
    this.az = 45 * DEG; this.el = ISO_EL; this.zoom = 9;
    this.goalAz = this.az; this.goalEl = this.el; this.goalZoom = this.zoom;
    this.dragging = false;
    this.dom = dom;
  }
  get overhead() { return this.el > TOP_THRESHOLD; }
  /** Index 0..7 of the nearest compass preset (used to pick sprite frames). */
  get dirIndex() { return ((Math.round(this.az / (45 * DEG)) % 8) + 8) % 8; }
  orbit(dx, dy) {
    this.az -= dx * 0.008; this.el = Math.min(TOP_EL, Math.max(15 * DEG, this.el + dy * 0.006));
    this.goalAz = this.az; this.goalEl = this.el;
  }
  // Overhead keeps the way the view faces (Mike, Nov 22): looking straight down snaps to the nearest quarter turn
  // of the current angle instead of back to north-up, a turn while overhead stays overhead, and leaving overhead
  // goes to the iso angle just to the right of it. Iso views sit at 45° + n·90°, overhead views at n·90°.
  snap() {
    if (this.el > TOP_THRESHOLD) { this.goalEl = TOP_EL; this.goalAz = quarter(this.az); }
    else { this.goalEl = ISO_EL; this.goalAz = Math.round(this.az / (45 * DEG)) * 45 * DEG; }
  }
  rotateStep(dir) {
    if (this.goalEl > TOP_THRESHOLD) { this.goalAz = quarter(this.goalAz) + dir * 90 * DEG; return; }
    this.goalAz = Math.round(this.goalAz / (45 * DEG)) * 45 * DEG + dir * 45 * DEG;
  }
  toggleOverhead() {
    if (this.goalEl > TOP_THRESHOLD) { this.goalEl = ISO_EL; this.goalAz = quarter(this.goalAz) + 45 * DEG; }
    else { this.goalEl = TOP_EL; this.goalAz = quarter(this.goalAz - 45 * DEG); }
  }
  /** Where north is on screen, in radians clockwise from straight up (for a compass). */
  get northAngle() { return this.az; }
  pan(dx, dz) {
    // screen-space pan, in world units
    const r = new THREE.Vector3(Math.cos(this.az), 0, -Math.sin(this.az));
    const f = new THREE.Vector3(-Math.sin(this.az), 0, -Math.cos(this.az));
    this.goalTarget.addScaledVector(r, dx).addScaledVector(f, dz);
  }
  update(dt, aspect) {
    const k = 1 - Math.exp(-dt * 10);
    if (!this.dragging) { this.az += (this.goalAz - this.az) * k; this.el += (this.goalEl - this.el) * k; }
    this.zoom += (this.goalZoom - this.zoom) * k;
    this.target.lerp(this.goalTarget, k);
    const d = 50;
    const c = this.camera;
    c.position.set(
      this.target.x + Math.sin(this.az) * Math.cos(this.el) * d,
      this.target.y + Math.sin(this.el) * d,
      this.target.z + Math.cos(this.az) * Math.cos(this.el) * d,
    );
    c.up.set(0, 1, 0);
    c.lookAt(this.target);
    c.left = -this.zoom * aspect; c.right = this.zoom * aspect; c.top = this.zoom; c.bottom = -this.zoom;
    c.updateProjectionMatrix();
  }
}

const quarter = (a) => Math.round(a / (90 * DEG)) * 90 * DEG;


export class BattleScene {
  constructor(container, rules, { transparent = false, showHp = true, xray = true } = {}) {
    this.showHp = showHp;
    this.xray = xray;
    this.rules = rules;
    this.HS = rules.heightStep;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: transparent });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = transparent ? null : new THREE.Color('#1d2230');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.rig = new CameraRig(this.camera, this.renderer.domElement);

    this.transparent = transparent;
    this.hemi = new THREE.HemisphereLight('#dfe8ff', '#4a3a2a', 1.4); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2d8', 2.2); this.sun.position.set(-8, 14, 5); this.scene.add(this.sun);
    this.lightName = 'day'; this.theme = 'outdoor'; this.amb = null; this.tint = new THREE.Color('#ffffff'); this.partyTint = new THREE.Color('#ffffff');
    this.torches = []; this.sconces = [];

    this.world = new THREE.Group(); this.scene.add(this.world);
    this.unitObjs = new Map();
    this.obstacleObjs = new Map();
    this.floaters = [];
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.fogPreview = true;

    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container); this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this._ro.disconnect();
    this.scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const el = this.renderer.domElement.parentElement;
    if (!el) return;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h); this.aspect = w / h;
  }

  tileToWorld(x, y, h) { return new THREE.Vector3(x - this.w / 2 + 0.5, h * this.HS, y - this.hgt / 2 + 0.5); }

  // ---------- terrain ----------
  buildTerrain(view) {
    const { w, h } = view.meta;
    if (this.columns && this.w === w && this.hgt === h) { this.updateTiles(view, null); return; }
    this.w = w; this.hgt = h;
    for (const m of [this.columns, this.caps, this.overlay]) if (m) { this.world.remove(m); m.geometry.dispose(); }
    const n = w * h;
    const mat = toon();
    this.columns = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
    this.caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat.clone(), n);
    this.columns.userData.pick = 'tile'; this.caps.userData.pick = 'tile';
    const ov = new THREE.PlaneGeometry(0.94, 0.94); ov.rotateX(-Math.PI / 2);
    this.overlay = new THREE.InstancedMesh(ov, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), n);
    this.overlay.renderOrder = 2;
    for (const m of [this.columns, this.caps, this.overlay]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.world.add(m); }
    this.overlayColors = new Array(n).fill(null);
    this.rig.goalTarget.set(0, 1, 0); this.rig.target.copy(this.rig.goalTarget);
    this.rig.goalZoom = Math.max(w, h) * 0.55;
    this.updateTiles(view, null);
    const g = this.groundUrl; this.groundUrl = undefined; if (g) this.setGroundImage(g);
  }

  updateTiles(view, changed) {
    const { w } = view.meta;
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const vis = view.visible ? new Set(view.visible) : null;
    const dim = vis && (!view.isDM || this.fogPreview);
    const list = changed || view.tiles.map((_, i) => i);
    this.tiles = view.tiles;
    for (const i of list) {
      const t = view.tiles[i]; const x = i % w, y = Math.floor(i / w);
      const top = t.h * this.HS + (t.type === 'water' ? -0.15 : 0);
      const p = this.tileToWorld(x, y, 0);
      const capH = 0.12;
      m.compose(new THREE.Vector3(p.x, (top - capH - 1) / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, top - capH + 1, 1));
      this.columns.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, top - capH / 2, p.z), new THREE.Quaternion(), new THREE.Vector3(1, capH, 1));
      this.caps.setMatrixAt(i, m);
      const jit = 0.92 + mulberry32(i * 7919 + 1)() * 0.16;
      const fog = dim && !vis.has(i) ? (view.isDM ? 0.35 : 0.12) : 1;
      col.set(TILE_COLORS[t.type] || '#ff00ff').multiplyScalar(jit * fog); if (fog < 1) col.lerp(FOG_TINT, 0.25); this.caps.setColorAt(i, col);
      col.set(SIDE_COLORS[t.type] || '#ff00ff').multiplyScalar(jit * fog); if (fog < 1) col.lerp(FOG_TINT, 0.25); this.columns.setColorAt(i, col);
      this.syncObstacle(i, t, x, y, fog);
      this.setOverlay(i, this.overlayColors[i]);
    }
    for (const mm of [this.columns, this.caps]) { mm.instanceMatrix.needsUpdate = true; mm.instanceColor.needsUpdate = true; mm.computeBoundingSphere(); }
    if (!changed) this.buildSconces();
  }

  /** An image (e.g. an uploaded battle map) laid over the whole grid at ground height (h = 0). */
  setGroundImage(url) {
    if (this.groundUrl === url) return;
    this.groundUrl = url;
    if (this.ground) { this.world.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.map?.dispose(); this.ground.material.dispose(); this.ground = null; }
    if (!url || !this.w) return;
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(this.w, this.hgt); geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, toon({ map: tex, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.ground.position.y = 0.002; this.world.add(this.ground);
  }

  surfaceY(x, y) { const t = this.tiles?.[y * this.w + x]; return t ? t.h * this.HS + (t.type === 'water' ? -0.15 : 0) : 0; }

  syncObstacle(i, t, x, y, fog) {
    const across = t.obstacle === 'door' ? this.doorAcross(x, y) : 0;
    const key = t.obstacle ? `${t.obstacle}:${t.h}:${this.theme}:${across}` : null;
    const cur = this.obstacleObjs.get(i);
    const paint = (m) => { m.userData.fog = fog; m.color.copy(m.userData.base).multiplyScalar(fog); if (m.userData.unlit) m.color.multiply(this.tint); };
    if (cur && cur.userData.key === key) { cur.traverse((o) => { if (o.material?.userData.base) paint(o.material); }); return; }
    if (cur) { this.world.remove(cur); cur.traverse((o) => { if (!o.userData.shared) o.geometry?.dispose(); o.material?.dispose(); }); this.obstacleObjs.delete(i); }
    if (!key) return;
    const obj = makeObstacle(t.obstacle, i, this.theme, across);
    obj.userData.key = key; obj.userData.tile = i;
    obj.position.copy(this.tileToWorld(x, y, t.h));
    obj.traverse((o) => { o.userData.tile = i; if (o.material) { o.material.userData.base = o.material.color.clone(); o.material.userData.unlit = o.material.isMeshBasicMaterial; paint(o.material); } });
    this.world.add(obj); this.obstacleObjs.set(i, obj);
  }

  /** A door turns to fill its doorway: 1 when the walls are left and right of it (it spans x), else 0. */
  doorAcross(x, y) {
    const wallAt = (xx, yy) => { const t = this.tiles?.[yy * this.w + xx]; return xx < 0 || yy < 0 || xx >= this.w || yy >= this.hgt || t?.obstacle === 'wall'; };
    return wallAt(x - 1, y) && wallAt(x + 1, y) ? 1 : 0;
  }

  setOverlay(i, color) {
    this.overlayColors[i] = color;
    const m = new THREE.Matrix4();
    if (!color) m.makeScale(0, 0, 0);
    else { const x = i % this.w, y = Math.floor(i / this.w); const p = this.tileToWorld(x, y, 0); p.y = this.surfaceY(x, y) + 0.02; m.makeTranslation(p.x, p.y, p.z); this.overlay.setColorAt(i, new THREE.Color(color)); }
    this.overlay.setMatrixAt(i, m);
    this.overlay.instanceMatrix.needsUpdate = true;
    if (this.overlay.instanceColor) this.overlay.instanceColor.needsUpdate = true;
  }
  clearOverlay() { for (let i = 0; i < this.overlayColors.length; i++) if (this.overlayColors[i]) this.setOverlay(i, null); }

  setPathLine(points) {
    if (this.pathLine) { this.world.remove(this.pathLine); this.pathLine.geometry.dispose(); this.pathLine = null; }
    if (!points || points.length < 2) return;
    const pts = points.map(([x, y]) => { const p = this.tileToWorld(x, y, 0); p.y = this.surfaceY(x, y) + 0.08; return p; });
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.pathLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffe066', depthTest: false }));
    this.pathLine.renderOrder = 3; this.world.add(this.pathLine);
  }

  // ---------- light and time of day ----------
  /** meta.light (dawn, day, dusk, night, dark) and meta.theme (outdoor, dungeon). Eases over a second or so. */
  setAmbience({ light = 'day', theme = 'outdoor' } = {}) {
    const name = AMBIENCE[light] ? light : 'day';
    const th = theme === 'dungeon' ? 'dungeon' : 'outdoor';
    if (this.amb && name === this.lightName && th === this.theme) return;
    const themeChanged = th !== this.theme;
    this.lightName = name; this.theme = th;
    const a = AMBIENCE[name];
    const goal = { sky: new THREE.Color(a.sky), ground: new THREE.Color(a.ground), hemi: a.hemi, sun: new THREE.Color(a.sun), sunI: a.sunI, sunPos: new THREE.Vector3(...a.sunPos), bg: new THREE.Color(a.bg), tint: new THREE.Color(a.tint), torch: a.torch, sconce: th === 'dungeon' ? a.sconce : 0 };
    const first = !this.amb;
    this.ambGoal = goal;
    if (first || reducedMotion()) this.amb = { ...goal, sky: goal.sky.clone(), ground: goal.ground.clone(), sun: goal.sun.clone(), sunPos: goal.sunPos.clone(), bg: goal.bg.clone(), tint: goal.tint.clone() };
    if (themeChanged && this.tiles) this.buildSconces();
    this.syncTorches();
    this.applyAmbience(0);
  }

  applyAmbience(dt) {
    const a = this.amb, g = this.ambGoal; if (!a || !g) return;
    const k = dt ? 1 - Math.exp(-dt * 2.2) : 0;
    if (k) {
      for (const c of ['sky', 'ground', 'sun', 'bg', 'tint']) a[c].lerp(g[c], k);
      a.sunPos.lerp(g.sunPos, k);
      for (const n of ['hemi', 'sunI', 'torch', 'sconce']) a[n] += (g[n] - a[n]) * k;
    }
    this.hemi.color.copy(a.sky); this.hemi.groundColor.copy(a.ground); this.hemi.intensity = a.hemi;
    this.sun.color.copy(a.sun); this.sun.intensity = a.sunI; this.sun.position.copy(a.sunPos);
    if (!this.transparent) this.scene.background = a.bg;
    this.tint.copy(a.tint);
    this.partyTint.copy(a.tint).lerp(WHITE, Math.min(1, a.torch) * 0.6);
    // Unlit cards (rocks, trees) take the tint; lit meshes get it from the lights.
    const hex = this.tint.getHex();
    if (hex !== this.tintHex) { this.tintHex = hex; for (const obj of this.obstacleObjs.values()) obj.traverse((o) => { const m = o.material; if (m?.userData.unlit) m.color.copy(m.userData.base).multiplyScalar(m.userData.fog ?? 1).multiply(this.tint); }); }
    const t = performance.now() / 1000, still = reducedMotion();
    this.torches.forEach((l, i) => { l.intensity = a.torch * 5 * (still ? 1 : 0.9 + 0.1 * Math.sin(t * 11 + i) * Math.sin(t * 6.7 + i * 2)); });
    this.sconces.forEach((sc, i) => {
      sc.light.intensity = a.sconce * 3 * (still ? 1 : 0.88 + 0.12 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i));
      sc.flame.visible = a.sconce > 0.05;
      if (!still) sc.flame.scale.set(0.22, 0.32 * (0.92 + 0.08 * Math.sin(t * 14 + i)), 1);
    });
  }

  /** The party carries torches when it is dark enough: one warm light on each standing party token. */
  syncTorches() {
    const want = (this.ambGoal?.torch || 0) > 0;
    for (const o of this.unitObjs.values()) {
      const need = want && o.u?.team === 'players' && !o.u.dead;
      if (need && !o.torch) { o.torch = new THREE.PointLight(TORCH_COLOR, 0, 6.5, 1.2); o.torch.position.set(0.25, 1.3, 0.1); o.group.add(o.torch); }
      else if (!need && o.torch) { o.group.remove(o.torch); o.torch.dispose(); o.torch = null; }
    }
    this.torches = [...this.unitObjs.values()].map((o) => o.torch).filter(Boolean);
  }

  /** Wall torches in a dungeon: on wall faces next to the floor, spread out, at most MAX_SCONCES. */
  buildSconces() {
    for (const sc of this.sconces) { this.world.remove(sc.group); sc.light.dispose(); sc.flame.material.dispose(); }
    this.sconces = [];
    if (this.theme !== 'dungeon' || !this.tiles) return;
    const w = this.w, h = this.hgt, tiles = this.tiles;
    const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x].obstacle !== 'wall';
    const spots = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (tiles[y * w + x].obstacle !== 'wall') continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (open(x + dx, y + dy)) { spots.push([x, y, dx, dy]); break; }
    }
    const rand = mulberry32(w * 131 + h * 7 + spots.length);
    const picked = [];
    for (const sp of spots.sort(() => rand() - 0.5)) {
      if (picked.length >= MAX_SCONCES) break;
      if (picked.some((p) => Math.abs(p[0] - sp[0]) + Math.abs(p[1] - sp[1]) < 6)) continue;
      picked.push(sp);
    }
    for (const [x, y, dx, dy] of picked) {
      const group = new THREE.Group();
      const p = this.tileToWorld(x, y, tiles[y * w + x].h);
      group.position.set(p.x + dx * 0.52, p.y + 1.55, p.z + dy * 0.52);
      const bracket = new THREE.Mesh(SCONCE_GEO, toon({ color: '#3a2a1a' })); bracket.userData.shared = true; group.add(bracket);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), color: '#ffd090', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.scale.set(0.22, 0.32, 1); flame.position.y = 0.22; flame.renderOrder = 2; flame.raycast = () => {}; group.add(flame);
      const light = new THREE.PointLight(TORCH_COLOR, 0, 5.5, 1.4); light.position.set(dx * 0.3, 0.25, dy * 0.3); group.add(light);
      this.world.add(group); this.sconces.push({ group, flame, light });
    }
  }

  // ---------- units ----------
  syncUnits(view, events, selectedId) {
    const seen = new Set();
    const anims = new Map();
    for (const e of events || []) if (e.type === 'move') anims.set(e.unitId, e.path);
    for (const u of Object.values(view.units)) {
      seen.add(u.id);
      let o = this.unitObjs.get(u.id);
      // A new look (e.g. a rerolled accessory colour) rebuilds the token's sprite.
      const look = `${u.kind}|${JSON.stringify(u.palette || null)}`;
      if (o && o.look !== look) { const at = o.pos.clone(); this.world.remove(o.group); o = this.makeUnit(u); this.unitObjs.set(u.id, o); this.world.add(o.group); o.pos.copy(at); o.look = look; }
      if (!o) { o = this.makeUnit(u); this.unitObjs.set(u.id, o); this.world.add(o.group); o.pos.copy(this.unitPos(u.x, u.y)); o.look = look; }
      o.u = u;
      if (anims.has(u.id)) o.path = anims.get(u.id).slice(1).map(([x, y]) => this.unitPos(x, y)), o.pathT = 0;
      else if (!o.path) o.pos.copy(this.unitPos(u.x, u.y));
      o.ring.visible = u.id === view.meta.active || u.id === selectedId;
      o.ring.material.color.set(u.id === view.meta.active ? '#ffd84a' : '#7ad0ff');
      this.drawLabel(o, u, view);
      if (o.sil) o.sil.material.color.set(TEAM_SIL[u.team] || TEAM_SIL.monsters);
    }
    for (const [id, o] of this.unitObjs) if (!seen.has(id)) { this.world.remove(o.group); this.unitObjs.delete(id); }
    for (const e of events || []) if (e.type === 'attack') this.attackFx(e);
    if (this.ambGoal) this.syncTorches();
  }

  unitPos(x, y) { const p = this.tileToWorld(x, y, 0); p.y = this.surfaceY(x, y); return p; }

  makeUnit(u) {
    const base = this.rules.units[u.kind] || Object.values(this.rules.units)[0];
    const def = u.palette ? { ...base, palette: { ...base.palette, ...u.palette } } : base;
    const sheet = getSheet(u.palette ? `${u.kind}|${JSON.stringify(u.palette)}` : u.kind, def);
    const tex = sheet.texture.clone(); tex.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    const size = 1.8 * sheet.scale;
    sprite.scale.set(size, size, 1); sprite.center.set(0.5, 0.06);
    sprite.userData.unitId = u.id; sprite.renderOrder = 1;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32 * sheet.scale, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.38, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.025; shadow.renderOrder = 1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36 * sheet.scale, 0.44 * sheet.scale, 24), new THREE.MeshBasicMaterial({ color: '#ffd84a', depthWrite: false, transparent: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 1;
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
    const ltex = new THREE.CanvasTexture(lc); ltex.minFilter = THREE.LinearFilter;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, depthTest: false, transparent: true }));
    label.scale.set(2.0, 0.5, 1); label.center.set(0.5, 0); label.renderOrder = 5;
    const group = new THREE.Group(); group.add(shadow, ring, sprite, label);
    // X-ray: the unit's shape in its team colour, drawn only where something stands in front of it (a wall, a hill).
    let sil = null, silTex = null;
    if (this.xray) {
      silTex = sheet.silhouette.clone(); silTex.needsUpdate = true;
      sil = new THREE.Sprite(new THREE.SpriteMaterial({ map: silTex, transparent: true, opacity: 0.6, alphaTest: 0.5, depthWrite: false, depthFunc: THREE.GreaterDepth, color: TEAM_SIL[u.team] || TEAM_SIL.monsters }));
      sil.scale.copy(sprite.scale); sil.center.copy(sprite.center); sil.renderOrder = 4; sil.raycast = () => {};
      group.add(sil);
    }
    return { group, sprite, shadow, ring, label, lc, ltex, tex, sil, silTex, size, pos: new THREE.Vector3(), path: null, pathT: 0, bob: Math.random() * 6, lunge: null, hitFx: null, strain: 0, lastLabel: '' };
  }

  drawLabel(o, u, view) {
    const key = `${u.name}|${u.hp}|${u.maxHp}|${u.team}|${u.dead}|${u.owner}`;
    if (o.lastLabel === key) return; o.lastLabel = key;
    const g = o.lc.getContext('2d'); g.clearRect(0, 0, 256, 64);
    g.font = 'bold 22px monospace'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000c'; g.strokeText(u.name + (u.dead ? ' †' : ''), 128, 24);
    g.fillStyle = u.team === 'players' ? '#bfe3ff' : '#ffc4b8'; g.fillText(u.name + (u.dead ? ' †' : ''), 128, 24);
    if (this.showHp) {
      g.fillStyle = '#000'; g.fillRect(52, 34, 152, 14); g.fillStyle = '#400'; g.fillRect(54, 36, 148, 10);
      g.fillStyle = u.hp / u.maxHp > 0.5 ? '#4ad04a' : u.hp / u.maxHp > 0.25 ? '#e0c040' : '#e04a3a';
      g.fillRect(54, 36, Math.round(148 * u.hp / u.maxHp), 10);
    }
    o.ltex.needsUpdate = true;
  }

  attackFx(e) {
    const a = this.unitObjs.get(e.unitId), t = this.unitObjs.get(e.targetId);
    if (a && t) a.lunge = { dir: t.pos.clone().sub(a.pos).setY(0).normalize(), t: 0 };
    // e.label replaces the number (a host that keeps numbers for the DM passes a health word); null floats nothing.
    const text = e.label !== undefined ? e.label : !e.hit ? 'miss' : e.amount < 0 ? '+' + (-e.amount) : '-' + e.amount;
    if (t && text) this.floatText(t.pos.clone().add(new THREE.Vector3(0, t.size * 0.9, 0)), text, !e.hit ? '#dddddd' : e.amount < 0 ? '#6aff6a' : '#ff5a4a');
  }

  floatText(pos, text, color) {
    // Wide enough for a word such as "Badly hurt"; a short number keeps the old 96 px card.
    const c = document.createElement('canvas'); c.height = 40;
    let g = c.getContext('2d'); g.font = 'bold 26px monospace';
    c.width = Math.max(96, Math.ceil(g.measureText(text).width) + 16);
    g = c.getContext('2d'); g.font = 'bold 26px monospace'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(text, c.width / 2, 30); g.fillStyle = color; g.fillText(text, c.width / 2, 30);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(1.2 * c.width / 96, 0.5, 1); s.position.copy(pos); s.renderOrder = 6;
    this.world.add(s); this.floaters.push({ s, t: 0 });
  }

  focusTile(x, y) { const p = this.unitPos(x, y); this.rig.goalTarget.set(p.x, p.y, p.z); }

  /** Flash a unit (and shake it unless shake is false) for ms milliseconds. */
  flashUnit(id, { color = '#ff4a3a', ms = 450, shake = true } = {}) {
    const o = this.unitObjs.get(id); if (!o) return false;
    o.hitFx = { t: 0, ms: ms / 1000, color, shake };
    return true;
  }
  /** Where a unit stands on the page: { x, y, size } in client pixels (the middle of its body), or null. */
  screenOf(id) {
    const o = this.unitObjs.get(id); if (!o) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = o.pos.clone().add(new THREE.Vector3(0, o.size * 0.45, 0)); this.world.localToWorld(v); v.project(this.camera);
    if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) return null;
    const top = o.pos.clone().add(new THREE.Vector3(0, o.size, 0)); this.world.localToWorld(top); top.project(this.camera);
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, size: Math.max(24, Math.abs(top.y - v.y) * r.height) };
  }

  // ---------- picking ----------
  pick(clientX, clientY, skipUnitId = null) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const sprites = [...this.unitObjs.values()].filter((o) => o.u?.id !== skipUnitId).map((o) => o.sprite);
    const hitU = this.raycaster.intersectObjects(sprites, false)[0];
    let unitId = hitU?.object.userData.unitId || null;
    const targets = [this.columns, this.caps, ...this.obstacleObjs.values()];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    let tile = null;
    if (hit) {
      if (hit.object.userData.pick === 'tile') tile = hit.instanceId;
      else if (hit.object.userData.tile !== undefined) tile = hit.object.userData.tile;
    }
    if (unitId) { const u = this.unitObjs.get(unitId).u; tile = u.y * this.w + u.x; }
    return { tile: tile ?? null, x: tile != null ? tile % this.w : null, y: tile != null ? Math.floor(tile / this.w) : null, unitId };
  }

  /** Rocks and trees are flat cards: turn each to face the camera; overhead, lay them centred on their tile. */
  faceBillboards(over) {
    const q = this.camera.quaternion;
    for (const obj of this.obstacleObjs.values()) {
      const card = obj.userData.billboard; if (!card) continue;
      card.quaternion.copy(q);
      card.position.set(0, 0, 0);
      if (over) card.position.copy(UP.set(0, -card.userData.h / 2, 0).applyQuaternion(q));
    }
  }

  // ---------- loop ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.rig.update(dt, this.aspect || 1);
    this.onFrame?.();
    this.applyAmbience(dt);
    const camIdx = this.rig.dirIndex, over = this.rig.overhead;
    for (const o of this.unitObjs.values()) {
      // movement animation along path
      if (o.path && o.path.length) {
        const next = o.path[0];
        const d = next.clone().sub(o.pos); const dist = d.length();
        const step = dt * 5;
        if (dist > 0.001) { const dx = next.x - o.pos.x, dz = next.z - o.pos.z; if (Math.abs(dx) + Math.abs(dz) > 0.01) o.animFacing = ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8; }
        if (dist <= step) { o.pos.copy(next); o.path.shift(); } else o.pos.addScaledVector(d, step / dist);
        if (!o.path.length) { o.path = null; o.animFacing = null; }
      }
      o.group.position.copy(o.pos);
      const lift = (o.u.z || 0) * 0.8; // fliers hover above their tile; the shadow stays on the ground
      let hop = o.path ? Math.abs(Math.sin(performance.now() / 70)) * 0.12 : 0;
      if (o.lunge) { o.lunge.t += dt * 4; const k = Math.sin(Math.min(1, o.lunge.t) * Math.PI) * 0.3; o.group.position.addScaledVector(o.lunge.dir, k); if (o.lunge.t >= 1) o.lunge = null; }
      const facing = o.animFacing ?? o.u.facing;
      const rel = ((facing - camIdx) % 8 + 8) % 8;
      const mat = o.sprite.material;
      if (over) {
        o.tex.offset.x = 8 / 9;
        mat.rotation = facing * Math.PI / 4 - this.rig.az + Math.PI;
        o.sprite.center.set(0.5, 0.5); o.sprite.position.y = 0.1;
      } else {
        o.tex.offset.x = rel / 9;
        mat.rotation = o.u.dead ? Math.PI / 2 : 0;
        o.sprite.center.set(0.5, o.u.dead ? 0.5 : 0.06);
        o.bob += dt * 2.2;
        o.sprite.position.y = 0.02 + hop + lift + (o.u.dead ? 0.15 : 0);
        o.sprite.scale.y = o.size * (o.u.dead ? 1 : 1 + Math.sin(o.bob) * 0.015);
      }
      // A hit: the token flashes and shakes (no shake under reduced motion). A strained step: it trembles.
      let tint = o.u.dead ? '#555555' : '#ffffff';
      if (o.hitFx) {
        o.hitFx.t += dt;
        const k = o.hitFx.t / o.hitFx.ms;
        if (k >= 1) o.hitFx = null;
        else {
          if (Math.floor(o.hitFx.t * 14) % 2 === 0) tint = o.hitFx.color;
          if (o.hitFx.shake) { const side = new THREE.Vector3(Math.cos(this.rig.az), 0, -Math.sin(this.rig.az)); o.group.position.addScaledVector(side, Math.sin(o.hitFx.t * 60) * 0.12 * (1 - k)); }
        }
      }
      if (o.strain > 0) {
        const side = new THREE.Vector3(Math.cos(this.rig.az), 0, -Math.sin(this.rig.az));
        o.group.position.addScaledVector(side, Math.sin(performance.now() / 22) * 0.05 * o.strain);
        tint = '#ffb070';
      }
      mat.color.set(tint);
      if (!o.hitFx && !(o.strain > 0)) mat.color.multiply(o.torch ? this.partyTint : this.tint);
      if (o.sil) {
        o.sil.visible = !o.u.dead;
        o.sil.position.copy(o.sprite.position); o.sil.center.copy(o.sprite.center); o.sil.scale.copy(o.sprite.scale);
        o.sil.material.rotation = mat.rotation; o.silTex.offset.x = o.tex.offset.x;
      }
      o.label.position.y = over ? 0.6 : o.size * 0.95 + 0.05 + lift;
      o.label.visible = !o.u.dead || true;
    }
    this.faceBillboards(over);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt; f.s.position.y += dt * 0.8; f.s.material.opacity = Math.max(0, 1 - f.t / 1.4);
      if (f.t > 1.4) { this.world.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); this.floaters.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }
}

const UP = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');
const SCONCE_GEO = new THREE.BoxGeometry(0.08, 0.26, 0.08);
let flameTex = null;
function flameTexture() {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 48;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 30, 1, 16, 26, 20);
  grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.35, 'rgba(255,190,90,0.95)'); grad.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = grad; g.beginPath(); g.ellipse(16, 28, 12, 20, 0, 0, Math.PI * 2); g.fill();
  flameTex = new THREE.CanvasTexture(c); flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}
const TEAM_SIL = { players: '#7ad0ff', neutral: '#e0e0e0', monsters: '#ff7a6a' };

// ---------- procedural props ----------
function lambert(color) { return toon({ color }); }
function makeObstacle(kind, seed, theme = 'outdoor', across = 0) {
  const rand = mulberry32(seed * 31 + 7);
  const g = new THREE.Group();
  if (kind === 'wall' && theme === 'dungeon') {
    // Dungeon wall: a solid block of dressed stone, full height, three courses with a little colour each.
    for (let r = 0; r < 3; r++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1, 0.82, 1), lambert(new THREE.Color().setHSL(0.08, 0.07, 0.27 + rand() * 0.06)));
      b.position.y = 0.41 + r * 0.83; g.add(b);
    }
    // A dark top, so walls read clearly against the floor from straight above.
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.001, 0.05, 1.001), lambert('#1e1b19')); top.position.y = 2.49; g.add(top);
  } else if (kind === 'door') {
    // A plank door in a stone frame, turned to fill the doorway.
    const frameM = lambert('#5c5650');
    for (const sx of [-0.45, 0.45]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.3), frameM); p.position.set(sx, 1.1, 0); g.add(p); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.3), frameM); lintel.position.y = 2.25; g.add(lintel);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.05, 0.1), lambert('#7a4e2a')); door.position.y = 1.03; g.add(door);
    for (const by of [0.45, 1.6]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.12), lambert('#2a2420')); band.position.y = by; g.add(band); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), lambert('#c9a35a')); ring.position.set(0.24, 1.0, 0.07); g.add(ring);
    if (!across) g.rotation.y = Math.PI / 2;
  } else if (kind === 'pillar') {
    const m = lambert(new THREE.Color().setHSL(0.09, 0.05, 0.55 + rand() * 0.08));
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), m); base.position.y = 0.11; g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 2.1, 10), m); shaft.position.y = 1.27; g.add(shaft);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.2, 0.76), m); cap.position.y = 2.4; g.add(cap);
  } else if (kind === 'barrel') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 12), lambert('#8a5a32')); b.position.y = 0.43; g.add(b);
    for (const by of [0.18, 0.68]) { const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.06, 12), lambert('#3a3430')); hoop.position.y = by; g.add(hoop); }
    g.rotation.y = rand() * Math.PI;
  } else if (kind === 'chest') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.48), lambert('#7a4a24')); box.position.y = 0.21; g.add(box);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.72, 10, 1, false, 0, Math.PI), lambert('#8a5a2c')); lid.rotation.z = Math.PI / 2; lid.position.y = 0.42; g.add(lid);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), lambert('#e3b45a')); lock.position.set(0, 0.4, 0.25); g.add(lock);
    g.rotation.y = Math.floor(rand() * 4) * Math.PI / 2;
  } else if (kind === 'rock' || kind === 'tree') {
    const card = billboard(kind, Math.floor(rand() * VARIANTS));
    g.add(card); g.userData.billboard = card;
  } else if (kind === 'wall') {
    const rows = 4;
    for (let r = 0; r < rows; r++) for (let k = 0; k < 2; k++) {
      if (r === rows - 1 && rand() < 0.4) continue; // crumbled top
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.86), lambert(new THREE.Color().setHSL(0.1, 0.05, 0.45 + rand() * 0.15)));
      b.position.set(-0.23 + k * 0.47 + (r % 2 ? 0.05 : -0.05), 0.31 + r * 0.61, 0); b.rotation.y = (rand() - 0.5) * 0.08; g.add(b);
    }
  } else if (kind === 'crate') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), lambert('#9a6a3a')); b.position.y = 0.375; b.rotation.y = rand() * 0.5; g.add(b);
  }
  return g;
}

// ---------- billboard scenery ----------
// Rocks and trees are 2D cards drawn once per variant on a canvas, with the same 8-step banded light as the terrain.
const VARIANTS = 4;
const CARD = { tree: { w: 1.3, h: 2.5, px: [128, 256] }, rock: { w: 0.95, h: 0.75, px: [128, 100] } };
const cardTex = new Map();
const cardGeo = {};

function billboard(kind, variant) {
  const c = CARD[kind];
  if (!cardGeo[kind]) { cardGeo[kind] = new THREE.PlaneGeometry(c.w, c.h); cardGeo[kind].translate(0, c.h / 2, 0); }
  const key = `${kind}:${variant}`;
  if (!cardTex.has(key)) cardTex.set(key, drawCard(kind, variant));
  // Geometry and texture are shared between cards; only the material (fog tint) is per card.
  const m = new THREE.Mesh(cardGeo[kind], new THREE.MeshBasicMaterial({ map: cardTex.get(key), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  m.userData.h = c.h; m.userData.shared = true; m.renderOrder = 1;
  return m;
}

/** Fill a shape with CEL_STEPS flat bands of a colour, lit from the upper left. */
function celFill(g, shape, cx, cy, r, h, s, l) {
  g.save(); shape(); g.clip();
  for (let i = 0; i < CEL_STEPS; i++) {
    const k = i / (CEL_STEPS - 1);
    g.fillStyle = `hsl(${h * 360}, ${s * 100}%, ${(l * (0.45 + k * 0.85)) * 100}%)`;
    const rr = r * (1.6 - k * 1.25);
    g.beginPath(); g.arc(cx - r * 0.45 * k, cy - r * 0.45 * k, rr, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.save(); shape(); g.lineWidth = 3; g.strokeStyle = 'rgba(16,14,12,0.9)'; g.stroke(); g.restore();
}

function drawCard(kind, variant) {
  const [W, H] = CARD[kind].px;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rand = mulberry32(variant * 977 + (kind === 'tree' ? 13 : 29));
  if (kind === 'tree') {
    const tw = 16 + rand() * 6;
    celFill(g, () => { g.beginPath(); g.rect(W / 2 - tw / 2, H * 0.62, tw, H * 0.36); }, W / 2, H * 0.8, 30, 0.08, 0.45, 0.32);
    const hue = 0.25 + rand() * 0.08;
    const blobs = [[0.5, 0.52, 0.34], [0.32, 0.42, 0.24], [0.68, 0.42, 0.24], [0.5, 0.26, 0.28], [0.5, 0.12, 0.17]];
    for (const [bx, by, br] of blobs) {
      const x = W * (bx + (rand() - 0.5) * 0.08), y = H * (by + (rand() - 0.5) * 0.03), r = W * br * (0.9 + rand() * 0.2);
      celFill(g, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }, x, y, r, hue, 0.5, 0.34);
    }
  } else {
    const n = 7 + Math.floor(rand() * 3), cx = W / 2, cy = H * 0.6, pts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI; // upper half outline, flat base
      pts.push([cx + Math.cos(a) * W * (0.36 + rand() * 0.1), cy + Math.sin(a) * H * (0.45 + rand() * 0.12)]);
    }
    const shape = () => { g.beginPath(); g.moveTo(W * 0.08, H * 0.96); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(W * 0.92, H * 0.96); g.closePath(); };
    celFill(g, shape, cx, cy, W * 0.5, 0.08, 0.07, 0.5 + rand() * 0.08);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
