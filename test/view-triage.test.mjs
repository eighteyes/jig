// view-triage.test.mjs — tests for the triage view's media, multi-label and unusable keys.
// Responsibilities:
// - media pane: image src, space zoom, clip stepping, speed readout, audio player src
// - multi: Shift+digit adds labels without advancing; digit sets one label and advances
// - x toggles unusable, 0 clears, u undoes, Enter finishes
// - summary(jig) runs in Node and reports labels, unanswered, unusable, escalated

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { PNG, wav, addMedia } from './media-helpers.mjs';
import { summary } from '../views/triage.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const MEDIA = { 'pic.png': PNG, 'pic2.png': PNG, 'clips/s.wav': wav() };

const FILE = `---
jig: triage
multi: true
actions: {1: a, 2: b, 3: c}
---
- one
  img:: pic.png, pic2.png
- two
  audio:: clips/s.wav
- three
`;

test('triage: media pane, zoom, clips, speed', { skip }, async () => {
  await withJig(FILE, async ({ page, press, file, errors }) => {
    await addMedia(page, file, MEDIA, errors);
    const src = () => page.locator('.jig-media-box img, .jig-media-box audio').first().getAttribute('src');
    assert.equal(await src(), '/media/pic.png');
    await page.waitForFunction(() => document.querySelector('.jig-media-box img')?.naturalWidth === 1);
    await press(' ');
    assert.equal(await page.locator('.jig-media-box img.zoomed').count(), 1);
    await press(' ');
    assert.equal(await page.locator('.jig-media-box img.zoomed').count(), 0);
    await press('.');
    assert.equal(await src(), '/media/pic2.png');
    await press(',');
    assert.equal(await src(), '/media/pic.png');
    assert.equal(await page.locator('.jig-speed').textContent(), '1x');
    await press(']');
    assert.equal(await page.locator('.jig-speed').textContent(), '1.5x');
    await press(']', ']');
    assert.equal(await page.locator('.jig-speed').textContent(), '2x');
    await press('[', '[', '[', '[', '[', '[');
    assert.equal(await page.locator('.jig-speed').textContent(), '0.25x');
    await press('3');
    assert.equal(await src(), '/media/clips/s.wav');
    assert.equal(await page.locator('.jig-media-box audio').count(), 1);
    assert.equal(await page.locator('.jig-media-box audio').evaluate((a) => a.playbackRate), 0.25);
    assert.deepEqual(errors, []);
  });
});

test('triage: multi labels, unusable, clear, undo, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, file, errors, host }) => {
    await addMedia(page, file, MEDIA, errors);
    await press('Shift+1', 'Shift+2');
    assert.match(await read(), /- \[a, b\] one\n/);
    await press('Shift+1');
    assert.match(await read(), /- \[a, b\] one\n/);
    await press('3');
    assert.match(await read(), /- \[c\] one\n/);
    await press('u');
    assert.match(await read(), /- \[a, b\] one\n/);
    await press('x');
    assert.match(await read(), /- \[unusable\] one\n/);
    await press('u');
    assert.match(await read(), /- \[a, b\] one\n/);
    await press('x', 'k', 'x');
    assert.match(await read(), /- one\n/);
    await press('1', 'k', '0');
    assert.match(await read(), /- one\n/);
    await press('1', '2', '3', 'Enter');
    const t = await host.done;
    assert.match(t, /- \[a\] one/);
    assert.match(t, /- \[b\] two/);
    assert.match(t, /- \[c\] three/);
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('triage: summary reports labels, unanswered, unusable, escalated', () => {
  const jig = parseJig(`---\njig: triage\nmulti: true\n---\n- [a, b] one\n- [unusable] two\n- three\n  escalate:: true\n- [b] four\n`);
  assert.deepEqual(summary(jig), {
    by_label: { a: ['one'], b: ['one', 'four'] },
    unanswered: ['three'],
    unusable: ['two'],
    escalated: ['three'],
  });
});
