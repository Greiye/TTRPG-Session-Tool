// Player profile editor: portrait (selfie, image, or animated WebM), race, catchphrase, backstory, color.
import { socket, $, emit, state } from '../client.js';
import { me } from './identity.js';
import { show } from './nav.js';

export function openProfile() {
  const c = state()?.players.find((p) => p.id === me.charId);
  if (!c) return;
  $('#profAv').innerHTML = Stage.avatar(c, 'av-prof');
  Anim.hydrate($('#profAv'));
  $('#pPlayer').value = c.player || '';
  $('#pRace').value = c.race || '';
  $('#pCatch').value = c.catchphrase || '';
  $('#pBack').value = c.backstory || '';
  $('#pHue').value = c.hue ?? 40;
  $('#photoStatus').textContent = '';
  show('profile');
}
$('#profClose').onclick = () => show('game');
$('#profSave').onclick = () => {
  emit('player:profile', { player: $('#pPlayer').value, race: $('#pRace').value, catchphrase: $('#pCatch').value, backstory: $('#pBack').value, hue: Number($('#pHue').value) });
  show('game');
};
$('#pHue').oninput = () => { $('#profAv').firstElementChild?.style.setProperty('--hue', $('#pHue').value); };

// Phone photos are huge: center-crop to a 512px square JPEG before uploading.
function squareJpeg(file, size = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
async function uploadPhoto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  $('#photoStatus').textContent = 'Uploading…';
  try {
    // Animated WebM portraits go up as-is; the server crops and re-encodes them.
    const video = file.type === 'video/webm';
    const body = video ? file : await squareJpeg(file);
    const res = await fetch(`/api/portrait/${me.charId}`, { method: 'POST', headers: { 'content-type': video ? 'video/webm' : 'image/jpeg', 'x-socket-id': socket.id }, body });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    $('#profAv').innerHTML = Anim.media(out.url, 'av av-prof');
    Anim.hydrate($('#profAv'));
    $('#photoStatus').textContent = 'Saved!';
  } catch (err) {
    $('#photoStatus').textContent = err.message;
  }
}
$('#camIn').onchange = (e) => uploadPhoto(e.target);
$('#fileIn').onchange = (e) => uploadPhoto(e.target);
