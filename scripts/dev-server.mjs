import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const primaryDist = '/home/cordial/opus-os-dev/apps/app/dist';
const fallbackDist = path.resolve(__dirname, '../apps/app/dist');
const distDir = fs.existsSync(primaryDist) ? primaryDist : fallbackDist;
const API_TARGET = 'http://127.0.0.1:8787';
const PORT = 5173;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  // 1. Proxy /api/* to Cloudflare Worker API on 8787
  if (url.pathname.startsWith('/api/')) {
    const proxyReq = http.request(
      `${API_TARGET}${url.pathname}${url.search}`,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: '127.0.0.1:8787',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API Gateway Unreachable', details: err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  // 2. Static Assets from distDir
  let filePath = path.join(distDir, decodeURIComponent(url.pathname));

  // Check if file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 3. SPA Fallback: Serve index.html for all frontend routes
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Opus OS Fast Server listening on http://0.0.0.0:${PORT} (dist: ${distDir}) -> Proxying API to ${API_TARGET}`);
});
