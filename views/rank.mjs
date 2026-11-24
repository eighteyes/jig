// rank.mjs — ranked standings review: keep, cut or promote each entry; top three on a podium.
// Responsibilities:
// - show items sorted by `score` (or `rating`) descending without reordering the file
// - show rank, score, and wins/losses/ties when present; top three get a podium style
// - keys: ↑/↓ (j/k) focus; space or m keep; x cut; p promote; u undo; Enter finish
// - labels: keep, cut, promote (promote implies keep in the summary)
// - summary(jig): ranking, shortlist, cut, promoted
//
// File:
//   ---
//   jig: rank
//   ---
//   - Option A
//     score:: 1620
//     wins:: 7
//     losses:: 2
//   - [keep] Option B
//     score:: 1580

import { el, badges, css, keepVisible } from '../web/ui.mjs';
import { fieldNumber } from '../web/format.mjs';

const MARKS = new Set(['keep', 'cut', 'promote']);

function items(jig) { return jig.sections.flatMap((s) => s.items); }
function scoreOf(it) { return fieldNumber(it, 'score') ?? fieldNumber(it, 'rating'); }

/** Items in display order: score descending, unscored last, file order breaks ties. */
export function ordered(jig) {
  return items(jig).map((it, i) => ({ it, i, s: scoreOf(it) }))
    .sort((a, b) => (b.s ?? -Infinity) - (a.s ?? -Infinity) || a.i - b.i)
    .map((x) => x.it);
}

/** Type-specific JSON for `jig open`. Runs in Node. */
export function summary(jig) {
  const ranking = ordered(jig).map((it, i) => ({
    label: it.text,
    rank: i + 1,
    score: scoreOf(it),
    mark: MARKS.has(it.label) ? it.label : null,
  }));
  const texts = (pred) => ranking.filter(pred).map((r) => r.label);
  return {
    ranking,
    shortlist: texts((r) => r.mark === 'keep' || r.mark === 'promote'),
    cut: texts((r) => r.mark === 'cut'),
    promoted: texts((r) => r.mark === 'promote'),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const list = ordered(jig);
  let pos = 0;

  css('rank', `
    .rk { display: flex; flex-direction: column; gap: 6px; }
    .rk-row { display: grid; grid-template-columns: 44px 1fr auto auto; gap: 12px; align-items: center; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px 12px; cursor: pointer; }
    .rk-row.active { border-color: var(--accent); background: var(--raised); }
    .rk-row.p1 { border-left: 4px solid var(--accent); }
    .rk-row.p2 { border-left: 4px solid var(--info); }
    .rk-row.p3 { border-left: 4px solid var(--good); }
    .rk-row.p1 .rk-n { color: var(--accent); font-size: 22px; }
    .rk-row.p2 .rk-n { color: var(--info); font-size: 20px; }
    .rk-row.p3 .rk-n { color: var(--good); font-size: 18px; }
    .rk-row.cut .rk-t { text-decoration: line-through; color: var(--dim); }
    .rk-row.cut { opacity: .6; }
    .rk-n { font: 600 16px var(--mono); color: var(--dim); text-align: center; }
    .rk-s { font: 14px var(--mono); }
    .rk-rec { font: 12px var(--mono); color: var(--dim); }
    .rk-mark { font: 12px var(--mono); padding: 1px 8px; border-radius: 10px; border: 1px solid var(--edge); min-width: 64px; text-align: center; }
    .rk-mark.none { visibility: hidden; }
    .rk-mark.keep { color: var(--good); border-color: var(--good); }
    .rk-mark.promote { color: var(--accent); border-color: var(--accent); }
    .rk-mark.cut { color: var(--bad); border-color: var(--bad); }
    .rk-empty { color: var(--dim); padding: 20px 0; }
  `);
  const wrap = el('div', 'rk');
  root.replaceChildren(wrap);

  function render() {
    pos = Math.min(Math.max(pos, 0), Math.max(list.length - 1, 0));
    if (!list.length) { wrap.replaceChildren(el('div', 'rk-empty', 'No entries.')); return; }
    wrap.replaceChildren(...list.map((it, i) => {
      const cls = ['rk-row'];
      if (i < 3) cls.push(`p${i + 1}`);
      if (i === pos) cls.push('active');
      if (it.label === 'cut') cls.push('cut');
      const row = el('div', cls.join(' '));
      const mid = el('div');
      mid.append(el('div', 'rk-t', it.text), ...badges(it));
      const rec = ['wins', 'losses', 'ties'].filter((k) => it.fields[k] !== undefined).map((k) => `${it.fields[k]} ${k[0].toUpperCase()}`);
      const s = scoreOf(it);
      const side = el('div');
      side.append(el('div', 'rk-s', s === null ? '' : String(s)), el('div', 'rk-rec', rec.join(' / ')));
      row.append(el('div', 'rk-n', String(i + 1)), mid, side, el('span', `rk-mark ${MARKS.has(it.label) ? it.label : 'none'}`, MARKS.has(it.label) ? it.label : ''));
      row.addEventListener('click', () => { pos = i; render(); });
      return row;
    }));
    keepVisible(wrap.children[pos]);
  }

  const move = (d) => () => { pos += d; render(); };

  /** Define a label change: next(label) returns the new label for the focused item. */
  function mark(name, title, next) {
    actions.define(name, async () => {
      const it = list[pos];
      if (!it) return;
      const before = it.label;
      it.label = next(before);
      render();
      await ctx.save();
      return async () => { it.label = before; render(); await ctx.save(); };
    }, title);
  }
  mark('keep', 'keep', (l) => (l === 'keep' || l === 'promote' ? null : 'keep'));
  mark('cut', 'cut', (l) => (l === 'cut' ? null : 'cut'));
  mark('promote', 'promote', (l) => (l === 'promote' ? 'keep' : 'promote'));

  actions.define('down', move(1), 'move');
  actions.define('up', move(-1), 'up');
  actions.define('finish', () => ctx.finish());
  actions.bind({
    ArrowDown: 'down', j: 'down', ArrowUp: 'up', k: 'up',
    ' ': 'keep', m: 'keep', x: 'cut', p: 'promote', u: 'undo', Enter: 'finish',
  });
  render();
  return { current: () => list[pos] ?? null, render };
}
