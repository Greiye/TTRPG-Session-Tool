// Smart bulbs (item 10): presets, colour maths, payloads, dedupe, failures, off by default. No real bulbs needed.
const { harness } = require('./helpers');
const bulbs = require('../src/bulbs');
const h = harness('bulbs');
const { ok, until } = h;

(async () => {
  // Pure helpers
  const red = bulbs.hueState({ rgb: [255, 0, 0], bri: 1 });
  ok(red.hue === 0 && red.sat === 254 && red.bri === 254 && red.on === true, 'pure red maps to Hue hue 0, full saturation');
  const blue = bulbs.hueState({ rgb: [0, 0, 255], bri: 1 });
  ok(blue.hue === 43690, 'pure blue maps to Hue hue 240 degrees');
  ok(bulbs.hueState({ rgb: [0, 0, 0], bri: 0 }).bri === 1, 'Hue brightness never drops to 0 (that would switch the bulb off)');
  ok(bulbs.colourFor('night', 'exploration') === bulbs.PRESETS.night, 'lighting preset sets the colour outside combat');
  ok(bulbs.colourFor('night', 'combat') === bulbs.MODE_MOOD.combat, 'combat mood overrides the lighting preset');
  ok(bulbs.colourFor('disco', 'social') === bulbs.PRESETS.day, 'unknown light falls back to day');
  const g = bulbs.goveeMessages({ rgb: [200, 100, 50], bri: 0.5 });
  ok(g[0].msg.cmd === 'turn' && g[1].msg.data.color.r === 100 && g[1].msg.data.color.b === 25, 'Govee gets a turn-on, then RGB scaled by brightness');

  // Targets from env
  const t = bulbs.targets({ BULBS_HUE_IP: '10.0.0.2', BULBS_HUE_USER: 'k', BULBS_HUE_LIGHTS: '1, 2', BULBS_GOVEE_IPS: '10.0.0.9' });
  ok(t.length === 3 && t[0].light === '1' && t[2].kind === 'govee', 'targets come from env: Hue lights by id, Govee by IP');
  ok(bulbs.targets({ BULBS_HUE_IP: '10.0.0.2', BULBS_HUE_LIGHTS: '1' }).length === 0, 'Hue needs both an IP and a user key');
  ok(bulbs.targets({}).length === 0, 'no env means no bulbs');

  // Sync with a fake transport
  const calls = [];
  let failNext = false;
  bulbs.setTransport(async (target, colour) => { calls.push({ target, colour }); if (failNext) throw new Error('offline'); });
  const env = { BULBS_GOVEE_IPS: '10.0.0.9,10.0.0.10' };
  const state = { bulbsOn: false, mode: 'exploration', scene: { light: 'dusk' } };
  let r = await bulbs.sync(state, { env });
  ok(r.reason === 'off' && calls.length === 0, 'off by default: nothing is sent even with bulbs configured');
  state.bulbsOn = true;
  r = await bulbs.sync(state, { env, force: true });
  ok(r.sent === 2 && calls.length === 2 && calls[0].colour === bulbs.PRESETS.dusk, 'turning on sends the lighting colour to every bulb');
  r = await bulbs.sync(state, { env });
  ok(r.reason === 'unchanged' && calls.length === 2, 'an unchanged scene sends nothing');
  state.scene.light = 'night';
  r = await bulbs.sync(state, { env });
  ok(r.sent === 2 && calls.length === 4, 'changing the lighting preset sends again');
  state.mode = 'combat';
  r = await bulbs.sync(state, { env });
  ok(calls.at(-1).colour === bulbs.MODE_MOOD.combat, 'entering combat turns the bulbs red');
  failNext = true;
  state.mode = 'social';
  const warn = console.warn; let warned = ''; console.warn = (m) => { warned += m; };
  r = await bulbs.sync(state, { env });
  console.warn = warn;
  ok(r.failed === 2 && /did not answer/.test(warned), 'offline bulbs are counted and warned about, and the game carries on');
  failNext = false;

  // Server: the switch is off by default, the DM can turn it on, phones never see the addresses
  const srv = await h.boot();
  const dm = await h.dm();
  const tv = await h.client(); tv.emit('screen:hello');
  await until(() => dm.last);
  ok(dm.last.bulbsOn === false, 'smart bulbs are off by default');
  dm.emit('dm:bulbs', { on: true });
  ok(await until(() => dm.last.bulbsOn === true), 'DM can turn smart bulbs on');
  ok(!JSON.stringify(tv.last).includes('BULBS_') && tv.last.bulbsOn === true, 'the TV gets the on/off flag and nothing about addresses or keys');
  dm.emit('dm:light', { light: 'torchlight' });
  ok(await until(() => tv.last.scene.light === 'torchlight'), 'lighting changes still reach the TV with bulbs on');
  await h.done(srv);
})().catch((e) => { console.error(e); process.exit(1); });
