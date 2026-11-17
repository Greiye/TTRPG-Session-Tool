// Phone page entry. Features: join flow, in-game views, profile, logs; one shared socket.
import './identity.js';
import './join.js';
import './game.js';
import './sheet.js';
import './rolls.js';
import './messages.js';
import './worldmap.js';
import './profile.js';
import './spectate.js';
import './inventory.js';
import './shops.js';
import './downtime.js';
import './journal.js';
import './lore.js';
import './logs.js';
import './world.js';
import './legends.js';
import './camp.js';
import './inspiration.js';
import './control.js';
import './socialpop.js';
import './dungeon.js';
import './town.js'; // town visits (PR V)
import './popups.js';
import './table.js';
import './spotlight.js';
import './ended.js';

import { socket } from '../client.js';
import { me } from './identity.js';

Settings.mount();
CombatFx.listen(socket, { role: 'phone', me: () => me.charId }); // your own combat moments (public/combatfx.js)
