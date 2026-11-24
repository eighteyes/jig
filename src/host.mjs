// host.mjs — local server that puts one jig file in a browser tab.
// Responsibilities:
// - serve the shell page, web modules and view modules
// - hand the jig file's text to the page (GET /api/jig)
// - write the page's text back to that file only (PUT /api/jig)
// - resolve the blocking wait when the page reports done (POST /api/done)
// - bind to 127.0.0.1 and refuse paths outside the served roots

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { '/web/': path.join(ROOT, 'web'), '/views/': path.join(ROOT, 'views') };
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const MAX_BODY = 8 * 1024 * 1024;

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(res, urlPath) {
  for (const [prefix, dir] of Object.entries(STATIC)) {
    if (!urlPath.startsWith(prefix)) continue;
    const file = path.resolve(dir, '.' + urlPath.slice(prefix.length - 1));
    if (!file.startsWith(dir + path.sep)) return send(res, 403, 'forbidden');
    try {
      const body = await fs.readFile(file);
      return send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream');
    } catch {
      return send(res, 404, 'not found');
    }
  }
  return send(res, 404, 'not found');
}

/**
 * Start a host for one jig file.
 * @param {string} jigPath absolute path of the jig file
 * @param {{port?: number, onSave?: (text: string) => void}} opts
 * @returns {Promise<{url: string, done: Promise<string>, close: () => void}>}
 *   done resolves with the file's final text when the page reports done.
 */
export async function startHost(jigPath, opts = {}) {
  const file = path.resolve(jigPath);
  await fs.access(file);
  let finish;
  const done = new Promise((r) => { finish = r; });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/' && req.method === 'GET') {
        return send(res, 200, await fs.readFile(path.join(ROOT, 'web', 'index.html')), 'text/html');
      }
      if (url.pathname === '/api/jig' && req.method === 'GET') {
        const text = await fs.readFile(file, 'utf8');
        return send(res, 200, JSON.stringify({ path: file, name: path.basename(file), text }), 'application/json');
      }
      if (url.pathname === '/api/jig' && req.method === 'PUT') {
        const text = await readBody(req);
        await fs.writeFile(file, text);
        opts.onSave?.(text);
        return send(res, 204, '');
      }
      if (url.pathname === '/api/done' && req.method === 'POST') {
        send(res, 204, '');
        finish(await fs.readFile(file, 'utf8'));
        return;
      }
      if (req.method === 'GET') return serveStatic(res, url.pathname);
      return send(res, 405, 'method not allowed');
    } catch (err) {
      return send(res, 500, String(err.message || err));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, done, close: () => { server.close(); server.closeAllConnections(); } };
}
