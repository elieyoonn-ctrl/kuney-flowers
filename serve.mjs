// Zero-dependency static file server.
// The app uses ES modules, so it must be served over http:// (file:// is blocked
// by the browser's module loader). Run: npm start
import { createServer } from 'node:http';
import { createReadStream, appendFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  let target = join(ROOT, normalize(clean).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    await stat(target);
    return target;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  // Dev-only: the page posts any script error here so a blank screen can be
  // diagnosed from the terminal instead of guessed at.
  if (req.method === 'POST' && (req.url || '').startsWith('/__log')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    const line = `[${new Date().toISOString()}] ${body}\n`;
    appendFileSync(join(ROOT, 'client-errors.log'), line);
    process.stdout.write(`\n  CLIENT: ${body}\n`);
    res.writeHead(204).end();
    return;
  }

  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  KUNEY FLOWERS\n  → http://localhost:${PORT}\n  → http://localhost:${PORT}/admin.html  (calendar + content editor)\n`);
});
