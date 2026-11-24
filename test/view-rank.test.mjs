// view-rank.test.mjs — drive the rank view in headless Chrome, and check its summary in Node.
// Responsibilities:
// - display order follows score; keys keep, cut, promote the focused entry; undo restores
// - Enter finishes without arming; no page errors
// - summary(jig) shape

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/rank.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const RANK = `---
jig: rank
---
- Option A
  score:: 1620
  wins:: 7
  losses:: 2
- [keep] Option B
  score:: 1580
- Option C
  score:: 1710
`;

test('rank: sorted focus, keep, cut, promote, undo, finish', { skip }, async () => {
  await withJig(RANK, async ({ page, press, read, host, errors }) => {
    // first focused row is the top score: Option C
    await press('p');
    assert.match(await read(), /- \[promote\] Option C/);
    await press('j', 'x');
    assert.match(await read(), /- \[cut\] Option A/);
    await press('m');
    assert.match(await read(), /- \[keep\] Option A/);
    await press('u', 'u');
    assert.match(await read(), /- Option A/);
    assert.match(await read(), /- \[promote\] Option C/);
    await press('j', 'j', 'x');
    await page.screenshot({ path: new URL('../.ai/tmp/rank.png', import.meta.url).pathname });
    await press('Enter');
    const t = await host.done;
    assert.match(t, /status: done/);
    assert.match(t, /- Option A\n/);
    assert.deepEqual(errors, []);
  });
});

test('rank: summary', () => {
  const s = summary(parseJig(RANK.replace('- Option A', '- [promote] Option A').replace('- Option C', '- [cut] Option C')));
  assert.deepEqual(s.ranking.map((r) => [r.label, r.rank, r.score, r.mark]), [
    ['Option C', 1, 1710, 'cut'], ['Option A', 2, 1620, 'promote'], ['Option B', 3, 1580, 'keep'],
  ]);
  assert.deepEqual(s.shortlist, ['Option A', 'Option B']);
  assert.deepEqual(s.cut, ['Option C']);
  assert.deepEqual(s.promoted, ['Option A']);
});
