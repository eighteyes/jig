// duel.mjs — best-of-N ELO ranking: crown the best of a few contenders, round after round.
// Responsibilities:
// - read contenders (items outside `## Votes`) with rating, wins, losses, ties, comparisons and media fields
// - pick each round: per_round alive contenders with the fewest comparisons, ties broken by a seeded RNG
// - keys: 1..N play contender N; Shift+1..N crown N; ArrowUp tie mode (Shift+digits mark co-winners,
//   ArrowUp again commits); ArrowDown skips the round or cancels a mode; x eliminate mode (Shift+digits
//   mark, x again commits); j/k focus a card; u undo; Enter finish
// - update ratings (ELO, win_k for the winner, loss_k for each loser), fields and the `## Votes` log
// - show live standings below the round, rating descending
// - summary(jig): { ranking, ratings, votes, eliminated }
//
// File:
//   ---
//   jig: duel
//   per_round: 3        # 2..5
//   win_k: 16
//   loss_k: 48
//   seed: 1
//   ---
//   - take A
//     rating:: 1532
//     wins:: 3
//     audio:: a.wav
//   - take B
//   ## Votes
//   - best: take A over take B, take C
//
// Media paths resolve through mediaUrl(): the host serves files beside the jig at /media/<path>.

import { el, css, badges, keepVisible, mediaUrl } from '../web/ui.mjs';
import { fieldList, fieldNumber, setField, newSection, newItem } from '../web/format.mjs';

const ELIMINATED = 'eliminated';
const BASE = 1500;
const MEDIA = ['audio', 'video', 'img'];
// Shift+1..5 on a US layout.
const SHIFTED = ['!', '@', '#', '$', '%'];
const FIELDS = ['rating', 'wins', 'losses', 'ties', 'comparisons'];

const isVotes = (s) => /^votes$/i.test(s.heading ?? '');
const contenders = (jig) => jig.sections.filter((s) => !isVotes(s)).flatMap((s) => s.items);
const votesSection = (jig) => jig.sections.find(isVotes) ?? null;
const eliminated = (it) => it.label === ELIMINATED;
const rating = (it) => fieldNumber(it, 'rating') ?? BASE;
const count = (it, key) => fieldNumber(it, key) ?? 0;
const round2 = (n) => Math.round(n * 100) / 100;

const num = (v, d) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const config = (meta) => ({
  perRound: Math.min(5, Math.max(2, Math.round(num(meta?.per_round, 3)))),
  winK: num(meta?.win_k, 16),
  lossK: num(meta?.loss_k, 48),
  seed: num(meta?.seed, 1),
});

/** Small seeded RNG (mulberry32): same seed, same sequence. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alive contenders, rating descending (stable on file order). */
const standings = (jig) => contenders(jig).filter((it) => !eliminated(it)).sort((a, b) => rating(b) - rating(a));

export function summary(jig) {
  const all = contenders(jig);
  const ratings = {};
  for (const it of all) ratings[it.text] = rating(it);
  return {
    ranking: standings(jig).map((it) => it.text),
    ratings,
    votes: (votesSection(jig)?.items ?? []).map((it) => it.text),
    eliminated: all.filter(eliminated).map((it) => it.text),
  };
}

export function mount(root, ctx) {
  const { jig, actions } = ctx;
  const cfg = config(jig.meta);
  const rng = makeRng(cfg.seed);
  let group = [];
  let focus = 0;
  let mode = null;            // null | 'tie' | 'elim'
  let marks = new Set();      // group slots marked in a mode
  const clip = new Map();     // item -> next clip index to play

  css('duel', `
    .dl-banner { min-height: 1.5em; margin-bottom: 8px; color: var(--dim); font-size: 13px; }
    .dl-banner.mode { color: var(--accent); }
    .dl-round { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--gap); margin-bottom: 20px; }
    .dl-card { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--r); padding: 10px 12px; min-width: 0; cursor: pointer; }
    .dl-card.active { border-color: var(--accent); background: var(--raised); }
    .dl-card.marked { box-shadow: 0 0 0 2px var(--good); }
    .dl-round.elim .dl-card.marked { box-shadow: 0 0 0 2px var(--bad); }
    .dl-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }
    .dl-n { font: 600 12px var(--mono); background: var(--bg); border: 1px solid var(--edge); border-radius: 4px; padding: 0 6px; }
    .dl-name { font-weight: 600; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .dl-stat { color: var(--dim); font: 12px var(--mono); margin-bottom: 6px; }
    .dl-card audio { width: 100%; height: 32px; display: block; margin-top: 4px; }
    .dl-card img, .dl-card video { max-width: 100%; max-height: 200px; display: block; border-radius: 4px; margin-top: 4px; }
    .dl-hint { color: var(--dim); font-size: 12px; margin-top: 6px; }
    .dl-empty { color: var(--dim); padding: 20px 0; }
    .dl-stand { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--edge); }
    .dl-stand li { display: grid; grid-template-columns: 2.5em 1fr 5em 6em; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--edge); font-size: 14px; }
    .dl-stand li .pos, .dl-stand li .rate, .dl-stand li .rec { font-family: var(--mono); color: var(--dim); }
    .dl-stand li .rate { color: var(--ink); text-align: right; }
    .dl-stand li.in-round .nm { color: var(--accent); }
    .dl-stand li.out { opacity: .5; }
    .dl-stand li.out .nm { text-decoration: line-through; }
  `);

  const banner = el('div', 'dl-banner');
  const roundBox = el('div', 'dl-round');
  const standBox = el('div', 'dl-standings');
  root.replaceChildren(banner, roundBox, el('h2', null, 'Standings'), standBox);

  /** The next group: fewest comparisons first, ties broken by the seeded RNG, then shuffled for display. */
  function pick() {
    const alive = contenders(jig).filter((it) => !eliminated(it));
    const keyed = alive.map((it) => ({ it, c: count(it, 'comparisons'), r: rng() }));
    keyed.sort((a, b) => a.c - b.c || a.r - b.r);
    const chosen = keyed.slice(0, cfg.perRound).map((k) => k.it);
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
    }
    return chosen;
  }

  function nextRound() {
    group = pick();
    focus = 0;
    mode = null;
    marks = new Set();
  }

  function media(it) {
    for (const kind of MEDIA) {
      const list = fieldList(it, kind);
      if (list.length) return { kind, list };
    }
    return { kind: null, list: [] };
  }

  function card(it, slot) {
    const cls = ['dl-card'];
    if (slot === focus) cls.push('active');
    if (marks.has(slot)) cls.push('marked');
    const c = el('div', cls.join(' '));
    c.dataset.slot = String(slot + 1);
    const head = el('div', 'dl-head');
    head.append(el('span', 'dl-n', String(slot + 1)), el('span', 'dl-name', it.text));
    c.append(head);
    c.append(el('div', 'dl-stat', `${Math.round(rating(it))} · ${count(it, 'wins')}W ${count(it, 'losses')}L · ${count(it, 'comparisons')} cmp`));
    const m = media(it);
    if (m.kind === 'img') {
      for (const src of m.list) { const im = el('img'); im.src = mediaUrl(src); im.alt = src; c.append(im); }
    } else if (m.kind) {
      for (const src of m.list) {
        const a = el(m.kind);
        a.controls = true;
        a.preload = 'none';
        a.src = mediaUrl(src);
        c.append(a);
      }
    }
    if (it.note.length) c.append(el('div', 'dl-hint', it.note.join('\n')));
    c.append(...badges(it));
    c.addEventListener('click', () => { focus = slot; render(); });
    return c;
  }

  function render() {
    const alive = contenders(jig).filter((it) => !eliminated(it));
    focus = Math.min(Math.max(focus, 0), Math.max(group.length - 1, 0));
    banner.className = `dl-banner${mode ? ' mode' : ''}`;
    if (mode === 'tie') banner.textContent = `tie mode: Shift+1..${group.length} mark co-winners (${marks.size} marked), ↑ commit, ↓ cancel`;
    else if (mode === 'elim') banner.textContent = `eliminate mode: Shift+1..${group.length} mark (${marks.size} marked), x commit, ↓ cancel`;
    else if (alive.length < 2) banner.textContent = alive.length ? 'Only one contender left. Press Enter to finish.' : 'Every contender is eliminated. Press Enter to finish.';
    else banner.textContent = `${votesSection(jig)?.items.length ?? 0} votes · Shift+N crown the best of ${group.length}`;
    roundBox.className = `dl-round${mode === 'elim' ? ' elim' : ''}`;
    roundBox.replaceChildren(...(alive.length < 2 ? [el('div', 'dl-empty', 'No round to play.')] : group.map(card)));

    const rows = [...standings(jig), ...contenders(jig).filter(eliminated)];
    const ul = el('ul', 'dl-stand');
    rows.forEach((it, i) => {
      const out = eliminated(it);
      const li = el('li', `${out ? 'out' : ''}${group.includes(it) && alive.length >= 2 ? ' in-round' : ''}`.trim());
      li.append(el('span', 'pos', out ? '–' : String(i + 1)), el('span', 'nm', it.text), el('span', 'rate', String(Math.round(rating(it)))), el('span', 'rec', `${count(it, 'wins')}W ${count(it, 'losses')}L`));
      ul.append(li);
    });
    standBox.replaceChildren(ul);
    keepVisible(roundBox.children[focus]);
  }

  // ---- state snapshots for undo ----

  function snapshot() {
    const votes = votesSection(jig);
    return {
      items: contenders(jig).map((it) => ({ it, label: it.label, f: Object.fromEntries(FIELDS.map((k) => [k, it.fields[k]])) })),
      votes: votes ? votes.items.length : 0,
      hadVotes: Boolean(votes),
      group: [...group],
      focus,
    };
  }

  function restore(s) {
    for (const { it, label, f } of s.items) {
      it.label = label;
      for (const k of FIELDS) { if (f[k] === undefined) delete it.fields[k]; else it.fields[k] = f[k]; }
    }
    const votes = votesSection(jig);
    if (votes) {
      votes.items.length = s.votes;
      if (!s.hadVotes) jig.sections.splice(jig.sections.indexOf(votes), 1);
    }
    group = s.group;
    focus = s.focus;
    mode = null;
    marks = new Set();
  }

  function addVote(text) {
    let sec = votesSection(jig);
    if (!sec) { sec = newSection('Votes'); jig.sections.push(sec); }
    sec.items.push(newItem(text));
  }

  /** Run a state change as one undoable step: snapshot, mutate, next round, save. */
  function step(mutate) {
    const before = snapshot();
    mutate();
    nextRound();
    render();
    ctx.save();
    return () => { restore(before); render(); ctx.save(); };
  }

  // ---- ELO ----

  const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

  /** sa = score for a (1 win, 0 loss, .5 tie). Winner's move scales by win_k, loser's by loss_k. */
  function pair(a, b, sa) {
    const ea = expected(rating(a), rating(b));
    const kA = sa > 0.5 ? cfg.winK : sa < 0.5 ? cfg.lossK : (cfg.winK + cfg.lossK) / 2;
    const kB = sa < 0.5 ? cfg.winK : sa > 0.5 ? cfg.lossK : (cfg.winK + cfg.lossK) / 2;
    const ra = rating(a) + kA * (sa - ea);
    const rb = rating(b) + kB * ((1 - sa) - (1 - ea));
    setField(a, 'rating', round2(ra));
    setField(b, 'rating', round2(rb));
    bump(a, 'comparisons');
    bump(b, 'comparisons');
  }

  const bump = (it, key) => setField(it, key, count(it, key) + 1);
  const names = (list) => list.map((x) => x.text).join(', ');

  function crown(slot) {
    const winner = group[slot];
    if (!winner || group.length < 2) return;
    return step(() => {
      const losers = group.filter((_, s) => s !== slot);
      bump(winner, 'wins');
      for (const l of losers) { pair(winner, l, 1); bump(l, 'losses'); }
      addVote(`best: ${winner.text} over ${names(losers)}`);
    });
  }

  function commitTie() {
    const slots = [...marks].sort((a, b) => a - b);
    if (!slots.length) { mode = null; render(); return; }
    return step(() => {
      const winners = slots.map((s) => group[s]);
      const losers = group.filter((_, s) => !marks.has(s));
      for (const w of winners) { bump(w, 'wins'); for (const l of losers) pair(w, l, 1); }
      for (const l of losers) bump(l, 'losses');
      for (let a = 0; a < winners.length; a++) {
        for (let b = a + 1; b < winners.length; b++) { pair(winners[a], winners[b], 0.5); bump(winners[a], 'ties'); bump(winners[b], 'ties'); }
      }
      addVote(`tie-best: ${names(winners)}${losers.length ? ` over ${names(losers)}` : ''}`);
    });
  }

  function commitElim() {
    const slots = [...marks].sort((a, b) => a - b);
    if (!slots.length) { mode = null; render(); return; }
    return step(() => {
      const doomed = slots.map((s) => group[s]);
      for (const it of doomed) it.label = ELIMINATED;
      addVote(`eliminate: ${names(doomed)}`);
    });
  }

  function skip() {
    if (group.length < 2) return;
    const before = group, at = focus;
    nextRound();
    render();
    return () => { group = before; focus = at; mode = null; marks = new Set(); render(); };
  }

  // ---- keys ----

  function shiftN(slot) {
    if (slot >= group.length) return;
    if (mode) {
      if (marks.has(slot)) marks.delete(slot); else marks.add(slot);
      render();
      return;
    }
    return crown(slot);
  }

  function play(slot) {
    const it = group[slot];
    if (!it) return;
    const m = media(it);
    if (!m.kind || m.kind === 'img') return;
    const k = clip.get(it) ?? 0;
    clip.set(it, (k + 1) % m.list.length);
    for (const x of root.querySelectorAll('audio, video')) x.pause();
    const node = roundBox.children[slot]?.querySelectorAll(m.kind)[k];
    if (!node) return;
    try { node.currentTime = 0; } catch { /* not loaded yet */ }
    const p = node.play();
    if (p && p.catch) p.catch(() => {});   // playback never blocks a vote
  }

  actions.define('down', () => { focus++; render(); }, 'card');
  actions.define('up', () => { focus--; render(); });
  for (let n = 1; n <= 5; n++) {
    // Only key 1 carries the legend text; a space title keeps keys 2..5 from showing their action names.
    actions.define(`play:${n}`, () => play(n - 1), n === 1 ? 'play 1-5' : ' ');
    actions.define(`pick:${n}`, () => shiftN(n - 1), n === 1 ? 'crown / mark 1-5' : ' ');
  }
  actions.define('tie', () => {
    if (mode === 'tie') return commitTie();
    if (mode === null && group.length >= 2) { mode = 'tie'; marks = new Set(); render(); }
  }, 'tie');
  actions.define('skip', () => {
    if (mode) { mode = null; marks = new Set(); render(); return; }
    return skip();
  }, 'skip / cancel');
  actions.define('elim', () => {
    if (mode === 'elim') return commitElim();
    if (mode === null && group.length >= 2) { mode = 'elim'; marks = new Set(); render(); }
  }, 'eliminate');
  actions.define('finish', () => ctx.finish());

  const keys = { j: 'down', k: 'up', ArrowUp: 'tie', ArrowDown: 'skip', x: 'elim', u: 'undo', Enter: 'finish' };
  for (let n = 1; n <= 5; n++) { keys[String(n)] = `play:${n}`; keys[SHIFTED[n - 1]] = `pick:${n}`; }
  actions.bind(keys);

  nextRound();
  ctx.legend?.();
  render();
  return { current: () => group[focus] ?? null, render };
}
