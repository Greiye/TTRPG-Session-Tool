// Phase I table tools (src/table.js): cues, nudges, balance, bonds, tension, foreshadowing, framing, montage, layouts.
const assert = require('assert');
const { state } = require('../src/state');
const { viewState } = require('../src/visibility');
const T = require('../src/table');
const { roster } = require('../src/roster');

// Two characters at the table.
state.players = {
  a: { id: 'a', name: 'Ash', socketId: null },
  b: { id: 'b', name: 'Bren', socketId: null },
  c: { id: 'c', name: 'Cass', socketId: null },
};
roster.a = state.players.a;
roster.b = state.players.b;
roster.c = state.players.c;

// 1. Cue deck: limits, validation, and one fire applies every part.
const cue = T.addCue({ name: 'Ambush', mode: 'combat', light: 'night', backdrop: 'bd1', layers: ['rain', 'x'.repeat(200)], sfx: 'door', handout: { title: 'Note', text: 'Blood on the door.' } });
assert.strictEqual(cue.mode, 'combat');
assert.strictEqual(cue.layers.length, 2);
assert.strictEqual(T.addCue({ mode: 'party', light: 'noon' }).mode, null, 'unknown mode dropped');
assert.strictEqual(T.addCue({ mode: 'party', light: 'noon' }).light, null, 'unknown light dropped');
state.backdrop.library = [{ id: 'bd1', url: '/u/bd1.png' }];
state.audio.loops = [{ id: 'rain', url: '/u/rain.ogg', name: 'Rain' }];
state.audio.library = [];
const did = T.fireCue(cue);
assert.deepStrictEqual(did, ['mode', 'light', 'backdrop', 'layers', 'sfx', 'handout']);
assert.strictEqual(state.mode, 'combat');
assert.strictEqual(state.backdrop.image.id, 'bd1');
assert.deepStrictEqual(state.audio.mix.map((m) => m.id), ['rain']);
assert.strictEqual(state.handouts.at(-1).title, 'Note');

// 2. Secret nudge: only the target gets it; the answer is recorded; sharing logs the player's words.
const n = T.sendNudge('a', 'Your father is in the crowd.');
assert(n && n.status === 'sent');
assert(!T.sendNudge('zzz', 'nobody'), 'unknown character gets nothing');
assert.strictEqual(viewState({ ...baseState(), nudges: state.nudges }, { role: 'player', charId: 'b' }).myNudges.length, 0);
assert.strictEqual(viewState({ ...baseState(), nudges: state.nudges }, { role: 'player', charId: 'a' }).myNudges.length, 1);
assert(!('nudges' in viewState(baseState(), { role: 'screen' })), 'the TV never sees nudges');
assert(T.answerNudge(n.id, 'a', false), 'keeping it is allowed');
assert.strictEqual(state.nudges.find((x) => x.id === n.id).status, 'kept');
assert(!T.answerNudge(n.id, 'a', true), 'an answer is final');
const n2 = T.sendNudge('a', 'Check the locket.');
const logBefore = state.log.length;
assert(T.answerNudge(n2.id, 'a', true, 'The locket is cold.'));
assert.strictEqual(state.log.at(-1).text, 'Ash shares: “The locket is cold.”');
assert(state.log.length > logBefore);
assert(!T.answerNudge(n2.id, 'b', true), 'another character cannot answer it');

// 3. Balance: counts and the quiet flag.
for (let i = 0; i < 6; i++) T.bump('a', 'talk');
for (let i = 0; i < 4; i++) T.bump('b', 'acts');
T.bump('zzz', 'acts'); // unknown: ignored
const rows = T.balanceView();
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
assert.strictEqual(byId.a.total, 6);
assert.strictEqual(byId.c.total, 0);
assert(byId.c.quiet, 'a silent character is flagged quiet');
assert(!byId.a.quiet);
assert(!viewState(baseState(), { role: 'player', charId: 'a' }).balance, 'the balance is DM only');

// 4. Bonds: set, reminder after two sessions, call back clears it.
assert(T.setBond('a', 'b', 'Ash owes Bren a life debt.'));
assert(!T.setBond('a', 'a', 'self'), 'no bond with yourself');
assert(!T.setBond('a', 'nobody', 'x'));
assert.strictEqual(roster.a.bond.to, 'b');
assert.strictEqual(T.dueBonds().length, 0, 'fresh bond is not due');
state.sessionNo += T.BOND_GAP;
assert.strictEqual(T.dueBonds()[0].charId, 'a', 'due after the gap');
assert.strictEqual(T.dueBonds()[0].toName, 'Bren');
assert(T.callBack('a'));
assert.strictEqual(T.dueBonds().length, 0, 'calling back clears the reminder');
// Bonds are private to the owner and the DM.
const bondSeen = (v) => JSON.stringify(viewState({ ...baseState(), players: [{ ...state.players.a, bond: roster.a.bond }] }, v).players);
assert(bondSeen({ role: 'player', charId: 'a' }).includes('life debt'));
assert(!bondSeen({ role: 'player', charId: 'b' }).includes('life debt'));
assert(!bondSeen({ role: 'screen' }).includes('life debt'));
assert(bondSeen({ role: 'dm' }).includes('life debt'));

// 5. Tension: clamped 0 to 10, label defaults.
T.setTension({ value: 14, label: 'Chase', on: true });
assert.deepStrictEqual({ v: state.tension.value, l: state.tension.label, on: state.tension.on }, { v: 10, l: 'Chase', on: true });
T.setTension({ value: -3, label: '' });
assert.strictEqual(state.tension.value, 0);
assert.strictEqual(state.tension.label, 'Tension');

// 6. Foreshadowing: hints are DM only; payoffs form the recap for everyone.
const h1 = T.addHint('The stranger knows your name.');
const h2 = T.addHint('The mill wheel turns backwards.');
assert(T.payOff(h1.id, 'He is the king’s spy.'));
const recapDm = T.recapFor(state.foreshadow, { role: 'dm' });
const recapTv = T.recapFor(state.foreshadow, { role: 'screen' });
assert.strictEqual(recapDm.length, 2);
assert.deepStrictEqual(recapTv.map((h) => h.text), ['The stranger knows your name.']);
assert(!JSON.stringify(viewState(baseState(), { role: 'screen' }).foreshadow).includes('mill wheel'), 'unpaid hints stay with the DM');
assert(T.unpay(h1.id));
assert.strictEqual(T.recapFor(state.foreshadow, { role: 'screen' }).length, 0);
T.removeHint(h2.id);
assert.strictEqual(state.foreshadow.length, 1);

// 7. Scene framing: tokens are granted, spent for one detail, and added to canon.
assert(!T.spendToken('a', 'The door is open.'), 'no token, no framing');
assert(T.grantToken('a', 2));
assert.strictEqual(state.framing.a, 2);
const canon = T.spendToken('a', 'The door is already unlocked.');
assert.strictEqual(canon.by, 'Ash');
assert.strictEqual(state.framing.a, 1);
assert.strictEqual(viewState(baseState(), { role: 'player', charId: 'b' }).framingTokens, 0);
assert.strictEqual(viewState(baseState(), { role: 'player', charId: 'a' }).framingTokens, 0, 'base has no framing tokens here');
assert(JSON.stringify(viewState({ ...baseState(), framing: { a: 3 } }, { role: 'player', charId: 'a' }).framingTokens) === '3');
assert(!('framing' in viewState({ ...baseState(), framing: { a: 3 } }, { role: 'screen' })));
assert(JSON.stringify(viewState({ ...baseState(), canon: state.canon }, { role: 'screen' }).canon).includes('unlocked'), 'canon is public');
T.removeCanon(canon.id);
assert.strictEqual(state.canon.length, 0);

// 8. Montage: answers stay hidden until the reveal; phones see only their own before it.
assert(!T.answerMontage('a', 'too early'), 'no answers before a prompt is asked');
assert(T.askMontage('What did you dream last night?'));
assert(T.answerMontage('a', 'Rain on a red door.'));
assert(T.answerMontage('b', 'A bell.'));
assert(!T.answerMontage('zzz', 'ghost'), 'unknown character cannot answer');
const hidden = T.montageView(state.montage, { role: 'screen' });
assert.strictEqual(hidden.count, 2);
assert(!('answers' in hidden) && !JSON.stringify(hidden).includes('red door'), 'the TV holds the answers until the reveal');
assert.strictEqual(T.montageView(state.montage, { role: 'player', charId: 'b' }).mine, 'A bell.');
assert(!JSON.stringify(T.montageView(state.montage, { role: 'player', charId: 'b' })).includes('red door'));
assert(T.revealMontage());
assert(!T.answerMontage('c', 'late'), 'no answers after the reveal');
const shown = T.montageView(state.montage, { role: 'screen' });
assert.strictEqual(shown.answers.length, 2);
assert(shown.answers.some((x) => x.name === 'Ash' && x.text === 'Rain on a red door.'));
T.closeMontage();
assert.strictEqual(state.montage.prompt, '');

// 9. Layouts: known names only.
T.setLayout('combat');
assert.strictEqual(state.stageLayout, 'combat');
T.setLayout('disco');
assert.strictEqual(state.stageLayout, 'combat');

// Fresh fields fill in on old saves.
const old = { cues: undefined, tension: { value: 3 } };
T.ensure(old);
assert.strictEqual(old.tension.value, 3);
assert.strictEqual(old.tension.label, 'Dread');
assert.deepStrictEqual(old.cues, []);

console.log('table: all passed');

function baseState() {
  return {
    players: [], combat: { enemies: [] }, log: [], rolls: [], objectives: [], suggestions: [], handouts: [], journal: [],
    downtime: null, camp: null, nudges: [], balance: {}, framing: {}, canon: [], foreshadow: [], montage: state.montage,
    tension: state.tension, sessionNo: state.sessionNo, stageLayout: state.stageLayout, mode: 'social', scene: { poi: [] }, system: 'dnd5e',
  };
}
