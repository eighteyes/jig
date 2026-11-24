// host.test.mjs — tests for the local jig host.
// Responsibilities:
// - GET /api/jig returns the file text
// - PUT /api/jig writes the file
// - POST /api/done resolves `done` with the final text
// - static serving refuses path traversal

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startHost } from '../src/host.mjs';

async function tmpJig(text) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jig-'));
  const file = path.join(dir, 'a.md');
  await fs.writeFile(file, text);
  return file;
}

test('reads, writes and finishes one jig file', async () => {
  const file = await tmpJig('- one\n');
  const host = await startHost(file);
  try {
    const got = await (await fetch(host.url + 'api/jig')).json();
    assert.equal(got.text, '- one\n');
    assert.equal(got.name, 'a.md');

    const put = await fetch(host.url + 'api/jig', { method: 'PUT', body: '- [accept] one\n' });
    assert.equal(put.status, 204);
    assert.equal(await fs.readFile(file, 'utf8'), '- [accept] one\n');

    await fetch(host.url + 'api/done', { method: 'POST' });
    assert.equal(await host.done, '- [accept] one\n');
  } finally {
    host.close();
  }
});

test('refuses traversal out of the static roots', async () => {
  const file = await tmpJig('x');
  const host = await startHost(file);
  try {
    const res = await fetch(host.url + 'web/..%2f..%2fpackage.json');
    assert.notEqual(res.status, 200);
  } finally {
    host.close();
  }
});

test('serves media beside the jig, with ranges, and refuses escapes', async () => {
  const file = await tmpJig('x');
  const dir = path.dirname(file);
  await fs.mkdir(path.join(dir, 'clips'));
  await fs.writeFile(path.join(dir, 'clips', 'a b.wav'), Buffer.from('0123456789'));
  const host = await startHost(file);
  try {
    const all = await fetch(host.url + 'media/clips/a%20b.wav');
    assert.equal(all.status, 200);
    assert.equal(all.headers.get('content-type'), 'audio/wav');
    assert.equal(await all.text(), '0123456789');
    const part = await fetch(host.url + 'media/clips/a%20b.wav', { headers: { range: 'bytes=2-4' } });
    assert.equal(part.status, 206);
    assert.equal(await part.text(), '234');
    const out = await fetch(host.url + 'media/..%2f..%2fetc%2fpasswd');
    assert.ok([403, 404].includes(out.status), `escape refused, got ${out.status}`);
  } finally {
    host.close();
  }
});

test('refuses other hosts, cross-site writes and symlink escapes', async () => {
  const http = await import('node:http');
  const file = await tmpJig('secret');
  const dir = path.dirname(file);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'jig-out-'));
  await fs.writeFile(path.join(outside, 'o.txt'), 'outside');
  await fs.symlink(path.join(outside, 'o.txt'), path.join(dir, 'link.mp3'));
  await fs.writeFile(path.join(dir, 'empty.wav'), '');
  const host = await startHost(file);
  const port = new URL(host.url).port;
  const raw = (method, p, headers) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end(method === 'PUT' ? 'pwned' : undefined);
  });
  try {
    assert.equal(await raw('GET', '/api/jig', { host: 'evil.example' }), 421);
    assert.equal(await raw('PUT', '/api/jig', { host: `127.0.0.1:${port}`, origin: 'http://evil.example' }), 403);
    assert.equal(await raw('POST', '/api/done', { host: `127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site' }), 403);
    assert.equal(await fs.readFile(file, 'utf8'), 'secret');
    assert.equal((await fetch(host.url + 'media/link.mp3')).status, 403);
    const empty = await fetch(host.url + 'media/empty.wav');
    assert.equal(empty.status, 200);
    assert.equal(await empty.text(), '');
  } finally {
    host.close();
  }
});
