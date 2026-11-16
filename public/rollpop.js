// Roll popup (item 5): a short animation at screen center when a roll lands. Shown on the TV and on
// the DM's own screen (secret rolls); skippable; the DM can switch it off in settings.
// Mike, Nov 16: rolls sit in the middle of the screen and fade out rather than vanish. A natural 20 plays a
// bright burst and lifts the TV's brightness while it shows; a natural 1 plays a dark crack and dims it.
(function () {
  let box = null; let timer = null; let outTimer = null;
  const esc = (s) => Stage.esc(s); // shared escaper (public/stage.js)
  const SHOW_MS = 1800;
  const NAT_MS = 1400; // extra time a natural 20 or natural 1 stays up
  const FADE_MS = 450;
  function ensure() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'rollpop';
    box.hidden = true;
    box.setAttribute('role', 'status');
    document.body.append(box);
    return box;
  }

  // Full-screen mood for a natural 20 or 1: brighter or darker behind the roll. TV only; the DM's controls
  // and the phones keep their normal light. One layer, replaced by the next roll.
  let mood = null; let moodTimer = null;
  function setMood(kind, ms) {
    if (!document.body.classList.contains('tv')) return;
    if (!mood) { mood = document.createElement('div'); mood.className = 'roll-mood'; mood.hidden = true; mood.setAttribute('aria-hidden', 'true'); document.body.append(mood); }
    clearTimeout(moodTimer);
    if (!kind) { if (!mood.hidden) { mood.classList.add('out'); moodTimer = setTimeout(() => { mood.hidden = true; }, FADE_MS); } return; }
    mood.className = `roll-mood ${kind}`;
    mood.innerHTML = kind === 'crit' ? '<i class="rays"></i>' + '<b></b>'.repeat(14) : '<i class="crack"></i>';
    mood.querySelectorAll('b').forEach((b, i) => b.style.cssText = `--a:${(i / 14) * 360}deg;--d:${(i % 4) * 70}ms`);
    void mood.offsetWidth; // restart the CSS animations
    mood.hidden = false;
    moodTimer = setTimeout(() => setMood(null), ms);
  }

  // Fade out instead of disappearing; a click or the DM's skip still fades.
  function hide(now = false) {
    clearTimeout(timer); clearTimeout(outTimer);
    setMood(null);
    if (!box || box.hidden) return;
    if (now === true) { box.hidden = true; return; }
    box.classList.add('out');
    outTimer = setTimeout(() => { box.hidden = true; box.classList.remove('out'); }, FADE_MS);
  }
  // p: { who, label, dice: [{sides, value, kept}], mod, total, outcome, crit, fumble, anim }
  function show(p) {
    const el = ensure();
    clearTimeout(outTimer);
    const dice = (p.dice || []).map((d) => `<span class="${d.kept === false ? 'off' : ''}">${d.value}</span>`).join('');
    const tone = p.crit ? 'crit' : p.fumble ? 'fumble' : p.outcome === 'pass' ? 'pass' : p.outcome === 'fail' ? 'fail' : '';
    const nat = p.crit ? '<div class="rp-nat">Natural 20!</div>' : p.fumble ? '<div class="rp-nat">Natural 1</div>' : '';
    el.className = `rollpop ${tone} ${p.anim || 'slam'}`;
    el.innerHTML = `${nat}<div class="dice">${dice}</div>
      <div class="big">${p.total ?? ''}</div>
      <div class="what">${esc(p.who || '')}${p.label ? ` · ${esc(p.label)}` : ''}${p.outcome === 'pass' ? ' ✓' : p.outcome === 'fail' ? ' ✗' : ''}</div>`;
    void el.offsetWidth;
    el.hidden = false;
    el.onclick = () => hide();
    const ms = SHOW_MS + (p.crit || p.fumble ? NAT_MS : 0);
    if (p.crit || p.fumble) setMood(p.crit ? 'crit' : 'fumble', ms); else setMood(null);
    clearTimeout(timer);
    timer = setTimeout(hide, ms);
  }
  window.RollPop = { show, hide, mood: setMood, FADE_MS, NAT_MS };
  // Pages wire their own socket: the TV (screen.html), the DM (js/dm/rolls.js), the phone (js/play/rolls.js).
})();
