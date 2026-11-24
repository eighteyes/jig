// kanban.mjs — keyboard triage of cards into ordered lanes.
// Responsibilities:
// - lanes are ## sections: Inbox (lane 0, always first) then meta.lanes; missing ones are created on mount
// - render lanes as columns with the focused card highlighted; space shows a card's note lines
// - keys: j/k focus in lane, h/l between lanes, 0..N move card to lane, d done, x delete, o owner, n/+ new card, u undo, Enter finish
// - owner and new-card text use an inline input bar (no dialogs)
// - summary(jig): { by_lane, done, deleted, owners, added }
//
// File:
//   ---
//   jig: kanban
//   lanes: [Now, Next, Later, Someday, Drop]
//   ---
//   ## Inbox
//   - new card
//   ## Now
//   - [done] shipped thing
//     owner:: sam

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { newSection, newItem, setField } from '../web/format.mjs';

const DEFAULT_LANES = ['Now', 'Next', 'Later', 'Someday', 'Drop'];
const INBOX = /^inbox$/i;

const laneNames = (jig) => {
  const l = Array.isArray(jig.meta?.lanes) && jig.meta.lanes.length ? jig.meta.lanes.map(String) : DEFAULT_LANES;
  return ['Inbox', ...l.filter((n) => !INBOX.test(n))];
};

/** Lane sections in lane order: [{ name, section|null }]. With create, missing sections are added. */
function lanesOf(jig, create = false) {
  let changed = false;
  const out = laneNames(jig).map((name, i) => {
    let sec = jig.sections.find((s) => s.heading && s.heading.toLowerCase() === name.toLowerCase())
      ?? (i === 0 ? jig.sections.find((s) => s.heading === null) : undefined) ?? null;
    if (sec && sec.heading === null && create) { sec.heading = 'Inbox'; changed = true; }
    if (!sec && create) {
      sec = newSection(name);
      jig.sections.push(sec);
      changed = true;
    }
    return { name, section: sec };
  });
  if (create) {
    const inbox = out[0].section;
    if (jig.sections[0] !== inbox) {
      jig.sections.splice(jig.sections.indexOf(inbox), 1);
      jig.sections.unshift(inbox);
      changed = true;
    }
  }
  out.changed = changed;
  return out;
}

export function summary(jig) {
  const by_lane = {};
  for (const { name, section } of lanesOf(jig)) by_lane[name] = (section?.items ?? []).map((it) => it.text);
  const all = jig.sections.flatMap((s) => s.items);
  const owners = {};
  for (const it of all) if (it.fields.owner) owners[it.text] = it.fields.owner;
  return {
    by_lane,
    done: all.filter((it) => it.label === 'done').map((it) => it.text),
    deleted: all.filter((it) => it.label === 'delete').map((it) => it.text),
    owners,
    added: all.filter((it) => it.fields.added).map((it) => it.text),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const lanes = lanesOf(jig, true);
  if (lanes.changed) ctx.save();
  let focus = { lane: 0, index: 0 };
  let armed = false;
  const open = new Set(); // cards showing their note lines

  css('kanban', `
    .kb { display: grid; gap: var(--gap); align-items: start; }
    .kb-lane { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px; min-height: 160px; min-width: 0; }
    .kb-lane.active { border-color: var(--dim); }
    .kb-lane h2 kbd { margin-right: 6px; }
    .kb-card { background: var(--raised); border: 1px solid var(--edge); border-radius: var(--r); padding: 6px 10px; margin: 6px 0; cursor: pointer; overflow-wrap: anywhere; }
    .kb-card.active { border-color: var(--accent); }
    .kb-card.done .kb-text { color: var(--good); text-decoration: line-through; }
    .kb-card.delete .kb-text { color: var(--bad); text-decoration: line-through; }
    .kb-meta { font-size: 12px; color: var(--dim); }
    .kb-meta span { margin-right: 8px; }
    .kb-notes { color: var(--dim); font-size: 13px; white-space: pre-wrap; margin-top: 4px; }
    .kb-warn { color: var(--accent); margin: 12px 0; min-height: 1.4em; }
    .kb-bar { position: fixed; bottom: 38px; left: 0; right: 0; background: var(--raised); border-top: 1px solid var(--accent); padding: 8px 20px; display: flex; gap: 12px; align-items: center; }
    .kb-bar[hidden] { display: none; }
    .kb-bar span { color: var(--dim); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40%; }
    .kb-bar input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); padding: 4px 8px; }
  `);
  const board = el('div', 'kb');
  board.style.gridTemplateColumns = `repeat(${lanes.length}, minmax(0, 1fr))`;
  const warn = el('div', 'kb-warn');
  const bar = el('div', 'kb-bar');
  const barLabel = el('span');
  const input = el('input');
  bar.append(barLabel, input);
  bar.hidden = true;
  root.replaceChildren(board, warn, bar);

  const items = (l) => lanes[l].section.items;
  const here = () => items(focus.lane)[focus.index] ?? null;

  function clamp() {
    focus.lane = Math.min(Math.max(focus.lane, 0), lanes.length - 1);
    focus.index = Math.min(Math.max(focus.index, 0), Math.max(items(focus.lane).length - 1, 0));
  }

  function card(it, l, i) {
    const cls = ['kb-card'];
    if (l === focus.lane && i === focus.index) cls.push('active');
    if (it.label === 'done' || it.label === 'delete') cls.push(it.label);
    const c = el('div', cls.join(' '));
    c.append(el('div', 'kb-text', it.text));
    const meta = el('div', 'kb-meta');
    if (it.label) meta.append(el('span', null, `[${it.label}]`));
    if (it.fields.owner) meta.append(el('span', null, `@${it.fields.owner}`));
    if (it.fields.added) meta.append(el('span', null, 'new'));
    if (it.note.length && !open.has(it)) meta.append(el('span', null, '… notes'));
    if (meta.childNodes.length) c.append(meta);
    if (open.has(it) && it.note.length) c.append(el('div', 'kb-notes', it.note.join('\n')));
    c.append(...badges(it));
    c.addEventListener('click', () => { focus = { lane: l, index: i }; render(); });
    return c;
  }

  function render() {
    clamp();
    armed = false;
    warn.textContent = '';
    board.replaceChildren(...lanes.map((lane, l) => {
      const box = el('div', `kb-lane${l === focus.lane ? ' active' : ''}`);
      const h = el('h2');
      h.append(el('kbd', null, String(l)), `${lane.name} · ${lane.section.items.length}`);
      box.append(h, ...lane.section.items.map((it, i) => card(it, l, i)));
      return box;
    }));
    keepVisible(board.querySelector('.kb-card.active'));
  }

  function moveTo(to) {
    const from = focus.lane, i = focus.index;
    const it = here();
    if (!it || to === from) return;
    items(from).splice(i, 1);
    items(to).push(it);
    render();
    ctx.save();
    return () => {
      items(to).splice(items(to).indexOf(it), 1);
      items(from).splice(i, 0, it);
      focus = { lane: from, index: i };
      render();
      ctx.save();
    };
  }

  function toggleLabel(label) {
    const it = here();
    if (!it) return;
    const before = it.label;
    it.label = before === label ? null : label;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
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
      const v = input.value.trim();
      input.blur();
      bar.hidden = true;
      actions.push(done(v));
    };
  }

  function setOwner() {
    const it = here();
    if (!it) return;
    ask(`owner of: ${it.text}`, it.fields.owner || '', (v) => {
      const before = it.fields.owner;
      setField(it, 'owner', v);
      render();
      ctx.save();
      return () => { setField(it, 'owner', before); render(); ctx.save(); };
    });
  }

  function addCard() {
    ask('new card in Inbox', '', (v) => {
      if (!v) return;
      const it = newItem(v, null, { added: 'true' });
      items(0).push(it);
      focus = { lane: 0, index: items(0).length - 1 };
      render();
      ctx.save();
      return () => { items(0).splice(items(0).indexOf(it), 1); render(); ctx.save(); };
    });
  }

  function finish() {
    const waiting = items(0).length;
    if (waiting && !armed) {
      armed = true;
      warn.textContent = `${waiting} card${waiting === 1 ? '' : 's'} still in Inbox. Press Enter again to finish.`;
      return;
    }
    return ctx.finish();
  }

  const last = Math.min(lanes.length - 1, 9);
  actions.define('down', () => { focus.index++; render(); }, 'card');
  actions.define('up', () => { focus.index--; render(); });
  actions.define('left', () => { focus = { lane: focus.lane - 1, index: focus.index }; render(); }, 'lane');
  actions.define('right', () => { focus = { lane: focus.lane + 1, index: focus.index }; render(); });
  for (let n = 0; n <= last; n++) actions.define(`lane:${n}`, () => moveTo(n), n === 0 ? 'inbox' : lanes[n].name.toLowerCase());
  actions.define('done', () => toggleLabel('done'), 'done');
  actions.define('delete', () => toggleLabel('delete'), 'delete');
  actions.define('owner', setOwner, 'owner');
  actions.define('add', addCard, 'new card');
  actions.define('notes', () => {
    const it = here();
    if (!it) return;
    if (open.has(it)) open.delete(it); else open.add(it);
    render();
  }, 'notes');
  actions.define('finish', finish);

  const keys = { j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', h: 'left', ArrowLeft: 'left', l: 'right', ArrowRight: 'right', d: 'done', x: 'delete', o: 'owner', n: 'add', '+': 'add', ' ': 'notes', u: 'undo', Enter: 'finish' };
  for (let n = 0; n <= last; n++) keys[String(n)] = `lane:${n}`;
  actions.bind(keys);

  render();
  return { current: () => here(), render };
}
