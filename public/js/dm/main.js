// DM page entry. Each feature lives in its own module; they share one socket (../client.js).
import { socket, $, emit, onState, state } from '../client.js';
import { dmKey } from './auth.js';
import './header.js';
import './modes.js';
import './exploration.js';
import './combat.js';
import './social.js';
import './characters.js';
import './codm.js';
import './data.js';
import './creatures.js';
import './saves.js';
import './rolls.js';
import './quiz.js';
import './tracker.js';
import './world.js';
import './shops.js';
import './downtime.js';
import './factions.js';
import './map.js';
import './worldmap.js';
import './gamepad.js';
import './suggestions.js';
import './plans.js';
import './journal.js';
import './camp.js';
import './moments.js';
import './table.js';


window.dmEmit = emit; // used by voice.js (classic script)
Settings.mount({ table: { get: () => state()?.settings.display || {}, set: (display) => emit('dm:settings', { display }) } });
// The laptop is the speaker only when no /screen tab is open (e.g. TV mirroring the laptop).
AudioOut.init(socket, { isOutput: (s) => !s || !s.screens });
const renderAtmo = Atmo.mount($('#atmo'), { emit, key: dmKey });

onState((s) => {
  Stage.stage($('#stage'), s);
  renderAtmo(s);
});
