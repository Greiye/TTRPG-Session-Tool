// DM controller support (item 28): a gamepad drives the DM page. Works in any browser that reports the
// Standard Gamepad layout (Xbox, PlayStation, most USB pads). Buttons are edge-triggered so holding one
// does not repeat.
//   A/B/X/Y (0-3)   emotions 1-4 in social mode; in combat, A = next turn
//   D-pad up/down   cycle emotions (social)
//   LB / RB (4, 5)  previous / next live mode
//   Start (9)       speak the line in the dialogue box
import { $, emit, state } from '../client.js';

const EMO = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
const MODES = ['exploration', 'combat', 'social'];
const prev = {};
let connected = false;

function press(i, pad) { const now = pad.buttons[i]?.pressed; const was = prev[i]; prev[i] = !!now; return now && !was; }
function cycle(list, cur, step) { const i = list.indexOf(cur); return list[(i + step + list.length) % list.length]; }

function tick() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const pad = pads[0];
  if (pad && !connected) { connected = true; $('#padStatus')?.replaceChildren(document.createTextNode(`🎮 ${pad.id.split('(')[0].trim()}`)); }
  if (!pad) { if (connected) { connected = false; $('#padStatus')?.replaceChildren(); } requestAnimationFrame(tick); return; }
  const S = state();
  // Read each button's edge once per tick; the same button can mean different things by mode.
  const e = {};
  for (const i of [0, 1, 2, 3, 4, 5, 9, 12, 13]) e[i] = press(i, pad);
  if (S) {
    if (S.mode === 'social') {
      if (e[0]) emit('dm:emotion', { emotion: EMO[0] });
      if (e[1]) emit('dm:emotion', { emotion: EMO[1] });
      if (e[2]) emit('dm:emotion', { emotion: EMO[2] });
      if (e[3]) emit('dm:emotion', { emotion: EMO[3] });
      if (e[12]) emit('dm:emotion', { emotion: cycle(EMO, S.social.npc.emotion, -1) });
      if (e[13]) emit('dm:emotion', { emotion: cycle(EMO, S.social.npc.emotion, 1) });
    } else if (S.mode === 'combat' && e[0]) emit('dm:combat:next');
    if (e[4]) emit('dm:mode', { mode: cycle(MODES, S.mode, -1) });
    if (e[5]) emit('dm:mode', { mode: cycle(MODES, S.mode, 1) });
    if (e[9]) { const t = $('#line').value.trim(); if (t) { emit('dm:say', { text: t }); $('#line').value = ''; } }
  }
  requestAnimationFrame(tick);
}
window.addEventListener('gamepadconnected', () => { connected = false; });
requestAnimationFrame(tick);
