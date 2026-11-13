// Weather on the TV (Phase B): rain, snow, fog or storm, set by the DM at light, medium or heavy strength.
// Drawn on a canvas inside the stage. Under reduce motion the scene is drawn once and stays still,
// and storms do not flash.
(() => {
  const RAIN_N = [0, 90, 170, 260];
  const SNOW_N = [0, 70, 130, 200];
  const FOG_N = [0, 5, 8, 11];

  function start(canvas, kind, level, reduced) {
    const ctx = canvas.getContext('2d');
    const rnd = (a, b) => a + Math.random() * (b - a);
    const size = () => {
      const w = canvas.clientWidth || 1920; const h = canvas.clientHeight || 1080;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return { w, h };
    };
    const rainN = kind === 'rain' ? RAIN_N[level] : kind === 'storm' ? RAIN_N[level] + 80 : 0;
    const drops = Array.from({ length: rainN }, () => ({ x: Math.random(), y: Math.random(), v: rnd(0.9, 1.4), len: rnd(14, 30) }));
    const flakes = Array.from({ length: kind === 'snow' ? SNOW_N[level] : 0 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(0.04, 0.09), r: rnd(1.2, 3.4), ph: rnd(0, 6.28) }));
    const banks = Array.from({ length: kind === 'fog' ? FOG_N[level] : 0 }, () => ({ x: Math.random(), y: rnd(0.35, 1), r: rnd(0.18, 0.35), v: rnd(0.004, 0.012) * (Math.random() < 0.5 ? -1 : 1) }));
    let nextFlash = performance.now() + rnd(3000, 8000);
    let flashUntil = 0;
    let raf = 0;
    let last = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
      if (kind === 'storm') {
        ctx.fillStyle = 'rgb(5 8 25 / .28)';
        ctx.fillRect(0, 0, w, h);
      }
      if (kind === 'fog') {
        for (const b of banks) {
          if (!reduced) { b.x += b.v * dt * 60; if (b.x > 1.3) b.x = -0.3; if (b.x < -0.3) b.x = 1.3; }
          const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * w);
          g.addColorStop(0, `rgb(220 226 236 / ${0.32 * level / 2})`);
          g.addColorStop(1, 'rgb(220 226 236 / 0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      }
      if (drops.length) {
        ctx.strokeStyle = kind === 'storm' ? 'rgb(190 205 255 / .42)' : 'rgb(180 200 255 / .32)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const d of drops) {
          if (!reduced) { d.y += d.v * dt * 1.4; d.x -= d.v * dt * 0.12; if (d.y > 1) { d.y = -0.05; d.x = Math.random() * 1.1; } }
          const x = d.x * w; const y = d.y * h;
          ctx.moveTo(x, y); ctx.lineTo(x - d.len * 0.25, y + d.len);
        }
        ctx.stroke();
      }
      if (flakes.length) {
        ctx.fillStyle = 'rgb(255 255 255 / .85)';
        for (const f of flakes) {
          if (!reduced) { f.y += f.v * dt; f.ph += dt; f.x += Math.sin(f.ph) * 0.0006; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); } }
          ctx.beginPath(); ctx.arc(f.x * w, f.y * h, f.r, 0, 6.283); ctx.fill();
        }
      }
      if (kind === 'storm' && !reduced) {
        if (now > nextFlash) { flashUntil = now + 140; nextFlash = now + rnd(3500, 9000); }
        if (now < flashUntil) { ctx.fillStyle = `rgb(235 240 255 / ${0.55 * (flashUntil - now) / 140})`; ctx.fillRect(0, 0, w, h); }
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  // Called from Stage on every render. The canvas is rebuilt only when the weather itself changes.
  function render(layer, weather, reduced) {
    if (!layer) return;
    const kind = weather?.kind && weather.kind !== 'none' ? weather.kind : 'none';
    const level = Math.min(3, Math.max(1, Number(weather?.intensity) || 2));
    const key = `${kind}|${level}|${!!reduced}`;
    if (layer.dataset.key === key) return;
    layer.dataset.key = key;
    layer._stop?.();
    layer._stop = null;
    layer.innerHTML = '';
    if (kind === 'none') return;
    const canvas = document.createElement('canvas');
    layer.append(canvas);
    layer._stop = start(canvas, kind, level, !!reduced);
  }

  // One weather source for the TV. The living-world state (src/living.js, state.living.weather) wins when it is
  // present; otherwise the DM's weather state (state.weather) is used. 'clear' is the living name for 'none'.
  function fromState(s) {
    const living = s?.living?.weather;
    const kind = living || s?.weather?.kind || 'none';
    return { kind: kind === 'clear' ? 'none' : kind, intensity: s?.weather?.intensity ?? 2 };
  }

  window.Weather = { render, fromState };
})();
