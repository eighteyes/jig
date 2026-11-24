// breadboard.mjs — Shape Up breadboard: places as columns, affordances as cards, wires between them.
// Responsibilities:
// - read each `##` section as a place (column) and each item as an affordance
// - style `kind:: ui` and `kind:: code` differently; show `control` and the item's note lines
// - parse `wires:: target>flow` (flow control|data) and list each card's outgoing wires
// - on focus, highlight wire targets and the cards that wire into the focused one, and draw SVG wires
// - keys: up/down (j/k) within a place, left/right (h/l) between places, m flag, q question wiring, x strike (label `struck`), u undo, Enter finish
// - export summary(jig) with affordances, flagged, struck, questioned and comments
//
// File:
//   ---
//   jig: breadboard
//   ---
//   ## Login page
//   - Email field
//     id:: a1
//     kind:: ui
//     wires:: a2>control
//   - Submit
//     id:: a2
//     kind:: ui
//     control:: button
//     wires:: c1>data
//   ## Auth service
//   - Check password
//     id:: c1
//     kind:: code

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { fieldList, setField } from '../web/format.mjs';

const STRUCK = 'struck';
const NS = 'http://www.w3.org/2000/svg';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const idOf = (it) => (it.fields.id && String(it.fields.id).trim()) || slug(it.text);
const on = (it, key) => /^(true|yes|1)$/i.test(String(it.fields[key] ?? ''));
const struck = (it) => it.label === STRUCK;
const places = (jig) => jig.sections.filter((s) => s.items.length);
const placeName = (s) => s.heading ?? 'unplaced';

/** "a2>control, c1" -> [{ to: 'a2', flow: 'control' }, { to: 'c1', flow: 'control' }]. Flow defaults to control. */
function wiresOf(it) {
  return fieldList(it, 'wires').map((w) => {
    const [to, flow] = w.split('>').map((x) => x.trim());
    return { to, flow: flow === 'data' ? 'data' : 'control' };
  }).filter((w) => w.to);
}

/** JSON for `jig open`: every affordance with its marks, plus flagged, struck, questioned ids and comments. */
export function summary(jig) {
  const all = places(jig).flatMap((s) => s.items.map((it) => ({
    id: idOf(it),
    place: placeName(s),
    name: it.text,
    kind: it.fields.kind || null,
    flag: on(it, 'flag'),
    question: on(it, 'question'),
    struck: struck(it),
    note: it.fields.note || null,
  })));
  const ids = (key) => all.filter((a) => a[key]).map((a) => a.id);
  return {
    affordances: all,
    flagged: ids('flag'),
    struck: ids('struck'),
    questioned: ids('question'),
    comments: all.filter((a) => a.note).map((a) => ({ id: a.id, comment: a.note })),
  };
}

const STYLE = `
  .bb-bar { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
  .bb-scroll { overflow-x: auto; padding-bottom: 8px; }
  .bb { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); column-gap: 56px; align-items: start; min-width: fit-content; }
  .bb svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
  .bb-col { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; }
  .bb-col h2 { margin: 0 0 2px; }
  .bb-aff { cursor: pointer; border-left: 3px solid var(--edge); }
  .bb-aff.ui { border-radius: var(--r); }
  .bb-aff.code { border-radius: 2px; background: var(--bg); font-family: var(--mono); font-size: 13px; }
  .bb-aff .k { font: 11px var(--mono); text-transform: uppercase; color: var(--info); margin-right: 6px; }
  .bb-aff.code .k { color: var(--good); }
  .bb-aff .ctl { font: 12px var(--mono); color: var(--dim); border: 1px solid var(--edge); border-radius: 3px; padding: 0 5px; margin-left: 6px; }
  .bb-aff .id { font: 12px var(--mono); color: var(--dim); margin-left: 6px; }
  .bb-aff .d { color: var(--dim); font-size: 13px; white-space: pre-wrap; margin-top: 4px; }
  .bb-aff .w { color: var(--dim); font-size: 12px; margin-top: 3px; }
  .bb-aff .w.data { color: var(--info); }
  .bb-aff .w.miss { color: var(--bad); }
  .bb-aff.to, .bb-aff.from { border-color: var(--accent); }
  .bb-aff.to { border-left-color: var(--good); }
  .bb-aff.from { border-left-color: var(--info); }
  .bb-aff.active { border-color: var(--accent); border-left-color: var(--accent); background: var(--raised); }
  .bb-aff.flag { box-shadow: inset 0 0 0 1px var(--bad); }
  .bb-aff.struck .nm { text-decoration: line-through; color: var(--dim); }
  .bb-aff.struck { opacity: .6; }
  .bb-mark { font-size: 12px; margin-left: 8px; }
  .bb-mark.flag { color: var(--bad); }
  .bb-mark.q { color: var(--accent); }
  .bb-mark.x { color: var(--dim); }
  .bb-in { font-size: 12px; color: var(--accent); margin-top: 6px; }
  .bb svg path { fill: none; stroke: var(--edge); stroke-width: 1.2; opacity: .55; }
  .bb svg path.data { stroke-dasharray: 5 4; }
  .bb svg path.hot { stroke: var(--accent); stroke-width: 2; opacity: 1; }
  .bb svg polygon { fill: var(--edge); opacity: .55; }
  .bb svg polygon.hot { fill: var(--accent); opacity: 1; }
`;

export function mount(root, ctx) {
  css('breadboard', STYLE);
  const { jig, actions } = ctx;
  const cols = places(jig);
  const all = cols.flatMap((s) => s.items);
  const byId = new Map(all.map((it) => [idOf(it), it]));
  const colOf = new Map();
  cols.forEach((s, i) => s.items.forEach((it) => colOf.set(it, i)));
  const out = new Map(all.map((it) => [it, wiresOf(it).map((w) => ({ ...w, item: byId.get(w.to) }))]));
  const incoming = new Map(all.map((it) => [it, []]));
  for (const [it, ws] of out) for (const w of ws) if (w.item) incoming.get(w.item).push({ item: it, flow: w.flow });

  let ci = 0, ri = 0;
  const bar = el('div', 'bb-bar');
  const wrap = el('div', 'bb');
  const svg = document.createElementNS(NS, 'svg');
  const scroll = el('div', 'bb-scroll');
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
    const c = el('div', `card bb-aff ${it.fields.kind === 'code' ? 'code' : 'ui'}`);
    if (it === f) c.classList.add('active');
    else if (f && out.get(f).some((w) => w.item === it)) c.classList.add('to');
    else if (f && incoming.get(f).some((w) => w.item === it)) c.classList.add('from');
    if (on(it, 'flag')) c.classList.add('flag');
    if (struck(it)) c.classList.add('struck');
    const head = el('div');
    if (it.fields.kind) head.append(el('span', 'k', it.fields.kind));
    head.append(el('span', 'nm', it.text));
    if (it.fields.control) head.append(el('span', 'ctl', it.fields.control));
    head.append(el('span', 'id', idOf(it)));
    if (on(it, 'flag')) head.append(el('span', 'bb-mark flag', '⚑ flag'));
    if (on(it, 'question')) head.append(el('span', 'bb-mark q', '? wiring'));
    if (struck(it)) head.append(el('span', 'bb-mark x', 'struck'));
    c.append(head);
    if (it.note.length) c.append(el('div', 'd', it.note.join('\n')));
    for (const w of out.get(it)) c.append(el('div', `w ${w.flow}${w.item ? '' : ' miss'}`, `→ ${w.item ? w.item.text : `${w.to} (unknown)`} · ${w.flow}`));
    if (it === f && incoming.get(it).length) {
      c.append(el('div', 'bb-in', `← ${incoming.get(it).map((x) => `${x.item.text} · ${x.flow}`).join(', ')}`));
    }
    c.append(...badges(it));
    c.addEventListener('click', () => { ci = colOf.get(it); ri = cols[ci].items.indexOf(it); render(); });
    cards.set(it, c);
    return c;
  }

  function edges() {
    svg.replaceChildren();
    const f = focus();
    const box = wrap.getBoundingClientRect();
    const hot = [], cold = [];
    for (const [it, ws] of out) for (const w of ws) if (w.item) (it === f || w.item === f ? hot : cold).push([it, w.item, w.flow]);
    for (const [pass, group] of [[false, cold], [true, hot]]) {
      for (const [from, to, flow] of group) {
        if (colOf.get(from) === colOf.get(to)) continue;
        const a = cards.get(from)?.getBoundingClientRect(), b = cards.get(to)?.getBoundingClientRect();
        if (!a || !b) continue;
        const rightward = colOf.get(from) < colOf.get(to);
        const x1 = (rightward ? a.right : a.left) - box.left, y1 = a.top + a.height / 2 - box.top;
        const x2 = (rightward ? b.left : b.right) - box.left, y2 = b.top + b.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        p.setAttribute('class', [flow === 'data' ? 'data' : '', pass ? 'hot' : ''].filter(Boolean).join(' '));
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
    wrap.replaceChildren(svg, ...cols.map((s) => {
      const col = el('div', 'bb-col');
      col.append(el('h2', null, `${placeName(s)} · ${s.items.length}`), ...s.items.map(card));
      return col;
    }));
    const count = (fn) => all.filter(fn).length;
    bar.textContent = all.length
      ? `${all.length} affordances · ${count((it) => on(it, 'flag'))} flagged · ${count((it) => on(it, 'question'))} questioned · ${count(struck)} struck`
      : 'No affordances.';
    edges();
    keepVisible(wrap.querySelector('.bb-aff.active'));
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

  function strike() {
    const it = focus();
    if (!it) return;
    const before = it.label;
    it.label = struck(it) ? null : STRUCK;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
  }

  actions.define('down', () => { ri++; render(); }, 'affordance');
  actions.define('up', () => { ri--; render(); });
  actions.define('right', () => { ci++; render(); }, 'place');
  actions.define('left', () => { ci--; render(); });
  actions.define('flag', () => toggle('flag'), 'flag');
  actions.define('question', () => toggle('question'), 'question wiring');
  actions.define('strike', strike, 'strike');
  actions.define('finish', () => ctx.finish(), 'finish');
  actions.bind({
    ArrowDown: 'down', j: 'down', ArrowUp: 'up', k: 'up',
    ArrowRight: 'right', l: 'right', ArrowLeft: 'left', h: 'left',
    m: 'flag', q: 'question', x: 'strike', u: 'undo', Enter: 'finish',
  });
  window.addEventListener('resize', edges);

  render();
  return { current: focus, render };
}
