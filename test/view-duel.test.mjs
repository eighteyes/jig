// view-duel.test.mjs — tests for the duel view.
// Responsibilities:
// - crown updates ratings, counts and the Votes section; undo restores the file exactly
// - tie mode and eliminate mode commit votes; eliminated contenders leave the rounds
// - the seed makes the first round repeatable; media renders as audio elements
// - the page raises no errors
// - summary(jig) runs in Node

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/duel.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: duel
per_round: 3
seed: 7
---
- take A
- take B
- take C
- take D
`;

const names = (page) => page.$$eval('.dl-round .dl-name', (ns) => ns.map((n) => n.textContent));
const item = (text, t) => parseJig(t).sections.flatMap((s) => s.items).find((i) => i.text === text);

function wav() {
  const data = Buffer.alloc(64, 128);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(8000, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

test('duel: crown, undo, tie, eliminate, skip, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    let group = await names(page);
    assert.equal(group.length, 3);
    assert.equal(await page.locator('.dl-stand li').count(), 4);

    // crown slot 2 (Shift+2): winner gains up to win_k (16), each loser drops about loss_k/2 (48/2) from 1500
    await press('Shift+Digit2');
    let t = await read();
    const [a, b, c] = group;
    assert.equal(item(a, t).fields.rating, '1476');           // first pair, equal ratings: -48 * 0.5
    assert.equal(item(b, t).fields.rating, '1515.82');        // +8, then +7.82 against 1500 from 1508
    assert.equal(item(c, t).fields.rating, '1476.55');
    assert.equal(item(b, t).fields.wins, '1');
    assert.equal(item(a, t).fields.losses, '1');
    assert.equal(item(a, t).fields.comparisons, '1');
    assert.match(t, new RegExp(`## Votes\\n- best: ${b} over ${a}, ${c}\\n?$`));
    assert.notDeepEqual(await names(page), group); // a new round was drawn

    await press('u');
    assert.equal(await read(), FILE);
    assert.deepEqual(await names(page), group);

    // tie: first two marked
    await press('ArrowUp', 'Shift+Digit1', 'Shift+Digit2');
    assert.equal(await page.locator('.dl-card.marked').count(), 2);
    await press('ArrowUp');
    t = await read();
    assert.match(t, new RegExp(`- tie-best: ${a}, ${b} over ${c}`));
    assert.equal(item(a, t).fields.ties, '1');
    assert.ok(Number(item(a, t).fields.rating) > Number(item(c, t).fields.rating));
    await press('u');
    assert.equal(await read(), FILE);

    // cancel a mode with ArrowDown, leaves the file alone
    await press('x', 'Shift+Digit1', 'ArrowDown');
    assert.equal(await page.locator('.dl-card.marked').count(), 0);
    assert.equal(await read(), FILE);

    // eliminate slot 1
    await press('x', 'Shift+Digit1', 'x');
    t = await read();
    assert.match(t, new RegExp(`- \\[eliminated\\] ${a}`));
    assert.match(t, new RegExp(`- eliminate: ${a}\\n?$`));
    for (let i = 0; i < 4; i++) {
      assert.ok(!(await names(page)).includes(a));
      await press('ArrowDown');
    }
    assert.equal(await page.locator('.dl-stand li.out').count(), 1);
    await press('u', 'u', 'u', 'u', 'u'); // four skips, then the elimination
    assert.equal(await read(), FILE);

    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('duel: the seed repeats the first round; media renders and plays without errors', { skip }, async () => {
  const media = FILE.replace(/- take (\w)/g, '- take $1\n  audio:: $1.wav');
  const firsts = [];
  for (let i = 0; i < 2; i++) {
    await withJig(media, async ({ page, press, file, errors }) => {
      for (const f of ['A', 'B', 'C', 'D']) await fs.writeFile(path.join(path.dirname(file), `${f}.wav`), wav());
      firsts.push(await names(page));
      assert.equal(await page.locator('.dl-round audio').count(), 3);
      assert.match(await page.locator('.dl-round audio').first().getAttribute('src'), /^\/media\/[A-D]\.wav$/);
      await press('1', '2', '3', '4');
      assert.deepEqual(errors, []);
    });
  }
  assert.deepEqual(firsts[0], firsts[1]);
});

test('duel: summary(jig)', () => {
  const jig = parseJig(`---\njig: duel\n---\n- a\n  rating:: 1532\n- [eliminated] b\n  rating:: 1400\n- c\n## Votes\n- best: a over b, c\n`);
  assert.deepEqual(summary(jig), {
    ranking: ['a', 'c'],
    ratings: { a: 1532, b: 1400, c: 1500 },
    votes: ['best: a over b, c'],
    eliminated: ['b'],
  });
});
