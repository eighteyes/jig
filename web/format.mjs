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
  let depth = 0, quote = null, cur = '';
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function splitKey(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
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
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return unquote(s);
}

function unquote(s) {
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\') : inner.replace(/''/g, "'");
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
    const [key, rest] = kv;
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
  return s === '' || /^[\s{[\]}'"#&*!|>%@`-]/.test(s) || /[:#,{}[\]]/.test(s) || /\s$/.test(s)
    || /^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s);
}

export function writeScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(writeScalar).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${writeKey(k)}: ${writeScalar(x)}`).join(', ')}}`;
  const s = String(v);
  return needsQuote(s) ? `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : s;
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

/**
 * Parse a body into { intro, sections }.
 * sections: [{ heading, level, items: [{ label, text, note }], after }]
 * The first section has heading null when items come before any heading.
 * `after` keeps non-item lines that follow a section's items, so prose survives a round trip.
 */
export function parseBody(body) {
  const lines = body.split('\n');
  const intro = [];
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(HEAD);
    if (h) { cur = { heading: h[2].trim(), level: h[1].length, items: [], after: [] }; sections.push(cur); continue; }
    const m = line.match(ITEM);
    if (m) {
      if (!cur) { cur = { heading: null, level: 2, items: [], after: [] }; sections.push(cur); }
      if (cur.after.length && cur.after.some((l) => l.trim())) {
        // prose between items: start an unnamed continuation so order is kept
        cur = { heading: undefined, level: cur.level, items: [], after: [] };
        sections.push(cur);
      } else cur.after = [];
      cur.items.push({ label: m[1] ?? null, text: m[2], note: [] });
      continue;
    }
    if (cur && cur.items.length && /^\s+\S/.test(line) && !cur.after.length) {
      cur.items[cur.items.length - 1].note.push(line.replace(/^\s{1,4}/, ''));
      continue;
    }
    if (cur) cur.after.push(line); else intro.push(line);
  }
  return { intro: intro.join('\n'), sections };
}

export function writeBody({ intro, sections }) {
  const out = [];
  if (intro) out.push(intro);
  for (const s of sections) {
    if (s.heading) out.push(`${'#'.repeat(s.level || 2)} ${s.heading}`);
    for (const it of s.items) {
      out.push(`- ${it.label !== null && it.label !== undefined ? `[${it.label}] ` : ''}${it.text}`);
      for (const n of it.note || []) out.push(n ? `  ${n}` : '');
    }
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
export function writeJig({ meta, intro, sections }) {
  const head = meta && Object.keys(meta).length ? `${FENCE}\n${writeYaml(meta)}\n${FENCE}\n` : '';
  return head + writeBody({ intro, sections });
}

/** Every item across sections, with its section heading. */
export function allItems(jig) {
  return jig.sections.flatMap((s) => s.items.map((it) => ({ ...it, section: s.heading ?? null })));
}
