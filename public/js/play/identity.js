// Who this phone is: room code (from the QR), the character it sits in, and that seat's device token.
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { localStorage.tavernRoom = urlRoom.toUpperCase(); history.replaceState(null, '', '/play'); }

export const me = {
  get room() { return localStorage.tavernRoom || ''; },
  set room(v) { if (v) localStorage.tavernRoom = v; else localStorage.removeItem('tavernRoom'); },
  get charId() { return localStorage.tavernChar || null; },
  set charId(v) { if (v) localStorage.tavernChar = v; else localStorage.removeItem('tavernChar'); },
  tokenFor: (id) => localStorage[`tavernToken:${id}`],
  setToken: (id, t) => { localStorage[`tavernToken:${id}`] = t; },
};
