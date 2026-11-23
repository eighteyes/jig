# Jig: first-cut plan

Built from `SPEC.md`. The build waits on the four Open decisions; each one is on Sean's cactus board (thread `open`). The defaults below are my picks if he skips one.

## Shape

- **A jig is one markdown file.** Frontmatter declares the type and actions; the body holds the data.
- **The body is the result.** Sorting rewrites the file's lines, so the agent reads the same file back when it's done. No result store, no extra format.
- **Done means `status: done`.** The host stops rendering it. History is git.
- **Views are standalone ES modules.** One per type, plain DOM, no build step, no framework, so any slate site can import them.
- **A dev host serves a folder of jigs** until slate's site exists. It only serves views and writes files back.

## Example file (default for "how a jig declares itself")

```
---
jig: triage
status: open
actions: { 1: accept, 2: reject, 3: later }
---
- the first item
- [accept] an item already sorted
```

A matrix is four `##` headings plus an `## Unsorted` pile, one list item per card.

## First cut

1. File format: parse and write frontmatter plus list items, round-trip safe.
2. Matrix view: four quadrants and a pile, drag a card, writes on drop.
3. Triage view: one card, keys from `actions`, `u` to undo, advances itself, writes each press.
4. Dev host: list open jigs, mount one inline, POST writes back. Dark mode.
5. Tests for the format and the write-back.

## Out of the first cut

- Phone swipe deck (the named-action design leaves room for it).
- Tiny inline yes/no without a file.
- Removing the embed line from slate (slate doesn't exist yet).

## Grade

B: the shape follows the spec, but four decisions are open. It goes up to A once Sean answers.
