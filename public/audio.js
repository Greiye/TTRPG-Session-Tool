// Audio output for the table: looping background music with crossfades, one-shot SFX
// (uploaded files or synthesized built-ins). Only the page acting as the "speaker" plays.
(() => {
  const FADE_MS = 1500;
  const decks = [new Audio(), new Audio()].map((a) => { a.loop = true; a.preload = 'auto'; a.volume = 0; return a; });
  let live = 0; // index of the deck currently carrying the track
  let current = null; // url on the live deck
  let target = { url: null, playing: false, volume: 0.6 };
  let sfxVolume = 0.9;
  let ctx = null;
  let isOutput = () => true;
  let lastState = null;
  const tweens = new Map();

  // setInterval rather than rAF: a TV tab in the background would otherwise freeze fades.
  function tween(el, to, ms, done) {
    clearInterval(tweens.get(el));
    const from = el.volume;
    const t0 = performance.now();
    tweens.set(el, setInterval(() => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / ms));
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k === 1) { clearInterval(tweens.get(el)); done?.(); }
    }, 40));
  }

  function play(el) {
    el.play().catch((err) => { if (err.name === 'NotAllowedError') gate(true); });
  }

  function apply() {
    const want = isOutput(lastState) && target.playing ? target.url : null;
    const deck = decks[live];
    if (want !== current) {
      // Crossfade: fade out the live deck, bring the new track up on the other.
      const old = deck;
      tween(old, 0, FADE_MS, () => old.pause());
      current = want;
      if (!want) return;
      live = 1 - live;
      const next = decks[live];
      next.src = want;
      next.currentTime = 0;
      next.volume = 0;
      play(next);
      tween(next, target.volume, FADE_MS);
    } else if (want) {
      if (deck.paused) play(deck);
      if (Math.abs(deck.volume - target.volume) > 0.01) tween(deck, target.volume, 250);
    }
  }

  // ---------- synthesized built-in SFX (no files needed) ----------
  function audioCtx() {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx.state !== 'running') gate(true);
    return ctx;
  }
  function noise(c, secs) {
    const buf = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function env(c, peak, attack, decay) {
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * sfxVolume, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(c.destination);
    return g;
  }
  function osc(c, type, freq, out, secs) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(out);
    o.start();
    o.stop(c.currentTime + secs);
    return o;
  }
  const SYNTH = {
    thunder(c) {
      const n = noise(c, 3.5);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, c.currentTime);
      lp.frequency.exponentialRampToValueAtTime(120, c.currentTime + 3);
      n.connect(lp).connect(env(c, 1, 0.02, 3.3));
      n.start();
    },
    hit(c) {
      const n = noise(c, 0.2);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      n.connect(bp).connect(env(c, 0.8, 0.003, 0.15));
      n.start();
      const ring = env(c, 0.25, 0.003, 0.7);
      [1250, 1873, 2711].forEach((f) => osc(c, 'square', f, ring, 0.8));
    },
    magic(c) {
      const g = env(c, 0.35, 0.05, 1.4);
      [1, 1.5, 2].forEach((m) => {
        const o = osc(c, 'sine', 400 * m, g, 1.5);
        o.frequency.exponentialRampToValueAtTime(1600 * m, c.currentTime + 0.8);
      });
    },
    roar(c) {
      const g = env(c, 0.7, 0.15, 1.6);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.connect(g);
      const o = osc(c, 'sawtooth', 85, lp, 1.8);
      o.frequency.linearRampToValueAtTime(60, c.currentTime + 1.7);
      const lfo = osc(c, 'sine', 18, c.createGain(), 1.8);
      const depth = c.createGain();
      depth.gain.value = 12;
      lfo.connect(depth).connect(o.frequency);
      const n = noise(c, 1.8);
      n.connect(lp);
      n.start();
    },
    bell(c) {
      const g = env(c, 0.4, 0.005, 2.8);
      [880, 1760 * 1.01, 2640 * 0.99, 3520].forEach((f) => osc(c, 'sine', f, g, 3));
    },
  };

  function sfx({ url, builtin }) {
    if (!isOutput(lastState)) return;
    if (builtin && SYNTH[builtin]) SYNTH[builtin](audioCtx());
    else if (url) { const a = new Audio(url); a.volume = sfxVolume; play(a); }
  }

  // ---------- autoplay unlock ----------
  let gateEl = null;
  function gate(show) {
    if (!gateEl) {
      gateEl = document.createElement('button');
      gateEl.className = 'sound-gate';
      gateEl.textContent = '🔊 Click to enable sound';
      gateEl.onclick = () => {
        gate(false);
        audioCtx();
        current = null;
        decks.forEach((d) => d.pause());
        apply();
        syncMix(lastState?.audio?.mix || []);
      };
      document.body.append(gateEl);
    }
    gateEl.hidden = !show;
  }

  // ---------- soundboard ambience: several loops blended, each with its own volume ----------
  const layers = new Map(); // track id -> { el, want, leaving }
  function fadeOutLayer(id, L) {
    L.leaving = true;
    tween(L.el, 0, FADE_MS, () => { if (L.leaving) { L.el.pause(); layers.delete(id); } });
  }
  function syncMix(mix) {
    const want = isOutput(lastState) ? mix : [];
    const ids = new Set(want.map((m) => m.id));
    for (const [id, L] of layers) if (!ids.has(id) && !L.leaving) fadeOutLayer(id, L);
    for (const m of want) {
      let L = layers.get(m.id);
      if (!L) {
        const el = new Audio(m.url);
        el.loop = true;
        el.preload = 'auto';
        el.volume = 0;
        L = { el, want: m.volume, leaving: false };
        layers.set(m.id, L);
        play(el);
        tween(el, m.volume, FADE_MS);
        continue;
      }
      L.leaving = false; // a layer taken off and put back during its fade-out keeps playing
      if (L.el.paused) play(L.el);
      if (L.want !== m.volume) { L.want = m.volume; tween(L.el, m.volume, 250); }
    }
  }

  window.AudioOut = {
    init(socket, opts = {}) {
      if (opts.isOutput) isOutput = opts.isOutput;
      socket.on('state', (s) => {
        lastState = s;
        const a = s.audio;
        target = { url: a.music?.url || null, playing: a.playing, volume: a.volume };
        sfxVolume = a.sfxVolume;
        apply();
        syncMix(a.mix || []);
      });
      socket.on('sfx', sfx);
    },
    get output() { return isOutput(lastState); },
    status: () => ({ track: current, paused: decks[live].paused, volume: +decks[live].volume.toFixed(2) }),
  };
})();
