// Shared by the lore wiki tests (designer, lore-sync).
const http = require('http');

// A tiny stand-in for the GitHub contents API: GET a file or folder, PUT a file (with sha checks).
function fakeGitHub() {
  const files = new Map(); // path -> { text, sha }
  let n = 0;
  const seen = [];
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.*)$/.exec(url.pathname);
    seen.push({ method: req.method, auth: req.headers.authorization, repo: m?.[1], ref: url.searchParams.get('ref') });
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!m) return send(404, { message: 'Not Found' });
    if (req.headers.authorization !== 'Bearer good-token') return send(401, { message: 'Bad credentials' });
    const p = decodeURIComponent(m[2]);
    if (req.method === 'GET') {
      if (files.has(p)) { const f = files.get(p); return send(200, { type: 'file', path: p, sha: f.sha, content: Buffer.from(f.text).toString('base64') }); }
      const kids = [...files.keys()].filter((k) => k.startsWith(p + '/'));
      return kids.length ? send(200, kids.map((k) => ({ type: 'file', name: k.split('/').pop(), path: k, sha: files.get(k).sha }))) : send(404, { message: 'Not Found' });
    }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const b = JSON.parse(body);
      const prev = files.get(p);
      if (prev && b.sha !== prev.sha) return send(409, { message: 'sha mismatch' });
      const sha = `sha${++n}`;
      files.set(p, { text: Buffer.from(b.content, 'base64').toString('utf8'), sha, message: b.message, branch: b.branch });
      send(prev ? 200 : 201, { content: { path: p, sha, html_url: `https://github.com/x/${p}` } });
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, files, seen, url: `http://127.0.0.1:${srv.address().port}` })));
}

module.exports = { fakeGitHub };
