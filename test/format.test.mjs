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
  assert.deepEqual(j.sections[0].items[1], { label: null, text: 'fix login', note: ['it breaks on Safari'] });
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
