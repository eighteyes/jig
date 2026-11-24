// view-score.test.mjs — drive the score view in headless Chrome, and check its summary in Node.
// Responsibilities:
// - keys move the cell focus, strike cells, strike options, drop criteria
// - undo restores the file; Enter finishes; no page errors
// - summary(jig) shape

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/score.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const SCORE = `---
jig: score
criteria: [cost, speed, risk]
dropped: []
---
- Postgres
  cost:: low
  speed:: high
  risk:: low
- [struck] Mongo
  cost:: med
  struck:: speed
`;

test('score: strike cell, option, drop criterion, undo, finish', { skip }, async () => {
  await withJig(SCORE, async ({ page, press, read, host, errors }) => {
    await press('ArrowRight', ' ');
    let t = await read();
    assert.match(t, /- Postgres\n  cost:: low\n  speed:: high\n  risk:: low\n  struck:: speed/);
    await press('u');
    t = await read();
    assert.match(t, /- Postgres\n  cost:: low\n  speed:: high\n  risk:: low\n- \[struck\] Mongo/);
    await press(' ', 'j', 'x');
    t = await read();
    assert.match(t, /^- Mongo$/m);
    await press('u', 'k', 'x');
    assert.match(await read(), /- \[struck\] Postgres/);
    await press('X');
    assert.match(await read(), /dropped: \[speed\]/);
    await press('u', 'u');
    t = await read();
    assert.match(t, /^- Postgres$/m);
    assert.match(t, /dropped: \[\]/);
    await press('X');
    await page.screenshot({ path: new URL('../.ai/tmp/score.png', import.meta.url).pathname });
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('score: summary', () => {
  const jig = parseJig(SCORE.replace('dropped: []', 'dropped: [risk]'));
  const s = summary(jig);
  assert.deepEqual(s.invalidated, ['Mongo']);
  assert.deepEqual(s.survivors, ['Postgres']);
  assert.deepEqual(s.dropped_criteria, ['risk']);
  assert.deepEqual(s.options[1], { option: 'Mongo', struck: true, struck_cells: ['speed'], escalate: false, note: null });
});
