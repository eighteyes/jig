// scaffold.mjs — write a new jig file from a type or a decompose framework.
// Responsibilities:
// - load the router map (router/frameworks.json) and look a name up as a framework or a type
// - build the jig: frontmatter from the framework, sections the type expects, items in the right place
// - list types and frameworks for `jig list`

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newSection, newItem, writeJig } from '../web/format.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadRouter() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'router', 'frameworks.json'), 'utf8'));
}

/** Types that have a view module. */
export async function listTypes() {
  const files = await fs.readdir(path.join(ROOT, 'views'));
  return files.filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.slice(0, -4)).sort();
}

/** Where items go, by type: the section heading to put them under, or null for a flat list. */
function sectionsFor(type, meta) {
  if (type === 'matrix') return { headings: [...(meta.quadrants || ['Do', 'Schedule', 'Delegate', 'Drop']), 'Unsorted'], into: 'Unsorted' };
  if (type === 'kanban') return { headings: ['Inbox', ...(meta.lanes || ['Now', 'Next', 'Later', 'Someday', 'Drop'])], into: 'Inbox' };
  if (type === 'venn') {
    const a = meta.sets?.a ?? 'A', b = meta.sets?.b ?? 'B';
    return { headings: [`${a} only`, `${b} only`, 'Both', 'Neither', 'Unsorted'], into: 'Unsorted' };
  }
  if (type === 'qa' || type === 'compare') return { headings: [], into: null, perItemSection: true };
  return { headings: [], into: null };
}

/**
 * Build a jig file's text.
 * @param {string} name a framework key (router) or a type name
 * @param {{title?: string, items?: string[], router?: object, types?: string[]}} opts
 */
export async function scaffold(name, opts = {}) {
  const router = opts.router ?? await loadRouter();
  const types = opts.types ?? await listTypes();
  const fw = router.frameworks.find((f) => f.key === name);
  const type = fw ? fw.type : name;
  if (!fw && !types.includes(type)) {
    throw new Error(`unknown type or framework: ${name} (try: jig list)`);
  }
  const meta = { jig: type, title: opts.title || fw?.name || type, status: 'open' };
  if (fw) meta.framework = fw.key;
  for (const [k, v] of Object.entries(fw?.meta || {})) if (k !== 'quadrants' || type !== 'matrix') meta[k] = v;
  if (type === 'matrix' && fw?.meta?.quadrants) meta.quadrants = fw.meta.quadrants;

  const items = (opts.items || []).map((t) => t.trim()).filter(Boolean);
  const plan = sectionsFor(type, meta);
  const sections = plan.headings.map((h) => newSection(h));
  if (plan.perItemSection) {
    for (const t of items) sections.push(newSection(t));
  } else if (plan.into) {
    sections.find((s) => s.heading === plan.into).items.push(...items.map((t) => newItem(t)));
  } else if (items.length) {
    const flat = newSection(null);
    flat.items.push(...items.map((t) => newItem(t)));
    sections.push(flat);
  }
  const intro = fw ? `${fw.name}: ${fw.why}.\n` : null;
  return writeJig({ meta, intro, sections }) + '\n';
}
