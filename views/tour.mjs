// tour.mjs — grand tour of an n-dimensional point set, projected to a 2-D cloud.
// Responsibilities:
// - points are the items before `## Links`; meta.dims names numeric fields on each (missing = 0)
// - rotate a 2-plane through hyperspace on a canvas: interpolate between random planes, pull toward
//   a dimension, ride named views (meta.projections), hill-climb a clumpy plane (projection pursuit)
// - a seeded RNG (meta.seed, default 1) makes tours and seeks repeatable; one frame draws on mount
// - dispose with keys: keep/cut (item label), name a projection (meta.projections), link two points
//   (`- A -> B` under ## Links), push/pop a walk (## Walk); every disposition undoes with u
// - pause the animation while the tab is hidden, when frozen, and once finished or unmounted
// - summary(jig): { kept, cut, projections, links: [{from, to, note}], walk, dims }
//
// File:
//   ---
//   jig: tour
//   dims: [speed, cost, risk, fit]      # or [{key: speed, label: Speed}]
//   scale: center                       # center | z
//   seed: 1
//   projections: {fast-cheap: {speed: {u: 1, v: 0}, cost: {u: 0, v: 1}}}
//   ---
//   - option A
//     speed:: 3.2
//     tags:: infra
//   - [keep] option B
//   ## Links
//   - option A -> option B
//     note:: same vendor
//   ## Walk
//   - option A

import { el, css, badges } from '../web/ui.mjs';
import { newSection, newItem, fieldList, fieldNumber } from '../web/format.mjs';

const LINKS = /^links$/i;
const WALK = /^walk$/i;
const NON_DIM = new Set(['tags', 'note', 'escalate']);
const RESTARTS = 5;
const TAU = Math.PI * 2;

const sectionOf = (jig, re) => jig.sections.find((s) => s.heading && re.test(s.heading)) ?? null;

/** Points: every item outside the Links and Walk sections. */
export function pointsOf(jig) {
  return jig.sections.filter((s) => !(s.heading && (LINKS.test(s.heading) || WALK.test(s.heading)))).flatMap((s) => s.items);
}

/** Dimensions as [{key, label}]: from meta.dims, else the numeric field keys the points carry. */
export function dimsOf(jig, pts = pointsOf(jig)) {
  const m = jig.meta?.dims;
  if (Array.isArray(m) && m.length) {
    return m.map((d) => (d && typeof d === 'object' ? { key: String(d.key), label: String(d.label ?? d.key) } : { key: String(d), label: String(d) }));
  }
  const keys = [];
  for (const p of pts) for (const k of Object.keys(p.fields)) if (!NON_DIM.has(k) && !keys.includes(k) && fieldNumber(p, k) !== null) keys.push(k);
  return keys.map((k) => ({ key: k, label: k }));
}

function linksOf(jig) {
  const sec = sectionOf(jig, LINKS);
  return (sec?.items ?? []).map((it) => {
    const at = it.text.indexOf(' -> ');
    return { from: at < 0 ? it.text : it.text.slice(0, at), to: at < 0 ? '' : it.text.slice(at + 4), note: it.fields.note ?? null };
  });
}

export function summary(jig) {
  const pts = pointsOf(jig);
  return {
    kept: pts.filter((p) => p.label === 'keep').map((p) => p.text),
    cut: pts.filter((p) => p.label === 'cut').map((p) => p.text),
    projections: jig.meta?.projections ?? {},
    links: linksOf(jig),
    walk: (sectionOf(jig, WALK)?.items ?? []).map((it) => it.text),
    dims: dimsOf(jig, pts).map((d) => d.key),
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const P = pointsOf(jig);
  const dims = dimsOf(jig, P);
  const D = dims.length, N = P.length;
  const seed = Number(jig.meta?.seed);
  const rng = mulberry32(Number.isFinite(seed) ? seed : 1);

  css('tour', `
    .tr { display: flex; gap: var(--gap); align-items: stretch; }
    .tr-field { position: relative; flex: 1; min-width: 0; height: 62vh; min-height: 340px; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); overflow: hidden; }
    .tr-field canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
    .tr-hud { position: absolute; left: 10px; bottom: 8px; font: 12px var(--mono); color: var(--dim); pointer-events: none; }
    .tr-hud b { color: var(--accent); font-weight: 400; }
    .tr-banner { position: absolute; left: 10px; top: 8px; font: 12px var(--mono); color: var(--info); pointer-events: none; }
    .tr-side { width: 290px; flex: none; background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px 12px; overflow-y: auto; max-height: 62vh; }
    .tr-side h2 { margin: 12px 0 4px; font-size: 11px; }
    .tr-side h2:first-child { margin-top: 0; }
    .tr-name { font-weight: 600; overflow-wrap: anywhere; }
    .tr-row { display: flex; align-items: center; gap: 6px; font: 12px var(--mono); color: var(--dim); padding: 1px 0; }
    .tr-row .k { width: 2ch; text-align: right; }
    .tr-row .l { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tr-row.hot { color: var(--ink); }
    .tr-ax { width: 44px; height: 8px; position: relative; background: var(--raised); border-radius: 2px; }
    .tr-ax i { position: absolute; top: 0; height: 8px; border-radius: 2px; }
    .tr-ax b { position: absolute; left: 50%; top: -1px; width: 1px; height: 10px; background: var(--edge); }
    .tr-list { font-size: 13px; color: var(--dim); }
    .tr-list div { padding: 1px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tr-label { display: inline-block; font: 12px var(--mono); border: 1px solid var(--edge); border-radius: 4px; padding: 0 6px; margin-left: 6px; }
    .tr-label.keep { color: var(--good); border-color: var(--good); }
    .tr-label.cut { color: var(--bad); border-color: var(--bad); }
    .tr-warn { color: var(--accent); margin: 12px 0; min-height: 1.4em; }
    .tr-bar { position: fixed; bottom: 38px; left: 0; right: 0; background: var(--raised); border-top: 1px solid var(--accent); padding: 8px 20px; display: flex; gap: 12px; align-items: center; }
    .tr-bar[hidden] { display: none; }
    .tr-bar span { color: var(--dim); font-size: 13px; white-space: nowrap; }
    .tr-bar input { flex: 1; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--edge); border-radius: var(--r); padding: 4px 8px; }
  `);

  const field = el('div', 'tr-field');
  const cv = el('canvas');
  const hud = el('div', 'tr-hud');
  const banner = el('div', 'tr-banner');
  field.append(cv, banner, hud);
  const side = el('div', 'tr-side');
  const warn = el('div', 'tr-warn');
  const bar = el('div', 'tr-bar');
  const barLabel = el('span');
  const input = el('input');
  bar.append(barLabel, input);
  bar.hidden = true;
  root.replaceChildren(el('div', 'tr', null), warn, bar);
  root.firstChild.append(field, side);

  if (!D || !N) {
    field.replaceChildren(el('div', 'tr-banner', 'tour needs at least one point and one dimension (meta.dims or numeric fields)'));
    return { current: () => null, render() {} };
  }

  // ---------- scaled matrix ----------
  let scaleMode = jig.meta?.scale === 'z' ? 'z' : 'center';
  let X = [], RADIUS = 1;
  function buildX() {
    X = P.map(() => new Float64Array(D));
    dims.forEach((d, j) => {
      const col = P.map((p) => fieldNumber(p, d.key) ?? 0);
      const mu = col.reduce((a, b) => a + b, 0) / N;
      const sd = scaleMode === 'z' && N > 1 ? Math.sqrt(col.reduce((a, b) => a + (b - mu) ** 2, 0) / N) || 1 : 1;
      col.forEach((v, i) => { X[i][j] = (v - mu) / sd; });
    });
    RADIUS = 1e-9;
    for (const r of X) { let s = 0; for (let j = 0; j < D; j++) s += r[j] * r[j]; RADIUS = Math.max(RADIUS, Math.sqrt(s)); }
  }
  buildX();

  // ---------- linear algebra ----------
  const dot = (a, b) => { let s = 0; for (let j = 0; j < D; j++) s += a[j] * b[j]; return s; };
  const norm = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = norm(a) || 1; const o = new Float64Array(D); for (let j = 0; j < D; j++) o[j] = a[j] / n; return o; };
  const randVec = () => { const o = new Float64Array(D); for (let j = 0; j < D; j++) o[j] = rng() * 2 - 1; return unit(o); };
  const orth = (v, u) => { const c = dot(v, u); const o = new Float64Array(D); for (let j = 0; j < D; j++) o[j] = v[j] - c * u[j]; return o; };
  function orthoPair(u, v) {
    const U = unit(u);
    let W = orth(v, U);
    if (norm(W) < 1e-8) W = orth(randVec(), U);
    return [U, unit(W)];
  }
  function lerpBasis(a, b, t) {
    const u = new Float64Array(D), v = new Float64Array(D);
    for (let j = 0; j < D; j++) { u[j] = a[0][j] * (1 - t) + b[0][j] * t; v[j] = a[1][j] * (1 - t) + b[1][j] * t; }
    return orthoPair(u, v);
  }
  const basisAngle = (a, b) => Math.acos(Math.min(1, Math.abs(dot(a[0], b[0])))) + Math.acos(Math.min(1, Math.abs(dot(a[1], b[1]))));
  const copy = (b) => [b[0].slice(), b[1].slice()];

  // covariance + power iteration with deflation: top two principal axes
  function pca() {
    const C = Array.from({ length: D }, () => new Float64Array(D));
    for (let i = 0; i < N; i++) for (let a = 0; a < D; a++) { const xa = X[i][a]; for (let b = 0; b < D; b++) C[a][b] += xa * X[i][b] / N; }
    const mul = (v) => { const o = new Float64Array(D); for (let a = 0; a < D; a++) { let s = 0; for (let b = 0; b < D; b++) s += C[a][b] * v[b]; o[a] = s; } return o; };
    const top = () => { let v = randVec(); for (let k = 0; k < 300; k++) { const w = mul(v); if (norm(w) < 1e-12) return randVec(); v = unit(w); } return v; };
    const e1 = top();
    const l1 = dot(e1, mul(e1));
    for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) C[a][b] -= l1 * e1[a] * e1[b];
    return [e1, unit(orth(top(), e1))];
  }

  /* Structure index for projection pursuit: NEGATIVE kurtosis of the sphered projected coordinates.
     Separated clusters leave mass away from the centre in several lumps (sub-Gaussian); high
     kurtosis means a tight core with outliers. The original board chose it by bake-off. O(N). */
  function structureIndex(b) {
    const xs = new Float64Array(N), ys = new Float64Array(N);
    let sx = 0, sy = 0;
    for (let i = 0; i < N; i++) { xs[i] = dot(X[i], b[0]); ys[i] = dot(X[i], b[1]); sx += xs[i]; sy += ys[i]; }
    const mx = sx / N, my = sy / N;
    let vx = 0, vy = 0;
    for (let i = 0; i < N; i++) { vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
    const sdx = Math.sqrt(vx / N) || 1, sdy = Math.sqrt(vy / N) || 1;
    let kx = 0, ky = 0;
    for (let i = 0; i < N; i++) { kx += ((xs[i] - mx) / sdx) ** 4; ky += ((ys[i] - my) / sdy) ** 4; }
    return -((kx + ky) / N);
  }

  // ---------- lens state (never saved) ----------
  let principal = D >= 2 ? pca() : [unit(randVec()), unit(randVec())];
  let basis = copy(principal);
  let pursuing = false, pursuitStep = 0.35, pursuitBest = -Infinity, pursuitLeft = 0, pursuitTop = null;
  let target = null, hold = false;
  let playing = D > 2;
  let speed = 1;
  let filterTag = null;
  let note = '';
  let focus = 0;
  let linkFrom = null;
  let viewIdx = 0;
  let armed = false;
  let finished = false;

  function viewList() {
    const out = [{ name: 'principal plane', basis: copy(principal) }];
    for (const [name, w] of Object.entries(jig.meta?.projections ?? {})) {
      const u = new Float64Array(D), v = new Float64Array(D);
      dims.forEach((d, j) => { u[j] = Number(w?.[d.key]?.u) || 0; v[j] = Number(w?.[d.key]?.v) || 0; });
      if (norm(u) > 0) out.push({ name, basis: orthoPair(u, v) });
    }
    return out;
  }
  let views = viewList();

  const newTarget = () => { target = orthoPair(randVec(), randVec()); hold = false; };
  function pullToDim(j) {
    const e = new Float64Array(D);
    e[j] = 1;
    target = orthoPair(e, basis[1]);
    hold = true; playing = true; pursuing = false;
    note = `pulling toward ${dims[j].label}`;
  }
  function snapView(n) {
    views = viewList();
    viewIdx = ((n % views.length) + views.length) % views.length;
    target = copy(views[viewIdx].basis);
    hold = true; playing = true; pursuing = false;
    note = `view: ${views[viewIdx].name}`;
  }

  // ---------- canvas ----------
  const g = cv.getContext('2d');
  let W = 600, H = 400;
  const tag = (p) => fieldList(p, 'tags');
  const visible = (p) => !filterTag || tag(p).includes(filterTag);
  const sizeCanvas = () => {
    const r = field.getBoundingClientRect();
    W = r.width || 600; H = r.height || 400;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const screenPos = (i) => {
    const s = Math.min(W, H) * 0.42 / RADIUS;
    return [W / 2 + dot(X[i], basis[0]) * s, H / 2 - dot(X[i], basis[1]) * s];
  };
  const tone = (name, fallback) => getComputedStyle(root).getPropertyValue(name).trim() || fallback;

  function draw() {
    const ink = tone('--ink', '#d8dce3'), accent = tone('--accent', '#d9a54a'), good = tone('--good', '#7fb685');
    const bad = tone('--bad', '#d4776b'), info = tone('--info', '#7aa2c9');
    g.clearRect(0, 0, W, H);
    const pos = P.map((_, i) => screenPos(i));
    const at = (name) => P.findIndex((p) => p.text === name);
    const walk = (sectionOf(jig, WALK)?.items ?? []).map((it) => at(it.text)).filter((i) => i >= 0);
    if (walk.length > 1) {
      g.strokeStyle = info; g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath();
      walk.forEach((i, n) => (n ? g.lineTo(...pos[i]) : g.moveTo(...pos[i])));
      g.stroke(); g.globalAlpha = 1;
    }
    g.strokeStyle = info; g.globalAlpha = 0.45; g.lineWidth = 1;
    for (const l of linksOf(jig)) {
      const a = at(l.from), b = at(l.to);
      if (a < 0 || b < 0) continue;
      g.beginPath(); g.moveTo(...pos[a]); g.lineTo(...pos[b]); g.stroke();
    }
    g.globalAlpha = 1;
    P.forEach((p, i) => {
      if (!visible(p)) return;
      const [x, y] = pos[i];
      g.beginPath();
      g.arc(x, y, p.label ? 4 : 3, 0, TAU);
      g.globalAlpha = p.label === 'cut' ? 0.35 : p.label === 'keep' ? 1 : 0.6;
      g.fillStyle = p.label === 'cut' ? bad : p.label === 'keep' ? good : ink;
      g.fill();
      g.globalAlpha = 1;
    });
    const f = P[focus];
    if (f && visible(f)) {
      const [x, y] = pos[focus];
      g.strokeStyle = accent; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.stroke();
      g.fillStyle = accent; g.font = '12px ui-monospace, Menlo, monospace';
      g.fillText(f.text, x + 12, y + 4);
    }
    if (linkFrom !== null) {
      const [x, y] = pos[linkFrom];
      g.strokeStyle = info; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, 11, 0, TAU); g.stroke(); g.setLineDash([]);
    }
  }

  // ---------- animation loop ----------
  let raf = 0, last = 0, stopped = false;
  const alive = () => !stopped && !finished && root.isConnected && cv.isConnected;
  function teardown() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('resize', onResize);
  }
  function wake() {
    if (raf || document.hidden || !(playing || pursuing)) return;
    if (!alive()) { teardown(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function step(dt) {
    if (pursuing) {
      for (let t = 0; t < 12; t++) {
        const pu = new Float64Array(D), pv = new Float64Array(D);
        for (let j = 0; j < D; j++) {
          pu[j] = basis[0][j] + (rng() * 2 - 1) * pursuitStep;
          pv[j] = basis[1][j] + (rng() * 2 - 1) * pursuitStep;
        }
        const cand = orthoPair(pu, pv), c = structureIndex(cand);
        if (c > pursuitBest) { pursuitBest = c; basis = cand; } else pursuitStep *= 0.995;
      }
      if (pursuitStep < 0.02) {
        if (pursuitBest > pursuitTop.clump) pursuitTop = { clump: pursuitBest, basis: copy(basis) };
        pursuitLeft--;
        if (pursuitLeft > 0) {
          basis = orthoPair(randVec(), randVec());
          pursuitStep = 0.35; pursuitBest = structureIndex(basis);
          note = `seeking, restart ${RESTARTS - pursuitLeft + 1}/${RESTARTS}`;
        } else {
          basis = pursuitTop.basis; pursuing = false;
          note = `best of ${RESTARTS}: p to name it`;
        }
        renderSide();
      }
    } else if (playing) {
      if (!target) newTarget();
      basis = lerpBasis(basis, target, Math.min(1, dt * 0.55 * speed));
      if (basisAngle(basis, target) < 0.02) {
        if (hold) { playing = false; hold = false; }
        target = null;
      }
    }
  }
  function frame(now) {
    raf = 0;
    if (!alive()) { teardown(); return; }
    try {
      step(Math.min(0.05, (now - last) / 1000));
      last = now;
      draw();
      renderHud();
    } catch { teardown(); return; }
    wake();
  }
  const onResize = () => { if (alive()) { sizeCanvas(); draw(); } };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', onResize);

  // ---------- panel ----------
  const basisWeights = () => {
    const o = {};
    dims.forEach((d, j) => { o[d.key] = { u: +basis[0][j].toFixed(4), v: +basis[1][j].toFixed(4) }; });
    return o;
  };

  function renderHud() {
    const mode = pursuing ? 'seeking' : playing ? 'touring' : 'frozen';
    hud.replaceChildren();
    hud.append(el('b', null, mode), ` · x${speed.toFixed(2)} · scale:${scaleMode} · clump ${structureIndex(basis).toFixed(2)}`);
    if (note) hud.append(` · ${note}`);
    if (linkFrom !== null) hud.append(` · link armed from ${P[linkFrom].text}: move, press l`);
    const hid = P.filter((p) => !visible(p)).length;
    banner.textContent = hid ? `${hid} hidden by filter: ${filterTag}` : '';
  }

  function list(title, rows) {
    const box = el('div', 'tr-list');
    if (!rows.length) box.append(el('div', null, '-'));
    for (const r of rows) box.append(el('div', null, r));
    return [el('h2', null, title), box];
  }

  function renderSide() {
    const f = P[focus];
    const out = [];
    out.push(el('h2', null, 'focused'));
    const nm = el('div', 'tr-name', f.text);
    if (f.label) nm.append(el('span', `tr-label ${f.label}`, f.label));
    out.push(nm);
    for (const d of dims) {
      const row = el('div', 'tr-row');
      row.append(el('span', 'l', d.label), el('span', null, String(fieldNumber(f, d.key) ?? 0)));
      out.push(row);
    }
    const tg = tag(f);
    out.push(el('div', 'tr-list', tg.length ? `tags: ${tg.join(', ')}` : 'tags: -'));
    out.push(...badges(f));

    out.push(el('h2', null, 'this projection'));
    const order = dims.map((d, j) => ({ d, j, w: Math.hypot(basis[0][j], basis[1][j]) })).sort((a, b) => b.w - a.w);
    for (const { d, j, w } of order) {
      const bar2 = (val, col) => {
        const ax = el('span', 'tr-ax');
        const i = el('i');
        i.style.background = col;
        i.style.width = `${(Math.min(1, Math.abs(val)) * 22).toFixed(1)}px`;
        i.style[val < 0 ? 'right' : 'left'] = '50%';
        ax.append(el('b'), i);
        return ax;
      };
      const row = el('div', `tr-row${w > 0.35 ? ' hot' : ''}`);
      row.append(el('span', 'k', j < 9 ? String(j + 1) : ''), el('span', 'l', d.label), bar2(basis[0][j], tone('--accent', '#d9a54a')), bar2(basis[1][j], tone('--info', '#7aa2c9')));
      out.push(row);
    }
    const named = Object.keys(jig.meta?.projections ?? {});
    out.push(...list(`named (${named.length})`, named));
    const wk = (sectionOf(jig, WALK)?.items ?? []).map((it, n) => `${n + 1}. ${it.text}`);
    out.push(...list(`walk (${wk.length})`, wk));
    const lk = linksOf(jig).map((l) => `${l.from} - ${l.to}`);
    out.push(...list(`links (${lk.length})`, lk));
    side.replaceChildren(...out);
  }

  function render() {
    armed = false;
    warn.textContent = '';
    focus = Math.min(Math.max(focus, 0), N - 1);
    renderSide();
    renderHud();
    draw();
    wake();
  }

  // ---------- dispositions ----------
  const here = () => P[focus] ?? null;

  function mark(label) {
    const it = here();
    if (!it) return;
    const before = it.label;
    it.label = before === label ? null : label;
    render();
    ctx.save();
    return () => { it.label = before; render(); ctx.save(); };
  }

  /** Append an item to a named section, creating it at the end of the file when absent. */
  function appendTo(re, heading, item) {
    let sec = sectionOf(jig, re);
    const created = !sec;
    if (!sec) { sec = newSection(heading); jig.sections.push(sec); }
    sec.items.push(item);
    return () => {
      sec.items.splice(sec.items.indexOf(item), 1);
      if (created && !sec.items.length && jig.sections.includes(sec)) jig.sections.splice(jig.sections.indexOf(sec), 1);
    };
  }

  function link() {
    const f = here();
    if (!f) return;
    if (linkFrom === null) { linkFrom = focus; note = `link from ${f.text}`; render(); return; }
    if (linkFrom === focus) { linkFrom = null; note = 'link cancelled'; render(); return; }
    const item = newItem(`${P[linkFrom].text} -> ${f.text}`);
    const undo = appendTo(LINKS, 'Links', item);
    note = `linked ${P[linkFrom].text} -> ${f.text}`;
    linkFrom = null;
    render();
    ctx.save();
    return () => { undo(); render(); ctx.save(); };
  }

  function pushWalk() {
    const f = here();
    if (!f) return;
    const undo = appendTo(WALK, 'Walk', newItem(f.text));
    render();
    ctx.save();
    return () => { undo(); render(); ctx.save(); };
  }

  function popWalk() {
    const sec = sectionOf(jig, WALK);
    if (!sec || !sec.items.length) return;
    const item = sec.items.pop();
    render();
    ctx.save();
    return () => { sec.items.push(item); render(); ctx.save(); };
  }

  function nameProjection() {
    barLabel.textContent = 'name this projection (what does it separate?)';
    input.value = '';
    bar.hidden = false;
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === 'Escape') { input.blur(); bar.hidden = true; return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const name = input.value.trim();
      input.blur();
      bar.hidden = true;
      if (!name) return;
      const had = Object.prototype.hasOwnProperty.call(jig.meta.projections ?? {}, name);
      const before = had ? jig.meta.projections[name] : undefined;
      const hadMap = jig.meta.projections !== undefined;
      jig.meta.projections = { ...(jig.meta.projections ?? {}), [name]: basisWeights() };
      views = viewList();
      viewIdx = views.findIndex((v) => v.name === name);
      playing = false; target = null; pursuing = false;
      note = `named: ${name}`;
      render();
      ctx.save();
      actions.push(() => {
        const next = { ...jig.meta.projections };
        if (had) next[name] = before; else delete next[name];
        if (hadMap || Object.keys(next).length) jig.meta.projections = next; else delete jig.meta.projections;
        views = viewList();
        viewIdx = 0;
        render();
        ctx.save();
      });
    };
  }

  function stepFocus(dir) {
    const shown = P.map((_, i) => i).filter((i) => visible(P[i])).sort((a, b) => dot(X[a], basis[0]) - dot(X[b], basis[0]));
    if (!shown.length) return;
    const at = shown.indexOf(focus);
    focus = at < 0 ? shown[0] : shown[Math.max(0, Math.min(shown.length - 1, at + dir))];
    render();
  }

  function finish() {
    const waiting = P.filter((p) => !p.label).length;
    if (waiting && !armed) {
      armed = true;
      warn.textContent = `${waiting} point${waiting === 1 ? '' : 's'} not kept or cut. Press Enter again to finish.`;
      return;
    }
    finished = true;
    teardown();
    return ctx.finish();
  }

  // ---------- actions ----------
  actions.define('toggle', () => {
    playing = !playing; pursuing = false; hold = false;
    if (playing && !target) newTarget();
    note = '';
    render();
  }, 'tour/freeze');
  for (let n = 1; n <= Math.min(9, D); n++) actions.define(`pull:${n}`, () => { pullToDim(n - 1); render(); }, `pull to ${dims[n - 1].label}`);
  actions.define('view-next', () => { snapView(viewIdx + 1); render(); }, 'next view');
  actions.define('view-prev', () => { snapView(viewIdx - 1); render(); }, 'prev view');
  actions.define('faster', () => { speed = Math.min(6, speed + 0.25); render(); }, 'speed');
  actions.define('slower', () => { speed = Math.max(0.25, speed - 0.25); render(); }, 'slower');
  actions.define('random', () => { newTarget(); playing = true; pursuing = false; note = ''; render(); }, 'new angle');
  actions.define('seek', () => {
    pursuing = !pursuing;
    if (pursuing) {
      playing = false; target = null; hold = false;
      pursuitStep = 0.35; pursuitBest = structureIndex(basis); pursuitLeft = RESTARTS;
      pursuitTop = { clump: pursuitBest, basis: copy(basis) };
      note = `seeking, restart 1/${RESTARTS}`;
    } else note = 'seek stopped';
    render();
  }, 'seek structure');
  actions.define('scale', () => {
    scaleMode = scaleMode === 'z' ? 'center' : 'z';
    buildX();
    if (D >= 2) principal = pca();
    views = viewList();
    pursuitBest = -Infinity;
    note = `scale: ${scaleMode}`;
    render();
  }, 'scale');
  actions.define('filter', () => {
    const tags = [...new Set(P.flatMap(tag))];
    if (!tags.length) note = 'no tags';
    else { const at = filterTag === null ? -1 : tags.indexOf(filterTag); filterTag = at + 1 >= tags.length ? null : tags[at + 1]; }
    render();
  }, 'tag filter');
  actions.define('up', () => stepFocus(-1), 'point up');
  actions.define('down', () => stepFocus(1), 'point down');
  actions.define('name', nameProjection, 'name view');
  actions.define('link', link, 'link');
  actions.define('walk', pushWalk, 'walk');
  actions.define('unwalk', popWalk, 'unwalk');
  actions.define('keep', () => mark('keep'), 'keep');
  actions.define('cut', () => mark('cut'), 'cut');
  actions.define('finish', finish);

  const keys = {
    ' ': 'toggle', ArrowRight: 'view-next', ArrowLeft: 'view-prev', ']': 'faster', '[': 'slower', r: 'random', o: 'seek',
    s: 'scale', f: 'filter', ArrowUp: 'up', ArrowDown: 'down', p: 'name', l: 'link', w: 'walk', W: 'unwalk',
    k: 'keep', x: 'cut', u: 'undo', Enter: 'finish',
  };
  for (let n = 1; n <= Math.min(9, D); n++) keys[String(n)] = `pull:${n}`;
  actions.bind(keys);

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 14 * 14;
    P.forEach((p, i) => {
      if (!visible(p)) return;
      const [x, y] = screenPos(i);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { focus = best; render(); }
  });

  sizeCanvas();
  render();
  return { current: () => here(), render };
}
