// tag.mjs — rows tagged from an open vocabulary by a leader-key sequence.
// Responsibilities:
// - list rows; j/k focus; the focused row shows its media (image, audio, video) from _media.mjs
// - leader key (default t) opens tag mode: letters type a sequence, exactly one match commits that tag
//   (toggled in the row's `tags` field) and advances; Shift+leader tags without advancing; Escape leaves
// - N mints a new tag ("sequence name") into meta.tags and applies it
// - flag keys (meta.flags) set the row label to the flag name (toggle) and advance
// - x toggles label `unusable`; 0 clears tags and label
// - Enter finishes (first Enter warns while rows are untagged); u undo
// - summary(jig): { by_tag, by_flag, unanswered, unusable, unused_tags }
//
// File:
//   ---
//   jig: tag
//   leader: t
//   tags: {a: alpha, br: bravo}       # sequence -> tag name
//   flags: {g: good, b: bad}          # key -> flag name, stored as the label
//   ---
//   - [good] clip one
//     tags:: alpha, bravo
//     audio:: clips/one.wav

const UNUSABLE = 'unusable';

import { el, css, badges, keepVisible } from '../web/ui.mjs';
import { fieldList, setField } from '../web/format.mjs';
import { createMedia, defineMedia } from './_media.mjs';

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function summary(jig) {
  const items = jig.sections.flatMap((s) => s.items);
  const by_tag = {}, by_flag = {};
  const used = new Set();
  for (const it of items) {
    for (const t of fieldList(it, 'tags')) { (by_tag[t] ||= []).push(it.text); used.add(t); }
    if (it.label && it.label !== UNUSABLE) (by_flag[it.label] ||= []).push(it.text);
  }
  const isUnusable = (it) => it.label === UNUSABLE || Boolean(it.fields.unusable);
  return {
    by_tag,
    by_flag,
    unanswered: items.filter((it) => !fieldList(it, 'tags').length && !it.label && !it.fields.unusable).map((it) => it.text),
    unusable: items.filter(isUnusable).map((it) => it.text),
    unused_tags: Object.values(obj(jig.meta.tags)).map(String).filter((n) => !used.has(n)),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const leader = String(jig.meta.leader || 't');
  const flags = obj(jig.meta.flags);
  const items = jig.sections.flatMap((s) => s.items);
  const vocab = () => obj(jig.meta.tags);   // sequence -> tag name; read live, minting changes it
  let pos = Math.max(items.findIndex((it) => !isDone(it)), 0);
  let mode = null;      // { advance, seq } while typing a sequence
  let armed = false;
  let note = '';        // inline feedback under the list

  function isDone(it) { return Boolean(it.label) || fieldList(it, 'tags').length > 0 || Boolean(it.fields.unusable); }

  css('tag', `
    .tg-progress { color: var(--dim); font-size: 13px; margin-bottom: 8px; }
    .tg-row { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 8px 12px; margin: 6px 0; cursor: pointer; overflow-wrap: anywhere; }
    .tg-row.active { border-color: var(--accent); }
    .tg-row.unusable .tg-text { color: var(--dim); text-decoration: line-through; }
    .tg-tags { margin-top: 4px; display: flex; gap: 6px; flex-wrap: wrap; font: 12px var(--mono); }
    .tg-tag { background: var(--raised); border: 1px solid var(--edge); border-radius: 10px; padding: 0 8px; color: var(--info); }
    .tg-flag { color: var(--accent); }
    .tg-flag.unusable { color: var(--bad); }
    .tg-vocab { color: var(--dim); font: 12px var(--mono); margin: 12px 0; }
    .tg-vocab b { color: var(--ink); font-weight: 600; }
    .tg-mode { color: var(--accent); font: 14px var(--mono); min-height: 1.4em; margin: 8px 0; }
    .tg-warn { color: var(--accent); margin: 8px 0; min-height: 1.4em; }
    .tg-bar { position: fixed; bottom: 38px; left: 0; right: 0; background: var(--raised); border-top: 1px solid var(--accent); padding: 8px 20px; display: flex; gap: 12px; align-items: center; }
    .tg-bar[hidden] { display: none; }
    .tg-bar span { color: var(--dim); font-size: 13px; white-space: nowrap; }
    .tg-bar input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); padding: 4px 8px; }
  `);
  const media = createMedia(jig.meta);
  const progress = el('div', 'tg-progress');
  const list = el('div');
  const modeLine = el('div', 'tg-mode');
  const vocabLine = el('div', 'tg-vocab');
  const warn = el('div', 'tg-warn');
  const bar = el('div', 'tg-bar');
  const barLabel = el('span', null, 'sequence name');
  const input = el('input');
  input.placeholder = 'br bravo';
  bar.append(barLabel, input);
  bar.hidden = true;
  root.replaceChildren(progress, media.node, list, modeLine, vocabLine, warn, bar);   // media.node stays put: moving it would pause playback

  const here = () => items[pos] ?? null;
  const undecided = () => items.filter((it) => !isDone(it)).length;

  function row(it, i) {
    const flagged = it.label && it.label !== UNUSABLE;
    const r = el('div', `tg-row${i === pos ? ' active' : ''}${it.label === UNUSABLE ? ' unusable' : ''}`);
    r.append(el('div', 'tg-text', it.text));
    const tags = el('div', 'tg-tags');
    if (flagged) tags.append(el('span', 'tg-flag', `[${it.label}]`));
    if (it.label === UNUSABLE) tags.append(el('span', 'tg-flag unusable', '[unusable]'));
    for (const t of fieldList(it, 'tags')) tags.append(el('span', 'tg-tag', t));
    if (tags.childNodes.length) r.append(tags);
    r.append(...badges(it));
    r.addEventListener('click', () => { pos = i; mode = null; render(); });
    return r;
  }

  function candidates(seq) { return Object.entries(vocab()).filter(([s]) => s.startsWith(seq)); }

  function render() {
    armed = false;
    warn.textContent = '';
    progress.textContent = `${items.length - undecided()} of ${items.length} done · row ${pos + 1}`;
    list.replaceChildren(...items.map(row));
    const active = list.children[pos];
    media.show(here());
    if (mode) {
      const c = candidates(mode.seq).map(([s, n]) => `${s}=${n}`).join('  ');
      modeLine.textContent = `${mode.advance ? leader : leader.toUpperCase()}> ${mode.seq}▮   ${c || 'no match'}`;
    } else modeLine.textContent = note;
    vocabLine.replaceChildren(el('b', null, 'tags '), Object.entries(vocab()).map(([s, n]) => `${s}=${n}`).join('  ') || 'none yet. N mints one');
    keepVisible(active);
  }

  /** Run a change on the focused row. fn mutates it; returns the inverse (restores fields, label and focus). */
  async function change(fn, advance) {
    const it = here();
    if (!it) return;
    const before = { label: it.label, tags: it.fields.tags, unusable: it.fields.unusable, pos };
    fn(it);
    if (advance && pos < items.length - 1) pos++;
    mode = null;
    note = '';
    render();
    await ctx.save();
    return async () => {
      it.label = before.label;
      setField(it, 'tags', before.tags);
      setField(it, 'unusable', before.unusable);
      pos = before.pos;
      render();
      await ctx.save();
    };
  }

  function toggleTag(it, name) {
    const have = fieldList(it, 'tags');
    setField(it, 'tags', have.includes(name) ? have.filter((t) => t !== name) : [...have, name]);
  }

  const commit = (name, advance) => change((it) => toggleTag(it, name), advance);

  function enterMode(advance) {
    if (!here()) return;
    mode = { advance, seq: '' };
    note = '';
    render();
  }

  /** Feed one key to tag mode. Returns true when the key was consumed. */
  async function feed(key) {
    if (key === 'Escape') { mode = null; note = ''; render(); return true; }
    if (key === 'Backspace') { mode.seq = mode.seq.slice(0, -1); render(); return true; }
    if (key === 'Enter') {
      const exact = vocab()[mode.seq];
      if (exact !== undefined) actions.push(await commit(String(exact), mode.advance));
      return true;
    }
    if (!/^[a-z0-9]$/i.test(key)) return true;
    const seq = mode.seq + key.toLowerCase();
    const hits = candidates(seq);
    if (!hits.length) { mode.seq = ''; note = ''; render(); modeLine.textContent += `   (${seq}: no match)`; return true; }
    if (hits.length === 1) { actions.push(await commit(String(hits[0][1]), mode.advance)); return true; }
    mode.seq = seq;
    render();
    return true;
  }

  // Tag mode takes every key before the shared key handler sees it.
  window.addEventListener('keydown', (e) => {
    if (!mode || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    e.preventDefault();
    e.stopPropagation();
    feed(e.key);
  }, true);

  function ask(label, done) {
    barLabel.textContent = label;
    input.value = '';
    bar.hidden = false;
    input.focus();
    input.onkeydown = async (e) => {
      if (e.key === 'Escape') { input.blur(); bar.hidden = true; return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = input.value.trim();
      input.blur();
      bar.hidden = true;
      actions.push(await done(v));
    };
  }

  function mint() {
    if (!here()) return;
    ask('sequence name', async (v) => {
      const m = v.match(/^(\S+)\s+(.+)$/);
      if (!m) { note = 'mint needs: sequence name'; render(); return; }
      const seq = m[1].toLowerCase(), name = m[2].trim();
      const existing = vocab();
      if (name.includes(',')) { note = 'tag names cannot contain commas'; render(); return; }
      if (seq in existing || Object.values(existing).map(String).includes(name)) { note = `${seq} or ${name} already exists`; render(); return; }
      const hadTags = jig.meta.tags !== undefined;
      jig.meta.tags = { ...existing, [seq]: name };
      const undo = await change((it) => toggleTag(it, name), false);
      return async () => {
        await undo();
        if (hadTags) delete jig.meta.tags[seq]; else delete jig.meta.tags;
        render();
        await ctx.save();
      };
    });
  }

  for (const flag of Object.values(flags)) {
    actions.define(`flag:${flag}`, () => change((it) => { it.label = it.label === String(flag) ? null : String(flag); }, here()?.label !== String(flag)), String(flag));
  }
  actions.define('tag-mode', () => enterMode(true), 'tag');
  actions.define('tag-mode-hold', () => enterMode(false), 'tag, stay');
  actions.define('mint', mint, 'new tag');
  actions.define('down', () => { pos = Math.min(pos + 1, items.length - 1); render(); }, 'row');
  actions.define('up', () => { pos = Math.max(pos - 1, 0); render(); });
  actions.define(UNUSABLE, () => change((it) => { it.label = it.label === UNUSABLE ? null : UNUSABLE; }, here()?.label !== UNUSABLE), UNUSABLE);
  actions.define('clear', () => change((it) => { it.label = null; setField(it, 'tags', null); setField(it, 'unusable', null); }, false), 'clear');
  actions.define('finish', () => {
    const waiting = undecided();
    if (waiting && !armed) {
      armed = true;
      warn.textContent = `${waiting} row${waiting === 1 ? '' : 's'} not tagged. Press Enter again to finish.`;
      return;
    }
    return ctx.finish();
  });
  const mediaKeys = defineMedia(actions, media);

  const keys = { ...mediaKeys, j: 'down', ArrowDown: 'down', k: 'up', ArrowUp: 'up', [leader]: 'tag-mode', [leader.toUpperCase()]: 'tag-mode-hold', N: 'mint', x: UNUSABLE, 0: 'clear', u: 'undo', Enter: 'finish' };
  for (const [key, flag] of Object.entries(flags)) if (!(key in keys)) keys[key] = `flag:${flag}`;
  actions.bind(keys);

  render();
  return { current: here, render };
}
