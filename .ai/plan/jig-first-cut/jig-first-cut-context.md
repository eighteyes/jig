# Context

Key files
- SPEC.md: requirements (from Sean)
- ../slate/SPEC.md: the surface jigs mount on later
- .ai/input/shape-board-inventory.md: all 25 shape-board boards, payloads, keys, outputs
- web/format.mjs: file format (frontmatter, sections, items, fields)
- web/app.mjs: shell; view contract mount(el, ctx)
- web/actions.mjs: named actions, keys, undo
- src/host.mjs: local server, one file, 127.0.0.1
- bin/jig.mjs: CLI
- views/*.mjs: one module per jig type

Sources being ported
- ~/projects/ai-tooling/skills/shape-development/skills/shape-board/*.html
- ~/projects/ai-tooling/skills/decompose/skills/decompose/{SKILL.md,atlas.md}

Decisions (cactus, project jig, thread open)
q2 inplace · q3 frontmatter · q7 port · q8 router · q9 both · q10 tab-now · q11 all · q12 fresh · q15 drop board-live · q16 decisions-first
