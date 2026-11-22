// Story Nodes Graph (Mike, Nov 21): a Planning board where the DM connects what they know: a PC's plot hook,
// the NPC who carries it, the place it leads to, the clue that points there. Choice echoes live here too: an
// echo node is planted now and fires on the TV after N scenes (src/moments.js), and can be linked to the hook or
// choice it answers. DM only (src/storygraph.js, src/sockets/storygraph.js).
//
// Click a node to pick it (its editor opens below the board). Drag a node to move it. 🔗 Connect, then click two
// nodes, to link them. ⤢ opens the board in a big window over the map.
import { $, emit, onState, mount, state } from '../client.js';

const { esc } = Stage;
const W = 1000;
const H = 700;
const KINDS = {
  hook: ['🪝', 'Plot hook'], pc: ['🧑', 'PC'], npc: ['🗣', 'NPC'], place: ['📍', 'Place'],
  clue: ['🔎', 'Clue'], event: ['⚡', 'Event'], secret: ['🤫', 'Secret'], echo: ['🔁', 'Choice echo'],
};
const kindOpts = (on, skip = []) => Object.entries(KINDS).filter(([k]) => !skip.includes(k)).map(([k, [i, n]]) => `<option value="${k}" ${k === on ? 'selected' : ''}>${i} ${n}</option>`).join('');

const card = mount(`<div class="card sg-card" data-tab="graph" data-fold-key="story-graph">
  <h3>Story Nodes Graph <span class="note">hooks, NPCs, places, clues and choice echoes</span></h3>
  <div class="sg-wrap" id="sgWrap">
    <div class="row sg-add">
      <select id="sgKind" aria-label="Kind" style="width:140px">${kindOpts('hook')}</select>
      <input id="sgTitle" class="grow" maxlength="80" placeholder="Title, e.g. Brann's missing brother" aria-label="Title">
      <button class="btn small primary" id="sgAdd">+ Add</button>
    </div>
    <div class="row sg-echo" id="sgEchoRow" hidden>
      <input id="sgCons" class="grow" maxlength="240" placeholder="What comes back later" aria-label="What comes back later">
      <label class="note tight">after <input id="sgAfter" type="number" min="1" max="20" value="3" style="width:4.5em" aria-label="Scenes until it fires"> scenes</label>
    </div>
    <p class="note sg-hint" id="sgHint"></p>
    <div class="row sg-tools">
      <button class="btn small" id="sgLink" aria-pressed="false" title="Click two nodes to connect them (Esc stops)">🔗 Connect</button>
      <button class="btn small" id="sgParty" title="Add a PC node for each character at the table who has none">+ Party</button>
      <span class="grow"></span>
      <button class="btn small" id="sgBig" aria-pressed="false" title="Open the board in a big window over the map" aria-label="Big view">⤢</button>
    </div>
    <div class="sg-board" id="sgBoard" aria-label="Story nodes board">
      <svg class="sg-lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="sg-labels"></div>
      <div class="sg-nodes"></div>
      <p class="sg-empty note">Add a plot hook, an NPC or a choice echo, then connect them.</p>
    </div>
    <div class="sg-edit" id="sgEdit"></div>
  </div>
</div>`);

const board = $('#sgBoard');
let sel = null; // selected node id
let linking = false;
let linkFrom = null;
let seen = null; // node ids drawn last time, so new ones pop in
let drag = null;
let editKey = '';

const graph = () => state()?.storyGraph || { nodes: [], links: [] };
const echoes = () => state()?.tv?.echoes || [];
const players = () => state()?.players || [];
const nodeById = (id) => graph().nodes.find((n) => n.id === id);

function sub(n) {
  if (n.kind === 'echo') {
    if (n.done) return 'fired';
    const e = echoes().find((x) => x.id === n.echoId);
    return e ? `in ${e.left} scene${e.left === 1 ? '' : 's'}` : '';
  }
  if (n.pc) return players().find((p) => p.id === n.pc)?.name || '';
  return '';
}

function draw() {
  const g = graph();
  const pos = (n) => ({ x: n.x, y: n.y });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  board.querySelector('.sg-lines').innerHTML = g.links.map((l) => {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) return '';
    const on = sel && (l.a === sel || l.b === sel);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${on ? 'on' : ''}" vector-effect="non-scaling-stroke"></line>`;
  }).join('');
  board.querySelector('.sg-labels').innerHTML = g.links.filter((l) => l.label && byId.has(l.a) && byId.has(l.b)).map((l) => {
    const a = pos(byId.get(l.a)), b = pos(byId.get(l.b));
    return `<span style="left:${((a.x + b.x) / 2 / W) * 100}%;top:${((a.y + b.y) / 2 / H) * 100}%">${esc(l.label)}</span>`;
  }).join('');
  const prev = seen;
  board.querySelector('.sg-nodes').innerHTML = g.nodes.map((n) => {
    const [icon] = KINDS[n.kind] || KINDS.hook;
    const s = sub(n);
    const cls = ['sg-node', `k-${n.kind}`, n.id === sel ? 'on' : '', n.id === linkFrom ? 'from' : '', n.done ? 'done' : '', prev && !prev.has(n.id) ? 'new' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" data-node="${esc(n.id)}" style="left:${(n.x / W) * 100}%;top:${(n.y / H) * 100}%" title="${esc(n.note || n.title)}"><i>${icon}</i><b>${esc(n.title)}</b>${s ? `<small>${esc(s)}</small>` : ''}</button>`;
  }).join('');
  seen = new Set(g.nodes.map((n) => n.id));
  board.querySelector('.sg-empty').hidden = g.nodes.length > 0;
  board.classList.toggle('linking', linking);
  $('#sgLink').setAttribute('aria-pressed', String(linking));
  $('#sgLink').classList.toggle('on', linking);
  const picked = nodeById(sel);
  $('#sgHint').textContent = linking ? (linkFrom ? `Now click the node to connect to ${nodeById(linkFrom)?.title || ''}.` : 'Click the first node to connect.')
    : picked ? `New nodes link to “${picked.title}”.` : '';
  drawEdit();
}

// The editor for the picked node. Redrawn only when the node or its links change, never while typing in it.
function drawEdit() {
  const box = $('#sgEdit');
  const n = nodeById(sel);
  if (!n) { box.innerHTML = ''; editKey = ''; return; }
  const g = graph();
  const links = g.links.filter((l) => l.a === n.id || l.b === n.id);
  const key = JSON.stringify([n, links, sub(n), players().map((p) => p.id + p.name)]);
  if (key === editKey && box.contains(document.activeElement)) return;
  editKey = key;
  const e = n.echoId && echoes().find((x) => x.id === n.echoId);
  const pcOpts = `<option value="">No PC</option>${players().map((p) => `<option value="${esc(p.id)}" ${p.id === n.pc ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
  box.innerHTML = `
    <div class="row"><input id="sgEdTitle" class="grow" maxlength="80" value="${esc(n.title)}" aria-label="Title">
      ${n.kind === 'echo' ? `<span class="chip">🔁 Choice echo</span>` : `<select id="sgEdKind" aria-label="Kind" style="width:130px">${kindOpts(n.kind, ['echo'])}</select>`}</div>
    ${n.kind === 'echo' ? '' : `<div class="row"><label class="note tight grow">Whose hook <select id="sgEdPc" class="grow">${pcOpts}</select></label></div>`}
    <textarea id="sgEdNote" rows="2" maxlength="400" placeholder="${n.kind === 'echo' ? 'What comes back later' : 'Notes'}" aria-label="Notes">${esc(n.note || '')}</textarea>
    <div class="row">
      <button class="btn small primary" data-sg="save">Save</button>
      ${e ? `<button class="btn small" data-sg="fire" title="Show it on the TV now">🔁 Fire now <small>(${e.left} left)</small></button>` : n.kind === 'echo' ? '<span class="note">Fired.</span>' : ''}
      <span class="grow"></span>
      <button class="btn small danger" data-sg="del" title="${e ? 'Remove the node and cancel the echo' : 'Remove the node and its links'}">✕ Remove</button>
    </div>
    ${links.length ? `<ul class="sg-links-list">${links.map((l) => {
      const other = nodeById(l.a === n.id ? l.b : l.a);
      return `<li><span>${esc(KINDS[other?.kind]?.[0] || '')} ${esc(other?.title || '?')}</span>
        <input data-sg-label="${esc(l.id)}" maxlength="40" value="${esc(l.label || '')}" placeholder="label" aria-label="Link label">
        <button class="btn small" data-sg-unlink="${esc(l.id)}" aria-label="Remove link">✕</button></li>`;
    }).join('')}</ul>` : '<p class="note">No links yet. 🔗 Connect, then click two nodes.</p>'}`;
}

onState(() => {
  if (sel && !nodeById(sel)) sel = null;
  if (linkFrom && !nodeById(linkFrom)) linkFrom = null;
  if (!drag) draw();
});

const val = (id) => $(id)?.value.trim() || '';
function syncKind() { $('#sgEchoRow').hidden = $('#sgKind').value !== 'echo'; }
$('#sgKind').addEventListener('change', syncKind);
syncKind();

function add() {
  const kind = $('#sgKind').value;
  const title = val('#sgTitle');
  if (!title) { $('#sgTitle').focus(); return; }
  const from = nodeById(sel) ? sel : null;
  if (kind === 'echo') {
    const consequence = val('#sgCons');
    if (!consequence) { $('#sgCons').focus(); return; }
    emit('dm:graph:echo', { decision: title, consequence, after: Number($('#sgAfter').value), from }, (r) => { if (r?.node) { sel = r.node.id; draw(); } });
    $('#sgCons').value = '';
  } else {
    emit('dm:graph:add', { kind, title }, (r) => {
      if (!r?.node) return;
      if (from) emit('dm:graph:link', { a: from, b: r.node.id });
      sel = r.node.id;
      draw();
    });
  }
  $('#sgTitle').value = '';
}
$('#sgAdd').addEventListener('click', add);
$('#sgTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
$('#sgCons').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
$('#sgParty').addEventListener('click', () => {
  const have = new Set(graph().nodes.filter((n) => n.kind === 'pc' && n.pc).map((n) => n.pc));
  players().filter((p) => !have.has(p.id)).forEach((p) => emit('dm:graph:add', { kind: 'pc', title: p.name, pc: p.id }));
});
$('#sgLink').addEventListener('click', () => { linking = !linking; linkFrom = null; draw(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && linking) { linking = false; linkFrom = null; draw(); } });

function pick(id) {
  if (linking) {
    if (!linkFrom) linkFrom = id;
    else if (linkFrom !== id) { emit('dm:graph:link', { a: linkFrom, b: id }); sel = id; linkFrom = null; linking = false; }
  } else sel = sel === id ? null : id;
  draw();
}

// Drag a node: pointer moves past 4 px is a drag (saved on release), else it is a click.
board.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-node]');
  if (!el || e.button !== 0) return;
  const r = board.getBoundingClientRect();
  drag = { id: el.dataset.node, el, sx: e.clientX, sy: e.clientY, r, moved: false };
  el.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
  drag.moved = true;
  drag.x = Math.max(0, Math.min(W, ((e.clientX - drag.r.left) / drag.r.width) * W));
  drag.y = Math.max(0, Math.min(H, ((e.clientY - drag.r.top) / drag.r.height) * H));
  drag.el.style.left = `${(drag.x / W) * 100}%`;
  drag.el.style.top = `${(drag.y / H) * 100}%`;
  drag.el.classList.add('dragging');
  const n = nodeById(drag.id);
  if (n) { n.x = drag.x; n.y = drag.y; } // lines follow the node while it moves
  const lines = board.querySelector('.sg-lines');
  const g = graph();
  const byId = new Map(g.nodes.map((x) => [x.id, x]));
  lines.querySelectorAll('line').forEach((ln, i) => {
    const l = g.links.filter((k) => byId.has(k.a) && byId.has(k.b))[i];
    if (!l) return;
    const a = byId.get(l.a), b = byId.get(l.b);
    ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
  });
});
const endDrag = (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.moved) emit('dm:graph:edit', { id: d.id, x: Math.round(d.x), y: Math.round(d.y) });
  else if (e.type === 'pointerup') pick(d.id);
  draw();
};
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);
// Keyboard: Enter or Space on a focused node picks it (the pointer handlers cover mouse and touch).
board.addEventListener('keydown', (e) => {
  const el = e.target.closest('[data-node]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(el.dataset.node); }
});
board.addEventListener('click', (e) => { if (!e.target.closest('[data-node]') && !linking) { sel = null; draw(); } });

$('#sgEdit').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !sel) return;
  if (b.dataset.sg === 'save') {
    const f = { id: sel, title: val('#sgEdTitle'), note: $('#sgEdNote').value };
    if ($('#sgEdKind')) f.kind = $('#sgEdKind').value;
    if ($('#sgEdPc')) f.pc = $('#sgEdPc').value;
    editKey = '';
    emit('dm:graph:edit', f);
  } else if (b.dataset.sg === 'fire') emit('dm:graph:fire', { id: sel });
  else if (b.dataset.sg === 'del') { emit('dm:graph:remove', { id: sel }); sel = null; draw(); }
  else if (b.dataset.sgUnlink) emit('dm:graph:unlink', { id: b.dataset.sgUnlink });
});
$('#sgEdit').addEventListener('change', (e) => {
  const id = e.target.dataset.sgLabel;
  if (id) emit('dm:graph:label', { id, label: e.target.value });
});

// Big view: the column is narrow, so ⤢ moves the board into a big window over the map (like the item cards).
const big = document.createElement('dialog');
big.className = 'it-big sg-big';
big.setAttribute('aria-label', 'Story Nodes Graph');
big.innerHTML = '<div class="it-big-head"><b>🕸 Story Nodes Graph</b><span class="note">drag nodes, 🔗 Connect to link them</span><span class="grow"></span><button class="btn small" id="sgBigClose" aria-label="Close the big view">✕</button></div><div class="it-big-body"></div>';
document.body.appendChild(big);
const wrap = $('#sgWrap');
function setBig(on) {
  if (on === big.open) return;
  if (on) { big.querySelector('.it-big-body').append(wrap); big.show(); } else { big.close(); card.append(wrap); }
  $('#sgBig').setAttribute('aria-pressed', String(on));
}
$('#sgBig').addEventListener('click', () => setBig(!big.open));
big.querySelector('#sgBigClose').addEventListener('click', () => setBig(false));
big.addEventListener('cancel', (e) => { e.preventDefault(); setBig(false); });
// Leaving Planning puts the board back in its card.
new MutationObserver(() => { if (card.hidden && big.open) setBig(false); }).observe(card, { attributes: true, attributeFilter: ['hidden'] });
