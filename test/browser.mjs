// browser.mjs — headless browser helper for view tests.
// Responsibilities:
// - find Playwright without making it a dependency (JIG_PLAYWRIGHT dir, else a global install)
// - open a jig file through the real host in headless Chrome
// - collect page errors; hand the test a page plus helpers to press keys and read the file back
// - report `available: false` so view tests skip cleanly where no browser exists

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startHost } from '../src/host.mjs';

let chromium = null;
for (const base of [process.env.JIG_PLAYWRIGHT, process.cwd() + '/']) {
  if (!base) continue;
  try { ({ chromium } = createRequire(base.endsWith('/') ? base : base + '/')('playwright')); break; } catch { /* next */ }
}

export const available = Boolean(chromium);
let browser = null;

async function launch() {
  if (browser) return browser;
  try { browser = await chromium.launch({ channel: 'chrome' }); }
  catch { browser = await chromium.launch(); }
  return browser;
}

export async function closeBrowser() { if (browser) await browser.close(); browser = null; }

/**
 * Write `text` to a temp jig file, open it, run fn({ page, press, file, read, errors }).
 * press(...keys) presses each key with a short settle; read() returns the file text.
 */
export async function withJig(text, fn, { name = 'jig.md', viewport = { width: 1100, height: 800 } } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jig-view-'));
  const file = path.join(dir, name);
  await fs.writeFile(file, text);
  const host = await startHost(file);
  const b = await launch();
  const page = await b.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(host.url);
  await page.waitForFunction(() => /ready|saved/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 5000 });
  const press = async (...keys) => {
    for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(60); }
    await page.waitForFunction(() => document.getElementById('status')?.textContent !== 'saving', null, { timeout: 5000 });
  };
  const read = () => fs.readFile(file, 'utf8');
  try { return await fn({ page, press, file, read, errors, host }); }
  finally { await page.close(); host.close(); }
}
