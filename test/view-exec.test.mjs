// view-exec.test.mjs — drive the exec view in headless Chrome, plus a Node-only summary test.
// Responsibilities:
// - a/space/x toggle labels in the file, undo restores
// - backticks stay in the file, are stripped on screen
// - Enter arms on pending, second Enter finishes
// - summary(jig) shape

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { available, withJig, closeBrowser } from './browser.mjs';
import { parseJig } from '../web/format.mjs';
import { summary } from '../views/exec.mjs';

const skip = available ? false : 'playwright not found (set JIG_PLAYWRIGHT)';
after(closeBrowser);

const EXEC = `---
jig: exec
---
- \`rm -rf build/\`
  lang:: sh
  danger:: deletes the build folder
- [approve] \`npm test\`
- \`ls\`
`;

test('exec: toggle, undo, arm, finish', { skip }, async () => {
  await withJig(EXEC, async ({ page, press, read, errors, host }) => {
    assert.match(await page.textContent('.ex-item pre'), /^rm -rf build\/$/);
    assert.match(await page.textContent('.ex-danger'), /deletes the build folder/);
    await press('a', 'u');
    assert.doesNotMatch(await read(), /\[approve\] `rm/);
    await press('Space', 'x');
    let t = await read();
    assert.match(t, /- \[reject\] `rm -rf build\/`\n  lang:: sh\n  danger:: deletes the build folder\n- \[approve\] `npm test`/);
    await press('x');
    assert.match(await read(), /- `rm -rf build\/`/);
    await press('j', 'a', 'j', 'a');
    t = await read();
    assert.match(t, /- `rm -rf build\/`/);
    assert.match(t, /- \[approve\] `ls`/);
    assert.match(t, /- `npm test`/);
    await press('k', 'x', 'k', 'x', 'u');
    await page.screenshot({ path: new URL('../.ai/tmp/exec.png', import.meta.url).pathname });
    await press('Enter');
    assert.match(await page.textContent('.ex-warn'), /pending/);
    await press('Enter');
    assert.match(await host.done, /status: done/);
    assert.deepEqual(errors, []);
  });
});

test('exec: summary(jig)', () => {
  const s = summary(parseJig(EXEC));
  assert.deepEqual(s.commands, [
    { cmd: 'rm -rf build/', state: 'pending', danger: 'deletes the build folder', note: null },
    { cmd: 'npm test', state: 'approve', danger: null, note: null },
    { cmd: 'ls', state: 'pending', danger: null, note: null },
  ]);
  assert.deepEqual(s.approved, ['npm test']);
  assert.deepEqual(s.rejected, []);
  assert.deepEqual(s.pending, ['rm -rf build/', 'ls']);
});
