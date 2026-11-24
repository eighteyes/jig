// graph.mjs — dependency graph in columns: flag nodes, question their dependencies.
// Responsibilities:
// - read every item as a node: text = name, `id` (else a slug of the text), `type`, `depends` (comma list of ids), note lines = description
// - lay nodes out in columns: by `type` (frontmatter `types` order, unknown types after), or by depth from `depends` when no node has a type
// - cap depth so cycles cannot hang the layout
// - highlight the focused node's dependencies and dependents, with a "depends on / needed by" line and SVG edges
// - keys: up/down (j/k) within a column, left/right (h/l) between columns, m flag, q question dependencies, u undo, Enter finish
// - export summary(jig) with nodes, flagged, questioned and escalated ids
//
// File:
//   ---
//   jig: graph
//   types: [goal, feature, component]
//   ---
//   - Ship offline mode
//     id:: g1
//     type:: goal
//   - Sync engine
//     id:: c1
//     type:: component
//     depends:: g1
//     Description lines as notes.

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { fieldList, setField } from '../web/format.mjs';

const MAX_DEPTH = 24;
const NS = 'http://www.w3.org/2000/svg';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'node';
const nodeId = (it) => (it.fields.id && String(it.fields.id).trim()) || slug(it.text);
const on = (it, key) => /^(true|yes|1)$/i.test(String(it.fields[key] ?? ''));
const nodes = (jig) => jig.sections.flatMap((s) => s.items);

/** JSON for `jig open`: every node with its marks, plus flagged, questioned and escalated ids. */
export function summary(jig) {
  const all = nodes(jig).map((it) => ({
    id: nodeId(it),
    type: it.fields.type || null,
    name: it.text,
    flag: on(it, 'flag'),
    question: on(it, 'question'),
    escalate: Boolean(it.fields.escalate),
    note: it.fields.note || null,
  }));
  const ids = (key) => all.filter((n) => n[key]).map((n) => n.id);
  return { nodes: all, flagged: ids('flag'), questioned: ids('question'), escalated: ids('escalate') };
}

/** Depth of each node from its dependencies; roots are 0. Cycles and long chains stop at MAX_DEPTH. */
function depths(list, byId) {
  const memo = new Map();
  const walk = (it, stack) => {
    if (memo.has(it)) return memo.get(it);
    if (stack.has(it) || stack.size >= MAX_DEPTH) return 0;
    stack.add(it);
    let d = 0;
    for (const dep of fieldList(it, 'depends')) {
      const t = byId.get(dep);
      if (t && t !== it) d = Math.max(d, walk(t, stack) + 1);
    }
    stack.delete(it);
    d = Math.min(d, MAX_DEPTH);
    memo.set(it, d);
    return d;
  };
  for (const it of list) walk(it, new Set());
  return memo;
}

/** Columns [{ title, items }]: by type when any node has one, else by depth. */
function layout(jig, list, byId) {
  if (list.some((it) => it.fields.type)) {
    const order = Array.isArray(jig.meta.types) ? jig.meta.types.map(String) : [];
    const seen = [...new Set(list.map((it) => it.fields.type || ''))];
    const known = order.filter((t) => seen.includes(t));
    const rest = seen.filter((t) => t && !order.includes(t));
    const cols = [...known, ...rest, ...(seen.includes('') ? [''] : [])];
    return cols.map((t) => ({ title: t || 'untyped', items: list.filter((it) => (it.fields.type || '') === t) }));
  }
  const d = depths(list, byId);
  const max = Math.max(0, ...list.map((it) => d.get(it) ?? 0));
  const cols = [];
  for (let n = 0; n <= max; n++) {
    const items = list.filter((it) => (d.get(it) ?? 0) === n);
    if (items.length) cols.push({ title: n === 0 ? 'roots' : `depth ${n}`, items });
  }
  return cols;
}

const STYLE = `
  .gr-bar { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
  .gr-warn { color: var(--accent); font-size: 13px; margin-bottom: 8px; }
  .gr-scroll { overflow-x: auto; padding-bottom: 8px; }
  .gr { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(190px, 1fr); column-gap: 56px; align-items: start; min-width: fit-content; }
  .gr svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .gr-col { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; }
  .gr-col h2 { margin: 0 0 2px; }
  .gr-node { cursor: pointer; border-left: 3px solid var(--edge); }
  .gr-node .nm { color: var(--ink); }
  .gr-node .id { font: 12px var(--mono); color: var(--dim); margin-left: 6px; }
  .gr-node .d { color: var(--dim); font-size: 13px; white-space: pre-wrap; margin-top: 4px; }
  .gr-node.dep, .gr-node.need { border-color: var(--accent); }
  .gr-node.dep { border-left-color: var(--info); }
  .gr-node.need { border-left-color: var(--good); }
  .gr-node.active { border-color: var(--accent); background: var(--raised); border-left-color: var(--accent); }
  .gr-node.flag { box-shadow: inset 0 0 0 1px var(--bad); }
  .gr-mark { font-size: 12px; margin-left: 8px; }
  .gr-mark.flag { color: var(--bad); }
  .gr-mark.q { color: var(--accent); }
  .gr-rel { font-size: 12px; color: var(--dim); margin-top: 6px; }
  .gr-rel b { font-weight: 400; color: var(--accent); margin-right: 4px; }
  .gr svg path { fill: none; stroke: var(--edge); stroke-width: 1.2; opacity: .55; }
  .gr svg path.hot { stroke: var(--accent); stroke-width: 2; opacity: 1; }
  .gr svg path.q { stroke-dasharray: 5 4; }
  .gr svg polygon { fill: var(--edge); opacity: .55; }
  .gr svg polygon.hot { fill: var(--accent); opacity: 1; }
`;

export function mount(root, ctx) {
  css('graph', STYLE);
  const { jig, actions } = ctx;
  const list = nodes(jig);
  const byId = new Map(list.map((it) => [nodeId(it), it]));
  const idOf = new Map(list.map((it) => [it, nodeId(it)]));
  const cols = layout(jig, list, byId);
  const colOf = new Map();
  cols.forEach((c, i) => c.items.forEach((it) => colOf.set(it, i)));
  const deps = new Map(list.map((it) => [it, fieldList(it, 'depends').map((d) => byId.get(d)).filter((t) => t && t !== it)]));
  const needed = new Map(list.map((it) => [it, []]));
  for (const [it, ds] of deps) for (const d of ds) needed.get(d).push(it);
  const name = (it) => it.text;

  let ci = 0, ri = 0;
  const bar = el('div', 'gr-bar');
  const wrap = el('div', 'gr');
  const svg = document.createElementNS(NS, 'svg');
  const scroll = el('div', 'gr-scroll');
  scroll.append(wrap);
  root.replaceChildren(bar, scroll);
  let cards = new Map();

  const focus = () => cols[ci]?.items[ri] ?? null;

  function clamp() {
    ci = Math.min(Math.max(ci, 0), Math.max(cols.length - 1, 0));
    ri = Math.min(Math.max(ri, 0), Math.max((cols[ci]?.items.length ?? 1) - 1, 0));
  }

  function card(it) {
    const f = focus();
    const c = el('div', 'card gr-node');
    if (it === f) c.classList.add('active');
    else if (f && deps.get(f).includes(it)) c.classList.add('dep');
    else if (f && needed.get(f).includes(it)) c.classList.add('need');
    if (on(it, 'flag')) c.classList.add('flag');
    const head = el('div');
    head.append(el('span', 'nm', name(it)), el('span', 'id', idOf.get(it)));
    if (on(it, 'flag')) head.append(el('span', 'gr-mark flag', '⚑ flag'));
    if (on(it, 'question')) head.append(el('span', 'gr-mark q', '? deps'));
    c.append(head);
    if (it.note.length) c.append(el('div', 'd', it.note.join('\n')));
    c.append(...badges(it));
    if (it === f) {
      const rel = (label, arr) => {
        const row = el('div', 'gr-rel');
        row.append(el('b', null, label), arr.length ? arr.map(name).join(', ') : 'none');
        return row;
      };
      const missing = fieldList(it, 'depends').filter((d) => !byId.has(d));
      c.append(rel('depends on', deps.get(it)), rel('needed by', needed.get(it)));
      if (missing.length) c.append(el('div', 'gr-rel', `unknown ids: ${missing.join(', ')}`));
    }
    c.addEventListener('click', () => { ci = colOf.get(it); ri = cols[ci].items.indexOf(it); render(); });
    cards.set(it, c);
    return c;
  }

  function edges() {
    svg.replaceChildren();
    const f = focus();
    const box = wrap.getBoundingClientRect();
    const hot = [], cold = [];
    for (const [it, ds] of deps) for (const d of ds) (it === f || d === f ? hot : cold).push([d, it]);
    for (const [pass, group] of [[false, cold], [true, hot]]) {
      for (const [from, to] of group) {
        if (colOf.get(from) === colOf.get(to)) continue;
        const a = cards.get(from)?.getBoundingClientRect(), b = cards.get(to)?.getBoundingClientRect();
        if (!a || !b) continue;
        const rightward = colOf.get(from) < colOf.get(to);
        const x1 = (rightward ? a.right : a.left) - box.left, y1 = a.top + a.height / 2 - box.top;
        const x2 = (rightward ? b.left : b.right) - box.left, y2 = b.top + b.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        const cls = [pass ? 'hot' : '', on(to, 'question') ? 'q' : ''].filter(Boolean).join(' ');
        if (cls) p.setAttribute('class', cls);
        const s = rightward ? 1 : -1;
        const tip = document.createElementNS(NS, 'polygon');
        tip.setAttribute('points', `${x2},${y2} ${x2 - 7 * s},${y2 - 4} ${x2 - 7 * s},${y2 + 4}`);
        if (pass) tip.setAttribute('class', 'hot');
        svg.append(p, tip);
      }
    }
  }

  function render() {
    clamp();
    cards = new Map();
    wrap.replaceChildren(svg, ...cols.map((c) => {
      const col = el('div', 'gr-col');
      col.append(el('h2', null, `${c.title} · ${c.items.length}`), ...c.items.map(card));
      return col;
    }));
    const flagged = list.filter((it) => on(it, 'flag')).length;
    const asked = list.filter((it) => on(it, 'question')).length;
    bar.textContent = list.length
      ? `${list.length} nodes · ${flagged} flagged · ${asked} questioned`
      : 'No nodes.';
    edges();
    keepVisible(wrap.querySelector('.gr-node.active'));
  }

  function toggle(key) {
    const it = focus();
    if (!it) return;
    const before = it.fields[key];
    setField(it, key, on(it, key) ? null : 'true');
    render();
    ctx.save();
    return () => { setField(it, key, before); render(); ctx.save(); };
  }

  actions.define('down', () => { ri++; render(); }, 'node');
  actions.define('up', () => { ri--; render(); });
  actions.define('right', () => { ci++; render(); }, 'column');
  actions.define('left', () => { ci--; render(); });
  actions.define('flag', () => toggle('flag'), 'flag');
  actions.define('question', () => toggle('question'), 'question deps');
  actions.define('finish', () => ctx.finish(), 'finish');
  actions.bind({
    ArrowDown: 'down', j: 'down', ArrowUp: 'up', k: 'up',
    ArrowRight: 'right', l: 'right', ArrowLeft: 'left', h: 'left',
    m: 'flag', q: 'question', u: 'undo', Enter: 'finish',
  });
  window.addEventListener('resize', edges);

  render();
  return { current: focus, render };
}
