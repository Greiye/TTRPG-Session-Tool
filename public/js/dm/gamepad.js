// DM controller support (item 28): a gamepad drives the DM page. Works in any browser that reports the
// Standard Gamepad layout (Xbox, PlayStation, most USB pads). Buttons are edge-triggered so holding one
// does not repeat. The first Standard-layout pad found is used; other devices are ignored.
//   A/B/X/Y (0-3)   emotions 1-4 in social mode; in combat, A = next turn
//   D-pad up/down   cycle emotions (social)
//   LB / RB (4, 5)  previous / next live mode
//   Start (9)       speak the line in the dialogue box
import { $, emit, state, onState } from '../client.js';

const EMO = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
const MODES = ['exploration', 'combat', 'social'];
const USED = [0, 1, 2, 3, 4, 5, 9, 12, 13];
let prev = {};
let active = null; // index of the pad being read
let label = null;
let want = null; // emotion last asked for, so fast d-pad presses do not wait for the server

function show(text) { if (text !== label) { label = text; $('#padStatus')?.replaceChildren(...(text ? [document.createTextNode(text)] : [])); } }
function cycle(list, cur, step) { const i = list.indexOf(cur); return list[(i + step + list.length) % list.length]; }
// Button numbers only mean A/B/X/Y on the Standard Gamepad layout, so other devices (wheels, flight
// sticks, unmapped pads) are skipped rather than read with the wrong buttons.
function pick() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [];
  return { pad: pads.find((p) => p.mapping === 'standard') || null, other: pads[0] || null };
}
function setEmotion(emotion) { want = emotion; emit('dm:emotion', { emotion }); }

function tick() {
  requestAnimationFrame(tick);
  const { pad, other } = pick();
  if (!pad) {
    active = null;
    show(other ? `🎮 ${other.id.split('(')[0].trim()}: layout not supported` : '');
    return;
  }
  show(`🎮 ${pad.id.split('(')[0].trim()}`);
  const fresh = pad.index !== active;
  active = pad.index;
  // Read each button's edge once per tick; the same button can mean different things by mode.
  const e = {};
  for (const i of USED) { const now = !!pad.buttons[i]?.pressed; e[i] = now && !prev[i] && !fresh; prev[i] = now; }
  // A pad that connects with a button held (or the press that woke it) only sets the baseline.
  if (fresh) return;
  const S = state();
  if (!S) return;
  if (S.mode === 'social') {
    const cur = want && EMO.includes(want) ? want : S.social.npc.emotion;
    if (e[0]) setEmotion(EMO[0]);
    if (e[1]) setEmotion(EMO[1]);
    if (e[2]) setEmotion(EMO[2]);
    if (e[3]) setEmotion(EMO[3]);
    if (e[12]) setEmotion(cycle(EMO, cur, -1));
    if (e[13]) setEmotion(cycle(EMO, cur, 1));
  } else if (S.mode === 'combat' && e[0]) emit('dm:combat:next');
  if (e[4]) emit('dm:mode', { mode: cycle(MODES, S.mode, -1) });
  if (e[5]) emit('dm:mode', { mode: cycle(MODES, S.mode, 1) });
  if (e[9]) { const t = $('#line').value.trim(); if (t) { emit('dm:say', { text: t }); $('#line').value = ''; } }
}
// The server's emotion wins once it arrives (it may have been changed by mouse or keyboard).
onState(() => { want = null; });
requestAnimationFrame(tick);
