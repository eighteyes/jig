// explore.mjs — explore scored items with media: list or scatter, thresholds, ratings, in-page ELO bouts.
// Responsibilities:
// - read dimensions from meta; the item fields named by each dimension's key hold the numbers
// - list view: one row per item with the current dimension as a bar between low and high; scatter view: two dimensions
// - thresholds in meta.thresholds hide items outside them; `gate: true` / `filter: true` dimensions hide items outside low..high (g / f toggle)
// - keys: arrows, 1-5 play, [ ] \ ! @ # $ % rate, > < = 0 - thresholds, k x p labels, s sort, g f filters, r compete, v view, u undo, Enter finish
// - compete mode: ELO bouts over the visible list, writing rating / wins / losses / ties / comparisons fields
// - samples play from the `audio` field (else `video`) through mediaUrl(); no DOM or playback needed for the data to change
// - summary(jig): { rated, shortlist, cut, promoted, thresholds, survivors }
//
// File:
//   ---
//   jig: explore
//   seed: 1
//   dimensions:
//     - {key: hnr_db, label: HNR, group: quality, dp: 1, low: 5, high: 25, prefer_high: true}
//     - {key: pause_frac, label: Pauses, group: pacing, dp: 2, gate: true, low: 0, high: 0.5}
//   thresholds: {hnr_db: {min: 10}}
//   ---
//   - [keep] take 12
//     hnr_db:: 18.2
//     rating:: 1540
//     audio:: takes/12a.wav, takes/12b.wav
//     tags:: warm
//
// A dimension may also set desc, stat (a name: show its percentile band under each item), gate, filter.
// A `rating` dimension (ELO, 1300..1700) is always present as the first one.

import { el, css, badges, keepVisible, mediaUrl } from '../web/ui.mjs';
import { fieldList, fieldNumber, setField } from '../web/format.mjs';

const RATING = 'rating';
const BASE = 1500, R_MIN = 1300, R_MAX = 1700, NUDGE = 25;
const PER_ROUND = 5, K_FACTOR = 32, PAGE = 20;
const SET_RATING = { '!': 1300, '@': 1400, '#': 1500, '$': 1600, '%': 1700 };
const LABELS = { k: 'keep', x: 'cut', p: 'promote' };
const BANDS = [[10, 'very low', 'lo'], [30, 'low', 'lo'], [70, 'mid', 'mid'], [90, 'high', 'hi'], [101, 'very high', 'hi']];
const RAMP = [55, 68, 80, 90, 100];
const GROUP_COLOURS = ['--info', '--accent', '--good', '--bad', '--dim'];
const OWN_FIELDS = ['rating', 'wins', 'losses', 'ties', 'comparisons'];

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const itemsOf = (jig) => jig.sections.flatMap((s) => s.items);
const thresholdsOf = (jig) => (jig.meta?.thresholds && typeof jig.meta.thresholds === 'object' ? jig.meta.thresholds : {});
const fmt = (v, dp) => (isNum(v) ? v.toFixed(dp ?? 2) : '–');

function dimsOf(meta) {
  const list = Array.isArray(meta?.dimensions) ? meta.dimensions.filter((d) => d && typeof d === 'object' && d.key) : [];
  const dims = list.map((d) => ({ ...d, key: String(d.key), label: String(d.label ?? d.key), group: String(d.group ?? 'other'), dp: isNum(d.dp) ? d.dp : 2 }));
  if (!dims.some((d) => d.key === RATING)) {
    dims.unshift({
      key: RATING, label: 'Rating (ELO)', group: 'judgement', dp: 0, low: R_MIN, high: R_MAX, prefer_high: true,
      desc: '[ ] nudge 25 · ! @ # $ % set 1300..1700 · \\ clear. 1500 is the unjudged default.',
    });
  }
  return dims;
}

/** True when x sits inside a threshold's min/max (either side optional). */
const within = (x, t) => !((t.min != null && x < t.min) || (t.max != null && x > t.max));

/** An item passes thresholds when it has a number for every thresholded key and sits inside each. */
function passesThresholds(it, th) {
  for (const [key, t] of Object.entries(th)) {
    const x = fieldNumber(it, key);
    if (x === null) return false;
    if (!within(x, t || {})) return false;
  }
  return true;
}

export function summary(jig) {
  const items = itemsOf(jig);
  const th = thresholdsOf(jig);
  const rated = items.filter((it) => fieldNumber(it, RATING) !== null)
    .map((it) => ({ text: it.text, rating: fieldNumber(it, RATING) }))
    .sort((a, b) => b.rating - a.rating);
  return {
    rated,
    shortlist: items.filter((it) => it.label === 'keep' || it.label === 'promote').map((it) => it.text),
    cut: items.filter((it) => it.label === 'cut').map((it) => it.text),
    promoted: items.filter((it) => it.label === 'promote').map((it) => it.text),
    thresholds: th,
    survivors: items.filter((it) => passesThresholds(it, th)).map((it) => it.text),
  };
}

/** Small seeded generator (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const items = itemsOf(jig);
  const dims = dimsOf(jig.meta);
  const rng = seeded(Number(jig.meta.seed) || 1);
  const groups = [...new Set(dims.map((d) => d.group))];
  const groupColour = (g) => `var(${GROUP_COLOURS[groups.indexOf(g) % GROUP_COLOURS.length]})`;

  let di = 0;
  let dj = Math.min(1, dims.length - 1);
  let focusItem = items[0] ?? null;
  let desc = true;
  let gatesOn = true, filtersOn = true;
  let scatter = false;
  let compete = false, roster = [], bout = [], tieMode = false, tieSel = new Set(), clipCursor = [];
  let armed = false;
  let audio = null;
  let pts = [];

  const dimX = () => dims[di];
  const dimY = () => dims[dj];
  const val = (it, key) => fieldNumber(it, key);
  const ratingOf = (it) => val(it, RATING) ?? BASE;
  const count = (it, k) => val(it, k) ?? 0;

  // Ranges come from the whole file, never the filtered view, so a mark keeps its place as filters change.
  const ranges = {};
  const sorted = {};
  for (const d of dims) {
    const vals = items.map((it) => val(it, d.key)).filter(isNum).sort((a, b) => a - b);
    sorted[d.key] = vals;
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
    const lo = isNum(d.low) ? d.low : vals.length ? q(0.02) : null;
    const hi = isNum(d.high) ? d.high : vals.length ? q(0.98) : null;
    if (lo === null || hi === null) continue;
    ranges[d.key] = { lo, hi, med: d.key === RATING ? BASE : vals.length ? q(0.5) : (lo + hi) / 2 };
  }

  css('explore', `
    .xp { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: var(--gap); align-items: start; }
    .xp-rail { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); overflow: hidden; }
    .xp-dim { padding: 6px 12px; border-left: 3px solid var(--edge); cursor: pointer; }
    .xp-dim.on { background: var(--raised); border-left-color: var(--accent); }
    .xp-dim.ax { background: var(--raised); }
    .xp-dim .top { display: flex; justify-content: space-between; gap: 8px; }
    .xp-dim.on .nm { color: var(--accent); }
    .xp-dim .grp { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .xp-dim .sm { color: var(--dim); font-size: 11px; }
    .xp-dim .desc { display: none; color: var(--dim); font-size: 12px; margin-top: 3px; }
    .xp-dim.on .desc { display: block; }
    .xp-dim .filt { color: var(--good); font-size: 12px; }
    .xp-filters { padding: 8px 12px; border-top: 1px solid var(--edge); font-size: 12px; color: var(--dim); }
    .xp-filters .on { color: var(--good); }
    .xp-main { min-width: 0; }
    .xp-head { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 8px 12px; margin-bottom: 8px; }
    .xp-head b { color: var(--accent); }
    .xp-head .pole, .xp-counts, .xp-hud { color: var(--dim); font-size: 12px; }
    .xp-hud.err { color: var(--bad); }
    .xp-warn { color: var(--accent); min-height: 1.4em; margin: 8px 0; }
    .xp-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 120px 64px 48px minmax(0, 110px); gap: 10px; align-items: center; padding: 5px 10px; border: 1px solid transparent; border-bottom-color: var(--edge); cursor: pointer; }
    .xp-row.on { border-color: var(--accent); border-radius: var(--r); background: var(--panel); }
    .xp-rank { color: var(--dim); font-size: 11px; text-align: right; }
    .xp-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .xp-row.on .xp-nm { color: var(--accent); }
    .xp-row.keep .xp-nm, .xp-row.promote .xp-nm { color: var(--good); }
    .xp-row.cut { opacity: .4; }
    .xp-row.cut .xp-nm { text-decoration: line-through; }
    .xp-tag { color: var(--dim); font-size: 11px; margin-left: 8px; }
    .xp-tag.lab { color: var(--accent); }
    .xp-sub { display: block; color: var(--dim); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xp-sub .lo { color: var(--info); } .xp-sub .hi { color: var(--accent); } .xp-sub .rec { color: var(--good); }
    .xp-bar { position: relative; height: 9px; background: var(--raised); border-radius: 2px; }
    .xp-bar u { position: absolute; top: -2px; bottom: -2px; width: 3px; background: var(--accent); }
    .xp-bar s { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dim); }
    .xp-val { text-align: right; font-variant-numeric: tabular-nums; }
    .xp-rt { text-align: right; font-variant-numeric: tabular-nums; font-size: 12px; }
    .xp-un { color: var(--dim); }
    .xp-meta { color: var(--dim); font-size: 11px; text-align: right; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .xp-c { display: grid; grid-template-columns: 30px minmax(0, 1fr) 100px 34px; gap: 12px; align-items: center; padding: 12px; border: 1px solid var(--edge); border-radius: var(--r); background: var(--panel); margin-bottom: 8px; }
    .xp-c.sel { border-color: var(--accent); }
    .xp-c .ck { text-align: center; color: var(--dim); border: 1px solid var(--edge); border-radius: 4px; padding: 2px 0; }
    .xp-c .cn { font-size: 16px; }
    .xp-c .cr { text-align: right; color: var(--info); font-variant-numeric: tabular-nums; }
    .xp-c .cw { text-align: center; color: var(--accent); border: 1px solid var(--edge); border-radius: 4px; padding: 3px 0; }
    .xp-c .cw.on { background: var(--accent); color: var(--bg); }
    .xp-tie { background: var(--accent); color: var(--bg); padding: 1px 8px; border-radius: 4px; font-weight: 700; }
    .xp-plot { width: 100%; display: block; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); }
    .xp-plot text { fill: var(--dim); font: 10px var(--mono); }
    .xp-plot text.ax { fill: var(--ink); font-size: 11px; }
    .xp-plot text.lab { fill: var(--accent); font-size: 11px; }
    .xp-plot .axis { stroke: var(--edge); } .xp-plot .grid { stroke: var(--raised); }
    .xp-plot .halo { fill: none; stroke: var(--accent); }
    .xp-bar2 { position: fixed; bottom: 38px; left: 0; right: 0; background: var(--raised); border-top: 1px solid var(--accent); padding: 8px 20px; display: flex; gap: 12px; align-items: center; }
    .xp-bar2[hidden] { display: none; }
    .xp-bar2 span { color: var(--dim); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
    .xp-bar2 input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); padding: 4px 8px; }
  `);

  const rail = el('div', 'xp-rail');
  const dimsBox = el('div');
  const filtersBox = el('div', 'xp-filters');
  rail.append(dimsBox, filtersBox);
  const dimhead = el('div');
  const counts = el('div', 'xp-counts');
  const hudEl = el('div', 'xp-hud', 'ready');
  const head = el('div', 'xp-head');
  head.append(dimhead, counts, hudEl);
  const list = el('div', 'xp-list');
  const plot = sv('svg', { class: 'xp-plot' });
  plot.style.display = 'none';
  const warn = el('div', 'xp-warn');
  const main = el('div', 'xp-main');
  main.append(head, list, plot, warn);
  const app = el('div', 'xp');
  app.append(rail, main);
  const bar = el('div', 'xp-bar2');
  const barLabel = el('span');
  const input = el('input');
  bar.append(barLabel, input);
  bar.hidden = true;
  root.replaceChildren(app, bar);

  function hud(msg, isErr) {
    hudEl.className = isErr ? 'xp-hud err' : 'xp-hud';
    hudEl.textContent = msg;
  }

  // ---------- filtering ----------

  const boundsOk = (it, d) => {
    const x = val(it, d.key);
    if (x === null) return true;
    return within(x, { min: isNum(d.low) ? d.low : null, max: isNum(d.high) ? d.high : null });
  };
  const gateDims = () => dims.filter((d) => d.gate === true);
  const filterDims = () => dims.filter((d) => d.filter === true);
  const failsGate = (it) => gateDims().some((d) => !boundsOk(it, d));
  const failsFilter = (it) => filterDims().some((d) => !boundsOk(it, d));

  function passes(it) {
    if (gatesOn && failsGate(it)) return false;
    if (filtersOn && failsFilter(it)) return false;
    return passesThresholds(it, thresholdsOf(jig));
  }

  function visible() {
    const k = dimX().key;
    const dir = (desc ? 1 : -1) * (dimX().prefer_high === false ? -1 : 1);
    return items.filter(passes).sort((a, b) => {
      const x = val(a, k), y = val(b, k);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return dir > 0 ? y - x : x - y;
    });
  }

  function cur() {
    if (compete && bout.length) return bout[0];
    const view = visible();
    return view.includes(focusItem) ? focusItem : view[0] ?? null;
  }
  const focusIndex = () => Math.max(0, visible().indexOf(cur()));
  function setFocusIndex(n) {
    const view = visible();
    if (view.length) focusItem = view[Math.max(0, Math.min(n, view.length - 1))];
  }

  function filterParts() {
    const parts = [];
    for (const [k, t] of Object.entries(thresholdsOf(jig))) {
      const d = dims.find((x) => x.key === k) ?? { label: k, dp: 2 };
      if (t?.min != null) parts.push(`${d.label} ≥ ${fmt(t.min, d.dp)}`);
      if (t?.max != null) parts.push(`${d.label} ≤ ${fmt(t.max, d.dp)}`);
    }
    return parts;
  }

  // ---------- rendering ----------

  const rampColour = (r) => {
    const t = (r - R_MIN) / (R_MAX - R_MIN);
    const step = Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))));
    return `color-mix(in srgb, var(--info) ${RAMP[step]}%, var(--ink))`;
  };

  function pct(key, x) {
    const arr = sorted[key];
    if (!arr?.length) return null;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
    return (lo / arr.length) * 100;
  }

  /** Where an item sits relative to the pile, for dimensions that set `stat`. Only the ends are shown. */
  function statLine(it) {
    const out = el('span', 'xp-sub');
    const bits = [];
    for (const d of dims) {
      if (!d.stat) continue;
      const x = val(it, d.key);
      if (x === null) continue;
      const p = pct(d.key, x);
      const band = BANDS.find((b) => p < b[0]) ?? BANDS[BANDS.length - 1];
      if (band[1] === 'mid') continue;
      bits.push(el('span', band[2], `${band[1]} ${typeof d.stat === 'string' ? d.stat : d.label.toLowerCase()}`));
    }
    if (count(it, 'comparisons')) bits.push(el('span', 'rec', `${count(it, 'wins')}W-${count(it, 'losses')}L`));
    bits.forEach((b, i) => { if (i) out.append(' · '); out.append(b); });
    return out;
  }

  function renderRail() {
    dimsBox.replaceChildren(...dims.map((d, i) => {
      const t = thresholdsOf(jig)[d.key];
      const ax = scatter ? (i === di ? 'x' : i === dj ? 'y' : '') : '';
      const box = el('div', `xp-dim${i === di ? ' on' : ''}${ax ? ' ax' : ''}`);
      const top = el('div', 'top');
      const nm = el('span', 'nm', d.label);
      if (ax) nm.append(el('span', 'sm', ` ${ax}-axis`));
      const grp = el('span', 'grp', d.group);
      grp.style.color = groupColour(d.group);
      top.append(nm, grp);
      box.style.borderLeftColor = i === di ? '' : groupColour(d.group);
      box.append(top);
      const r = ranges[d.key];
      if (r) box.append(el('div', 'sm', `${fmt(r.lo, d.dp)} → ${fmt(r.hi, d.dp)}`));
      const f = t ? [t.min != null ? `≥ ${fmt(t.min, d.dp)}` : '', t.max != null ? `≤ ${fmt(t.max, d.dp)}` : ''].filter(Boolean).join('  ') : '';
      if (f) box.append(el('div', 'filt', f));
      if (d.desc) box.append(el('div', 'desc', d.desc));
      box.addEventListener('click', () => { di = i; setFocusIndex(0); render(); });
      return box;
    }));
    const parts = filterParts();
    const rows = [el('b', null, 'Filters')];
    if (gateDims().length) rows.push(el('div', gatesOn ? 'on' : '', `[g] gates ${gatesOn ? 'on' : 'off'} — ${items.filter(failsGate).length} fail`));
    if (filterDims().length) rows.push(el('div', filtersOn ? 'on' : '', `[f] filters ${filtersOn ? 'on' : 'off'} — ${items.filter(failsFilter).length} hidden`));
    for (const p of parts) rows.push(el('div', 'on', p));
    rows.push(el('div', null, parts.length ? '[0] clear this dimension · [-] clear all' : '< > cut at cursor · = type a threshold'));
    filtersBox.replaceChildren(...rows);
  }

  function renderList() {
    const d = dimX(), r = ranges[d.key];
    const view = visible();
    const on = cur();
    dimhead.replaceChildren(el('b', null, d.label), el('span', 'pole', ` ${desc ? 'high' : 'low'} first`));
    const pos = (x) => `${Math.max(0, Math.min(100, ((x - r.lo) / ((r.hi - r.lo) || 1)) * 100))}%`;
    list.replaceChildren(...view.map((it, n) => {
      const x = val(it, d.key), rt = val(it, RATING);
      const row = el('div', `xp-row${it === on ? ' on' : ''}${it.label ? ` ${it.label}` : ''}`);
      const nm = el('span', 'xp-nm', it.text);
      if (it.label) nm.append(el('span', 'xp-tag lab', it.label));
      nm.append(statLine(it), ...badges(it));
      const barEl = el('span', 'xp-bar');
      if (r) {
        const med = el('s'); med.style.left = pos(r.med); barEl.append(med);
        if (x !== null) { const u = el('u'); u.style.left = pos(x); barEl.append(u); }
      }
      const rtEl = el('span', 'xp-rt');
      if (rt === null) rtEl.append(el('span', 'xp-un', '·'));
      else { const b = el('b', null, rt.toFixed(0)); b.style.color = rampColour(rt); rtEl.append(b); }
      const metaEl = el('span', 'xp-meta', fieldList(it, 'tags').join(' · '));
      row.append(el('span', 'xp-rank', String(n + 1)), nm, barEl, el('span', 'xp-val', fmt(x, d.dp)), rtEl, metaEl);
      row.addEventListener('click', () => { focusItem = it; render(); });
      return row;
    }));
    if (!view.length) list.append(el('div', 'xp-un', 'Nothing visible. Loosen a threshold.'));
    keepVisible(list.querySelector('.xp-row.on'));
  }

  function renderPlot() {
    const dx = dimX(), dy = dimY(), rx = ranges[dx.key], ry = ranges[dy.key];
    plot.replaceChildren();
    dimhead.replaceChildren(el('b', null, dx.label), el('span', 'pole', ' × '), el('b', null, dy.label), el('span', 'pole', " — , . change x · ; ' change y"));
    if (!rx || !ry) { plot.append(sv('text', { x: 20, y: 30 }, 'no numeric range for this pair')); pts = []; return; }
    const W = Math.max(520, main.clientWidth - 4), H = Math.max(260, Math.min(window.innerHeight - 400, 520));
    const M = { l: 62, r: 18, t: 14, b: 46 };
    plot.setAttribute('viewBox', `0 0 ${W} ${H}`);
    plot.setAttribute('height', H);
    const sx = (v) => M.l + ((v - rx.lo) / ((rx.hi - rx.lo) || 1)) * (W - M.l - M.r);
    const sy = (v) => H - M.b - ((v - ry.lo) / ((ry.hi - ry.lo) || 1)) * (H - M.t - M.b);
    const clampv = (v, a, b) => Math.max(a, Math.min(b, v));
    pts = visible().filter((it) => val(it, dx.key) !== null && val(it, dy.key) !== null)
      .map((it) => ({ it, x: clampv(sx(val(it, dx.key)), M.l, W - M.r), y: clampv(sy(val(it, dy.key)), M.t, H - M.b) }));
    const on = cur();
    const focus = pts.find((p) => p.it === on) ?? pts[0] ?? null;
    for (let i = 0; i <= 4; i++) {
      const gx = M.l + (i / 4) * (W - M.l - M.r), gy = M.t + (i / 4) * (H - M.t - M.b);
      plot.append(sv('line', { class: 'grid', x1: gx, y1: M.t, x2: gx, y2: H - M.b }), sv('line', { class: 'grid', x1: M.l, y1: gy, x2: W - M.r, y2: gy }));
    }
    plot.append(
      sv('line', { class: 'axis', x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b }),
      sv('line', { class: 'axis', x1: M.l, y1: M.t, x2: M.l, y2: H - M.b }),
      sv('text', { class: 'ax', x: M.l, y: H - 20 }, `${dx.label} →`),
      sv('text', { x: M.l, y: H - 8 }, fmt(rx.lo, dx.dp)),
      sv('text', { x: W - M.r, y: H - 8, 'text-anchor': 'end' }, fmt(rx.hi, dx.dp)),
      sv('text', { class: 'ax', transform: `translate(14,${H - M.b}) rotate(-90)` }, `${dy.label} →`),
      sv('text', { transform: `translate(28,${H - M.b}) rotate(-90)` }, fmt(ry.lo, dy.dp)),
      sv('text', { transform: `translate(28,${M.t}) rotate(-90)`, 'text-anchor': 'end' }, fmt(ry.hi, dy.dp)),
    );
    for (const p of pts) {
      const isFocus = p === focus;
      const rt = val(p.it, RATING);
      const c = sv('circle', { class: `pt${isFocus ? ' on' : ''}${p.it.label ? ` ${p.it.label}` : ''}`, cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: isFocus ? 4.5 : p.it.label === 'promote' ? 3.4 : 2.6 });
      if (isFocus) c.style.fill = 'var(--accent)';
      else if (p.it.label === 'cut') c.style.fill = 'var(--edge)';
      else if (rt !== null) c.style.fill = rampColour(rt);
      else { c.style.fill = 'none'; c.style.stroke = 'var(--dim)'; }
      plot.append(c);
      if (p.it.label === 'promote' && !isFocus) plot.append(sv('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5.6, fill: 'none', stroke: 'var(--good)' }));
    }
    if (focus) {
      const anchor = focus.x > W - 160 ? 'end' : 'start';
      const off = anchor === 'end' ? -12 : 12;
      plot.append(
        sv('circle', { class: 'halo', cx: focus.x, cy: focus.y, r: 9 }),
        sv('text', { class: 'lab', x: focus.x + off, y: focus.y - 10, 'text-anchor': anchor }, focus.it.text),
        sv('text', { class: 'lab', x: focus.x + off, y: focus.y + 2, 'text-anchor': anchor },
          `${fmt(val(focus.it, dx.key), dx.dp)}, ${fmt(val(focus.it, dy.key), dy.dp)}${val(focus.it, RATING) !== null ? ` · ${val(focus.it, RATING).toFixed(0)} n=${count(focus.it, 'comparisons')}` : ' · unrated'}`),
      );
    }
  }

  function renderCompete() {
    if (!bout.length && !nextBout()) {
      dimhead.replaceChildren(el('b', null, 'COMPETING'));
      list.replaceChildren(el('div', 'xp-un', 'Not enough contenders. Widen the thresholds.'));
      return;
    }
    dimhead.replaceChildren();
    if (tieMode) dimhead.append(el('b', 'xp-tie', 'TIE MODE'), el('span', 'pole', ` 6-0 toggles a co-winner · ${tieSel.size} selected · ↑ commits · ↓ cancels`));
    else dimhead.append(el('b', null, 'COMPETING'), el('span', 'pole', ` ${roster.length} in the running · ${bout.length} this round · 6-0 crowns · ↑ for a tie`));
    list.replaceChildren(...bout.map((it, i) => {
      const row = el('div', `xp-c${tieSel.has(i) ? ' sel' : ''}`);
      const body = el('div');
      body.append(el('div', 'cn', it.text), statLine(it));
      if (samples(it).length > 1) body.append(el('span', 'xp-sub', `${samples(it).length} clips`));
      const cr = el('div', 'cr', ratingOf(it).toFixed(0));
      cr.append(el('span', 'xp-sub', count(it, 'comparisons') ? `${count(it, 'wins')}W-${count(it, 'losses')}L` : 'unheard'));
      row.append(el('div', 'ck', String(i + 1)), body, cr, el('div', `cw${tieSel.has(i) ? ' on' : ''}`, String(i + 1 + PER_ROUND > 9 ? 0 : i + 1 + PER_ROUND)));
      return row;
    }));
  }

  function render() {
    armed = false;
    warn.textContent = '';
    renderRail();
    list.style.display = scatter && !compete ? 'none' : '';
    plot.style.display = scatter && !compete ? '' : 'none';
    if (compete) renderCompete();
    else if (scatter) renderPlot();
    else renderList();
    const shown = visible().length;
    const labelled = (l) => items.filter((it) => it.label === l).length;
    counts.textContent = `${shown} shown · ${items.length - items.filter(passes).length} hidden · ${items.length} total · ${labelled('keep')} keep · ${labelled('cut')} cut · ${labelled('promote')} promote · ${items.filter((it) => count(it, 'comparisons') > 0).length} judged`;
  }

  // ---------- undo ----------

  /** Snapshot everything this view edits; the returned function restores it. */
  function snap() {
    const marks = items.map((it) => ({ it, label: it.label, f: Object.fromEntries(OWN_FIELDS.map((k) => [k, it.fields[k]])) }));
    const th = jig.meta.thresholds === undefined ? undefined : JSON.parse(JSON.stringify(jig.meta.thresholds));
    const round = { bout: bout.slice(), tieMode, tieSel: [...tieSel], clipCursor: clipCursor.slice() };
    const focus = focusItem;
    return () => {
      for (const m of marks) {
        m.it.label = m.label;
        for (const k of OWN_FIELDS) { if (m.f[k] === undefined) delete m.it.fields[k]; else m.it.fields[k] = m.f[k]; }
      }
      if (th === undefined) delete jig.meta.thresholds; else jig.meta.thresholds = th;
      if (compete && round.bout.length) { bout = round.bout; tieMode = round.tieMode; tieSel = new Set(round.tieSel); clipCursor = round.clipCursor; }
      focusItem = focus;
    };
  }

  /** Run mutate(); save; return the inverse for undo. mutate returns false to skip (nothing changed). */
  async function change(mutate) {
    const restore = snap();
    if (mutate() === false) return;
    render();
    await ctx.save();
    return async () => { restore(); render(); await ctx.save(); };
  }

  // ---------- thresholds ----------

  function setThreshold(key, side, x) {
    const th = (jig.meta.thresholds ||= {});
    th[key] = { [side]: x };
  }
  function clearThreshold(key) {
    if (!jig.meta.thresholds) return false;
    delete jig.meta.thresholds[key];
    if (!Object.keys(jig.meta.thresholds).length) delete jig.meta.thresholds;
  }

  function cutAt(side) {
    if (compete) return;
    const it = cur(), d = dimX();
    if (!it) return;
    const x = val(it, d.key);
    if (x === null) return hud(`${it.text} has no ${d.label}`, true);
    return change(() => {
      setThreshold(d.key, side, x);
      hud(`${d.label} ${side === 'min' ? '≥' : '≤'} ${fmt(x, d.dp)}`);
    });
  }

  function clearDim() {
    if (compete) return crown(PER_ROUND - 1);
    const d = dimX();
    if (!thresholdsOf(jig)[d.key]) return;
    return change(() => { clearThreshold(d.key); hud(`${d.label} threshold cleared`); });
  }

  function clearAll() {
    if (compete || !Object.keys(thresholdsOf(jig)).length) return;
    return change(() => { delete jig.meta.thresholds; hud('all thresholds cleared'); });
  }

  /** Open the inline bar; Enter calls done(value) and files its inverse for undo, Escape cancels. */
  function ask(label, value, done) {
    barLabel.textContent = label;
    input.value = value;
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

  function typedThreshold() {
    if (compete) return;
    const d = dimX(), r = ranges[d.key];
    ask(`${d.label} threshold (${r ? `${fmt(r.lo, d.dp)} … ${fmt(r.hi, d.dp)}` : 'no range'}) — e.g. >40 or <0.25, blank clears`, '', (s) => {
      if (!s) return clearDim();
      const m = s.match(/^([<>])=?\s*(-?\d+(?:\.\d+)?)$/);
      if (!m) { hud(`could not read "${s}" — use >40 or <0.25`, true); return; }
      return change(() => {
        setThreshold(d.key, m[1] === '>' ? 'min' : 'max', parseFloat(m[2]));
        hud(`${d.label} ${m[1] === '>' ? '≥' : '≤'} ${fmt(parseFloat(m[2]), d.dp)}`);
      });
    });
  }

  // ---------- ratings and labels ----------

  const writeRating = (it, x) => setField(it, RATING, Math.round(x * 10) / 10);

  function rate(set, rel) {
    if (compete) return;
    const it = cur();
    if (!it) return;
    return change(() => {
      writeRating(it, rel ? Math.max(R_MIN, Math.min(R_MAX, ratingOf(it) + set * NUDGE)) : set);
      hud(`${it.text} rated ${ratingOf(it).toFixed(0)}`);
    });
  }

  function clearRating() {
    if (compete) return;
    const it = cur();
    if (!it || val(it, RATING) === null) return;
    return change(() => { setField(it, RATING, null); hud(`${it.text} unrated`); });
  }

  function mark(label) {
    if (compete) return;
    const it = cur();
    if (!it) return;
    return change(() => {
      const n = focusIndex();
      it.label = it.label === label ? null : label;
      hud(`${label} → ${it.text} ${it.label === label ? 'on' : 'off'}`);
      if (!scatter) { render(); setFocusIndex(n + 1); }
    });
  }

  // ---------- compete ----------

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  /** Least-compared first, then the contenders nearest in rating, so each round teaches something. */
  function nextBout() {
    const pool = shuffle(roster.slice()).sort((a, b) => count(a, 'comparisons') - count(b, 'comparisons'));
    const seedItem = pool[0];
    const rest = pool.slice(1).sort((a, b) => Math.abs(ratingOf(a) - ratingOf(seedItem)) - Math.abs(ratingOf(b) - ratingOf(seedItem)));
    const near = shuffle(rest.slice(0, PER_ROUND * 2));
    bout = seedItem ? [seedItem, ...near.slice(0, PER_ROUND - 1)] : [];
    tieSel = new Set();
    clipCursor = [];
    return bout.length >= 2;
  }

  function applyElo(winner, losers, tie) {
    const rw = ratingOf(winner);
    for (const l of losers) {
      const rl = ratingOf(l);
      const ew = 1 / (1 + Math.pow(10, (rl - rw) / 400));
      const sw = tie ? 0.5 : 1;
      writeRating(winner, ratingOf(winner) + K_FACTOR * (sw - ew));
      writeRating(l, rl + K_FACTOR * ((1 - sw) - (1 - ew)));
      setField(winner, 'comparisons', count(winner, 'comparisons') + 1);
      setField(l, 'comparisons', count(l, 'comparisons') + 1);
      if (tie) { setField(winner, 'ties', count(winner, 'ties') + 1); setField(l, 'ties', count(l, 'ties') + 1); }
      else { setField(winner, 'wins', count(winner, 'wins') + 1); setField(l, 'losses', count(l, 'losses') + 1); }
    }
  }

  function crown(i) {
    if (!compete) return;
    const w = bout[i];
    if (!w) return hud('no contender there', true);
    if (tieMode) {
      if (tieSel.has(i)) tieSel.delete(i); else tieSel.add(i);
      hud(`TIE MODE · ${tieSel.size} co-winner(s) selected · ↑ commits · ↓ cancels`);
      return render();
    }
    return change(() => {
      applyElo(w, bout.filter((x) => x !== w), false);
      hud(`crowned ${w.text} → ${ratingOf(w).toFixed(0)}`);
      nextBout();
    });
  }

  function commitTie() {
    if (!tieSel.size) { tieMode = false; hud('tie mode off — nothing selected'); return render(); }
    const winners = [...tieSel].map((i) => bout[i]).filter(Boolean);
    const losers = bout.filter((x) => !winners.includes(x));
    return change(() => {
      for (const w of winners) applyElo(w, losers, false);
      for (let a = 0; a < winners.length; a++) for (let b = a + 1; b < winners.length; b++) applyElo(winners[a], [winners[b]], true);
      hud(`tied ${winners.map((w) => w.text).join(' = ')} over ${losers.length}`);
      tieMode = false;
      nextBout();
    });
  }

  function allWeak() {
    return change(() => {
      for (const it of bout) { writeRating(it, ratingOf(it) - K_FACTOR / 2); setField(it, 'comparisons', count(it, 'comparisons') + 1); }
      hud('all weak — every contender demoted');
      nextBout();
    });
  }

  function startCompete() {
    if (compete) return;
    roster = visible();
    if (roster.length < 2) return hud('need at least 2 visible items to compete', true);
    compete = true;
    bout = [];
    nextBout();
    hud(`competing over ${roster.length} · 1-5 play · 6-0 crown · v or Esc to leave`);
    render();
  }

  function leaveCompete() {
    if (!compete) return false;
    compete = false; tieMode = false; tieSel = new Set(); bout = [];
    stop();
    hud('left competing');
    render();
    return true;
  }

  // ---------- media ----------

  const samples = (it) => { const a = fieldList(it, 'audio'); return a.length ? a : fieldList(it, 'video'); };
  function stop() { if (audio) { audio.pause(); audio = null; } }

  function playUrl(url, msg) {
    stop();
    try {
      audio = new Audio(mediaUrl(url));
      audio.play().then(() => hud(msg), (e) => hud(`audio failed: ${e.message}`, true));
    } catch (e) { hud(`audio failed: ${e.message}`, true); }
  }

  function play(n) {
    if (compete) {
      const it = bout[n - 1];
      if (!it) return;
      const list_ = samples(it);
      if (!list_.length) return hud(`no samples for ${it.text}`, true);
      const idx = clipCursor[n - 1] == null ? 0 : (clipCursor[n - 1] + 1) % list_.length;
      clipCursor[n - 1] = idx;
      return playUrl(list_[idx], `${n} → ${it.text} clip ${idx + 1}/${list_.length}`);
    }
    const it = cur();
    if (!it) return;
    const list_ = samples(it);
    if (!list_.length) return hud(`no samples for ${it.text}`, true);
    const idx = Math.min(n, list_.length) - 1;
    playUrl(list_[idx], `${n} → ${it.text} sample ${idx + 1}/${list_.length}`);
  }

  // ---------- navigation ----------

  /** Nearest point in a 90-degree cone of the direction; falls back to the nearest on that side. */
  function step(ddx, ddy) {
    const from = pts.find((p) => p.it === cur()) ?? pts[0];
    if (!from) return;
    let best = null, bestScore = Infinity, fallback = null, fbScore = Infinity;
    for (const p of pts) {
      if (p === from) continue;
      const ax = p.x - from.x, ay = p.y - from.y;
      const along = ax * ddx + ay * ddy;
      if (along <= 0) continue;
      const across = Math.abs(ax * ddy + ay * ddx);
      const dist = Math.hypot(ax, ay);
      if (dist < fbScore) { fbScore = dist; fallback = p; }
      if (across > along) continue;
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    const target = best || fallback;
    if (target) { focusItem = target.it; render(); } else hud('no point that way', true);
  }

  const cycle = (n, by) => (n + by + dims.length) % dims.length;

  function move(dir) {
    if (compete) return;
    setFocusIndex(focusIndex() + dir);
    render();
  }
  function page(dir) {
    if (compete) return;
    const view = visible();
    if (!view.length) return;
    setFocusIndex(focusIndex() + dir * (scatter ? Math.max(1, Math.round(view.length / 10)) : PAGE));
    hud(`${dir > 0 ? 'page down' : 'page up'} → ${focusIndex() + 1}/${view.length}`);
    render();
  }

  function finish() {
    stop();
    const waiting = items.filter((it) => !it.label).length;
    if (waiting && !armed) {
      armed = true;
      warn.textContent = `${waiting} item${waiting === 1 ? '' : 's'} still unlabelled. Press Enter again to finish.`;
      return;
    }
    return ctx.finish();
  }

  // Companion keys of a titled action get a blank title, so the legend lists them as bare keys.
  const define = (name, fn, title = ' ') => actions.define(name, fn, title);
  define('up', () => {
    if (compete) {
      if (tieMode) return commitTie();
      tieMode = true; tieSel = new Set();
      hud('TIE MODE ON · pick co-winners with 6-0 · ↑ commits · ↓ cancels');
      return render();
    }
    if (scatter) return step(0, -1);
    return move(-1);
  }, 'item');
  define('down', () => {
    if (compete) {
      if (tieMode) { tieMode = false; tieSel = new Set(); hud('tie mode cancelled'); return render(); }
      nextBout(); hud('skipped'); return render();
    }
    if (scatter) return step(0, 1);
    return move(1);
  });
  define('left', () => {
    if (compete) return;
    if (scatter) return step(-1, 0);
    di = cycle(di, -1); setFocusIndex(0); render();
  }, 'dimension');
  define('right', () => {
    if (compete) return;
    if (scatter) return step(1, 0);
    di = cycle(di, 1); setFocusIndex(0); render();
  });
  define('x-next', () => { if (scatter && !compete) { di = cycle(di, 1); render(); } }, 'x dim');
  define('x-prev', () => { if (scatter && !compete) { di = cycle(di, -1); render(); } });
  define('y-next', () => { if (scatter && !compete) { dj = cycle(dj, 1); render(); } }, 'y dim');
  define('y-prev', () => { if (scatter && !compete) { dj = cycle(dj, -1); render(); } });
  define('page-down', () => page(1), 'page');
  define('page-up', () => page(-1));
  define('home', () => { if (!compete) { setFocusIndex(0); render(); } }, 'first');
  define('end', () => { if (!compete) { setFocusIndex(visible().length - 1); render(); } }, 'last');
  for (let n = 1; n <= 5; n++) define(`play:${n}`, () => play(n), n === 1 ? 'play 1-5' : ' ');
  define('stop', () => { stop(); hud('stopped'); }, 'stop');
  define('nudge-up', () => rate(+1, true), 'rate ±25');
  define('nudge-down', () => rate(-1, true));
  define('unrate', clearRating, 'unrate');
  for (const [k, v] of Object.entries(SET_RATING)) define(`rate:${v}`, () => rate(v, false), k === '!' ? 'rate 1300-1700' : ' ');
  define('min', () => cutAt('min'), 'min here');
  define('max', () => cutAt('max'), 'max here');
  define('type', typedThreshold, 'type threshold');
  define('clear-dim', clearDim, 'clear dim');
  define('clear-all', clearAll, 'clear all');
  define('keep', () => mark('keep'), 'keep');
  define('cut', () => (compete ? allWeak() : mark('cut')), 'cut');
  define('promote', () => mark('promote'), 'promote');
  define('reverse', () => { if (!compete) { desc = !desc; hud('sort reversed'); render(); } }, 'reverse');
  define('gates', () => {
    if (compete) return;
    gatesOn = !gatesOn; hud(`gates ${gatesOn ? 'on' : 'off'}`); render();
  }, 'gates');
  define('filters', () => {
    if (compete) return;
    filtersOn = !filtersOn; hud(`filters ${filtersOn ? 'on' : 'off'}`); render();
  }, 'filters');
  define('compete', startCompete, 'compete');
  define('view', () => {
    if (leaveCompete()) return;
    scatter = !scatter; hud(scatter ? 'scatter' : 'list'); render();
  }, 'list/scatter');
  define('leave', leaveCompete);
  for (let n = 6; n <= 9; n++) define(`crown:${n}`, () => crown(n - 6), n === 6 ? 'crown 6-0' : ' ');
  define('finish', finish, 'finish');

  const keys = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    '.': 'x-next', ',': 'x-prev', "'": 'y-next', ';': 'y-prev',
    PageDown: 'page-down', PageUp: 'page-up', Home: 'home', End: 'end',
    ' ': 'stop', ']': 'nudge-up', '[': 'nudge-down', '\\': 'unrate',
    '>': 'min', '<': 'max', '=': 'type', 0: 'clear-dim', '-': 'clear-all',
    k: 'keep', x: 'cut', p: 'promote', s: 'reverse', g: 'gates', f: 'filters', r: 'compete', v: 'view',
    Escape: 'leave', u: 'undo', Enter: 'finish',
  };
  for (let n = 1; n <= 5; n++) keys[String(n)] = `play:${n}`;
  for (const [k, v] of Object.entries(SET_RATING)) keys[k] = `rate:${v}`;
  for (let n = 6; n <= 9; n++) keys[String(n)] = `crown:${n}`;
  actions.bind(keys);

  render();
  window.addEventListener('resize', () => { if (scatter) render(); });
  return { current: () => cur(), render };
}
