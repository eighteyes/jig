// smoke.test.mjs — the paths an agent actually takes, end to end.
// Responsibilities:
// - jig new for every type and a set of frameworks mounts without page errors
// - every demo file mounts without page errors and has a view summary
// - bin/jig.mjs open blocks, then prints JSON and exits 0 when the page reports done
// - bin/jig.mjs open on a finished file prints its summary and exits at once
// - every router entry names a type that has a view

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { available, withJig, closeBrowser } from './browser.mjs';
import { scaffold, listTypes, loadRouter } from '../src/scaffold.mjs';
import { summaryOf } from '../bin/jig.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(ROOT, '.ai', 'tmp', 'demo');
const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const mountsClean = async (text, name) => withJig(text, async ({ page, errors }) => {
  const status = await page.textContent('#status');
  assert.match(status, /ready|saved/, `${name}: status ${status}`);
  assert.deepEqual(errors.filter((e) => !/404/.test(e)), [], `${name}: page errors`);
});

test('router entries all name a built type', async () => {
  const types = await listTypes();
  for (const f of (await loadRouter()).frameworks) assert.ok(types.includes(f.type), `${f.key} -> ${f.type}`);
});

test('jig new: every type and key frameworks mount clean', { skip }, async () => {
  const names = [...await listTypes(), 'eisenhower', 'moscow', 'swot', 'rice', 'issue-tree', 'pre-mortem'];
  for (const name of names) {
    await mountsClean(await scaffold(name, { items: ['first', 'second', 'third'] }), name);
  }
});

test('demos: every demo mounts clean and has a view summary', { skip }, async () => {
  const files = (await fs.readdir(DEMO)).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 19);
  for (const f of files) {
    const text = await fs.readFile(path.join(DEMO, f), 'utf8');
    assert.doesNotMatch(text, /^status: done$/m, `${f} is finished`);
    const s = await summaryOf(path.join(DEMO, f), text);
    assert.ok(s.view, `${f}: no view summary`);
    await mountsClean(text, f);
  }
});

function runCli(args) {
  const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'jig.mjs'), ...args]);
  let out = '', err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  return { child, exited, out: () => out, err: () => err };
}

test('cli: open blocks, then prints JSON and exits 0 on done', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jig-cli-'));
  const file = path.join(dir, 'm.md');
  await fs.writeFile(file, await scaffold('eisenhower', { items: ['a', 'b'] }));
  const run = runCli(['open', file, '--no-open']);
  let url = null;
  for (let i = 0; i < 50 && !url; i++) {
    url = /jig: (http:\S+)/.exec(run.err())?.[1] ?? null;
    if (!url) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(url, 'printed its url');
  await fetch(url + 'api/done', { method: 'POST' });
  assert.equal(await run.exited, 0);
  const json = JSON.parse(run.out());
  assert.equal(json.type, 'matrix');
  assert.deepEqual(json.view.unsorted, ['a', 'b']);
});

test('cli: open on a finished file prints its summary at once', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jig-cli-'));
  const file = path.join(dir, 't.md');
  await fs.writeFile(file, '---\njig: triage\nstatus: done\n---\n- [accept] a\n');
  const run = runCli(['open', file, '--no-open']);
  assert.equal(await run.exited, 0);
  assert.deepEqual(JSON.parse(run.out()).by_label, { accept: ['a'] });
});
