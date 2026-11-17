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
const trail = require('../trail');
// Arriving: the living world ticks and the trail logs the place. A dungeon entrance shows its Enter Dungeon
// window on phones and the TV (src/dungeon.js gate); the party goes in once every player holds Enter (PR R).
const onArrive = (node) => {
  require('./living').flush(living.onTravel(state, townOf(node)?.id));
  if (node) trail.add(state, 'world', node.name);
};
// While the dungeon pop-up is open the party is underground: no travel until it leaves from the start or end.
const inDungeon = () => (state.dungeon?.on ? { error: 'The party is in the dungeon. Leave it from its entrance or end first.' }
  : state.town?.on ? { error: 'The party is in town. Leave it from the Settlement entrance first.' } : null); // town visits (PR V)
// Each road leg uses up story clock segments, one per leg of the road's length (PR V, src/clock.js).
const onLeg = (legs, to) => require('../clock').spend(state, legs, to ? `on the road to ${to.name}` : 'on the road', log);
const ctx = (extra = {}) => ({ now: Date.now(), seated: Object.keys(state.players).length, log, nextId, random: Math.random, legFactor: legFactor(), onArrive, onLeg, ...extra });

// A session opens on the world map: exploration mode, map on the TV. Runs when the server starts (game night)
// and on the DM's Next session. Skipped while the DM has switched it off or the map is still empty.
function openSession() {
  const W = state.worldMap;
  if (W.openOnSession === false || (!W.image && !W.nodes.length)) return false;
  if (state.mode !== 'exploration') { state.mode = 'exploration'; require('../world').applyMood('exploration'); state.check = null; }
  W.onTv = true;
  return true;
}
openSession();

// Travel and card timers run on the server, so they keep going with no phone open.
// While the party travels between places the TV is forced to the world map (Mike, Nov 17). After arriving it
// lingers 3 s, then the TV goes back to what it showed before. Only a trip that took the TV over hands it back,
// and the DM's own Show on TV during the trip cancels the hand-back.
const LINGER_MS = 3000;
let wasTravelling = !!state.worldMap.travel;
function travelTv(W, now) {
  const started = !!W.travel && !wasTravelling; // only a trip setting off takes the TV, not a later mode change mid-trip
  wasTravelling = !!W.travel;
  if (started && !W.tvTakeover && !W.onTv) { W.tvTakeover = { until: 0 }; W.onTv = true; return true; }
  if (W.travel && W.tvTakeover?.until) { W.tvTakeover.until = 0; return false; } // set off again before the linger ended
  if (!W.travel && W.tvTakeover) {
    if (!W.tvTakeover.until) { W.tvTakeover.until = now + LINGER_MS; return false; }
    if (now >= W.tvTakeover.until) { if (!W.tvTakeover.kept) W.onTv = false; W.tvTakeover = null; return true; }
  }
  return false;
}
setInterval(() => {
  const changed = wm.tick(state.worldMap, ctx());
  if (travelTv(state.worldMap, Date.now()) || changed) broadcast();
}, 500).unref?.();

module.exports = function worldSockets(socket) {
  // DM events: payload defaults to {}, and an ack gets the result when there is one.
  const dm = (event, fn) => socket.on(event, (payload = {}, ack) => {
    if (socket.data.role !== 'dm') return ack?.({ error: 'DM only' });
    const out = fn(payload || {}) ?? {};
    travelTv(W(), Date.now()); // a trip that just set off takes the TV at once
    broadcast();
    ack?.(out);
  });
  const W = () => state.worldMap;

  dm('dm:worldmap:image', ({ image }) => wm.setImage(W(), image));
  dm('dm:worldmap:show', ({ on }) => { W().onTv = !!on; if (W().tvTakeover) W().tvTakeover.kept = true; });
  dm('dm:worldmap:opensession', ({ on }) => { W().openOnSession = !!on; });
  dm('dm:worldmap:timing', (f) => wm.setTiming(W(), f));
  dm('dm:worldmap:node', (f) => {
    const n = wm.saveNode(W(), f, ctx());
    return n ? { id: n.id } : { error: 'Too many places, or unknown place.' };
  });
  dm('dm:worldmap:node:remove', ({ id }) => { if (state.town?.on && state.town.at === id) return { error: 'The party is in that town.' }; delete state.town?.maps?.[id]; return wm.removeNode(W(), id); });
  dm('dm:worldmap:reveal', ({ id, on }) => wm.reveal(W(), id, on));
  dm('dm:worldmap:vote:start', ({ candidates }) => inDungeon() || wm.startVote(W(), candidates, ctx()));
  dm('dm:worldmap:vote:close', () => wm.closeVote(W(), ctx()));
  dm('dm:worldmap:vote:cancel', () => wm.cancelVote(W()));
  // The DM's override: send the party to a place now, whatever the vote says.
  dm('dm:worldmap:go', ({ node }) => inDungeon() || wm.go(W(), node, ctx(), { anyRoad: true }));
  // Start from an empty map: no places, roads, trip, vote or fog (the picture and the card tables stay).
  dm('dm:worldmap:clear', () => {
    if (state.dungeon.on) return inDungeon();
    Object.assign(W(), { nodes: [], roads: [], here: null, travel: null, vote: null, fog: false });
    state.town = require('../town').fresh();
    return { ok: true };
  });
  // Load the example world: a village to start in, fog, and a dungeon entrance.
  dm('dm:worldmap:example', () => {
    if (state.dungeon.on) return inDungeon();
    state.worldMap = { ...wm.example(), openOnSession: W().openOnSession, onTv: W().onTv, legSeconds: W().legSeconds, cardSeconds: W().cardSeconds, timeOnTravel: W().timeOnTravel !== false, deck: W().deck, table: W().table };
    state.town = require('../town').withStarter(); // Millbrook's town map: the five starting places (PR V)
    trail.add(state, 'world', wm.example().nodes[0].name);
    return { ok: true };
  });
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
    if (!p || state.dungeon?.on || !wm.castVote(W(), p.id, node, ctx())) return;
    travelTv(W(), Date.now()); // the vote may have sent the party off
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

module.exports.openSession = openSession;
module.exports.travelTv = travelTv;
