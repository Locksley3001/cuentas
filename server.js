const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function resolveRequestPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const relativePath = normalizedPath === path.sep ? 'html/index.html' : normalizedPath.replace(/^[/\\]/, '');
  const filePath = path.join(ROOT_DIR, relativePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let filePath = resolveRequestPath(requestUrl.pathname);

  if (!filePath) {
    send(res, 403, '403 Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (!statError && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readError, content) => {
      if (readError) {
        send(res, 404, '404 Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      send(res, 200, content, {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`CUENTAS listo en: http://localhost:${PORT}`);
  console.log(`Para celular: usa http://TU-IP-LOCAL:${PORT}`);
  console.log('Presiona Ctrl + C para apagar el servidor.');
});
