// views.test.mjs — drive the built views in headless Chrome.
// Responsibilities:
// - matrix: keys move cards between quadrants and the pile, undo restores
// - triage: keys label and advance, undo restores, Enter finishes
// - shared keys: e escalates, i inserts an inline note
// - legend keys are tap targets: clicking one runs its action
// Skips when Playwright is not available (set JIG_PLAYWRIGHT to a dir that has it).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const MATRIX = `---
jig: matrix
axes: {x: urgent, y: important}
---
## Do
## Schedule
## Delegate
## Drop
## Unsorted
- a
- b
- c
`;

test('matrix: move, undo, back to pile', { skip }, async () => {
  await withJig(MATRIX, async ({ press, read, errors }) => {
    await press('1', '4', 'u', '2');
    const t = await read();
    assert.match(t, /## Do\n- a\n## Schedule\n- b\n## Delegate\n## Drop\n## Unsorted\n- c/);
    await press('Tab', '0');
    assert.deepEqual(errors, []);
  });
});

const TRIAGE = `---
jig: triage
actions: {1: accept, 2: reject}
---
- one
- two
- three
`;

test('triage: label, undo, escalate, note, finish', { skip }, async () => {
  await withJig(TRIAGE, async ({ page, press, read, errors, host }) => {
    await press('1', '2', 'u', 'e');
    let t = await read();
    assert.match(t, /- \[accept\] one\n- two\n  escalate:: true\n- three/);
    await press('i');
    await page.keyboard.type('ask Sean');
    await press('Enter');
    t = await read();
    assert.match(t, /- two\n  escalate:: true\n  note:: ask Sean/);
    await press('2', '1', 'Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.match(t, /- \[reject\] two/);
    assert.deepEqual(errors, []);
  });
});

test('legend: tapping a key runs its action, undo included', { skip }, async () => {
  await withJig(MATRIX, async ({ page, read, errors }) => {
    const tap = async (label) => { await page.locator('#legend .key', { hasText: new RegExp(`^${label}$`) }).first().click(); await page.waitForTimeout(150); };
    await tap('1');
    await tap('3');
    assert.match(await read(), /## Do\n- a\n## Schedule\n## Delegate\n- b\n/);
    await tap('u');
    assert.match(await read(), /## Delegate\n## Drop\n## Unsorted\n- b\n- c/);
    assert.deepEqual(errors, []);
  });
});
