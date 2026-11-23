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
