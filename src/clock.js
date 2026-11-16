// Segmented time clock (Mike, Nov 16, PR V): going places uses up story clock segments (src/moments.js: Dawn,
// Day, Noon, Dusk, Night). Each road leg on the world map costs one segment, and a town place costs its own
// time once every player has confirmed the town action. The DM's segment countdowns in src/tracker.js are a
// separate thing.
//
// The TV slides its time-of-day dial in from the upper left, then moves it on (public/moments.js); the
// segment's sound plays as the dial turns, so the sound waits for the slide-in.
const hub = require('./hub');
const moments = require('./moments');

const SOUND_DELAY_MS = 900; // matches the TV dial's slide-in (public/moments.js CLOCK_IN_MS) plus a beat

// Play the current segment's sound on the TV, timed for the dial.
function sound(state, delay = SOUND_DELAY_MS) {
  const builtin = `tod_${moments.SEGMENTS[moments.segOf(state.story)]}`;
  const fire = () => hub.io?.emit('sfx', { builtin });
  if (delay > 0) setTimeout(fire, delay).unref?.(); else fire();
}

// Move the clock on by `segs` segments. Returns true when it moved. `why` goes in the log.
function spend(state, segs, why, log) {
  const n = Math.max(0, Math.floor(Number(segs) || 0));
  if (!n || !state.story) return false;
  if (!moments.advance(state.story, n)) return false;
  log?.('narrate', `${n === 1 ? 'Time passes' : `${n} segments pass`}${why ? ` (${why})` : ''}: ${moments.clockLabel(state.story)}.`);
  sound(state);
  return true;
}

module.exports = { spend, sound, SOUND_DELAY_MS };
