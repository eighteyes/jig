#!/usr/bin/env node
// jig.mjs — command line for jigs.
// Responsibilities:
// - `jig open FILE`: serve one jig in a browser tab, block until it is finished, print the final file
// - open the tab with the platform's opener unless --no-open
// - exit 0 when the jig is done, 130 on interrupt

import { spawn } from 'node:child_process';
import { startHost } from '../src/host.mjs';

const USAGE = `usage: jig open FILE [--port N] [--no-open]

  Serves FILE in a local browser tab and waits until it is finished.
  The result is written into FILE; its final text is printed on stdout.`;

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
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

main().catch((err) => { process.stderr.write(`jig: ${err.message || err}\n`); process.exit(1); });
