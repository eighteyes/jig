// view-graph.test.mjs — drive the graph view in headless Chrome, plus Node-only layout and summary tests.
// Responsibilities:
// - keys move across columns, m and q toggle fields, undo restores, Enter finishes
// - depth layout without types, cycles do not hang
// - summary(jig) shape without a DOM
// Skips browser tests when Playwright is not available (set JIG_PLAYWRIGHT).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/graph.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const G = `---
jig: graph
types: [goal, component]
---
- Ship it
  id:: g1
  type:: goal
- Engine
  id:: c1
  type:: component
  depends:: g1
- Store
  id:: c2
  type:: component
  depends:: c1, g1
`;

test('graph: move, flag, question, undo, escalate, finish', { skip }, async () => {
  await withJig(G, async ({ page, press, read, errors, host }) => {
    const titles = () => page.$$eval('.gr-col h2', (hs) => hs.map((h) => h.textContent));
    assert.deepEqual(await titles(), ['goal · 1', 'component · 2']);
    await press('m');
    assert.match(await read(), /- Ship it\n {2}id:: g1\n {2}type:: goal\n {2}flag:: true/);
    await press('u');
    assert.doesNotMatch(await read(), /flag::/);
    await press('l', 'j', 'q');
    assert.match(await read(), /- Store\n(?: {2}.*\n)* {2}question:: true/);
    assert.equal(await page.$$eval('.gr-node.dep', (n) => n.length), 2);
    assert.match(await page.textContent('.gr-node.active .gr-rel'), /depends on/);
    assert.ok(await page.$$eval('.gr svg path', (p) => p.length) >= 2);
    await press('e');
    assert.match(await read(), /escalate:: true/);
    await page.screenshot({ path: new URL('../.ai/tmp/shots/graph.png', import.meta.url).pathname });
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('graph: untyped nodes lay out by depth and cycles do not hang', { skip }, async () => {
  const text = `---
jig: graph
---
- A
  id:: a
  depends:: b
- B
  id:: b
  depends:: a
- C
  id:: c
  depends:: b
`;
  await withJig(text, async ({ page, errors }) => {
    assert.ok((await page.$$eval('.gr-col', (c) => c.length)) >= 1);
    assert.deepEqual(errors, []);
  });
});

test('graph: summary()', () => {
  const jig = parseJig(`---
jig: graph
---
- Ship it
  id:: g1
  type:: goal
  flag:: true
  note:: hmm
- Engine
  type:: component
  depends:: g1
  question:: true
  escalate:: true
`);
  assert.deepEqual(summary(jig), {
    nodes: [
      { id: 'g1', type: 'goal', name: 'Ship it', flag: true, question: false, escalate: false, note: 'hmm' },
      { id: 'engine', type: 'component', name: 'Engine', flag: false, question: true, escalate: true, note: null },
    ],
    flagged: ['g1'],
    questioned: ['engine'],
    escalated: ['engine'],
  });
});
