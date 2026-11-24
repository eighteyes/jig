// smoke.mjs — drive the triage and matrix views headless and report the saved files.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { startHost } from '../../src/host.mjs';
const require = createRequire('/Users/god/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const dir = new URL('./run/', import.meta.url).pathname;
const browser = await chromium.launch({ channel: 'chrome' });
async function drive(name, keys, shot) {
  const file = dir + name;
  const host = await startHost(file);
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(host.url);
  await page.waitForSelector('#status.saved, #status:text("ready")', { timeout: 5000 }).catch(() => {});
  for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(120); }
  await page.screenshot({ path: dir + shot, fullPage: true });
  const status = await page.textContent('#status');
  console.log(`== ${name} status=${status} errors=${JSON.stringify(errs)}`);
  console.log(await fs.readFile(file, 'utf8'));
  await page.close(); host.close();
}
await drive('triage.md', ['1', '2', 'u', '3', '2', 'Enter'], 'triage.png');
await drive('matrix.md', ['1', '2', 'u', '4', '1', 'Tab', '0'], 'matrix.png');
await browser.close();
