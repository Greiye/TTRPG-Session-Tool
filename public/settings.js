// Display settings (0c), applied on <html> as data attributes that style.css reads:
//   data-text     md | lg | xl          (text scale via --ts)
//   data-palette  default | cb | hc     (color-blind safe, high contrast)
//   data-motion   auto | reduce | full  (auto follows the OS "reduce motion" setting)
//   data-log      show | hide           (the logs on this screen; hidden by default, Mike Nov 15)
//   data-dice     on | off              (3D dice tray on the TV; TV setting only)
//   hp            num | desc            (phone hero card: 28/28, or a word such as Injured; phones only)
// Phones and the DM laptop keep their own choice in localStorage. The TV uses the table setting the DM picks.
(() => {
  const KEY = 'tavernSettings';
  const DEFAULTS = { text: 'md', palette: 'default', motion: 'auto', log: 'hide', sprite: 'auto', anim: 'on', dice: 'on', hp: 'num' };
  const OPTIONS = {
    text: [['md', 'Normal'], ['lg', 'Large'], ['xl', 'Extra large']],
    palette: [['default', 'Default'], ['cb', 'Color-blind safe'], ['hc', 'High contrast']],
    motion: [['auto', 'Follow device'], ['reduce', 'Reduce'], ['full', 'Full']],
    log: [['hide', 'Off'], ['show', 'On']],
    sprite: [['auto', 'Auto'], ['webm', 'WebM'], ['sheet', 'Sheet']],
    anim: [['on', 'Animated'], ['off', 'Static']],
    dice: [['on', 'On'], ['off', 'Off']],
    hp: [['num', 'Number'], ['desc', 'Description']],
  };
  const LABELS = { text: 'Text size', palette: 'Colors', motion: 'Motion', log: 'Show logs', sprite: 'Sprite playback', anim: 'Sprite animation', dice: '3D dice tray', hp: 'HP display' };
  const TV_ONLY = ['dice']; // the dice tray is drawn on the TV, so phones and the DM laptop don't offer it
  const PHONE_ONLY = ['hp']; // the hero card's HP reads as a number or a word on phones only
  const forMe = (k) => !TV_ONLY.includes(k) && (!PHONE_ONLY.includes(k) || document.body.classList.contains('phone'));
  const clean = (o = {}) => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, OPTIONS[k].some(([v]) => v === o[k]) ? o[k] : DEFAULTS[k]]));

  let local = DEFAULTS;
  try {
    const saved = JSON.parse(localStorage[KEY] || '{}');
    // Logs went off by default (Nov 15): a screen saved before then starts with them off once.
    if (!saved.quiet) { saved.log = 'hide'; saved.quiet = 1; localStorage[KEY] = JSON.stringify(saved); }
    local = clean(saved);
  } catch { /* private mode */ }
  let current = local;

  function apply(s) {
    current = clean(s);
    const h = document.documentElement;
    h.dataset.text = current.text;
    h.dataset.palette = current.palette;
    h.dataset.motion = current.motion;
    h.dataset.log = current.log;
    h.dataset.anim = current.anim;
    h.dataset.dice = current.dice;
  }
  apply(local);

  const reducedMotion = () => current.motion === 'reduce' || (current.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const group = (name, prefix, value) => `<fieldset><legend>${LABELS[name]}</legend><div class="seg">${OPTIONS[name].map(([v, l]) =>
    `<label><input type="radio" name="${prefix}${name}" value="${v}" ${value[name] === v ? 'checked' : ''}>${l}</label>`).join('')}</div></fieldset>`;

  // Change one setting on this device and save it. The Logs tabs use it for their show/hide switch (Mike, Nov 16).
  // Fires "settings:local" on window so other switches for the same setting can follow.
  function setLocal(name, value) {
    if (!OPTIONS[name]?.some(([v]) => v === value)) return;
    local = { ...local, [name]: value };
    try { localStorage[KEY] = JSON.stringify({ ...local, quiet: 1 }); } catch { /* ignore */ }
    apply(local);
    window.dispatchEvent(new CustomEvent('settings:local', { detail: { name, value } }));
    window.dispatchEvent(new CustomEvent('settings:change', { detail: { name } }));
  }

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
        ${Object.keys(OPTIONS).filter(forMe).map((k) => group(k, 'me-', local)).join('')}
        ${table ? `<p class="muted">TV (everyone at the table)</p>${Object.keys(OPTIONS).filter((k) => !PHONE_ONLY.includes(k)).map((k) => group(k, 'tv-', clean(table.get()))).join('')}` : ''}
        <button class="bigbtn" value="close">Done</button></form>`;
      dlg.showModal();
    };
    dlg.addEventListener('change', (e) => {
      const [scope, name] = e.target.name.split('-');
      if (scope === 'me') {
        setLocal(name, e.target.value);
      } else if (table) {
        table.set({ ...clean(table.get()), [name]: e.target.value });
      }
    });
  }

  window.Settings = { apply, applyLocal: () => apply(local), clean, reducedMotion, mount, setLocal, local: () => local, OPTIONS, get: () => current };
})();
