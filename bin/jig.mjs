#!/usr/bin/env node
// jig.mjs — command line for jigs.
// Responsibilities:
// - `jig open FILE`: serve one jig in a browser tab, block until it is finished, print a JSON summary
// - `jig summary FILE`: print the JSON summary of a jig file without opening it
// - `jig new NAME FILE`: write a jig skeleton from a type or a decompose framework (router)
// - `jig list`: types with a view, and frameworks the router maps to them
// - open the tab with the platform's opener unless --no-open
// - exit 0 when the jig is done, 130 on interrupt

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startHost } from '../src/host.mjs';
import { parseJig, summarize } from '../web/format.mjs';
import { scaffold, loadRouter, listTypes } from '../src/scaffold.mjs';

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

const USAGE = `usage: jig open FILE [--port N] [--no-open] [--media DIR]
       jig summary FILE
       jig new NAME FILE [--title T] [--items "a; b; c"] [--stdin] [--force]
       jig list

  open     Serves FILE in a local browser tab and waits until it is finished.
           The result is written into FILE; a JSON summary is printed on stdout.
           Media fields (audio::, img::, video::) are served from FILE's folder,
           or from --media DIR.
  summary  Prints the JSON summary of FILE as it stands.
  new      Writes a skeleton: NAME is a type (matrix, triage, ...) or a framework
           (eisenhower, moscow, rice, ...). Items come from --items or stdin lines.
  list     Types and frameworks.`;

function parseArgs(argv) {
  const args = { cmd: argv[0], file: null, name: null, port: 0, open: true, title: null, items: null, stdin: false, force: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') args.open = false;
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--media') args.media = argv[++i];
    else if (a === '--items') args.items = argv[++i].split(';');
    else if (a === '--stdin') args.stdin = true;
    else if (a === '--force') args.force = true;
    else if (args.cmd === 'new' && !args.name) args.name = a;
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
  if (args.cmd === 'list') {
    const types = await listTypes();
    const router = await loadRouter();
    process.stdout.write(`types:\n  ${types.join('  ')}\n\nframeworks (framework -> type):\n`);
    for (const f of router.frameworks) {
      const ok = types.includes(f.type) ? ' ' : '*';
      process.stdout.write(`  ${ok} ${f.key.padEnd(24)} ${f.type.padEnd(9)} ${f.why}\n`);
    }
    process.stdout.write('\n  * type not built yet\n');
    return;
  }
  if (args.cmd === 'new' && args.name && args.file) {
    let items = args.items || [];
    if (args.stdin) items = items.concat((await new Promise((r) => { let d = ''; process.stdin.on('data', (c) => { d += c; }).on('end', () => r(d)); })).split('\n'));
    const exists = await fs.access(args.file).then(() => true, () => false);
    if (exists && !args.force) throw new Error(`${args.file} exists (use --force to overwrite)`);
    await fs.writeFile(args.file, await scaffold(args.name, { title: args.title, items }));
    process.stderr.write(`jig: wrote ${args.file}\n`);
    return;
  }
  if (args.cmd === 'summary' && args.file) {
    const out = await summaryOf(args.file, await fs.readFile(args.file, 'utf8'));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  if (args.cmd !== 'open' || !args.file) {
    process.stderr.write(USAGE + '\n');
    process.exit(args.cmd === 'help' ? 0 : 1);
  }
  const host = await startHost(args.file, { port: args.port, media: args.media ?? undefined });
  process.stderr.write(`jig: ${host.url}\n`);
  if (args.open) openUrl(host.url);
  process.on('SIGINT', () => { host.close(); process.exit(130); });
  const text = await host.done;
  host.close();
  process.stdout.write(JSON.stringify(await summaryOf(args.file, text), null, 2) + '\n');
}

process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });
const invoked = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href;
if (import.meta.url === invoked) main().catch((err) => { process.stderr.write(`jig: ${err.message || err}\n`); process.exit(1); });
