# Gameplay Depth (Lob/Smash, Serve Charge, ATP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lob stroke with overhead-smash counterplay, charge-to-serve with real fault risk, and around-the-post shots — per `docs/superpowers/specs/2026-07-03-gameplay-depth-design.md`.

**Architecture:** New pure module `shots.js` holds shot-tuning math (serve/lob/smash parameters) so it is unit-testable without a DOM. Net-crossing geometry moves into a pure `netCrossing()` helper in `court.js`. `game.js` wires inputs and effects; `cpu.js` gets a smash branch. Tests follow the repo's zero-dependency node-script style.

**Tech Stack:** Vanilla ES modules, no build step, plain node test scripts (`tests/*.test.js` with the local `test/assert` helpers), headless via `tests/dom-stub.js`.

## Global Constraints

- No dependencies, no build step (repo rule).
- Coordinates in feet; player side is y > NET_Y (net at y = 22), CPU baseline y = 0, player baseline y = COURT_L = 44.
- CPU max hit height `MAX_HIT_HEIGHT = 7` ft (player.js); net posts drawn at ±0.8 ft outside the sidelines.
- Smash trigger height: `SMASH_HEIGHT = 5.5` ft. Lob apex: `9 + 4 * power`. Serve: `apexZ 9 − 2.5·power`, `timeScale 1 − 0.25·power`, scatter `1 + 2.5·power`.
- `rules.js` (scoring) must not change.
- Every existing suite must keep passing: `npm test`, `node tests/doubles.test.js`, `node tests/balance.test.js medium`, `node tests/ladder.test.js`.

---

### Task 1: Pure shot math (`shots.js`) + net-crossing geometry (`court.js`) + tests

**Files:**
- Create: `shots.js`
- Create: `tests/depth.test.js`
- Modify: `court.js` (add `NET_HEIGHT`, `netCrossing`)
- Modify: `package.json` (test script runs both suites)

**Interfaces:**
- Produces: `shots.js` exports `SMASH_HEIGHT` (5.5), `serveParams(power) → {apexZ, timeScale, err, depth}`, `lobParams(power) → {apexZ}`, `smashParams(z, power) → {apexZ, timeScale}`.
- Produces: `court.js` exports `NET_HEIGHT` (3) and `netCrossing(prev, cur, left = 0, right = COURT_W) → null | {kind: 'around'|'contact', zAtNet}` where `prev`/`cur` are `{x, y, z}` ball positions on consecutive frames.

- [ ] **Step 1: Write the failing tests**

Create `tests/depth.test.js` (pure section only; a game-harness section is appended in Task 3):

```js
// Physics/shape tests for the gameplay-depth features: lob, smash,
// charged serves, and around-the-post geometry.

import { Ball } from '../ball.js';
import {
  SMASH_HEIGHT, serveParams, lobParams, smashParams,
} from '../shots.js';
import { netCrossing, NET_Y, COURT_W } from '../court.js';
import { MAX_HIT_HEIGHT } from '../player.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${expected}, got ${actual}`);
  }
}

// --- shot parameters ---

test('serve pace, scatter, and depth all grow with power', () => {
  const soft = serveParams(0.25);
  const hot = serveParams(1);
  assert(hot.err > soft.err, 'scatter grows');
  assert(hot.timeScale < soft.timeScale, 'flight compresses');
  assert(hot.apexZ < soft.apexZ, 'arc flattens');
  assert(hot.depth > soft.depth, 'target deepens');
});

test('lob apex scales with charge and always clears CPU reach', () => {
  assert(lobParams(0).apexZ > MAX_HIT_HEIGHT, 'even a dead lob apexes above reach');
  assert(lobParams(1).apexZ > lobParams(0.3).apexZ, 'charge buys height');
  assert(lobParams(1).apexZ <= 13.5, 'sane ceiling');
});

test('smash barely rises and compresses hard', () => {
  const sp = smashParams(6, 1);
  assert(sp.apexZ <= 6.5, 'apex hugs the contact point');
  assert(sp.timeScale <= 0.45, 'full-power smash is heavily punched');
  assert(smashParams(6, 0).timeScale > sp.timeScale, 'power compresses');
});

// --- ball physics through the new parameters ---

test('full-charge lob is unreachable when it crosses the net', () => {
  const ball = new Ball();
  ball.placeAt(10, 40, 2);
  ball.launchTo(10, 4, lobParams(1).apexZ);
  let zAtNet = 0;
  let prevY = ball.y;
  for (let i = 0; i < 4000 && ball.inFlight; i++) {
    ball.update(1 / 240);
    if (prevY > NET_Y && ball.y <= NET_Y) zAtNet = ball.z;
    prevY = ball.y;
  }
  assert(zAtNet > MAX_HIT_HEIGHT, `lob crossed the net at z=${zAtNet.toFixed(2)}`);
});

test('smash leaves the paddle heading down and lands fast', () => {
  const ball = new Ball();
  ball.placeAt(10, 24, 6);
  const sp = smashParams(6, 1);
  ball.launchTo(10, 9, sp.apexZ, sp.timeScale);
  assert(ball.vz < 0, `vz=${ball.vz.toFixed(2)} should be downward`);
  assert(ball.predictLanding().t < 0.5, 'lands in under half a second');
});

// --- around-the-post geometry ---

test('crossing inside the posts below the tape is net contact', () => {
  const hit = netCrossing({ x: 10, y: 23, z: 2 }, { x: 10, y: 21, z: 2 });
  assertEqual(hit && hit.kind, 'contact');
  assert(Math.abs(hit.zAtNet - 2) < 1e-9, 'interpolated z');
});

test('the same ball outside the posts passes around', () => {
  const wide = COURT_W + 1.5;
  const hit = netCrossing({ x: wide, y: 23, z: 2 }, { x: wide, y: 21, z: 2 });
  assertEqual(hit && hit.kind, 'around');
});

test('clearing the tape is no interaction', () => {
  assertEqual(netCrossing({ x: 10, y: 23, z: 4 }, { x: 10, y: 21, z: 4 }), null);
});

test('no net-plane crossing, no interaction', () => {
  assertEqual(netCrossing({ x: 10, y: 26, z: 1 }, { x: 10, y: 24, z: 1 }), null);
});

test('skinny court narrows the post span', () => {
  // x=6 is inside the full court but outside a 14 ft strip starting at 4.5.
  const hit = netCrossing({ x: 2, y: 23, z: 2 }, { x: 2, y: 21, z: 2 }, 4.5, 18.5);
  assertEqual(hit && hit.kind, 'around');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/depth.test.js`
Expected: ERR_MODULE_NOT_FOUND for `../shots.js`.

- [ ] **Step 3: Implement `shots.js` and the `court.js` helper**

Create `shots.js`:

```js
// Shot-tuning math shared by the player and CPU. Pure — no DOM, no state —
// so the risk/reward curves are unit-testable.

// A drive contacting the ball at or above this height becomes an overhead
// smash (see game.js playerShot and cpu.js chooseShot).
export const SMASH_HEIGHT = 5.5; // ft

// Charged serve: power trades a safe high arc for depth and pace, paid for
// with scatter — a fully cooked serve genuinely risks a service fault.
export function serveParams(power) {
  return {
    apexZ: 9 - 2.5 * power,
    timeScale: 1 - 0.25 * power,
    err: 1 + 2.5 * power,
    depth: 6 * power, // unaimed serves bias this much deeper
  };
}

// Lob: charge buys height (always over the 7 ft reach ceiling at the apex)
// and depth; an under-charged lob falls short and sits up for a smash.
export function lobParams(power) {
  return { apexZ: 9 + 4 * power };
}

// Overhead smash: barely rises above the contact point and is punched
// steeply down. From close it's lethal; from deep the flat path can
// find the net.
export function smashParams(z, power) {
  return {
    apexZ: z + 0.5,
    timeScale: 0.55 - 0.15 * power,
  };
}
```

In `court.js`, after the re-exports at the top (line ~11), add:

```js
export const NET_HEIGHT = 3; // ft

// Classifies one frame of ball travel against the net plane. Returns null
// when the net is not in play (no crossing, or cleared the tape), 'around'
// when the ball crossed below tape height but outside the posts (an
// around-the-post shot — legal), or 'contact' with the interpolated height.
// Posts sit 0.8 ft outside the sidelines; 0.9 adds the ball's radius.
export function netCrossing(prev, cur, left = 0, right = COURT_W) {
  if ((prev.y - NET_Y) * (cur.y - NET_Y) >= 0) return null;
  const f = (NET_Y - prev.y) / (cur.y - prev.y);
  const zAtNet = prev.z + (cur.z - prev.z) * f;
  if (zAtNet >= NET_HEIGHT) return null;
  const xAtNet = prev.x + (cur.x - prev.x) * f;
  if (xAtNet < left - 0.9 || xAtNet > right + 0.9) return { kind: 'around', zAtNet };
  return { kind: 'contact', zAtNet };
}
```

In `package.json`, change the test script:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js",
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: rules suite passes, then depth suite prints `10 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add shots.js court.js tests/depth.test.js package.json
git commit -m "feat: pure shot math (serve/lob/smash) and net-crossing geometry"
```

---

### Task 2: Around-the-post wiring in `game.js`

**Files:**
- Modify: `game.js` (NET_HEIGHT import, `prevBallX`, `handleNetCrossing`, `atpShot` flag + banner)

**Interfaces:**
- Consumes: `netCrossing(prev, cur, left, right)` and `NET_HEIGHT` from `court.js` (Task 1).
- Produces: nothing new for later tasks; `atpShot` stays module-local.

- [ ] **Step 1: Replace the local net logic**

Remove `const NET_HEIGHT = 3; // ft` from the top of `game.js` and instead extend the court import:

```js
import {
  setupCanvas, drawCourt, drawNet, netCrossing,
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X, NET_HEIGHT,
} from './court.js';
```

Add state next to `prevBallY`/`prevBallZ` (line ~168):

```js
let prevBallX = 0;
let atpShot = false; // last shot went around the post (outside the net span)
```

Replace `handleNetCrossing()` with:

```js
// The net is physical: a ball clipping the tape may tumble over and stay
// live (net cord); a ball hit squarely into the net drops back on the
// hitter's side. A ball crossing outside the posts — around the post —
// never touches the net and stays live at any height.
function handleNetCrossing() {
  const hit = netCrossing(
    { x: prevBallX, y: prevBallY, z: prevBallZ },
    ball,
    courtLeft(),
    courtRight(),
  );
  if (!hit) return;

  if (hit.kind === 'around') {
    atpShot = true;
    sfx.ooh();
    return;
  }

  sfx.net();
  sfx.ooh();
  fx.spawnNet(ball.x, NET_Y);
  fx.shake(0.35);

  if (hit.zAtNet > NET_HEIGHT - 0.45 && Math.random() < 0.35) {
    // Net cord: the ball clips the tape and dribbles over.
    ball.vy *= 0.3;
    ball.vx *= 0.5;
    ball.vz = Math.min(ball.vz, 1);
    return;
  }

  // Into the net: the ball pops back off the net and drops on the
  // hitter's side.
  ball.y = NET_Y + (prevBallY > NET_Y ? 0.5 : -0.5);
  ball.vy = -ball.vy * 0.22;
  ball.vx *= 0.35;
  ball.vz = Math.min(ball.vz, 0.5);
  netRebound = true;
}
```

Track `prevBallX` everywhere `prevBallY` is set — in `serve()` (line ~428) and in `updateRally()` (line ~670):

```js
prevBallX = ball.x;
prevBallY = ball.y;
prevBallZ = ball.z;
```

Reset `atpShot` at every fresh launch, i.e. wherever `netRebound = false;` appears (in `serve()`, in `botHit()`, and in the player-hit branch of `handleHits()`):

```js
netRebound = false;
atpShot = false;
```

In `updateRally()`'s result handling, extend the banner override:

```js
if (netRebound) result.reason = 'Netted!';
else if (atpShot) result.reason = `Around the post! ${result.reason}`;
```

- [ ] **Step 2: Run the suites**

Run: `npm test && node tests/doubles.test.js && node tests/balance.test.js medium`
Expected: all pass (ATP is rare for bots; this verifies no regression).

- [ ] **Step 3: Commit**

```bash
git add game.js court.js
git commit -m "feat: around-the-post shots pass outside the net posts"
```

---

### Task 3: Charged serve (player + CPU) and bot adaptation

**Files:**
- Modify: `game.js` (serving-state charging, `serve(power)`, banner text, `#demo` auto-serve)
- Modify: `tests/bot.js` (press-then-release serving)
- Modify: `tests/doubles.test.js`, `tests/balance.test.js` (same — both hold Space forever and would deadlock at the first serve)
- Modify: `tests/depth.test.js` (game-harness serve test)

**Interfaces:**
- Consumes: `serveParams(power)` from `shots.js` (Task 1).
- Produces: `serve(power = 0.25)` — later tasks don't call it, but the frame loop's serving branch changes shape (release fires the serve).

- [ ] **Step 1: Write the failing game-harness test**

Append to `tests/depth.test.js` (after the pure tests, before the summary lines — move the summary to the very end of the file):

```js
// --- charged serve, through the real game loop ---

import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');
const { ball: gameBall, getState } = window.__pickleball;

dom.startGame('medium');
let clock = 0;
const step = () => { clock += 1000 / 60; dom.step(clock); };

test('holding SPACE charges; releasing fires a flat, fast serve', () => {
  assertEqual(getState(), 'serving');
  dom.keyDown('Space');
  for (let i = 0; i < 90; i++) step(); // 1.5 s — charge caps at full
  assertEqual(getState(), 'serving', 'holding must not serve');
  dom.keyUp('Space');
  step();
  assertEqual(getState(), 'rally', 'release serves');
  const t = gameBall.predictLanding().t;
  assert(t < 1.05, `full-charge serve flight ${t.toFixed(2)}s (tap is ~1.4s)`);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/depth.test.js`
Expected: the new test FAILS — with the current code, holding Space serves instantly, so the `holding must not serve` assertion trips.

- [ ] **Step 3: Implement the charged serve**

In `game.js`, import the shot math (extend the existing imports):

```js
import { SMASH_HEIGHT, serveParams, lobParams, smashParams } from './shots.js';
```

(Only `serveParams` is used in this task; the rest arrive in Tasks 4–5 — importing once avoids churn.)

Add state near `serveTimer` (line ~166): `let serveCharging = false;` and reset it in `startServe()` right before `state = 'serving';`:

```js
serveCharging = false;
```

Replace the serving branch of `frame()`:

```js
} else if (state === 'serving') {
  if (score.servingSide === PLAYER) {
    // Hold to charge, release to serve. Power trades the safe high arc
    // for depth and pace at the cost of scatter — see serveParams.
    const holding = keys.has('Space') || mouseHeld;
    if (holding) {
      serveCharging = true;
      charge = Math.min(1, charge + dt / 0.8);
    } else if (serveCharging) {
      serveCharging = false;
      const power = Math.max(0.25, charge);
      charge = 0;
      serve(power);
    }
  } else {
    cpu.update(dt, ball);
    player.update(dt, keys);
    serveTimer -= dt;
    if (serveTimer <= 0) serve();
  }
}
```

Change `serve()` to `serve(power = 0.25)` and replace its launch block:

```js
const baseTx = variant === 'skinny' ? serveX : COURT_W - serveX;
const minTx = courtLeft() + 1;
const maxTx = courtRight() - 1;
if (server === PLAYER) {
  const sp = serveParams(power);
  const e = sp.err;
  let tx;
  let ty;
  if (aim.active) {
    // Loose clamps: with enough scatter a hot serve can fly long or
    // drop short into the kitchen — both real service faults.
    tx = clamp(aim.x + rand(-e, e), minTx, maxTx);
    ty = clamp(aim.y + rand(-e, e), -2, KITCHEN_TOP + 2);
  } else {
    let steer = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
    tx = clamp(baseTx + steer * 3 + rand(-e, e), minTx, maxTx);
    ty = rand(6, 12) - sp.depth + rand(-e, e) * 0.5;
  }
  ball.launchTo(tx, ty, sp.apexZ + rand(-0.3, 0.3), sp.timeScale);
} else {
  // CPU serve power rides its aggression: bangers bomb serves (and
  // sometimes fault); patient types float them in.
  const cpuPower = Math.min(1, cpu.difficulty.aggression + 0.15);
  const sp = serveParams(cpuPower);
  const err = cpu.difficulty.aimError * (0.5 + 0.5 * cpuPower);
  const tx = clamp(baseTx + rand(-err, err), minTx, maxTx);
  const ty = clamp(rand(33, 41) + sp.depth * 0.5 + rand(-err, err), 30, COURT_L + 1.5);
  ball.launchTo(tx, ty, sp.apexZ + rand(-0.3, 0.3), sp.timeScale);
}
```

Also set `prevBallX = ball.x;` alongside the existing `prevBallY`/`prevBallZ` assignments at the end of `serve()` (done in Task 2 — verify it survived).

Update the serve banner in `startServe()`:

```js
ui.showBanner(touchMode
  ? 'Your serve — hold DRIVE to charge'
  : 'Your serve — hold SPACE to charge, release to serve', 0);
```

`#demo` bootstrap: the current `keys.add('Space')` would charge forever and never serve. Add `let demoAutoServe = false;` next to the other mode flags, set it in the demo branch (and delete the `keys.add('Space')` line):

```js
if (hash.startsWith('#demo')) {
  // Dev/demo mode: start immediately on medium and auto-serve.
  if (hash.includes('3d') && viewMode !== '3d') toggleView();
  demoAutoServe = true;
  ui.hideOverlays();
  startGame('medium', { variant: hash.includes('skinny') ? 'skinny' : 'singles' });
}
```

and short-circuit the player half of the serving branch:

```js
if (score.servingSide === PLAYER) {
  if (demoAutoServe) {
    serve(0.5);
  } else {
    const holding = keys.has('Space') || mouseHeld;
    ...
  }
}
```

- [ ] **Step 4: Adapt the test bots**

`tests/doubles.test.js` and `tests/balance.test.js` both hold Space indefinitely to auto-serve — with charge-and-release they'd charge forever and the game would stall in `serving`. Replace their Space handling with the same press-then-release pump used in `bot.js`.

`tests/doubles.test.js`: delete the standalone `dom.keyDown('Space');` (line 12) and pump inside the loop (grab `getState` from `window.__pickleball` after the import):

```js
const { getState } = window.__pickleball;

let time = 0;
let frames = 0;
let spaceHeld = false;
let holdFrames = 0;
try {
  while (frames < 60 * 180) {
    // Press-and-release Space to serve (and to skip replays); the player
    // otherwise stands still — the CPU partner does the playing.
    const st = getState();
    if (st === 'serving' || st === 'replay') {
      if (!spaceHeld) { dom.keyDown('Space'); spaceHeld = true; holdFrames = 0; }
      else if (st === 'serving' && ++holdFrames > 20) { dom.keyUp('Space'); spaceHeld = false; }
    } else if (spaceHeld) {
      dom.keyUp('Space');
      spaceHeld = false;
    }
    time += 1000 / 60;
    dom.step(time);
    frames++;
    if (dom.elements['gameover-title'].textContent) break;
  }
}
```

`tests/balance.test.js`: delete the standalone `dom.keyDown('Space');` (line 19) and replace the Space block inside the loop:

```js
let serveFrames = 0;
while (frames < MAX_FRAMES) {
  botThink();
  // Press-and-release Space to serve; hold through rallies only when
  // testing always-charged play.
  const st = getState();
  if (st === 'serving') {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); serveFrames = 0; }
    else if (++serveFrames > 20) { dom.keyUp('Space'); held.delete('Space'); }
  } else if (alwaysCharge) {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); }
  } else if (held.has('Space')) {
    dom.keyUp('Space');
    held.delete('Space');
  }
  time += FRAME;
  dom.step(time);
  frames++;
  if (dom.elements['gameover-title'].textContent) break;
}
```

`tests/bot.js`: add `let serveFrames = 0;` near `let time = 0;` and replace the serving/replay branch:

```js
if (st === 'serving' || st === 'replay') {
  if (!held.has('Space')) {
    dom.keyDown('Space');
    held.add('Space');
    serveFrames = 0;
  } else if (st === 'serving' && ++serveFrames > 20) {
    // Charge-and-release serve: release after ~a third of a second.
    dom.keyUp('Space');
    held.delete('Space');
  }
} else if (st === 'rally') {
```

- [ ] **Step 5: Run everything**

Run: `npm test && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: all pass. Watch the ladder test especially (bot must still beat rung 1).

- [ ] **Step 6: Commit**

```bash
git add game.js tests/bot.js tests/depth.test.js
git commit -m "feat: hold-to-charge serves with power/fault trade-off"
```

---

### Task 4: Lob stroke (F key + fifth touch button)

**Files:**
- Modify: `game.js` (SWING_KEYS, `queueSwing`, `playerShot` lob branch, stroke badge)
- Modify: `index.html` (LOB touch button, Controls help line)
- Modify: `style.css` (DRIVE spans the touch grid row)

**Interfaces:**
- Consumes: `lobParams(power)` from `shots.js` (Task 1).
- Produces: `swingMods.lob` (boolean) — Task 5's smash branch must skip lobs.

- [ ] **Step 1: Wire the input**

In `game.js` add `KeyF`:

```js
// Space/mouse = drive, Shift = dink, E = topspin, Q = slice, F = lob.
const SWING_KEYS = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyF'];
```

In `queueSwing`, a lob is exclusive — it overrides dink/spin:

```js
const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
const lob = source === 'KeyF' || keys.has('KeyF');
swingMods = {
  lob,
  dink: !lob && (source === 'ShiftLeft' || source === 'ShiftRight' || shiftHeld),
  spin: lob ? 0 : (source === 'KeyE' || keys.has('KeyE') ? 1
    : (source === 'KeyQ' || keys.has('KeyQ') ? -1 : 0)),
};
```

- [ ] **Step 2: The lob branch in `playerShot`**

At the top of `playerShot()`, capture the raw charge before the throttle (the height throttle is for drives — lobs are usually taken low):

```js
function playerShot() {
  // Modifiers were locked in when the swing started (queueSwing).
  const { dink, spin, lob } = swingMods;
  const held = charge;
  // You can only unload on a ball you take high — power on a low ball is
  // throttled so a full meter doesn't just drill the net.
  const power = held * Math.max(0.3, Math.min(1, ball.z / 4));
  charge = 0;

  if (lob) {
    // Loft it over an opponent at the net: charge buys height and depth.
    // An under-charged lob falls short and sits up for a smash; a deep
    // one risks sailing long under stress scatter.
    const dir = player.moveDir();
    const tx = aim.active ? aim.x : clamp(CENTER_X + dir.dx * 7, 1, COURT_W - 1);
    const tyAimed = aim.active ? clamp(aim.y, 1, NET_Y - 3) : 4;
    const short = NET_Y - 6; // a dead lob drops at the opponent's kitchen
    return {
      tx: clamp(tx + rand(-1, 1), 1, COURT_W - 1),
      ty: short + (tyAimed - short) * held,
      apexZ: lobParams(held).apexZ,
      power: 0,
      spin: 0,
    };
  }

  if (dink) {
    // ... existing dink branch unchanged ...
```

- [ ] **Step 3: Badge + touch button + help**

`drawStrokeBadge` — LOB replaces the modifier labels (it's exclusive):

```js
const labels = [];
if (keys.has('KeyF')) {
  labels.push('LOB');
} else {
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) labels.push('DINK');
  if (keys.has('KeyE')) labels.push('TOPSPIN');
  else if (keys.has('KeyQ')) labels.push('SLICE');
}
```

`index.html` touch buttons — add LOB so the grid reads LOB/TOP, SLICE/DINK, DRIVE:

```html
<div id="touch-buttons">
  <button class="swing-btn" data-swing="KeyF">LOB</button>
  <button class="swing-btn" data-swing="KeyE">TOP</button>
  <button class="swing-btn" data-swing="KeyQ">SLICE</button>
  <button class="swing-btn" data-swing="ShiftLeft">DINK</button>
  <button class="swing-btn big" data-swing="Space">DRIVE</button>
</div>
```

`style.css` — DRIVE fills its own row:

```css
.swing-btn.big {
  background: rgba(184, 233, 134, 0.45);
  grid-column: 1 / -1;
  border-radius: 30px;
}
```

`index.html` Controls details — update the stroke line:

```html
<p><strong>Drive:</strong> Space / mouse &nbsp;·&nbsp; <strong>Dink:</strong> Shift
   &nbsp;·&nbsp; <strong>Topspin:</strong> E &nbsp;·&nbsp; <strong>Slice:</strong> Q
   &nbsp;·&nbsp; <strong>Lob:</strong> F</p>
<p><strong>Serve:</strong> hold Space to charge — power trades a safe arc
   for depth and pace &nbsp;·&nbsp; <strong>Pause:</strong> Esc
   &nbsp;·&nbsp; <strong>Mute:</strong> M &nbsp;·&nbsp; <strong>Camera:</strong> V</p>
```

- [ ] **Step 4: Run the suites**

Run: `npm test && node tests/doubles.test.js`
Expected: all pass (the bot never presses F; this is a no-regression check — the physics of the lob itself is covered by Task 1's `lobParams` tests).

- [ ] **Step 5: Commit**

```bash
git add game.js index.html style.css
git commit -m "feat: lob stroke on F with its own touch button"
```

---

### Task 5: Overhead smash (player + CPU) with sound and flair

**Files:**
- Modify: `game.js` (smash branch in `playerShot`, feedback in `handleHits`/`botHit`)
- Modify: `cpu.js` (smash branch in `chooseShot`)
- Modify: `audio.js` (`sfx.smash`)
- Modify: `fx.js` (floating text)
- Modify: `tests/depth.test.js` (CPU smash unit test)

**Interfaces:**
- Consumes: `SMASH_HEIGHT`, `smashParams(z, power)` from `shots.js`; `swingMods.lob` from Task 4.
- Produces: shot objects may carry `smash: true` (read by `handleHits`/`botHit` for feedback only).

- [ ] **Step 1: Write the failing CPU test**

Append to the pure section of `tests/depth.test.js` (before the game-harness section):

```js
// --- CPU smash branch ---

import { Cpu } from '../cpu.js';

test('cpu smashes any ball it takes above SMASH_HEIGHT', () => {
  const cpu = new Cpu('top');
  cpu.setDifficulty('medium');
  const highBall = { x: 10, y: 6, z: 6, vx: 0, vy: -10, vz: 0 };
  const shot = cpu.chooseShot(highBall, { x: 5, y: 30 });
  assert(shot.smash, 'flagged as a smash');
  assert(shot.apexZ <= highBall.z + 0.5 + 1e-9, 'punched, not lifted');
  assert(shot.timeScale < 0.7, 'compressed flight');
});

test('cpu below smash height plays a normal shot', () => {
  const cpu = new Cpu('top');
  cpu.setDifficulty('medium');
  const lowBall = { x: 10, y: 6, z: 2, vx: 0, vy: -10, vz: 0 };
  const shot = cpu.chooseShot(lowBall, { x: 5, y: 30 });
  assert(!shot.smash, 'no smash flag on a low ball');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node tests/depth.test.js`
Expected: FAIL — `chooseShot` has no smash branch yet (first new test trips on `shot.smash`).

- [ ] **Step 3: Implement**

`cpu.js` — import and branch at the top of `chooseShot` (before the lob branch):

```js
import { SMASH_HEIGHT } from './shots.js';
```

```js
chooseShot(ball, playerPos) {
  const p = this.difficulty;
  const err = p.aimError;

  // A ball taken overhead is smashed: barely lifted, punched steeply
  // down and away from the player. This is what punishes short lobs.
  if (ball.z >= SMASH_HEIGHT) {
    const awayX = playerPos.x < CENTER_X
      ? rand(CENTER_X + 2, COURT_W - 2)
      : rand(2, CENTER_X - 2);
    return {
      tx: clampX(awayX + rand(-err, err)),
      ty: this.m(rand(KITCHEN_BOTTOM + 1, COURT_L - 2)) + rand(-err, err),
      apexZ: ball.z + 0.5,
      timeScale: 0.6 - 0.2 * p.aggression,
      spin: 0.3,
      smash: true,
    };
  }
  // ... existing lob/dink/drive branches unchanged ...
```

`game.js` — in `playerShot`, insert between the dink branch and the drive comment (any non-dink, non-lob swing taken high becomes the overhead):

```js
// Overhead smash: any swing (drive or spin) contacting the ball above
// SMASH_HEIGHT is punched steeply down at full power.
if (ball.z >= SMASH_HEIGHT) {
  const sp = smashParams(ball.z, power);
  const dir = player.moveDir();
  return {
    tx: aim.active ? aim.x : clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
    ty: aim.active ? aim.y : clamp(9 + dir.dy * 6, 2, NET_Y - 2),
    apexZ: sp.apexZ,
    power,
    timeScale: sp.timeScale,
    spin: 0,
    smash: true,
  };
}
```

`game.js` — feedback. In the player-hit branch of `handleHits`, replace the sfx/shake lines:

```js
if (shot.dink) sfx.dink();
else if (shot.smash) sfx.smash();
else sfx.paddle(shot.power);
if (shot.smash) {
  fx.shake(0.8);
  fx.text(ball.x, ball.y, 'SMASH!');
} else if ((shot.timeScale ?? 1) < 0.85) {
  fx.shake(0.5);
}
```

In `botHit`, replace `sfx.paddle(0.25);` with:

```js
if (shot.smash) {
  sfx.smash();
  fx.shake(0.6);
  fx.text(ball.x, ball.y, 'SMASH!');
} else {
  sfx.paddle(0.25);
}
```

`audio.js` — add to the `sfx` object:

```js
// Overhead smash: the paddle pop scaled up — a hard crack, no beep.
smash() {
  if (!ready()) return;
  noise(0.09, 2600, 1.2, 0.55, 0, 0.002);
  note('sine', 330, 70, 0.09, 0.3);
},
```

`fx.js` — floating text. In the constructor add `this.texts = [];`. Add the method:

```js
// Floating caption ("SMASH!") that rises and fades above a court point.
text(x, y, str) {
  this.texts.push({ x, y, z: 5, str, life: 0.7, maxLife: 0.7 });
}
```

In `update(dt)` add:

```js
for (const t of this.texts) {
  t.life -= dt;
  t.z += 4 * dt;
}
this.texts = this.texts.filter((t) => t.life > 0);
```

At the end of `drawOver` (before `ctx.globalAlpha = 1;`):

```js
for (const t of this.texts) {
  const p = view.toPx(t.x, t.y);
  const s = view.scaleAt(t.y);
  ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
  ctx.font = `800 ${Math.max(14, Math.round(s * 0.8))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  const py = p.py - view.zOffset(t.y, t.z);
  ctx.strokeText(t.str, p.px, py);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(t.str, p.px, py);
}
```

- [ ] **Step 4: Run everything**

Run: `npm test && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: all pass. The ladder test matters most — CPU smashes make opponents stronger, but they only trigger on high balls near the CPU, which the test bot rarely offers.

- [ ] **Step 5: Commit**

```bash
git add game.js cpu.js audio.js fx.js tests/depth.test.js
git commit -m "feat: contextual overhead smash for player and CPU"
```

---

### Task 6: Docs + end-to-end verification

**Files:**
- Modify: `README.md` (controls table, gameplay notes)
- Verify: full suite + a browser session (headless Chrome + key-dispatch harness)

- [ ] **Step 1: README**

Controls table — add after the Topspin/Slice row:

```markdown
| F | Lob swing — a high arc over an opponent crowding the net. Charge sets height and depth; a weak lob sits up and gets smashed. |
```

Replace the Serve row:

```markdown
| Space | Serve — hold to charge: more power serves deeper and faster but scatters more, so a fully cooked serve can fault |
```

Add to the gameplay paragraph (after "Balls touching a line are in."):

```markdown
Balls taken overhead (above 5.5 ft) become smashes — steeply punched and
nearly unreturnable up close. The net posts are real: a wide ball can
legally pass *around* the post at any height, and the banner will say so.
```

- [ ] **Step 2: Full suite**

Run: `npm test && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: all pass.

- [ ] **Step 3: End-to-end in a browser**

Serve locally (`python3 -m http.server 8123`), then screenshot with headless Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --screenshot=... --window-size=900,1100 --virtual-time-budget=6000 <url>`) using a throwaway harness page (same-origin iframe; delete after):

- `#demo` hash with scripted `KeyboardEvent`s dispatched into the iframe's window: hold Space ≥1 s then release → screenshot shows the charge meter, then a serve in flight.
- Dispatch F-down/F-up as a ball approaches → LOB badge visible; ball arcs high (large gap between ball and its shadow).
- `#touch` hash → screenshot shows five touch buttons with DRIVE spanning the bottom row.
- Check the console for errors via a `console.error` hook in the harness if anything looks off.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: lob, smash, charged serve, around-the-post"
```
