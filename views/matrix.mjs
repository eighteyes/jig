// matrix.mjs — two-by-two sort: move cards from a pile into four quadrants.
// Responsibilities:
// - draw the pile (## Unsorted, or items before any heading) and four quadrant sections
// - keys: j/k or arrows pick a card, 1-4 send it to a quadrant, 0 back to the pile, u undo, Enter finish
// - drag and drop a card between any two areas
// - optional axis labels from frontmatter `axes: {x: ..., y: ...}`
// - each move rewrites one line's place in the file and saves
//
// File:
//   ---
//   jig: matrix
//   axes: {x: urgent, y: important}
//   ---
//   ## Do          (top left)
//   ## Schedule    (top right)
//   ## Delegate    (bottom left)
//   ## Drop        (bottom right)
//   ## Unsorted
//   - item

import { el, badges } from '../web/ui.mjs';
import { newSection } from '../web/format.mjs';

const PILE = /^unsorted$/i;

/** Find or create the pile and four quadrant sections in jig.sections. */
export function layout(jig) {
  let pile = jig.sections.find((s) => s.heading === null || (s.heading && PILE.test(s.heading)));
  if (!pile) { pile = newSection('Unsorted'); jig.sections.push(pile); }
  if (pile.heading === null) pile.heading = 'Unsorted';
  const quads = jig.sections.filter((s) => s !== pile && s.heading).slice(0, 4);
  const names = Array.isArray(jig.meta.quadrants) ? jig.meta.quadrants : ['Do', 'Schedule', 'Delegate', 'Drop'];
  while (quads.length < 4) {
    const s = newSection(String(names[quads.length] ?? `Q${quads.length + 1}`));
    jig.sections.splice(jig.sections.indexOf(pile), 0, s);
    quads.push(s);
  }
  return { pile, quads };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const { pile, quads } = layout(jig);
  const areas = [pile, ...quads]; // index 0 = pile, 1-4 = quadrants
  let focus = { area: 0, index: 0 };
  let drag = null;

  const style = el('style');
  style.textContent = `
    .mx { display: grid; grid-template-columns: 28px 1fr 1fr; grid-template-rows: auto 1fr 1fr; gap: var(--gap); }
    .mx-y { grid-row: 2 / 4; grid-column: 1; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; color: var(--dim); font-size: 13px; }
    .mx-x { grid-column: 2 / 4; text-align: center; color: var(--dim); font-size: 13px; }
    .mx-area { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px; min-height: 140px; }
    .mx-area.over { border-color: var(--accent); }
    .mx-area h2 kbd { margin-right: 6px; }
    .mx-pile { margin-top: var(--gap); }
    .mx-card { background: var(--raised); border: 1px solid var(--edge); border-radius: var(--r); padding: 6px 10px; margin: 6px 0; cursor: grab; }
    .mx-card.active { border-color: var(--accent); }
    .mx-card .note { color: var(--dim); font-size: 13px; white-space: pre-wrap; }
  `;
  const grid = el('div', 'mx');
  const pileBox = el('div', 'mx-area mx-pile');
  root.replaceChildren(style, grid, pileBox);

  function clampFocus() {
    if (!areas[focus.area].items.length) {
      const a = areas.findIndex((s) => s.items.length);
      focus = { area: a < 0 ? 0 : a, index: 0 };
    }
    focus.index = Math.min(focus.index, Math.max(areas[focus.area].items.length - 1, 0));
  }

  function card(item, areaIdx, i) {
    const c = el('div', 'mx-card');
    if (focus.area === areaIdx && focus.index === i) c.classList.add('active');
    c.draggable = true;
    c.append(el('div', null, item.text));
    if (item.note.length) c.append(el('div', 'note', item.note.join('\n')));
    c.append(...badges(item));
    c.addEventListener('click', () => { focus = { area: areaIdx, index: i }; render(); });
    c.addEventListener('dragstart', (e) => { drag = { area: areaIdx, index: i }; e.dataTransfer.effectAllowed = 'move'; });
    return c;
  }

  function area(areaIdx, box) {
    const s = areas[areaIdx];
    const h = el('h2');
    const k = el('kbd', null, String(areaIdx));
    h.append(k, `${s.heading} · ${s.items.length}`);
    box.replaceChildren(h, ...s.items.map((it, i) => card(it, areaIdx, i)));
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('over'); };
    box.ondragleave = () => box.classList.remove('over');
    box.ondrop = (e) => {
      e.preventDefault();
      box.classList.remove('over');
      if (drag) { focus = drag; drag = null; actions.run(`move:${areaIdx}`); }
    };
  }

  function render() {
    clampFocus();
    grid.replaceChildren();
    const ax = jig.meta.axes && typeof jig.meta.axes === 'object' ? jig.meta.axes : {};
    grid.append(el('div'), el('div', 'mx-x', ax.x ? `${ax.x} →` : ''), el('div', 'mx-y', ax.y ? `${ax.y} →` : ''));
    for (let q = 1; q <= 4; q++) {
      const box = el('div', 'mx-area');
      area(q, box);
      grid.append(box);
    }
    area(0, pileBox);
  }

  function move(to) {
    const from = areas[focus.area];
    const i = focus.index;
    const item = from.items[i];
    if (!item || areas[to] === from) return;
    from.items.splice(i, 1);
    areas[to].items.push(item);
    const back = { area: focus.area, index: i };
    focus = { area: focus.area, index: i };
    render();
    ctx.save();
    return () => {
      const j = areas[to].items.indexOf(item);
      if (j >= 0) areas[to].items.splice(j, 1);
      from.items.splice(i, 0, item);
      focus = back;
      render();
      ctx.save();
    };
  }

  for (let a = 0; a <= 4; a++) actions.define(`move:${a}`, () => move(a), areas[a].heading.toLowerCase());
  actions.define('down', () => { focus.index++; render(); }, 'down');
  actions.define('up', () => { focus.index = Math.max(focus.index - 1, 0); render(); });
  actions.define('area', () => {
    for (let d = 1; d <= 5; d++) {
      const a = (focus.area + d) % 5;
      if (areas[a].items.length) { focus = { area: a, index: 0 }; break; }
    }
    render();
  }, 'next area');
  actions.define('finish', () => ctx.finish());
  actions.bind({
    1: 'move:1', 2: 'move:2', 3: 'move:3', 4: 'move:4', 0: 'move:0',
    j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', Tab: 'area',
    u: 'undo', Enter: 'finish',
  });
  render();
  return { current: () => areas[focus.area].items[focus.index] ?? null, render };
}
