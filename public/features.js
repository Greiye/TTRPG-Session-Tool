// Planning › Modules on every page (src/features.js). Features.apply(state) runs on each state update.
// While a module is off, every element marked data-feature="id" (or "id other") is hidden by one injected
// style rule, so windows drawn later are hidden too; <html> also gets a no-<id> class for stylesheets.
(function () {
  let key = null;
  const offSet = (s) => new Set((s && s.featuresOff) || []);
  const off = (s, id) => !!id && offSet(s).has(id);
  function apply(s) {
    const set = offSet(s);
    const k = [...set].sort().join();
    if (k === key) return;
    key = k;
    const html = document.documentElement;
    [...html.classList].filter((c) => c.startsWith('no-')).forEach((c) => html.classList.remove(c));
    set.forEach((id) => html.classList.add(`no-${id}`));
    let st = document.getElementById('featStyle');
    if (!st) { st = document.createElement('style'); st.id = 'featStyle'; document.head.appendChild(st); }
    st.textContent = [...set].map((id) => `[data-feature~="${id}"]{display:none !important}`).join('\n');
    document.dispatchEvent(new CustomEvent('features:change', { detail: { off: [...set] } }));
  }
  window.Features = { apply, off, on: (s, id) => !off(s, id) };
})();
