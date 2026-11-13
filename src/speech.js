// Phase D speech: lines in a language (scrambled for viewers who do not know the tongue, glossed by the DM),
// NPC speech styles (a font and colour for their lines on the TV) and the session intro card.
const { state, broadcast } = require('./state');
const { str } = require('./util');

const FONTS = ['serif', 'sans', 'mono', 'script', 'runic'];
const COLORS = ['ivory', 'gold', 'crimson', 'teal', 'violet', 'moss', 'frost'];
const GLYPHS = '⌘⟁⟡⌬⏃⎍⍾⌖⍟⏁⎔⋈⌗⍜⎊';
const INTRO_MS = 12000;
let introTimer = null;

// Styles come from fixed lists, never free text: the DM picks a name and the CSS does the rest.
function styleFor(f) {
  if (!f || typeof f !== 'object') return null;
  return { font: FONTS.includes(f.font) ? f.font : 'serif', color: COLORS.includes(f.color) ? f.color : 'ivory' };
}

// Same text, same glyphs every time, so a player who hears a line twice sees it twice the same way.
function scramble(text) {
  let h = 2166136261;
  return [...String(text)].map((ch) => {
    if (/\s/.test(ch)) return ch;
    h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return GLYPHS[h % GLYPHS.length];
  }).join('');
}

// A viewer reads a line in a tongue if the DM glossed it for them (or for everyone), or their character knows it.
function understands(line, viewer, base) {
  if (!line?.lang || viewer.role === 'dm') return true;
  const gloss = Array.isArray(line.gloss) ? line.gloss : [];
  if (gloss.includes('*')) return true;
  if (viewer.role === 'player' && gloss.includes(viewer.charId)) return true;
  const c = viewer.role === 'player' ? base.players.find((p) => p.id === viewer.charId) : null;
  return !!c && (c.languages || []).includes(line.lang);
}
function lineFor(line, viewer, base) {
  if (!line || understands(line, viewer, base)) return line;
  return { ...line, text: scramble(line.text), scrambled: true };
}

// DM gloss: one character (or '*' for everyone) can read the current line.
function gloss(line, to, on) {
  if (!line?.lang) return;
  let list = (Array.isArray(line.gloss) ? line.gloss : []).filter((x) => x !== '*');
  if (to === '*') list = on ? ['*'] : [];
  else if (on) list = [...new Set([...list, to])];
  else list = list.filter((x) => x !== to);
  line.gloss = list;
}

// Session intro card: campaign name, session number and up to three recap lines, shown on the TV.
function introFrom(f = {}) {
  return {
    campaign: str(f.campaign, 60),
    session: Math.max(1, Math.min(999, Math.round(Number(f.session)) || 1)),
    lines: (Array.isArray(f.lines) ? f.lines : []).map((l) => str(l, 160)).filter(Boolean).slice(0, 3),
  };
}
function showIntro(f) {
  state.intro = introFrom(f);
  state.introCard = { ...state.intro, n: (state.introCard?.n || 0) + 1 };
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { state.introCard = null; broadcast(); }, INTRO_MS);
  return state.intro;
}

module.exports = { FONTS, COLORS, styleFor, scramble, understands, lineFor, gloss, introFrom, showIntro, INTRO_MS };
