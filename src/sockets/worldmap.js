// World map events (Phase G). DM edits the map, nodes, votes, travel and cards; seated phones vote and comment.
// A ticker moves travel along and draws flavour cards on time.
const hub = require('../hub');
const { state, log, nextId, broadcast } = require('../state');
const control = require('../control');
const wm = require('../worldmap');
const { str } = require('../util');

const living = require('../living');
// Living world (phase K): weather and dark stretch each leg; arriving ticks travel clocks and spreads rumours.
const legFactor = () => living.travelCost(living.weatherOf(state), state.scene?.light).factor;
// A place linked to a town by id uses that town; an unlinked place falls back to a town of the same name.
const townOf = (node) => (node?.town && state.living.towns.find((t) => t.id === node.town)) || living.townFor(state.living, node?.name);
const onArrive = (node) => require('./living').flush(living.onTravel(state, townOf(node)?.id));
const ctx = (extra = {}) => ({ now: Date.now(), seated: Object.keys(state.players).length, log, nextId, random: Math.random, legFactor: legFactor(), onArrive, ...extra });

// Travel and card timers run on the server, so they keep going with no phone open.
setInterval(() => { if (wm.tick(state.worldMap, ctx())) broadcast(); }, 500).unref?.();

module.exports = function worldSockets(socket) {
  // DM events: payload defaults to {}, and an ack gets the result when there is one.
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const out = fn(payload || {}) ?? {};
    broadcast();
    ack?.(out);
  });
  const W = () => state.worldMap;

  dm('dm:worldmap:image', ({ image }) => wm.setImage(W(), image));
  dm('dm:worldmap:show', ({ on }) => { W().onTv = !!on; });
  dm('dm:worldmap:timing', (f) => wm.setTiming(W(), f));
  dm('dm:worldmap:node', (f) => {
    const n = wm.saveNode(W(), f, ctx());
    return n ? { id: n.id } : { error: 'Too many places, or unknown place.' };
  });
  dm('dm:worldmap:node:remove', ({ id }) => wm.removeNode(W(), id));
  dm('dm:worldmap:reveal', ({ id, on }) => wm.reveal(W(), id, on));
  dm('dm:worldmap:vote:start', ({ candidates }) => wm.startVote(W(), candidates, ctx()));
  dm('dm:worldmap:vote:close', () => wm.closeVote(W(), ctx()));
  dm('dm:worldmap:vote:cancel', () => wm.cancelVote(W()));
  // The DM's override: send the party to a place now, whatever the vote says.
  dm('dm:worldmap:go', ({ node }) => wm.go(W(), node, ctx(), { anyRoad: true }));
  // Roads and fog: a road joins two places and is `length` legs long; under fog the table sees known roads only.
  dm('dm:worldmap:road', (f) => {
    const r = wm.saveRoad(W(), f, ctx());
    return r ? { id: r.id } : { error: 'Pick two different places (80 roads at most).' };
  });
  dm('dm:worldmap:road:remove', ({ id }) => wm.removeRoad(W(), id));
  dm('dm:worldmap:fog', ({ on }) => wm.setFog(W(), on));
  dm('dm:worldmap:fog:all', ({ on }) => { for (const n of W().nodes) n.seen = !!on; for (const r of W().roads) r.known = !!on; if (on === false && W().here) wm.uncover(W(), W().here); });
  dm('dm:worldmap:deck:add', (f) => wm.addDeck(W(), f, ctx()));
  dm('dm:worldmap:deck:remove', ({ id }) => wm.removeDeck(W(), id));
  dm('dm:worldmap:table:set', (f) => wm.saveTable(W(), f, ctx()));
  dm('dm:worldmap:table:remove', ({ id }) => wm.removeTable(W(), id));
  dm('dm:worldmap:draw', () => wm.drawNow(W(), ctx()));
  dm('dm:worldmap:card:veto', ({ id, on }) => wm.vetoCard(W(), id, on));
  dm('dm:worldmap:lore', ({ id, on }) => wm.revealLore(W(), id, on));

  // Phone events: one seated character, acting through its claim (src/control.js).
  socket.on('player:worldmap:vote', ({ node } = {}) => {
    const p = control.actorOf(state, socket);
    if (!p || !wm.castVote(W(), p.id, node, ctx())) return;
    broadcast();
  });
  socket.on('player:worldmap:comment', ({ card, text } = {}, ack) => {
    const p = control.actorOf(state, socket);
    if (!p) return ack?.({ error: 'no character' });
    const ok = wm.comment(W(), card, p.id, str(p.name, 24), text, ctx());
    if (ok) broadcast();
    ack?.({ ok });
  });
};
