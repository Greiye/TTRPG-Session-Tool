// Session plans: import a Markdown plan, then launch its scenes, NPCs and encounters one click at a time.
// Parsing and launching happen on the server (src/plan.js); this card only lists and sends.
import { $, emit, call, mount, onState, state } from '../client.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

mount(`
<div class="card" data-panel="exploration social combat">
  <h3>Session plans <span class="note">Markdown: scenes, NPCs, encounters</span></h3>
  <div class="row">
    <label class="btn small" title="## Scene: Name, ## NPC: Name, ## Encounter: Name. See docs/session-plans.md">⬆ Import plan .md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" id="planIn" hidden></label>
    <span class="note grow" id="planStatus"></span>
  </div>
  <div id="planList"></div>
</div>`, '#atmo');

let lastKey = '';
const status = (t) => { $('#planStatus').textContent = t; };

function render(plans) {
  const key = JSON.stringify(plans);
  if (key === lastKey) return;
  lastKey = key;
  const list = $('#planList');
  if (!plans.length) { list.innerHTML = '<p class="note">No plans yet. Import a Markdown file to load scenes, NPCs and encounters.</p>'; return; }
  list.innerHTML = plans.map((p) => `
    <details class="plan" ${plans.length === 1 ? 'open' : ''}>
      <summary><b>${esc(p.title)}</b> <span class="note">${p.scenes.length} scenes · ${p.npcs.length} NPCs · ${p.encounters.length} encounters</span></summary>
      ${p.warnings?.length ? `<p class="note warn">${p.warnings.map(esc).join('<br>')}</p>` : ''}
      ${p.scenes.map((s, i) => `
        <div class="plan-item"><span class="grow"><b>Scene:</b> ${esc(s.title)}${s.launched ? ' <span class="note">✓ played</span>' : ''}<br><span class="note">${esc(s.text).slice(0, 140)}</span></span>
          <button class="btn small" data-plan-act="scene" data-plan="${esc(p.id)}" data-index="${i}">Play scene</button></div>`).join('')}
      ${p.npcs.map((n, i) => `
        <div class="plan-item"><span class="grow"><b>NPC:</b> ${esc(n.name)}${n.emotion ? ` <span class="note">${esc(n.emotion)}</span>` : ''}${n.launched ? ' <span class="note">✓ used</span>' : ''}${n.line ? `<br><span class="note">“${esc(n.line).slice(0, 120)}”</span>` : ''}</span>
          <button class="btn small" data-plan-act="npc" data-plan="${esc(p.id)}" data-index="${i}">Use NPC</button></div>`).join('')}
      ${p.encounters.map((e, i) => `
        <div class="plan-item"><span class="grow"><b>Encounter:</b> ${esc(e.title)}${e.launched ? ' <span class="note">✓ added</span>' : ''}<br><span class="note">${e.foes.map((f) => `${f.count}× ${esc(f.name)}`).join(', ')}</span></span>
          <button class="btn small" data-plan-act="encounter" data-plan="${esc(p.id)}" data-index="${i}">Add foes</button></div>`).join('')}
      <div class="row"><button class="btn small danger" data-plan-act="remove" data-plan="${esc(p.id)}">Remove plan</button></div>
    </details>`).join('');
}

onState((s) => render(s.plans || []));

$('#planList').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-plan-act]');
  if (!b) return;
  const { planAct: act, plan: id, index } = b.dataset;
  if (act === 'remove') {
    if (confirm('Remove this plan from the DM page? Items already launched stay live.')) emit('dm:plan:remove', { plan: id });
    return;
  }
  const ev2 = { scene: 'dm:plan:scene', npc: 'dm:plan:npc', encounter: 'dm:plan:encounter' }[act];
  if (ev2) { const res = await call(ev2, { plan: id, index: Number(index) }); if (res?.error) status(res.error); }
});

$('#planIn').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 200_000) { status('That file is too large (200 KB max).'); return; }
  status('Importing…');
  const res = await call('dm:plan:import', { md: await file.text(), title: file.name.replace(/\.(md|markdown|txt)$/i, '') });
  if (res.error) { status(res.error); return; }
  const warn = res.warnings?.length ? ` ${res.warnings.length} line(s) skipped; see the plan.` : '';
  status(`Imported ${res.scenes} scenes, ${res.npcs} NPCs, ${res.encounters} encounters.${warn}`);
};
