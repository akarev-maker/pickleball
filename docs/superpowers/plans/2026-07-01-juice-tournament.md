# Juice, Tournament & Personalities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ladder of 8 named CPU personalities plus SFX/crowd audio, particles/trails/shake, and slow-mo point replays.

**Architecture:** Four new focused ES modules (`ladder.js`, `audio.js`, `fx.js`, `replay.js`) hook into the existing loop in `game.js`. `cpu.js` generalizes difficulty into personality profiles. Static overlay markup in `index.html` keeps DOM stubs simple; `ui.js` fills lists via innerHTML and wires fixed-id buttons.

**Tech Stack:** Vanilla JS/Canvas/Web Audio, zero dependencies, Node-run tests via existing `tests/dom-stub.js`.

## Global Constraints

- Zero runtime dependencies; no build step; audio is synthesized (no asset files).
- `localStorage` keys: `pickleball.rung`, `pickleball.muted`; storage failures degrade silently to in-memory.
- Missing `AudioContext` (Node tests) must disable audio without throwing.
- Existing 18 rules tests keep passing; particle count capped (~200).
- Tournament matches: single game to 11 win-by-2; loss retries the same rung.

---

### Task 1: Personalities + roster (`ladder.js`, `cpu.js`) with ladder sweep test

**Files:** Create `ladder.js`, `tests/ladder.test.js`; Modify `cpu.js` (profiles), `tests/balance.test.js` untouched.

**Interfaces:**
- `ladder.js` exports `ROSTER` (array of 8 profiles `{id, name, color, tagline, winLine, loseLine, speed, reaction, aimError, dinkiness, aggression, lobbiness}`, ascending difficulty), `QUICK_PROFILES` (`{easy, medium, hard}` same shape), `loadRung()` → int 0..8, `saveRung(n)`, `resetLadder()`.
- `cpu.js`: `setProfile(profile)` replaces `setDifficulty` internals (`setDifficulty(name)` delegates via `QUICK_PROFILES`); `chooseShot` uses `dinkiness` as dink probability at the kitchen line, `aggression` lowers apex and returns `timeScale: 1 - 0.25 * aggression` on drives, `lobbiness` = chance of a deep apex-9.5 lob; `update` unchanged otherwise. `cpu.profile` exposed.
- `game.js` (Task 4) passes `shot.timeScale ?? 1` for CPU launches too.

**Steps:**
- [ ] `tests/ladder.test.js`: neutral bot (reuse balance-test movement logic) vs `ROSTER[0]` and `ROSTER[7]`, 600 s cap each; assert bot beats rung 1, and rung 8's CPU scores more points than rung 1's; print full 8-profile sweep behind `--sweep` flag. Run → fails (no ladder.js).
- [ ] Implement `ladder.js` + `cpu.js` profile support. Run test → passes. `node --check` all touched files.
- [ ] Commit `feat: CPU personalities and tournament roster`.

### Task 2: Audio (`audio.js`)

**Files:** Create `audio.js`.

**Interfaces:** Exports `initAudio()` (idempotent, call on first gesture), `sfx.paddle(power)`, `sfx.bounce()`, `sfx.net()`, `sfx.dink()`, `sfx.score()`, `sfx.ooh()`, `sfx.applause()`, `toggleMute()` → bool muted, `isMuted()`. All no-ops when muted or when `window.AudioContext`/`webkitAudioContext` is absent. Mute state persisted to `pickleball.muted`.

**Steps:**
- [ ] Implement with oscillators (paddle: square blip 300→700 Hz by power; bounce: 120 Hz sine thump; net: 80 Hz + noise; dink: 900 Hz tick; score: two-note ding) and filtered white-noise buffers for ooh (bandpass swell 0.4 s) and applause (1.8 s decaying noise bursts).
- [ ] Verify `node --check audio.js`; import from smoke test must not throw (covered in Task 5).
- [ ] Commit `feat: synthesized SFX and crowd audio`.

### Task 3: FX + replay (`fx.js`, `replay.js`)

**Files:** Create `fx.js`, `replay.js`.

**Interfaces:**
- `fx.js` exports class `Fx`: `spawnBounce(x, y)`, `spawnNet(x, y)`, `spawnConfetti()`, `ring(x, y)`, `trail(ball)` (call per frame), `shake(mag)`, `update(dt)`, `drawUnder(ctx, view)` (trail+ring, before entities), `drawOver(ctx, view)` (particles), `offsetPx()` → `{ox, oy}` shake translate. Max 200 particles.
- `replay.js` exports class `ReplayRecorder`: `record({bx, by, bz, px, py, cx, cy})`, `clear()`, `clip(seconds)` → frame array (assumes 60 fps ring of 150).

**Steps:**
- [ ] Implement both. Quick Node sanity: `ReplayRecorder` records 300 frames, `clip(1.2)` returns 72 ± 1 frames, oldest-first.
- [ ] `node --check` both. Commit `feat: particle/trail/shake FX and replay recorder`.

### Task 4: Menu, ladder UI, game wiring (`index.html`, `style.css`, `ui.js`, `game.js`)

**Files:** Modify all four.

**Interfaces / behavior:**
- `index.html` menu gains `#mode-quick`, `#mode-tournament` buttons; difficulty row shown for quick play. New overlays: `#ladder` (with `#ladder-list`, `#ladder-play`, `#ladder-reset`), `#champion` (with `#champion-restart`), mute button `#mute`. All fixed ids for the DOM stub.
- `ui.js`: `showModeMenu(onQuick(difficulty), onTournament())`, `showLadder(roster, rung, onPlay, onReset)` (fills `#ladder-list` via innerHTML, marks beaten/current), `showChampion(onRestart)`, `setMuteLabel(muted)`. Existing functions unchanged.
- `game.js`: mode ('quick'|'tournament'), current profile; tournament flow (win → rung+1 + save, rung 8 win → champion + confetti + applause; loss → retry, ladder screen between matches; taglines via banner before serve, win/lose lines at match end). New state `'replay'`: on rally end stash result, play recorder clip at 0.4× (positions driven from frames; next serve repositions entities), letterbox + "REPLAY" text, any keydown skips; then apply the stashed result. SFX hooks: paddle (player hit, pitch = power; dink uses `sfx.dink`), CPU hit (`sfx.paddle(0.3)`), bounce, net (both cord and rebound + `sfx.ooh`), score, applause on match end. FX hooks: bounce dust, net flash + small shake, smash shake when `timeScale < 0.85`, trail per frame, landing ring on rally end. M key + `#mute` toggle, `initAudio()` on first keydown/mousedown.
- `style.css`: ladder/champion overlay styles, mute button, letterbox bars via canvas draw (no CSS needed) — only DOM styles here.

**Steps:**
- [ ] Implement markup + ui.js + game.js wiring + styles.
- [ ] `node --check` all; rules tests pass; balance tests still run (quick-play path unchanged).
- [ ] Headless screenshots: menu (mode buttons), `#demo` mid-rally (trail/particles visible).
- [ ] Commit `feat: tournament mode, replays, and juice wiring`.

### Task 5: Smoke coverage + docs

**Files:** Modify `tests/dom-stub.js` (new element ids, `localStorage` stub), `tests/smoke.test.js` (tournament flow), `README.md`.

**Steps:**
- [ ] dom-stub: add ids `mode-quick, mode-tournament, ladder, ladder-list, ladder-play, ladder-reset, champion, champion-restart, mute`; `globalThis.localStorage` Map-backed stub; buttons keep `onclick` wiring pattern.
- [ ] Smoke test #2 (same file): start tournament via `#mode-tournament.onclick()` then `#ladder-play.onclick()`, drive the balance-bot movement until match end; assert rung advanced to 2 in the localStorage stub when the bot wins (rung 1 must lose to the bot per Task 1's assertion).
- [ ] Run: rules (18 pass), ladder, smoke (both flows), balance easy/medium/hard.
- [ ] README: tournament mode, personalities, replay skip, mute key.
- [ ] Commit `test/docs: tournament smoke flow and README update`.
