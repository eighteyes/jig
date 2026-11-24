// score.mjs — options-by-criteria elimination matrix: strike cells, options, or whole criteria.
// Responsibilities:
// - draw a table: options as rows, criteria as columns, each cell the item's field for that criterion
// - 2-D cell focus with arrows or h/j/k/l
// - space strikes a cell (criterion name in the item's `struck` field, a comma list)
// - x strikes the option (label `struck`); X drops the focused criterion (frontmatter `dropped`)
// - dropped criteria render dimmed and struck through; u undoes; Enter finishes
// - summary(jig): per-option dispositions, dropped criteria, invalidated and surviving options
//
// File:
//   ---
//   jig: score
//   criteria: [cost, speed, risk]
//   dropped: []
//   ---
//   - Postgres
//     cost:: low
//     speed:: high
//   - [struck] Mongo
//     struck:: speed

import { el, badges, css, keepVisible } from '../web/ui.mjs';
import { fieldList, setField } from '../web/format.mjs';

const NON_CRITERIA = new Set(['struck', 'escalate', 'note']);

function items(jig) { return jig.sections.flatMap((s) => s.items); }

/** Criteria from frontmatter, else the field names found on the options. */
export function criteriaOf(jig) {
  const c = jig.meta.criteria;
  if (Array.isArray(c) && c.length) return c.map(String);
  if (typeof c === 'string' && c.trim()) return c.split(',').map((x) => x.trim()).filter(Boolean);
  const seen = new Set();
  for (const it of items(jig)) for (const k of Object.keys(it.fields)) if (!NON_CRITERIA.has(k)) seen.add(k);
  return [...seen];
}

function droppedOf(jig) {
  const d = jig.meta.dropped;
  if (Array.isArray(d)) return d.map(String);
  if (typeof d === 'string' && d.trim()) return d.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

/** Type-specific JSON for `jig open`. Runs in Node. */
export function summary(jig) {
  const criteria = criteriaOf(jig);
  const options = items(jig).map((it) => ({
    option: it.text,
    struck: it.label === 'struck',
    struck_cells: fieldList(it, 'struck'),
    escalate: Boolean(it.fields.escalate),
    note: it.fields.note ?? null,
  }));
  return {
    options,
    dropped_criteria: droppedOf(jig),
    invalidated: options.filter((o) => o.struck).map((o) => o.option),
    survivors: options.filter((o) => !o.struck).map((o) => o.option),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const rows = items(jig);
  const criteria = criteriaOf(jig);
  let focus = { row: 0, col: 0 };

  css('score', `
    .sc { width: 100%; border-collapse: separate; border-spacing: 0 4px; }
    .sc th { text-align: left; color: var(--dim); font-weight: 600; font-size: 13px; padding: 4px 10px; text-transform: uppercase; letter-spacing: .06em; }
    .sc th.drop { opacity: .4; text-decoration: line-through; }
    .sc th.active { color: var(--accent); }
    .sc td { background: var(--panel); border-top: 1px solid var(--edge); border-bottom: 1px solid var(--edge); padding: 8px 10px; }
    .sc td:first-child { border-left: 1px solid var(--edge); border-radius: var(--r) 0 0 var(--r); }
    .sc td:last-child { border-right: 1px solid var(--edge); border-radius: 0 var(--r) var(--r) 0; }
    .sc td.opt { font-weight: 600; min-width: 160px; }
    .sc tr.struck td.opt { text-decoration: line-through; color: var(--dim); }
    .sc tr.struck td { opacity: .55; }
    .sc td.cell { cursor: pointer; }
    .sc td.cell.cut { text-decoration: line-through; color: var(--bad); }
    .sc td.cell.drop { opacity: .35; text-decoration: line-through; }
    .sc td.cell.active { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--raised); }
    .sc-empty { color: var(--dim); padding: 20px 0; }
  `);
  const wrap = el('div');
  root.replaceChildren(wrap);

  function clamp() {
    focus.row = Math.min(Math.max(focus.row, 0), Math.max(rows.length - 1, 0));
    focus.col = Math.min(Math.max(focus.col, 0), Math.max(criteria.length - 1, 0));
  }

  function render() {
    clamp();
    const dropped = droppedOf(jig);
    if (!rows.length) { wrap.replaceChildren(el('div', 'sc-empty', 'No options.')); return; }
    const table = el('table', 'sc');
    const head = el('tr');
    head.append(el('th', null, 'option'));
    criteria.forEach((c, ci) => {
      const th = el('th', `${dropped.includes(c) ? 'drop' : ''} ${ci === focus.col ? 'active' : ''}`.trim(), c);
      th.addEventListener('click', () => { focus.col = ci; render(); });
      head.append(th);
    });
    table.append(head);
    rows.forEach((it, ri) => {
      const tr = el('tr', it.label === 'struck' ? 'struck' : '');
      const opt = el('td', 'opt');
      opt.append(el('div', null, it.text), ...badges(it));
      opt.addEventListener('click', () => { focus.row = ri; render(); });
      tr.append(opt);
      const cut = fieldList(it, 'struck');
      criteria.forEach((c, ci) => {
        const cls = ['cell'];
        if (cut.includes(c)) cls.push('cut');
        if (dropped.includes(c)) cls.push('drop');
        if (ri === focus.row && ci === focus.col) cls.push('active');
        const td = el('td', cls.join(' '), it.fields[c] ?? '');
        td.addEventListener('click', () => { focus = { row: ri, col: ci }; render(); });
        tr.append(td);
      });
      table.append(tr);
    });
    wrap.replaceChildren(table);
    keepVisible(table.querySelector('td.active'));
  }

  const move = (dr, dc) => () => { focus.row += dr; focus.col += dc; render(); };

  async function commit() { render(); await ctx.save(); }

  actions.define('left', move(0, -1), 'left');
  actions.define('right', move(0, 1), 'right');
  actions.define('up', move(-1, 0), 'up');
  actions.define('down', move(1, 0), 'down');

  actions.define('strike-cell', async () => {
    const it = rows[focus.row], c = criteria[focus.col];
    if (!it || c === undefined) return;
    const before = it.fields.struck;
    const cut = fieldList(it, 'struck');
    setField(it, 'struck', cut.includes(c) ? cut.filter((x) => x !== c) : [...cut, c]);
    await commit();
    return async () => { setField(it, 'struck', before); await commit(); };
  }, 'strike cell');

  actions.define('strike-option', async () => {
    const it = rows[focus.row];
    if (!it) return;
    const before = it.label;
    it.label = before === 'struck' ? null : 'struck';
    await commit();
    return async () => { it.label = before; await commit(); };
  }, 'strike option');

  actions.define('drop-criterion', async () => {
    const c = criteria[focus.col];
    if (c === undefined) return;
    const before = droppedOf(jig);
    jig.meta.dropped = before.includes(c) ? before.filter((x) => x !== c) : [...before, c];
    await commit();
    return async () => { jig.meta.dropped = before; await commit(); };
  }, 'drop criterion');

  actions.define('finish', () => ctx.finish());
  actions.bind({
    ArrowLeft: 'left', h: 'left', ArrowRight: 'right', l: 'right',
    ArrowUp: 'up', k: 'up', ArrowDown: 'down', j: 'down',
    ' ': 'strike-cell', x: 'strike-option', X: 'drop-criterion',
    u: 'undo', Enter: 'finish',
  });
  render();
  return { current: () => rows[focus.row] ?? null, render };
}
