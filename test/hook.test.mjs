// hook.test.mjs — the SessionStart hook's output.
// Responsibilities:
// - the hook prints valid SessionStart JSON with additionalContext
// - the context names the plugin's own CLI path and the open loop
// - hooks.json points at a script that exists

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('session-start hook prints the jig nudge', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'session-start.mjs')], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT },
  }).toString();
  const json = JSON.parse(out);
  assert.equal(json.hookSpecificOutput.hookEventName, 'SessionStart');
  const ctx = json.hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(path.join(ROOT, 'bin', 'jig.mjs')));
  assert.match(ctx, /open FILE/);
});

test('hooks.json names an existing script', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const cmd = hooks.hooks.SessionStart[0].hooks[0].command;
  const rel = /\$\{CLAUDE_PLUGIN_ROOT\}\/(\S+?)"/.exec(cmd)[1];
  assert.ok(fs.existsSync(path.join(ROOT, rel)));
});
