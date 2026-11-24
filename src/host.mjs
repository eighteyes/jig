// host.mjs — local server that puts one jig file in a browser tab.
// Responsibilities:
// - serve the shell page, web modules and view modules
// - hand the jig file's text to the page (GET /api/jig)
// - write the page's text back to that file only (PUT /api/jig)
// - resolve the blocking wait when the page reports done (POST /api/done)
// - serve media beside the jig file (GET /media/<relative path>), with byte ranges for audio and video
// - bind to 127.0.0.1 and refuse paths outside the served roots

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { '/web/': path.join(ROOT, 'web'), '/views/': path.join(ROOT, 'views') };
const TYPES = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

/** Serve one file under `root`, honouring a single byte range. */
async function serveMedia(req, res, root, rel) {
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) return send(res, 403, 'forbidden');
  let stat;
  try { stat = await fs.stat(target); } catch { return send(res, 404, 'not found'); }
  if (!stat.isFile()) return send(res, 404, 'not found');
  const type = TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0, end = stat.size - 1, code = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    else start = Math.max(stat.size - Number(range[2]), 0);
    if (start > end) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
    code = 206;
  }
  const head = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store' };
  if (code === 206) head['content-range'] = `bytes ${start}-${end}/${stat.size}`;
  res.writeHead(code, head);
  const fh = await fs.open(target);
  const stream = fh.createReadStream({ start, end });
  stream.on('close', () => fh.close().catch(() => {}));
  stream.pipe(res);
}
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
 * @param {{port?: number, media?: string, onSave?: (text: string) => void}} opts
 *   media: folder media is served from (default: the jig file's folder)
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
      if (url.pathname.startsWith('/media/') && req.method === 'GET') {
        return serveMedia(req, res, path.resolve(opts.media ?? path.dirname(file)), decodeURIComponent(url.pathname.slice('/media/'.length)));
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
