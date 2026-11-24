// view-tour.test.mjs — tests for the tour view.
// Responsibilities:
// - keys change the file: keep, cut, link, walk push/pop, naming a projection; undo restores each
// - Enter arms a warning while points are undecided, then finishes; the page raises no errors
// - a first frame draws on mount; lens keys (space, digits, seek) leave the file alone
// - summary(jig) runs in Node and reports kept, cut, projections, links, walk, dims

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/tour.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: tour
dims: [speed, cost, risk]
seed: 3
---
- A
  speed:: 3
  cost:: 1
  risk:: 2
  tags:: x
- B
  speed:: 1
  cost:: 3
  risk:: 0
- C
  speed:: 2
  cost:: 2
  risk:: 3
  tags:: y
`;

test('tour: dispositions change the file, undo restores, Enter finishes', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    // one frame drawn on mount: some canvas pixel is painted
    const painted = await page.evaluate(() => {
      const c = document.querySelector('.tr-field canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 === 3 && v > 0);
    });
    assert.ok(painted);
    const orig = await read();
    const focused = () => page.locator('.tr-name').textContent();
    const moveFocus = async () => {   // focus walks the x axis: step down, or up from the far end
      const before = await focused();
      await press('ArrowDown');
      if ((await focused()) === before) await press('ArrowUp');
    };
    // lens keys never touch the file
    await press(' ', '1', 'ArrowRight', 'ArrowLeft', 'r', '[', ']', 's', 's', 'f', 'f', 'f');
    assert.equal(await read(), orig);

    await press('k');
    assert.match(await read(), /- \[keep\] [ABC]\n/);
    await press('x');
    let t = await read();
    assert.match(t, /- \[cut\] [ABC]\n/);
    assert.doesNotMatch(t, /\[keep\]/);
    await press('u', 'u');
    assert.equal(await read(), orig);

    // link two points: arm, move focus, link
    await press('l');
    await moveFocus();
    await press('l');
    t = await read();
    assert.match(t, /## Links\n- [ABC] -> [ABC]/);
    await press('u');
    assert.equal(await read(), orig);

    await press('w');
    await moveFocus();
    await press('w');
    t = await read();
    assert.match(t, /## Walk\n- [ABC]\n- [ABC]/);
    await press('W');
    assert.doesNotMatch(await read(), /## Walk\n- [ABC]\n- [ABC]/);
    await press('u', 'u', 'u');
    assert.equal(await read(), orig);

    await press('p');
    await page.keyboard.type('fast-cheap');
    await press('Enter');
    t = await read();
    assert.match(t, /projections: \{fast-cheap: \{speed: \{u: -?[\d.]+, v: -?[\d.]+\}/);
    assert.deepEqual(Object.keys(summary(parseJig(t)).projections), ['fast-cheap']);
    await press('u');
    assert.equal(await read(), orig);

    await press('k');
    await press('Enter');
    assert.match(await page.locator('.tr-warn').textContent(), /not kept or cut/);
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('tour: summary reports kept, cut, links, walk and dims', () => {
  const jig = parseJig(`---
jig: tour
dims: [a, {key: b, label: Bee}]
projections: {p: {a: {u: 1, v: 0}}}
---
- [keep] one
  a:: 1
- [cut] two
- three
## Links
- one -> two
  note:: same vendor
## Walk
- two
- one
`);
  assert.deepEqual(summary(jig), {
    kept: ['one'],
    cut: ['two'],
    projections: { p: { a: { u: 1, v: 0 } } },
    links: [{ from: 'one', to: 'two', note: 'same vendor' }],
    walk: ['two', 'one'],
    dims: ['a', 'b'],
  });
});
