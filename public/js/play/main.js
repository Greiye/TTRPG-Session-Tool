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
import './mapview.js'; // Group Map View vote (Nov 18)
import './lobby.js'; // "You have joined the game!" on the landing page (Nov 18)
import './translate.js'; // translated NPC lines for players who know the tongue (Nov 18)

import { socket } from '../client.js';
import { me } from './identity.js';

Settings.mount();
CombatFx.listen(socket, { role: 'phone', me: () => me.charId }); // your own combat moments (public/combatfx.js)
