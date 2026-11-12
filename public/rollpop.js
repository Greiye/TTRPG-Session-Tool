// Roll popup (item 5): a short animation at screen center when a roll lands. Shown on the TV and on
// the DM's own screen (secret rolls); skippable; the DM can switch it off in settings.
(function () {
  let box = null; let timer = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SHOW_MS = 1800;
  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'rollpop';
    box.hidden = true;
    box.setAttribute('role', 'status');
    document.body.append(box);
    return box;
  }
  function hide() { clearTimeout(timer); if (box) box.hidden = true; }
  // p: { who, label, dice: [{sides, value, kept}], mod, total, outcome, crit, fumble, anim }
  function show(p) {
    const el = ensure();
    const dice = (p.dice || []).map((d) => `<span class="${d.kept === false ? 'off' : ''}">${d.value}</span>`).join('');
    const tone = p.crit ? 'crit' : p.fumble ? 'fumble' : p.outcome === 'pass' ? 'pass' : p.outcome === 'fail' ? 'fail' : '';
    el.className = `rollpop ${tone} ${p.anim || 'slam'}`;
    el.innerHTML = `<div class="dice">${dice}</div>
      <div class="big">${p.total ?? ''}</div>
      <div class="what">${esc(p.who || '')}${p.label ? ` · ${esc(p.label)}` : ''}${p.outcome === 'pass' ? ' ✓' : p.outcome === 'fail' ? ' ✗' : ''}</div>`;
    el.hidden = false;
    el.onclick = hide;
    clearTimeout(timer);
    timer = setTimeout(hide, SHOW_MS + (p.crit ? 800 : 0));
  }
  window.RollPop = { show, hide };
  // Pages wire their own socket: the TV (screen.html), the DM (js/dm/rolls.js), the phone (js/play/rolls.js).
})();
