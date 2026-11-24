---
name: jig
description: Put a quick decision interface in front of the human. A jig is a markdown file shown in a dark keyboard-driven browser tab; the human works it and the result lands back in the file and as JSON on stdout. Use whenever a question has outgrown multiple choice. Typical cases are sorting 20 things on a 2x2, triaging 50 items with one key each, comparing plans side by side, scoring options against criteria, ranking, approving commands, or a strategy framework (Eisenhower, MoSCoW, RICE, SWOT) the human should fill in. Replaces shape-board and the interactive side of decompose. Triggers on "jig", "/jig", "board these", "let me sort them", "triage these", "put it on a 2x2", "compare side by side", "same answer for all of them".
---

# jig

A jig is a one-off work surface for one judgment. You write a markdown file and open it. The human works it with the keyboard, and the file becomes the result.

Tool: `~/projects/ai-tooling/utils/jig/bin/jig.mjs` (Node 20+, no install).

## When to use

- The human has to judge three or more items, and prose or AskUserQuestion would make them hold all of them in their head.
- Every item takes the same small answer set (triage).
- Items need placing on axes, in lanes, or in order (matrix, kanban, rerank).
- Options need weighing against criteria (score), or plans side by side (compare).
- A named strategy framework fits. Run `jig list` to see the mapped ones.

Use cactus or plain chat for a single yes/no.

## Loop

1. **Pick a type or framework.** Run `node bin/jig.mjs list`.
2. **Write the file.** `jig new NAME FILE --title "Project: what this decides" --items "a; b; c"`, or `--stdin` for one item per line. Edit the file to add fields or notes.
3. **Open it.** `jig open FILE`, as a background command. It blocks until the human presses Enter to finish, then prints a JSON summary. The tab opens by itself; send the human the URL printed on stderr.
4. **Read the result.** Use the JSON on stdout, or `jig summary FILE` later. The file also reads as plain lines: `- [label] item`.
5. **Act on the escalations.** Items with `escalate:: true` or a `note::` are where the human wants a word.

Put jig files in the project's `.ai/jigs/` unless the human says otherwise. A finished file has `status: done`; keep it, since history is the record.

## File shape

```
---
jig: triage
title: Project: which issues ship
actions: {1: accept, 2: reject, 3: later}
---
Optional intro, shown above the view.
## Section
- [label] item text
  key:: value          (a field: note, escalate, tags, scores, media)
  free note line
```

Every view shares two keys: `e` escalates the focused thing, and `c` writes a note on it. `u` undoes, and Enter finishes.

## Types

```
matrix      2x2 + Unsorted pile; 1-4 place, 0 unplace
triage      one card at a time; keys from `actions`
qa          ## question, items = choices; 1-9 pick, w custom answer
compare     ## path columns, milestones; space strike, x strike path
score       options x criteria (meta criteria); strike cells, options, criteria
rank        scored list; keep / cut / promote
rerank      model order vs human order; Shift+arrows move
kanban      ## lanes, Inbox first; 0-N move, d done, x delete, n add
venn        two sets; a, b, i (both), n (neither)
exec        commands to approve or reject; nothing runs from the page
```

Each view's header comment in `views/<type>.mjs` has its full file shape and keys.

## Frameworks

`router/frameworks.json` maps decompose's frameworks to types with the labels already filled in: `jig new eisenhower`, `moscow`, `rice`, `swot`, `kano`, `pestle`, `risk-matrix` and so on. Choosing which framework fits is still decompose's job; once it's picked, the human fills it in through a jig.
