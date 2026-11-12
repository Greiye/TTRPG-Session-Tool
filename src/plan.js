// Session plans (Mike's Markdown prep). Parses a forgiving Markdown file into scenes, NPCs and
// encounters, and launches one item at a time onto the live state. Convention: docs/session-plans.md.
//
//   # Session title                      optional
//   ## Scene: Name                       paragraphs = read-aloud text, "- " bullets = points of interest
//   ## NPC: Name                         "- emotion: happy", "- hue: 28", "- line: ...", "- choice: ..." (max 4),
//                                        other bullets and paragraphs = DM notes
//   ## Encounter: Name                    "- 3x Goblin (hp 7, ac 15, atk 4, dmg 1d6+2, side enemy)"
//
// Only this module knows the Markdown shape. Launch functions take the live state and mutate it;
// the socket layer (src/sockets/plans.js) calls them and broadcasts.
const creatures = require('./creatures');
const rules = require('./rules');

const EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'fearful', 'surprised', 'suspicious', 'smug'];
const SIDES = ['enemy', 'ally', 'neutral'];
const LIMITS = { scenes: 40, npcs: 40, encounters: 40, foes: 20, poi: 8, choices: 4, chars: 100000 };

const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const SECTION = /^(scene|npc|encounter)\b\s*[:\-–—]?\s*(.*)$/i;
const KEYED = /^(emotion|hue|line|choice|choices)\s*:\s*(.*)$/i;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const FOE = /^(?:(\d{1,2})\s*[x×]\s*|(\d{1,2})\s+)?(.+?)\s*(?:\(([^)]*)\))?$/i;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Split the file into sections keyed by their heading. Lines before the first section are ignored
// except for a leading "# Title".
function sections(md) {
  const out = [];
  let title = '';
  let cur = null;
  for (const raw of md.split(/\r?\n/)) {
    const h = raw.match(HEADING);
    if (h) {
      if (h[1].length === 1 && !title) { title = clip(h[2], 80); cur = null; continue; }
      const s = h[2].match(SECTION);
      cur = { heading: clip(h[2], 120), kind: s ? s[1].toLowerCase() : null, name: s ? clip(s[2], 80) : '', bullets: [], paras: [] };
      out.push(cur);
      continue;
    }
    if (!cur || !raw.trim()) continue;
    const b = raw.match(BULLET);
    if (b) cur.bullets.push(b[1].trim());
    else cur.paras.push(raw.trim());
  }
  return { title, sections: out };
}

function parseFoe(text) {
  const m = text.match(FOE);
  if (!m) return null;
  const name = clip(m[3], 40);
  if (!/[a-z]/i.test(name)) return null;
  const f = { name, count: Math.min(12, Number(m[1] || m[2]) || 1), hp: 10, ac: 12, atk: 3, dmg: '1d6+2', side: 'enemy' };
  for (const part of String(m[4] || '').split(',')) {
    const [k, ...rest] = part.trim().split(/\s+/);
    const v = rest.join(' ');
    if (!k) continue;
    switch (k.toLowerCase()) {
      case 'hp': f.hp = Number(v) || f.hp; break;
      case 'ac': f.ac = Number(v) || f.ac; break;
      case 'atk': f.atk = Number(v.replace('+', '')) || 0; break;
      case 'dmg': if (/\d/.test(v)) f.dmg = clip(v, 20); break;
      case 'side': if (SIDES.includes(v.toLowerCase())) f.side = v.toLowerCase(); break;
    }
  }
  return f;
}

// Returns { title, scenes, npcs, encounters, warnings }. Never throws on bad input; problems become warnings.
function parsePlan(md) {
  const { title, sections: secs } = sections(String(md ?? '').slice(0, LIMITS.chars));
  const plan = { title: title || 'Session plan', scenes: [], npcs: [], encounters: [], warnings: [] };
  for (const s of secs) {
    const label = s.heading || '(untitled)';
    if (!s.kind) { plan.warnings.push(`Skipped "${label}": use "## Scene:", "## NPC:" or "## Encounter:".`); continue; }
    if (s.kind === 'scene') {
      if (plan.scenes.length >= LIMITS.scenes) { plan.warnings.push('Too many scenes; the rest were skipped.'); continue; }
      plan.scenes.push({ title: s.name || 'Untitled scene', text: clip(s.paras.join(' '), 600), poi: s.bullets.map((b) => clip(b, 60)).filter(Boolean).slice(0, LIMITS.poi), launched: false });
    } else if (s.kind === 'npc') {
      if (plan.npcs.length >= LIMITS.npcs) { plan.warnings.push('Too many NPCs; the rest were skipped.'); continue; }
      const npc = { name: s.name || 'Unnamed NPC', emotion: null, hue: null, line: '', choices: [], notes: [...s.paras], launched: false };
      for (const b of s.bullets) {
        const k = b.match(KEYED);
        if (!k) { npc.notes.push(b); continue; }
        const key = k[1].toLowerCase(); const v = clip(k[2], 500);
        if (key === 'emotion') {
          if (EMOTIONS.includes(v.toLowerCase())) npc.emotion = v.toLowerCase();
          else plan.warnings.push(`${npc.name}: unknown emotion "${v}".`);
        } else if (key === 'hue') { if (Number.isFinite(Number(v))) npc.hue = Math.round(Number(v)) % 360; }
        else if (key === 'line') npc.line = v;
        else if (npc.choices.length < LIMITS.choices && v) npc.choices.push(clip(v, 120));
      }
      npc.notes = npc.notes.map((n) => clip(n, 500)).filter(Boolean).slice(0, 20);
      plan.npcs.push(npc);
    } else {
      if (plan.encounters.length >= LIMITS.encounters) { plan.warnings.push('Too many encounters; the rest were skipped.'); continue; }
      const foes = [];
      for (const b of s.bullets) {
        const f = parseFoe(b);
        if (!f) { plan.warnings.push(`${s.name || 'Encounter'}: could not read "${clip(b, 60)}".`); continue; }
        if (foes.length < LIMITS.foes) foes.push(f);
      }
      plan.encounters.push({ title: s.name || 'Untitled encounter', foes, notes: s.paras.map((p) => clip(p, 500)).slice(0, 20), launched: false });
    }
  }
  return plan;
}

const counts = (p) => ({ scenes: p.scenes.length, npcs: p.npcs.length, encounters: p.encounters.length });

// ----- launch: each returns a short log line; the caller broadcasts -----

// Read-aloud text and points of interest become the current scene. Fog of war resets.
function launchScene(state, item, log) {
  Object.assign(state.scene, { title: item.title, text: item.text, poi: item.poi, revealed: [] });
  state.scene.secrets ??= [];
  item.launched = true;
  log('narrate', `Scene: ${item.title}.`);
}

// Makes the NPC the speaker, sets the emotion, and posts the opening line if the plan has one.
function launchNpc(state, item, log) {
  const npc = state.social.npc;
  npc.name = item.name;
  if (item.hue !== null) npc.hue = item.hue;
  if (item.emotion) npc.emotion = item.emotion;
  state.social.choices = item.choices.slice();
  if (item.line) {
    state.social.line = { speaker: npc.name, text: item.line, emotion: npc.emotion };
    state.social.caption = '';
    log('npc', item.line, { who: npc.name, emotion: npc.emotion });
  }
  item.launched = true;
}

// Adds every foe to the encounter. A fight already running gets the new foes in initiative order.
function launchEncounter(state, item, { nextId, log }) {
  const sys = rules.get(state.system);
  const taken = () => new Set(state.combat.enemies.map((e) => e.name));
  const uniqueName = (base) => {
    const t = taken();
    if (!t.has(base)) return base;
    let n = 2;
    while (t.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };
  let added = 0;
  for (const f of item.foes) {
    const block = creatures.normalize({ name: f.name, hp: f.hp, ac: f.ac, side: f.side, attacks: [{ name: 'Attack', atk: f.atk, dmg: f.dmg }] });
    for (let i = 0; i < f.count; i++) {
      const c = creatures.spawn(block, { id: 'e' + nextId(), name: uniqueName(f.name) });
      state.combat.enemies.push(c);
      added++;
      if (state.combat.active) {
        state.combat.order.push({ id: c.id, init: sys.initiative(c) });
        const cur = state.combat.order[state.combat.turn]?.id;
        state.combat.order.sort((a, b) => b.init - a.init);
        state.combat.turn = Math.max(0, state.combat.order.findIndex((o) => o.id === cur));
      }
    }
  }
  item.launched = true;
  log('combat', `Encounter: ${item.title} (${added} foes).`);
  return added;
}

module.exports = { parsePlan, launchScene, launchNpc, launchEncounter, counts, EMOTIONS, LIMITS };
