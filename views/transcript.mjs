// transcript.mjs — review a conversation as a chat log and mark the turns worth keeping.
// Responsibilities:
// - one turn per item: `role: first line`, note lines continue the turn; unknown roles render as system
// - render role badge and text; user turns indent differently from assistant turns
// - turns longer than 8 lines collapse; space expands/collapses the focused turn
// - keys: j/k focus, m mark (label `mark`), space expand, u undo, Enter finish
// - summary(jig): { marked: [{i, role, text}], escalated: [i], turns }; i = 0-based turn index
//
// File:
//   ---
//   jig: transcript
//   ---
//   - user: first line of the turn
//     more lines of the turn as note lines
//   - [mark] assistant: a reply worth keeping
//
// A prefix that is not user/assistant/system/tool (e.g. `Note: x`) is not a role: the turn is
// system and its text keeps the whole line.

import { el, css, badges, keepVisible } from '../web/ui.mjs';

const ROLES = ['user', 'assistant', 'system', 'tool'];
const MARK = 'mark';
const COLLAPSE_AT = 8;
const HEAD = /^([A-Za-z]+):[ \t]*(.*)$/;

const turns = (jig) => jig.sections.flatMap((s) => s.items);

/** { role, lines } for an item: role from the text prefix, lines = first line plus note lines. */
function parseTurn(it) {
  const m = it.text.match(HEAD);
  const role = m && ROLES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  return { role: role ?? 'system', lines: [role ? m[2] : it.text, ...it.note] };
}

export function summary(jig) {
  const all = turns(jig);
  const marked = [], escalated = [];
  all.forEach((it, i) => {
    if (it.label === MARK) {
      const { role, lines } = parseTurn(it);
      marked.push({ i, role, text: lines.join('\n') });
    }
    if (it.fields?.escalate) escalated.push(i);
  });
  return { marked, escalated, turns: all.length };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  let focus = 0;
  const open = new Set(); // long turns shown in full

  css('transcript', `
    .tr-head { color: var(--dim); font-size: 13px; margin-bottom: 10px; }
    .tr-turn { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0; cursor: pointer; }
    .tr-turn.user { margin-left: 0; margin-right: 22%; }
    .tr-turn.assistant { margin-left: 22%; margin-right: 0; }
    .tr-turn.system, .tr-turn.tool { margin-left: 8%; margin-right: 8%; }
    .tr-role { font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .06em; color: var(--dim); border: 1px solid var(--edge); border-radius: 10px; padding: 1px 8px; margin-top: 8px; min-width: 6.5ch; text-align: center; }
    .tr-turn.user .tr-role { color: var(--info); }
    .tr-turn.assistant .tr-role { color: var(--good); }
    .tr-turn.tool .tr-role { color: var(--accent); }
    .tr-card { flex: 1; min-width: 0; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 8px 12px; overflow-wrap: anywhere; }
    .tr-turn.user .tr-card { background: var(--raised); }
    .tr-turn.system .tr-card, .tr-turn.tool .tr-card { color: var(--dim); font-size: 13px; }
    .tr-turn.tool .tr-card { font-family: var(--mono); }
    .tr-turn.active .tr-card { border-color: var(--accent); }
    .tr-turn.marked .tr-card { border-left: 4px solid var(--accent); }
    .tr-text { white-space: pre-wrap; }
    .tr-more { color: var(--accent); font-size: 12px; margin-top: 4px; }
    .tr-mark { color: var(--accent); font-size: 12px; margin-right: 8px; }
    .tr-n { color: var(--dim); font: 11px var(--mono); margin-bottom: 2px; }
    .tr-empty { color: var(--dim); padding: 20px 0; }
  `);
  const head = el('div', 'tr-head');
  const log = el('div', 'tr-log');
  root.replaceChildren(head, log);

  const here = () => turns(jig)[focus] ?? null;

  function turn(it, i) {
    const { role, lines } = parseTurn(it);
    const cls = ['tr-turn', role];
    if (i === focus) cls.push('active');
    if (it.label === MARK) cls.push('marked');
    const row = el('div', cls.join(' '));
    const long = lines.length > COLLAPSE_AT;
    const shown = long && !open.has(it) ? lines.slice(0, COLLAPSE_AT) : lines;
    const card = el('div', 'tr-card');
    const n = el('div', 'tr-n');
    if (it.label === MARK) n.append(el('span', 'tr-mark', '★ marked'));
    n.append(`#${i}`);
    card.append(n, el('div', 'tr-text', shown.join('\n')));
    if (long) card.append(el('div', 'tr-more', open.has(it) ? 'space to collapse' : `… ${lines.length - COLLAPSE_AT} more lines (space)`));
    card.append(...badges(it));
    row.append(el('span', 'tr-role', role), card);
    row.addEventListener('click', () => { focus = i; render(); });
    return row;
  }

  function render() {
    const all = turns(jig);
    focus = Math.min(Math.max(focus, 0), Math.max(all.length - 1, 0));
    const marked = all.filter((it) => it.label === MARK).length;
    head.textContent = `${all.length} turns · ${marked} marked`;
    log.replaceChildren(...(all.length ? all.map(turn) : [el('div', 'tr-empty', 'No turns.')]));
    keepVisible(log.querySelector('.tr-turn.active'));
  }

  function mark() {
    const it = here();
    if (!it) return;
    const before = it.label;
    it.label = before === MARK ? null : MARK;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
  }

  function toggleOpen() {
    const it = here();
    if (!it) return;
    if (open.has(it)) open.delete(it); else open.add(it);
    render();
  }

  actions.define('down', () => { focus++; render(); }, 'turn');
  actions.define('up', () => { focus--; render(); });
  actions.define('mark', mark, 'mark');
  actions.define('expand', toggleOpen, 'expand');
  actions.define('finish', () => ctx.finish());
  actions.bind({ j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', m: 'mark', ' ': 'expand', u: 'undo', Enter: 'finish' });

  render();
  return { current: () => here(), render };
}
