// triage.mjs — keyboard loop: one card at a time, one key per decision.
// Responsibilities:
// - show the next unlabelled item as a single card with its note and its media (image, audio, video)
// - bind the frontmatter's `actions` map (key -> label) and label the card on a press
// - meta `multi: true`: Shift+key (Shift+digit by physical key) adds a label (comma list) without advancing
// - x toggles label `unusable` and advances; 0 clears the label
// - advance, step back and forward, undo, finish
// - list decided items in a collapsible section, grouped by label
// - summary(jig): { by_label, unanswered, unusable, escalated }
// - media pane and keys (space, `,` `.`, `[` `]`) come from _media.mjs
//
// File:
//   ---
//   jig: triage
//   actions: {1: accept, 2: reject, 3: later}
//   multi: false
//   autoplay: true      (default: video yes, audio no)
//   muted: true         (default: video yes)
//   ---
//   - item       (unlabelled: still to decide)
//   - [accept] item
//     img:: a.png, b.png        video:: clip.mp4        audio:: clip.wav

const DEFAULT_ACTIONS = { 1: 'accept', 2: 'reject', 3: 'later' };
const UNUSABLE = 'unusable';
const RESERVED = new Set(['u', 'Enter', 'ArrowLeft', 'ArrowRight', 'j', 'k', 'x', '0', 'e', 'c', ' ', ',', '.', '[', ']']);

import { el, css, badges } from '../web/ui.mjs';
import { createMedia, defineMedia } from './_media.mjs';

const labelsOf = (it) => (it.label ? String(it.label).split(',').map((x) => x.trim()).filter(Boolean) : []);

export function summary(jig) {
  const items = jig.sections.flatMap((s) => s.items);
  const by_label = {};
  for (const it of items) for (const l of labelsOf(it)) if (l !== UNUSABLE) (by_label[l] ||= []).push(it.text);
  return {
    by_label,
    unanswered: items.filter((it) => !labelsOf(it).length).map((it) => it.text),
    unusable: items.filter((it) => labelsOf(it).includes(UNUSABLE)).map((it) => it.text),
    escalated: items.filter((it) => it.fields.escalate).map((it) => it.text),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const map = jig.meta.actions && typeof jig.meta.actions === 'object' ? jig.meta.actions : DEFAULT_ACTIONS;
  const multi = jig.meta.multi === true;
  const items = jig.sections.flatMap((s) => s.items);
  const labels = [...new Set(Object.values(map).map(String))];
  let pos = items.findIndex((it) => it.label === null);
  if (pos < 0) pos = 0;

  css('triage', `
    .tri-progress { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
    .tri-card { min-height: 160px; padding: 24px; font-size: 18px; }
    .tri-card .note { color: var(--dim); font-size: 14px; margin-top: 12px; white-space: pre-wrap; }
    .tri-card .label { float: right; font: 13px var(--mono); color: var(--accent); }
    .tri-keys { display: flex; gap: 8px; margin: 12px 0 20px; flex-wrap: wrap; }
    .tri-done { margin-top: 12px; }
    .tri-done ul { margin: 6px 0 0; padding-left: 18px; }
    .tri-done h2 { margin-top: 10px; }
    .tri-finish { margin: 16px 0; color: var(--good); }
  `);
  const media = createMedia(jig.meta);
  const progress = el('div', 'tri-progress');
  const card = el('div', 'card tri-card');
  const cardHead = el('div');
  const cardTail = el('div');
  card.append(cardHead, media.node, cardTail);   // media.node stays put so a re-render never pauses playback
  const keys = el('div', 'tri-keys');
  const finishLine = el('div', 'tri-finish');
  const decided = el('details', 'tri-done');
  root.replaceChildren(progress, card, keys, finishLine, decided);

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
    cardHead.replaceChildren();
    cardTail.replaceChildren();
    media.show(it ?? null);
    if (it) {
      if (it.label !== null) cardHead.append(el('span', 'label', it.label));
      cardHead.append(el('div', null, it.text));
      if (it.note.length) cardTail.append(el('div', 'note', it.note.join('\n')));
      cardTail.append(...badges(it));
      const n = nextOpen(pos);
      media.preload(items[n >= 0 ? n : pos + 1]);
    } else cardHead.append(el('div', null, 'No items.'));
    finishLine.textContent = left === 0 && items.length ? 'All decided. Press Enter to finish.' : '';

    decided.replaceChildren(el('summary', null, `decided (${items.length - left})`));
    const groups = [...labels, ...(items.some((x) => labelsOf(x).includes(UNUSABLE)) ? [UNUSABLE] : [])];
    for (const label of groups) {
      const done = items.filter((x) => labelsOf(x).includes(label));
      if (!done.length) continue;
      decided.append(el('h2', null, `${label} · ${done.length}`));
      const ul = el('ul');
      for (const x of done) ul.append(el('li', null, x.text));
      decided.append(ul);
    }
  }

  /** Set the item's label (null clears); advance to the next open card when asked. Returns the inverse. */
  async function setLabel(label, advance) {
    const it = items[pos];
    if (!it) return;
    const before = it.label, at = pos;
    it.label = label;
    if (advance) {
      const n = nextOpen(pos);
      pos = n < 0 ? Math.min(pos + 1, items.length - 1) : n;
    }
    render();
    await ctx.save();
    return async () => { it.label = before; pos = at; render(); await ctx.save(); };
  }

  for (const label of labels) {
    actions.define(`label:${label}`, () => setLabel(label, true), label);
    if (multi) {
      actions.define(`add:${label}`, () => {
        const it = items[pos];
        if (!it) return;
        const have = labelsOf(it).filter((l) => l !== UNUSABLE);
        return setLabel(have.includes(label) ? have.join(', ') : [...have, label].join(', '), false);
      });
    }
  }
  actions.define(UNUSABLE, () => {
    const it = items[pos];
    if (it) return setLabel(it.label === UNUSABLE ? null : UNUSABLE, it.label !== UNUSABLE);
  }, UNUSABLE);
  actions.define('clear', () => (items[pos]?.label != null ? setLabel(null, false) : undefined), 'clear');
  actions.define('next', () => { pos = Math.min(pos + 1, items.length - 1); render(); }, 'next');
  actions.define('back', () => { pos = Math.max(pos - 1, 0); render(); });
  actions.define('finish', () => ctx.finish());
  const mediaKeys = defineMedia(actions, media);

  const bindings = {};
  for (const [key, label] of Object.entries(map)) {
    if (RESERVED.has(String(key))) continue;
    bindings[key] = `label:${label}`;
    if (multi && !/^\d$/.test(String(key))) bindings[String(key).toUpperCase()] = `add:${label}`;
  }
  // Shift+digit is matched by physical key (e.code) so it works whatever symbol the layout gives.
  if (multi) {
    window.addEventListener('keydown', (e) => {
      const m = e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && /^Digit(\d)$/.exec(e.code);
      if (!m || !map[m[1]] || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      e.preventDefault();
      e.stopPropagation();
      actions.run(`add:${map[m[1]]}`);
    }, true);
  }
  actions.bind({ ...bindings, ...mediaKeys, ArrowRight: 'next', j: 'next', ArrowLeft: 'back', k: 'back', x: UNUSABLE, 0: 'clear', u: 'undo', Enter: 'finish' });
  render();
  return { current: () => items[pos] ?? null, render };
}
