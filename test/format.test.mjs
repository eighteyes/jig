// format.test.mjs — tests for the jig file format.
// Responsibilities:
// - YAML subset parse and write
// - body parse into sections and items
// - round trip keeps a file as written

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, writeYaml, parseJig, writeJig, allItems } from '../web/format.mjs';

test('yaml subset: scalars, inline map, inline list, block map, block list', () => {
  const y = parseYaml([
    'jig: triage',
    'status: open',
    'count: 3',
    'live: true',
    'actions: {1: accept, 2: reject, u: undo}',
    'tags: [a, "b, c"]',
    'axes:',
    '  x: urgent',
    '  y: important',
    'columns:',
    '  - keep',
    '  - cut',
    'title: "Sort: these"',
  ].join('\n'));
  assert.deepEqual(y, {
    jig: 'triage', status: 'open', count: 3, live: true,
    actions: { 1: 'accept', 2: 'reject', u: 'undo' },
    tags: ['a', 'b, c'],
    axes: { x: 'urgent', y: 'important' },
    columns: ['keep', 'cut'],
    title: 'Sort: these',
  });
  assert.deepEqual(parseYaml(writeYaml(y)), y);
});

const FILE = `---
jig: matrix
status: open
---
Sort the backlog.

## Unsorted
- ship the docs
- fix login
  it breaks on Safari
## Do
- [x] answer Sean
## Drop
`;

test('body parses into sections and items', () => {
  const j = parseJig(FILE);
  assert.equal(j.meta.jig, 'matrix');
  assert.equal(j.intro, 'Sort the backlog.\n');
  assert.deepEqual(j.sections.map((s) => s.heading), ['Unsorted', 'Do', 'Drop']);
  assert.deepEqual(j.sections[0].items[1], { label: null, text: 'fix login', fields: {}, note: ['it breaks on Safari'], trail: [] });
  assert.equal(j.sections[1].items[0].label, 'x');
  assert.equal(allItems(j).length, 3);
});

test('round trip keeps the file as written', () => {
  assert.equal(writeJig(parseJig(FILE)), FILE);
});

test('moving an item rewrites only its line', () => {
  const j = parseJig(FILE);
  const [it] = j.sections[0].items.splice(0, 1);
  j.sections[2].items.push(it);
  const out = writeJig(j);
  assert.match(out, /## Drop\n- ship the docs\n$/);
  assert.doesNotMatch(out, /## Unsorted\n- ship the docs/);
});

test('prose between items survives', () => {
  const text = '- a\n\nsome prose\n- b\n';
  assert.equal(writeJig(parseJig(text)), text);
});

test('file without frontmatter', () => {
  const j = parseJig('- one\n- [ok] two');
  assert.deepEqual(j.meta, {});
  assert.equal(writeJig(j), '- one\n- [ok] two');
});

test('item and section fields, section text, blank lines between items', () => {
  const text = [
    '## Path A',
    'grade:: B',
    'Ship the small thing first.',
    '',
    '- [x] milestone one',
    '  note:: needs a review',
    '  escalate:: true',
    '  a free note',
    '',
    '- milestone two',
    '',
  ].join('\n');
  const j = parseJig(text);
  const s = j.sections[0];
  assert.deepEqual(s.fields, { grade: 'B' });
  assert.deepEqual(s.text, ['Ship the small thing first.', '']);
  assert.deepEqual(s.items[0].fields, { note: 'needs a review', escalate: 'true' });
  assert.deepEqual(s.items[0].note, ['a free note']);
  assert.equal(s.items.length, 2);
  assert.equal(writeJig(j), text);
});

test('summarize lists labels, unlabelled and escalated items', async () => {
  const { summarize } = await import('../web/format.mjs');
  const j = parseJig('---\njig: triage\n---\n- [accept] a\n- b\n  escalate:: true\n- [accept] c');
  const s = summarize(j);
  assert.equal(s.type, 'triage');
  assert.deepEqual(s.by_label, { accept: ['a', 'c'] });
  assert.deepEqual(s.unlabelled, ['b']);
  assert.deepEqual(s.escalated, ['b']);
});
