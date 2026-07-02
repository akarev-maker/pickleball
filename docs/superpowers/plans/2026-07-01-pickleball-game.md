# Pickleball Web Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-dependency, top-down arcade pickleball game (player vs CPU, core rules) playable by opening `index.html`.

**Architecture:** ES modules drawn on a single canvas via a requestAnimationFrame loop in `game.js`, which owns a state machine (`menu → serving → rally → point-banner → game-over`). All rules logic lives in pure, Node-testable `rules.js`. Court geometry is in feet; `court.js` maps feet → canvas pixels.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML Canvas, CSS. Tests run with plain `node` (no framework).

## Global Constraints

- Zero runtime dependencies; no build step. Game must work via `python3 -m http.server` (ES modules need http, not file://).
- Court coordinates in feet: court is 20 ft wide (x: 0–20), 44 ft long (y: 0–44). Net at y = 22. Kitchen: 15 ≤ y ≤ 29. Player side: y > 22 (bottom). CPU side: y < 22 (top).
- Rally scoring, first to 11 win by 2. Serve alternates sides every point (no server numbers).
- Every rally ends with a banner naming the reason.
- `rules.js` must not import anything or touch DOM/canvas.

---

### Task 1: Rules engine (`rules.js`) with Node tests

**Files:**
- Create: `rules.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces: `PLAYER = 'player'`, `CPU = 'cpu'`, `other(side)`;
  `Score` class: `add(side)`, `get(side)`, `winner()` (returns side or null), `servingSide` (alternates each point starting `PLAYER`);
  `Rally` class (one instance per rally): constructor `(server)`, `recordHit(side, {volley, inKitchen})`, `recordBounce(side)`, `recordOut(landedOutOnSide)` — each returns `null` (rally continues) or `{winner, reason}`;
  `isValidServeLanding(server, x, y)` → bool (diagonal service box beyond kitchen);
  `inKitchen(y)` → bool.

- [ ] **Step 1: Write failing tests** — `tests/rules.test.js` with a tiny `assert`/`test` helper covering: score win at 11, win-by-2 (10–10 → 11–10 is no winner, 12–10 wins), serve alternation; two-bounce rule (volley on return of serve = fault, volley after both bounces = legal); kitchen volley = fault, kitchen groundstroke = legal; double bounce on one side = point to hitter; out ball = point to non-hitter; serve landing validation for both servers and both diagonals.
- [ ] **Step 2: Run** `node tests/rules.test.js` — expect failure (cannot find module).
- [ ] **Step 3: Implement `rules.js`.** Rally tracks `hitCount` (serve = hit 1), `bouncedSinceLastHit`, `lastHitter`. `recordHit`: if `hitCount < 3` and `!bouncedSinceLastHit` → two-bounce fault by hitter; if `volley && inKitchen` → kitchen fault by hitter. `recordBounce(side)`: second bounce on same side without an intervening hit → point to `lastHitter`.
- [ ] **Step 4: Run** `node tests/rules.test.js` — expect all PASS.
- [ ] **Step 5: Commit** `feat: rules engine with tests`.

### Task 2: Page scaffold + court rendering (`index.html`, `style.css`, `court.js`)

**Files:**
- Create: `index.html`, `style.css`, `court.js`

**Interfaces:**
- Produces: `court.js` exports `COURT_W = 20`, `COURT_L = 44`, `NET_Y = 22`, `KITCHEN_TOP = 15`, `KITCHEN_BOTTOM = 29`, `MARGIN = 6` (feet of out-of-bounds apron on all sides); `setupCanvas(canvas)` → `{scale, toPx(x,y), ctx}`; `drawCourt(ctx, view)` renders apron, court surface, kitchen shading, lines, centerlines, net band.
- `index.html`: `<canvas id="game">`, HUD divs (`#score`, `#banner`, `#menu`, `#help`), `<script type="module" src="game.js">`.

- [ ] **Step 1:** Write the three files. Canvas sized to fit viewport height, court centered with apron. Distinct kitchen tint; white 2 px lines; net drawn as a dark band with slight drop shadow.
- [ ] **Step 2:** Temporary render call in `game.js` stub; verify visually via `python3 -m http.server`.
- [ ] **Step 3: Commit** `feat: page scaffold and court rendering`.

### Task 3: Ball physics (`ball.js`)

**Files:**
- Create: `ball.js`

**Interfaces:**
- Produces: `Ball` class: fields `x, y, z, vx, vy, vz, inFlight`; `update(dt)` integrates with gravity `G = 32 ft/s²`, returns `'bounce'` when z crosses 0 downward (restitution 0.55, ground friction ×0.75 on vx/vy), else null; `launchTo(tx, ty, apexZ)` sets velocity so ball departs current `(x,y,z)` and lands at `(tx,ty)` with flight time derived from apex height; `predictLanding()` → `{x, y, t}` for next z=0 crossing; `draw(ctx, view)` draws shadow at `(x,y)` and ball offset up by `z * scale * 0.7`, plus landing marker while airborne.
- `launchTo` math: `t = (vz0 + sqrt(vz0² + 2·G·z)) / G` where `vz0 = sqrt(2·G·max(apexZ − z, 0.5))`; then `vx = (tx−x)/t`, `vy = (ty−y)/t`.

- [ ] **Step 1:** Implement `Ball` per the interface above.
- [ ] **Step 2:** Sanity-check the math with a quick Node snippet (launch from (10,40,3) to (10,10) apex 8 → `predictLanding()` ≈ (10,10)).
- [ ] **Step 3: Commit** `feat: ball physics with bounce and landing prediction`.

### Task 4: Player and CPU (`player.js`, `cpu.js`)

**Files:**
- Create: `player.js`, `cpu.js`

**Interfaces:**
- Consumes: `Ball`, court constants.
- Produces: `Player` class: `x, y`, `update(dt, keys)` (speed 16 ft/s, clamped to own half + apron), `moveDir()` → `{dx, dy}` normalized last input, `canReach(ball)` (horizontal dist < 2.5 ft and `ball.z < 7`), `draw(ctx, view)`.
  `Cpu` class: `x, y`, `setDifficulty('easy'|'medium'|'hard')`, `update(dt, ball)` — moves toward predicted landing x (own half) with capped speed {easy: 9, medium: 12, hard: 15} and reaction delay {0.45, 0.25, 0.12}s, `canReach(ball)`, `chooseShot(ball, playerPos)` → `{tx, ty, apexZ}` with aim error radius {easy: 4, medium: 2.5, hard: 1.2} ft, aiming away from the player; occasionally dinks when near kitchen line.

- [ ] **Step 1:** Implement both classes; players drawn as colored circles with paddle dot on facing side.
- [ ] **Step 2: Commit** `feat: player movement and CPU opponent`.

### Task 5: Game loop, state machine, HUD (`game.js`, `ui.js`)

**Files:**
- Create: `game.js`, `ui.js`
- Modify: replace Task 2 stub in `game.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `ui.js` exports `showBanner(text, ms)`, `updateScore(score, servingSide)`, `showMenu(onStart(difficulty))`, `showGameOver(winnerText, onRestart)`.
- State machine in `game.js`: `menu` (difficulty select) → `serving` (server positioned behind baseline on correct half-court side; player serves with Space, CPU serves after 1 s) → `rally` (integrate ball; on `canReach` auto-hit: build `{volley: !bouncedOnMySideYet, inKitchen: inKitchen(hitter.y)}`, call `rally.recordHit`; on bounce call `rules.isValidServeLanding` for hit #1 landing, `recordOut` if outside court, else `recordBounce`) → `point-banner` (2 s, then `serving` or `game-over`).
- Player shot selection: target x biased by `moveDir().dx`, depth biased by `moveDir().dy` (pushing up = deep drive, neutral = mid-court); Shift held at contact = dink (`ty` just past `KITCHEN_TOP`, low apex 4.5 ft, else apex 7 ft deep drive).

- [ ] **Step 1:** Implement `ui.js` (DOM overlay elements, CSS already styled in Task 2).
- [ ] **Step 2:** Implement `game.js` loop + states + input (arrows/WASD, Shift, Space, R to restart).
- [ ] **Step 3:** Run `node --check` on every JS file; re-run `node tests/rules.test.js`.
- [ ] **Step 4:** Manual playtest over `python3 -m http.server`: full game to 11 vs Medium; verify serve faults, kitchen fault banner, two-bounce fault, dinks.
- [ ] **Step 5: Commit** `feat: game loop, state machine, and HUD`.

### Task 6: Polish + README

**Files:**
- Create: `README.md`
- Modify: any file needing feel/tuning fixes from the playtest.

- [ ] **Step 1:** Tune speeds/arcs from playtest notes; make sure Easy is winnable and Hard is challenging.
- [ ] **Step 2:** `README.md` — how to run, controls, rules summary.
- [ ] **Step 3:** Final check: `node tests/rules.test.js` PASS, `node --check` all files.
- [ ] **Step 4: Commit** `docs: README and gameplay tuning`.
