// DM page entry. Each feature lives in its own module; they share one socket (../client.js).
import { socket, $, emit, onState, state } from '../client.js';
import { dmKey, masterRole } from './auth.js';
import './header.js';
import './modes.js';
import './fold.js';
import './exploration.js';
import './dungeon.js';
import './combat.js';
import './social.js';
import './characters.js';
import './codm.js';
import './data.js';
import './creatures.js';
import './saves.js';
import './rolls.js';
import './quiz.js';
import './puzzle.js';
import './web.js';
import './tracker.js';
import './world.js';
import './shops.js';
import './downtime.js';
import './factions.js';
import './living.js';
import './map.js';
import './worldmap.js';
import './weather.js';
import './gamepad.js';
import './suggestions.js';
import './journal.js';
import './camp.js';
import './inspiration.js';
import './legends.js';
import './moments.js';
import './table.js';
import './chronicle.js';
import './dock.js';
import './endsession.js';
import { isoStage } from '../iso3d.js';


window.dmEmit = emit; // used by voice.js (classic script)
Settings.mount({ table: { get: () => state()?.settings.display || {}, set: (display) => emit('dm:settings', { display }) } });
// The laptop is the speaker only when no /screen tab is open (e.g. TV mirroring the laptop).
AudioOut.init(socket, { isOutput: (s) => !masterRole() && (!s || !s.screens) }); // never a helper's phone
const renderAtmo = Atmo.mount($('#atmo'), { emit, key: dmKey });
// The 3D battle map sits over the stage's main area in combat (public/js/iso3d.js).
const iso = isoStage($('#stage'), { role: 'dm', socket, emit, slotSel: '.stage-main' });
window.IsoDm = iso; // handle for debugging

// The preview mirrors the TV: the world map (with the dungeon pop-up over it) while it is on the TV in exploration.
onState((s) => {
  if (s.worldMap?.onTv && !s.shopPop && window.WorldMap) WorldMap.tv($('#stage'), s, { dm: true });
  else Stage.stage($('#stage'), s);
  iso.update(s);
  renderAtmo(s);
});
