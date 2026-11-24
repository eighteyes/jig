// view-explore.test.mjs — tests for the explore view.
// Responsibilities:
// - list keys: focus, dimension, rating nudge / set / clear write the file; undo restores
// - thresholds: > < = 0 - write meta.thresholds and hide items; gates toggle with g
// - labels: k x p write labels; Enter arms a warning, then finishes
// - compete: a bout writes rating / wins / losses / comparisons; undo restores; Escape leaves
// - scatter: v shows points, arrows step focus
// - summary(jig) runs in Node
// Assertions read the file and the DOM, never playback.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { summary } from '../views/explore.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: explore
seed: 1
dimensions:
  - {key: hnr_db, label: HNR, group: quality, dp: 1, low: 5, high: 25, prefer_high: true}
  - {key: pause_frac, label: Pauses, group: pacing, dp: 2, gate: true, low: 0, high: 0.5}
---
- take 1
  hnr_db:: 20
  pause_frac:: 0.2
  rating:: 1600
  audio:: takes/1a.wav, takes/1b.wav
- take 2
  hnr_db:: 14
  pause_frac:: 0.6
  rating:: 1400
- take 3
  hnr_db:: 8
  pause_frac:: 0.1
- take 4
  hnr_db:: 17
  pause_frac:: 0.3
`;

const names = (page, sel) => page.$$eval(sel, (n) => n.map((x) => x.textContent));
const focusName = (page) => page.$eval('.xp-row.on .xp-nm', (n) => n.firstChild.textContent);
const counts = (page) => page.$eval('.xp-counts', (n) => n.textContent);

async function shot(page, name) {
  if (process.env.JIG_SHOT) await page.screenshot({ path: `${process.env.JIG_SHOT}/explore-${name}.png` });
}

test('explore: list keys rate, clear, undo', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors }) => {
    await press('g'); // gates off: all four visible
    assert.equal(await focusName(page), 'take 1');
    await press('ArrowRight'); // HNR: 20, 17, 14, 8
    assert.deepEqual((await names(page, '.xp-row .xp-nm')).map((t) => t.slice(0, 6)), ['take 1', 'take 4', 'take 2', 'take 3']);
    await press('ArrowDown');
    assert.equal(await focusName(page), 'take 4');
    await press(']');
    assert.match(await read(), /- take 4\n {2}hnr_db:: 17\n {2}pause_frac:: 0.3\n {2}rating:: 1525/);
    await press('!');
    assert.match(await read(), /rating:: 1300/);
    await press('u');
    assert.match(await read(), /rating:: 1525/);
    await press('\\');
    assert.doesNotMatch(await read(), /- take 4[^]*?rating::[^]*?$/);
    await press('u', 'u');
    assert.doesNotMatch((await read()).split('- take 4')[1], /rating::/);
    await press('End');
    assert.equal(await focusName(page), 'take 3');
    await press('Home', 'ArrowLeft');
    assert.match(await page.$eval('.xp-head', (n) => n.textContent), /Rating/);
    await shot(page, 'list');
    assert.deepEqual(errors, []);
  });
});

test('explore: thresholds hide items and gates toggle', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors }) => {
    assert.match(await counts(page), /1 hidden/); // take 2 fails the pause gate (0.6 > 0.5)
    await press('g');
    assert.match(await counts(page), /0 hidden/);
    await press('g', 'ArrowRight', 'ArrowDown'); // HNR, focus take 4 (17)
    await press('>');
    assert.match(await read(), /thresholds: \{hnr_db: \{min: 17\}\}/);
    assert.match(await counts(page), /2 hidden/);
    await press('<');
    assert.match(await read(), /thresholds: \{hnr_db: \{max: 17\}\}/);
    await press('u');
    assert.match(await read(), /\{min: 17\}/);
    await press('0');
    assert.doesNotMatch(await read(), /thresholds/);
    await press('=');
    await page.keyboard.type('>10');
    await press('Enter');
    assert.match(await read(), /thresholds: \{hnr_db: \{min: 10\}\}/);
    assert.match(await counts(page), /2 hidden/); // take 3 (8) below; take 2 gated
    await press('u');
    assert.doesNotMatch(await read(), /thresholds/);
    await press('>', '-');
    assert.doesNotMatch(await read(), /thresholds/);
    assert.deepEqual(errors, []);
  });
});

test('explore: thresholds in meta hide on load', { skip }, async () => {
  await withJig(FILE.replace('seed: 1', 'thresholds: {hnr_db: {min: 15}}'), async ({ page, errors }) => {
    assert.match(await counts(page), /2 hidden/);
    assert.deepEqual(await names(page, '.xp-row .xp-nm').then((a) => a.map((t) => t.slice(0, 6))), ['take 1', 'take 4']);
    assert.deepEqual(errors, []);
  });
});

test('explore: keep, cut, promote, Enter arms then finishes', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors, host }) => {
    await press('g', 'k', 'x', 'p'); // gates off: take 2 visible
    let t = await read();
    assert.match(t, /- \[keep\] take 1/);
    assert.match(t, /- \[cut\] take 2/);
    assert.match(t, /- \[promote\] take 3/);
    await press('Enter');
    assert.match(await page.$eval('.xp-warn', (n) => n.textContent), /1 item still unlabelled/);
    await press('Home', 'k'); // toggles keep off
    assert.doesNotMatch(await read(), /\[keep\]/);
    await press('u');
    assert.match(await read(), /\[keep\] take 1/);
    await shot(page, 'labels');
    await press('Enter', 'Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('explore: compete bout writes ratings; undo restores', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, errors }) => {
    await press('g', 'k', 'u'); // all four visible; one save normalises the frontmatter
    const before = await read();
    await press('r');
    const bout = await names(page, '.xp-c .cn');
    assert.equal(bout.length, 4);
    await shot(page, 'compete');
    await press('1', '6');
    const t = await read();
    assert.equal((t.match(/comparisons:: 1/g) || []).length, 3); // losers: one bout each
    assert.equal((t.match(/comparisons:: 3/g) || []).length, 1); // winner: one per loser
    assert.equal((t.match(/wins:: 3/g) || []).length, 1);
    assert.equal((t.match(/losses:: 1/g) || []).length, 3);
    assert.equal((t.match(/rating::/g) || []).length, 4);
    const winner = new RegExp(`- ${bout[0]}\\n(?: {2}.+\\n)*? {2}wins:: 3`);
    assert.match(t, winner);
    await press('u');
    assert.equal(await read(), before);
    await press('ArrowUp'); // tie mode
    assert.match(await page.$eval('.xp-head', (n) => n.textContent), /TIE MODE/);
    await press('6', '7', 'ArrowUp');
    const tied = await read();
    assert.equal((tied.match(/ties:: /g) || []).length, 2);
    await press('Escape');
    assert.equal((await page.$$('.xp-c')).length, 0);
    assert.deepEqual(errors, []);
  });
});

test('explore: scatter shows points; arrows step', { skip }, async () => {
  await withJig(FILE, async ({ page, press, errors }) => {
    await press('g', 'v', ',');
    assert.equal((await page.$$('.xp-plot circle.pt')).length, 4);
    const lab = () => page.$eval('.xp-plot text.lab', (n) => n.textContent);
    const first = await lab();
    await press('ArrowRight');
    assert.notEqual(await lab(), first);
    await shot(page, 'scatter');
    await press('v');
    assert.ok(await page.$('.xp-row'));
    assert.deepEqual(errors, []);
  });
});

test('explore: summary reports ratings, labels, thresholds, survivors', () => {
  const jig = parseJig(`---
jig: explore
thresholds: {hnr_db: {min: 10}}
---
- [keep] a
  hnr_db:: 18
  rating:: 1540
- [cut] b
  hnr_db:: 9
  rating:: 1600
- [promote] c
  hnr_db:: 12
- d
`);
  assert.deepEqual(summary(jig), {
    rated: [{ text: 'b', rating: 1600 }, { text: 'a', rating: 1540 }],
    shortlist: ['a', 'c'],
    cut: ['b'],
    promoted: ['c'],
    thresholds: { hnr_db: { min: 10 } },
    survivors: ['a', 'c'],
  });
});
