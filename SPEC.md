# Jigs: first cut

*Talked through 22 November 2026. Lines marked (proposed) came from Claude and are not yet confirmed by Sean. Treat unmarked lines as requirements and (proposed) lines as defaults that can be challenged.*

## What a jig is

**An ephemeral work surface.** A jig is a quick one-off interface an agent puts in front of Sean when it needs his judgment. Jigs are a broad-purpose set of utilities that let human and agent communicate in novel ways.

**Built for decisions.** The real interest is helping people make decisions, and exploring data is part of that. Close in spirit to the small interfaces Claude Desktop builds for exploring data.

**Where the word came from.** "Jig" used to mean the fixed state card for loading context. That job now belongs to the slate hero.

## What they're for

- **Prior use:** SLO boards, decision making, data exploration.
- **Eisenhower matrix:** the agent has 20 things to classify on a two-by-two, loads a matrix into the interface, and the sorting happens there.
- **Bulk triage:** one decision over about 50 things, classify or accept/reject, pressing one, two, three over and over. This interaction goes beyond markdown.
- **In general:** questions that have outgrown multiple choice.

## Rules

- Jigs live directly on the agent surface (slate, see `../slate/SPEC.md`). They are not tied to cactus. No depth of tools, no coupling.
- Inline in the page. No modals. Accordions and collapsing are fine.
- A finished jig vanishes from the slate. It can be recovered from the change history.
- Results get saved as files. They do not need to stay in the slate long term; they exist to help an agent sort through a pile.
- Results are plain text the agent can read back like any other line. (tentative yes)
- Dark mode.

## Lifecycle

1. An agent needs a judgment that prose handles badly.
2. It mounts a jig inline, with its data.
3. Sean works it.
4. The result is saved to a file.
5. The jig disappears from the page, and history keeps it.

## How it could be built (proposed)

- **A jig is its own small file:** a type at the top, data below. The agent embeds it in its section with the same embed line as everything else.
- **A view over markdown where the shape allows.** A matrix is four headings with a list under each, plus an unsorted pile. Dragging a card moves a line from one heading to another.
- **Triage is a keyboard loop:** one card on screen, press 1, 2 or 3, advance, undo. The interaction lives outside markdown; what it saves is still one labelled line per item.
- **Named actions:** a jig declares its actions by name (accept, reject, undo) and keys bind to those. On a phone the same actions bind to thumbs, so triage becomes a swipe deck.
- **Tiny questions** such as a yes or no could sit inline with no file.

## Open

- The starting catalogue of jig types.
- Where result files live.
- How a jig declares its type and actions.
- Implementation stack: not discussed.
