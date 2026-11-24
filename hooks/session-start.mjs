#!/usr/bin/env node
// session-start.mjs — SessionStart hook: tell the agent jig is its side channel to the human.
// Responsibilities:
// - print the jig nudge as SessionStart additionalContext
// - name the CLI path inside this plugin, so the agent can run it without an install
// - run nothing else: no jig, no tab, no network

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'jig.mjs');

const text = `jig: your side channel to the human. Use it when they must process information faster than prose allows.
Reach for a jig when the human must judge 3+ items, sort them on axes or into lanes, rank them, weigh options against criteria, compare plans side by side, approve commands, or fill in a strategy framework.
Loop: node ${cli} list, then node ${cli} new TYPE FILE --title "..." --items "a; b", then run node ${cli} open FILE as a background command, then read the JSON it prints. Files go in .ai/jigs/.
A single yes/no stays in chat. Load the /jig skill for types and file shape.`;

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
