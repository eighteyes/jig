// app.mjs — load one jig in the shell page and mount its view.
// Responsibilities:
// - fetch the jig file from the host and parse it
// - load views/<type>.mjs from the frontmatter's `jig` field
// - give the view a context: parsed jig, save, finish, named actions, legend
// - show save status; show the done state once the jig is finished
//
// View contract: export function mount(el, ctx) where ctx is
//   { jig, meta, save(jig), finish(jig), actions, legend(extra?) }
// A view mutates ctx.jig and calls save; finish sets status: done and releases the host.

import { parseJig, writeJig } from './format.mjs';
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
  view.mount(mount, ctx);
  drawLegend(actions);
  setStatus('ready');
}

main().catch((err) => setStatus(String(err.message || err), 'error'));
