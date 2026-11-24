---
jig: transcript
title: Review the debugging session
---
- user: The build fails on CI but passes locally.
  Here is the log tail.
- assistant: Likely a Node version mismatch. Check `.nvmrc` first.
- [mark] assistant: Found it. CI runs Node 18 and the code uses `Array.prototype.toSorted`.
  Fix: pin Node 20 in the workflow.
  Add an engines field so it fails early next time.
- tool: gh run view 123 --log
  line 1
  line 2
  line 3
  line 4
  line 5
  line 6
  line 7
  line 8
  line 9
  line 10
- system: session resumed
- user: Thanks, shipping it.
