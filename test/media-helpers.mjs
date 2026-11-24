// media-helpers.mjs — tiny media fixtures for view tests.
// Responsibilities:
// - PNG: a 1-pixel image; wav(): a short silent WAV
// - addMedia(): write files beside a running jig, then reload so the page requests them

import fs from 'node:fs/promises';
import path from 'node:path';

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

/** A short silent 8 kHz 16-bit mono WAV. */
export function wav(samples = 800) {
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Write media beside the jig file, then reload so the page requests it. */
export async function addMedia(page, file, files, errors = []) {
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(path.dirname(file), name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }
  await page.reload();
  await page.waitForFunction(() => /ready|saved/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 5000 });
  errors.length = 0;   // the first load asked for files that did not exist yet
}
