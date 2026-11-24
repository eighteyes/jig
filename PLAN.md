# Jig: first-cut plan

Jig is the go-to for ephemeral decision interfaces. It takes over shape-board (its boards get ported) and decompose (its framework atlas becomes jig's router). Sean's calls are in cactus thread `open`.

## Decided

- **One jig is one markdown file.** Frontmatter declares the type; the body holds the data. (q3)
- **The file is the result.** Each action rewrites it, and finishing sets `status: done`. (q2)
- **Results come out two ways.** The file is the record, and `jig open` also prints a JSON summary on stdout. (q9)
- **Each jig opens in its own local dark tab for now.** Views are plain ES modules that slate imports later. (q10)
- **Fresh code:** Node built-ins and plain JS, no build, no dependencies. (q12)
- **Port every shape-board board** into jig, then retire shape-board. (q7, q11)
- **board-live is dropped.** SHAPE-demo is a demo page, not a board. (q15)
- **decompose's atlas becomes a router.** A framework maps to a jig type with its labels pre-filled. (q8)
- **Port order:** decision shapes first, media last. (q16)

## File conventions

```
---
jig: <type>
title: ...
status: open | done
<type options>
---
Intro prose.
## Section
key:: value          section field
- [label] item text
  key:: value        item field (Obsidian inline-field syntax)
  free note line
```

- `label` is the item's main decision (accept, a quadrant, approve).
- Fields hold everything else: `note`, `escalate`, `tags`, `audio`, `img`, `video`, scores.
- Every view gets the same two keys: `e` escalates and `c` adds a note. The note opens as an inline field, never a prompt dialog.

## Board → jig type

```
shape-board             jig type    file shape
quad-board              matrix      4 quadrant sections + Unsorted          (built)
grid-board (+img,video) triage      items, label = column; media fields     (built, media to add)
board                   qa          ## question, items = choices, [x] = picked
path-board              compare     ## path, prose = thesis, items = milestones
matrix-board            score       items = options, one field per criterion
leaderboard-board       rank        items in order with score fields; keep/cut/promote
delta-board             rerank      items in human order, guess:: = model rank
kanban-board            kanban      ## lane sections, Inbox first
venn-board              venn        A only / B only / Both / Neither + Unsorted
exec-board              exec        items = commands; approve/reject; nothing runs
fragment-board          compose     ordered items; strike, tags, agents fields
transcript-board        transcript  items = turns, role:: field, mark label
know-viz                graph       items with id, type, depends fields
breadboard-board        breadboard  ## place sections, nodes with wires field
tag-board (+video)      tag         tags:: field, leader-key tag entry
gate-board              gate        audio:: candidates, passed/crown fields
duel-board              duel        rating fields, ## Votes log
tour-board (+standalone) tour       values fields, projections in frontmatter
voice-explorer          explore     values fields, thresholds, in-page ranking
```

## Build

1. Shared pieces: item and section fields in the format, shared `e`/`c` keys with inline notes, the JSON summary, a headless browser test helper.
2. Port in waves, decision shapes first: qa, compare, score, rank, rerank, kanban, venn, exec.
3. Next: compose, transcript, graph, breadboard.
4. Media last: triage media, tag, gate, duel, tour, explore.
5. Router: decompose frameworks map to a type, its pre-filled labels and sections; `jig new <framework|type> FILE` writes the skeleton.
6. The /jig skill: when to reach for a jig, how to pick a type, the run loop, how to read the result.
7. Shape-board retires once Sean confirms jig covers his use.

## Not in this cut

- Phone swipe deck. Named actions leave room for it.
- Tiny inline yes/no with no file.
- Mounting on slate (slate is spec only).
- board-live's live depth.

## Known gaps

- Saving rewrites the frontmatter in canonical form: `#` comments drop, and block maps turn inline. The body keeps its form.
- Fields on a section with no heading have nowhere to go. Views that annotate sections all use headed sections.
- Note indents normalise to two spaces, and CRLF files save as LF.
- `--media /` refuses everything. Point it at a real folder.
- Dropped from shape-board: board-live (live depth), qa branch expansion, compare's fork list, duel's more-audio, cohort and source modes.

## Grade

B+. The conventions and the first two views are proven. The risk is breadth: 18 views, and the media ones are large.
