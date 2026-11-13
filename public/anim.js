// Shared animation pipeline (0e). One place for:
//   - animated portraits: WebM/MP4 (with alpha) that keep playing across the frequent re-renders
//   - named one-shot animations (pop, shake, tremble, bounce, flash, slideUp) via the Web Animations API
//   - per-player animation profiles: { speed, intensity } scale every animation for that character
// Respects Settings.reducedMotion(): videos show their first frame, animations collapse to a fade.
(() => {
  const VIDEO = /\.(webm|mp4)(\?|$)/i;
  const reduced = () => !!window.Settings?.reducedMotion();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isVideo = (url) => VIDEO.test(url || '');

  // Markup for a portrait/creature image. Videos become a slot that hydrate() fills with a live element.
  function media(url, cls = '', style = '') {
    if (!isVideo(url)) return `<img class="${esc(cls)}" src="${esc(url)}" alt="" style="${esc(style)}">`;
    return `<span class="anim-slot ${esc(cls)}" data-src="${esc(url)}" style="${esc(style)}"></span>`;
  }

  // Re-renders replace innerHTML many times a second. Reusing the same <video> node (moved back in
  // synchronously) keeps playback smooth instead of restarting from frame 0 on every update.
  const pools = new WeakMap();
  function hydrate(root) {
    if (!root) return;
    if (!pools.has(root)) pools.set(root, new Map());
    const pool = pools.get(root);
    const used = new Set();
    const count = {};
    root.querySelectorAll('.anim-slot').forEach((slot) => {
      const src = slot.dataset.src;
      const cls = slot.className.replace('anim-slot', '').trim();
      const key = `${src}|${cls}|${(count[src + cls] = (count[src + cls] || 0) + 1)}`;
      let v = pool.get(key);
      if (!v) {
        v = document.createElement('video');
        Object.assign(v, { src, muted: true, loop: true, playsInline: true, preload: 'auto' });
        v.setAttribute('aria-hidden', 'true');
        pool.set(key, v);
      }
      v.className = cls;
      v.style.cssText = slot.style.cssText;
      slot.replaceWith(v);
      used.add(key);
      if (reduced()) { if (!v.paused) v.pause(); } else if (v.paused) v.play().catch(() => {});
    });
    for (const [k, v] of pool) if (!used.has(k)) { v.pause(); v.removeAttribute('src'); v.load(); pool.delete(k); }
  }

  // Keyframes are written for intensity 1; `amp` scales transforms.
  const LIB = {
    pop: (a) => ({ frames: [{ transform: 'scale(.6)', opacity: 0 }, { transform: `scale(${1 + 0.08 * a})`, opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], ms: 450, easing: 'cubic-bezier(.2,.9,.3,1.3)' }),
    shake: (a) => ({ frames: [0, -1, 1, -1, 1, 0].map((x) => ({ transform: `translateX(${x * 8 * a}px)` })), ms: 400 }),
    tremble: (a) => ({ frames: [0, 1, -1, 1, -1, 0].map((x) => ({ transform: `translate(${x * 2 * a}px, ${-x * 1.5 * a}px)` })), ms: 600 }),
    bounce: (a) => ({ frames: [{ transform: 'translateY(0)' }, { transform: `translateY(${-14 * a}px)` }, { transform: 'translateY(0)' }], ms: 500, easing: 'ease-out' }),
    flash: () => ({ frames: [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], ms: 350 }),
    slideUp: (a) => ({ frames: [{ transform: `translateY(${30 * a}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], ms: 400, easing: 'ease-out' }),
    // Entrances for later features (handouts, cards, panels). Each collapses to a fade under reduce motion.
    unfold: (a) => ({ frames: [{ transform: `perspective(700px) rotateX(${Math.min(90, 90 * a)}deg)`, opacity: 0, transformOrigin: 'top center' }, { transform: 'perspective(700px) rotateX(0deg)', opacity: 1, transformOrigin: 'top center' }], ms: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }),
    reveal: (a) => ({ frames: [{ transform: `scale(${1 - 0.12 * a})`, opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], ms: 350, easing: 'ease-out' }),
    fade: () => ({ frames: [{ opacity: 0 }, { opacity: 1 }], ms: 300, easing: 'ease-out' }),
    // TV moments (public/moments.js): scene transitions and a character entrance.
    curtain: () => ({ frames: [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], ms: 1400, easing: 'ease-in-out' }),
    wipe: () => ({ frames: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)', offset: 0.5 }, { clipPath: 'inset(0 0 0 100%)' }], ms: 1000, easing: 'ease-in-out' }),
    ink: () => ({ frames: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(150% at 50% 50%)', offset: 0.5 }, { clipPath: 'circle(0% at 50% 50%)' }], ms: 1100, easing: 'ease-in-out' }),
    slideIn: (a) => ({ frames: [{ transform: `translateX(${-60 * a}%)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], ms: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }),
  };
  const DEFAULT_PROFILE = { speed: 1, intensity: 1 };
  const profile = (who) => ({ ...DEFAULT_PROFILE, ...(who?.anim || {}) });

  // Play a named animation on an element. Returns a promise that resolves when done (or skipped).
  // opts.delay (ms) holds the start back, used by stagger(). Under reduce motion there is no delay.
  function play(el, name, who, { delay = 0 } = {}) {
    if (!el || !LIB[name] || !el.animate) return Promise.resolve();
    const p = profile(who);
    if (reduced()) return el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 150 }).finished.catch(() => {});
    const { frames, ms, easing = 'ease' } = LIB[name](p.intensity);
    return el.animate(frames, { duration: ms / p.speed, easing, delay: delay / p.speed, fill: 'backwards' }).finished.catch(() => {});
  }

  // Run one entrance on many elements in order (a hand of cards, a list of handouts). Resolves when the last one ends.
  function stagger(els, name, who, gap = 80) {
    const list = [...(els || [])];
    return Promise.all(list.map((el, i) => play(el, name, who, { delay: reduced() ? 0 : i * gap })));
  }

  // Run `name` once per distinct key (e.g. a spotlight id), not on every re-render.
  const seen = new Map();
  function once(el, key, name, who) {
    if (!el || seen.get(el.className) === key) return;
    seen.set(el.className, key);
    play(el, name, who);
  }

  window.Anim = { media, hydrate, play, stagger, once, profile, isVideo, reduced, names: Object.keys(LIB) };
})();
