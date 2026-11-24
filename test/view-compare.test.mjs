// view-compare.test.mjs — drive the compare view in headless Chrome, plus a Node-only summary test.
// Responsibilities:
// - keys move across paths and milestones, space and x strike, undo restores, Enter finishes
// - columns window to `visible` and slide with focus
// - summary(jig) shape without a DOM
// Skips browser tests when Playwright is not available (set JIG_PLAYWRIGHT).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/compare.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const CMP = `---
jig: compare
visible: 2
---
## Path A
grade:: B
Thesis A.
- a1
- a2
## Path B
Thesis B.
- b1
## Path C
- c1
`;

test('compare: strike, window, undo, escalate, finish', { skip }, async () => {
  await withJig(CMP, async ({ page, press, read, errors, host }) => {
    const cols = () => page.$$eval('.cmp-col h2', (hs) => hs.map((h) => h.textContent));
    assert.equal((await cols()).length, 2);
    await press('ArrowDown', ' ');
    assert.match(await read(), /- \[struck\] a1\n- a2/);
    await press('u');
    assert.doesNotMatch(await read(), /struck/);
    await press('ArrowDown', 'ArrowDown', ' ', 'ArrowDown', ' ');   // a1, a2, then clamped on a2: toggles twice
    await press('Escape');
    await press('l', 'l');
    assert.match((await cols()).join('|'), /Path B.*\|.*Path C/);
    await press('1');
    assert.match((await cols()).join('|'), /Path A/);
    await press('x');
    assert.match(await read(), /## Path A\ngrade:: B\nstruck:: true/);
    await press('u', 'j', 'e');
    assert.match(await read(), /- a1\n {2}escalate:: true/);
    await press('3');
    await page.screenshot({ path: new URL('../.ai/tmp/shots/compare.png', import.meta.url).pathname });
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('compare: summary()', () => {
  const jig = parseJig(`---
jig: compare
---
## A
struck:: true
note:: nope
- x
- [struck] y
## B
escalate:: true
- z
`);
  assert.deepEqual(summary(jig), {
    paths: [
      { path: 'A', struck: true, struck_milestones: ['y'], kept_milestones: ['x'], escalate: false, note: 'nope' },
      { path: 'B', struck: false, struck_milestones: [], kept_milestones: ['z'], escalate: true, note: null },
    ],
    kept: ['B'],
    invalidated: ['A'],
  });
});
