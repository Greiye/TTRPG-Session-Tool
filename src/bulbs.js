// Smart bulbs (item 10): the scene's lighting preset, and the combat mood, set the colour of Philips Hue
// and Govee lights on the local network. Off by default; the DM turns it on from the DM page.
// Targets come from env vars, so no bridge key or device address is ever sent to phones or the TV:
//   BULBS_HUE_IP=192.168.1.20  BULBS_HUE_USER=<api username>  BULBS_HUE_LIGHTS=1,2,3
//   BULBS_GOVEE_IPS=192.168.1.50,192.168.1.51   (Govee LAN control must be enabled in the Govee app)
// This module never requires state.js, so it can be tested with a fake transport.
const dgram = require('dgram');

const PRESETS = {
  day: { rgb: [255, 244, 229], bri: 1 },
  dusk: { rgb: [255, 147, 60], bri: 0.7 },
  night: { rgb: [70, 90, 180], bri: 0.35 },
  dawn: { rgb: [255, 182, 150], bri: 0.8 },
  torchlight: { rgb: [255, 140, 40], bri: 0.5 },
};
// Combat overrides the lighting preset, so the room reads as a fight at a glance.
const MODE_MOOD = { combat: { rgb: [200, 30, 30], bri: 0.8 } };
const GOVEE_PORT = 4003;

function colourFor(light, mode) {
  return MODE_MOOD[mode] || PRESETS[light] || PRESETS.day;
}

// RGB (0-255) to Hue's hue/sat/bri scales: hue 0-65535, sat 0-254, bri 1-254.
function hueState({ rgb: [r, g, b], bri }) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B); const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max ? d / max : 0;
  return { on: true, hue: Math.round((h / 360) * 65535), sat: Math.round(s * 254), bri: Math.max(1, Math.round(bri * 254)), transitiontime: 10 };
}

// Govee LAN control is JSON over UDP. Govee has no brightness on colour commands, so brightness scales the RGB.
function goveeMessages({ rgb: [r, g, b], bri }) {
  const c = [r, g, b].map((v) => Math.round(v * bri));
  return [
    { msg: { cmd: 'turn', data: { value: 1 } } },
    { msg: { cmd: 'colorwc', data: { color: { r: c[0], g: c[1], b: c[2] }, colorTemInKelvin: 0 } } },
  ];
}

// Targets from env. Hue lights are addressed by id on the bridge; Govee devices by IP.
function targets(env = process.env) {
  const out = [];
  const hueIp = env.BULBS_HUE_IP; const hueUser = env.BULBS_HUE_USER;
  if (hueIp && hueUser) {
    for (const id of (env.BULBS_HUE_LIGHTS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      out.push({ kind: 'hue', ip: hueIp, user: hueUser, light: id });
    }
  }
  for (const ip of (env.BULBS_GOVEE_IPS || '').split(',').map((x) => x.trim()).filter(Boolean)) out.push({ kind: 'govee', ip });
  return out;
}

// Default transport: HTTP for Hue, UDP for Govee. Rejects on failure; sync() counts the failures.
async function defaultSend(target, colour) {
  if (target.kind === 'hue') {
    const res = await fetch(`http://${target.ip}/api/${target.user}/lights/${target.light}/state`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(hueState(colour)), signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Hue bridge answered ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body) && body.some((x) => x.error)) throw new Error(body.find((x) => x.error).error.description);
    return;
  }
  const sock = dgram.createSocket('udp4');
  try {
    for (const m of goveeMessages(colour)) {
      await new Promise((resolve, reject) => sock.send(Buffer.from(JSON.stringify(m)), GOVEE_PORT, target.ip, (e) => (e ? reject(e) : resolve())));
    }
  } finally { sock.close(); }
}

let transport = defaultSend;
let last = null; // key of the last colour sent, so an unchanged scene sends nothing
function setTransport(fn) { transport = fn; last = null; }

// Push the current colour to every target. Only sends when it is on and the colour changed (or force).
// Never throws: a bulb that is offline must not stop the game.
async function sync(state, { force = false, env } = {}) {
  if (!state.bulbsOn) return { sent: 0, failed: 0, reason: 'off' };
  const list = targets(env);
  if (!list.length) return { sent: 0, failed: 0, reason: 'no-targets' };
  const colour = colourFor(state.scene?.light, state.mode);
  const key = JSON.stringify([colour, list]);
  if (!force && key === last) return { sent: 0, failed: 0, reason: 'unchanged' };
  last = key;
  const results = await Promise.allSettled(list.map((t) => transport(t, colour)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.warn(`  Smart bulbs: ${failed.length} of ${list.length} did not answer (${failed[0].reason?.message || failed[0].reason})`);
  return { sent: list.length - failed.length, failed: failed.length, reason: 'sent' };
}

module.exports = { PRESETS, MODE_MOOD, colourFor, hueState, goveeMessages, targets, sync, setTransport, _defaultSend: defaultSend };
