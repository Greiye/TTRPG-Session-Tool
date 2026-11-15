// Phone: the 3D battle map in combat (public/js/iso3d.js). Tap a lit tile on your turn to move there
// (the path and its cost show first), or pick Attack and tap a creature. The server checks speed, reach and sight.
import { socket, onState } from '../client.js';
import { me } from './identity.js';
import { isoStage } from '../iso3d.js';

const box = document.getElementById('isoPhone');
const onMap = (s) => !!s.tokens?.[me.charId];
const iso = isoStage(box, { role: 'player', socket, charId: () => me.charId, slotSel: null, when: onMap });
window.IsoPhone = iso; // handle for debugging, like window.IsoTv on the screen
onState((s) => {
  box.hidden = !(s.mode === 'combat' && s.map && onMap(s));
  iso.update(s);
});
