# jig

> An ephemeral high-bandwidth communication / decisioning surface for AI <> Human collaboration.

Some questions outgrow prose. Twenty items to sort on a 2x2, fifty to triage, three plans to compare: reading that as chat is slow. An agent writes a jig, you work it in a dark keyboard-driven tab, and the file comes back as the answer.

## features

- Single Skill `/jig` for a locally hosted website and back channel into the session
- Q&A, Sorting, and Classification templates as starting points
- Keyboard driven by default, mouse optional. Every key in the footer is also a button.

## install

```
claude plugin marketplace add /path/to/jig
claude plugin install jig@jig
```

The plugin adds the `/jig` skill and a SessionStart hook. The hook tells the agent to reach for a jig when the human must judge 3 or more items. Node 20+, no dependencies, no build.

## use

```
node bin/jig.mjs list                                        # types and frameworks
node bin/jig.mjs new eisenhower .ai/jigs/week.md --items "a; b; c"
node bin/jig.mjs open .ai/jigs/week.md                       # blocks until Enter, prints JSON
node bin/jig.mjs summary .ai/jigs/week.md                    # the JSON again, no tab
```

## the file is the result

A jig is one markdown file. Every keypress writes it back, and finishing sets `status: done`.

```
---
jig: triage
title: which issues ship
actions: {1: accept, 2: reject}
---
- [accept] fix login
- [reject] dark mode toggle
  note:: already dark
```

## types

```
decide        triage  matrix  venn  kanban  qa  exec
weigh         compare  score  rank  rerank  duel  gate
explore       graph  breadboard  compose  transcript  tag  tour  explore
```

37 strategy frameworks map onto these types with labels filled in: `eisenhower`, `moscow`, `rice`, `swot` and more. Every view shares `e` (escalate), `i` (insert a note), `u` (undo) and Enter (finish).

Full catalogue: [skills/jig/SKILL.md](skills/jig/SKILL.md).

## status

First cut. 76 tests pass. The host binds to 127.0.0.1 and refuses other origins. Known gaps are listed in [PLAN.md](PLAN.md). A claude.ai version you can work from a phone is designed, not built.
