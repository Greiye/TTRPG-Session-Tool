// Text contrast audit (Mike, Nov 22): finds text whose colour is too close to the colour behind it, like the
// dark Road cards on the parchment world map page (dark ink on a near-black panel). Runs inside the page.
// Every element with its own text (or a form field) is checked, hidden ones too: computed colours do not
// depend on layout, so tabs and pop-ups that are closed are still covered. The background is found by
// walking up the ancestors and blending their background colours; when an image or gradient is hit before
// an opaque colour the element is skipped (we cannot know the colour there).
// Returns [{ sel, text, fg, bg, ratio }] for every element under `min` (WCAG contrast ratio).
function contrastAudit(min = 3) {
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + under[k] * under.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const lum = (c) => {
    const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Background behind el: blend layers from el up until opaque. null = unknown (image/gradient in the way).
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
      // a texture or gradient with no solid colour under it in the same box: unknown backdrop
      else if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      if (e === document.documentElement) layers.push({ r: 255, g: 255, b: 255, a: 1 });
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  };
  const sel = (el) => {
    const bits = [];
    for (let e = el; e && e.nodeType === 1 && bits.length < 4; e = e.parentElement) {
      bits.unshift(e.id ? `#${e.id}` : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : ''));
      if (e.id) break;
    }
    return bits.join(' > ');
  };
  const SKIP = 'svg, canvas, script, style, template, noscript, option, [data-contrast-skip]';
  const found = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest(SKIP)) continue;
    const field = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|range|color|file|hidden|image)$/.test(el.type);
    const text = field ? (el.value || el.placeholder || '') : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    // Only real words count: an emoji or symbol glyph draws in its own colours, not the text colour.
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    const cs = getComputedStyle(el);
    // Text that is deliberately invisible or clipped by its own styling (transparent fill, image text) is skipped.
    if (cs.webkitTextFillColor && parse(cs.webkitTextFillColor)?.a === 0) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const fg0 = parse(cs.color);
    if (!fg0 || fg0.a === 0) continue;
    const fg = over(fg0, bg);
    const r = ratio(fg, bg);
    if (r < min) {
      const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      found.push({ sel: sel(el), text: text.slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: +r.toFixed(2) });
    }
  }
  return found;
}
module.exports = { contrastAudit };
