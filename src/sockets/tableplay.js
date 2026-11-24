// Table play events (src/tableplay.js): key bank, quick rolls, battle cries, NPC memory and voices, tips, drift.
const { state, broadcast } = require('../state');
const roles = require('../roles');
const control = require('../control');
const game = require('../game');
const TP = require('../tableplay');

module.exports = function tablePlaySockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload, ack) => {
    if (!roles.can(socket.data.role, event)) return ack?.({ error: 'DM only.' });
    const r = fn(payload || {});
    broadcast();
    ack?.(r || { ok: true });
  });
  const rolled = (charId, r) => { if (r?.crit && charId) game.spotlight(charId, 'nat20'); };

  socket.on('player:ask', ({ skill } = {}, ack) => {
    const p = control.actorOf(state, socket);
    if (!p) return ack?.({ error: 'Claim a character first.' });
    const r = TP.ask(p, skill);
    broadcast();
    ack?.(r);
  });
  dm('dm:ask:answer', ({ id, no, dc, hideDc }) => {
    const charId = state.asks.find((a) => a.id === id)?.charId;
    rolled(charId, TP.answer(id, { no, dc, hideDc }));
  });
  dm('dm:quickroll', ({ id, skill }) => rolled(id, TP.quickRoll(id, skill)));
  dm('dm:keybank', ({ cls, text }) => TP.setKeys(String(cls || ''), text));
  dm('dm:cry:hide', () => TP.hideCry());
  dm('dm:tips:reset', () => { state.tipsN += 1; });
  dm('dm:tts', ({ on }) => { state.tts.on = !!on; });
  dm('dm:tts:npc', ({ name, ...f }) => TP.setVoice(name, f));
  dm('dm:backdrop:drift', ({ id, on }) => TP.setDrift(id, !!on));

  // Asked for, never broadcast: the kept moments with these NPCs go to the DM's page only.
  socket.on('dm:npc:memory', ({ npcs, pcs } = {}, ack) => {
    if (!roles.can(socket.data.role, 'dm:npc:memory')) return ack?.({ error: 'DM only.' });
    const names = (l) => (Array.isArray(l) ? l : []).map((x) => String(x || '').trim().slice(0, 40)).filter(Boolean).slice(0, 8);
    ack?.({ moments: require('../storybook').memory(names(npcs), names(pcs)) });
  });
};
