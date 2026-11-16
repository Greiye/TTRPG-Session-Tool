// Press-and-hold buttons (.hold-btn with an <i class="hold-fill"> and a <span> label). The fill grows while held.
//   fireOnRelease: false  fires as soon as the hold is full (Next turn, Generate terrain)
//   fireOnRelease: true   once full, waits for release to fire (Roll initiative)
// An early release cancels. Enter or Space can be held the same way. onPhase gets 'start' | 'cancel' | 'complete'.
export function holdButton(b, { ms, idle, holding = 'Keep holding…', ready = 'Release', fireOnRelease = false, onFire, onPhase = () => {} }) {
  if (!b) return;
  const label = b.querySelector('span');
  let t0 = 0; let raf = 0; let full = false;
  const reset = () => { cancelAnimationFrame(raf); t0 = 0; full = false; b.classList.remove('holding', 'ready'); b.style.setProperty('--hold', 0); label.textContent = idle; };
  const fire = () => { reset(); onFire(); onPhase('complete'); };
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    b.style.setProperty('--hold', k);
    if (k >= 1 && !full) {
      full = true;
      if (!fireOnRelease) return fire();
      b.classList.add('ready'); label.textContent = ready;
    }
    if (t0) raf = requestAnimationFrame(tick);
  };
  const start = () => { if (b.disabled) return; t0 = performance.now(); b.classList.add('holding'); label.textContent = holding; raf = requestAnimationFrame(tick); onPhase('start'); };
  const cancel = () => { if (t0) { reset(); onPhase('cancel'); } };
  const release = () => { if (!t0) return; if (full) fire(); else cancel(); };
  b.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; b.setPointerCapture(e.pointerId); start(); });
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', cancel);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !t0) { e.preventDefault(); start(); } });
  b.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') release(); });
  reset();
}
