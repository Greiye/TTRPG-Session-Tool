// DM events for the Story Nodes Graph (src/storygraph.js). Each takes an optional ack with { ok } or { error }.
// Choice echoes are planted here as echo nodes; the echo itself still lives in state.tv (src/moments.js).
const { state, broadcast } = require('../state');
const graph = require('../storygraph');
const moments = require('../moments');

module.exports = function storyGraphSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only.' });
    const r = fn(payload || {}) || {};
    broadcast();
    ack?.(r.error ? r : { ok: true, ...r });
  });
  const g = () => graph.ensure(state);

  dm('dm:graph:add', (f) => { const n = graph.add(g(), f); return n.error ? n : { node: n }; });
  dm('dm:graph:edit', (f) => { const n = graph.edit(g(), f); return n.error ? n : { node: n }; });
  dm('dm:graph:remove', ({ id }) => {
    const n = graph.remove(g(), id);
    if (!n) return { error: 'No such node.' };
    if (n.echoId) moments.echoCancel(state.tv, n.echoId); // taking an echo off the board cancels it
    return {};
  });
  dm('dm:graph:link', (f) => { const l = graph.link(g(), f); return l.error ? l : { link: l }; });
  dm('dm:graph:unlink', ({ id }) => { graph.unlink(g(), id); return {}; });
  dm('dm:graph:label', (f) => { const l = graph.relabel(g(), f); return l ? { link: l } : { error: 'No such link.' }; });
  // Plant a choice echo as a node: { decision, consequence, after, x?, y?, from? } (from: a node to link it to).
  dm('dm:graph:echo', (f) => {
    const e = moments.echoPlant(state.tv, f);
    if (!e) return { error: 'An echo needs what the party chose, what comes back, and 1 to 20 scenes.' };
    const n = graph.add(g(), { kind: 'echo', title: e.decision, note: e.consequence, echoId: e.id, x: f.x, y: f.y });
    if (n.error) { moments.echoCancel(state.tv, e.id); return n; }
    if (f.from) graph.link(g(), { a: f.from, b: n.id });
    return { node: n };
  });
  dm('dm:graph:fire', ({ id }) => {
    const n = g().nodes.find((x) => x.id === id);
    if (!n?.echoId || !moments.echoFire(state.tv, n.echoId)) return { error: 'That echo has already fired.' };
    n.done = true;
    return {};
  });
};
