// view-tag.test.mjs — tests for the tag view.
// Responsibilities:
// - leader sequences commit tags (toggle, advance), Shift+leader holds, Escape leaves tag mode
// - N mints a tag into meta.tags and applies it; flags, x and 0 set label and clear; u undoes
// - media pane shows the focused row's clip
// - Enter warns while rows are untagged, then finishes
// - summary(jig) runs in Node: by_tag, by_flag, unanswered, unusable, unused_tags

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { PNG, wav, addMedia } from './media-helpers.mjs';
import { summary } from '../views/tag.mjs';
import { parseJig } from '../web/format.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const FILE = `---
jig: tag
leader: t
tags: {a: alpha, br: bravo}
flags: {g: good, b: bad}
---
- clip one
  audio:: clips/one.wav
- clip two
  img:: pic.png
- clip three
- clip four
`;

test('tag: sequences, hold, escape, mint, flags, unusable, clear, undo, finish', { skip }, async () => {
  await withJig(FILE, async ({ page, press, read, file, errors, host }) => {
    await addMedia(page, file, { 'clips/one.wav': wav(), 'pic.png': PNG }, errors);
    assert.equal(await page.locator('.jig-media-box audio').getAttribute('src'), '/media/clips/one.wav');
    // 'a' is unique -> commits alpha on row one and advances
    await press('t', 'a');
    assert.match(await read(), /- clip one\n {2}audio:: clips\/one\.wav\n {2}tags:: alpha\n- clip two/);
    assert.equal(await page.locator('.jig-media-box img').getAttribute('src'), '/media/pic.png');
    // T holds focus: tags row two without advancing
    await press('T', 'b');
    assert.match(await read(), /- clip two\n {2}img:: pic\.png\n {2}tags:: bravo/);
    assert.equal(await page.locator('.jig-media-box img').count(), 1);
    // toggling off, then Escape leaves tag mode without a tag
    await press('T', 'b');
    assert.doesNotMatch(await read(), /tags:: bravo/);
    await press('t', 'Escape', 'j');
    // now on row three: mint
    await press('N');
    await page.keyboard.type('dl delta');
    await press('Enter');
    let t = await read();
    assert.match(t, /tags: \{a: alpha, br: bravo, dl: delta\}/);
    assert.match(t, /- clip three\n {2}tags:: delta/);
    await press('u');
    t = await read();
    assert.match(t, /tags: \{a: alpha, br: bravo\}/);
    assert.doesNotMatch(t, /delta/);
    await press('g');
    assert.match(await read(), /- \[good\] clip three/);
    await press('b');
    assert.match(await read(), /- \[bad\] clip four/);
    await press('k', 'x');
    t = await read();
    assert.match(t, /- \[unusable\] clip three/);
    await press('k', '0');
    assert.match(await read(), /- clip three\n- \[bad\] clip four/);
    await press('Enter');
    assert.match(await page.locator('.tg-warn').textContent(), /not tagged/);
    await press('t', 'a');
    await press('Enter');
    assert.match(await page.locator('.tg-warn').textContent(), /1 row not tagged/);
    await press('Enter');
    t = await host.done;
    assert.match(t, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('tag: summary reports tags, flags, unanswered, unusable, unused', () => {
  const jig = parseJig(`---\njig: tag\ntags: {a: alpha, b: bravo, c: charlie}\nflags: {g: good}\n---\n- [good] one\n  tags:: alpha\n- [unusable] two\n- three\n- four\n  tags:: alpha, bravo\n`);
  assert.deepEqual(summary(jig), {
    by_tag: { alpha: ['one', 'four'], bravo: ['four'] },
    by_flag: { good: ['one'] },
    unanswered: ['three'],
    unusable: ['two'],
    unused_tags: ['charlie'],
  });
});

test('tag: ambiguous sequence waits; Enter commits the exact match', { skip }, async () => {
  const text = `---\njig: tag\ntags: {a: alpha, ab: abel}\n---\n- one\n- two\n`;
  await withJig(text, async ({ page, press, read, errors }) => {
    await press('t', 'a');
    assert.match(await page.locator('.tg-mode').textContent(), /a▮/);
    assert.doesNotMatch(await read(), /tags::/);
    await press('b');
    assert.match(await read(), /- one\n {2}tags:: abel\n- two/);
    await press('t', 'a', 'Enter');
    assert.match(await read(), /- two\n {2}tags:: alpha/);
    assert.deepEqual(errors, []);
  });
});
