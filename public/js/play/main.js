// Phone page entry. Features: join flow, in-game views, profile, logs; one shared socket.
import './identity.js';
import './join.js';
import './game.js';
import './sheet.js';
import './rolls.js';
import './messages.js';
import './combatmap.js';
import './profile.js';
import './spectate.js';
import './shops.js';
import './downtime.js';
import './journal.js';
import './logs.js';
import './camp.js';
import './socialpop.js';
import { mountTableLog } from '../msglog.js';

mountTableLog(document.getElementById('tableLog'));

Settings.mount();
