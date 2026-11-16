// DM events for TV moments (src/moments.js). The DM drives every one; the TV only shows them.
const hub = require('../hub');
const { state, broadcast, log } = require('../state');
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
  dm('dm:tv:chapter', ({ title, sub }) => {
    const c = moments.chapter(tv(), title, sub);
    if (c) log('narrate', moments.chapterLine(c), { tone: 'chapter' });
  });
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
  dm('dm:tv:relic:reveal', ({ id }) => { require('../popups').only(state, 'relic'); moments.relicReveal(tv(), id); });
  dm('dm:tv:relic:remove', ({ id }) => moments.relicRemove(tv(), id));
  dm('dm:tv:relic:close', () => moments.relicClose(tv()));
  dm('dm:tv:book', ({ open }) => { if (open) require('../popups').only(state, 'book'); moments.bookSet(tv(), !!open, state.journal); });
  dm('dm:tv:epilogue:start', () => moments.epilogueStart(tv(), state));
  dm('dm:tv:epilogue:close', () => moments.epilogueEnd(tv()));
  // Story clock: five segments (Dawn, Day, Noon, Dusk, Night). Each change plays that segment's sound on
  // the TV (public/audio.js tod_* synths) and the TV shows the day and segment for a few seconds.
  // The sound waits for the TV dial to slide in (src/clock.js).
  const moved = (ok) => { if (ok) require('../clock').sound(state); };
  dm('dm:story:set', ({ day, seg }) => moved(moments.setTime(state.story, day ?? state.story.day, seg)));
  dm('dm:story:advance', ({ segs }) => moved(moments.advance(state.story, segs ?? 1)));
};
