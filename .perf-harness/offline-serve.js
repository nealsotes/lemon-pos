// SWI-12 throwaway: serves a production Angular build the way the deployed app is
// served - one origin, static files first, SPA fallback to index.html, /api proxied
// to the backend. Mirrors Program.cs (UseStaticFiles + MapFallbackToFile("index.html")).
//
// Usage: node offline-serve.js --root <dir> --port 4399 --api 127.0.0.1:5099
const http = require('http');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', '.'));
const PORT = parseInt(arg('port', '4399'), 10);
const [API_HOST, API_PORT] = arg('api', '127.0.0.1:5099').split(':');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api') || pathname.startsWith('/uploads')) {
    const p = http.request(
      { host: API_HOST, port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` } },
      up => { res.writeHead(up.statusCode, up.headers); up.pipe(res); }
    );
    p.on('error', () => { res.writeHead(502); res.end('proxy error'); });
    req.pipe(p);
    return;
  }

  const file = path.join(ROOT, pathname);
  // Static files win if they exist, exactly as UseStaticFiles does.
  if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // ngsw-worker.js must not be cached by the browser or updates never land.
      'Cache-Control': path.basename(file).startsWith('ngsw') ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
    return;
  }

  // SPA fallback. MapFallbackToFile("index.html") routes `{*path:nonfile}`, so a
  // path that looks like a file (has an extension) is NOT rewritten to index.html -
  // it 404s. Verified against the real backend on :5099: /main.deadbeef.js -> 404.
  if (path.extname(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT} (api -> ${API_HOST}:${API_PORT})`));
