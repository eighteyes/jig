// view-compose.test.mjs — tests for the compose view.
// Responsibilities:
// - keys move, strike, tag and assign fragments in the file; undo restores
// - assign mode: digits toggle, Escape cancels, Enter commits
// - Enter finishes; the page raises no errors
// - summary(jig) runs in Node

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/compose.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: compose
agents: [kip, patches, lead, worker]
---
- One
  id:: f1
  tokens:: 100
  body of one
  second body line
- Two
  id:: f2
  tokens:: 50
- Three
  id:: f3
  tokens:: 25
`;

test('compose: move, strike, tags, assign, undo, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    assert.match(await page.locator('.cp-total').textContent(), /175 tokens/);
    // body collapsed: first line dimmed, expand shows everything
    assert.match(await page.locator('.cp-body').first().textContent(), /body of one/);
    assert.doesNotMatch(await page.locator('.cp-body').first().textContent(), /second body line/);
    await press(' ');
    assert.match(await page.locator('.cp-body').first().textContent(), /second body line/);
    await press('ArrowLeft');
    assert.doesNotMatch(await page.locator('.cp-body').first().textContent(), /second body line/);

    await press('J');
    let t = await read();
    assert.match(t, /- Two\n {2}id:: f2[\s\S]*- One\n {2}id:: f1[\s\S]*- Three/);
    await press('u');
    t = await read();
    assert.match(t, /- One\n {2}id:: f1[\s\S]*- Two\n {2}id:: f2/);

    await press('x');
    t = await read();
    assert.match(t, /- \[struck\] One/);
    assert.match(await page.locator('.cp-total').textContent(), /75 tokens/);
    await press('u');

    await press('j', 't');
    await page.keyboard.type('tone, safety');
    await press('Enter');
    t = await read();
    assert.match(t, /- Two\n {2}id:: f2\n {2}tokens:: 50\n {2}tags:: tone, safety/);

    await press('a', '2', '4');
    assert.equal(await page.locator('.cp-pick.on').count(), 2);
    await press('Escape');
    t = await read();
    assert.doesNotMatch(t, /agents::/);
    await press('a', '4', '2', 'a');
    t = await read();
    assert.match(t, /tags:: tone, safety\n {2}agents:: patches, worker/);
    await press('u');
    t = await read();
    assert.doesNotMatch(t, /agents::/);

    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('compose: summary reports order, struck, tags, agents, tokens', () => {
  const jig = parseJig(`---
jig: compose
---
- A
  id:: f1
  tokens:: 10
  tags:: x, y
  agents:: lead
- [struck] B
  tokens:: 5
- C
  tokens:: 7
`);
  assert.deepEqual(summary(jig), {
    order: ['f1', 'C'],
    struck: ['B'],
    tagged: { f1: ['x', 'y'] },
    assigned: { f1: ['lead'] },
    tokens: 17,
  });
});
