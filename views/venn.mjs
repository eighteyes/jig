// venn.mjs — two-set Venn sort: place each card in A only, B only, both, or neither.
// Responsibilities:
// - draw a two-circle SVG with a count per region, then each region's cards, then the Unsorted pile
// - keys: j/k or arrows pick a card, Tab next non-empty region, a/b/i/n place it, 0 back to Unsorted, u undo
// - Enter finishes; the first Enter arms a warning when Unsorted is not empty
// - create missing region sections on mount from frontmatter `sets`
// - summary(jig): items per region, runs in Node
//
// File:
//   ---
//   jig: venn
//   sets: {a: fast, b: cheap}
//   ---
//   ## fast only
//   ## cheap only
//   ## Both
//   ## Neither
//   ## Unsorted
//   - item          (items before any heading count as Unsorted)

import { el, badges, css, keepVisible } from '../web/ui.mjs';
import { newSection } from '../web/format.mjs';

const REGIONS = ['a_only', 'b_only', 'both', 'neither', 'unsorted'];

/** Set names from frontmatter, default A and B. */
export function setNames(meta) {
  const s = meta && typeof meta.sets === 'object' && meta.sets ? meta.sets : {};
  return { a: String(s.a ?? 'A'), b: String(s.b ?? 'B') };
}

function headings(meta) {
  const { a, b } = setNames(meta);
  return [`${a} only`, `${b} only`, 'Both', 'Neither', 'Unsorted'];
}

/** Find the five region sections (null where missing), in REGIONS order. */
function find(jig) {
  const names = headings(jig.meta).map((h) => h.toLowerCase());
  return names.map((n, i) => jig.sections.find((s) => (i === 4 && s.heading === null) || (s.heading && s.heading.toLowerCase() === n)) ?? null);
}

/** Find or create the five region sections; returns them in REGIONS order. */
export function layout(jig) {
  const names = headings(jig.meta);
  const found = find(jig);
  return found.map((s, i) => {
    if (!s) { s = newSection(names[i]); jig.sections.push(s); }
    if (s.heading === null) s.heading = names[i];
    return s;
  });
}

export function summary(jig) {
  const found = find(jig);
  const by_region = {};
  REGIONS.forEach((r, i) => { by_region[r] = (found[i]?.items ?? []).map((it) => it.text); });
  return { by_region, sets: setNames(jig.meta) };
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const areas = layout(jig); // a_only, b_only, both, neither, unsorted
  const { a, b } = setNames(jig.meta);
  const PILE = 4;
  let focus = { area: PILE, index: 0 };
  let armed = false;

  css('venn', `
    .vn-svg { display: block; width: 100%; max-width: 520px; margin: 0 auto 12px; }
    .vn-svg .circle { fill-opacity: .18; stroke-width: 2; }
    .vn-svg .ca { fill: var(--info); stroke: var(--info); }
    .vn-svg .cb { fill: var(--accent); stroke: var(--accent); }
    .vn-svg .box { fill: none; stroke: var(--edge); }
    .vn-svg text { fill: var(--ink); font: 600 20px var(--sans); text-anchor: middle; }
    .vn-svg text.lbl { fill: var(--dim); font: 13px var(--sans); }
    .vn-regions { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap); }
    .vn-area { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px; min-height: 70px; }
    .vn-pile { margin-top: var(--gap); }
    .vn-area h2 kbd { margin-right: 6px; }
    .vn-card { background: var(--raised); border: 1px solid var(--edge); border-radius: var(--r); padding: 6px 10px; margin: 6px 0; cursor: pointer; }
    .vn-card.active { border-color: var(--accent); }
    .vn-card .note { color: var(--dim); font-size: 13px; white-space: pre-wrap; }
    .vn-warn { color: var(--accent); margin: 10px 0; min-height: 1.4em; }
  `);
  const figure = el('div');
  const grid = el('div', 'vn-regions');
  const pileBox = el('div', 'vn-area vn-pile');
  const warn = el('div', 'vn-warn');
  root.replaceChildren(figure, grid, pileBox, warn);

  const keyOf = ['a', 'b', 'i', 'n', '0'];
  const titleOf = [`${a} only`, `${b} only`, 'both', 'neither', 'unsorted'];

  function clampFocus() {
    if (!areas[focus.area].items.length) {
      const i = areas.findIndex((s) => s.items.length);
      focus = { area: i < 0 ? PILE : i, index: 0 };
    }
    focus.index = Math.min(focus.index, Math.max(areas[focus.area].items.length - 1, 0));
  }

  function drawVenn() {
    const n = areas.map((s) => s.items.length);
    const s = svg('svg', { class: 'vn-svg', viewBox: '0 0 520 250', role: 'img', 'aria-label': `${a} and ${b}` });
    s.append(
      svg('rect', { class: 'box', x: 4, y: 4, width: 512, height: 242, rx: 8 }),
      svg('circle', { class: 'circle ca', cx: 200, cy: 125, r: 85 }),
      svg('circle', { class: 'circle cb', cx: 320, cy: 125, r: 85 }),
      svg('text', { class: 'lbl', x: 160, y: 22 }, a),
      svg('text', { class: 'lbl', x: 360, y: 22 }, b),
      svg('text', { x: 160, y: 133 }, String(n[0])),
      svg('text', { x: 360, y: 133 }, String(n[1])),
      svg('text', { x: 260, y: 133 }, String(n[2])),
      svg('text', { class: 'lbl', x: 260, y: 153 }, 'both'),
      svg('text', { x: 475, y: 225 }, String(n[3])),
      svg('text', { class: 'lbl', x: 475, y: 207 }, 'neither'),
    );
    figure.replaceChildren(s);
  }

  function card(item, ai, i) {
    const c = el('div', 'vn-card');
    if (focus.area === ai && focus.index === i) c.classList.add('active');
    c.append(el('div', null, item.text));
    if (item.note.length) c.append(el('div', 'note', item.note.join('\n')));
    c.append(...badges(item));
    c.addEventListener('click', () => { focus = { area: ai, index: i }; render(); });
    return c;
  }

  function area(ai, box) {
    const s = areas[ai];
    const h = el('h2');
    h.append(el('kbd', null, keyOf[ai]), `${s.heading} · ${s.items.length}`);
    box.replaceChildren(h, ...s.items.map((it, i) => card(it, ai, i)));
  }

  function render() {
    clampFocus();
    drawVenn();
    grid.replaceChildren();
    for (let ai = 0; ai < PILE; ai++) { const box = el('div', 'vn-area'); area(ai, box); grid.append(box); }
    area(PILE, pileBox);
    const left = areas[PILE].items.length;
    warn.textContent = armed && left ? `${left} still Unsorted. Press Enter again to finish anyway.` : '';
    keepVisible(root.querySelector('.vn-card.active'));
  }

  function move(to) {
    armed = false;
    const from = areas[focus.area];
    const i = focus.index;
    const item = from.items[i];
    if (!item || areas[to] === from) return;
    const back = { area: focus.area, index: i };
    from.items.splice(i, 1);
    areas[to].items.push(item);
    render();
    ctx.save();
    return () => {
      const j = areas[to].items.indexOf(item);
      if (j >= 0) areas[to].items.splice(j, 1);
      from.items.splice(i, 0, item);
      focus = back;
      armed = false;
      render();
      ctx.save();
    };
  }

  for (let ai = 0; ai < 5; ai++) actions.define(`move:${ai}`, () => move(ai), titleOf[ai]);
  actions.define('down', () => { focus.index++; render(); }, 'down');
  actions.define('up', () => { focus.index = Math.max(focus.index - 1, 0); render(); }, 'up');
  actions.define('area', () => {
    for (let d = 1; d <= 5; d++) {
      const ai = (focus.area + d) % 5;
      if (areas[ai].items.length) { focus = { area: ai, index: 0 }; break; }
    }
    render();
  }, 'next region');
  actions.define('finish', () => {
    if (areas[PILE].items.length && !armed) { armed = true; render(); return; }
    return ctx.finish();
  }, 'finish');
  actions.bind({
    a: 'move:0', b: 'move:1', i: 'move:2', n: 'move:3', 0: 'move:4',
    j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', Tab: 'area',
    u: 'undo', Enter: 'finish',
  });
  ctx.legend?.();
  render();
  return { current: () => areas[focus.area].items[focus.index] ?? null, render };
}
