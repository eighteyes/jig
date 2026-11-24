// qa.mjs — question board: one card per question, pick the answer with one key.
// Responsibilities:
// - show each `##` section as a question and each item as a numbered choice (label `x` = picked)
// - keys: j/k or arrows move between questions; 1-9 toggle a choice (single-pick unless `multi: true`)
// - w opens an inline input for a custom answer, appended as `- [x] text` with `custom:: true`
// - s toggles skip, ? toggles an explain request, a toggles an ask (section fields)
// - u undo; Enter finishes (the first Enter arms and warns when a question has no pick and no skip)
// - export summary(jig) with answers and the unanswered questions
// Dropped from the original board: branch expansion (parent/children queue).
//
// File:
//   ---
//   jig: qa
//   title: ...
//   multi: false
//   ---
//   Optional doc text (collapsible at the top).
//   ## Which database?
//   - Postgres
//     what:: what changes if picked
//   - [x] SQLite

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { newItem, setField } from '../web/format.mjs';

const questions = (jig) => jig.sections.filter((s) => typeof s.heading === 'string');
const picked = (it) => it.label === 'x';
const isCustom = (it) => Boolean(it.fields.custom);
const flag = (s, k) => Boolean(s.fields[k]);
const answered = (s) => s.items.some(picked) || flag(s, 'skip');

/** JSON for `jig open`: every question's picks, custom answer and flags, plus the unanswered list. */
export function summary(jig) {
  const qs = questions(jig);
  return {
    answers: qs.map((s) => {
      const custom = s.items.filter((it) => picked(it) && isCustom(it)).map((it) => it.text);
      return {
        question: s.heading,
        picks: s.items.filter((it) => picked(it) && !isCustom(it)).map((it) => it.text),
        custom: custom.length ? custom[custom.length - 1] : null,
        skip: flag(s, 'skip'),
        explain: flag(s, 'explain'),
        ask: flag(s, 'ask'),
      };
    }),
    unanswered: qs.filter((s) => !answered(s)).map((s) => s.heading),
  };
}

const STYLE = `
  .qa-doc { margin-bottom: var(--gap); }
  .qa-doc pre { white-space: pre-wrap; font: inherit; margin: 8px 0 0; }
  .qa-q { margin-bottom: var(--gap); }
  .qa-q h2 { text-transform: none; letter-spacing: 0; color: var(--ink); font-size: 16px; margin-bottom: 6px; }
  .qa-q .qa-prose { color: var(--dim); font-size: 13px; white-space: pre-wrap; margin-bottom: 6px; }
  .qa-flags { display: inline-flex; gap: 6px; margin-left: 8px; }
  .qa-flags span { font: 12px var(--mono); color: var(--accent); border: 1px solid var(--edge); border-radius: 4px; padding: 0 6px; }
  .qa-q.skipped h2 { color: var(--dim); text-decoration: line-through; }
  .qa-choice { display: flex; gap: 10px; align-items: baseline; background: var(--raised); border: 1px solid var(--edge); border-radius: var(--r); padding: 6px 10px; margin: 6px 0; cursor: pointer; }
  .qa-choice.picked { border-color: var(--good); }
  .qa-choice kbd { color: var(--dim); }
  .qa-choice .mark { font-family: var(--mono); width: 1.2em; color: var(--good); }
  .qa-choice .what { color: var(--dim); font-size: 13px; white-space: pre-wrap; }
  .qa-choice .tag { font: 12px var(--mono); color: var(--info); margin-left: 6px; }
  .qa-custom { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .qa-custom span { color: var(--dim); font-size: 13px; }
  .qa-custom input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--accent); border-radius: var(--r); padding: 4px 8px; }
  .qa-warn { color: var(--accent); margin: 12px 0; }
  .qa-progress { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
`;

export function mount(root, ctx) {
  css('qa', STYLE);
  const { jig, actions } = ctx;
  const qs = questions(jig);
  const multi = jig.meta.multi === true;
  let qi = Math.max(qs.findIndex((s) => !answered(s)), 0);
  let armed = false;
  let typing = false;

  const progress = el('div', 'qa-progress');
  const doc = el('details', 'qa-doc');
  const list = el('div');
  const warn = el('div', 'qa-warn');
  root.replaceChildren(progress, doc, list, warn);

  function render() {
    const open = qs.filter(answered).length;
    progress.textContent = qs.length ? `${open} of ${qs.length} answered · question ${qi + 1}` : 'No questions.';
    doc.hidden = !jig.intro?.trim();
    if (!doc.hidden) {
      const wasOpen = doc.open;
      doc.replaceChildren(el('summary', null, 'doc'), el('pre', null, jig.intro.trim()));
      doc.open = wasOpen;
    }
    list.replaceChildren(...qs.map(questionCard));
    const missing = qs.filter((s) => !answered(s)).length;
    warn.textContent = armed ? `${missing} question${missing === 1 ? '' : 's'} still open. Press Enter again to finish anyway.` : '';
    keepVisible(list.querySelector('.qa-q.active'));
  }

  function questionCard(s, i) {
    const card = el('div', 'card qa-q');
    if (i === qi) card.classList.add('active');
    if (flag(s, 'skip')) card.classList.add('skipped');
    const h = el('h2', null, s.heading);
    const flags = el('span', 'qa-flags');
    for (const [k, t] of [['skip', 'skip'], ['explain', 'explain?'], ['ask', 'ask']]) if (flag(s, k)) flags.append(el('span', null, t));
    h.append(flags, ...badges(s));
    card.append(h);
    const prose = (s.text || []).join('\n').trim();
    if (prose) card.append(el('div', 'qa-prose', prose));
    s.items.forEach((it, n) => {
      const row = el('div', 'qa-choice' + (picked(it) ? ' picked' : ''));
      const body = el('div');
      const line = el('div', null, it.text);
      if (isCustom(it)) line.append(el('span', 'tag', 'custom'));
      body.append(line);
      if (it.fields.what) body.append(el('div', 'what', it.fields.what));
      if (it.note.length) body.append(el('div', 'what', it.note.join('\n')));
      row.append(el('kbd', null, n < 9 ? String(n + 1) : '·'), el('span', 'mark', picked(it) ? '✓' : ''), body);
      row.addEventListener('click', () => { qi = i; actions.run(`pick:${n + 1}`); });
      card.append(row);
    });
    if (i === qi && typing) card.append(customRow());
    card.addEventListener('click', () => { if (qi !== i) { qi = i; render(); } });
    return card;
  }

  function customRow() {
    const row = el('div', 'qa-custom');
    const input = el('input');
    input.type = 'text';
    input.placeholder = 'custom answer, Enter to add, Esc to cancel';
    input.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { typing = false; render(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const text = input.value.trim();
      typing = false;
      if (!text) { render(); return; }
      actions.push(await addCustom(text));
    });
    row.append(el('span', null, 'custom'), input);
    queueMicrotask(() => input.focus());
    return row;
  }

  const labelsOf = (s) => s.items.map((it) => it.label);
  const restore = (s, labels) => s.items.forEach((it, n) => { it.label = labels[n]; });

  async function addCustom(text) {
    const s = qs[qi];
    const before = labelsOf(s);
    if (!multi) for (const it of s.items) if (picked(it)) it.label = null;
    const item = newItem(text, 'x', { custom: 'true' });
    s.items.push(item);
    render();
    await ctx.save();
    return async () => {
      s.items.splice(s.items.indexOf(item), 1);
      restore(s, before);
      render();
      await ctx.save();
    };
  }

  /** Define an action that disarms the finish warning before it runs. */
  function act(name, fn, title) {
    actions.define(name, (...a) => { armed = false; return fn(...a); }, title);
  }

  function toggleField(key) {
    const s = qs[qi];
    if (!s) return;
    const before = s.fields[key];
    setField(s, key, before ? null : 'true');
    render();
    ctx.save();
    return () => { setField(s, key, before); render(); ctx.save(); };
  }

  const maxChoices = Math.min(9, Math.max(1, ...qs.map((s) => s.items.length)));
  for (let n = 1; n <= maxChoices; n++) {
    act(`pick:${n}`, () => {
      const s = qs[qi];
      const it = s?.items[n - 1];
      if (!it) return;
      const before = labelsOf(s);
      if (picked(it)) it.label = null;
      else {
        if (!multi) for (const o of s.items) if (picked(o)) o.label = null;
        it.label = 'x';
      }
      render();
      ctx.save();
      return () => { restore(s, before); render(); ctx.save(); };
    }, `pick ${n}`);
  }
  act('down', () => { qi = Math.min(qi + 1, qs.length - 1); render(); }, 'next');
  act('up', () => { qi = Math.max(qi - 1, 0); render(); }, 'prev');
  act('custom', () => { if (qs[qi]) { typing = true; render(); } }, 'custom answer');
  act('skip', () => toggleField('skip'), 'skip');
  act('explain', () => toggleField('explain'), 'explain');
  act('ask', () => toggleField('ask'), 'ask');
  actions.define('finish', () => {
    if (!armed && qs.some((s) => !answered(s))) { armed = true; render(); return; }
    return ctx.finish();
  }, 'finish');
  actions.bind({ j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', w: 'custom', s: 'skip', '?': 'explain', a: 'ask', u: 'undo', Enter: 'finish' });
  for (let n = 1; n <= maxChoices; n++) actions.bind({ [n]: `pick:${n}` });

  render();
  return { current: () => qs[qi] ?? null, render };
}
