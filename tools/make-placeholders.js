// Writes the placeholder art in public/samples/placeholders/ (studio review, Nov 16). Plain SVG, made
// here, no outside sources, so they are free to use and easy to replace. Every file name starts with
// "placeholder-" and every image says PLACEHOLDER, so none can be mistaken for final art.
// Run again after changing the lists: node tools/make-placeholders.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'samples', 'placeholders');
const TAG = (y, size = 11) => `<text x="50%" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${size}" letter-spacing="2" fill="hsl(0 0% 100% / .55)">PLACEHOLDER</text>`;

// One portrait per test party class (src/testparty.js), a bust in the class's hue with a simple emblem.
const PORTRAITS = [
  ['fighter', 'Fighter', 210, 'M88 70 l12 -22 l12 22 v40 h-24z'],
  ['rogue', 'Rogue', 270, 'M100 50 l10 30 l-10 40 l-10 -40z'],
  ['wizard', 'Wizard', 230, 'M100 38 l22 58 h-44z'],
  ['cleric', 'Cleric', 45, 'M94 50 h12 v20 h18 v12 h-18 v32 h-12 v-32 h-18 v-12 h18z'],
  ['ranger', 'Ranger', 120, 'M80 110 q20 -80 40 0 M100 48 v70'],
  ['bard', 'Bard', 320, 'M92 106 a10 8 0 1 1 0 -1 v-54 l24 -6 v46 a10 8 0 1 1 0 -1 v-30 l-24 6'],
  ['druid', 'Druid', 95, 'M100 112 q-30 -40 0 -66 q30 26 0 66z'],
  ['paladin', 'Paladin', 50, 'M76 52 h48 v28 q0 30 -24 40 q-24 -10 -24 -40z'],
  ['warlock', 'Warlock', 290, 'M100 54 a26 26 0 1 0 1 0 M100 66 a14 14 0 1 1 -1 0'],
  ['barbarian', 'Barbarian', 10, 'M78 56 l44 56 M122 56 l-44 56'],
  ['monk', 'Monk', 30, 'M100 52 a28 28 0 1 0 1 0 M100 52 a14 14 0 0 1 0 28 a14 14 0 0 0 0 28'],
  ['sorcerer', 'Sorcerer', 0, 'M100 46 q20 30 8 46 q14 -6 14 -20 q8 22 -10 40 q-12 8 -24 0 q-18 -18 -6 -40 q2 14 12 18 q-12 -20 6 -44z'],
];
function portrait([, label, hue, emblem]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="512" height="666">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 32%)"/><stop offset="1" stop-color="hsl(${hue} 50% 12%)"/></linearGradient></defs>
  <rect width="200" height="260" fill="url(#g)"/>
  <circle cx="100" cy="96" r="44" fill="hsl(${hue} 30% 70% / .25)"/>
  <path d="M30 260 q0 -78 70 -84 q70 6 70 84z" fill="hsl(${hue} 35% 20%)"/>
  <circle cx="100" cy="128" r="34" fill="hsl(${hue} 25% 22%)"/>
  <path d="${emblem}" fill="none" stroke="hsl(${hue} 80% 80%)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <text x="50%" y="226" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="hsl(${hue} 60% 90%)">${label}</text>
  ${TAG(248)}
</svg>
`;
}

// Creature tokens: round, top-down, for the creature art slot and stat blocks.
const TOKENS = [
  ['goblin', 'Goblin', 100, 'small'],
  ['wolf', 'Wolf', 30, 'medium'],
  ['skeleton', 'Skeleton', 50, 'medium'],
  ['bandit', 'Bandit', 0, 'medium'],
  ['ogre', 'Ogre', 140, 'large'],
  ['dragon', 'Dragon', 350, 'huge'],
];
function token([, label, hue, size]) {
  const r = { small: 52, medium: 62, large: 72, huge: 80 }[size];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="384" height="384">
  <circle cx="100" cy="100" r="96" fill="hsl(${hue} 20% 14%)" stroke="hsl(${hue} 60% 55%)" stroke-width="6"/>
  <circle cx="100" cy="92" r="${r}" fill="hsl(${hue} 45% 34%)"/>
  <circle cx="${100 - r / 3}" cy="84" r="${r / 8}" fill="hsl(50 90% 70%)"/><circle cx="${100 + r / 3}" cy="84" r="${r / 8}" fill="hsl(50 90% 70%)"/>
  <text x="50%" y="${100 + r * 0.55}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="hsl(${hue} 60% 92%)">${label}</text>
  ${TAG(176, 10)}
</svg>
`;
}

// One backdrop per pillar: exploration (a road), combat (an arena) and social (a tavern).
const BACKDROPS = {
  'explore-road': (w = 1920, h = 1080) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(205 55% 62%)"/><stop offset="1" stop-color="hsl(35 60% 80%)"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <path d="M0 620 q480 -140 960 -40 q480 100 960 -60 v520 h-1920z" fill="hsl(130 25% 42%)"/>
  <path d="M0 760 q600 -120 1920 -40 v360 h-1920z" fill="hsl(110 30% 32%)"/>
  <path d="M860 1080 q60 -300 120 -460 q20 -40 40 0 q40 160 120 460z" fill="hsl(35 35% 62%)"/>
  <text x="50%" y="140" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="hsl(0 0% 100% / .7)">Exploration placeholder</text>
  ${TAG(200, 28)}
</svg>
`,
  'combat-arena': (w = 1920, h = 1080) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="hsl(10 30% 14%)"/>
  <ellipse cx="960" cy="760" rx="860" ry="300" fill="hsl(30 30% 32%)"/>
  <ellipse cx="960" cy="760" rx="620" ry="200" fill="hsl(30 35% 42%)"/>
  <g stroke="hsl(15 70% 50% / .5)" stroke-width="10">${[200, 520, 1400, 1720].map((x) => `<line x1="${x}" y1="160" x2="${x}" y2="560"/>`).join('')}</g>
  <text x="50%" y="140" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="hsl(0 0% 100% / .7)">Combat placeholder</text>
  ${TAG(200, 28)}
</svg>
`,
  'social-tavern': (w = 1920, h = 1080) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="hsl(28 40% 18%)"/>
  <g fill="hsl(28 35% 24%)">${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 192}" y="0" width="180" height="640"/>`).join('')}</g>
  <rect y="640" width="${w}" height="440" fill="hsl(25 40% 28%)"/>
  <rect x="260" y="700" width="1400" height="60" rx="12" fill="hsl(25 45% 38%)"/>
  <g fill="hsl(40 90% 65% / .8)">${[420, 960, 1500].map((x) => `<circle cx="${x}" cy="300" r="30"/>`).join('')}</g>
  <text x="50%" y="140" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="hsl(0 0% 100% / .7)">Social placeholder</text>
  ${TAG(200, 28)}
</svg>
`,
};

// Sprites with a transparent background that stand in front of a picture (Nov 21): the TV shop merchant.
const SPRITES = {
  merchant: () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="400" height="600">
  <ellipse cx="100" cy="292" rx="70" ry="8" fill="hsl(0 0% 0% / .35)"/>
  <path d="M38 292 q-4 -110 62 -122 q66 12 62 122z" fill="hsl(22 55% 27%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <path d="M70 292 l8 -112 h44 l8 112z" fill="hsl(37 45% 60%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <rect x="62" y="214" width="76" height="12" rx="4" fill="hsl(20 40% 16%)"/>
  <circle cx="122" cy="232" r="11" fill="hsl(43 75% 56%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <circle cx="100" cy="122" r="40" fill="hsl(30 60% 76%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <path d="M60 118 q40 -70 80 0 q-10 -20 -40 -22 q-30 2 -40 22z" fill="hsl(25 50% 19%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <path d="M56 104 h88 l-10 -14 h-68z" fill="hsl(8 63% 29%)" stroke="hsl(25 60% 10%)" stroke-width="3"/>
  <circle cx="86" cy="124" r="4" fill="hsl(25 60% 10%)"/><circle cx="114" cy="124" r="4" fill="hsl(25 60% 10%)"/>
  <path d="M80 140 q20 34 40 0 q-20 10 -40 0z" fill="hsl(24 40% 38%)" stroke="hsl(25 60% 10%)" stroke-width="2"/>
  <path d="M88 146 q12 8 24 0" stroke="hsl(25 60% 10%)" stroke-width="3" fill="none" stroke-linecap="round"/>
  ${TAG(270, 13)}
</svg>
`,
};

function write() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = [];
  const put = (name, svg) => { fs.writeFileSync(path.join(OUT, name), svg); files.push(name); };
  for (const p of PORTRAITS) put(`placeholder-portrait-${p[0]}.svg`, portrait(p));
  for (const t of TOKENS) put(`placeholder-token-${t[0]}.svg`, token(t));
  for (const [id, fn] of Object.entries(BACKDROPS)) put(`placeholder-backdrop-${id}.svg`, fn());
  for (const [id, fn] of Object.entries(SPRITES)) put(`placeholder-${id}.svg`, fn());
  return files;
}

if (require.main === module) console.log(`  Wrote ${write().length} placeholder files to ${OUT}`);
module.exports = { PORTRAITS, TOKENS, BACKDROPS, SPRITES, OUT };
