// compose.mjs — compose a prompt from ordered fragments: reorder, strike, tag, assign agents.
// Responsibilities:
// - one fragment per item; file order IS the composition order; the item text is the title, note lines are the body
// - body is collapsed by default (first line dimmed); space/→ expand, ← collapse, o toggles all
// - keys: j/k focus, J/K or shift+arrows move, x strike (label `struck`), t tags (inline input), a assign mode, u undo, Enter finish
// - assign mode: roster (meta.agents, default [lead, worker]) shown numbered inline; digits toggle, Enter or a commits, Escape cancels
// - show a running token total of live (unstruck) fragments when any `tokens` field exists
// - summary(jig): { order, struck, tagged, assigned, tokens }; key = `id` field or the text
//
// File:
//   ---
//   jig: compose
//   agents: [kip, patches, lead, worker]
//   ---
//   - Role preamble
//     id:: f1
//     layer:: system
//     tokens:: 120
//     tags:: tone, safety
//     agents:: lead
//     Body text, as many note lines as it needs.
//   - [struck] Old rule
//     id:: f2

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { fieldList, fieldNumber, setField } from '../web/format.mjs';

const DEFAULT_ROSTER = ['lead', 'worker'];
const STRUCK = 'struck';

const roster = (jig) => {
  const a = jig.meta?.agents;
  const list = Array.isArray(a) ? a.map(String).filter(Boolean) : [];
  return list.length ? list : DEFAULT_ROSTER;
};
const flat = (jig) => jig.sections.flatMap((s) => s.items.map((it) => ({ it, sec: s })));
const keyOf = (it) => it.fields?.id || it.text;
const live = (it) => it.label !== STRUCK;

export function summary(jig) {
  const items = flat(jig).map((x) => x.it);
  const tagged = {}, assigned = {};
  let tokens = 0;
  for (const it of items) {
    const tags = fieldList(it, 'tags'), agents = fieldList(it, 'agents');
    if (tags.length) tagged[keyOf(it)] = tags;
    if (agents.length) assigned[keyOf(it)] = agents;
    if (live(it)) tokens += fieldNumber(it, 'tokens') ?? 0;
  }
  return {
    order: items.filter(live).map(keyOf),
    struck: items.filter((it) => !live(it)).map(keyOf),
    tagged,
    assigned,
    tokens,
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const names = roster(jig);
  let focus = 0;
  let assign = null; // { it, picked: Set<string> } while in assign mode
  const open = new Set(); // fragments showing their full body

  css('compose', `
    .cp-head { display: flex; gap: 16px; align-items: baseline; margin-bottom: 10px; color: var(--dim); font-size: 13px; }
    .cp-total { color: var(--accent); font-family: var(--mono); }
    .cp-frag { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 8px 12px; margin: 8px 0; cursor: pointer; overflow-wrap: anywhere; }
    .cp-frag.active { border-color: var(--accent); background: var(--raised); }
    .cp-frag.struck .cp-title { color: var(--dim); text-decoration: line-through; }
    .cp-top { display: flex; gap: 10px; align-items: baseline; }
    .cp-n { color: var(--dim); font: 12px var(--mono); min-width: 2ch; text-align: right; }
    .cp-title { font-weight: 600; flex: 1; }
    .cp-tok { color: var(--dim); font: 12px var(--mono); white-space: nowrap; }
    .cp-meta { font-size: 12px; color: var(--dim); margin: 2px 0 0 calc(2ch + 10px); display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .cp-chip { border: 1px solid var(--edge); border-radius: 10px; padding: 0 8px; }
    .cp-chip.tag { color: var(--info); }
    .cp-chip.agent { color: var(--good); }
    .cp-flag { color: var(--bad); font-size: 12px; }
    .cp-body { color: var(--dim); font-size: 13px; margin: 4px 0 0 calc(2ch + 10px); white-space: pre-wrap; }
    .cp-body.peek { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-assign { margin: 6px 0 0 calc(2ch + 10px); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; }
    .cp-assign .cp-pick { border: 1px solid var(--edge); border-radius: var(--r); padding: 1px 8px; color: var(--dim); }
    .cp-assign .cp-pick.on { border-color: var(--good); color: var(--good); }
    .cp-assign kbd { margin-right: 4px; color: var(--accent); }
    .cp-assign .hint { color: var(--dim); font-size: 12px; }
    .cp-empty { color: var(--dim); padding: 20px 0; }
    .cp-bar { position: fixed; bottom: 38px; left: 0; right: 0; background: var(--raised); border-top: 1px solid var(--accent); padding: 8px 20px; display: flex; gap: 12px; align-items: center; }
    .cp-bar[hidden] { display: none; }
    .cp-bar span { color: var(--dim); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
    .cp-bar input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); padding: 4px 8px; }
  `);
  const head = el('div', 'cp-head');
  const list = el('div', 'cp-list');
  const bar = el('div', 'cp-bar');
  const barLabel = el('span');
  const input = el('input');
  bar.append(barLabel, input);
  bar.hidden = true;
  root.replaceChildren(head, list, bar);

  const rows = () => flat(jig);
  const here = () => rows()[focus]?.it ?? null;

  function frag(it, i) {
    const cls = ['cp-frag'];
    if (i === focus) cls.push('active');
    if (!live(it)) cls.push('struck');
    const d = el('div', cls.join(' '));
    const top = el('div', 'cp-top');
    top.append(el('span', 'cp-n', String(i + 1)), el('span', 'cp-title', it.text));
    const tok = fieldNumber(it, 'tokens');
    if (tok !== null) top.append(el('span', 'cp-tok', `${tok} tok`));
    if (!live(it)) top.append(el('span', 'cp-flag', `[${STRUCK}]`));
    else if (it.label) top.append(el('span', 'cp-tok', `[${it.label}]`));
    d.append(top);

    const meta = el('div', 'cp-meta');
    if (it.fields.layer) meta.append(el('span', null, it.fields.layer));
    for (const t of fieldList(it, 'tags')) meta.append(el('span', 'cp-chip tag', `#${t}`));
    for (const a of fieldList(it, 'agents')) meta.append(el('span', 'cp-chip agent', `@${a}`));
    if (meta.childNodes.length) d.append(meta);

    if (it.note.length) {
      if (open.has(it)) d.append(el('div', 'cp-body', it.note.join('\n')));
      else d.append(el('div', 'cp-body peek', `${it.note[0]}${it.note.length > 1 ? `  … +${it.note.length - 1}` : ''}`));
    }
    if (assign && assign.it === it) {
      const a = el('div', 'cp-assign');
      names.forEach((n, k) => {
        const chip = el('span', `cp-pick${assign.picked.has(n) ? ' on' : ''}`);
        chip.append(el('kbd', null, String(k + 1)), n);
        a.append(chip);
      });
      a.append(el('span', 'hint', 'Enter/a save · Esc cancel'));
      d.append(a);
    }
    d.append(...badges(it));
    d.addEventListener('click', () => { if (assign) return; focus = i; render(); });
    return d;
  }

  function render() {
    const all = rows();
    focus = Math.min(Math.max(focus, 0), Math.max(all.length - 1, 0));
    const items = all.map((x) => x.it);
    const liveItems = items.filter(live);
    const hasTokens = items.some((it) => fieldNumber(it, 'tokens') !== null);
    const total = liveItems.reduce((n, it) => n + (fieldNumber(it, 'tokens') ?? 0), 0);
    head.replaceChildren(el('span', null, `${liveItems.length} live · ${items.length - liveItems.length} struck`));
    if (hasTokens) head.append(el('span', 'cp-total', `${total} tokens`));
    if (assign) head.append(el('span', null, 'assign mode'));
    list.replaceChildren(...(items.length ? items.map(frag) : [el('div', 'cp-empty', 'No fragments.')]));
    keepVisible(list.querySelector('.cp-frag.active'));
  }

  /** Move the fragment at flat position `i` one step (dir -1 up, +1 down), crossing section edges. */
  function shift(i, dir) {
    const all = rows();
    const j = i + dir;
    if (j < 0 || j >= all.length) return false;
    const a = all[i], b = all[j];
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

  const idle = (fn) => (...args) => (assign ? undefined : fn(...args));

  function move(dir) {
    const from = focus;
    if (!shift(from, dir)) return;
    focus = from + dir;
    render();
    ctx.save();
    return () => { shift(from + dir, -dir); focus = from; render(); ctx.save(); };
  }

  function strike() {
    const it = here();
    if (!it) return;
    const before = it.label;
    it.label = before === STRUCK ? null : STRUCK;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
  }

  function setFieldUndoable(it, key, value) {
    const before = it.fields[key];
    setField(it, key, value);
    render();
    ctx.save();
    return () => { setField(it, key, before); render(); ctx.save(); };
  }

  /** Open the inline bar; Enter calls done(value) and files its inverse for undo, Escape cancels. */
  function ask(label, value, done) {
    barLabel.textContent = label;
    input.value = value;
    bar.hidden = false;
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { input.blur(); bar.hidden = true; return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value;
      input.blur();
      bar.hidden = true;
      actions.push(done(v));
    };
  }

  function tags() {
    const it = here();
    if (!it) return;
    ask(`tags (comma list) on: ${it.text}`, fieldList(it, 'tags').join(', '), (v) => {
      const list = v.split(',').map((x) => x.trim()).filter(Boolean);
      return setFieldUndoable(it, 'tags', list);
    });
  }

  function startAssign() {
    const it = here();
    if (!it) return;
    assign = { it, picked: new Set(fieldList(it, 'agents')) };
    render();
  }

  function commitAssign() {
    const { it, picked } = assign;
    assign = null;
    // Roster order first, then any agents already in the file that the roster does not name.
    const keep = fieldList(it, 'agents').filter((a) => !names.includes(a) && picked.has(a));
    return setFieldUndoable(it, 'agents', [...names.filter((n) => picked.has(n)), ...keep]);
  }

  function cancelAssign() {
    if (!assign) return;
    assign = null;
    render();
  }

  function toggleOpen(mode) {
    const it = here();
    if (!it) return;
    const want = mode ?? !open.has(it);
    if (want) open.add(it); else open.delete(it);
    render();
  }

  function toggleAll() {
    const withBody = rows().map((x) => x.it).filter((it) => it.note.length);
    if (withBody.every((it) => open.has(it))) open.clear();
    else for (const it of withBody) open.add(it);
    render();
  }

  function digit(n) {
    if (!assign) return;
    const name = names[n - 1];
    if (!name) return;
    if (assign.picked.has(name)) assign.picked.delete(name); else assign.picked.add(name);
    render();
  }

  actions.define('down', idle(() => { focus++; render(); }), 'focus');
  actions.define('up', idle(() => { focus--; render(); }));
  actions.define('move-down', idle(() => move(1)), 'move down');
  actions.define('move-up', idle(() => move(-1)), 'move up');
  actions.define('expand', idle(() => toggleOpen()), 'expand');
  actions.define('expand-only', idle(() => toggleOpen(true)), 'open');
  actions.define('collapse', idle(() => toggleOpen(false)), 'collapse');
  actions.define('expand-all', idle(toggleAll), 'all');
  actions.define('strike', idle(strike), 'strike');
  actions.define('tags', idle(tags), 'tags');
  actions.define('assign', () => (assign ? commitAssign() : startAssign()), 'assign');
  actions.define('cancel', cancelAssign);
  actions.define('finish', () => (assign ? commitAssign() : ctx.finish()));
  const max = Math.min(names.length, 9);
  for (let n = 1; n <= max; n++) actions.define(`digit:${n}`, () => digit(n), names[n - 1]);

  const keys = {
    j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up',
    J: 'move-down', K: 'move-up', 'Shift+ArrowDown': 'move-down', 'Shift+ArrowUp': 'move-up',
    ' ': 'expand', ArrowRight: 'expand-only', ArrowLeft: 'collapse', o: 'expand-all',
    x: 'strike', t: 'tags', a: 'assign', Escape: 'cancel', u: 'undo', Enter: 'finish',
  };
  for (let n = 1; n <= max; n++) keys[String(n)] = `digit:${n}`;
  actions.bind(keys);

  render();
  return { current: () => here(), render };
}
