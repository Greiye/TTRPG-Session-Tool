// Soundboard: ambience layers that blend on the TV, plus one-shots. Shared by the DM and co-DM pages.
// The server holds the state (state.audio.mix); this only draws it and sends events.
(() => {
  const { esc } = Stage;
  const SFX_ICON = { thunder: '⛈ Thunder', hit: '⚔️ Sword hit', magic: '✨ Spell', roar: '🐲 Roar', bell: '🔔 Bell' };

  const HTML = `
    <div class="card soundboard">
      <h3>Soundboard <span class="note" data-el="speaker"></span></h3>
      <p class="note">Ambience layers loop and blend. Each has its own volume. Up to <span data-el="max"></span> at once.</p>
      <div data-el="layers" class="sb-layers"></div>
      <h4>One-shots</h4>
      <div data-el="oneshots" class="fx-btns"></div>
      <div class="row">
        <input data-el="file" type="file" accept="audio/*" multiple class="grow">
        <button class="btn primary" data-sb="upload">Upload sound</button>
      </div>
      <div data-el="status" class="note"></div>
    </div>`;

  window.Soundboard = {
    mount(root, { emit, key, max = 6 }) {
      root.innerHTML = HTML;
      const el = (n) => root.querySelector(`[data-el="${n}"]`);
      el('max').textContent = max;
      const status = (t) => { el('status').textContent = t; };

      async function upload() {
        const input = el('file');
        const files = [...input.files];
        if (!files.length) return input.click();
        for (const f of files) {
          status(`Uploading ${f.name}…`);
          const res = await fetch(`/api/media?name=${encodeURIComponent(f.name)}&live=0`, { method: 'POST', headers: { 'content-type': f.type || 'audio/mpeg', 'x-dm-key': key() }, body: f });
          const out = await res.json().catch(() => ({ error: res.statusText }));
          if (!res.ok) return status(`${f.name}: ${out.error || res.status}`);
        }
        status(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}.`);
        input.value = '';
      }

      root.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.sb === 'upload') upload();
        else if (d.sbToggle !== undefined) emit(d.on === '1' ? 'atmo:mix:remove' : 'atmo:mix:add', { id: d.sbToggle });
        else if (d.sbOneshot !== undefined) emit('atmo:sfx', { id: d.sbOneshot });
      });
      // Volume sliders: send on input, so the TV follows the drag.
      root.addEventListener('input', (ev) => {
        const id = ev.target.dataset.sbVol;
        if (id !== undefined) emit('atmo:mix:volume', { id, volume: ev.target.value });
      });

      let structure = null;
      return function render(s) {
        const au = s.audio;
        const mix = new Map((au.mix || []).map((m) => [m.id, m]));
        const tracks = [...(au.loops || []), ...au.library];
        // Rebuild rows only when the list changes, so a slider under the finger is not replaced mid-drag.
        const sk = `${tracks.map((t) => t.id).join()}|${[...mix.keys()].join()}`;
        if (sk !== structure) {
          structure = sk;
          el('layers').innerHTML = tracks.map((t) => {
            const on = mix.get(t.id);
            return `<div class="sb-layer ${on ? 'on' : ''}">
              <button class="btn ${on ? 'on' : ''}" data-sb-toggle="${esc(t.id)}" data-on="${on ? 1 : 0}" title="${on ? 'Stop' : 'Start'} this layer">${on ? '■' : '▶'}</button>
              <span class="grow">${t.builtin ? '🎼 ' : ''}${esc(t.name)}</span>
              <input type="range" min="0" max="1" step="0.05" data-sb-vol="${esc(t.id)}" aria-label="${esc(t.name)} volume" ${on ? '' : 'disabled'}>
            </div>`;
          }).join('') || '<p class="note">No ambience yet. Upload a sound below, or use the built-in loops.</p>';
          el('oneshots').innerHTML = (au.builtins || []).map((b) => `<button class="btn" data-sb-oneshot="${esc(b)}">${SFX_ICON[b] || b}</button>`).join('')
            + au.library.map((t) => `<button class="btn" data-sb-oneshot="${esc(t.id)}">🔊 ${esc(t.name)}</button>`).join('');
        }
        // Values and states update in place every time.
        for (const t of tracks) {
          const on = mix.get(t.id);
          const row = el('layers').querySelector(`[data-sb-vol="${CSS.escape(t.id)}"]`)?.closest('.sb-layer');
          if (!row) continue;
          row.classList.toggle('on', !!on);
          const btn = row.querySelector('[data-sb-toggle]');
          btn.textContent = on ? '■' : '▶';
          btn.dataset.on = on ? 1 : 0;
          btn.classList.toggle('on', !!on);
          const slider = row.querySelector('input');
          slider.disabled = !on;
          if (on && document.activeElement !== slider) slider.value = on.volume;
        }
        el('speaker').textContent = s.screens ? '🔈 plays on TV' : '🔈 plays on DM laptop';
      };
    },
  };
})();
