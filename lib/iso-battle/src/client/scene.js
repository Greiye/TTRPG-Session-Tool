// Three.js rendering: ortho camera rig with 9-preset snapping, low-poly terrain, billboard units, overlays.
import * as THREE from 'three';
import { getSheet } from './sprites.js';
import { mulberry32 } from '../core/grid.js';

const DEG = Math.PI / 180;
const ISO_EL = 35 * DEG, TOP_EL = 89.5 * DEG, TOP_THRESHOLD = 62 * DEG;

const TILE_COLORS = { grass: '#6a9a48', dirt: '#8a6a44', stone: '#8a8a90', sand: '#cdb878', water: '#3a78a8', difficult: '#6b5a3a', floor: '#7c7468', snow: '#dfe6ee' };
const FOG_TINT = new THREE.Color('#0c1426');
const SIDE_COLORS = { grass: '#6a5038', dirt: '#5e4630', stone: '#606068', sand: '#9a8458', water: '#4a3a2a', difficult: '#4e4030', floor: '#5a544c', snow: '#8a96a4' };

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
  snap() {
    if (this.el > TOP_THRESHOLD) { this.goalEl = TOP_EL; this.goalAz = nearestAngle(this.az, 0); }
    else { this.goalEl = ISO_EL; this.goalAz = Math.round(this.az / (45 * DEG)) * 45 * DEG; }
  }
  rotateStep(dir) { this.goalEl = this.goalEl > TOP_THRESHOLD ? ISO_EL : this.goalEl; this.goalAz = Math.round(this.goalAz / (45 * DEG)) * 45 * DEG + dir * 45 * DEG; }
  toggleOverhead() { if (this.goalEl > TOP_THRESHOLD) { this.goalEl = ISO_EL; } else { this.goalEl = TOP_EL; this.goalAz = nearestAngle(this.az, 0); } }
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

function nearestAngle(from, base) {
  // base + 2πk closest to from
  const tau = Math.PI * 2;
  return base + Math.round((from - base) / tau) * tau;
}

export class BattleScene {
  constructor(container, rules) {
    this.rules = rules;
    this.HS = rules.heightStep;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1d2230');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.rig = new CameraRig(this.camera, this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a3a2a', 1.4));
    const sun = new THREE.DirectionalLight('#fff2d8', 2.2); sun.position.set(-8, 14, 5); this.scene.add(sun);

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
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
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
    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.ground.position.y = 0.002; this.world.add(this.ground);
  }

  surfaceY(x, y) { const t = this.tiles?.[y * this.w + x]; return t ? t.h * this.HS + (t.type === 'water' ? -0.15 : 0) : 0; }

  syncObstacle(i, t, x, y, fog) {
    const key = t.obstacle ? `${t.obstacle}:${t.h}` : null;
    const cur = this.obstacleObjs.get(i);
    if (cur && cur.userData.key === key) { cur.traverse((o) => { if (o.material?.userData.base) o.material.color.copy(o.material.userData.base).multiplyScalar(fog); }); return; }
    if (cur) { this.world.remove(cur); cur.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.obstacleObjs.delete(i); }
    if (!key) return;
    const obj = makeObstacle(t.obstacle, i);
    obj.userData.key = key; obj.userData.tile = i;
    obj.position.copy(this.tileToWorld(x, y, t.h));
    obj.traverse((o) => { o.userData.tile = i; if (o.material) { o.material.userData.base = o.material.color.clone(); o.material.color.multiplyScalar(fog); } });
    this.world.add(obj); this.obstacleObjs.set(i, obj);
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

  // ---------- units ----------
  syncUnits(view, events, selectedId) {
    const seen = new Set();
    const anims = new Map();
    for (const e of events || []) if (e.type === 'move') anims.set(e.unitId, e.path);
    for (const u of Object.values(view.units)) {
      seen.add(u.id);
      let o = this.unitObjs.get(u.id);
      if (!o) { o = this.makeUnit(u); this.unitObjs.set(u.id, o); this.world.add(o.group); o.pos.copy(this.unitPos(u.x, u.y)); }
      o.u = u;
      if (anims.has(u.id)) o.path = anims.get(u.id).slice(1).map(([x, y]) => this.unitPos(x, y)), o.pathT = 0;
      else if (!o.path) o.pos.copy(this.unitPos(u.x, u.y));
      o.ring.visible = u.id === view.meta.active || u.id === selectedId;
      o.ring.material.color.set(u.id === view.meta.active ? '#ffd84a' : '#7ad0ff');
      this.drawLabel(o, u, view);
      o.sprite.material.color.set(u.dead ? '#555555' : '#ffffff');
    }
    for (const [id, o] of this.unitObjs) if (!seen.has(id)) { this.world.remove(o.group); this.unitObjs.delete(id); }
    for (const e of events || []) if (e.type === 'attack') this.attackFx(e);
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
    return { group, sprite, shadow, ring, label, lc, ltex, tex, size, pos: new THREE.Vector3(), path: null, pathT: 0, bob: Math.random() * 6, lunge: null, lastLabel: '' };
  }

  drawLabel(o, u, view) {
    const key = `${u.name}|${u.hp}|${u.maxHp}|${u.team}|${u.dead}|${u.owner}`;
    if (o.lastLabel === key) return; o.lastLabel = key;
    const g = o.lc.getContext('2d'); g.clearRect(0, 0, 256, 64);
    g.font = 'bold 22px monospace'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000c'; g.strokeText(u.name + (u.dead ? ' †' : ''), 128, 24);
    g.fillStyle = u.team === 'players' ? '#bfe3ff' : '#ffc4b8'; g.fillText(u.name + (u.dead ? ' †' : ''), 128, 24);
    g.fillStyle = '#000'; g.fillRect(52, 34, 152, 14); g.fillStyle = '#400'; g.fillRect(54, 36, 148, 10);
    g.fillStyle = u.hp / u.maxHp > 0.5 ? '#4ad04a' : u.hp / u.maxHp > 0.25 ? '#e0c040' : '#e04a3a';
    g.fillRect(54, 36, Math.round(148 * u.hp / u.maxHp), 10);
    o.ltex.needsUpdate = true;
  }

  attackFx(e) {
    const a = this.unitObjs.get(e.unitId), t = this.unitObjs.get(e.targetId);
    if (a && t) a.lunge = { dir: t.pos.clone().sub(a.pos).setY(0).normalize(), t: 0 };
    if (t) this.floatText(t.pos.clone().add(new THREE.Vector3(0, t.size * 0.9, 0)), !e.hit ? 'miss' : e.amount < 0 ? '+' + (-e.amount) : '-' + e.amount, !e.hit ? '#dddddd' : e.amount < 0 ? '#6aff6a' : '#ff5a4a');
  }

  floatText(pos, text, color) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 40;
    const g = c.getContext('2d'); g.font = 'bold 26px monospace'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(text, 48, 30); g.fillStyle = color; g.fillText(text, 48, 30);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(1.2, 0.5, 1); s.position.copy(pos); s.renderOrder = 6;
    this.world.add(s); this.floaters.push({ s, t: 0 });
  }

  focusTile(x, y) { const p = this.unitPos(x, y); this.rig.goalTarget.set(p.x, p.y, p.z); }

  // ---------- picking ----------
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const sprites = [...this.unitObjs.values()].map((o) => o.sprite);
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

  // ---------- loop ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.rig.update(dt, this.aspect || 1);
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
      o.label.position.y = over ? 0.6 : o.size * 0.95 + 0.05 + lift;
      o.label.visible = !o.u.dead || true;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt; f.s.position.y += dt * 0.8; f.s.material.opacity = Math.max(0, 1 - f.t / 1.4);
      if (f.t > 1.4) { this.world.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); this.floaters.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------- procedural low-poly props ----------
function lambert(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
function jitter(geo, rand, amt) {
  geo = geo.toNonIndexed ? geo : geo;
  const p = geo.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(rand() - 0.5) * amt, (rand() - 0.5) * amt, (rand() - 0.5) * amt]);
    const j = map.get(k); p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals(); return geo;
}
function makeObstacle(kind, seed) {
  const rand = mulberry32(seed * 31 + 7);
  const g = new THREE.Group();
  if (kind === 'rock') {
    const n = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const r = 0.28 + rand() * 0.18;
      const m = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(r, 0), rand, 0.16), lambert(new THREE.Color().setHSL(0.08, 0.06, 0.42 + rand() * 0.12)));
      m.position.set((rand() - 0.5) * 0.35, r * 0.7, (rand() - 0.5) * 0.35); m.scale.y = 0.75; m.rotation.y = rand() * 6; g.add(m);
    }
  } else if (kind === 'tree') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.7, 5), lambert('#6a4a2a')); trunk.position.y = 0.35; g.add(trunk);
    const hue = 0.27 + rand() * 0.06;
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.5 - i * 0.12, 0.95, 6), rand, 0.08), lambert(new THREE.Color().setHSL(hue, 0.45, 0.28 + i * 0.06)));
      c.position.y = 0.95 + i * 0.55; c.rotation.y = rand() * 6; g.add(c);
    }
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
