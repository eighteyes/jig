// compare.mjs — side-by-side candidate paths: strike milestones or whole paths.
// Responsibilities:
// - show each `##` section as a column: heading, labelled section fields, thesis text, milestones
// - window the columns to `visible` (frontmatter, default 3), sliding with focus
// - keys: left/right (h/l) path; up/down (j/k) milestone, position 0 is the path header
// - space strikes a milestone (label `struck`); x strikes the whole path (section field `struck:: true`)
// - 1-9 jump to a path; u undo; Enter finishes
// - export summary(jig) with kept and invalidated paths
//
// File:
//   ---
//   jig: compare
//   visible: 3
//   ---
//   ## Path A: ship small
//   grade:: B
//   leans:: speed
//   risks:: rework
//   Thesis prose for this path.
//   - milestone one
//     note line
//   - [struck] milestone two

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { setField } from '../web/format.mjs';

const STRUCK = 'struck';
const SHARED = new Set(['struck', 'escalate', 'note']);
const paths = (jig) => jig.sections.filter((s) => typeof s.heading === 'string');
const pathStruck = (s) => Boolean(s.fields.struck);
const msStruck = (it) => it.label === STRUCK;

/** JSON for `jig open`: per path the struck state and milestones, plus kept and invalidated path names. */
export function summary(jig) {
  const ps = paths(jig);
  return {
    paths: ps.map((s) => ({
      path: s.heading,
      struck: pathStruck(s),
      struck_milestones: s.items.filter(msStruck).map((it) => it.text),
      kept_milestones: s.items.filter((it) => !msStruck(it)).map((it) => it.text),
      escalate: Boolean(s.fields.escalate),
      note: s.fields.note || null,
    })),
    kept: ps.filter((s) => !pathStruck(s)).map((s) => s.heading),
    invalidated: ps.filter(pathStruck).map((s) => s.heading),
  };
}

const STYLE = `
  .cmp { display: grid; gap: var(--gap); align-items: start; }
  .cmp-bar { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
  .cmp-col { padding: 0; overflow: hidden; }
  .cmp-col.focus { border-color: var(--accent); }
  .cmp-head { padding: 10px 12px; border-bottom: 1px solid var(--edge); border-left: 3px solid transparent; }
  .cmp-head.active { border-left-color: var(--accent); background: var(--raised); }
  .cmp-head h2 { color: var(--ink); text-transform: none; letter-spacing: 0; font-size: 15px; margin: 0 0 4px; }
  .cmp-head h2 kbd { color: var(--dim); margin-right: 6px; }
  .cmp-col.struck .cmp-head h2 { text-decoration: line-through; color: var(--dim); }
  .cmp-col.struck { opacity: .6; }
  .cmp-field { font-size: 12px; color: var(--dim); }
  .cmp-field b { font: 12px var(--mono); color: var(--info); margin-right: 6px; font-weight: 400; }
  .cmp-thesis { padding: 8px 12px; color: var(--ink); font-size: 14px; white-space: pre-wrap; border-bottom: 1px solid var(--edge); }
  .cmp-ms { padding: 8px 12px; border-left: 3px solid transparent; cursor: pointer; }
  .cmp-ms + .cmp-ms { border-top: 1px solid var(--edge); }
  .cmp-ms.active { border-left-color: var(--accent); background: var(--raised); }
  .cmp-ms.struck .t { text-decoration: line-through; color: var(--dim); }
  .cmp-ms .n { color: var(--dim); font-size: 13px; white-space: pre-wrap; }
`;

export function mount(root, ctx) {
  css('compare', STYLE);
  const { jig, actions } = ctx;
  const ps = paths(jig);
  const visible = Math.max(1, Math.floor(Number(jig.meta.visible)) || 3);
  let pi = 0;
  let pos = 0;   // 0 = path header, n = milestone n-1
  let start = 0; // first visible column

  const bar = el('div', 'cmp-bar');
  const grid = el('div', 'cmp');
  root.replaceChildren(bar, grid);

  function clamp() {
    pi = Math.min(Math.max(pi, 0), Math.max(ps.length - 1, 0));
    pos = Math.min(Math.max(pos, 0), ps[pi]?.items.length ?? 0);
    if (pi < start) start = pi;
    if (pi >= start + visible) start = pi - visible + 1;
    start = Math.max(0, Math.min(start, Math.max(ps.length - visible, 0)));
  }

  function column(s, i) {
    const col = el('div', 'card cmp-col');
    if (i === pi) col.classList.add('focus');
    if (pathStruck(s)) col.classList.add('struck');
    const head = el('div', 'cmp-head');
    if (i === pi && pos === 0) head.classList.add('active');
    const h = el('h2');
    h.append(el('kbd', null, i < 9 ? String(i + 1) : '·'), s.heading);
    head.append(h);
    for (const [k, v] of Object.entries(s.fields)) {
      if (SHARED.has(k) || !v) continue;
      const f = el('div', 'cmp-field');
      f.append(el('b', null, k), v);
      head.append(f);
    }
    head.append(...badges(s));
    head.addEventListener('click', () => { pi = i; pos = 0; render(); });
    col.append(head);
    const thesis = (s.text || []).join('\n').trim();
    if (thesis) col.append(el('div', 'cmp-thesis', thesis));
    s.items.forEach((it, n) => {
      const row = el('div', 'cmp-ms' + (msStruck(it) ? ' struck' : ''));
      if (i === pi && pos === n + 1) row.classList.add('active');
      row.append(el('div', 't', it.text));
      if (it.note.length) row.append(el('div', 'n', it.note.join('\n')));
      row.append(...badges(it));
      row.addEventListener('click', () => { pi = i; pos = n + 1; render(); });
      col.append(row);
    });
    return col;
  }

  function render() {
    clamp();
    const shown = ps.slice(start, start + visible);
    grid.style.gridTemplateColumns = `repeat(${Math.max(shown.length, 1)}, minmax(0, 1fr))`;
    grid.replaceChildren(...shown.map((s, k) => column(s, start + k)));
    const struck = ps.filter(pathStruck).length;
    const more = [start > 0 ? `‹ ${start} more` : '', start + visible < ps.length ? `${ps.length - start - visible} more ›` : ''].filter(Boolean).join(' · ');
    bar.textContent = ps.length
      ? `path ${pi + 1} of ${ps.length} · ${struck} struck${more ? ' · ' + more : ''}`
      : 'No paths.';
    keepVisible(grid.querySelector('.cmp-ms.active, .cmp-head.active'));
  }

  function strikeMilestone() {
    const it = ps[pi]?.items[pos - 1];
    if (!it) return;
    const before = it.label;
    it.label = msStruck(it) ? null : STRUCK;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
  }

  function strikePath() {
    const s = ps[pi];
    if (!s) return;
    const before = s.fields.struck;
    setField(s, 'struck', before ? null : 'true');
    render();
    ctx.save();
    return () => { setField(s, 'struck', before); render(); ctx.save(); };
  }

  actions.define('right', () => { pi++; render(); }, 'path');
  actions.define('left', () => { pi--; render(); });
  actions.define('down', () => { pos++; render(); }, 'milestone');
  actions.define('up', () => { pos--; render(); });
  actions.define('strike', strikeMilestone, 'strike milestone');
  actions.define('strike-path', strikePath, 'strike path');
  actions.define('finish', () => ctx.finish(), 'finish');
  const jumps = {};
  for (let n = 1; n <= Math.min(9, ps.length); n++) {
    actions.define(`path:${n}`, () => { pi = n - 1; pos = 0; render(); }, `path ${n}`);
    jumps[n] = `path:${n}`;
  }
  actions.bind({
    ArrowRight: 'right', l: 'right', ArrowLeft: 'left', h: 'left',
    ArrowDown: 'down', j: 'down', ArrowUp: 'up', k: 'up',
    ' ': 'strike', x: 'strike-path', ...jumps, u: 'undo', Enter: 'finish',
  });

  render();
  return { current: () => (pos === 0 ? ps[pi] : ps[pi]?.items[pos - 1]) ?? null, render };
}
