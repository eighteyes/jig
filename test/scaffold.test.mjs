// scaffold.test.mjs — tests for jig new: types, frameworks, item placement.
// Responsibilities:
// - a framework fills frontmatter and sections and puts items in the pile
// - a plain type puts items in a flat list
// - every router entry points at a known type name, and every key is unique

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaffold, loadRouter } from '../src/scaffold.mjs';
import { parseJig } from '../web/format.mjs';

const TYPES = ['matrix', 'triage', 'kanban', 'score', 'rank', 'venn', 'qa', 'compare', 'graph', 'exec', 'rerank'];

test('framework: eisenhower is a labelled matrix with items in Unsorted', async () => {
  const j = parseJig(await scaffold('eisenhower', { items: ['a', 'b'], types: TYPES }));
  assert.equal(j.meta.jig, 'matrix');
  assert.deepEqual(j.meta.axes, { x: 'urgent', y: 'important' });
  assert.deepEqual(j.sections.map((s) => s.heading), ['Do', 'Schedule', 'Delegate', 'Drop', 'Unsorted']);
  assert.deepEqual(j.sections[4].items.map((i) => i.text), ['a', 'b']);
});

test('framework: moscow is kanban with Inbox first', async () => {
  const j = parseJig(await scaffold('moscow', { items: ['x'], types: TYPES }));
  assert.deepEqual(j.sections.map((s) => s.heading), ['Inbox', 'Must', 'Should', 'Could', "Won't"]);
  assert.equal(j.sections[0].items[0].text, 'x');
});

test('type: triage gets a flat list', async () => {
  const j = parseJig(await scaffold('triage', { items: ['one', 'two'], title: 'T', types: TYPES }));
  assert.equal(j.meta.title, 'T');
  assert.deepEqual(j.sections[0].items.map((i) => i.text), ['one', 'two']);
});

test('unknown name throws', async () => {
  await assert.rejects(scaffold('nope', { types: TYPES }), /unknown type or framework/);
});

test('router entries are unique and point at planned types', async () => {
  const r = await loadRouter();
  const keys = r.frameworks.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of r.frameworks) assert.ok(TYPES.includes(f.type), `${f.key} -> ${f.type}`);
});
