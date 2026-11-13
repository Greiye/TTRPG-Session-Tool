// World map (Phase G): the DM uploads a map and places nodes (towns, sites). The party votes where to go; a
// strict majority of the seated characters sends the party there, and the DM can always override. Travel is
// slow: the party token glides between nodes while flavour cards come up. Cards come from the DM's deck first,
// then from a weighted table the DM can edit or switch off. Every card can be vetoed after it appears.
//
// Pure logic. Functions take the world map object and a context { now, seated, log, nextId, random }, so the
// server and the tests share one rule set. viewFor() is the only place secrets are filtered (see visibility.js).
const { str, int } = require('./util');

const MAX_NODES = 40;
const MAX_CARDS = 30;
const MAX_COMMENTS = 40;
const MAX_DECK = 30;
const MAX_TABLE = 40;
const LEG_S = [5, 1800];
const CARD_S = [5, 600];

const DEFAULT_TABLE = [
  'Clouds drift overhead, one of them shaped exactly like a loaf of bread.',
  'A bird with bright red and gold feathers keeps pace with the road for a while.',
  'An abandoned wagon wheel lies in the ditch, its spokes still turning in the wind.',
  'A dog trots past with a stick twice its length and does not look back.',
  'The air smells of rain, then of fresh bread, then of nothing at all.',
  'A crow watches from a fence post and tilts its head, as if it knows something.',
  'Wildflowers grow in a neat line along the verge, almost like writing.',
  'A distant bell rings three times, then falls silent.',
];

function fresh() {
  return {
    image: null, // map picture URL (uploaded by the DM)
    onTv: false, // the TV shows the world map instead of the stage
    legSeconds: 60, // real seconds for one leg of travel
    cardSeconds: 20, // a flavour card comes up this often while travelling
    nodes: [], // { id, name, x, y, info, revealed } with x and y as fractions of the picture
    here: null, // node id the party last reached
    vote: null, // { id, candidates, votes: { charId: nodeId }, open, result, at }
    travel: null, // { to, fromPt: { x, y }, startAt, endAt, nextCardAt }
    deck: [], // DM-written cards, drawn in order before the table: { id, text, lore }
    table: DEFAULT_TABLE.map((text, i) => ({ id: 'wd' + (i + 1), text, weight: 1, on: true })), // auto cards
    cards: [], // cards that came up, newest first: { id, text, lore, loreRevealed, source, vetoed, comments, at }
  };
}

const find = (wm, id) => wm.nodes.find((n) => n.id === id);
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const counts = (v) => v.candidates.map((id) => Object.values(v.votes).filter((x) => x === id).length);
const votesFor = (v, id) => Object.values(v.votes).filter((x) => x === id).length;

// Where the party token is now. Mid-leg it sits on the straight line from its last point to the target.
function posAt(wm, now) {
  const t = wm.travel;
  const to = t && find(wm, t.to);
  if (t && to) {
    const p = Math.min(1, Math.max(0, (now - t.startAt) / (t.endAt - t.startAt)));
    return { x: t.fromPt.x + (to.x - t.fromPt.x) * p, y: t.fromPt.y + (to.y - t.fromPt.y) * p };
  }
  const here = find(wm, wm.here);
  return here ? { x: here.x, y: here.y } : null;
}

// Place or move a node. No id creates one. Returns the node, or null when refused.
function saveNode(wm, f, ctx) {
  let n = f.id ? find(wm, f.id) : null;
  if (!n) {
    if (wm.nodes.length >= MAX_NODES) return null;
    n = { id: 'n' + ctx.nextId(), name: 'New place', x: 0.5, y: 0.5, info: '', revealed: false };
    wm.nodes.push(n);
  }
  if (f.name !== undefined) n.name = str(f.name, 40) || n.name;
  if (f.x !== undefined) n.x = clamp01(f.x);
  if (f.y !== undefined) n.y = clamp01(f.y);
  if (f.info !== undefined) n.info = str(f.info, 1200);
  if (f.revealed !== undefined) n.revealed = !!f.revealed;
  return n;
}

function removeNode(wm, id) {
  wm.nodes = wm.nodes.filter((n) => n.id !== id);
  if (wm.here === id) wm.here = null;
  if (wm.travel?.to === id) wm.travel = null;
  if (wm.vote) {
    wm.vote.candidates = wm.vote.candidates.filter((x) => x !== id);
    for (const [who, node] of Object.entries(wm.vote.votes)) if (node === id) delete wm.vote.votes[who];
  }
  return true;
}

// Open a vote. With no candidates, every place except the one the party is at.
function startVote(wm, candidates, ctx) {
  const pool = Array.isArray(candidates) && candidates.length ? candidates : wm.nodes.map((n) => n.id).filter((id) => id !== wm.here);
  const ids = [...new Set(pool)].filter((id) => find(wm, id)).slice(0, 8);
  if (ids.length < 2) return false;
  wm.vote = { id: 'v' + ctx.nextId(), candidates: ids, votes: {}, open: true, result: null, at: ctx.now };
  ctx.log('narrate', `Vote: where to next? ${ids.map((id) => find(wm, id).name).join(' or ')}.`);
  return true;
}

// One vote per character; changing it is allowed while the vote is open. A strict majority of the seated
// characters sends the party to that node at once.
function castVote(wm, charId, nodeId, ctx) {
  const v = wm.vote;
  if (!charId || !v?.open || !v.candidates.includes(nodeId)) return false;
  v.votes[charId] = nodeId;
  if (votesFor(v, nodeId) * 2 > ctx.seated) go(wm, nodeId, ctx);
  return true;
}

// The DM closes the vote: the strict leader goes; a tie or no votes leaves it to the DM.
function closeVote(wm, ctx) {
  const v = wm.vote;
  if (!v?.open) return false;
  const c = counts(v);
  const top = Math.max(...c);
  const leaders = v.candidates.filter((_, i) => c[i] === top);
  if (top > 0 && leaders.length === 1) return go(wm, leaders[0], ctx);
  v.open = false;
  v.result = 'tie';
  ctx.log('narrate', 'The vote is tied. The DM decides where to go.');
  return true;
}

function cancelVote(wm) {
  wm.vote = null;
  return true;
}

// Start travelling to a node. Used by a passed vote and by the DM's override (the token keeps its place mid-leg).
function go(wm, nodeId, ctx) {
  const to = find(wm, nodeId);
  if (!to || (wm.here === nodeId && !wm.travel) || wm.travel?.to === nodeId) return false;
  const from = posAt(wm, ctx.now) || { x: to.x, y: to.y };
  if (wm.vote) { wm.vote.open = false; wm.vote.result = nodeId; }
  wm.travel = {
    to: nodeId,
    fromPt: { x: from.x, y: from.y },
    startAt: ctx.now,
    endAt: ctx.now + wm.legSeconds * 1000,
    nextCardAt: ctx.now + wm.cardSeconds * 1000,
  };
  ctx.log('narrate', `The party sets out for ${to.name}.`);
  return true;
}

// A card comes up: the next DM card if there is one, otherwise a weighted pick from the enabled table.
function drawCard(wm, ctx) {
  let src;
  if (wm.deck.length) {
    const d = wm.deck.shift();
    src = { text: d.text, lore: d.lore || null, source: 'dm' };
  } else {
    const pool = wm.table.filter((e) => e.on && e.text);
    if (!pool.length) return null;
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = (ctx.random ?? Math.random)() * total;
    const pick = pool.find((e) => (r -= e.weight) < 0) || pool[pool.length - 1];
    src = { text: pick.text, lore: null, source: 'table' };
  }
  const card = { id: 'c' + ctx.nextId(), ...src, loreRevealed: false, vetoed: false, comments: [], at: ctx.now };
  wm.cards.unshift(card);
  wm.cards.length = Math.min(wm.cards.length, MAX_CARDS);
  return card;
}

// Called on every server tick. Draws due cards during travel and arrives when the leg ends.
// Returns true when anything changed.
function tick(wm, ctx) {
  const t = wm.travel;
  if (!t) return false;
  let changed = false;
  const step = wm.cardSeconds * 1000;
  while (t.nextCardAt <= ctx.now && t.nextCardAt < t.endAt) {
    drawCard(wm, ctx);
    t.nextCardAt += step;
    changed = true;
  }
  if (ctx.now >= t.endAt) {
    const to = find(wm, t.to);
    wm.here = t.to;
    wm.travel = null;
    if (to) ctx.log('narrate', `The party reaches ${to.name}.`);
    return true;
  }
  return changed;
}

// The DM draws a card now, without waiting for travel.
function drawNow(wm, ctx) {
  return drawCard(wm, ctx) ? true : false;
}

function addDeck(wm, f, ctx) {
  const text = str(f.text, 200);
  if (!text || wm.deck.length >= MAX_DECK) return false;
  wm.deck.push({ id: 'd' + ctx.nextId(), text, lore: str(f.lore, 600) || null });
  return true;
}
function removeDeck(wm, id) {
  wm.deck = wm.deck.filter((d) => d.id !== id);
  return true;
}

// Auto table entry: upsert. `on: false` switches it off (a veto for the table).
function saveTable(wm, f, ctx) {
  const text = str(f.text, 200);
  let e = f.id ? wm.table.find((x) => x.id === f.id) : null;
  if (!e) {
    if (!text || wm.table.length >= MAX_TABLE) return false;
    e = { id: 'wt' + ctx.nextId(), text, weight: 1, on: true };
    wm.table.push(e);
  }
  if (text) e.text = text;
  if (f.weight !== undefined) e.weight = int(f.weight, 1, 10, e.weight);
  if (f.on !== undefined) e.on = !!f.on;
  return true;
}
function removeTable(wm, id) {
  wm.table = wm.table.filter((e) => e.id !== id);
  return true;
}

const findCard = (wm, id) => wm.cards.find((c) => c.id === id);
function vetoCard(wm, id, on) {
  const c = findCard(wm, id);
  if (!c) return false;
  c.vetoed = !!on;
  return true;
}
function revealLore(wm, id, on) {
  const c = findCard(wm, id);
  if (!c) return false;
  c.loreRevealed = !!on;
  return true;
}

// A phone's remark on a card. Vetoed cards take no comments.
function comment(wm, cardId, charId, who, text, ctx) {
  const c = findCard(wm, cardId);
  const t = str(text, 200);
  if (!c || c.vetoed || !t || !who || c.comments.length >= MAX_COMMENTS) return false;
  c.comments.push({ id: 'm' + ctx.nextId(), charId, who: str(who, 24), text: t, at: ctx.now });
  return true;
}

function setImage(wm, image) {
  wm.image = image ? str(image, 200) || null : null;
  return true;
}
function setTiming(wm, { legSeconds, cardSeconds } = {}) {
  if (legSeconds !== undefined) wm.legSeconds = int(legSeconds, LEG_S[0], LEG_S[1], wm.legSeconds);
  if (cardSeconds !== undefined) wm.cardSeconds = int(cardSeconds, CARD_S[0], CARD_S[1], wm.cardSeconds);
  return true;
}

// What one viewer may see. The DM sees the info of every place, the votes, the deck and the table.
// Phones and the TV see revealed info only, counts without names, cards that are not vetoed, and lore only
// once the DM reveals it. A phone also sees its own vote.
function viewFor(wm, viewer, seated = 0) {
  const dm = viewer.role === 'dm';
  const v = wm.vote;
  const out = {
    image: wm.image,
    onTv: wm.onTv,
    legSeconds: wm.legSeconds,
    cardSeconds: wm.cardSeconds,
    here: wm.here,
    nodes: wm.nodes.map((n) => ({ id: n.id, name: n.name, x: n.x, y: n.y, revealed: n.revealed, info: dm || n.revealed ? n.info : null })),
    vote: v ? {
      id: v.id,
      open: v.open,
      result: v.result,
      candidates: v.candidates,
      counts: counts(v),
      needed: Math.floor(seated / 2) + 1,
      mine: viewer.role === 'player' ? v.votes[viewer.charId] ?? null : null,
      votes: dm ? v.votes : undefined,
    } : null,
    travel: wm.travel ? { to: wm.travel.to, fromPt: wm.travel.fromPt, startAt: wm.travel.startAt, endAt: wm.travel.endAt } : null,
    cards: wm.cards.filter((c) => dm || !c.vetoed).map((c) => ({
      id: c.id,
      text: c.text,
      source: c.source,
      vetoed: c.vetoed,
      hasLore: !!c.lore,
      lore: dm || c.loreRevealed ? c.lore : null,
      loreRevealed: c.loreRevealed,
      at: c.at,
      comments: c.comments.map(({ charId, ...m }) => m),
    })),
  };
  if (dm) { out.deck = wm.deck; out.table = wm.table; }
  return out;
}

module.exports = {
  fresh, posAt, saveNode, removeNode, reveal: (wm, id, on) => { const n = find(wm, id); if (n) n.revealed = !!on; return !!n; },
  startVote, castVote, closeVote, cancelVote, go, tick, drawNow, addDeck, removeDeck, saveTable, removeTable,
  vetoCard, revealLore, comment, setImage, setTiming, viewFor, counts, DEFAULT_TABLE,
};
