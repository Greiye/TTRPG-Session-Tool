// DM events for TV moments (src/moments.js). The DM drives every one; the TV only shows them.
const hub = require('../hub');
const { state, broadcast } = require('../state');
const moments = require('../moments');
const { BUILTIN_SFX } = require('../media');

module.exports = function momentSockets(socket) {
  const dm = (event, fn) => socket.on(event, (payload = {}) => {
    if (socket.data.role !== 'dm') return;
    fn(payload || {});
    broadcast();
  });
  const tv = () => state.tv;

  dm('dm:tv:transition', ({ kind }) => moments.transition(tv(), kind));
  dm('dm:tv:pause', ({ on, text }) => moments.pause(tv(), !!on, text));
  dm('dm:tv:chapter', ({ title, sub }) => moments.chapter(tv(), title, sub));
  dm('dm:tv:entrance', (f) => {
    const e = moments.entrance(tv(), f, BUILTIN_SFX);
    if (e?.sfx) hub.io.emit('sfx', { builtin: e.sfx });
  });
  dm('dm:tv:quote:add', (f) => moments.quoteAdd(tv(), f));
  dm('dm:tv:quote:remove', ({ id }) => moments.quoteRemove(tv(), id));
  dm('dm:tv:echo:plant', (f) => moments.echoPlant(tv(), f));
  dm('dm:tv:echo:fire', ({ id }) => moments.echoFire(tv(), id));
  dm('dm:tv:echo:cancel', ({ id }) => moments.echoCancel(tv(), id));
  dm('dm:tv:relic:add', (f) => moments.relicAdd(tv(), f));
  dm('dm:tv:relic:reveal', ({ id }) => moments.relicReveal(tv(), id));
  dm('dm:tv:relic:remove', ({ id }) => moments.relicRemove(tv(), id));
  dm('dm:tv:relic:close', () => moments.relicClose(tv()));
  dm('dm:tv:book', ({ open }) => moments.bookSet(tv(), !!open, state.journal));
  dm('dm:tv:epilogue:start', () => moments.epilogueStart(tv(), state));
  dm('dm:tv:epilogue:close', () => moments.epilogueEnd(tv()));
  // Story clock: the DM sets the date and time, or moves it on. Lighting follows the hour.
  dm('dm:story:set', ({ day, hour }) => { moments.setTime(state.story, day, hour); });
  dm('dm:story:advance', ({ hours }) => { moments.advance(state.story, hours); });
};
