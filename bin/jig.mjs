#!/usr/bin/env node
// jig.mjs — command line for jigs.
// Responsibilities:
// - `jig open FILE`: serve one jig in a browser tab, block until it is finished, print a JSON summary
// - `jig summary FILE`: print the JSON summary of a jig file without opening it
// - open the tab with the platform's opener unless --no-open
// - exit 0 when the jig is done, 130 on interrupt

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startHost } from '../src/host.mjs';
import { parseJig, summarize } from '../web/format.mjs';

const VIEWS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'views');

/** Generic summary plus the view's own summary(jig) when it exports one. */
export async function summaryOf(file, text) {
  const jig = parseJig(text);
  const out = { file: path.resolve(file), ...summarize(jig) };
  const type = jig.meta.jig;
  if (type && /^[a-z][a-z0-9-]*$/.test(type)) {
    try {
      const view = await import(pathToFileURL(path.join(VIEWS, `${type}.mjs`)).href);
      if (typeof view.summary === 'function') out.view = view.summary(jig);
    } catch { /* no view module: generic summary only */ }
  }
  return out;
}

const USAGE = `usage: jig open FILE [--port N] [--no-open]
       jig summary FILE

  open     Serves FILE in a local browser tab and waits until it is finished.
           The result is written into FILE; a JSON summary is printed on stdout.
  summary  Prints the JSON summary of FILE as it stands.`;

function parseArgs(argv) {
  const args = { cmd: argv[0], file: null, port: 0, open: true };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') args.open = false;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '-h' || a === '--help') args.cmd = 'help';
    else if (!args.file) args.file = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  return args;
}

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const argv = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === 'summary' && args.file) {
    const out = await summaryOf(args.file, await fs.readFile(args.file, 'utf8'));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  if (args.cmd !== 'open' || !args.file) {
    process.stderr.write(USAGE + '\n');
    process.exit(args.cmd === 'help' ? 0 : 1);
  }
  const host = await startHost(args.file, { port: args.port });
  process.stderr.write(`jig: ${host.url}\n`);
  if (args.open) openUrl(host.url);
  process.on('SIGINT', () => { host.close(); process.exit(130); });
  const text = await host.done;
  host.close();
  process.stdout.write(JSON.stringify(await summaryOf(args.file, text), null, 2) + '\n');
}

const invoked = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === invoked) main().catch((err) => { process.stderr.write(`jig: ${err.message || err}\n`); process.exit(1); });
