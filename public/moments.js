// TV moments (phase H): one overlay layer over the stage, driven by state.tv and state.story (src/moments.js).
// Every trigger carries a number n. A card plays its entrance once per n, so re-renders never replay it,
// and the first state a TV sees only records n. Open books and running epilogues still show on reload.
(function () {
  const esc = (s) => Stage.esc(s);
  const seen = {};
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
  function card(el, html, anim, ms = 0, key = el.className) {
    el.innerHTML = `<div class="mo-card">${html}</div>`;
    el.hidden = false;
    Anim.play(el.firstElementChild, anim);
    clearTimeout(timers[key]);
    if (ms) timers[key] = setTimeout(() => { el.hidden = true; }, ms);
  }
  const hide = (el, key = el.className) => { clearTimeout(timers[key]); el.hidden = true; };

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
    if (el.hidden) { el.hidden = false; el.innerHTML = '<div class="mo-card"></div>'; Anim.play(el.firstElementChild, 'fade'); }
    const box = el.firstElementChild;
    const text = p.text || '';
    if (box.dataset.text !== text) { box.dataset.text = text; box.innerHTML = `<small>Hold</small><p>${esc(text)}</p>`; }
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

  function clock(story) {
    const el = L.querySelector('.mo-clock');
    if (!story) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${story.label} · ${story.light}`;
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
