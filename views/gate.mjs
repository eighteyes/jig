// gate.mjs — rows of N candidates: pass the good ones, crown the best.
// Responsibilities:
// - read each item as a row; candidates come from its `audio`, `img` or `video` field (comma list),
//   else from its indented note lines (text candidates)
// - show candidates numbered side by side; pass and crown marks live on the row
// - keys: j/k or arrows focus a row; 1..9 toggle pass for candidate N and play/show it;
//   Shift+1..9 crown N (crown implies pass); a pass all; space play next; 0 clear;
//   x toggle label `unusable` and advance; u undo; Enter finish (arms while rows have no pass)
// - summary(jig): { rows, by_index, unanswered, unusable }
//
// File:
//   ---
//   jig: gate
//   ---
//   - prompt 7
//     audio:: c/7a.wav, c/7b.wav, c/7c.wav
//     passed:: 1, 3
//     crown:: 3
//
// Media paths resolve through mediaUrl(): the host serves files beside the jig at /media/<path>.

import { el, css, badges, keepVisible, mediaUrl } from '../web/ui.mjs';
import { fieldList, fieldNumber, setField } from '../web/format.mjs';

const UNUSABLE = 'unusable';
const MEDIA = ['audio', 'img', 'video'];
// Shift+1..9 on a US layout.
const SHIFTED = ['!', '@', '#', '$', '%', '^', '&', '*', '('];
const MAX = 9;

const rowsOf = (jig) => jig.sections.flatMap((s) => s.items);

/** Candidate list for a row: { kind, items: [string] }. kind is audio|img|video|text. */
function candidates(it) {
  for (const kind of MEDIA) {
    const list = fieldList(it, kind);
    if (list.length) return { kind, items: list };
  }
  return { kind: 'text', items: (it.note || []).map((l) => l.trim()).filter(Boolean) };
}

const passedOf = (it) => [...new Set(fieldList(it, 'passed').map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
const crownOf = (it) => fieldNumber(it, 'crown');
const isUnusable = (it) => it.label === UNUSABLE;
const isOpen = (it) => !passedOf(it).length && !isUnusable(it);

export function summary(jig) {
  const rows = rowsOf(jig).map((it) => ({ text: it.text, passed: passedOf(it), crown: crownOf(it), unusable: isUnusable(it) }));
  const by_index = {};
  for (const r of rows) for (const n of r.passed) (by_index[String(n)] ||= []).push(r.text);
  return {
    rows,
    by_index,
    unanswered: rows.filter((r) => !r.passed.length && !r.unusable).map((r) => r.text),
    unusable: rows.filter((r) => r.unusable).map((r) => r.text),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  let focus = Math.max(rowsOf(jig).findIndex(isOpen), 0);
  let armed = false;
  const cursor = new Map();   // item -> last candidate played or shown (0-based), for space

  css('gate', `
    .gt-progress { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
    .gt-row { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px 12px; margin-bottom: var(--gap); cursor: pointer; }
    .gt-row.active { border-color: var(--accent); background: var(--raised); }
    .gt-row.unusable { opacity: .55; }
    .gt-row.unusable .gt-text { text-decoration: line-through; }
    .gt-head { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; }
    .gt-text { font-weight: 600; flex: 1; }
    .gt-tag { font: 12px var(--mono); color: var(--bad); }
    .gt-cands { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .gt-cell { border: 1px solid var(--edge); border-radius: var(--r); padding: 8px; background: var(--bg); min-width: 0; }
    .gt-cell.cur { border-color: var(--info); }
    .gt-cell.pass { border-color: var(--good); }
    .gt-cell.crown { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .gt-cell-head { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12px; color: var(--dim); }
    .gt-n { font: 600 12px var(--mono); color: var(--ink); background: var(--raised); border: 1px solid var(--edge); border-radius: 4px; padding: 0 6px; }
    .gt-cell.pass .gt-n { color: var(--good); border-color: var(--good); }
    .gt-cell.crown .gt-n { color: var(--accent); border-color: var(--accent); }
    .gt-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .gt-mark { font-size: 12px; color: var(--good); }
    .gt-cell.crown .gt-mark { color: var(--accent); }
    .gt-cell audio { width: 100%; height: 32px; display: block; }
    .gt-cell img, .gt-cell video { max-width: 100%; max-height: 220px; display: block; border-radius: 4px; }
    .gt-cell .gt-body { white-space: pre-wrap; }
    .gt-empty { color: var(--dim); font-size: 13px; }
    .gt-warn { color: var(--accent); margin: 12px 0; min-height: 1.4em; }
  `);

  const progress = el('div', 'gt-progress');
  const list = el('div', 'gt-list');
  const warn = el('div', 'gt-warn');
  root.replaceChildren(progress, list, warn);

  const clamp = () => { focus = Math.min(Math.max(focus, 0), Math.max(rowsOf(jig).length - 1, 0)); };
  const here = () => rowsOf(jig)[focus] ?? null;

  function cell(it, cand, n) {
    const passed = passedOf(it).includes(n);
    const crown = crownOf(it) === n;
    const cls = ['gt-cell'];
    if (passed) cls.push('pass');
    if (crown) cls.push('crown');
    if ((cursor.get(it) ?? -1) === n - 1) cls.push('cur');
    const c = el('div', cls.join(' '));
    c.dataset.n = String(n);
    const head = el('div', 'gt-cell-head');
    head.append(el('span', 'gt-n', String(n)));
    const src = cand.items[n - 1];
    if (cand.kind !== 'text') head.append(el('span', 'gt-name', src.split('/').pop()));
    else head.append(el('span', 'gt-name'));
    head.append(el('span', 'gt-mark', crown ? '★ crown' : passed ? '✓ pass' : ''));
    c.append(head);
    if (cand.kind === 'audio' || cand.kind === 'video') {
      const m = el(cand.kind);
      m.controls = true;
      m.preload = 'none';
      m.src = mediaUrl(src);
      c.append(m);
    } else if (cand.kind === 'img') {
      const im = el('img');
      im.src = mediaUrl(src);
      im.alt = src;
      c.append(im);
    } else {
      c.append(el('div', 'gt-body', src));
    }
    return c;
  }

  function render() {
    clamp();
    armed = false;
    warn.textContent = '';
    const rows = rowsOf(jig);
    const open = rows.filter(isOpen).length;
    progress.textContent = rows.length ? `${rows.length - open} of ${rows.length} rows answered · row ${focus + 1}` : '';
    list.replaceChildren(...rows.map((it, i) => {
      const cls = ['gt-row'];
      if (i === focus) cls.push('active');
      if (isUnusable(it)) cls.push('unusable');
      const row = el('div', cls.join(' '));
      const head = el('div', 'gt-head');
      head.append(el('span', 'gt-text', it.text));
      if (isUnusable(it)) head.append(el('span', 'gt-tag', UNUSABLE));
      row.append(head);
      const cand = candidates(it);
      if (cand.items.length) {
        const grid = el('div', 'gt-cands');
        cand.items.slice(0, MAX).forEach((_, k) => grid.append(cell(it, cand, k + 1)));
        row.append(grid);
      } else row.append(el('div', 'gt-empty', 'no candidates'));
      row.append(...badges(it));
      row.addEventListener('click', () => { focus = i; render(); });
      return row;
    }));
    keepVisible(list.children[focus]);
  }

  /** Stop every media element, then play or show candidate n (1-based) on the focused row. */
  function play(n) {
    const it = here();
    if (!it) return;
    const cand = candidates(it);
    if (n < 1 || n > cand.items.length) return;
    cursor.set(it, n - 1);
    render();
    for (const m of root.querySelectorAll('audio, video')) m.pause();
    const m = root.querySelector(`.gt-row.active .gt-cell[data-n="${n}"] audio, .gt-row.active .gt-cell[data-n="${n}"] video`);
    if (m) {
      try { m.currentTime = 0; } catch { /* not loaded yet */ }
      const p = m.play();
      if (p && p.catch) p.catch(() => {});   // playback never blocks the mark
    }
  }

  /** Apply `change(it)` to the focused row's marks; returns the inverse for undo. */
  function mark(change, { advance = false, replay = null } = {}) {
    const it = here();
    if (!it) return;
    const at = focus;
    const before = { passed: it.fields.passed, crown: it.fields.crown, label: it.label };
    change(it);
    if (advance) focus = Math.min(focus + 1, rowsOf(jig).length - 1);
    render();
    if (replay) play(replay);
    ctx.save();
    return () => {
      for (const k of ['passed', 'crown']) { if (before[k] === undefined) delete it.fields[k]; else it.fields[k] = before[k]; }
      it.label = before.label;
      focus = at;
      render();
      ctx.save();
    };
  }

  const count = () => { const it = here(); return it ? candidates(it).items.length : 0; };

  function togglePass(n) {
    if (n > count() || n > MAX) return;
    return mark((it) => {
      const p = passedOf(it);
      if (p.includes(n)) {
        setField(it, 'passed', p.filter((x) => x !== n));
        if (crownOf(it) === n) setField(it, 'crown', null);
      } else setField(it, 'passed', [...p, n].sort((a, b) => a - b));
      if (isUnusable(it)) it.label = null;
    }, { replay: n });
  }

  function crown(n) {
    if (n > count() || n > MAX) return;
    return mark((it) => {
      if (crownOf(it) === n) { setField(it, 'crown', null); return; }
      setField(it, 'crown', n);
      setField(it, 'passed', [...new Set([...passedOf(it), n])].sort((a, b) => a - b));
      if (isUnusable(it)) it.label = null;
    }, { replay: n });
  }

  function passAll() {
    const k = Math.min(count(), MAX);
    if (!k) return;
    return mark((it) => {
      setField(it, 'passed', Array.from({ length: k }, (_, i) => i + 1));
      if (isUnusable(it)) it.label = null;
    });
  }

  function clear() {
    return mark((it) => {
      setField(it, 'passed', null);
      setField(it, 'crown', null);
      if (isUnusable(it)) it.label = null;
    });
  }

  function unusable() {
    return mark((it) => {
      if (isUnusable(it)) { it.label = null; return; }
      it.label = UNUSABLE;
      setField(it, 'passed', null);
      setField(it, 'crown', null);
    }, { advance: true });
  }

  function playNext() {
    const it = here();
    if (!it) return;
    const k = Math.min(candidates(it).items.length, MAX);
    if (!k) return;
    play(((cursor.get(it) ?? -1) + 1) % k + 1);
  }

  function finish() {
    const waiting = rowsOf(jig).filter(isOpen).length;
    if (waiting && !armed) {
      armed = true;
      warn.textContent = `${waiting} row${waiting === 1 ? '' : 's'} with no pass. Press Enter again to finish.`;
      return;
    }
    return ctx.finish();
  }

  actions.define('down', () => { focus++; render(); }, 'row');
  actions.define('up', () => { focus--; render(); });
  for (let n = 1; n <= MAX; n++) {
    // Only key 1 carries the legend text; a space title keeps keys 2..9 from showing their action names.
    actions.define(`pass:${n}`, () => togglePass(n), n === 1 ? 'pass 1-9' : ' ');
    actions.define(`crown:${n}`, () => crown(n), n === 1 ? 'crown 1-9' : ' ');
  }
  actions.define('pass-all', passAll, 'pass all');
  actions.define('play-next', playNext, 'play next');
  actions.define('clear', clear, 'clear');
  actions.define('unusable', unusable, 'unusable');
  actions.define('finish', finish);

  const keys = { j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', a: 'pass-all', ' ': 'play-next', 0: 'clear', x: 'unusable', u: 'undo', Enter: 'finish' };
  for (let n = 1; n <= MAX; n++) { keys[String(n)] = `pass:${n}`; keys[SHIFTED[n - 1]] = `crown:${n}`; }
  actions.bind(keys);

  ctx.legend?.();
  render();
  return { current: () => here(), render };
}
