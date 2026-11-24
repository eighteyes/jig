// rerank.mjs — slopegraph re-rank: the model's guess order on the left, your order on the right.
// Responsibilities:
// - stamp `guess:: N` on items that lack it, from their file position (saved once on mount)
// - draw two columns joined by SVG lines, coloured by direction moved (good up, bad down, dim unchanged)
// - keys: j/k or arrows focus, J/K or shift+arrows move the focused item in the file order, u undo, Enter finish
// - summary(jig): { order, moved } with delta = guess_rank - human_rank
//
// File:
//   ---
//   jig: rerank
//   left: model guess
//   right: your order
//   ---
//   - first item
//     guess:: 1
//   - second item
//     guess:: 2
//
// File order IS the human order.

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { fieldNumber, setField } from '../web/format.mjs';

const ROW = 52;

const flat = (jig) => jig.sections.flatMap((s) => s.items.map((it) => ({ it, sec: s })));

/** Rows in file order with guess_rank (rank by `guess`, ties by file order), human_rank and delta. */
function ranks(items) {
  const guess = items.map((it, i) => fieldNumber(it, 'guess') ?? i + 1);
  const order = items.map((_, i) => i).sort((a, b) => guess[a] - guess[b] || a - b);
  const gr = new Map(order.map((i, r) => [i, r + 1]));
  return items.map((it, i) => ({ text: it.text, guess_rank: gr.get(i), human_rank: i + 1, delta: gr.get(i) - (i + 1) }));
}

export function summary(jig) {
  const order = ranks(flat(jig).map((x) => x.it));
  return { order, moved: order.filter((r) => r.delta !== 0) };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  let focus = 0;

  // Stamp missing guesses once.
  let stamped = false;
  flat(jig).forEach(({ it }, i) => {
    if (fieldNumber(it, 'guess') === null) { setField(it, 'guess', i + 1); stamped = true; }
  });
  if (stamped) ctx.save();

  css('rerank', `
    .rr-head { display: grid; grid-template-columns: 1fr 160px 1fr; color: var(--dim); font-size: 13px; margin-bottom: 6px; }
    .rr-head span:first-child { text-align: right; }
    .rr-head span:last-child { text-align: left; }
    .rr { display: grid; grid-template-columns: 1fr 160px 1fr; }
    .rr-col { display: flex; flex-direction: column; }
    .rr-row { height: ${ROW}px; padding: 6px 12px; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); overflow: hidden; cursor: pointer; }
    .rr-row + .rr-row { margin-top: 0; }
    .rr-col.left { text-align: right; }
    .rr-row.active { border-color: var(--accent); background: var(--raised); }
    .rr-row .n { color: var(--dim); font: 12px var(--mono); margin: 0 6px; }
    .rr-row .t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
    .rr-row .jig-note { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0; font-size: 12px; }
    .rr-svg { width: 100%; display: block; }
    .rr-svg line { stroke-width: 2; vector-effect: non-scaling-stroke; opacity: .75; }
    .rr-svg line.up { stroke: var(--good); }
    .rr-svg line.down { stroke: var(--bad); }
    .rr-svg line.same { stroke: var(--dim); opacity: .45; }
    .rr-svg line.active { stroke-width: 4; opacity: 1; }
  `);
  const head = el('div', 'rr-head');
  const grid = el('div', 'rr');
  root.replaceChildren(head, grid);

  function render() {
    const rows = flat(jig);
    const items = rows.map((x) => x.it);
    const rk = ranks(items);
    focus = Math.min(Math.max(focus, 0), Math.max(items.length - 1, 0));
    head.replaceChildren(el('span', null, String(jig.meta.left ?? 'model guess')), el('span'), el('span', null, String(jig.meta.right ?? 'your order')));

    const byGuess = rk.map((r, i) => i).sort((a, b) => rk[a].guess_rank - rk[b].guess_rank);
    const left = el('div', 'rr-col left');
    const right = el('div', 'rr-col right');
    const row = (i, side) => {
      const d = el('div', `rr-row${i === focus ? ' active' : ''}`);
      const t = el('span', 't', items[i].text);
      const n = el('span', 'n', String(side === 'left' ? rk[i].guess_rank : rk[i].human_rank));
      if (side === 'left') t.append(n); else t.prepend(n);
      d.append(t);
      if (side === 'right') d.append(...badges(items[i]));
      d.addEventListener('click', () => { focus = i; render(); });
      return d;
    };
    for (const i of byGuess) left.append(row(i, 'left'));
    items.forEach((_, i) => right.append(row(i, 'right')));

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'rr-svg');
    svg.setAttribute('viewBox', `0 0 100 ${Math.max(items.length, 1) * ROW}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.height = `${items.length * ROW}px`;
    items.forEach((_, i) => {
      const l = document.createElementNS(NS, 'line');
      const dir = rk[i].delta > 0 ? 'up' : rk[i].delta < 0 ? 'down' : 'same';
      l.setAttribute('class', `${dir}${i === focus ? ' active' : ''}`);
      l.setAttribute('x1', '0');
      l.setAttribute('x2', '100');
      l.setAttribute('y1', String((rk[i].guess_rank - 0.5) * ROW));
      l.setAttribute('y2', String((i + 0.5) * ROW));
      svg.append(l);
    });
    grid.replaceChildren(left, svg, right);
    keepVisible(right.children[focus]);
  }

  /** Move the item at flat position `i` one step (dir -1 up, +1 down), crossing section edges. */
  function shift(i, dir) {
    const rows = flat(jig);
    const j = i + dir;
    if (j < 0 || j >= rows.length) return false;
    const a = rows[i], b = rows[j];
    if (a.sec === b.sec) {
      const arr = a.sec.items;
      const ai = arr.indexOf(a.it), bi = arr.indexOf(b.it);
      [arr[ai], arr[bi]] = [arr[bi], arr[ai]];
    } else {
      a.sec.items.splice(a.sec.items.indexOf(a.it), 1);
      if (dir < 0) b.sec.items.push(a.it); else b.sec.items.unshift(a.it);
    }
    return true;
  }

  function move(dir) {
    const from = focus;
    if (!shift(from, dir)) return;
    focus = from + dir;
    render();
    ctx.save();
    return () => { shift(from + dir, -dir); focus = from; render(); ctx.save(); };
  }

  actions.define('down', () => { focus++; render(); }, 'focus');
  actions.define('up', () => { focus--; render(); });
  actions.define('move-down', () => move(1), 'move down');
  actions.define('move-up', () => move(-1), 'move up');
  actions.define('finish', () => ctx.finish());
  actions.bind({ j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', J: 'move-down', K: 'move-up', 'Shift+ArrowDown': 'move-down', 'Shift+ArrowUp': 'move-up', u: 'undo', Enter: 'finish' });

  render();
  return { current: () => flat(jig)[focus]?.it ?? null, render };
}
