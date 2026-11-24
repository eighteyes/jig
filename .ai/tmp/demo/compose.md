---
jig: compose
title: Compose the lead prompt
agents: [kip, patches, lead, worker]
---
- Role preamble
  id:: f1
  layer:: system
  tokens:: 120
  tags:: tone, safety
  agents:: lead
  You are the lead. Delegate before you dig.
  Keep replies short.
- Output format
  id:: f2
  layer:: system
  tokens:: 80
  Reply in plain prose.
- [struck] Old rule
  id:: f3
  tokens:: 40
  Never use lists.
- Tool etiquette
  id:: f4
  layer:: user
  tokens:: 200
  Run tools in parallel when they are independent.
