// view-gate.test.mjs — tests for the gate view.
// Responsibilities:
// - digits toggle pass, Shift+digits crown, a / 0 / x edit rows, u undoes, Enter arms then finishes
// - candidates render as numbered cells; media is served from beside the jig file
// - the page raises no errors
// - summary(jig) runs in Node

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/gate.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: gate
---
- prompt 7
  audio:: c/7a.wav, c/7b.wav, c/7c.wav
- prompt 8
  audio:: c/8a.wav, c/8b.wav
- headline
  Ship it
  Hold it
`;

/** A tiny silent mono 8-bit wav. */
function wav() {
  const data = Buffer.alloc(64, 128);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(8000, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('gate: pass, crown, all, clear, unusable, undo, arm, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, file, errors, host }) => {
    await fs.mkdir(path.join(path.dirname(file), 'c'));
    for (const f of ['7a', '7b', '7c', '8a', '8b']) await fs.writeFile(path.join(path.dirname(file), 'c', `${f}.wav`), wav());
    assert.equal(await page.locator('.gt-row.active .gt-cell').count(), 3);
    assert.equal(await page.locator('audio').count(), 5);
    assert.match(await page.locator('audio').first().getAttribute('src'), /^\/media\/c\/7a\.wav$/);
    const status = await page.evaluate(async () => (await fetch('/media/c/7a.wav')).status);
    assert.equal(status, 200);
    assert.equal(await page.locator('.gt-row').nth(2).locator('.gt-body').count(), 2);

    await press('1');
    assert.match(await read(), /- prompt 7\n {2}audio:: .*\n {2}passed:: 1\n- prompt 8/);
    await press('Shift+Digit3');
    let t = await read();
    assert.match(t, /passed:: 1, 3\n {2}crown:: 3\n- prompt 8/);
    assert.equal(await page.locator('.gt-row.active .gt-cell.crown').count(), 1);
    assert.equal(await page.locator('.gt-row.active .gt-cell.pass').count(), 2);
    await press('u', 'u');
    assert.doesNotMatch(await read(), /passed::|crown::/);

    await press('a');
    assert.match(await read(), /passed:: 1, 2, 3/);
    await press('0');
    assert.doesNotMatch(await read(), /passed::/);
    await press('u');
    assert.match(await read(), /passed:: 1, 2, 3/);
    await press('u');

    await press('x');
    assert.match(await read(), /- \[unusable\] prompt 7/);
    assert.equal(await page.locator('.gt-row.active .gt-text').textContent(), 'prompt 8');
    await press('u');
    assert.match(await read(), /- prompt 7/);
    assert.equal(await page.locator('.gt-row.active .gt-text').textContent(), 'prompt 7');

    await press('x', ' ');
    assert.equal(await page.locator('.gt-row.active .gt-cell.cur').count(), 1);
    await press('2');
    assert.match(await read(), /- prompt 8\n {2}audio:: .*\n {2}passed:: 2/);
    await press('Enter');
    assert.match(await page.textContent('.gt-warn'), /1 row with no pass/);
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('gate: text candidates and a 4th key past the count are ignored', { skip }, async () => {
  await withJig(FILE, async ({ press, read, errors }) => {
    await press('j', 'j', '2', '#');
    const t = await read();
    assert.match(t, /- headline\n {2}passed:: 2\n {2}Ship it\n {2}Hold it/);
    assert.deepEqual(errors, []);
  });
});

test('gate: summary(jig)', () => {
  const jig = parseJig(`---\njig: gate\n---\n- a\n  audio:: x, y, z\n  passed:: 1, 3\n  crown:: 3\n- [unusable] b\n  audio:: x\n- c\n  audio:: x, y\n`);
  assert.deepEqual(summary(jig), {
    rows: [
      { text: 'a', passed: [1, 3], crown: 3, unusable: false },
      { text: 'b', passed: [], crown: null, unusable: true },
      { text: 'c', passed: [], crown: null, unusable: false },
    ],
    by_index: { 1: ['a'], 3: ['a'] },
    unanswered: ['c'],
    unusable: ['b'],
  });
});
