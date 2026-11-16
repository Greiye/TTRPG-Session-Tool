// TV moments (phase H): one overlay layer over the stage, driven by state.tv and state.story (src/moments.js).
// Every trigger carries a number n. A card plays its entrance once per n, so re-renders never replay it,
// and the first state a TV sees only records n. Open books and running epilogues still show on reload.
(function () {
  const esc = (s) => Stage.esc(s);
  const seen = {};
  let rendered = false;
  const timers = {};
  let L = null;
  let epi = { n: null, i: 0, timer: null };

  const fresh = (kind, n) => {
    if (seen[kind] === undefined) { seen[kind] = n; return false; }
    if (seen[kind] === n) return false;
    seen[kind] = n;
    return true;
  };
  const slot = (cls) => L.querySelector(`.${cls}`);

  // A card: built inside a full-screen slot, so the animation moves the card and not the centring.
  // Timed cards fade out at the end rather than vanish (Mike, Nov 16).
  const FADE_MS = 600;
  function fadeOut(el, key) {
    const card = el.firstElementChild;
    const box = card?.classList.contains('mo-card') ? card : el;
    timers[key] = 'fading';
    if (!box.animate) { el.hidden = true; delete timers[key]; return; }
    const a = box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-1.5vh) scale(.97)' }], { duration: Anim.reduced() ? 200 : FADE_MS, easing: 'ease-in', fill: 'forwards' });
    const done = () => { if (timers[key] === 'fading') { el.hidden = true; delete timers[key]; } a.cancel(); };
    a.finished.then(done, done);
  }
  function card(el, html, anim, ms = 0, key = el.className) {
    clearTimeout(timers[key]);
    el.innerHTML = `<div class="mo-card">${html}</div>`;
    el.hidden = false;
    Anim.play(el.firstElementChild, anim);
    if (ms) timers[key] = setTimeout(() => fadeOut(el, key), ms);
    else delete timers[key];
  }
  const hide = (el, key = el.className) => { clearTimeout(timers[key]); delete timers[key]; el.hidden = true; };

  function init() {
    L = document.getElementById('moments');
    L.innerHTML = `<div class="mo-trans" hidden></div>
      <div class="mo-slot mo-pause" hidden></div>
      <div class="mo-slot mo-chapter" hidden></div>
      <div class="mo-slot mo-enter" hidden></div>
      <div class="mo-slot mo-echo" hidden></div>
      <div class="mo-slot mo-relic" hidden></div>
      <div class="mo-book" hidden></div>
      <div class="mo-epi" hidden></div>
      <div class="mo-slot mo-quotes"></div>
      <div class="mo-clock" hidden></div>`;
  }

  function transition(t) {
    const el = slot('mo-trans');
    el.className = `mo-trans ${t.kind}`;
    el.hidden = false;
    Anim.play(el, t.kind === 'wipe' ? 'wipe' : t.kind === 'ink' ? 'ink' : 'curtain').then(() => { el.hidden = true; });
  }

  function pauseCard(p) {
    const el = slot('mo-pause');
    if (!p) { el.hidden = true; return; }
    // The backdrop fades to partial black first; the text fades in half a second later (moments.css).
    if (el.hidden) { el.hidden = false; el.innerHTML = '<div class="mo-card"></div>'; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
    const box = el.firstElementChild;
    const text = p.text || '';
    if (box.dataset.text !== text) { box.dataset.text = text; box.innerHTML = text ? `<p>${esc(text)}</p>` : ''; }
  }

  function book(b) {
    const el = L.querySelector('.mo-book');
    if (!b || !b.open) { el.hidden = true; return; }
    if (!fresh('book', b.n) && !el.hidden) return; // already on screen
    const KIND = { clue: '🔎', npc: '🧑', note: '📝' };
    const rows = b.entries.length
      ? b.entries.map((e) => `<li><small>${KIND[e.kind] || '📝'} ${esc(e.name)}</small>${esc(e.text)}</li>`).join('')
      : '<li><small>The book is empty</small>Phones add clues and names during play.</li>';
    el.innerHTML = `<h2>The party's journal</h2><ul>${rows}</ul>`;
    el.hidden = false;
    Anim.stagger(el.querySelectorAll('li'), 'reveal', null, 120);
  }

  // Epilogue: slides advance every few seconds; the last one ("Until next time") stays until the DM ends it.
  function epilogue(e) {
    const el = L.querySelector('.mo-epi');
    if (!e) { clearInterval(epi.timer); epi = { n: null, i: 0, timer: null }; el.hidden = true; return; }
    if (!fresh('epi', e.n) && !el.hidden) return;
    clearInterval(epi.timer);
    epi = { n: e.n, i: 0, timer: null };
    const show = (i) => {
      const s = e.slides[i];
      el.innerHTML = `<div class="mo-card">${s.kicker ? `<small>${esc(s.kicker)}</small>` : ''}${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.text ? `<p>${esc(s.text)}</p>` : ''}</div>`;
      Anim.play(el.firstElementChild, 'fade');
    };
    el.hidden = false;
    show(0);
    if (e.slides.length > 1) {
      epi.timer = setInterval(() => {
        if (epi.i >= e.slides.length - 1) { clearInterval(epi.timer); return; }
        epi.i += 1;
        show(epi.i);
      }, 6500);
    }
  }

  function quotes(list) {
    const el = L.querySelector('.mo-quotes');
    el.innerHTML = list.slice(-3).map((q) => `<blockquote>“${esc(q.text)}”${q.who ? `<cite>— ${esc(q.who)}</cite>` : ''}</blockquote>`).join('');
  }

  // Time-of-day dial (Mike, Nov 14; animation PR V, Nov 16). Each time the story clock moves, the dial slides in
  // from the upper left showing the old segment, turns to the new one (the server plays the segment's sound as it
  // turns, src/clock.js), lingers for 3 seconds, then slides back out to the upper left.
  const TOD_ICON = { dawn: '🌅', day: '☀️', noon: '🌞', dusk: '🌇', night: '🌙' };
  const TOD = ['dawn', 'day', 'noon', 'dusk', 'night'];
  const TOD_NAME = ['Dawn', 'Day', 'Noon', 'Dusk', 'Night'];
  const CLOCK_IN_MS = 700; // slide in (src/clock.js times the sound to this)
  const CLOCK_TURN_MS = 1200; // the dial turns
  const CLOCK_HOLD_MS = 3000; // lingers (Mike: 3 seconds)
  const CLOCK_OUT_MS = 700; // slides back
  const OFF = 'translate(-140%, -140%) rotate(-14deg) scale(.6)';
  const wedge = (i) => {
    const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`; };
    const a = i * 72;
    return `<path class="w-${TOD[i]}" d="M0 0 L${pt(a - 36, 46)} A46 46 0 0 1 ${pt(a + 36, 46)} Z"/><text x="${(30 * Math.sin((a * Math.PI) / 180)).toFixed(2)}" y="${(-30 * Math.cos((a * Math.PI) / 180) + 5).toFixed(2)}">${TOD_ICON[TOD[i]]}</text>`;
  };
  const dialSvg = `<svg viewBox="-52 -58 104 110" aria-hidden="true"><g class="mo-disc">${TOD.map((_, i) => wedge(i)).join('')}<circle r="8" class="hub"/></g><path class="ptr" d="M0 -46 L-6 -56 L6 -56 Z"/></svg>`;
  // The disc turns so the current segment sits under the pointer at the top; whole days add full turns.
  const angle = (day, seg) => -(((day - 1) * 5 + seg) * 72);
  let clockMoved;
  let clockRun = 0;
  function clock(story) {
    const el = L.querySelector('.mo-clock');
    if (!story) { el.hidden = true; return; }
    const first = clockMoved === undefined;
    if (story.moved === clockMoved) return;
    clockMoved = story.moved;
    if (first) return; // a TV that just loaded does not replay the last move
    const run = ++clockRun;
    const from = story.from || { day: story.day, seg: story.seg };
    const label = (day, seg) => `<small>Day ${esc(day)}</small><b>${esc(TOD_NAME[seg] || '')}</b>`;
    el.className = `mo-clock seg-${TOD[from.seg] || story.segment}`;
    el.innerHTML = `<div class="mo-dial">${dialSvg}</div><span class="mo-clock-label">${label(from.day, from.seg)}</span>`;
    el.hidden = false;
    const disc = el.querySelector('.mo-disc');
    const a0 = angle(from.day, from.seg);
    let a1 = angle(story.day, story.seg);
    if (a1 > a0) a1 = a0 - (((a0 - a1) % 360) + 360) % 360; // set back by the DM: still turn forward to it visually
    disc.style.transform = `rotate(${a0}deg)`;
    clearTimeout(timers.clock);
    const reduced = window.Anim?.reduced?.() || !el.animate;
    const later = (fn, ms) => { timers.clock = setTimeout(() => { if (run === clockRun) fn(); }, ms); };
    const turn = () => {
      const lab = el.querySelector('.mo-clock-label');
      if (reduced) disc.style.transform = `rotate(${a1}deg)`;
      else disc.animate([{ transform: `rotate(${a0}deg)` }, { transform: `rotate(${a1}deg)` }], { duration: CLOCK_TURN_MS, easing: 'cubic-bezier(.5,0,.2,1.15)', fill: 'forwards' });
      setTimeout(() => {
        if (run !== clockRun) return;
        el.className = `mo-clock seg-${story.segment}`;
        lab.innerHTML = label(story.day, story.seg);
        if (!reduced) lab.animate([{ transform: 'rotateX(90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'ease-out' });
      }, reduced ? 0 : CLOCK_TURN_MS / 2);
      later(out, (reduced ? 0 : CLOCK_TURN_MS) + CLOCK_HOLD_MS);
    };
    const out = () => {
      if (reduced) { el.hidden = true; return; }
      const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: OFF, opacity: 0 }], { duration: CLOCK_OUT_MS, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      a.finished.then(() => { if (run === clockRun) el.hidden = true; a.cancel(); }, () => {});
    };
    if (reduced) { turn(); return; }
    el.animate([{ transform: OFF, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: CLOCK_IN_MS, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    later(turn, CLOCK_IN_MS + 100);
  }

  // Story clock lights the TV: the time of day replaces the scene's light setting.
  function light(story) {
    const root = document.getElementById('stage');
    if (!root || !story) return;
    for (const l of ['day', 'dusk', 'night', 'dawn', 'torchlight']) root.classList.remove(`light-${l}`);
    root.classList.add(`light-${story.light}`);
  }

  function render(s) {
    if (!L) init();
    const tv = s.tv || {};
    // The first state only records what is already there. A kind with nothing yet counts as 0, so the
    // first chapter, entrance, echo or relic of a session still plays (it used to be skipped).
    if (!rendered) {
      rendered = true;
      for (const [k, v] of [['trans', tv.trans], ['chapter', tv.chapter], ['entrance', tv.entrance], ['echo', tv.echo], ['relic', tv.relic]]) seen[k] = v?.n ?? 0;
    }
    light(s.story);
    clock(s.story);

    if (tv.trans?.n && fresh('trans', tv.trans.n)) transition(tv.trans);
    pauseCard(tv.pause);

    if (tv.chapter && fresh('chapter', tv.chapter.n)) {
      const { title, sub } = tv.chapter;
      card(slot('mo-chapter'), `<small>Chapter</small><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}`, 'unfold', 5200);
    }

    if (tv.entrance && fresh('entrance', tv.entrance.n)) {
      const en = tv.entrance;
      const art = en.image ? `<img src="${esc(en.image)}" alt="">` : Stage.portrait('neutral', 28);
      card(slot('mo-enter'), `<div class="mo-art">${art}</div><b>${esc(en.name)}</b>`, 'slideIn', 6000);
    }

    if (tv.echo && fresh('echo', tv.echo.n)) {
      const e = tv.echo;
      card(slot('mo-echo'), `<small>An earlier choice comes back</small><p class="was">${esc(e.decision)}</p><p class="now">${esc(e.consequence)}</p>`, 'pop', 10000);
    }

    const rl = slot('mo-relic');
    if (!tv.relic) hide(rl);
    else {
      const r = (tv.relics || []).find((x) => x.id === tv.relic.id);
      if (r && fresh('relic', tv.relic.n)) card(rl, `<small>A relic is found</small><div class="mo-icon">${esc(r.icon)}</div><h2>${esc(r.name)}</h2>${r.lore ? `<p>${esc(r.lore)}</p>` : ''}`, 'unfold');
    }

    book(tv.book);
    epilogue(tv.epilogue);
    quotes(tv.quotes || []);
  }

  window.Moments = { render };
})();
