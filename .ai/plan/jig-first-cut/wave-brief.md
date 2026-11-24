# Brief for view-port agents

Repo: /Users/god/projects/ai-tooling/utils/jig. Read first: PLAN.md, web/format.mjs, web/app.mjs, web/actions.mjs, web/ui.mjs, web/theme.css, views/matrix.mjs, views/triage.mjs, test/browser.mjs, test/views.test.mjs.

## What a view is

- One file `views/<type>.mjs`. It starts with a comment block: the name, a one-line description, its responsibilities, and the file shape it reads.
- `export function mount(root, ctx)` returns `{ current, render }`.
  - `ctx` = `{ jig, meta, save(), finish(), actions, legend() }`.
  - `current()` returns the focused item or section, whatever has `.fields`. The app uses it for the shared `e` (escalate) and `c` (note) keys. Don't bind `e` or `c` yourself.
- Optional `export function summary(jig)` returns type-specific JSON keys, modeled on the original board's submit payload: `by_quadrant`, `approved`, and so on. It must run in Node with no DOM.
- Mutate `ctx.jig` in place, call `render()`, then `await ctx.save()`. Every action that changes data returns an inverse function, so `u` undoes it.
- `Enter` finishes through `ctx.finish()`. If items are still undecided, the first Enter arms and shows a warning line; the second Enter finishes.
- Keys go through `actions.define(name, fn, title)` and `actions.bind({key: name})`. Bind `u` to `undo`.
- Styles go through `css(id, text)` from `web/ui.mjs`, using the theme variables only. Dark. Inline in the page: no modals, no `window.prompt` or `alert`. A text input opens inline, like the app's note bar.
- Use `el` and `badges` from `web/ui.mjs`. Show `badges(item)` on every item.
- Fields come from `item.fields` and `section.fields`. Values are strings; use `fieldList`, `fieldNumber` and `setField` from `web/format.mjs`.
- Mouse is optional; keyboard is required. Show the focused element with the `.active` or accent border.

## Rules

- Do NOT edit anything in `web/`, `src/`, `bin/`, the other views, or `test/browser.mjs`. If you need a shared change, say so in your report.
- Do NOT commit. The lead commits.
- No dependencies, no build step, plain ES modules.
- Port the behaviour of the original shape-board template (path in the inventory). Rebuild it; don't copy it. Drop anything that needs the shape-board engine (`/remote`, `/checkpoint`, a live server).
- Tests: `test/view-<type>.test.mjs` with the `withJig` helper, at least one test per view: keys change the file as expected, undo restores it, Enter finishes, and `errors` is empty. Also a Node-only test of `summary(jig)`.
- Add a demo file at `.ai/tmp/demo/<type>.md`.
- Run tests: `JIG_PLAYWRIGHT=/Users/god/.npm/_npx/e41f203b7505f1fb/node_modules/ node --test --test-timeout=20000 test/view-<type>.test.mjs`
- Take a screenshot of each view after a few key presses (`page.screenshot` inside a test, or a scratch script in `.ai/tmp/`). Read it, and fix layout problems before you report.
- Report in under 200 words: the files written, test counts, any shared change you need, and any original behaviour you dropped and why.

## Lessons from wave 1

- Write and read files with the Write, Edit, Read and Grep tools. Use Bash only to run `node --test` and screenshot scripts. Shell writes trigger permission prompts that land on Sean.
- Call `css()` inside `mount()`, not at module level, so `summary()` still imports in Node.
- Named keys bind with a Shift+ prefix: `'Shift+ArrowUp': 'move-up'`. Capital letters bind as `J` and `K`.
- Views built so far are good references: kanban.mjs (lanes, inline input), rerank.mjs (reorder, SVG), venn.mjs (regions), compare.mjs (columns, section current()).
