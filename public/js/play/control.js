// DM takeover on the phone and the takeover tab (src/control.js).
// A phone whose character the DM is playing gets a large banner. Its notes and sheet stay readable.
// A takeover tab shows whose character it plays and a release button.
import { socket, onState } from '../client.js';
import { me, takeoverId } from './identity.js';

const banner = document.createElement('div');
banner.className = 'dm-banner';
banner.hidden = true;
banner.setAttribute('role', 'status');
document.body.append(banner);

onState((s) => {
  if (!s) return;
  const mine = s.players.find((p) => p.id === me.charId);
  if (takeoverId) {
    const held = !!s.dmControl?.[takeoverId];
    banner.className = 'dm-banner dm-banner-tab';
    banner.innerHTML = held
      ? `<b>You are playing ${Stage.esc(mine?.name || 'this character')} as the DM.</b> <button class="btn small" id="releaseBtn">Give back</button>`
      : '<b>The DM has released this character. You can close this tab.</b>';
    banner.hidden = false;
    const rel = banner.querySelector('#releaseBtn');
    if (rel) rel.onclick = () => { socket.emit('dm:takeover:release', {}, () => window.close()); };
    return;
  }
  const controlled = !!s.dmControl?.[me.charId];
  banner.className = 'dm-banner';
  banner.innerHTML = controlled ? `<b>The DM is controlling your character.</b><span>You can still read your sheet and notes.</span>` : '';
  banner.hidden = !controlled;
});
