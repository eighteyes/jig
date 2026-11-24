// exec.mjs — command approval: read each proposed command, approve or reject it.
// Responsibilities:
// - render each item as a monospace code block (one pair of surrounding backticks stripped for display)
// - show a red warning line for a `danger::` field; state plainly that nothing runs from this page
// - keys: j/k or arrows focus, a or space toggles approve, x toggles reject, u undo
// - Enter finishes; the first Enter arms a warning when any command is still pending
// - summary(jig): per-command state plus approved, rejected, pending lists, runs in Node
//
// File:
//   ---
//   jig: exec
//   ---
//   - `rm -rf build/`
//     lang:: sh
//     danger:: deletes the build folder
//   - [approve] `npm test`

import { el, badges, css, keepVisible } from '../web/ui.mjs';

/** The command text without one surrounding pair of backticks. */
export function commandOf(text) {
  const m = String(text).match(/^`([\s\S]*)`$/);
  return m ? m[1] : String(text);
}

function stateOf(it) {
  return it.label === 'approve' || it.label === 'reject' ? it.label : 'pending';
}

export function summary(jig) {
  const items = jig.sections.flatMap((s) => s.items);
  const commands = items.map((it) => ({
    cmd: commandOf(it.text),
    state: stateOf(it),
    danger: it.fields.danger ?? null,
    note: it.fields.note ?? null,
  }));
  const pick = (st) => commands.filter((c) => c.state === st).map((c) => c.cmd);
  return { commands, approved: pick('approve'), rejected: pick('reject'), pending: pick('pending') };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const items = jig.sections.flatMap((s) => s.items);
  let pos = 0;
  let armed = false;

  css('exec', `
    .ex-note { color: var(--dim); margin-bottom: 12px; }
    .ex-item { margin: 8px 0; cursor: pointer; border-left: 4px solid var(--edge); }
    .ex-item.approve { border-left-color: var(--good); }
    .ex-item.reject { border-left-color: var(--bad); }
    .ex-item .head { display: flex; justify-content: space-between; color: var(--dim); font: 12px var(--mono); margin-bottom: 4px; }
    .ex-item.approve .state { color: var(--good); }
    .ex-item.reject .state { color: var(--bad); }
    .ex-item pre { margin: 0; padding: 8px 10px; background: var(--bg); border-radius: var(--r); font: 13px/1.4 var(--mono); white-space: pre-wrap; word-break: break-all; }
    .ex-item.reject pre { text-decoration: line-through; opacity: .6; }
    .ex-danger { color: var(--bad); margin-top: 6px; font-size: 13px; }
    .ex-warn { color: var(--accent); margin: 10px 0; min-height: 1.4em; }
  `);
  const intro = el('div', 'ex-note', 'Nothing runs from this page. You only mark each command approve or reject; the caller decides what to do.');
  const list = el('div');
  const warn = el('div', 'ex-warn');
  root.replaceChildren(intro, list, warn);

  function render() {
    pos = Math.min(pos, Math.max(items.length - 1, 0));
    list.replaceChildren();
    if (!items.length) list.append(el('div', null, 'No commands.'));
    items.forEach((it, i) => {
      const st = stateOf(it);
      const c = el('div', `card ex-item ${st}`);
      if (i === pos) c.classList.add('active');
      const head = el('div', 'head');
      head.append(el('span', null, it.fields.lang || 'sh'), el('span', 'state', st));
      c.append(head, el('pre', null, commandOf(it.text)));
      if (it.fields.danger) {
        const d = it.fields.danger;
        c.append(el('div', 'ex-danger', `⚠ ${d === 'true' ? 'dangerous' : d}`));
      }
      c.append(...badges(it));
      c.addEventListener('click', () => { pos = i; render(); });
      list.append(c);
    });
    const pending = items.filter((it) => stateOf(it) === 'pending').length;
    warn.textContent = armed && pending ? `${pending} still pending. Press Enter again to finish anyway.` : '';
    keepVisible(list.querySelector('.ex-item.active'));
  }

  function toggle(label) {
    const it = items[pos];
    if (!it) return;
    armed = false;
    const before = it.label;
    it.label = before === label ? null : label;
    render();
    ctx.save();
    return () => { it.label = before; armed = false; render(); ctx.save(); };
  }

  actions.define('approve', () => toggle('approve'), 'approve');
  actions.define('reject', () => toggle('reject'), 'reject');
  actions.define('down', () => { pos = Math.min(pos + 1, items.length - 1); render(); }, 'down');
  actions.define('up', () => { pos = Math.max(pos - 1, 0); render(); }, 'up');
  actions.define('finish', () => {
    if (items.some((it) => stateOf(it) === 'pending') && !armed) { armed = true; render(); return; }
    return ctx.finish();
  }, 'finish');
  actions.bind({
    a: 'approve', ' ': 'approve', x: 'reject',
    j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up',
    u: 'undo', Enter: 'finish',
  });
  ctx.legend?.();
  render();
  return { current: () => items[pos] ?? null, render };
}
