// Atmosphere controls (backdrops, overlay effects, music, SFX), shared by the DM and co-DM pages.
(() => {
  const { esc } = Stage;
  const FX_ICON = { rain: '🌧 Rain', snow: '❄️ Snow', fog: '🌫 Fog', embers: '🔥 Embers', lightning: '⚡ Storm', darkness: '🌑 Dark', blood: '🩸 Blood', magic: '✨ Magic' };
  const SFX_ICON = { thunder: '⛈ Thunder', hit: '⚔️ Sword hit', magic: '✨ Spell', roar: '🐲 Roar', bell: '🔔 Bell', door: '🚪 Door slam', clash: '⚔️ Clash' };

  const HTML = `
    <div class="card">
      <h3>Backdrop &amp; effects <button class="btn small" data-a="fxClear">Clear effects</button></h3>
      <div class="row">
        <input data-el="bdFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" multiple class="grow">
        <button class="btn primary" data-a="upload" data-for="bdFile">Upload</button>
      </div>
      <label class="chk"><input type="checkbox" data-el="bdLive" checked> Show on TV right after upload</label>
      <div data-el="bdLib" class="bd-lib"></div>
      <div data-el="fxBtns" class="fx-btns"></div>
    </div>
    <div class="card">
      <h3>Music &amp; sound <span class="note" data-el="speaker"></span></h3>
      <div class="now-playing">
        <button class="btn" data-a="toggle" data-el="toggle">⏯</button>
        <div class="grow"><small class="muted">Now playing</small><b data-el="nowName">Nothing</b></div>
        <button class="btn" data-a="stop">■</button>
      </div>
      <label class="slider">🎵 Music <input type="range" min="0" max="1" step="0.05" data-el="vol"></label>
      <label class="slider">💥 SFX <input type="range" min="0" max="1" step="0.05" data-el="sfxVol"></label>
      <div data-el="builtins" class="fx-btns"></div>
      <div class="row">
        <input data-el="auFile" type="file" accept="audio/*" multiple class="grow">
        <button class="btn primary" data-a="upload" data-for="auFile">Upload</button>
      </div>
      <div data-el="tracks" class="tracks"></div>
    </div>
    <div data-el="board"></div>
    <div data-el="status" class="note"></div>`;

  window.Atmo = {
    mount(root, { emit, key }) {
      root.innerHTML = HTML;
      const el = (n) => root.querySelector(`[data-el="${n}"]`);
      const status = (t) => { el('status').textContent = t; };

      async function upload(input) {
        const files = [...input.files];
        if (!files.length) return input.click();
        for (const [i, f] of files.entries()) {
          status(`Uploading ${f.name} (${(f.size / 1e6).toFixed(1)} MB)…`);
          const live = el('bdLive').checked && i === files.length - 1 ? 1 : 0;
          const res = await fetch(`/api/media?name=${encodeURIComponent(f.name)}&live=${live}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream', 'x-dm-key': key() }, body: f });
          const out = await res.json().catch(() => ({ error: res.statusText }));
          if (!res.ok) return status(`${f.name}: ${out.error || res.status}`);
        }
        status(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}.`);
        input.value = '';
      }

      root.addEventListener('click', (ev) => {
        const del = ev.target.closest('[data-del]');
        if (del) { if (confirm('Delete this file?')) emit('atmo:delete', { id: del.dataset.del }); return; }
        const b = ev.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.a === 'upload') upload(el(d.for));
        else if (d.a === 'fxClear') emit('atmo:effects:clear');
        else if (d.a === 'toggle') emit('atmo:music:toggle');
        else if (d.a === 'stop') emit('atmo:music', { id: null });
        else if (d.bd !== undefined) emit('atmo:backdrop', { id: d.bd });
        else if (d.fx) emit('atmo:effect', { effect: d.fx });
        else if (d.music) emit('atmo:music', { id: d.music });
        else if (d.sfx) emit('atmo:sfx', { id: d.sfx });
      });
      el('vol').addEventListener('input', (e) => emit('atmo:volume', { music: e.target.value }));
      el('sfxVol').addEventListener('input', (e) => emit('atmo:volume', { sfx: e.target.value }));
      const renderBoard = Soundboard.mount(el('board'), { emit, key });

      let libKey = null;
      let trackKey = null;
      return function render(s, { speaker } = {}) {
        const bd = s.backdrop;
        const au = s.audio;
        const lk = `${bd.image?.id}|${bd.library.map((b) => b.id).join()}`;
        if (lk !== libKey) {
          libKey = lk;
          el('bdLib').innerHTML = `<button class="bd-item none ${bd.image ? '' : 'on'}" data-bd="">Scene theme</button>` + bd.library.map((b) => `
            <button class="bd-item ${bd.image?.id === b.id ? 'on' : ''}" data-bd="${esc(b.id)}" title="${esc(b.name)}">
              ${b.video ? `<video src="${esc(b.url)}#t=1" muted preload="metadata"></video>` : `<img src="${esc(b.url)}" alt="" loading="lazy">`}
              <span>${b.video ? '🎞 ' : ''}${esc(b.name)}</span><i class="del" data-del="${esc(b.id)}">✕</i>
            </button>`).join('');
        }
        el('fxBtns').innerHTML = s.effects.map((e) => `<button class="btn ${bd.effects.includes(e) ? 'on' : ''}" data-fx="${e}">${FX_ICON[e] || e}</button>`).join('');
        el('builtins').innerHTML = au.builtins.map((b) => `<button class="btn" data-sfx="${b}">${SFX_ICON[b] || b}</button>`).join('');

        const tk = `${au.music?.id}|${au.playing}|${au.library.map((t) => t.id).join()}`;
        if (tk !== trackKey) {
          trackKey = tk;
          el('tracks').innerHTML = au.library.map((t) => `
            <div class="track ${au.music?.id === t.id ? 'on' : ''}">
              <span class="grow">${au.music?.id === t.id && au.playing ? '🎶 ' : ''}${esc(t.name)}</span>
              <button class="btn small" data-music="${esc(t.id)}" title="Loop as background music">▶ Music</button>
              <button class="btn small" data-sfx="${esc(t.id)}" title="Play once">🔊 SFX</button>
              <button class="btn small danger" data-del="${esc(t.id)}">✕</button>
            </div>`).join('') || '<p class="note">Upload MP3/OGG/WAV/M4A tracks. Use ▶ to loop as music, 🔊 to fire once.</p>';
        }
        el('nowName').textContent = au.music ? `${au.music.name}${au.playing ? '' : ' (paused)'}` : 'Nothing';
        el('toggle').textContent = au.playing ? '⏸' : '▶';
        for (const [n, v] of [['vol', au.volume], ['sfxVol', au.sfxVolume]]) if (document.activeElement !== el(n)) el(n).value = v;
        el('speaker').textContent = speaker || (s.screens ? '🔈 plays on TV' : '🔈 plays on DM laptop');
        renderBoard(s);
      };
    },
  };
})();
