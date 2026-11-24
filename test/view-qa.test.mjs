// view-qa.test.mjs — drive the qa view in headless Chrome, plus a Node-only summary test.
// Responsibilities:
// - keys pick, skip, explain and ask; custom answer; undo restores; Enter arms then finishes
// - summary(jig) shape without a DOM
// Skips browser tests when Playwright is not available (set JIG_PLAYWRIGHT).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/qa.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const QA = `---
jig: qa
title: t
multi: false
---
Doc text.
## Which database?
- Postgres
  what:: joins
- [x] SQLite
## Which queue?
- Redis
- Notify
`;

test('qa: pick, skip, custom, undo, arm, finish', { skip }, async () => {
  await withJig(QA, async ({ page, press, read, errors, host }) => {
    await press('k', '2');                  // focus starts on the first open question; k goes back, 2 unpicks SQLite
    let t = await read();
    assert.doesNotMatch(t, /\[x\]/);
    await press('1');
    assert.match(await read(), /- \[x\] Postgres\n {2}what:: joins\n- SQLite/);
    await press('2', 'u');
    assert.match(await read(), /- \[x\] Postgres/);
    await press('j', 's');
    assert.match(await read(), /## Which queue\?\nskip:: true/);
    await press('s', 'w');
    await page.keyboard.type('Valkey');
    await press('Enter');
    t = await read();
    assert.match(t, /- \[x\] Valkey\n {2}custom:: true/);
    await press('u');
    assert.doesNotMatch(await read(), /Valkey/);
    await press('?', 'a', 'e');
    t = await read();
    assert.match(t, /explain:: true/);
    assert.match(t, /ask:: true/);
    assert.match(t, /escalate:: true/);
    await press('Enter');                   // queue unanswered: arms
    assert.match(await page.textContent('.qa-warn'), /Press Enter again/);
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('qa: multi allows several picks; screenshot', { skip }, async () => {
  await withJig(QA.replace('multi: false', 'multi: true'), async ({ page, press, read, errors }) => {
    await press('k', '1');
    assert.match(await read(), /- \[x\] Postgres[\s\S]*- \[x\] SQLite/);
    await press('j', 'w');
    await page.keyboard.type('Something else');
    await page.screenshot({ path: new URL('../.ai/tmp/shots/qa.png', import.meta.url).pathname });
    await press('Escape');
    assert.deepEqual(errors, []);
  });
});

test('qa: summary()', () => {
  const jig = parseJig(`---
jig: qa
---
## A
- one
- [x] two
- [x] mine
  custom:: true
## B
skip:: true
- x
## C
explain:: true
- y
`);
  assert.deepEqual(summary(jig), {
    answers: [
      { question: 'A', picks: ['two'], custom: 'mine', skip: false, explain: false, ask: false },
      { question: 'B', picks: [], custom: null, skip: true, explain: false, ask: false },
      { question: 'C', picks: [], custom: null, skip: false, explain: true, ask: false },
    ],
    unanswered: ['C'],
  });
});
