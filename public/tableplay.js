// TV side of table play (PR AD, Nov 24): battle cries under the roll pop-up, and NPC lines read aloud.
// Voices are the ones installed on the laptop (speechSynthesis, local voices only), so nothing leaves the room.
(() => {
  const SHOW_MS = 5000;
  let cryEl = null; let cryN; let cryTimer = null;
  function dropCry() {
    clearTimeout(cryTimer);
    if (!cryEl) return;
    const old = cryEl;
    cryEl = null;
    old.classList.add('closing');
    setTimeout(() => old.remove(), 220);
  }
  function cry(s) {
    const n = s.cry?.n || 0;
    if (cryN === undefined) { cryN = n; return; } // a cry from before this page loaded stays quiet
    if (n === cryN) return;
    cryN = n;
    dropCry(); // the DM hid it, or a newer one takes its place
    if (!n) return;
    cryEl = document.createElement('div');
    cryEl.className = 'tv-cry';
    cryEl.setAttribute('role', 'status');
    cryEl.style.setProperty('--hue', Number(s.cry.hue) || 0);
    const b = document.createElement('b');
    b.textContent = s.cry.who;
    const q = document.createElement('span');
    q.textContent = `“${s.cry.text}”`;
    cryEl.append(b, q);
    document.body.append(cryEl);
    window.Anim?.play(cryEl, 'slideUp', null);
    cryTimer = setTimeout(dropCry, SHOW_MS);
  }

  const synth = window.speechSynthesis;
  const voices = () => (synth ? synth.getVoices().filter((v) => v.localService) : []);
  // Say one line with an NPC's voice. Does nothing when the laptop has no installed voice.
  function speak(text, v = {}, volume = 1) {
    const list = voices();
    if (!synth || !list.length || !text) return false;
    synth.cancel(); // a new line cuts the last one off
    const u = new SpeechSynthesisUtterance(text);
    u.voice = list.find((x) => x.name === v.voice) || list.find((x) => x.default) || list[0];
    u.lang = u.voice.lang;
    u.pitch = v.pitch ?? 1;
    u.rate = v.rate ?? 1;
    u.volume = Math.max(0, Math.min(1, volume));
    synth.speak(u);
    return true;
  }
  const hush = () => synth?.cancel();

  // Which line to read, if any: an NPC's own words, not a player's and not a tongue the table cannot read.
  let lineN;
  function lineToSay(s) {
    const l = s.social?.line;
    const n = l?.n || 0;
    const first = lineN === undefined;
    const fresh = n !== lineN;
    lineN = n;
    if (first || !fresh || !n || !s.tts?.on || s.mode !== 'social' || s.audio?.output === 'laptop') return null;
    if (l.player || l.lang || l.scrambled) return null;
    const v = Object.hasOwn(s.tts.npcs || {}, l.speaker) ? s.tts.npcs[l.speaker] : {};
    return v.mute ? null : { text: l.text, voice: v };
  }
  function tv(s) {
    cry(s);
    if (!s.tts?.on || s.mode !== 'social') hush();
    const say = lineToSay(s);
    if (say) speak(say.text, say.voice, s.audio?.master ?? 1);
  }
  window.TablePlay = { tv, speak, hush, voices, lineToSay };
})();
