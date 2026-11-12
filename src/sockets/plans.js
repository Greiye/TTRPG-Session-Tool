// DM-only session plan events: import a Markdown plan, launch one scene, NPC or encounter.
const { state, log, nextId, broadcast } = require('../state');
const plan = require('../plan');
const { str } = require('../util');

const MAX_PLANS = 10;

module.exports = function planSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'Only the DM can do that.' });
    let out;
    try { out = fn(payload || {}) || {}; } catch (e) { out = { error: e.message }; }
    ack?.(out);
    broadcast();
  });
  const find = (planId) => state.plans.find((p) => p.id === planId);
  const item = (p, kind, index) => {
    const list = p?.[kind];
    return Number.isInteger(index) && list ? list[index] : null;
  };

  dm('dm:plan:import', ({ md, title }) => {
    const text = String(md ?? '');
    if (!text.trim()) return { error: 'The file is empty.' };
    const parsed = plan.parsePlan(text);
    const counts = plan.counts(parsed);
    if (!counts.scenes && !counts.npcs && !counts.encounters) return { error: 'No "## Scene:", "## NPC:" or "## Encounter:" sections found.', warnings: parsed.warnings };
    const p = { id: 'pl' + nextId(), ...parsed, title: str(title, 80) || parsed.title, at: Date.now() };
    state.plans.unshift(p);
    if (state.plans.length > MAX_PLANS) state.plans.length = MAX_PLANS;
    log('system', `Session plan imported: ${p.title}.`);
    return { id: p.id, ...counts, warnings: p.warnings };
  });
  dm('dm:plan:remove', ({ plan: planId }) => { state.plans = state.plans.filter((p) => p.id !== planId); });
  // Launch buttons. Each one changes live state; the DM sees the result on the TV and the DM page.
  dm('dm:plan:scene', ({ plan: planId, index }) => {
    const s = item(find(planId), 'scenes', index);
    if (!s) return { error: 'Scene not found.' };
    plan.launchScene(state, s, log);
  });
  dm('dm:plan:npc', ({ plan: planId, index }) => {
    const n = item(find(planId), 'npcs', index);
    if (!n) return { error: 'NPC not found.' };
    plan.launchNpc(state, n, log);
  });
  dm('dm:plan:encounter', ({ plan: planId, index }) => {
    const e = item(find(planId), 'encounters', index);
    if (!e) return { error: 'Encounter not found.' };
    const { difficulty } = plan.launchEncounter(state, e, { nextId, log });
    return { difficulty };
  });
};
