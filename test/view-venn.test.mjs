// view-venn.test.mjs — drive the venn view in headless Chrome, plus a Node-only summary test.
// Responsibilities:
// - keys place cards in regions and the file changes, undo restores
// - missing sections are created from meta.sets
// - Enter arms on Unsorted, second Enter finishes
// - summary(jig) shape

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/venn.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const VENN = `---
jig: venn
sets: {a: fast, b: cheap}
---
## fast only
## cheap only
## Both
## Neither
## Unsorted
- x
- y
- z
`;

test('venn: place, undo, arm, finish', { skip }, async () => {
  await withJig(VENN, async ({ page, press, read, errors, host }) => {
    await press('a', 'b', 'u', 'i');
    let t = await read();
    assert.match(t, /## fast only\n- x\n## cheap only\n## Both\n- y\n## Neither\n## Unsorted\n- z/);
    await press('n', 'Tab');
    t = await read();
    assert.match(t, /## Neither\n- z\n## Unsorted/);
    await page.screenshot({ path: new URL('../.ai/tmp/venn.png', import.meta.url).pathname });
    await press('Tab', '0');
    t = await read();
    assert.match(t, /## Neither\n## Unsorted\n- z/);
    await press('Enter');
    assert.match(await page.textContent('.vn-warn'), /still Unsorted/);
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('venn: creates missing sections from meta.sets', { skip }, async () => {
  await withJig('---\njig: venn\nsets: {a: P, b: Q}\n---\n- one\n', async ({ press, read, errors }) => {
    await press('b');
    const t = await read();
    for (const h of ['## P only', '## Q only', '## Both', '## Neither', '## Unsorted']) assert.ok(t.includes(h), h);
    assert.match(t, /## Q only\n- one/);
    assert.deepEqual(errors, []);
  });
});

test('venn: summary(jig)', () => {
  const jig = parseJig(VENN.replace('- z', '- z\n').replace('## Both', '## Both\n- both one'));
  assert.deepEqual(summary(jig), {
    by_region: { a_only: [], b_only: [], both: ['both one'], neither: [], unsorted: ['x', 'y', 'z'] },
    sets: { a: 'fast', b: 'cheap' },
  });
  const bare = summary(parseJig('---\njig: venn\n---\n- q\n'));
  assert.deepEqual(bare.by_region.unsorted, ['q']);
  assert.deepEqual(bare.sets, { a: 'A', b: 'B' });
});
