// app.mjs — load one jig in the shell page and mount its view.
// Responsibilities:
// - fetch the jig file from the host and parse it
// - load views/<type>.mjs from the frontmatter's `jig` field
// - give the view a context: parsed jig, save, finish, named actions, legend
// - show save status; show the done state once the jig is finished
//
// View contract: export function mount(el, ctx) where ctx is
//   { jig, meta, save(jig), finish(jig), actions, legend(extra?) }
// and mount returns { current(): item|section|null, render() } (anything with .fields).
// A view mutates ctx.jig and calls save; finish sets status: done and releases the host.
// With current() present, the app adds e (escalate) and c (inline note) for the current item.
// A view may also export summary(jig) for type-specific keys in the JSON printed on finish.

import { parseJig, writeJig, setField } from './format.mjs';
import { createActions } from './actions.mjs';

const $ = (id) => document.getElementById(id);

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = `status ${cls}`;
}

const KEY_NAMES = { ' ': 'space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '⏎', Tab: 'tab', Escape: 'esc' };

function drawLegend(actions, extra = []) {
  const el = $('legend');
  const groups = [...actions.legend(), ...extra];
  el.hidden = groups.length === 0;
  el.replaceChildren(...groups.map(({ keys, title }) => {
    const span = document.createElement('span');
    for (const key of keys) {
      const kbd = document.createElement('kbd');
      kbd.textContent = KEY_NAMES[key] ?? key;
      span.append(kbd);
    }
    span.append(title);
    return span;
  }));
  // A wrapped legend grows: keep the page and the note bar clear of it.
  const h = el.hidden ? 0 : el.offsetHeight;
  document.querySelector('main').style.paddingBottom = `${h + 80}px`;
  $('notebar').style.bottom = `${h}px`;
}

function showDone(mount) {
  const div = document.createElement('div');
  div.className = 'done-banner';
  div.textContent = 'Done. The result is saved in the jig file. You can close this tab.';
  mount.replaceChildren(div);
  $('legend').hidden = true;
}

async function main() {
  const res = await fetch('/api/jig');
  if (!res.ok) { setStatus(`load failed: ${res.status}`, 'error'); return; }
  const { name, text } = await res.json();
  const jig = parseJig(text);
  const type = jig.meta.jig;
  $('file').textContent = name;
  $('title').textContent = jig.meta.title || name;
  document.title = `${jig.meta.title || name} · jig`;
  const mount = $('mount');

  if (jig.meta.status === 'done') { setStatus('done', 'saved'); showDone(mount); return; }
  if (!type || !/^[a-z][a-z0-9-]*$/.test(type)) { setStatus('no jig type in frontmatter (jig: <type>)', 'error'); return; }

  let view;
  try { view = await import(`/views/${type}.mjs`); }
  catch { setStatus(`unknown jig type: ${type}`, 'error'); return; }

  let pending = Promise.resolve();
  async function save(next = jig) {
    const body = writeJig(next);
    setStatus('saving');
    pending = pending.then(() => fetch('/api/jig', { method: 'PUT', body }));
    const r = await pending;
    if (r.ok) setStatus('saved', 'saved'); else setStatus(`save failed: ${r.status}`, 'error');
    return r.ok;
  }

  async function finish(next = jig) {
    next.meta.status = 'done';
    if (await save(next)) {
      await fetch('/api/done', { method: 'POST' });
      actions.dispose();
      showDone(mount);
    }
  }

  const actions = createActions();
  const ctx = { jig, meta: jig.meta, save, finish, actions, legend: (extra) => drawLegend(actions, extra) };
  const handle = view.mount(mount, ctx) || {};
  const current = () => handle.current?.() ?? null;
  const rerender = () => handle.render?.();

  // Shared on every view: e escalates the current item, c writes a note on it.
  if (handle.current) {
    actions.define('escalate', async () => {
      const it = current();
      if (!it) return;
      const before = it.fields.escalate;
      setField(it, 'escalate', before ? null : 'true');
      rerender();
      await save();
      return async () => { setField(it, 'escalate', before); rerender(); await save(); };
    }, 'escalate');
    actions.define('note', () => openNote(current(), async (it, before) => {
      rerender();
      await save();
      return async () => { setField(it, 'note', before); rerender(); await save(); };
    }), 'note');
    const taken = new Set(actions.legend().flatMap((g) => g.keys));
    const extra = {};
    if (!taken.has('e')) extra.e = 'escalate';
    if (!taken.has('c')) extra.c = 'note';
    actions.bind(extra);
  }

  // Inline note bar: opens above the legend, Enter saves, Escape cancels. No dialog.
  function openNote(it, after) {
    if (!it) return;
    const bar = $('notebar');
    const input = bar.querySelector('input');
    bar.querySelector('span').textContent = `note on: ${it.text ?? it.heading ?? ''}`;
    input.value = it.fields.note || '';
    bar.hidden = false;
    input.focus();
    input.onkeydown = async (e) => {
      if (e.key === 'Escape') { input.blur(); bar.hidden = true; return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const before = it.fields.note;
      setField(it, 'note', input.value.trim());
      input.blur();
      bar.hidden = true;
      const undo = await after(it, before);
      actions.push?.(undo);
    };
  }

  drawLegend(actions);
  setStatus('ready');
}

main().catch((err) => setStatus(String(err.message || err), 'error'));
