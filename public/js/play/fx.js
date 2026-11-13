// Phone feedback: a green or red flash with a tone when your health goes up or down, haptics,
// full-screen, and keeping the screen awake. The awake choice is a per-phone convenience (localStorage).
const AWAKE_KEY = 'tavernAwake';
let prevHp = null;
let lock = null;
let audio = null;

function tone(freqs, type = 'sine') {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t0 = audio.currentTime;
    freqs.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0 + i * 0.12);
      g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.2);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * 0.12);
      o.stop(t0 + i * 0.12 + 0.22);
    });
  } catch { /* no audio on this phone */ }
}

// Called on every render with the character's current health.
export function watchHp(hp, maxHp) {
  if (prevHp !== null && hp !== prevHp) {
    const up = hp > prevHp;
    const el = document.getElementById('hpFlash') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'hpFlash' });
    el.className = `hp-flash ${up ? 'up' : 'down'}`;
    void el.offsetWidth; // restart the animation
    el.classList.add('on');
    tone(up ? [523, 784] : [330, 196], up ? 'triangle' : 'sawtooth');
    navigator.vibrate?.(up ? [30, 40, 30] : [80]);
  }
  prevHp = hp;
}

export const awake = () => localStorage.getItem(AWAKE_KEY) === '1' && !!lock;

async function takeLock() {
  try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; }
  lock?.addEventListener('release', () => { lock = null; });
  document.getElementById('awakeBtn')?.setAttribute('aria-pressed', String(!!lock));
}

export async function toggleAwake() {
  if (lock) { lock.release(); lock = null; localStorage.setItem(AWAKE_KEY, '0'); }
  else { localStorage.setItem(AWAKE_KEY, '1'); await takeLock(); }
  document.getElementById('awakeBtn')?.setAttribute('aria-pressed', String(!!lock));
}

// Wake locks are released when the tab is hidden; take it again when the phone comes back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && localStorage.getItem(AWAKE_KEY) === '1' && !lock) takeLock();
});

export function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// Start awake again if this phone chose it last time.
if (localStorage.getItem(AWAKE_KEY) === "1") takeLock();
