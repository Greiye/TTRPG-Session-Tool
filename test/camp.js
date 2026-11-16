// Camp (src/camp.js): open/close, votes, and who sees what.
const assert = require('assert');
const camp = require('../src/camp');
const { viewState } = require('../src/visibility');

const c = camp.fresh();
assert(!camp.vote(c, 'a', 'long', 'x'), 'no votes while camp is closed');
camp.setOpen(c, true);
assert.strictEqual(c.n, 1);
assert(camp.vote(c, 'a', 'short', 'I keep watch.'));
assert(camp.vote(c, 'a', 'long', ''), 'one vote per character, changeable');
assert(camp.vote(c, 'b', 'short', ''));
assert(!camp.vote(c, 'c', 'nap', 'x'), 'only short or long');
assert.deepStrictEqual(camp.tally(c), { short: 1, long: 1 });
// Phones see only their own vote and note; the DM sees all; the TV sees counts only.
assert.deepStrictEqual(camp.viewFor(c, { role: 'player', charId: 'a' }).mine, { vote: 'long', text: 'I keep watch.', dice: 0 });
assert.deepStrictEqual(camp.viewFor(c, { role: 'player', charId: 'b' }).mine, { vote: 'short', text: '', dice: 0 });
assert(!('votes' in camp.viewFor(c, { role: 'screen' })));
assert(camp.viewFor(c, { role: 'dm' }).votes.b === 'short');
// A new camp clears the last one's votes.
camp.setOpen(c, false);
camp.setOpen(c, true);
assert.strictEqual(c.n, 2);
assert.deepStrictEqual(c.votes, {});
// Image comes from the backdrop library item.
camp.setImage(c, { id: 'bd1', url: '/uploads/x.webm', video: true });
assert.deepStrictEqual(c.image, { url: '/uploads/x.webm', video: true });
camp.setImage(c, null);
assert.strictEqual(c.image, null);

// Through the visibility filter, the TV never gets the votes.
const base = { players: [], combat: { enemies: [] }, log: [], rolls: [], objectives: [], suggestions: [], handouts: [], downtime: null, journal: [], camp: { ...camp.fresh(), open: true, n: 1, votes: { a: 'long' }, notes: { a: 'secret plan' } } };
assert(!JSON.stringify(viewState(base, { role: 'screen' }).camp).includes('secret plan'));
assert(!JSON.stringify(viewState(base, { role: 'player', charId: 'b' }).camp).includes('secret plan'));
assert(JSON.stringify(viewState(base, { role: 'dm' }).camp).includes('secret plan'));
console.log('camp: all passed');
// Hit dice for a short rest: kept on a short vote, clamped to 20, dropped on a long vote.
{
  const d = camp.fresh();
  camp.setOpen(d, true);
  camp.vote(d, 'a', 'short', '', 3);
  assert.strictEqual(d.dice.a, 3);
  camp.vote(d, 'a', 'long', '', 3);
  assert(!('a' in d.dice));
  camp.vote(d, 'a', 'short', '', 99);
  assert.strictEqual(d.dice.a, 20);
}
// Rest applied when camp ends: majority, ties go short, no votes none, DM override wins.
{
  const e = camp.fresh();
  camp.setOpen(e, true);
  assert.strictEqual(camp.restKind(e), null);
  camp.vote(e, 'a', 'long', ''); camp.vote(e, 'b', 'short', '');
  assert.strictEqual(camp.restKind(e), 'short', 'a tie gives a short rest');
  camp.vote(e, 'c', 'long', '');
  assert.strictEqual(camp.restKind(e), 'long');
  camp.setApply(e, 'none');
  assert.strictEqual(camp.restKind(e), null);
  camp.setApply(e, 'bogus');
  assert.strictEqual(e.apply, 'auto');
  camp.setApply(e, 'short');
  camp.setOpen(e, false); camp.setOpen(e, true);
  assert.strictEqual(e.apply, 'auto', 'a new camp resets the override');
}
// Class section
{
  const { campInfo } = require('../src/rests');
  const f = campInfo({ cls: 'Fighter', level: 2, hitDice: { die: 10, used: 0 }, uses: { 'Second Wind': 1 } });
  assert(f.short.includes('Second Wind refills') && f.short.includes('Action Surge refills'));
  assert.strictEqual(f.features.find((x) => x.name === 'Second Wind').left, 0);
  assert(f.ideas.length >= 3);
  assert(campInfo({ cls: 'Warlock', level: 1, slots: { 1: { max: 1, used: 1 } } }).short.includes('Pact Magic slots refill'));
  assert.strictEqual(campInfo(null), null);
}
console.log('camp: rest and class section passed');
