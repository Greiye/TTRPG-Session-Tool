// Phase I table tools: DM controls (cue deck, nudges, tension, foreshadowing, framing grants, montage,
// layouts, bonds) and the phone actions that answer them (nudge, bond, framing, montage answer).
const hub = require('../hub');
const { state, broadcast } = require('../state');
const T = require('../table');
const control = require('../control');
const bulbs = require('../bulbs');
const { saveRoster } = require('../roster');

module.exports = function tableSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}) => {
    if (socket.data.role !== 'dm') return;
    fn(payload || {});
    broadcast();
  });
  const phone = (event, fn) => socket.on(event, (payload = {}) => {
    const c = control.actorOf(state, socket);
    if (!c) return;
    fn(c, payload || {});
    broadcast();
  });

  // 1. Cue deck: one tap applies the cue, the bulbs follow the new light.
  dm('dm:cue:add', (f) => T.addCue(f));
  dm('dm:cue:remove', ({ id }) => { state.cues = state.cues.filter((c) => c.id !== id); });
  dm('dm:cue:fire', ({ id }) => {
    const cue = state.cues.find((c) => c.id === id);
    if (!cue) return;
    T.fireCue(cue);
    void bulbs.sync(state);
  });

  // 2. Secret nudge: the DM picks one character; the phone shows it privately and buzzes once.
  dm('dm:nudge', ({ charId, text }) => {
    const rec = T.sendNudge(charId, text);
    const p = rec && state.players[charId];
    if (p?.socketId) hub.io.to(p.socketId).emit('nudge', { id: rec.id });
  });
  phone('player:nudge', (c, { id, share, text }) => { if (T.answerNudge(id, c.id, !!share, text) && share) T.bump(c.id, 'talk'); });

  // 3. Spotlight balance: the DM may clear the counts at the start of a scene.
  dm('dm:balance:reset', () => { state.balance = {}; });

  // 4. Bonds: the owner sets a bond; the DM marks it called back (which clears the reminder).
  phone('player:bond', (c, { to, text }) => {
    if (T.setBond(c.id, to, text)) saveRoster();
  });
  dm('dm:bond:called', ({ charId }) => {
    if (T.callBack(charId)) saveRoster();
  });
  dm('dm:session:next', () => { state.sessionNo += 1; });

  // 5. Tension track.
  dm('dm:tension', (f) => T.setTension(f));

  // 6. Foreshadowing.
  dm('dm:foreshadow:add', ({ text }) => T.addHint(text));
  dm('dm:foreshadow:pay', ({ id, payoff }) => T.payOff(id, payoff));
  dm('dm:foreshadow:unpay', ({ id }) => T.unpay(id));
  dm('dm:foreshadow:remove', ({ id }) => T.removeHint(id));

  // 7. Scene framing: the DM grants tokens; a phone spends one; the DM can remove a detail from canon.
  dm('dm:framing:grant', ({ charId, n }) => T.grantToken(charId, n));
  phone('player:frame', (c, { text }) => { if (T.spendToken(c.id, text)) T.bump(c.id, 'acts'); });
  dm('dm:canon:remove', ({ id }) => T.removeCanon(id));

  // 8. Montage: the DM asks, phones answer, the DM reveals on the TV.
  dm('dm:montage:ask', ({ prompt }) => T.askMontage(prompt));
  phone('player:montage', (c, { text }) => { if (T.answerMontage(c.id, text)) T.bump(c.id, 'talk'); });
  dm('dm:montage:reveal', () => T.revealMontage());
  dm('dm:montage:close', () => T.closeMontage());

  // 9. One-tap TV layouts.
  dm('dm:layout', ({ name }) => T.setLayout(name));
};
