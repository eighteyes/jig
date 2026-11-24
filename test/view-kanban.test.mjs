// view-kanban.test.mjs — tests for the kanban view.
// Responsibilities:
// - mount creates missing lanes; keys move cards, toggle done/delete, set owner, add cards; undo restores
// - Enter arms a warning while the Inbox has cards, then finishes
// - summary(jig) runs in Node and reports lanes, marks, owners and added cards

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/kanban.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: kanban
lanes: [Now, Next]
---
## Inbox
- a
  a note
- b
## Now
- [done] c
  owner:: sam
`;

const poll = async (read, re) => {
  for (let i = 0; i < 50; i++) { const t = await read(); if (re.test(t)) return t; await new Promise((r) => setTimeout(r, 50)); }
  return read();
};

test('kanban: lanes, move, marks, owner, add, undo, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    let t = await poll(read, /## Next/);
    assert.match(t, /## Inbox\n- a/);
    assert.match(t, /## Next\n?$/);
    await press('2');
    t = await read();
    assert.match(t, /## Inbox\n- b\n## Now\n- \[done\] c\n {2}owner:: sam\n\n?## Next\n- a/);
    await press('u');
    t = await read();
    assert.match(t, /## Inbox\n- a\n {2}a note\n- b\n/);
    await press('x');
    assert.match(await read(), /- \[delete\] a/);
    await press('d');
    assert.match(await read(), /- \[done\] a/);
    await press('u', 'u');
    assert.match(await read(), /- a\n {2}a note/);
    await press('j', 'o');
    await page.keyboard.type('kim');
    await press('Enter');
    t = await read();
    assert.match(t, /- b\n {2}owner:: kim/);
    await press('u');
    await press('n');
    await page.keyboard.type('fresh');
    await press('Enter');
    t = await read();
    assert.match(t, /- fresh\n {2}added:: true/);
    await press('k', 'k', ' ');
    assert.equal(await page.locator('.kb-notes').textContent({ timeout: 2000 }), 'a note');
    await press('Enter');
    assert.match(await page.locator('.kb-warn').textContent(), /still in Inbox/);
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('kanban: summary reports lanes and marks', () => {
  const jig = parseJig(`---\njig: kanban\nlanes: [Now]\n---\n## Inbox\n- n\n  added:: true\n## Now\n- [done] a\n  owner:: sam\n- [delete] b\n`);
  assert.deepEqual(summary(jig), {
    by_lane: { Inbox: ['n'], Now: ['a', 'b'] },
    done: ['a'],
    deleted: ['b'],
    owners: { a: 'sam' },
    added: ['n'],
  });
});
