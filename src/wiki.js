// Lore wiki link for the Creature Designer (PR W): one Markdown page per design in a folder of a GitHub repo
// (Mike's lore repo, Greiye/Artheria.ES.3D.Lore.Game, content/creatures/ by default).
//
// Two ways in:
//   github  the GitHub contents API with a token the DM pastes once (fine-grained, Contents: read and write on
//           that one repo). Each push is one commit on the chosen branch.
//   folder  a local clone on the laptop (for example GitHub Desktop's Documents\GitHub\<repo>). Pages are read and
//           written there; the DM commits and pushes with their own git tool. No token needed.
// The settings live in data/wiki.config (not .json, so save points never copy the token), and the token never
// leaves the laptop: the DM page only learns whether one is set.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { str } = require('./util');

const FILE = path.join(DATA_DIR, 'wiki.config');
const API = () => (process.env.LORE_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
const DEFAULTS = { mode: 'github', repo: 'Greiye/Artheria.ES.3D.Lore.Game', branch: 'main', folder: 'content/creatures', dir: '', token: '', author: 'mike', credit: 'Mike' };

let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* first run */ }
const token = () => process.env.LORE_GITHUB_TOKEN || cfg.token;

const cleanFolder = (s) => str(s, 120).replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..').join('/');
const cleanName = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 80);

function view() {
  const { token: _t, ...rest } = cfg;
  return { ...rest, hasToken: !!token(), tokenFromEnv: !!process.env.LORE_GITHUB_TOKEN, ready: ready() };
}
function ready() {
  if (cfg.mode === 'github') return !!token() && /^[\w.-]+\/[\w.-]+$/.test(cfg.repo);
  if (cfg.mode === 'folder') return !!cfg.dir;
  return false;
}
function configure(f = {}) {
  const next = { ...cfg };
  if (['github', 'folder', 'off'].includes(f.mode)) next.mode = f.mode;
  if (f.repo !== undefined) next.repo = str(f.repo, 120).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$|\/$/g, '');
  if (f.branch !== undefined) next.branch = str(f.branch, 80).replace(/[^\w./-]/g, '') || 'main';
  if (f.folder !== undefined) next.folder = cleanFolder(f.folder);
  if (f.dir !== undefined) next.dir = str(f.dir, 400);
  if (f.author !== undefined) next.author = str(f.author, 40) || 'mike';
  if (f.credit !== undefined) next.credit = str(f.credit, 60) || 'Mike';
  if (typeof f.token === 'string' && f.token.trim()) next.token = f.token.trim().slice(0, 300);
  if (f.clearToken) next.token = '';
  cfg = next;
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return view();
}

// ----- GitHub contents API -----
async function gh(method, rel, body) {
  const res = await fetch(`${API()}/repos/${cfg.repo}/contents/${rel}`, {
    method,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token()}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'tavern-screen', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 404) return { missing: true };
  if (!res.ok) {
    const why = res.status === 401 ? 'the token was refused (check it, or make a new one)'
      : res.status === 403 ? 'the token cannot write here (it needs Contents: read and write on this repo)'
        : res.status === 409 ? 'the page changed on GitHub since you pulled it'
          : out.message || `GitHub said ${res.status}`;
    const e = new Error(why);
    e.status = res.status;
    throw e;
  }
  return out;
}
const ref = () => `?ref=${encodeURIComponent(cfg.branch)}`;
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

// Pages in the folder: [{ name, path, sha }]. README.md and files starting with "_" are skipped.
// `folder` picks another folder of the same repo (the lore sync reads content/lore, content/artifacts and
// content/table); left out, it is the Creature Designer's folder.
const pick = (folder) => (folder === undefined ? cfg.folder : cleanFolder(folder));

async function list(folder) {
  if (!ready()) throw new Error('Connect the wiki first.');
  const f = pick(folder);
  const keep = (n) => /\.md$/i.test(n) && !/^(_|readme\.md$)/i.test(n);
  if (cfg.mode === 'folder') {
    const dir = path.join(cfg.dir, f);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(keep).sort().map((n) => ({ name: n.replace(/\.md$/i, ''), path: `${f}/${n}`, sha: '' }));
  }
  const out = await gh('GET', `${enc(f)}${ref()}`);
  if (out.missing) return [];
  return (Array.isArray(out) ? out : []).filter((f) => f.type === 'file' && keep(f.name)).map((f) => ({ name: f.name.replace(/\.md$/i, ''), path: f.path, sha: f.sha }));
}

async function read(name, folder) {
  const n = cleanName(name);
  if (!n) throw new Error('No such page.');
  const rel = `${pick(folder)}/${n}.md`;
  if (cfg.mode === 'folder') {
    const file = path.join(cfg.dir, rel);
    if (!fs.existsSync(file)) throw new Error('No such page.');
    return { path: rel, sha: '', text: fs.readFileSync(file, 'utf8') };
  }
  const out = await gh('GET', `${enc(rel)}${ref()}`);
  if (out.missing) throw new Error('No such page.');
  return { path: out.path, sha: out.sha, text: Buffer.from(out.content || '', 'base64').toString('utf8') };
}

// Write one page. `sha` is the version the DM last pulled or pushed; if the page has moved on since,
// the write stops with { conflict } unless `force` (then it overwrites the newer page).
async function write(name, text, { sha = '', force = false, message, folder } = {}) {
  const n = cleanName(name);
  if (!n) throw new Error('The page needs a name.');
  const rel = `${pick(folder)}/${n}.md`;
  if (cfg.mode === 'folder') {
    const file = path.join(cfg.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return { path: rel, sha: '', created: false };
  }
  const now = await gh('GET', `${enc(rel)}${ref()}`);
  if (!now.missing && sha && now.sha !== sha && !force) return { conflict: true, path: rel, sha: now.sha };
  const out = await gh('PUT', enc(rel), {
    message: message || `${now.missing ? 'Add' : 'Update'} ${n} from the Creature Designer`,
    content: Buffer.from(text, 'utf8').toString('base64'),
    branch: cfg.branch,
    ...(now.missing ? {} : { sha: now.sha }),
  });
  return { path: out.content?.path || rel, sha: out.content?.sha || '', url: out.content?.html_url || '', created: !!now.missing };
}

module.exports = { view, configure, ready, list, read, write, cfg: () => cfg };
