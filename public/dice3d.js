// 3D dice tray on the TV (Phase B): when a roll lands, its dice tumble across a felt tray and settle on
// the result. Plain CSS 3D (no library, no network), so it works on the table's laptop offline.
// Off when the TV's "3D dice" setting is off; under reduce motion the dice appear already showing their faces.
// Mike, Nov 16: the tray sits in the centre of the TV and fades out. Natural 20 and natural 1 share the
// roll popup's bright and dark screen moods (RollPop.mood).
(() => {
  let tray = null;
  let timer = null; let outTimer = null; let seq = 0;
  const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SHOW_MS = 3200;
  const FADE_MS = 450;

  function ensure() {
    if (tray) return tray;
    tray = document.createElement('div');
    tray.className = 'dice-tray';
    tray.hidden = true;
    tray.setAttribute('role', 'status');
    tray.addEventListener('click', () => hide());
    document.body.append(tray);
    return tray;
  }
  function hide(now = false) {
    clearTimeout(timer); clearTimeout(outTimer);
    window.RollPop?.mood(null);
    if (!tray || tray.hidden) return;
    if (now === true) { tray.hidden = true; return; }
    tray.classList.add('out');
    outTimer = setTimeout(() => { tray.hidden = true; tray.classList.remove('out'); }, FADE_MS);
  }

  // One cube. The front face shows the result; the other faces show random numbers while it tumbles.
  function cube(d) {
    const sides = Math.max(2, Number(d.sides) || 6);
    const other = () => Math.ceil(rnd(0, sides)) || 1;
    const faces = ['back', 'right', 'left', 'top', 'bottom'].map((f) => `<i class="face f-${f}">${other()}</i>`).join('');
    const tone = d.value === sides ? 'max' : d.value === 1 ? 'min' : '';
    return `<div class="die3d ${d.kept === false ? 'off' : ''} ${tone}" style="--dur:${rnd(1.1, 1.6).toFixed(2)}s;--delay:${rnd(0, 0.25).toFixed(2)}s">
      <div class="cube"><i class="face f-front">${esc(d.value)}</i>${faces}</div>
      <small>d${esc(sides)}</small></div>`;
  }

  // p: { who, label, dice: [{sides, value, kept}], total, outcome, crit, fumble } (same payload as RollPop)
  function show(p) {
    const el = ensure();
    clearTimeout(outTimer);
    const tone = p.crit ? 'crit' : p.fumble ? 'fumble' : p.outcome === 'pass' ? 'pass' : p.outcome === 'fail' ? 'fail' : '';
    el.className = `dice-tray ${tone}`;
    el.innerHTML = `${p.crit ? '<div class="dt-nat">Natural 20!</div>' : p.fumble ? '<div class="dt-nat">Natural 1</div>' : ''}
      <div class="dt-label">${esc(p.who || '')}${p.label ? ` · ${esc(p.label)}` : ''}</div>
      <div class="dt-dice">${(p.dice || []).map(cube).join('')}</div>
      <div class="dt-total">${p.total ?? ''}${p.outcome === 'pass' ? ' ✓' : p.outcome === 'fail' ? ' ✗' : ''}</div>`;
    void el.offsetWidth;
    el.hidden = false;
    const ms = SHOW_MS + (p.crit || p.fumble ? (window.RollPop?.NAT_MS || 1400) : 0);
    // The mood starts as the dice settle, so the screen lifts or dims on the result, not the throw.
    const tok = ++seq;
    if (p.crit || p.fumble) setTimeout(() => { if (tok === seq && !el.hidden && !el.classList.contains('out')) window.RollPop?.mood(p.crit ? 'crit' : 'fumble', ms - 1300); }, 1300);
    else window.RollPop?.mood(null);
    clearTimeout(timer);
    timer = setTimeout(hide, ms);
  }
  window.Dice3D = { show, hide };
})();
