// Who this phone is: room code (from the QR), the character it sits in, and that seat's device token.
// A takeover tab (opened from the DM screen) plays one character without saving a seat on this device.
export const takeoverId = new URLSearchParams(location.search).get('takeover');
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { localStorage.tavernRoom = urlRoom.toUpperCase(); history.replaceState(null, '', '/play'); }

export const me = {
  get room() { return localStorage.tavernRoom || ''; },
  set room(v) { if (v) localStorage.tavernRoom = v; else localStorage.removeItem('tavernRoom'); },
  get charId() { return takeoverId || localStorage.tavernChar || null; },
  set charId(v) { if (takeoverId) return; if (v) localStorage.tavernChar = v; else localStorage.removeItem('tavernChar'); },
  tokenFor: (id) => localStorage[`tavernToken:${id}`],
  setToken: (id, t) => { localStorage[`tavernToken:${id}`] = t; },
};
