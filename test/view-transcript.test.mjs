// view-transcript.test.mjs — tests for the transcript view.
// Responsibilities:
// - keys mark turns, expand long turns, escalate; undo restores
// - Enter finishes; the page raises no errors
// - summary(jig) runs in Node

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/transcript.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const long = Array.from({ length: 10 }, (_, i) => `  line ${i + 2}`).join('\n');
const FILE = `---
jig: transcript
---
- user: hello
- assistant: hi there
  second line
- tool: run it
${long}
- weird: not a role
`;

test('transcript: mark, expand, escalate, undo, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    assert.deepEqual(await page.locator('.tr-role').allTextContents(), ['user', 'assistant', 'tool', 'system']);
    await press('j', 'm');
    let t = await read();
    assert.match(t, /- \[mark\] assistant: hi there/);
    await press('u');
    t = await read();
    assert.match(t, /- assistant: hi there/);
    await press('m', 'e');
    t = await read();
    assert.match(t, /- \[mark\] assistant: hi there\n {2}escalate:: true/);

    await press('j');
    assert.match(await page.locator('.tr-turn.active .tr-more').textContent(), /more lines/);
    assert.doesNotMatch(await page.locator('.tr-turn.active .tr-text').textContent(), /line 11/);
    await press(' ');
    assert.match(await page.locator('.tr-turn.active .tr-text').textContent(), /line 11/);

    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('transcript: summary reports marked turns, escalated, count', () => {
  const jig = parseJig(`---
jig: transcript
---
- user: hello
- [mark] assistant: reply
  more
  escalate:: true
- [mark] oops: no role
`);
  const s = summary(jig);
  assert.equal(s.turns, 3);
  assert.deepEqual(s.marked, [
    { i: 1, role: 'assistant', text: 'reply\nmore\nescalate:: true' },
    { i: 2, role: 'system', text: 'oops: no role' },
  ]);
  assert.deepEqual(s.escalated, []);
});
