# shape-board template inventory

Source: /Users/god/projects/ai-tooling/skills/shape-development/skills/shape-board/
Templates: 25 .html files read in full (script blocks, keydown, submit, header comments).
Line refs are to the template named in each section. Sizes are `wc -l`.
Not read: SKILL.md, SHAPE-layers.md, SHAPE-primitives.md, SHAPE-vnext.md, make-pair-board.py, test/*, workflows/*.
Excluded: grid-board.html.pre-* (4 backup files, not .html).

Engine files (for the dependency column):
- serve.mjs: one-shot engine. Routes: GET / (template), POST /checkpoint (writes WK_BOARD_OUT, keeps serving), POST /submit (stdout + WK_BOARD_OUT, exits unless WK_BOARD_PERSIST), GET /state and GET|POST /remote (only when WK_BOARD_REMOTE=1), static files under WK_BOARD_STATIC (media, byte-range).
- serve-live.mjs: separate persistent server for board-live.html. Routes: GET /, GET /poll, GET /cost, POST /flush, POST /reconcile, POST /shape, POST /inject, POST /finish. Spawns `claude -p` when WK_BOARD_GEN=claude.
- serve-static.sh: serves one template as a detached static page. Refuses templates with no on-screen result panel.
- page-title.mjs: rewrites <title> from payload head.title (not a template).

---

## 1. board.html (315 lines)

Purpose: round Q&A board over a shape doc; branches expand into a queue.

Input payload (PAYLOAD line 78, sentinel `/*__SHAPE_BOARD_PAYLOAD__*/ null`):
- PAYLOAD.docText: string (122)
- PAYLOAD.batch[]: array (82-87). Per item:
  - q or question: string (83)
  - id: string, optional, synthesized as "q"+index (84)
  - parent: id or null (85)
  - choices[]: {label: string, what_changes?: string} (186-190)
  - anchor: string, optional (125, 138)
- PAYLOAD.head: {title?: string, frontier?: string} (88, 109-112)

Interaction (keydown 235):
- Enter 238-245: arms on first press if open cards remain (armed flag), second press submits.
- ArrowDown 246, ArrowUp 247: move focus over the queue.
- 1-5 253-265: toggle pick for choice index; answering a branch expands it (expandNow).
- x 266-272: expand a branch, or toggle growth request on a leaf (s.mark).
- s 274: skip toggle. e 275: escalate toggle. ? 276: explain toggle. a 277: ask toggle.
- c 278-282: window.prompt custom answer.
- Mouse: none.

Output (submit 285-310; fetch 306-307):
- POST /submit body: {dispositions[], escalated[q], explained[q], asked[q], extended[{branch, q, levels:1}], expanded[id], frontier:{answered, open, latent, total}}
- dispositions[] item shapes (288-302): {q, escalate:true} | {q, explain:true} | {q, ask:true} | {q, custom} | {q, picks[labels], pick_indices[]} | {q, skip:true}. Unconsumed mark on unqueued branch adds extend:1 and branch:id.

Engine: /submit only. No /checkpoint, /remote, /state. No media. No live depth. Static not needed.
Size: 315

---

## 2. board-live.html (441 lines)

Purpose: persistent interview board; generated follow-up questions arrive live from a server.

Input payload (sentinel line 88):
- PAYLOAD.batch[]: same normalization as board.html (92-97): q|question, id, parent. Also choices[]{label, what_changes?}.
- PAYLOAD.docText: string (fallback text, 129)
- PAYLOAD.head (89): title?, frontier?, maxDepth? (default 3, line 101), width? (default = root count, 102), minContext? (default 3, 103), sections?: [string | {key, title?, text?}] (123-125)

Interaction (keydown 335):
- d 337: toggle depth-view (read-only tree dump).
- h 338: hide-subtree, only in depth-view.
- Enter 341: onEnter (407). Arms once if open questions remain, then POST /finish.
- ArrowDown 343, ArrowUp 344: move focus across full list.
- 1-5 347-351: toggle pick.
- x 352: force-deepen this card (genChildren force=true).
- r 353: manual reconcile.
- v 354: veto prompt; adds {q, reason} to vetoes and prunes card.
- s 355: skip. e 356: escalate. ? 357: explain. a 358: ask.
- c 359: custom-answer prompt.
- Mouse: none.

Output (onEnter 407-414; fetch 411-412):
- POST /finish body: {dispositions[], frontier:{answered, open, shown, total}}
- dispositions[] item shapes (393-405): {q, escalate:true} | {q, explain:true} | {q, ask:true} | {q, id, picks[labels], pick_indices[], custom?} | {q, skip:true}

Engine: serve-live.mjs (not serve.mjs). Uses /finish, /poll (434, 1 s), /cost (435, 1 s), /flush (369), /reconcile (201), /shape (380). Live depth: YES, `claude -p` depth generation when WK_BOARD_GEN=claude (server side). No /checkpoint, /remote, /state. No media.
Size: 441

---

## 3. grid-board.html (466 lines)

Purpose: table board, one row per item, one shared answer set as columns; 1-5 picks and advances.

Input payload (sentinel line 103):
- PAYLOAD.head.columns[]: {key, label} (105, max 5 used)
- PAYLOAD.head.meta[]: {key, label} display-only columns (106)
- PAYLOAD.head.multi: bool (108)
- PAYLOAD.head.autoplay: bool (109)
- PAYLOAD.head.flags[]: {key, label, field} (113)
- PAYLOAD.head.fields[]: {key, label, rows?, placeholder?} (118)
- PAYLOAD.head.title, head.frontier (138-139)
- PAYLOAD.batch[]: {label, meta{}?, note?, choice?, choices[]?, audio[]?, anchor?, unusable?, fields{}?} (107, 124-131, 240, 130)
- PAYLOAD.docText (152, 173)

Interaction (keydown 348):
- Field-edit guard 353-357: while a field panel is live, Escape exits, Tab/Shift+Tab cycle fields, everything else ignored.
- space 358: play row audio (cycles clips).
- ArrowDown 359, ArrowUp 360: move row focus.
- Enter 361-366: first press arms if unanswered rows, second submits.
- 1-5 370-374: pick column (e.code Digit or key). Shift+digit adds a column (heldPicks, released by keyup 339-346 which advances).
- 0 376-377: clear row.
- x / Delete / Backspace 378-380: toggle unusable, advance.
- e 381: escalate toggle.
- flag keys 382-401: dynamic from head.flags; toggles flag field; disposes:true answers and advances.
- f 402: open field panel (only when head.fields present).
- c 403: note prompt (window.prompt).
- Textarea listeners 199-200 (input, focus) for field panel. No mouse gestures.

Output (payload() 408-432; submit 445-448 fetch 446; checkpoint 437-443):
- POST /submit body = payload(): {dispositions[], by_choice{key:[labels]}, unanswered[labels], unusable[labels], escalated[labels], focus: number, <flagField>: [labels] per flag}
- dispositions[] item: {label, choice, choice_label, choice_index, choices[keys], choice_labels[], unusable, note, escalate, <flagField>: bool per flag, fields{}? (only when head.fields)}

Engine: /checkpoint (debounced 250 ms, from render()), /submit, /remote (polled every 250 ms, lines 455-461; dispatches queued keys as KeyboardEvent). Remote needs WK_BOARD_REMOTE=1 server-side. No /state. No media in this file's base (audio[] supported, line 240-249, played via <audio> with WK_BOARD_STATIC). Live depth: no.
Size: 466

---

## 4. grid-board-image.html (535 lines)

Purpose: grid-board with still images shown in a side pane; zoom and image cycling.

Input payload: same as grid-board, plus:
- batch[].img[] or batch[].image[] (string or array) (136-137 mediaOf)
- batch[].options[] per-row wording of each column; missing entry = column not offered (386, 484-485)
- head.clipNames[] (320)

Interaction (keydown 414, keyup 408-412):
- Field-edit guard 419-422 as grid-board.
- space 427: toggle zoom (100% natural size).
- ArrowRight 428, ArrowLeft 429: cycle images of current row (lens, no answer change).
- ArrowDown 430, ArrowUp 431: move row focus.
- Enter 432-437: arm then submit.
- 1-5 439-447: pick (guarded by options[] at 386).
- 0: clear row. x / Delete / Backspace: unusable + advance. e: escalate. flags: as grid-board. f: field panel. c: note prompt.
- Mouse: none.

Output: same as grid-board payload(), plus choice_option and choice_options[] when items carry options (484-485).
Submit at 514-517, checkpoint 506-512, pollRemote 521-530.

Engine: /checkpoint, /submit, /remote (same as grid-board). Media: image URLs in <img src> loaded via serve static root (WK_BOARD_STATIC); preloads next row via new Image() (326-332). Live depth: no.
Size: 535

---

## 5. grid-board-video.html (585 lines)

Purpose: grid-board with video or audio clips in a side pane; play/pause, clip cycle, speed.

Input payload: same as grid-board, plus:
- batch[].video[] or batch[].audio[] (string array) (139 mediaOf: video first, else audio)
- head.autoplay: default true here (136; `head.autoplay !== false`)
- head.muted: default true (MUTED, `head.muted !== false`)
- head.clipNames[] (line near 334)

Interaction (keydown 460):
- Field-edit guard 465-469.
- space 471: play/pause (togglePlay).
- ArrowRight 472, ArrowLeft 473: next / previous clip of row.
- ] 474, [ 475: speed step through [0.25, 0.5, 0.75, 1, 1.5, 2].
- ArrowDown 476, ArrowUp 477: move row focus (stopAudio, then render).
- Enter 478-483: arm then submit.
- 1-5 484-492: pick. 0 493: clear. x / Delete / Backspace: unusable. e: escalate. flags: as grid-board. f: field panel. c: note prompt.
- Video element events: 'ended' hands off to next clip (wirePlayer); play/pause repaint.
- Mouse: none.

Output: same as grid-board payload() (inherits from grid-board-image, diff shows identical payload section).
Checkpoint 556-562 (debounced 250 ms), submit 564-567, pollRemote 574-579, setInterval 580.

Engine: /checkpoint, /submit, /remote. Media: <video> src via WK_BOARD_STATIC, muted+loop when one clip. Live depth: no.
Size: 585

---

## 6. tag-board.html (342 lines)

Purpose: rows x unbounded tag vocabulary reached by a leader-key sequence; mint tags mid-pass.

Input payload (sentinel line 74):
- PAYLOAD.head.leader: single char, default 't' (76)
- PAYLOAD.head.advanceOnTag: bool, default true (80)
- PAYLOAD.head.tags[]: {seq: string, label: string} (87)
- PAYLOAD.head.flags[]: {key: string, label: string} (92)
- PAYLOAD.head.meta[]: {key, label} (82)
- PAYLOAD.head.title, head.frontier (107-108)
- PAYLOAD.batch[]: {label, tags[labels]?, flag?: flagKey, unusable?, note?, audio[]?, meta{}?} (96-102, 151-159)

Interaction (keydown 270):
- Escape 272: cancel quasimode.
- While tagging (275): a-z letters feed the sequence (feed 222-231); exactly one match commits.
- space 276: play row audio (playRow 189-204).
- ArrowDown 277, ArrowUp 278: move focus.
- Enter 279-283: arm then submit.
- leader key (default t) 284: enter tag mode, advance on commit.
- shifted leader (T) 287-288: tag mode, cursor held.
- N 289: mint new tag (mint 250-268; checkpoint at 267).
- flag keys 292-297: set/clear verdict; setting advances.
- 0 298: clear row tags, flag, unusable.
- x 299-300: unusable toggle, clears tags/flag, advances.
- e 301: escalate. c 302: note prompt.
- Mouse: none.

Output (payloadOut 309-327; checkpoint 329-332; submit 334-338):
- POST /submit body: {dispositions[], by_tag{label:[labels]}, by_flag{label:[labels]}, unanswered[labels], unusable[labels], escalated[labels], new_tags[{seq, label}]}
- dispositions[] item: {label, tags[labels], tag_labels[labels], flag (key|null), flag_label, unusable, note, escalate}

Engine: /checkpoint (only on mint, line 267 and 329-332), /submit. No /remote. Media: <audio> per clip, played by row (no WK_BOARD_STATIC declared). Live depth: no.
Size: 342

---

## 7. tag-board-video.html (449 lines)

Purpose: tag-board with a video side pane.

Input payload: same as tag-board, plus batch[].video[] or audio[] (mediaOf, line ~109), head.autoplay (default true), head.muted (default true), head.clipNames[].

Interaction (keydown 371):
- Escape 373. Quasimode guard 376 (letters go to sequence while tagging).
- space 379: play/pause. ArrowRight 380, ArrowLeft 381: clip step. ] 382, [ 383: speed.
- ArrowDown 384, ArrowUp 385: move focus.
- Enter 386-390: arm then submit.
- leader 391, shifted leader 394-395, then N, flags, 0, x, e, c as in tag-board (the diff vs tag-board.html changes only the lines listed here).
- Mouse: none.

Output: same payloadOut() shape as tag-board (function ends at 434).
Checkpoint 436-439 (only on mint, per tag-board logic), submit 441-445.

Engine: /checkpoint (mint only), /submit. Media: <video> src, WK_BOARD_STATIC implied. No /remote. Live depth: no.
Size: 449

---

## 8. delta-board.html (127 lines)

Purpose: slopegraph; model's rank order on the left, human re-rank on the right; the slopes are the correction.

Input payload (sentinel line 48):
- PAYLOAD.batch[]: {label, note?}; batch order = model guess rank (50, 52)
- PAYLOAD.head: {title?, frontier?, left_label?, right_label?} (49, 57-59)
- PAYLOAD.docText: not read.

Interaction (keydown 108):
- Enter 110: submit.
- ArrowDown 111, ArrowUp 112: focus position.
- Shift+ArrowDown 113, Shift+ArrowUp 114: move focused item in human order.
- Mouse: none.

Output (submit 117-123; fetch 121):
- POST /submit body: {dispositions[], moved[]}
- dispositions[] item: {label, guess_rank (1-based), human_rank (1-based), delta: guess_rank - human_rank (0-based difference)}
- moved[]: same objects filtered to delta !== 0.

Engine: /submit only. No checkpoint, remote, state, media. Live depth: no.
Size: 127

---

## 9. exec-board.html (129 lines)

Purpose: command-approval; nothing runs from the page. Default state is pending.

Input payload (sentinel line 59):
- PAYLOAD.batch[]: {cmd: string, lang?: string (default 'sh'), note?: string, danger?: bool|string} (61, 83-86)
- PAYLOAD.head: {title?, frontier?} (60, 67-68)

Interaction (keydown 97):
- ArrowDown 99, ArrowUp 100: focus.
- Enter 101: submit.
- a or space 103: toggle approved (clears rejected).
- x 104: toggle rejected (clears approved).
- e 105: toggle escalate.
- c 106-110: window.prompt note.
- Mouse: none.

Output (submit 113-124; fetch 121):
- POST /submit body: {dispositions[], approved[cmd], rejected[cmd], escalated[cmd]}
- dispositions[] item: {cmd, approved, rejected, escalate, note|null}

Engine: /submit only. No media, no live depth.
Size: 129

---

## 10. fragment-board.html (225 lines)

Purpose: ordered prompt composition from text fragments; reorder, strike, tag, assign agents, undo.

Input payload (sentinel line 67):
- PAYLOAD.batch[]: {id, body, tokens?, dial?, layer?, slot?, priority?, tags[]?, agents[]?, note?, struck?} (69-75)
- PAYLOAD.head.agents[]: roster, default ['kip','patches','orchestrator','lead','worker'] (78)
- PAYLOAD.head.title, head.frontier (94-95)

Interaction (keydown 156):
- Assign mode 161-174 (entered by a at 185): Escape cancels (162). Enter or a commits (163-165). Digits 1..N toggle roster member (166-172). Other keys swallowed.
- Shift+ArrowDown 176 / Shift+ArrowUp 177: move item (snapshot, reorder).
- ArrowDown 178, ArrowUp 179: focus.
- space 180, ArrowRight 180, ArrowLeft 181: expand (ArrowLeft collapses).
- o 184: expand all / collapse all.
- a 185: assign mode.
- x 186: strike toggle.
- t 187-192: tags prompt (space-separated).
- c 193-197: note prompt.
- e 198: escalate toggle.
- u or Backspace 199-202: undo (stack of 80 snapshots, line 99).
- Enter 203-220: submit (outside assign mode).
- Mouse: none.

Output (submit body 205-216; fetch 217):
- POST /submit body: {dispositions[], order[id] (live items), struck[id], tagged{id:[tags]}, assigned{id:[agents]}, escalated[id]}
- dispositions[] item: {id, position (index among live, or null if struck), struck, agents[], tags[], note, escalate}

Engine: /submit only. No media, no live depth.
Size: 225

---

## 11. kanban-board.html (295 lines)

Purpose: keyboard triage of cards into ordered lanes; delete/done/assign marks; add new cards.

Input payload (sentinel line 88):
- PAYLOAD.batch[]: {id?, label, detail?, current_lane?: lane name, note?, project?, due?, priority?} (90, 98-100, 166-168, 195-200)
- PAYLOAD.head.lanes[]: lane names, default ['Now','Next','Later','Someday','Drop'] (93). Lane index 0 is Inbox (fixed).
- PAYLOAD.head.title, head.frontier (138-139)

Interaction (keydown 214):
- overlay open 217-220: space or Escape closes; other keys swallowed.
- ArrowDown 221, j 221: focus down. ArrowUp 222, k 222: focus up.
- space 223: open detail overlay.
- Enter 224: submit.
- 0 225: move to Inbox.
- 1..N 226-227: assign lane N.
- e 228: escalate. x 229: delete mark. d 230: done mark.
- n 231-236: note prompt.
- a 237-242: assign owner prompt.
- + or = or c 243-253: new-task prompt; appends item with id "new"+counter and marks added.
- Mouse: none (no click listeners).

Output (submit 256-290; fetch 283-286):
- POST /submit body: {dispositions[], by_lane{Inbox:[id|label], <lane>:[id|label]}, escalated[], deleted[], done[], assigned{id: name}, added[{id, text}]}
- dispositions[] item: {id, label, lane (name), lane_index (0=Inbox), note|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 295

---

## 12. know-viz.html (161 lines)

Purpose: dependency graph view; flag, question dependencies, note, escalate. Nodes in type columns.

Input payload (sentinel line 54):
- PAYLOAD.batch[]: {id, type, name, description?, depends_on: [id]} (56, 58, 113-120)
- PAYLOAD.head: {title?, frontier?, types?: [string]} (55, 57, 74-75)

Interaction (keydown 129):
- ArrowDown 132-133, ArrowUp 132-134: move within type column.
- ArrowRight 137-140, ArrowLeft 137-140: move column (row index clamped).
- Enter 142: submit.
- m 144: flag toggle. q 145: question-deps toggle. e 146: escalate toggle. c 147: note prompt.
- Mouse: none.

Output (submit 150-157; fetch 155):
- POST /submit body: {dispositions[], flagged[id], questioned[id], escalated[id]}
- dispositions[] item: {id, type, flag, question, note|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 161

---

## 13. matrix-board.html (143 lines)

Purpose: options x criteria elimination matrix. Strike cells, options, or criteria.

Input payload (sentinel line 56):
- PAYLOAD.head.criteria[]: string (58)
- PAYLOAD.head.title, head.frontier (69-70)
- PAYLOAD.batch[]: {label, cells[]: value per criterion index} (59, 88)

Interaction (keydown 105):
- ArrowRight 107, ArrowLeft 108, ArrowDown 109, ArrowUp 110: 2D cell focus.
- Enter 111: submit.
- space 112: strike cell.
- x 113: strike option (row).
- X 114: drop criterion (column).
- e 115: elevate option (escalate).
- c 116-121: note prompt on focused cell.
- Mouse: none.

Output (submit 124-138; fetch 135):
- POST /submit body: {dispositions[], dropped_criteria[name], invalidated[option label], escalated[option label]}
- dispositions[] item: {option, struck, escalate, struck_cells[criterion], notes{criterion: note}}

Engine: /submit only. No media, no live depth.
Size: 143

---

## 14. leaderboard-board.html (142 lines)

Purpose: ranked standings review; keep, cut, promote; podium for top 3.

Input payload (sentinel line 57):
- PAYLOAD.batch[]: {label, score? | rating?, wins?, losses?, ties?, weak?, comparisons?, note?} (59-62, 71-83)
- Sorted client-side by score desc (61).
- PAYLOAD.head.title, head.frontier (58, 68-69)

Interaction (keydown 114; ignores INPUT/TEXTAREA targets 116):
- ArrowDown 118, ArrowUp 119: focus.
- space, m, M 120: keep toggle (clears cut).
- x, X 121: cut toggle (clears keep and promote).
- p, P 122: promote toggle (sets keep, clears cut).
- e, E 123: escalate toggle.
- c, C, n, N 124: note prompt.
- Enter 125: submit.
- Mouse: none.

Output (submit 128-137; fetch 135):
- POST /submit body: {dispositions[], shortlist[label], cut[label], promoted[label], escalated[label]}
- dispositions[] item: {label, rank, score (rounded), marked, cut, promoted, note, escalate}

Engine: /submit only. No media, no live depth.
Size: 142

---

## 15. path-board.html (195 lines)

Purpose: side-by-side candidate paths (columns); strike milestones or whole paths; windowed columns.

Input payload (sentinel line 78):
- PAYLOAD.batch[] (paths): {id?, archetype, thesis, milestones[{m, note}], leans, risks, trades, forkFrom, grade} (79, 116-128)
- PAYLOAD.head: {title?, frontier?, forks[{id, text}]?, visibleCols?: number, default 3} (86-91)

Interaction (keydown 158):
- ArrowRight 160, ArrowLeft 161: path column.
- ArrowDown 162, ArrowUp 163: milestone within path.
- space 164: strike milestone.
- x 165: strike whole path.
- c 166-171: custom note prompt (steer).
- e 172: escalate.
- Enter 173: submit.
- 1-9 174: jump to path N.
- Mouse: none.

Output (submit 177-190; fetch 187):
- POST /submit body: {dispositions[], invalidated[id|archetype], escalated[id|archetype]}
- dispositions[] item: {id, archetype, struck, struck_milestones[m], custom|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 195

---

## 16. quad-board.html (110 lines)

Purpose: place items into a 2x2 grid across two axes.

Input payload (sentinel line 51):
- PAYLOAD.head.axes: {x, y} (default {x:'x', y:'y'}) (53)
- PAYLOAD.head.quadrants[4]: labels (55-56)
- PAYLOAD.head.title, head.frontier (62-63)
- PAYLOAD.batch[]: {label, note?} (57)

Interaction (keydown 89):
- ArrowDown 91, ArrowUp 92: focus item.
- Enter 93: submit.
- 1-4 94: place focused item in quadrant N.
- 0 95: unplace.
- e 96: escalate toggle.
- c 97: note prompt.
- Mouse: none.

Output (submit 100-106; fetch 104):
- POST /submit body: {dispositions[], by_quadrant{quadrant label: [labels]}, escalated[label]}
- dispositions[] item: {label, quadrant (0-4), quadrant_label|null, note|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 110

---

## 17. venn-board.html (116 lines)

Purpose: assign items to a two-set Venn region (A only, B only, both, neither).

Input payload (sentinel line 56):
- PAYLOAD.head.sets: {a, b} (default 'A', 'B') (58)
- PAYLOAD.head.title, head.frontier (65-66)
- PAYLOAD.batch[]: {label, note?} (59)

Interaction (keydown 92):
- ArrowDown 94, ArrowUp 95: focus.
- Enter 96: submit.
- a 97: region A only. b 98: region B only. i 99: both. n 100: neither.
- 0 101: clear region.
- e 102: escalate. c 103: note prompt.
- Mouse: none.

Output (submit 106-112; fetch 110):
- POST /submit body: {dispositions[], by_region{set name or "neither" or "A ∩ B": [labels]}, escalated[label]}
- dispositions[] item: {label, region ('a'|'b'|'ab'|'neither'|null), region_label, note|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 116

---

## 18. transcript-board.html (96 lines)

Purpose: review a conversation; mark turns to extract, note, escalate. Does not edit transcript.

Input payload (sentinel line 45):
- PAYLOAD.batch[] (turns): {role: 'user'|'assistant'|'system'|'tool' (other roles render as system), text} (47, 59, 66)
- PAYLOAD.head.title, head.frontier (46, 52-53)

Interaction (keydown 75):
- ArrowDown 77, ArrowUp 78: focus turn.
- Enter 79: submit.
- space or m 81: mark toggle (preventDefault).
- e 82: escalate toggle.
- c 83: note prompt.
- Mouse: none.

Output (submit 86-92; fetch 90):
- POST /submit body: {dispositions[], marked[{i, role, text}], escalated[i (turn index, number)]}
- dispositions[] item: {i, role, marked, note|null, escalate}

Engine: /submit only. No media, no live depth.
Size: 96

---

## 19. gate-board.html (218 lines)

Purpose: one row holds N media candidates. Toggle the ones that pass (gate) and crown one best (preference).

Input payload (sentinel line 60):
- PAYLOAD.head.meta[]: {key, label} display columns (62, 85, 96)
- PAYLOAD.head.title, head.frontier (80-81)
- PAYLOAD.batch[]: {label, audio[] (candidate URLs), passed?: [index], crown?: index, unusable?: bool, note?, meta{}?, anchor?} (63-75, 92-107)

Interaction (keydown 166; digitOf 159-164 reads e.key digit or shifted symbol):
- 1-N 169-175: toggle pass for candidate N, and play it (play(focus, n-1)). Playback never blocks the toggle.
- Shift+1-N 174: crown candidate N (crown implies pass).
- 0 170: clear row (passed, crown, unusable).
- space 177-181: play next candidate of row (cycles).
- ArrowDown 182, ArrowUp 183: focus row.
- Enter 184-188: first press arms if unanswered rows remain; second submits.
- a 189: pass all candidates in row.
- x 190-192: unusable toggle (clears passed and crown), advances.
- e 193: escalate. c 194: note prompt.
- Any other key disarms (195).
- Mouse: none.

Output (submit 198-214; fetch 211):
- POST /submit body: {dispositions[], by_index{"1":[labels], ...}, unanswered[label], unusable[label], escalated[label]}
- dispositions[] item: {label, passed_index[], passed (count), crown_index|null, crown (bool), unusable, note|null, escalate}

Engine: /submit only. Media: <audio src> per candidate (107, 127, 134), via static root (WK_BOARD_STATIC implied). No /checkpoint, /remote. No live depth.
Size: 218

---

## 20. duel-board.html (491 lines)

Purpose: best-of-N ELO ranking. Human crowns the best of a group shown together; ratings update client-side.

Input payload (sentinel line 75):
- PAYLOAD.batch[]: {label, audio[]?, text?, note?, rating? (default 1500), wins?, losses?, ties?, weak?, comparisons?, tags[]?, eliminated?: bool, moreAudio?: bool, sources?: int, clipNames[]?} (77-88)
- PAYLOAD.head: {title?, frontier?, perRound? (2..9, default 2), winK? (16), lossK? (48), cohortCeiling? (0.6), cohortCoverage? (0.5)} (76, 90, 94-95, 157, 165)

Interaction (keydown 375; ignores INPUT/TEXTAREA):
- space 379: stop all audio.
- u, U, Backspace 380: undo (history of 100 snapshots).
- PLAY_KEYS 1..PER 381: play contender card i (playCard).
- PICK_KEYS 382-392: crown card i (PER<=5 uses keys 6,7,8,9,0). Behavior depends on mode: markMode (elim/more) marks, tieMode toggles co-winners, else crown and advance.
- ArrowUp 393-396: toggle tie mode; second press commits tie.
- ArrowDown 397-402: cancel mark/tie mode, else skip round.
- x, X 403-407: eliminate mode; second press commits.
- a, A 408-412: more-audio mode; second press commits.
- g, G 413-418: cohort pairing toggle (only if tags exist).
- Enter 419: submit.
- o, O 420-427: show or hide source clips (only if sources exist).
- e, E 428: escalate whole current group.
- n, N 429: note prompt (addNote 437-444).
- Mouse: .clip button onclick 262 plays that card's clip (playCard). Native <audio controls> also present (239).

Output (currentResult 446-462):
- POST /checkpoint body and POST /submit body: {dispositions[], ranking[label] (alive, by rating), votes[], escalated[label], eliminated[label], more_audio[label]}
- dispositions[] item: {label, rating (rounded), tags[], wins, losses, ties, weak, comparisons, note, escalate, eliminated, more_audio}
- votes[] item shapes (335, 348, 356, 366): {type:'best', winner, over[]} | {type:'tie-best', winners[], over[]} | {type:'eliminate', cards[]} | {type:'more-audio', cards[]}

Engine: /checkpoint after every disposition (autosave 467-474, reads {ok} JSON), /submit (481-486). No /remote, /state. Media: <audio src> per clip, served from WK_BOARD_STATIC (header line 12). Live depth: no.
Size: 491

---

## 21. tour-board.html (444 lines)

Purpose: n-dimensional batch as a 2-D point cloud rotated by a grand tour; name projections, link points, walk, keep or cut.

Input payload (sentinel line 84):
- PAYLOAD.batch[]: {label, values{dimKey: number}, tags[]?, kept?, cut?, note?, escalate?} (86, 95-99)
- PAYLOAD.head: {title?, frontier?, dims?: [string | {key, label?}], scale?: 'center'|'z', projections?: [{name, basis:{dimKey:{u, v}}}]} (85, 89-91, 108, 196-200)
- PAYLOAD.docText (440)

Interaction (keydown 350; ignores INPUT/TEXTAREA):
- space 355: play/pause tour.
- 1-9 356: pull toward dimension N.
- ArrowRight 357, ArrowLeft 358: next or previous named view.
- ] 359, [ 360: speed.
- r, R 361: new random target, resume.
- o, O 362-369: toggle projection-pursuit seek (multi-start hill-climb).
- s, S 370-375: toggle scale center/z (rebuilds X).
- f, F 376-382: cycle tag filter.
- ArrowUp 383, ArrowDown 384: focus along current x-axis.
- p, P 387-397: name current projection (prompt). Adds to projections and views.
- l, L 398-407: link arm, then link two points.
- w 408: push focus onto walk. W 409: pop walk.
- k, K 410-411: keep toggle (clears cut).
- x, X 412-413: cut toggle (clears keep).
- c, C 414-415: note prompt.
- e, E 416: escalate toggle.
- u, U, Backspace 417-419: undo stack.
- Enter 420: submit.
- Mouse: none (no mouse listeners).

Output (submit 423-436; fetch 425):
- POST /submit body: {dispositions[], projections[{name, basis:{dimKey:{u, v}}, note}], links[{from, to, note}], walk[label], kept[label], cut[label], escalated[label], lastBasis{dimKey:{u, v}}, dims[keys]}
- dispositions[] item: {label, kept, cut, note, escalate}

Engine: /submit only. No media, no live depth.
Size: 444

---

## 22. tour-board-standalone.html (582 lines)

Purpose: server-free variant of tour-board. Same keys and lenses. Shows the result as JSON on screen with a copy button.

Input payload (sentinel line 141, `var PAYLOAD`):
- If no payload injected, DEMO = true and a built-in synthetic batch is used (142, 166): 3 clusters in dims 2 and 5 of 8.
- Same shape as tour-board: batch[] {label, values, tags?, kept?, cut?, note?, escalate?}; head {dims, scale, projections, title, frontier} (lines 168-173 region).
- PAYLOAD.docText (444 region).

Interaction (keydown 460; focus and blur listeners 553-554 change a hint text; mousedown on root focuses it at 555):
- Escape or Enter 462: close result panel (when panel open).
- space 468: play/pause.
- ArrowRight 470, ArrowLeft 471: named views.
- ] 472, [ 473: speed.
- r, R 474: random target.
- o, O 475-484: seek.
- s, S 484-491: scale toggle.
- f, F 491-499: tag filter.
- ArrowUp 499, ArrowDown 500: focus.
- p, P 503-514: name projection (prompt).
- l, L 515-525: link.
- w 526 push, W 527 pop.
- k, K 528-532: keep. x, X 533-537: cut. c, C 538-542: note. e, E 543: escalate.
- u, U, Backspace 544-548: undo.
- Enter 549: submit.
- Mouse: mousedown on root (555) focuses it. Click on #tb-back (452) hides result panel. Click on #tb-copy (453) copies the JSON text to clipboard.

Output (result() 424-438; submit 439-451):
- On-screen JSON in #tb-json (441) always.
- POST /submit only when location.protocol is http: or https: (445-450), body: {dispositions[], projections[], links[{from, to, note}], walk[label], kept[label], cut[label], escalated[label], lastBasis{}, dims[keys]}
- dispositions[] item: {label, kept, cut, note, escalate}

Engine: /submit optional (only if served). Works from file:// or static host (serve-static.sh path). No media, no live depth.
Size: 582

---

## 23. breadboard-board.html (293 lines)

Purpose: Shape Up breadboard graph (places as columns, affordances as nodes, wires as edges). Comment, flag, question, strike, escalate.

Input payload (sentinel line 82):
- PAYLOAD.batch[] (nodes): {id, place, kind: 'ui'|'code', name, control?, description?, wires_to: [{to: id, flow: 'control'|'data'}]} (84, 98-103, 189-208)
- PAYLOAD.head: {title?, frontier?, places?: [string]} (83, 85)
- PAYLOAD.docText: not used by the page.

Interaction (keydown 239):
- ArrowDown 243, ArrowUp 243: move within place column.
- ArrowRight 248, ArrowLeft 248: move between place columns.
- Enter 257: submit.
- m 260: flag toggle. q 261: question-wiring toggle. x 262: strike toggle. e 263: escalate toggle.
- c 264-269: comment prompt.
- Mouse: none.

Output (submit 271-288; fetch 285):
- POST /submit body: {dispositions[], comments[{id, comment}], flagged[id], struck[id], questioned[id], escalated[id]}
- dispositions[] item: {id, comment|null, flag, question, strike, escalate}

Engine: /submit only. No media, no live depth.
Size: 293

---

## 24. voice-explorer.html (1139 lines)

Purpose: explore and rate voice recordings. Filter by dimension thresholds, list or scatter views, head-to-head ELO ranking in page, save.

Input payload (sentinel line 195, `P = sentinel || {}`):
- P.head: {title?, frontier?, dimensions[] (line 197): {key, label, group, dp, desc, low, high, preferHigh?}} (196-197)
- Score dimension "score" is prepended in code (201). predicted_rating dimension is spliced in when any batch item has it (207-214).
- P.batch[]: {label, audio[] (URLs played via new Audio, 806, 823), tags[], gateFail[], values{key: number}, predicted_rating?: number, kept?, cut?, promoted?, note?, escalate?, rating?: number, ratingSource?, comparisons?, wins?, losses?} (219-231)
- Recognized values keys in code: f0_median_hz, hnr_db, f0_std_st, speech_rate_syl_s, pause_frac, creak_frac (STAT_LINE 310-311; FRY_KEY creak_frac 269).

Interaction (keydown 991; no mouse listeners in the script):
- Enter 993: submit (action 'save').
- Compete mode keys 994-1026 (active after r):
  - 1-5 997: play contender (repeat = next clip).
  - 6-9 998, 0 999: crown contender.
  - ArrowUp 1000-1006: tie mode, second press commits.
  - ArrowDown 1007-1015: cancel tie or skip bout.
  - x 1016-1021: all weak (demote all).
  - Escape or v 1022-1025: leave compete mode.
- 1-5 1027: play sample N of focused item (preview only).
- space 1028: stop.
- ] 1030, [ 1031: nudge score by 25 (ELO).
- \ 1032: clear score.
- ! @ # $ % 1033-1034: set score 1300/1400/1500/1600/1700 (shifted 1-5).
- > 1036: cut at cursor (min threshold). < 1037: cut at cursor (max threshold).
- = 1038: typed threshold prompt.
- 0 1039-1042: clear threshold on current dimension.
- - 1043-1047: clear all thresholds.
- PageUp, PageDown 1053-1062: page (scatter uses stride).
- Home 1063, End 1064.
- Scatter mode arrows 1066-1074: ArrowRight/Left/Up/Down step; . , change x dimension; ' ; change y dimension.
- List mode arrows 1076-1079: ArrowDown/Up focus; ArrowRight/Left change dimension.
- k 1083: keep. x 1084: cut. p 1085: star (promote).
- v 1086: list/scatter toggle.
- s 1087: sort reverse.
- r 1088-1099: enter compete mode over visible list.
- g 1100: gates filter toggle. f 1101: fry filter toggle.
- c 1102-1108: note prompt.
- e 1109-1114: escalate toggle.
- u or Backspace 1115-1130: undo (stack of 200).
- Mouse: none.

Output (submit 929-989; fetch 953-956):
- POST /submit body: {dispositions[], rated[{label, rating}] (desc), shortlist[label], cut[label], promoted[label], escalated[label], filters{hidPoorRecordings, hidHeavyFry, thresholds{}, survivors[label]}, lastDimension, lastDimensionY, scatter, action (default 'save')}
- dispositions[] item: {label, kept, cut, promoted, note, escalate, values{}, rating (number|null), ratingSource}
- Expected reply (961-988): {persisted, changes{label:{rating, ratingSource, comparisons, wins, losses, predicted_rating}}, message}. If reply lacks persisted, page shows "submitted" and stops.

Engine: /submit only. Reply contract above. Media: new Audio(URL) per sample, no static root declared. No /checkpoint, /remote. No live depth.
Size: 1139

---

## 25. SHAPE-demo.html (213 lines)

Purpose: primitive-kit demo of 4 screens (explore, matrix, place, rank). Not a payload board.

Input payload: none. No sentinel. SCREENS (75) and initial state (89) are hard-coded in the file.

Interaction (keydown 168-204):
- Tab 172: toggle panel focus (ai/hu).
- Enter 173: submit (unless filter input focused).
- 1-4 174: screen select.
- Arrows 176-187: matrix cell nav, place quadrant nav.
- space 189-194: matrix cycles score (1-3), place drops item.
- a-z 197-203: per-screen letter binds (pick row, choose who, append rank).
- input 209-210 on #filt: filter text for explore list.
- Mouse: none.

Output: no POST. submit (162-166) replaces body with a <pre> of JSON from serialize() (154-161): {explore:{selected[]}, matrix:{rows[], cols[], cells{}}, place:{<who>: quadrant label}, rank: order[]}.

Engine: none. No /submit, no /checkpoint, no media, no live depth.
Size: 213

---

## Table of boards

```
name                     lines   uses-media   uses-live-depth
board.html                 315   no           no
board-live.html            441   no           YES (serve-live, claude -p)
grid-board.html            466   yes (audio)  no
grid-board-image.html      535   yes (image)  no
grid-board-video.html      585   yes (video)  no
tag-board.html             342   yes (audio)  no
tag-board-video.html       449   yes (video)  no
delta-board.html           127   no           no
exec-board.html            129   no           no
fragment-board.html        225   no           no
kanban-board.html          295   no           no
know-viz.html              161   no           no
matrix-board.html          143   no           no
leaderboard-board.html     142   no           no
path-board.html            195   no           no
quad-board.html            110   no           no
venn-board.html            116   no           no
transcript-board.html       96   no           no
gate-board.html            218   yes (audio)  no
duel-board.html            491   yes (audio)  no
tour-board.html            444   no           no
tour-board-standalone.html 582   no           no
breadboard-board.html      293   no           no
voice-explorer.html       1139   yes (audio)  no
SHAPE-demo.html            213   no           no
```

Totals: 25 boards. Uses media: 8. Uses live depth: 1 (board-live).

---

## Engine endpoint use by board

```
board.html               /submit
board-live.html          /finish /poll /cost /flush /reconcile /shape   (serve-live.mjs)
grid-board*.html (3)     /checkpoint /submit /remote
tag-board*.html (2)      /checkpoint (mint only) /submit
duel-board.html          /checkpoint /submit
tour-board-standalone    /submit (only if served over http/https)
voice-explorer.html      /submit (reply: persisted, changes, message)
all other /submit-only   delta, exec, fragment, kanban, know-viz, matrix,
                         leaderboard, path, quad, venn, transcript, gate,
                         tour-board, breadboard
SHAPE-demo.html          none
/state                   not referenced by any template
```

---

## Shared code and CSS repeated across templates

Theme variables (`:root` block with --bg #14161a, --panel #1c1f26, --edge #2b303b, --ink #e6e9ef, --dim #8a92a3/#8a92a3, --focus #e2b341, --custom #8ab4ff, --esc #f08fb0, --chip #262b34):
- Copied into about 20 templates. Same values in the header block of each.
- Different palette in voice-explorer.html (--bg #0e0f11, --accent #e8b44a) and SHAPE-demo.html (--bg #0e0f13, --pick #7fd18a).

Base CSS repeated (same or near-same rules):
- `* { box-sizing:border-box; }`
- `body { margin:0; font:13px/1.5 ui-monospace,...; background:var(--bg); height:100vh; display:flex; flex-direction:column; }` in most board templates.
- `header { ... }` and `header h1 / .frontier` rules.
- `footer { ... } footer kbd { ... }` in most.
- `.item.focus`, `.focus` highlight with box-shadow inset var(--focus).

Escape helper `esc(s)` (one-line regex replace for & < >): repeated in almost every template. board.html and tour-board-standalone define the same logic under other names (escapeHtml, function esc with a function body).

Submit footer: `.then(()=>{document.body.innerHTML='<div style="padding:40px;font:16px ui-monospace">Submitted — close this tab.</div>';})` repeated in about 18 templates (wording varies slightly).

Submit POST boilerplate: `fetch('/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(...)})` repeated in every /submit template.

Enter arm-then-submit guard (first Enter arms when open rows remain, second submits; `armed` flag): board.html 238-245, board-live (onEnter 407-414), grid-board 361-366 (and image/video), tag-board 279-283 (and video), gate-board 184-188.

Debounced checkpoint: grid-board family (checkpoint 437-443 in grid-board.html; 556-562 in grid-board-video.html; 506-512 in grid-board-image.html) and tag-board family (checkpoint 329-332 / 436-439).

Remote-key poller: identical pollRemote + setInterval 250 ms in grid-board.html (455-461), grid-board-image.html (521-530), grid-board-video.html (574-580).

Audio play helpers (stopAudio, playRow, clipTurn, .playmark, .clipdots): repeated in grid-board.html (273-302), tag-board.html (182-204), gate-board play() (126-137), duel-board playCard (207-220).

Video/image pane code (syncPlayer, loadClip, paintPlayerMarks, clipName, lens keys): repeated across grid-board-image.html (312-374), grid-board-video.html (322-414), tag-board-video.html (214-305). Near-copies with different element types.

Field panel (head.fields): grid-board.html (179-221), grid-board-image.html, grid-board-video.html. Same code.

Anchor-scroll helpers (slug, buildDoc, anchorScroll, doc pane): board.html (117-144), grid-board.html (147-177), grid-board-image.html, grid-board-video.html. Same logic.

Shift-digit mapping: gate-board.html digitOf/SHIFTED (156-164). Other boards use e.code or shiftKey check (grid family 485-489). Different methods.

Node-column layout (COLW/ROWH/PADX/PADY, pos, center, nodesInCol, column nav): know-viz.html (62-125, 127-141) and breadboard-board.html (90-108, 240-258 region). Near-copies.

Undo stacks with snapshot(): fragment-board.html (97-100, 199-202), duel-board.html (310-328), tour-board.html (216-219, 417-419), voice-explorer.html (830-846, 1115-1130). Four different implementations.

Dispositions item pattern (`label`, `note`, `escalate`) repeated in exec, quad, venn, transcript, leaderboard, path, kanban, tour, voice-explorer, fragment, know-viz, gate, grid family.

ELO update: duel-board.html pairResult (192-201) and voice-explorer.html applyElo (709-723). Both use expected = 1/(1+10^((rb-ra)/400)). Different K handling (asymmetric vs fixed 32).

Payload sentinel handling: every template except SHAPE-demo.html uses `/*__SHAPE_BOARD_PAYLOAD__*/ null`. Same pattern: `const PAYLOAD = ... || {}`, `head = PAYLOAD.head || {}`, `batch` normalized.

Title/frontier set from head at load (`document.getElementById('title').textContent = head.title || '...'`) in nearly every template.

Key-scheme conventions shared across many: ArrowUp/ArrowDown focus; Enter submit; space as lens or stop; x as strike/unusable; e as escalate; c as note prompt (window.prompt).
