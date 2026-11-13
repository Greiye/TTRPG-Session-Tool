// 3D dice tray on the TV (Phase B): when a roll lands, its dice tumble across a felt tray and settle on
// the result. Plain CSS 3D (no library, no network), so it works on the table's laptop offline.
// Off when the TV's "3D dice" setting is off; under reduce motion the dice appear already showing their faces.
(() => {
  let tray = null;
  let timer = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const SHOW_MS = 3200;

  function ensure() {
    if (tray) return tray;
    tray = document.createElement('div');
    tray.className = 'dice-tray';
    tray.hidden = true;
    tray.setAttribute('role', 'status');
    tray.addEventListener('click', hide);
    document.body.append(tray);
    return tray;
  }
  function hide() { clearTimeout(timer); if (tray) tray.hidden = true; }

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
    const tone = p.crit ? 'crit' : p.fumble ? 'fumble' : p.outcome === 'pass' ? 'pass' : p.outcome === 'fail' ? 'fail' : '';
    el.className = `dice-tray ${tone}`;
    el.innerHTML = `<div class="dt-label">${esc(p.who || '')}${p.label ? ` · ${esc(p.label)}` : ''}</div>
      <div class="dt-dice">${(p.dice || []).map(cube).join('')}</div>
      <div class="dt-total">${p.total ?? ''}${p.outcome === 'pass' ? ' ✓' : p.outcome === 'fail' ? ' ✗' : ''}</div>`;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, SHOW_MS + (p.crit ? 800 : 0));
  }
  window.Dice3D = { show, hide };
})();
