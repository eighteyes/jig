// view-breadboard.test.mjs — drive the breadboard view in headless Chrome, plus a Node-only summary test.
// Responsibilities:
// - keys move across places, m q x change the file, undo restores, Enter finishes
// - wire highlighting on focus
// - summary(jig) shape without a DOM
// Skips browser tests when Playwright is not available (set JIG_PLAYWRIGHT).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/breadboard.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const BB = `---
jig: breadboard
---
## Login page
- Email field
  id:: a1
  kind:: ui
  wires:: a2>control
- Submit
  id:: a2
  kind:: ui
  control:: button
  wires:: c1>data
## Auth service
- Check password
  id:: c1
  kind:: code
`;

test('breadboard: move, flag, question, strike, undo, finish', { skip }, async () => {
  await withJig(BB, async ({ page, press, read, errors, host }) => {
    assert.equal(await page.$$eval('.bb-col', (c) => c.length), 2);
    assert.match(await page.textContent('.bb-aff.active'), /Email field/);
    assert.match(await page.textContent('.bb-aff.active .w'), /→ Submit · control/);
    assert.equal(await page.$$eval('.bb-aff.to', (n) => n.length), 1);
    await press('m');
    assert.match(await read(), /id:: a1\n {2}kind:: ui\n {2}wires:: a2>control\n {2}flag:: true/);
    await press('u');
    assert.doesNotMatch(await read(), /flag::/);
    await press('j', 'x');
    assert.match(await read(), /- \[struck\] Submit/);
    await press('u');
    assert.doesNotMatch(await read(), /struck/);
    await press('q');
    assert.match(await read(), /question:: true/);
    await press('l');
    assert.match(await page.textContent('.bb-aff.active'), /Check password/);
    assert.match(await page.textContent('.bb-aff.active .bb-in'), /Submit · data/);
    assert.equal(await page.$$eval('.bb-aff.from', (n) => n.length), 1);
    await press('x');
    await page.screenshot({ path: new URL('../.ai/tmp/shots/breadboard.png', import.meta.url).pathname });
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('breadboard: summary()', () => {
  const jig = parseJig(`---
jig: breadboard
---
## Login
- Email
  id:: a1
  kind:: ui
  flag:: true
  note:: too vague
- [struck] Submit
  kind:: ui
  question:: true
## Auth
- Check
  id:: c1
  kind:: code
`);
  assert.deepEqual(summary(jig), {
    affordances: [
      { id: 'a1', place: 'Login', name: 'Email', kind: 'ui', flag: true, question: false, struck: false, note: 'too vague' },
      { id: 'submit', place: 'Login', name: 'Submit', kind: 'ui', flag: false, question: true, struck: true, note: null },
      { id: 'c1', place: 'Auth', name: 'Check', kind: 'code', flag: false, question: false, struck: false, note: null },
    ],
    flagged: ['a1'],
    struck: ['submit'],
    questioned: ['submit'],
    comments: [{ id: 'a1', comment: 'too vague' }],
  });
});
