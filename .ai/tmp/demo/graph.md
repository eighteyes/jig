---
jig: graph
title: Offline mode dependency graph
types: [goal, feature, component]
---
- Ship offline mode
  id:: g1
  type:: goal
- Works on the train
  id:: g2
  type:: goal
- Local edits
  id:: f1
  type:: feature
  depends:: g1
- Background sync
  id:: f2
  type:: feature
  depends:: g1, g2
- Sync engine
  id:: c1
  type:: component
  depends:: f1, f2
  Merges local and remote change sets.
- Local store
  id:: c2
  type:: component
  depends:: f1
- Conflict resolver
  id:: c3
  type:: component
  depends:: c1
