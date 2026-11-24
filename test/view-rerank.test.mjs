// view-rerank.test.mjs — tests for the rerank view.
// Responsibilities:
// - mount stamps guess fields once; keys move items in file order; undo restores
// - Enter finishes; the page raises no errors
// - summary(jig) runs in Node and reports ranks and deltas

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/rerank.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: rerank
left: model guess
right: your order
---
- one
- two
- three
`;

const poll = async (read, re) => {
  for (let i = 0; i < 50; i++) { const t = await read(); if (re.test(t)) return t; await new Promise((r) => setTimeout(r, 50)); }
  return read();
};

test('rerank: stamps guess, moves, undoes, finishes', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    let t = await poll(read, /three\n {2}guess:: 3/);
    assert.match(t, /- one\n {2}guess:: 1\n- two\n {2}guess:: 2\n- three\n {2}guess:: 3/);
    await press('J');
    t = await read();
    assert.match(t, /- two\n {2}guess:: 2\n- one\n {2}guess:: 1\n- three/);
    await press('Shift+ArrowDown'); // focus followed item one to position 2
    t = await read();
    assert.match(t, /- two\n {2}guess:: 2\n- three\n {2}guess:: 3\n- one\n {2}guess:: 1/);
    await press('u', 'u');
    t = await read();
    assert.match(t, /- one\n {2}guess:: 1\n- two\n {2}guess:: 2\n- three/);
    await press('Shift+ArrowUp', 'K'); // focus is on item one (pos 0): up is a no-op
    assert.equal(await page.locator('.rr-svg line').count(), 3);
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('rerank: summary reports ranks and deltas', () => {
  const jig = parseJig(`---\njig: rerank\n---\n- b\n  guess:: 2\n- a\n  guess:: 1\n- c\n  guess:: 3\n`);
  const s = summary(jig);
  assert.deepEqual(s.order, [
    { text: 'b', guess_rank: 2, human_rank: 1, delta: 1 },
    { text: 'a', guess_rank: 1, human_rank: 2, delta: -1 },
    { text: 'c', guess_rank: 3, human_rank: 3, delta: 0 },
  ]);
  assert.deepEqual(s.moved.map((r) => r.text), ['b', 'a']);
});
