// Display settings (0c), applied on <html> as data attributes that style.css reads:
//   data-text     md | lg | xl          (text scale via --ts)
//   data-palette  default | cb | hc     (color-blind safe, high contrast)
//   data-motion   auto | reduce | full  (auto follows the OS "reduce motion" setting)
// Phones and the DM laptop keep their own choice in localStorage. The TV uses the table setting the DM picks.
(() => {
  const KEY = 'tavernSettings';
  const DEFAULTS = { text: 'md', palette: 'default', motion: 'auto' };
  const OPTIONS = {
    text: [['md', 'Normal'], ['lg', 'Large'], ['xl', 'Extra large']],
    palette: [['default', 'Default'], ['cb', 'Color-blind safe'], ['hc', 'High contrast']],
    motion: [['auto', 'Follow device'], ['reduce', 'Reduce'], ['full', 'Full']],
  };
  const LABELS = { text: 'Text size', palette: 'Colors', motion: 'Motion' };
  const clean = (o = {}) => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, OPTIONS[k].some(([v]) => v === o[k]) ? o[k] : DEFAULTS[k]]));

  let local = DEFAULTS;
  try { local = clean(JSON.parse(localStorage[KEY] || '{}')); } catch { /* private mode */ }
  let current = local;

  function apply(s) {
    current = clean(s);
    const h = document.documentElement;
    h.dataset.text = current.text;
    h.dataset.palette = current.palette;
    h.dataset.motion = current.motion;
  }
  apply(local);

  const reducedMotion = () => current.motion === 'reduce' || (current.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const group = (name, prefix, value) => `<fieldset><legend>${LABELS[name]}</legend><div class="seg">${OPTIONS[name].map(([v, l]) =>
    `<label><input type="radio" name="${prefix}${name}" value="${v}" ${value[name] === v ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>`;

  // Adds a ⚙ button and dialog. `table` (DM only): { get: () => settings, set: (settings) => void } for the TV.
  function mount({ table } = {}) {
    const btn = document.createElement('button');
    btn.className = 'settings-btn';
    btn.title = 'Display settings';
    btn.setAttribute('aria-label', 'Display settings');
    btn.textContent = '⚙';
    const dlg = document.createElement('dialog');
    dlg.className = 'settings-dlg';
    document.body.append(btn, dlg);
    btn.onclick = () => {
      dlg.innerHTML = `<form method="dialog"><h3>Display settings</h3>
        <p class="muted" style="margin-top:0">This device</p>
        ${Object.keys(OPTIONS).map((k) => group(k, 'me-', local)).join('')}
        ${table ? `<p class="muted">TV (everyone at the table)</p>${Object.keys(OPTIONS).map((k) => group(k, 'tv-', clean(table.get()))).join('')}` : ''}
        <button class="bigbtn" value="close">Done</button></form>`;
      dlg.showModal();
    };
    dlg.addEventListener('change', (e) => {
      const [scope, name] = e.target.name.split('-');
      if (scope === 'me') {
        local = { ...local, [name]: e.target.value };
        try { localStorage[KEY] = JSON.stringify(local); } catch { /* ignore */ }
        apply(local);
      } else if (table) {
        table.set({ ...clean(table.get()), [name]: e.target.value });
      }
    });
  }

  window.Settings = { apply, applyLocal: () => apply(local), clean, reducedMotion, mount, OPTIONS, get: () => current };
})();
