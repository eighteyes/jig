// triage.mjs — keyboard loop: one card at a time, one key per decision.
// Responsibilities:
// - show the next unlabelled item as a single card with its note
// - bind the frontmatter's `actions` map (key -> label) and label the card on a press
// - advance, step back and forward, undo, finish
// - list decided items in a collapsible section, grouped by label
//
// File:
//   ---
//   jig: triage
//   actions: {1: accept, 2: reject, 3: later}
//   ---
//   - item       (unlabelled: still to decide)
//   - [accept] item

const DEFAULT_ACTIONS = { 1: 'accept', 2: 'reject', 3: 'later' };
const RESERVED = new Set(['u', 'Enter', 'ArrowLeft', 'ArrowRight', 'j', 'k']);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const map = jig.meta.actions && typeof jig.meta.actions === 'object' ? jig.meta.actions : DEFAULT_ACTIONS;
  const items = jig.sections.flatMap((s) => s.items);
  const labels = [...new Set(Object.values(map).map(String))];
  let pos = items.findIndex((it) => it.label === null);
  if (pos < 0) pos = 0;

  const style = el('style');
  style.textContent = `
    .tri-progress { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
    .tri-card { min-height: 160px; padding: 24px; font-size: 18px; }
    .tri-card .note { color: var(--dim); font-size: 14px; margin-top: 12px; white-space: pre-wrap; }
    .tri-card .label { float: right; font: 13px var(--mono); color: var(--accent); }
    .tri-keys { display: flex; gap: 8px; margin: 12px 0 20px; flex-wrap: wrap; }
    .tri-done { margin-top: 12px; }
    .tri-done ul { margin: 6px 0 0; padding-left: 18px; }
    .tri-done h2 { margin-top: 10px; }
    .tri-finish { margin: 16px 0; color: var(--good); }
  `;
  const progress = el('div', 'tri-progress');
  const card = el('div', 'card tri-card');
  const keys = el('div', 'tri-keys');
  const finishLine = el('div', 'tri-finish');
  const decided = el('details', 'tri-done');
  root.replaceChildren(style, progress, card, keys, finishLine, decided);

  for (const [key, label] of Object.entries(map)) {
    const b = el('button', null, `${key} · ${label}`);
    b.addEventListener('click', () => actions.run(`label:${label}`));
    keys.append(b);
  }

  function nextOpen(from) {
    for (let i = 1; i <= items.length; i++) {
      const j = (from + i) % items.length;
      if (items[j].label === null) return j;
    }
    return -1;
  }

  function render() {
    const left = items.filter((it) => it.label === null).length;
    progress.textContent = `${items.length - left} of ${items.length} decided · card ${pos + 1}`;
    const it = items[pos];
    card.replaceChildren();
    if (it) {
      if (it.label !== null) card.append(el('span', 'label', it.label));
      card.append(el('div', null, it.text));
      if (it.note.length) card.append(el('div', 'note', it.note.join('\n')));
    } else card.append(el('div', null, 'No items.'));
    finishLine.textContent = left === 0 && items.length ? 'All decided. Press Enter to finish.' : '';

    decided.replaceChildren(el('summary', null, `decided (${items.length - left})`));
    for (const label of labels) {
      const done = items.filter((x) => x.label === label);
      if (!done.length) continue;
      decided.append(el('h2', null, `${label} · ${done.length}`));
      const ul = el('ul');
      for (const x of done) ul.append(el('li', null, x.text));
      decided.append(ul);
    }
  }

  for (const label of labels) {
    actions.define(`label:${label}`, async () => {
      const it = items[pos];
      if (!it) return;
      const before = it.label, at = pos;
      it.label = label;
      const n = nextOpen(pos);
      pos = n < 0 ? Math.min(pos + 1, items.length - 1) : n;
      render();
      await ctx.save();
      return async () => { it.label = before; pos = at; render(); await ctx.save(); };
    }, label);
  }
  actions.define('next', () => { pos = Math.min(pos + 1, items.length - 1); render(); }, 'next');
  actions.define('back', () => { pos = Math.max(pos - 1, 0); render(); });
  actions.define('finish', () => ctx.finish());

  const bindings = {};
  for (const [key, label] of Object.entries(map)) {
    if (RESERVED.has(String(key))) continue;
    bindings[key] = `label:${label}`;
  }
  actions.bind({ ...bindings, ArrowRight: 'next', j: 'next', ArrowLeft: 'back', k: 'back', u: 'undo', Enter: 'finish' });
  render();
}
