// format.mjs — read and write the jig file format. Runs in Node and the browser.
// Responsibilities:
// - split a jig file into frontmatter and body
// - parse and write a small YAML subset (scalars, inline maps and lists, one level of block maps and lists)
// - parse the body into sections (## headings) of items (- [label] text, with indented note lines)
// - write sections back so a parse → write round trip keeps the file as written
//
// File shape:
//   ---
//   jig: triage
//   status: open
//   actions: {1: accept, 2: reject, 3: later}
//   ---
//   Optional intro prose.
//   ## Section
//   - [accept] item text
//     indented note line

const FENCE = '---';

// ---------- YAML subset ----------

function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = null, cur = '', esc = false;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (esc) esc = false;
      else if (ch === '\\' && quote === '"') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && /(^|[\s,{[:])$/.test(cur.slice(-1) || '')) { quote = ch; cur += ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function splitKey(s) {
  let quote = null, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (esc) esc = false;
      else if (ch === '\\' && quote === '"') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if ((ch === '"' || ch === "'") && (i === 0 || /\s/.test(s[i - 1]))) { quote = ch; continue; }
    if (ch === ':' && (i + 1 === s.length || s[i + 1] === ' ')) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
  }
  return null;
}

export function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return null;
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj = {};
    for (const part of splitTop(s.slice(1, -1), ',')) {
      const kv = splitKey(part.trim());
      if (kv) obj[unquote(kv[0])] = parseScalar(kv[1]);
    }
    return obj;
  }
  if (s.startsWith('[') && s.endsWith(']')) return splitTop(s.slice(1, -1), ',').map(parseScalar);
  if (/^(true|false)$/.test(s)) return s === 'true';
  if (/^(null|~)$/.test(s)) return null;
  if (/^-?\d+(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s);
  return unquote(s);
}

function unquote(s) {
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c)) : inner.replace(/''/g, "'");
  }
  return s;
}

export function parseYaml(text) {
  const out = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#') || /^\s/.test(line)) continue;
    const kv = splitKey(line);
    if (!kv) continue;
    const [key, raw] = kv;
    const rest = /^["']/.test(raw) ? raw : raw.replace(/\s+#.*$/, '');
    if (rest !== '') { out[unquote(key)] = parseScalar(rest); continue; }
    // block value: indented lines that follow
    const block = [];
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) block.push(lines[++i]);
    const items = block.filter((l) => l.trim());
    if (items.length && items.every((l) => l.trim().startsWith('- '))) {
      out[unquote(key)] = items.map((l) => parseScalar(l.trim().slice(2)));
    } else if (items.length) {
      const obj = {};
      for (const l of items) { const p = splitKey(l.trim()); if (p) obj[unquote(p[0])] = parseScalar(p[1]); }
      out[unquote(key)] = obj;
    } else {
      out[unquote(key)] = null;
    }
  }
  return out;
}

function needsQuote(s) {
  return s === '' || /^[\s{[\]}'"#&*!|>%@`-]/.test(s) || /[:#,{}[\]"'\n\\]/.test(s) || /\s$/.test(s)
    || /^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s);
}

export function writeScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(writeScalar).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${writeKey(k)}: ${writeScalar(x)}`).join(', ')}}`;
  const s = String(v);
  return needsQuote(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : s;
}

function writeKey(k) { return /^[\w.-]+$/.test(k) ? k : writeScalar(String(k)); }

export function writeYaml(obj) {
  return Object.entries(obj).map(([k, v]) => `${writeKey(k)}: ${writeScalar(v)}`).join('\n');
}

// ---------- file ----------

/** Split text into { meta, metaText, body }. A file with no frontmatter has meta {}. */
export function splitFile(text) {
  const norm = text.replace(/\r\n/g, '\n');
  if (!norm.startsWith(FENCE + '\n')) return { meta: {}, metaText: null, body: norm };
  const end = norm.indexOf('\n' + FENCE, FENCE.length);
  if (end < 0) return { meta: {}, metaText: null, body: norm };
  const metaText = norm.slice(FENCE.length + 1, end);
  let rest = norm.slice(end + 1 + FENCE.length);
  if (rest.startsWith('\n')) rest = rest.slice(1);
  return { meta: parseYaml(metaText), metaText, body: rest };
}

const ITEM = /^- (?:\[([^\]]*)\] )?(.*)$/;
const HEAD = /^(#{2,6}) (.*)$/;
const FIELD = /^([A-Za-z_][\w.-]*):: ?(.*)$/;

export function newSection(heading, level = 2) {
  return { heading, level, fields: {}, text: [], items: [], after: [] };
}

export function newItem(text, label = null, fields = {}) {
  return { label, text, fields: { ...fields }, note: [], trail: [] };
}

/**
 * Parse a body into { intro, sections }.
 *
 * section: { heading, level, fields, text, items, after }
 *   heading  null for items before any heading; undefined for a continuation after prose
 *   fields   `key:: value` lines right under the heading
 *   text     prose between the heading (and fields) and the first item
 *   after    lines after the items, kept for the round trip
 * item: { label, text, fields, note, trail }
 *   fields   indented `key:: value` lines (Obsidian inline-field syntax), values are strings
 *   note     other indented lines
 *   trail    blank lines between this item and the next
 *
 * Writing puts an item's fields before its note lines.
 */
export function parseBody(body) {
  const lines = body.split('\n');
  const intro = [];
  const sections = [];
  let cur = null;
  let phase = 'head'; // head -> text -> items -> after
  for (const line of lines) {
    const h = line.match(HEAD);
    if (h) { cur = newSection(h[2].trim(), h[1].length); sections.push(cur); phase = 'head'; continue; }
    const m = line.match(ITEM);
    if (m) {
      if (!cur) { cur = newSection(null); sections.push(cur); }
      if (phase === 'after') {
        if (cur.after.some((l) => l.trim())) {
          cur = newSection(undefined, cur.level);
          sections.push(cur);
        } else {
          cur.items[cur.items.length - 1].trail.push(...cur.after);
          cur.after = [];
        }
      }
      phase = 'items';
      cur.items.push(newItem(m[2], m[1] === undefined || m[1] === '' ? null : m[1]));
      continue;
    }
    if (!cur) { intro.push(line); continue; }
    if (phase === 'items' && /^\s+\S/.test(line)) {
      const it = cur.items[cur.items.length - 1];
      const inner = line.replace(/^\s{1,4}/, '');
      const f = inner.match(FIELD);
      if (f && !it.note.length && !(f[1] in it.fields)) it.fields[f[1]] = f[2];
      else it.note.push(inner);
      continue;
    }
    if (phase === 'head') {
      const f = line.match(FIELD);
      if (f) { cur.fields[f[1]] = f[2]; continue; }
      phase = 'text';
    }
    if (phase === 'text') { cur.text.push(line); continue; }
    phase = 'after';
    cur.after.push(line);
  }
  // A section with no items: its text sits where `after` would, so items added later go above it.
  for (const sec of sections) if (!sec.items.length && sec.text.length) { sec.after = [...sec.text, ...sec.after]; sec.text = []; }
  return { intro: intro.join('\n'), hasIntro: intro.length > 0, sections };
}

export function writeItem(it) {
  const labelled = it.label !== null && it.label !== undefined && it.label !== '';
  // Text that itself starts with [..] gets an empty label so it does not read back as one.
  const prefix = labelled ? `[${it.label}] ` : (/^\[[^\]]*\] /.test(it.text) ? '[] ' : '');
  const out = [`- ${prefix}${it.text}`];
  for (const [k, v] of Object.entries(it.fields || {})) {
    if (v === undefined || v === null) continue;
    out.push(`  ${k}:: ${v}`);
  }
  for (const n of it.note || []) out.push(n ? `  ${n}` : '');
  out.push(...(it.trail || []));
  return out;
}

export function writeBody({ intro, sections, hasIntro = false }) {
  const out = [];
  if (intro !== null && intro !== undefined && (intro !== '' || hasIntro)) out.push(intro);
  for (const s of sections) {
    if (s.heading !== null && s.heading !== undefined) out.push(`${'#'.repeat(s.level || 2)} ${s.heading}`);
    for (const [k, v] of Object.entries(s.fields || {})) if (v !== undefined && v !== null) out.push(`${k}:: ${v}`);
    out.push(...(s.text || []));
    for (const it of s.items) out.push(...writeItem(it));
    out.push(...(s.after || []));
  }
  return out.join('\n');
}

/** Parse a whole jig file. */
export function parseJig(text) {
  const { meta, body } = splitFile(text);
  return { meta, ...parseBody(body) };
}

/** Write a whole jig file. */
export function writeJig({ meta, intro, sections, hasIntro }) {
  const head = meta && Object.keys(meta).length ? `${FENCE}\n${writeYaml(meta)}\n${FENCE}\n` : '';
  return head + writeBody({ intro, sections, hasIntro });
}

/** Every item across sections, with its section heading. */
export function allItems(jig) {
  return jig.sections.flatMap((s) => s.items.map((it) => ({ ...it, section: s.heading ?? null })));
}

/** A field read as a list: "a, b" -> ['a', 'b']. */
export function fieldList(obj, key) {
  const v = obj?.fields?.[key];
  if (v === undefined || v === null || String(v).trim() === '') return [];
  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
}

/** A field read as a number, or null. */
export function fieldNumber(obj, key) {
  const v = Number(obj?.fields?.[key]);
  return obj?.fields?.[key] !== undefined && Number.isFinite(v) ? v : null;
}

/** Set or clear a field; falsy-but-zero values clear it. */
export function setField(obj, key, value) {
  obj.fields ||= {};
  if (value === undefined || value === null || value === false || value === '' || (Array.isArray(value) && !value.length)) delete obj.fields[key];
  else obj.fields[key] = Array.isArray(value) ? value.join(', ') : String(value);
}

/**
 * Generic JSON summary of a jig, printed by `jig open` on finish.
 * Views may add type-specific keys through an exported summary(jig).
 */
export function summarize(jig) {
  const by_label = {};
  const sections = jig.sections.filter((s) => s.heading !== undefined || s.items.length).map((s) => ({
    heading: s.heading ?? null,
    fields: s.fields,
    text: (s.text || []).join('\n').trim() || undefined,
    items: s.items.map((it) => {
      if (it.label) (by_label[it.label] ||= []).push(it.text);
      return { label: it.label, text: it.text, fields: it.fields, note: it.note.length ? it.note.join('\n') : undefined };
    }),
  }));
  const items = allItems(jig).map((it) => ({ section: it.section, label: it.label, text: it.text, fields: it.fields }));
  return {
    type: jig.meta.jig ?? null,
    title: jig.meta.title ?? null,
    status: jig.meta.status ?? null,
    sections,
    items,
    by_label,
    unlabelled: items.filter((it) => !it.label).map((it) => it.text),
    escalated: items.filter((it) => it.fields.escalate).map((it) => it.text),
  };
}
