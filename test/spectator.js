// Spectator visibility (item 5): what a watcher sees, and who sees their suggestions.
const assert = require('assert');
const { viewState, viewerOf } = require('../src/visibility');
const { view } = require('../src/perception');

const sp = { role: 'spectator' }, pl = { role: 'player', charId: 'a' }, tv = { role: 'screen' }, dm = { role: 'dm' };
assert.deepStrictEqual(viewerOf({ data: { spectator: true } }), sp);
assert.deepStrictEqual(viewerOf({ data: { spectator: true, charId: null } }), sp);

const sugg = { id: 1, name: 'Fan', text: 'Ask the innkeeper', vis: { to: ['*'], screen: false } };
const base = {
  room: 'ABCD', joinUrl: 'http://x', relations: { n: { a: 'ally' } },
  players: [{ id: 'a', name: 'Thorn', secret: 's', hooks: 'h', socketId: 'x', token: 't', hp: 3 }],
  combat: { enemies: [{ id: 'e', atk: 5, hp: 7 }] },
  log: [{ text: 'pub' }, { text: 'dmonly', vis: 'dm' }, { text: 'shared', vis: { to: ['*'], screen: true } }],
  suggestions: [sugg],
};
const vs = viewState(base, sp), vp = viewState(base, pl), vd = viewState(base, dm), vt = viewState(base, tv);

// No join secret, no DM-only fields, no relations.
assert(!('room' in vs) && !('joinUrl' in vs) && !('relations' in vs));
assert(!('secret' in vs.players[0]) && !('hooks' in vs.players[0]) && !('token' in vs.players[0]));
assert(!('atk' in vs.combat.enemies[0]) && vs.combat.enemies[0].hp === 7);
// Public log only: the public entry and the one shared to the TV.
assert.deepStrictEqual(vs.log.map((l) => l.text), ['pub', 'shared']);
// Suggestions: DM and players yes; spectators and the TV no.
assert(vs.suggestions.length === 0 && vt.suggestions.length === 0);
assert(vp.suggestions.length === 1 && vd.suggestions.length === 1);
assert(vp.log.length === 2 && vd.log.length === 3);

// Scene secrets: a spectator gets only the ones shown to all, like the TV.
const secrets = [{ id: 1, text: 'open', shown: 'all', noticed: [] }, { id: 2, text: 'hidden', shown: [], noticed: [] }];
assert.deepStrictEqual(view({ secrets }, sp, null, []), [{ id: 1, text: 'open' }]);

console.log('spectator: all passed');
