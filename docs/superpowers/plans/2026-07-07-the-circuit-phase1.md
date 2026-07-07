# The Circuit — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the roguelike core of The Circuit — a 9-rung run with escalating match lengths, a between-match perk draft that changes how you play, Trophies that bank every run, and a minimal Pro Shop that unlocks more perks.

**Architecture:** Two new pure, headless-testable modules — `perks.js` (a catalog plus a `PerkSet` that answers the queries the game asks) and `circuit.js` (the run state machine + draft). `game.js` holds one `activePerks` PerkSet that is empty in every non-Circuit mode (so all perk hooks are no-ops elsewhere) and drives the run between matches. `progress.js` gains Circuit meta persistence; `ui.js`/`index.html` gain four overlays.

**Tech Stack:** Vanilla ES modules, no build step, plain-node test scripts (`tests/*.test.js` with local `test`/`assert` helpers), headless via `tests/dom-stub.js`.

## Global Constraints

- No dependencies, no build step (repo rule).
- `rules.js` scoring logic stays pure and DOM-free.
- Coordinates in feet; net at y=22, kitchen y 15..29, player on the y>22 side; `COURT_W=26`, `COURT_L=44`.
- Perk hooks must be no-ops outside the Circuit (empty `PerkSet` returns neutral values), so every existing suite keeps passing: `npm test` (runs `rules` + `depth`), `node tests/doubles.test.js`, `node tests/balance.test.js medium`, `node tests/ladder.test.js`.
- New DOM element ids must be registered in `tests/dom-stub.js` `ids` list or headless tests throw.
- Trophies currency is named "Trophies" in all copy.

---

### Task 1: Variable match target in `Score.winner`

**Files:**
- Modify: `rules.js` (`Score.winner`, ~line 45)
- Test: `tests/rules.test.js`

**Interfaces:**
- Produces: `Score.prototype.winner(target = 11)` — first side with score ≥ `target` and a lead ≥ 2, else `null`.

- [ ] **Step 1: Write the failing test**

Add to `tests/rules.test.js` (before the final summary lines):

```js
test('winner respects a custom target (first to 4, win by 2)', () => {
  const s = new Score();
  s[PLAYER] = 4; s[CPU] = 3;
  assertEqual(s.winner(4), null, 'must win by 2');
  s[CPU] = 2;
  assertEqual(s.winner(4), PLAYER, '4-2 wins a first-to-4');
  assertEqual(s.winner(), null, 'default target is still 11');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/rules.test.js`
Expected: FAIL on `winner respects a custom target` (winner ignores the argument).

- [ ] **Step 3: Implement**

In `rules.js` replace the `winner` method:

```js
  winner(target = 11) {
    for (const side of [PLAYER, CPU]) {
      if (this[side] >= target && this[side] - this[other(side)] >= 2) return side;
    }
    return null;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: rules suite passes (incl. the new test), then depth suite passes.

- [ ] **Step 5: Commit**

```bash
git add rules.js tests/rules.test.js
git commit -m "feat: Score.winner accepts a match target (first to N)"
```

---

### Task 2: `perks.js` — catalog + `PerkSet`

**Files:**
- Create: `perks.js`
- Create: `tests/perks.test.js`
- Modify: `package.json` (add perks suite to `test`)

**Interfaces:**
- Produces: `PERKS` (array of `{ id, name, desc, rarity, cost }`), `perkById(id)`, and `class PerkSet`:
  - `new PerkSet(ids = [])`, `has(id)`, `owned()` → id array
  - `powerMult()` → number (default 1)
  - `throttleFloor()` → number (default 0.3; Overdrive 1.0)
  - `scatterMult(shot)` → number (default 1; `shot` may have `.dink`/`.lob`/`.smash`)
  - `moveSpeedMult()` → number (default 1)
  - `reachBonus()` → feet (default 0)
  - `smashHeight()` → feet (default 5.5)
  - `smashBonus()` → power add (default 0)
  - `netMagnet()` → boolean
  - `kitchenTolerance()` → feet (default 0)
  - `resetGame()` — re-arms once-per-game consumables
  - `takeServeLet()` → boolean (true at most once/game if Sure Serve owned)
  - `takeWhiffGrace()` → boolean (true at most once/game if Wall owned)

- [ ] **Step 1: Write the failing tests**

Create `tests/perks.test.js`:

```js
import { PERKS, perkById, PerkSet } from '../perks.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('catalog has 10 perks with the required shape', () => {
  assertEqual(PERKS.length, 10);
  for (const p of PERKS) {
    assert(p.id && p.name && p.desc, `perk ${p.id} missing fields`);
    assert(['common', 'uncommon', 'rare'].includes(p.rarity), `bad rarity ${p.rarity}`);
    assert(typeof p.cost === 'number', `perk ${p.id} needs a cost`);
  }
  assert(perkById('cannon'), 'cannon exists');
  assertEqual(perkById('nope'), undefined);
});

test('empty set is fully neutral', () => {
  const s = new PerkSet();
  assertEqual(s.powerMult(), 1);
  assertEqual(s.throttleFloor(), 0.3);
  assertEqual(s.scatterMult({}), 1);
  assertEqual(s.scatterMult({ dink: true }), 1);
  assertEqual(s.moveSpeedMult(), 1);
  assertEqual(s.reachBonus(), 0);
  assertEqual(s.smashHeight(), 5.5);
  assertEqual(s.smashBonus(), 0);
  assertEqual(s.netMagnet(), false);
  assertEqual(s.kitchenTolerance(), 0);
});

test('Cannon boosts power and scatter; Feather zeroes dink/lob scatter', () => {
  const cannon = new PerkSet(['cannon']);
  assert(cannon.powerMult() > 1, 'cannon powers up');
  assert(cannon.scatterMult({}) > 1, 'cannon scatters drives more');
  const feather = new PerkSet(['feather']);
  assertEqual(feather.scatterMult({ dink: true }), 0);
  assertEqual(feather.scatterMult({ lob: true }), 0);
  assertEqual(feather.scatterMult({}), 1, 'feather leaves drives alone');
  // Feather wins on a dink even stacked with Cannon.
  assertEqual(new PerkSet(['cannon', 'feather']).scatterMult({ dink: true }), 0);
});

test('movement, reach, smash, kitchen, net perks', () => {
  assert(new PerkSet(['quickfeet']).moveSpeedMult() > 1);
  assert(new PerkSet(['longreach']).reachBonus() > 0);
  assert(new PerkSet(['smashbro']).smashHeight() < 5.5);
  assert(new PerkSet(['smashbro']).smashBonus() > 0);
  assert(new PerkSet(['kitchenninja']).kitchenTolerance() > 0);
  assertEqual(new PerkSet(['netmagnet']).netMagnet(), true);
  assertEqual(new PerkSet(['overdrive']).throttleFloor(), 1);
});

test('Sure Serve and Wall fire once per game then re-arm on reset', () => {
  const s = new PerkSet(['sureserve', 'wall']);
  assertEqual(s.takeServeLet(), true);
  assertEqual(s.takeServeLet(), false, 'only once');
  assertEqual(s.takeWhiffGrace(), true);
  assertEqual(s.takeWhiffGrace(), false);
  s.resetGame();
  assertEqual(s.takeServeLet(), true, 're-armed');
  assertEqual(s.takeWhiffGrace(), true);
  assertEqual(new PerkSet().takeServeLet(), false, 'not owned → never');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/perks.test.js`
Expected: ERR_MODULE_NOT_FOUND for `../perks.js`.

- [ ] **Step 3: Implement `perks.js`**

Create `perks.js`:

```js
// Roguelike perks for The Circuit. A PerkSet is built from a list of owned
// perk ids and answers the queries game.js asks at its existing decision
// points. An empty set returns neutral values, so perks are a no-op in
// every other mode. Pure — no DOM, no game state.

export const PERKS = [
  { id: 'cannon', name: 'Cannon', rarity: 'common', cost: 0,
    desc: 'Drives and serves hit harder — but scatter more.' },
  { id: 'feather', name: 'Feather', rarity: 'common', cost: 0,
    desc: 'Your dinks and lobs never scatter.' },
  { id: 'quickfeet', name: 'Quick Feet', rarity: 'common', cost: 0,
    desc: 'Move noticeably faster.' },
  { id: 'longreach', name: 'Long Reach', rarity: 'common', cost: 0,
    desc: 'Reach further for every ball.' },
  { id: 'sureserve', name: 'Sure Serve', rarity: 'common', cost: 0,
    desc: 'Your first service fault each game is a let.' },
  { id: 'netmagnet', name: 'Net Magnet', rarity: 'uncommon', cost: 0,
    desc: 'Your net-cord balls always dribble over and stay live.' },
  { id: 'wall', name: 'Wall', rarity: 'uncommon', cost: 30,
    desc: 'Your first mistimed swing each game doesn\'t whiff.' },
  { id: 'kitchenninja', name: 'Kitchen Ninja', rarity: 'uncommon', cost: 40,
    desc: 'Volley a step inside the kitchen without faulting.' },
  { id: 'smashbro', name: 'Smash Bro', rarity: 'uncommon', cost: 40,
    desc: 'Smash balls you take lower, and hit them harder.' },
  { id: 'overdrive', name: 'Overdrive', rarity: 'rare', cost: 60,
    desc: '+50% power and flatten any ball — but you scatter far more.' },
];

export function perkById(id) {
  return PERKS.find((p) => p.id === id);
}

export class PerkSet {
  constructor(ids = []) {
    this.ids = new Set(ids);
    this.resetGame();
  }

  has(id) { return this.ids.has(id); }

  owned() { return [...this.ids]; }

  powerMult() {
    let m = 1;
    if (this.has('cannon')) m *= 1.25;
    if (this.has('overdrive')) m *= 1.5;
    return m;
  }

  throttleFloor() {
    return this.has('overdrive') ? 1 : 0.3;
  }

  scatterMult(shot = {}) {
    if (this.has('feather') && (shot.dink || shot.lob)) return 0;
    let m = 1;
    if (this.has('cannon')) m *= 1.4;
    if (this.has('overdrive')) m *= 1.5;
    return m;
  }

  moveSpeedMult() { return this.has('quickfeet') ? 1.15 : 1; }

  reachBonus() { return this.has('longreach') ? 0.6 : 0; }

  smashHeight() { return this.has('smashbro') ? 4.2 : 5.5; }

  smashBonus() { return this.has('smashbro') ? 0.15 : 0; }

  netMagnet() { return this.has('netmagnet'); }

  kitchenTolerance() { return this.has('kitchenninja') ? 1 : 0; }

  resetGame() {
    this.serveLet = this.has('sureserve');
    this.whiffGrace = this.has('wall');
  }

  takeServeLet() {
    if (!this.serveLet) return false;
    this.serveLet = false;
    return true;
  }

  takeWhiffGrace() {
    if (!this.whiffGrace) return false;
    this.whiffGrace = false;
    return true;
  }
}
```

- [ ] **Step 4: Wire the suite in and run it**

In `package.json` change the `test` script:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js && node tests/perks.test.js",
```

Run: `npm test`
Expected: all three suites pass; perks prints `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add perks.js tests/perks.test.js package.json
git commit -m "feat: perks catalog and PerkSet query surface"
```

---

### Task 3: `circuit.js` — run engine + draft

**Files:**
- Create: `circuit.js`
- Create: `tests/circuit.test.js`
- Modify: `package.json` (add circuit suite to `test`)

**Interfaces:**
- Consumes: `ROSTER` from `ladder.js`; `PERKS`/`perkById` from `perks.js`.
- Produces:
  - `CHAMPION` — a boss opponent profile (same shape as a roster entry).
  - `RUNGS` — array of 9 `{ target }`.
  - `matchConfig(rung)` → `{ target, opponent }` for `rung` in 1..9.
  - `newRun()` → `{ rung: 1, perks: [], won: false, alive: true }`.
  - `advance(run)` — mutates: wins the run at the last rung, else `rung++`.
  - `fail(run)` — sets `alive = false`.
  - `rungsCleared(run)` → number.
  - `trophies(run)` → number.
  - `draftOptions(ownedIds, unlockedIds, n = 3, rng = Math.random)` → up to `n` distinct perk ids drawn from `unlockedIds` minus `ownedIds`, rarity-weighted.

- [ ] **Step 1: Write the failing tests**

Create `tests/circuit.test.js`:

```js
import {
  CHAMPION, RUNGS, matchConfig, newRun, advance, fail, rungsCleared, trophies, draftOptions,
} from '../circuit.js';
import { ROSTER } from '../ladder.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('nine rungs with escalating targets', () => {
  assertEqual(RUNGS.length, 9);
  assertEqual(matchConfig(1).target, 4);
  assertEqual(matchConfig(3).target, 4);
  assertEqual(matchConfig(4).target, 7);
  assertEqual(matchConfig(8).target, 7);
  assertEqual(matchConfig(9).target, 11);
});

test('opponents walk the roster then the Champion', () => {
  assertEqual(matchConfig(1).opponent, ROSTER[0]);
  assertEqual(matchConfig(8).opponent, ROSTER[7]);
  assertEqual(matchConfig(9).opponent, CHAMPION);
  assert(CHAMPION.name && CHAMPION.color && CHAMPION.look, 'Champion is a full profile');
});

test('advance climbs then wins at the top', () => {
  const run = newRun();
  assertEqual(run.rung, 1);
  for (let i = 0; i < 8; i++) advance(run);
  assertEqual(run.rung, 9, 'eight wins reach rung 9');
  assert(!run.won, 'not won until the boss falls');
  advance(run);
  assert(run.won, 'winning rung 9 wins the run');
});

test('trophies scale with depth and reward a full clear', () => {
  const lost = newRun(); lost.rung = 5; fail(lost);
  assertEqual(rungsCleared(lost), 4, 'failed at rung 5 → cleared 4');
  const early = newRun(); fail(early);
  const deep = newRun(); deep.rung = 7; fail(deep);
  assert(trophies(deep) > trophies(early), 'deeper banks more');
  const won = newRun(); for (let i = 0; i < 9; i++) advance(won);
  assertEqual(rungsCleared(won), 9);
  assert(trophies(won) > trophies(deep), 'a full clear beats a deep loss');
});

test('draft offers distinct unlocked, unowned perks', () => {
  const unlocked = ['cannon', 'feather', 'quickfeet', 'longreach', 'sureserve', 'netmagnet'];
  const opts = draftOptions(['cannon'], unlocked);
  assertEqual(opts.length, 3);
  assertEqual(new Set(opts).size, 3, 'distinct');
  assert(!opts.includes('cannon'), 'excludes owned');
  for (const id of opts) assert(unlocked.includes(id), 'only unlocked');
});

test('draft never offers more than remain', () => {
  const opts = draftOptions(['cannon', 'feather'], ['cannon', 'feather', 'quickfeet']);
  assertEqual(opts.length, 1);
  assertEqual(opts[0], 'quickfeet');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/circuit.test.js`
Expected: ERR_MODULE_NOT_FOUND for `../circuit.js`.

- [ ] **Step 3: Implement `circuit.js`**

Create `circuit.js`:

```js
// The Circuit run engine: a 9-rung roguelike climb. Pure logic + a draft
// helper. Persistence and UI live elsewhere (progress.js, ui.js, game.js).

import { ROSTER } from './ladder.js';
import { PERKS, perkById } from './perks.js';

// The rung-9 boss: tougher than The Wall, with its own look.
export const CHAMPION = {
  id: 'champion', name: 'The Champion', color: '#ffd700',
  tagline: '“You have to earn this one.”',
  winLine: 'The Champion offers a nod. You take it.',
  loseLine: 'The Champion has seen a thousand challengers. You were one.',
  speed: 17, reaction: 0.08, aimError: 1.3, dinkiness: 0.6, aggression: 0.7, lobbiness: 0.15,
  look: { hair: 'headband', hairColor: '#d4af37', skin: '#c98a52', h: 1.05, w: 1.05 },
};

// Match target (first to N, win by 2) per rung — rising stakes.
export const RUNGS = [
  { target: 4 }, { target: 4 }, { target: 4 },
  { target: 7 }, { target: 7 }, { target: 7 }, { target: 7 }, { target: 7 },
  { target: 11 },
];

// rung is 1-based. 1..8 walk the roster (already easy→hard); 9 is the boss.
export function matchConfig(rung) {
  const cfg = RUNGS[rung - 1];
  const opponent = rung >= RUNGS.length ? CHAMPION : ROSTER[rung - 1];
  return { target: cfg.target, opponent };
}

export function newRun() {
  return { rung: 1, perks: [], won: false, alive: true };
}

export function advance(run) {
  if (run.rung >= RUNGS.length) run.won = true;
  else run.rung += 1;
}

export function fail(run) {
  run.alive = false;
}

export function rungsCleared(run) {
  return run.won ? RUNGS.length : run.rung - 1;
}

export function trophies(run) {
  return rungsCleared(run) * 5 + (run.won ? 25 : 0);
}

const RARITY_WEIGHT = { common: 6, uncommon: 3, rare: 1 };

// Up to n distinct perk ids from unlockedIds minus ownedIds, rarity-weighted.
export function draftOptions(ownedIds, unlockedIds, n = 3, rng = Math.random) {
  const owned = new Set(ownedIds);
  const pool = unlockedIds.filter((id) => !owned.has(id) && perkById(id));
  const picks = [];
  while (picks.length < n && pool.length > 0) {
    const total = pool.reduce((sum, id) => sum + RARITY_WEIGHT[perkById(id).rarity], 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= RARITY_WEIGHT[perkById(pool[idx]).rarity];
      if (r <= 0) break;
    }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return picks;
}
```

- [ ] **Step 4: Wire the suite in and run it**

In `package.json` extend the `test` script:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js && node tests/perks.test.js && node tests/circuit.test.js",
```

Run: `npm test`
Expected: all four suites pass; circuit prints `6 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add circuit.js tests/circuit.test.js package.json
git commit -m "feat: Circuit run engine, boss, and perk draft"
```

---

### Task 4: Circuit meta persistence in `progress.js`

**Files:**
- Modify: `progress.js` (new Circuit section near the stats section)
- Create: `tests/circuit-meta.test.js`
- Modify: `package.json` (add to `test`)

**Interfaces:**
- Consumes: nothing new (uses the existing `read`/`write` localStorage helpers).
- Produces:
  - `loadCircuit()` → `{ trophies, unlocked: string[], bestDepth }`
  - `addTrophies(n)` → new total
  - `spendTrophies(n)` → boolean (false and no change if unaffordable)
  - `unlockPerk(id)` — adds id to `unlocked` (idempotent)
  - `recordRunDepth(d)` — raises `bestDepth`
  - `STARTER_PERKS` — the 6 ids unlocked from the start.

- [ ] **Step 1: Write the failing test**

Create `tests/circuit-meta.test.js`:

```js
// A fresh localStorage per run keeps the test hermetic.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  loadCircuit, addTrophies, spendTrophies, unlockPerk, recordRunDepth, STARTER_PERKS,
} = await import('../progress.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('defaults: zero trophies, six starter perks unlocked', () => {
  const c = loadCircuit();
  assertEqual(c.trophies, 0);
  assertEqual(STARTER_PERKS.length, 6);
  for (const id of STARTER_PERKS) assert(c.unlocked.includes(id), `${id} unlocked`);
  assert(!c.unlocked.includes('overdrive'), 'rare starts locked');
});

test('trophies add, and spending is gated by balance', () => {
  addTrophies(50);
  assertEqual(loadCircuit().trophies, 50);
  assertEqual(spendTrophies(60), false, 'cannot overspend');
  assertEqual(loadCircuit().trophies, 50, 'balance unchanged on failed spend');
  assertEqual(spendTrophies(40), true);
  assertEqual(loadCircuit().trophies, 10);
});

test('unlock is idempotent; best depth only climbs', () => {
  unlockPerk('overdrive');
  unlockPerk('overdrive');
  assertEqual(loadCircuit().unlocked.filter((i) => i === 'overdrive').length, 1);
  recordRunDepth(5);
  recordRunDepth(3);
  assertEqual(loadCircuit().bestDepth, 5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/circuit-meta.test.js`
Expected: FAIL — `loadCircuit`/`STARTER_PERKS` are not exported.

- [ ] **Step 3: Implement**

In `progress.js`, add near the top (after the existing `EQUIP_KEY` line):

```js
const CIRCUIT_KEY = 'pickleball.circuit';

// The six perks a player starts with; the other four are bought in the shop.
export const STARTER_PERKS = [
  'cannon', 'feather', 'quickfeet', 'longreach', 'sureserve', 'netmagnet',
];

const DEFAULT_CIRCUIT = { trophies: 0, unlocked: STARTER_PERKS.slice(), bestDepth: 0 };

let memCircuit = null;
```

Then add these exported functions (place them after the daily-challenge section at the end of the file):

```js
// --- The Circuit meta (Trophies, unlocked perks, best run depth) ---

export function loadCircuit() {
  if (!memCircuit) {
    memCircuit = read(CIRCUIT_KEY, DEFAULT_CIRCUIT);
    // Guarantee starter perks even if an older save predates one.
    for (const id of STARTER_PERKS) {
      if (!memCircuit.unlocked.includes(id)) memCircuit.unlocked.push(id);
    }
  }
  return memCircuit;
}

function saveCircuit() {
  write(CIRCUIT_KEY, loadCircuit());
}

export function addTrophies(n) {
  const c = loadCircuit();
  c.trophies += n;
  saveCircuit();
  return c.trophies;
}

export function spendTrophies(n) {
  const c = loadCircuit();
  if (c.trophies < n) return false;
  c.trophies -= n;
  saveCircuit();
  return true;
}

export function unlockPerk(id) {
  const c = loadCircuit();
  if (!c.unlocked.includes(id)) { c.unlocked.push(id); saveCircuit(); }
}

export function recordRunDepth(d) {
  const c = loadCircuit();
  if (d > c.bestDepth) { c.bestDepth = d; saveCircuit(); }
}
```

Note: `read` and `write` already exist in `progress.js` (used by stats/equip) — reuse them; do not redefine.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/circuit-meta.test.js`
Expected: `3 passed, 0 failed`.

- [ ] **Step 5: Wire the suite in and run everything**

In `package.json` extend `test`:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js && node tests/perks.test.js && node tests/circuit.test.js && node tests/circuit-meta.test.js",
```

Run: `npm test`
Expected: all five suites pass.

- [ ] **Step 6: Commit**

```bash
git add progress.js tests/circuit-meta.test.js package.json
git commit -m "feat: Circuit meta persistence (Trophies, unlocked perks, depth)"
```

---

### Task 5: Perk gameplay hooks in `game.js` (+ `player.js`)

**Files:**
- Modify: `player.js` (`update` gains a speed multiplier; `canReach` gains a reach bonus)
- Modify: `game.js` (import `PerkSet`, add `activePerks`, apply at hook points, set empty in every existing mode)
- Create: `tests/player-perks.test.js`
- Modify: `package.json` (add to `test`)

**Interfaces:**
- Consumes: `PerkSet` from `perks.js` (Task 2).
- Produces: `player.update(dt, keys, speedMult = 1)`; `player.canReach(ball, reachBonus = 0)`; module-level `activePerks` in `game.js` (empty `PerkSet` by default), exposed as `window.__pickleball.setPerks(ids)` for tests.

- [ ] **Step 1: Write the failing test (player.js multipliers)**

Create `tests/player-perks.test.js`:

```js
import { Player } from '../player.js';
import { Ball } from '../ball.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }

test('speed multiplier moves the player farther in a step', () => {
  const base = new Player();
  const fast = new Player();
  const keys = new Set(['ArrowLeft']);
  base.update(0.1, keys, 1);
  fast.update(0.1, keys, 1.15);
  const baseDist = Math.abs(base.x - 13);
  const fastDist = Math.abs(fast.x - 13);
  assert(fastDist > baseDist * 1.1, `fast (${fastDist}) should out-cover base (${baseDist})`);
});

test('reach bonus lets the player reach a ball just out of normal reach', () => {
  const p = new Player(); // starts at x=13, y=40
  const ball = new Ball();
  ball.placeAt(p.x + 3.6, p.y, 1); // beyond PLAYER_REACH (3.2), within 3.2+0.6
  assert(!p.canReach(ball, 0), 'unreachable without the perk');
  assert(p.canReach(ball, 0.6), 'reachable with Long Reach');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/player-perks.test.js`
Expected: FAIL — the speed test sees identical distances (third arg ignored) and/or the reach test throws.

- [ ] **Step 3: Implement the `player.js` changes**

In `player.js`, change `update` to accept a speed multiplier. Replace the signature and the two lines that use `SPEED` for motion:

```js
  update(dt, keys, speedMult = 1) {
```

and, inside it, replace the movement block:

```js
    const speed = SPEED * speedMult;
    this.speedNow = len > 0 ? speed : 0;
    this.swingT = Math.max(0, this.swingT - dt);
    this.idle += dt;
    this.walk += this.speedNow * dt * 1.5;
    this.x += dx * speed * dt;
    this.y += dy * speed * dt;
```

(The old block set `this.speedNow`/`this.x`/`this.y` from `SPEED` directly — replace those uses with `speed`.)

Change `canReach` to accept a reach bonus:

```js
  canReach(ball, reachBonus = 0) {
    return Math.hypot(ball.x - this.x, ball.y - this.y) < PLAYER_REACH + reachBonus
      && ball.z < MAX_HIT_HEIGHT;
  }
```

- [ ] **Step 4: Run the player test to verify it passes**

Run: `node tests/player-perks.test.js`
Expected: `2 passed, 0 failed`.

- [ ] **Step 5: Wire perks into `game.js`**

Add the import (extend the existing `perks`-free import area near the top, after the `shots.js` import on line 12):

```js
import { PerkSet } from './perks.js';
```

Add the module state (near `let swingMods` / the other rally vars, e.g. after line 178's `demoAutoServe`):

```js
let activePerks = new PerkSet(); // empty outside the Circuit → all hooks neutral
```

**5a — power, throttle, smash threshold, and the lob flag** in `playerShot`. Replace the power line and the lob return and the smash guard:

```js
  // Power throttle plus perk boosts (Cannon/Overdrive); Overdrive lifts the
  // low-ball throttle so you can flatten anything.
  const power = Math.min(1,
    held * Math.max(activePerks.throttleFloor(), Math.min(1, ball.z / 4)) * activePerks.powerMult());
  charge = 0;
```

In the `lob` return object, add the flag so Feather can find it:

```js
      apexZ: lobParams(held).apexZ,
      power: 0,
      spin: 0,
      lob: true,
```

Replace the smash guard height check:

```js
  if (ball.z >= activePerks.smashHeight()) {
    const sp = smashParams(ball.z, power);
    const dir = player.moveDir();
    return {
      tx: aim.active ? aim.x : clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
      ty: aim.active ? aim.y : clamp(9 + dir.dy * 6, 2, NET_Y - 2),
      apexZ: sp.apexZ,
      power: Math.min(1, power + activePerks.smashBonus()),
      timeScale: sp.timeScale,
      spin: 0,
      smash: true,
    };
  }
```

**5b — scatter** at the player hit (line ~670). Replace:

```js
      applyStress(shot, player, (0.7 + 0.5 * shot.power) * activePerks.scatterMult(shot));
```

**5c — kitchen tolerance.** Change `hitterInKitchen` to take a tolerance, and pass it for the player. Replace the function:

```js
function hitterInKitchen(who, tol = 0) {
  if (who.x <= 0 || who.x >= COURT_W) return false;
  if (!inKitchen(who.y)) return false;
  // Kitchen Ninja lets the player stand a little inside without faulting.
  return who.y > KITCHEN_TOP + tol && who.y < KITCHEN_BOTTOM - tol;
}
```

At the player hit (line ~667) pass the tolerance:

```js
      const result = rally.recordHit(PLAYER, { volley, inKitchen: hitterInKitchen(player, activePerks.kitchenTolerance()) });
```

(Leave the bot call `hitterInKitchen(bot)` unchanged — bots use the default `tol = 0`.)

**5d — reach.** Both `player.canReach(ball)` calls in `handleHits` (the swing-window check ~line 664, and any other) pass the bonus:

```js
        && player.canReach(ball, activePerks.reachBonus())) {
```

**5e — movement speed.** Every `player.update(dt, keys)` call passes the multiplier. There are several (in `updateRally`, and the serving/point-banner branches). Replace each `player.update(dt, keys)` with:

```js
  player.update(dt, keys, activePerks.moveSpeedMult());
```

**5f — net magnet** in `handleNetCrossing`. After computing `hit`, before the existing net-cord random check, force the dribble for the player's own shot:

```js
  const mine = prevBallY > NET_Y; // the player's shot is crossing to the CPU side
  if (hit.kind === 'contact' && mine && activePerks.netMagnet()) {
    sfx.net();
    ball.vy *= 0.3;
    ball.vx *= 0.5;
    ball.vz = Math.min(ball.vz, 1);
    return;
  }
```

**5g — whiff grace** in the rally `swingWindow` timeout (line ~965). Replace the miss block:

```js
      if (swingWindow <= 0) {
        swingWindow = 0;
        if (activePerks.takeWhiffGrace()) {
          // Wall: the mistimed swing is forgiven — keep the charge, no lockout.
          sfx.paddle(0.15);
        } else {
          swingCooldown = 0.3;
          charge = 0;
          sfx.whiff();
        }
      }
```

**5h — serve let.** In `updateRally`, where a rally result is produced and handled (the `if (result)` block near the replay/endRally dispatch), add a guard before it that turns a player's service fault into a let. Find the block that begins `if (result) {` (around line 700) and insert immediately above it:

```js
    if (result && result.reason === 'Service fault!'
        && rally.server === PLAYER && activePerks.takeServeLet()) {
      ui.showBanner('Let — serve again', 1000, 'soft');
      startServe();
      return;
    }
```

**5i — empty the set in non-Circuit modes and expose a test hook.** In `startGame`, `startTournamentMatch`, and `startDaily`, add near the top of each (right after the `mode = ...` line):

```js
  activePerks = new PerkSet();
```

Extend the debug handle (the `window.__pickleball = { ... }` block) with:

```js
  setPerks: (ids) => { activePerks = new PerkSet(ids); },
  getPerks: () => activePerks,
```

- [ ] **Step 6: Write a headless integration check**

Add to `tests/player-perks.test.js` (before the summary lines):

```js
// Integration: with Long Reach active, the game lets the player reach a ball
// the empty set would miss. Driven through the real game module.
import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');
const pk = window.__pickleball;
dom.startGame('easy');
test('setPerks swaps the active set the game reads', () => {
  pk.setPerks(['longreach']);
  assert(pk.getPerks().reachBonus() > 0, 'game now holds a Long Reach set');
  pk.setPerks([]);
  assert(pk.getPerks().reachBonus() === 0, 'cleared');
});
```

- [ ] **Step 7: Wire the suite in and run everything**

In `package.json` extend the `test` script:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js && node tests/perks.test.js && node tests/circuit.test.js && node tests/circuit-meta.test.js && node tests/player-perks.test.js",
```

Run: `npm test && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: player-perks `3 passed`; all suites green (perks are a no-op in these modes, so balance/ladder/doubles are unaffected).

- [ ] **Step 8: Commit**

```bash
git add player.js game.js tests/player-perks.test.js package.json
git commit -m "feat: apply perks at gameplay hooks (no-op outside the Circuit)"
```

---

### Task 6: Circuit run flow + start/summary overlays

**Files:**
- Modify: `index.html` (mode-grid button; `circuit-start` and `run-summary` overlays)
- Modify: `style.css` (rung list + card styling)
- Modify: `ui.js` (`showCircuitStart`, `showRunSummary`; element refs; `hideOverlays` list)
- Modify: `game.js` (Circuit mode, per-rung match target/opponent, win→advance / loss→summary)
- Modify: `tests/dom-stub.js` (new element ids)
- Create: `tests/circuit-run.test.js`
- Modify: `package.json` (add to `test`)

**Interfaces:**
- Consumes: `matchConfig`, `newRun`, `advance`, `fail`, `rungsCleared`, `trophies` (Task 3); `loadCircuit`, `addTrophies`, `recordRunDepth` (Task 4); `PerkSet` (Task 2); `Score.winner(target)` (Task 1).
- Produces: `ui.showCircuitStart(run, meta, { onStart, onShop, onBack })`, `ui.showRunSummary(info, { onContinue })`; `game.js` mode `'circuit'` with `matchTarget`.

- [ ] **Step 1: Add the overlays and button (index.html)**

Add a button to the `#mode-grid` (after `mode-skinny`):

```html
          <button id="mode-circuit" class="secondary">The Circuit</button>
```

Add two overlays (next to the existing `#ladder` overlay):

```html
      <div id="circuit-start" class="overlay hidden">
        <h1>The Circuit</h1>
        <p class="tagline">Climb 9 rungs. Draft perks. Bank Trophies.</p>
        <div id="circuit-bracket"></div>
        <div id="circuit-meta" class="tagline"></div>
        <div class="modes">
          <button id="circuit-play"></button>
          <button id="circuit-shop" class="secondary">Pro Shop</button>
          <button id="circuit-back" class="secondary">Menu</button>
        </div>
      </div>

      <div id="run-summary" class="overlay hidden">
        <h1 id="run-summary-title"></h1>
        <p id="run-summary-line" class="tagline"></p>
        <div id="run-summary-detail"></div>
        <button id="run-summary-continue">Continue</button>
      </div>
```

- [ ] **Step 2: Register ids and teach the DOM stub to build elements**

The Circuit overlays construct DOM (`createElement`/`appendChild`) and clear
it (`innerHTML = ''`), which the current stub doesn't support. In
`tests/dom-stub.js`, extend the `ids` array:

```js
    'mode-circuit', 'circuit-start', 'circuit-bracket', 'circuit-meta',
    'circuit-play', 'circuit-shop', 'circuit-back',
    'run-summary', 'run-summary-title', 'run-summary-line', 'run-summary-detail',
    'run-summary-continue',
```

In `makeElement`, replace the plain `innerHTML: ''` field with a
child-tracking getter/setter and add `children`/`appendChild`:

```js
    _html: '',
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = v; if (v === '') el.children = []; },
    children: [],
    appendChild(c) { el.children.push(c); return c; },
```

And give `document` a `createElement`:

```js
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => makeElement('dynamic'),
  };
```

- [ ] **Step 3: Style the bracket + cards (style.css)**

Append:

```css
#circuit-bracket {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin: 14px 0;
}

.rung-chip {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.04em;
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  color: var(--text-dim);
}

.rung-chip.cleared { color: var(--accent-ink); background: var(--accent); border-color: transparent; }
.rung-chip.current { color: var(--accent); border-color: var(--accent); }
.rung-chip.boss { font-weight: 700; }

#run-summary-detail { margin: 12px 0 4px; font-size: 16px; line-height: 1.7; }
```

- [ ] **Step 4: Add the UI functions (ui.js)**

Add element refs near the other `document.getElementById` refs at the top:

```js
const circuitStartEl = document.getElementById('circuit-start');
const runSummaryEl = document.getElementById('run-summary');
```

Add to the `hideOverlays` array (so these hide with the rest):

```js
  const extras = [
    document.getElementById('stats'), document.getElementById('locker'),
    circuitStartEl, runSummaryEl, document.getElementById('pro-shop'),
  ];
```

(The `pro-shop` element arrives in Task 8; `getElementById` returning null there is fine because Task 8 adds it — but to keep Task 6 self-contained, guard the loop: `for (const el of [...].filter(Boolean))`. Update `hideOverlays` to filter falsy entries.)

Add the two exported functions:

```js
export function showCircuitStart(run, meta, { onStart, onShop, onBack }) {
  hideOverlays();
  circuitStartEl.classList.remove('hidden');
  const bracket = document.getElementById('circuit-bracket');
  bracket.innerHTML = '';
  for (let r = 1; r <= 9; r++) {
    const chip = document.createElement('span');
    const cls = r < run.rung ? 'cleared' : (r === run.rung ? 'current' : '');
    chip.className = `rung-chip ${cls} ${r === 9 ? 'boss' : ''}`.trim();
    chip.textContent = r === 9 ? '★' : String(r);
    bracket.appendChild(chip);
  }
  document.getElementById('circuit-meta').textContent =
    `${meta.trophies} Trophies · best climb: rung ${meta.bestDepth || 0}`;
  const playBtn = document.getElementById('circuit-play');
  playBtn.textContent = run.rung > 1 ? `Continue — rung ${run.rung}` : 'Start a run';
  playBtn.onclick = onStart;
  document.getElementById('circuit-shop').onclick = onShop;
  document.getElementById('circuit-back').onclick = () => {
    circuitStartEl.classList.add('hidden');
    onBack();
  };
}

export function showRunSummary({ title, line, detail }, { onContinue }) {
  hideOverlays();
  runSummaryEl.classList.remove('hidden');
  document.getElementById('run-summary-title').textContent = title;
  document.getElementById('run-summary-line').textContent = line;
  document.getElementById('run-summary-detail').innerHTML = detail;
  document.getElementById('run-summary-continue').onclick = () => {
    runSummaryEl.classList.add('hidden');
    onContinue();
  };
}
```

Update `hideOverlays` to tolerate not-yet-existing elements:

```js
export function hideOverlays() {
  const extras = [
    document.getElementById('stats'), document.getElementById('locker'),
    document.getElementById('circuit-start'), document.getElementById('run-summary'),
    document.getElementById('pro-shop'),
  ].filter(Boolean);
  for (const el of [menuEl, ladderEl, championEl, gameoverEl, pauseEl, ...extras]) {
    el.classList.add('hidden');
  }
  hideBanner();
}
```

- [ ] **Step 5: Wire the run flow in game.js**

Add imports (after the `ladder.js` import):

```js
import {
  matchConfig, newRun, advance, fail, rungsCleared, trophies,
} from './circuit.js';
import { perkById } from './perks.js';
```

Extend the `progress.js` import to add the Circuit meta functions:

```js
  recordPoint, recordGame, recordDailyWin, dailyChallenge, todayStr, equippedColors, equipped,
  loadCircuit, addTrophies, recordRunDepth,
```

Add module state (near `let matchGames`):

```js
let run = null; // active Circuit run
let matchTarget = 11; // first-to-N for the current match
```

Set `matchTarget = 11` in `startGame`, `startTournamentMatch`, and `startDaily` (one line each, alongside the `activePerks = new PerkSet();` added in Task 5).

Add the Circuit entry points (near `showMainMenu`/`openLadder`):

```js
function openCircuit() {
  state = 'menu';
  if (!run || !run.alive) run = newRun();
  ui.showCircuitStart(run, loadCircuit(), {
    onStart: startCircuitMatch,
    onShop: openShop,
    onBack: showMainMenu,
  });
}

function startCircuitMatch() {
  mode = 'circuit';
  setVariant('singles');
  bestOf3 = false;
  clearModifiers();
  const cfg = matchConfig(run.rung);
  matchTarget = cfg.target;
  opponent = cfg.opponent;
  cpu.setProfile(opponent);
  activePerks = new PerkSet(run.perks);
  activePerks.resetGame();
  score = new Score();
  ui.updateScore(score, score.servingSide, opponent.name);
  ui.showBanner(`Rung ${run.rung}: ${opponent.name} — first to ${matchTarget}`, 0);
  introTimer = 2.5;
  state = 'intro';
}

function endCircuitRun() {
  const cleared = rungsCleared(run);
  const gained = trophies(run);
  addTrophies(gained);
  recordRunDepth(cleared);
  const won = run.won;
  ui.showRunSummary({
    title: won ? 'Circuit Champion!' : 'Run over',
    line: won ? 'You cleared all nine rungs.' : `You reached rung ${run.rung}.`,
    detail: `Rungs cleared: <b>${cleared}</b><br>Trophies earned: <b>+${gained}</b>`,
  }, { onContinue: () => { run = null; openCircuit(); } });
}
```

Add a temporary between-match handoff (Task 7 replaces this with the draft):

```js
function afterCircuitMatchWon() {
  advance(run);
  if (run.won) endCircuitRun();
  else startCircuitMatch();
}
```

Wire the menu button — in `showMainMenu`, pass an `onCircuit` handler. Update the call:

```js
  ui.showModeMenu(startGame, openLadder, {
    onDaily: startDaily,
    onCosmetics: applyCosmetics,
    onCircuit: openCircuit,
  });
```

And in `ui.js` `showModeMenu`, accept and wire it (add to the destructured options and add the handler near the other mode buttons):

```js
export function showModeMenu(onQuick, onTournament, { onDaily, onCosmetics, onCircuit } = {}) {
```

```js
  const circuitBtn = document.getElementById('mode-circuit');
  if (circuitBtn) {
    circuitBtn.onclick = () => { menuEl.classList.add('hidden'); if (onCircuit) onCircuit(); };
  }
```

**Match target + win/loss dispatch.** In the `point-banner` frame branch, replace `const winner = score.winner();` with `const winner = score.winner(matchTarget);`, and replace the `else if (bestOf3 ...) { ... } else { ... }` tail so the Circuit routes to its own handler:

```js
      const winner = score.winner(matchTarget);
      if (!winner) {
        startServe();
      } else if (mode === 'circuit') {
        recordGame({ won: winner === PLAYER, shutout: winner === PLAYER && score.get(CPU) === 0, champion: false });
        if (winner === PLAYER) {
          afterCircuitMatchWon();
        } else {
          fail(run);
          state = 'game-over';
          endCircuitRun();
        }
      } else if (bestOf3 && ++matchGames[winner] < 2) {
        // Game won, match still live: record it and play the next game.
        recordGame({ won: winner === PLAYER, shutout: score.get(other(winner)) === 0, champion: false });
        const g = matchGames[PLAYER] + matchGames[CPU];
        ui.showBanner(
          `${winner === PLAYER ? 'You take' : `${opponentName()} takes`} game ${g}! ${matchGames[PLAYER]}–${matchGames[CPU]}`,
          0,
        );
        score = new Score();
        ui.updateScore(score, score.servingSide, opponentName());
        introTimer = 2.5;
        state = 'intro';
      } else {
        state = 'game-over';
        handleMatchOver(winner);
      }
```

Add a stub `openShop` so Task 6 compiles (Task 8 fills it in):

```js
function openShop() { openCircuit(); } // replaced in Task 8 by the Pro Shop
```

Expose the active run on the debug handle (the smoke test reads it):

```js
  getCircuitRun: () => run,
```

- [ ] **Step 6: Write the headless run smoke test**

Create `tests/circuit-run.test.js` (drives the shared bot through a Circuit run):

```js
import { installDom } from './dom-stub.js';
import { COURT_W, COURT_L, NET_Y, KITCHEN_BOTTOM, CENTER_X } from '../rules.js';

const dom = installDom();
await import('../game.js');
const pk = window.__pickleball;
const { ball, player, getState } = pk;

// Enter the Circuit and start the first match.
dom.elements['mode-circuit'].onclick();
dom.elements['circuit-play'].onclick();

const DIR = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const held = new Set();
const setKeys = (w) => {
  for (const [d, code] of Object.entries(DIR)) {
    if (w.has(d) && !held.has(code)) { dom.keyDown(code); held.add(code); }
    if (!w.has(d) && held.has(code)) { dom.keyUp(code); held.delete(code); }
  }
};

let t = 0; let sf = 0; let frames = 0;
let advanced = false;
while (frames < 60 * 600) {
  let tx = CENTER_X; let ty = COURT_L - 6;
  if (ball.inFlight && ball.vy > 0) {
    const land = ball.predictLanding();
    if (land.x >= 0 && land.x <= COURT_W && land.y <= COURT_L) {
      tx = land.x;
      ty = land.y > NET_Y && land.y < KITCHEN_BOTTOM ? KITCHEN_BOTTOM + 0.5 : Math.max(land.y, NET_Y + 1.5);
    }
  }
  const w = new Set();
  if (tx < player.x - 0.5) w.add('left');
  if (tx > player.x + 0.5) w.add('right');
  if (ty < player.y - 0.5) w.add('up');
  if (ty > player.y + 0.5) w.add('down');
  setKeys(w);
  const st = getState();
  if (st === 'serving' || st === 'replay') {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); sf = 0; }
    else if (st === 'serving' && ++sf > 20) { dom.keyUp('Space'); held.delete('Space'); }
  } else if (st === 'rally' && ball.inFlight && ball.vy > 0
      && Math.hypot(ball.x - player.x, ball.y - player.y) < 2.2) {
    if (held.has('Space')) { dom.keyUp('Space'); held.delete('Space'); }
    else { dom.keyDown('Space'); held.add('Space'); }
  }
  t += 1000 / 60; dom.step(t); frames++;
  // Resolved either way: the bot beat rung 1 and moved on, or lost → summary.
  const run = pk.getCircuitRun();
  if ((run && run.rung > 1) || dom.elements['run-summary-title'].textContent) {
    advanced = true;
    break;
  }
}

if (advanced) console.log('PASS: a Circuit run advanced past its first match');
else { console.error('FAIL: run never advanced'); process.exit(1); }
```

Detection reads the run's `rung` (via `getCircuitRun`) and the summary title
text — the DOM stub's `classList` is a no-op, so visibility can't be polled
directly.

- [ ] **Step 7: Run it**

Run: `node tests/circuit-run.test.js`
Expected: `PASS: a Circuit run played to a run summary` (the bot loses at some rung, banking Trophies and showing the summary).

- [ ] **Step 8: Run everything**

`circuit-run.test.js` is a long headless smoke (like `doubles`/`balance`), so
it runs separately, not inside `npm test`.

Run: `npm test && node tests/circuit-run.test.js && node tests/doubles.test.js`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add index.html style.css ui.js game.js tests/dom-stub.js tests/circuit-run.test.js
git commit -m "feat: Circuit run flow with start bracket and run summary"
```

---

### Task 7: Perk draft between matches

**Files:**
- Modify: `index.html` (`draft` overlay)
- Modify: `style.css` (draft card styling)
- Modify: `ui.js` (`showDraft`; refs; hideOverlays list)
- Modify: `game.js` (draft between won matches feeds `run.perks`)
- Modify: `tests/dom-stub.js` (new ids)
- Modify: `tests/circuit-run.test.js` (auto-pick a draft card so a run can climb)

**Interfaces:**
- Consumes: `draftOptions` (Task 3); `perkById` (Task 2); `loadCircuit` (Task 4).
- Produces: `ui.showDraft(optionIds, ownedIds, { onPick })` where `onPick(id)` fires with the chosen perk id.

- [ ] **Step 1: Add the overlay (index.html)**

Next to the other overlays:

```html
      <div id="draft" class="overlay hidden">
        <h1>Draft a perk</h1>
        <p class="tagline">Pick one. It lasts the whole run.</p>
        <div id="draft-cards"></div>
        <div id="draft-owned" class="tagline"></div>
      </div>
```

- [ ] **Step 2: Register ids (tests/dom-stub.js)**

```js
    'draft', 'draft-cards', 'draft-owned',
```

- [ ] **Step 3: Style the cards (style.css)**

```css
#draft-cards {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin: 16px 0 10px;
}

.draft-card {
  width: 150px;
  padding: 14px 12px;
  border-radius: var(--radius-md);
  border: 1.5px solid rgba(184, 233, 134, 0.5);
  background: rgba(184, 233, 134, 0.08);
  cursor: pointer;
  text-align: left;
  color: var(--text);
}

.draft-card:hover { background: rgba(184, 233, 134, 0.16); }
.draft-card .pname { font-family: var(--font-display); font-size: 18px; color: var(--accent); }
.draft-card .prarity { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); }
.draft-card .pdesc { font-size: 13px; line-height: 1.4; margin-top: 6px; color: var(--text-dim); }
.draft-card.rare { border-color: #ffd166; background: rgba(255, 209, 102, 0.1); }
```

- [ ] **Step 4: Add `showDraft` (ui.js)**

Add the ref and hideOverlays entry (add `document.getElementById('draft')` to the `.filter(Boolean)` list in `hideOverlays`), then:

```js
export function showDraft(optionIds, ownedIds, { onPick }) {
  hideOverlays();
  const el = document.getElementById('draft');
  el.classList.remove('hidden');
  const cards = document.getElementById('draft-cards');
  cards.innerHTML = '';
  for (const id of optionIds) {
    const perk = PERKS_BY_ID(id);
    const card = document.createElement('button');
    card.className = `draft-card ${perk.rarity === 'rare' ? 'rare' : ''}`.trim();
    card.innerHTML = `<div class="pname">${perk.name}</div>`
      + `<div class="prarity">${perk.rarity}</div>`
      + `<div class="pdesc">${perk.desc}</div>`;
    card.onclick = () => { el.classList.add('hidden'); onPick(id); };
    cards.appendChild(card);
  }
  document.getElementById('draft-owned').textContent = ownedIds.length
    ? `Your build: ${ownedIds.map((i) => PERKS_BY_ID(i).name).join(', ')}`
    : 'Your build: (empty)';
}
```

`showDraft` needs perk lookup — import it at the top of `ui.js` and alias to avoid clashing with the existing imports:

```js
import { perkById as PERKS_BY_ID } from './perks.js';
```

- [ ] **Step 5: Replace the between-match handoff (game.js)**

Add the imports (extend the `circuit.js` import to include `draftOptions`):

```js
import {
  matchConfig, newRun, advance, fail, rungsCleared, trophies, draftOptions,
} from './circuit.js';
```

Replace `afterCircuitMatchWon` with the draft flow:

```js
function afterCircuitMatchWon() {
  advance(run);
  if (run.won) { endCircuitRun(); return; }
  const options = draftOptions(run.perks, loadCircuit().unlocked);
  if (options.length === 0) { startCircuitMatch(); return; } // nothing left to draft
  state = 'menu';
  ui.showDraft(options, run.perks, {
    onPick: (id) => {
      run.perks.push(id);
      startCircuitMatch();
    },
  });
}
```

- [ ] **Step 6: Let the smoke test climb (tests/circuit-run.test.js)**

The DOM stub already tracks `children`/`createElement`/`innerHTML` (Task 6).
Add a draft auto-pick inside the loop, right after `const st = getState();`,
so the bot picks the first card whenever a draft is showing and keeps
climbing:

```js
  const draftCards = dom.elements['draft-cards'];
  if (draftCards.children.length) draftCards.children[0].onclick();
```

Because the run can now climb indefinitely on a strong bot, keep the
resolution check as-is (`run.rung > 1` fires on the first win) — the test
still passes quickly.

- [ ] **Step 7: Run it**

Run: `node tests/circuit-run.test.js`
Expected: PASS — the bot now drafts a card after each win and climbs until it loses (or clears the run), reaching a summary.

- [ ] **Step 8: Run everything**

Run: `npm test && node tests/circuit-run.test.js && node tests/doubles.test.js && node tests/ladder.test.js`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add index.html style.css ui.js game.js tests/dom-stub.js tests/circuit-run.test.js
git commit -m "feat: between-match perk draft"
```

---

### Task 8: Pro Shop

**Files:**
- Modify: `index.html` (`pro-shop` overlay)
- Modify: `style.css` (shop row styling)
- Modify: `ui.js` (`showProShop`; ref; hideOverlays already lists it)
- Modify: `game.js` (`openShop` opens the real shop)
- Modify: `tests/dom-stub.js` (new ids)
- Create: `tests/shop.test.js`
- Modify: `package.json` (add to `test`)

**Interfaces:**
- Consumes: `PERKS`/`perkById` (Task 2); `loadCircuit`, `spendTrophies`, `unlockPerk` (Task 4).
- Produces: `ui.showProShop(meta, { onBuy, onBack })` where `onBuy(id)` attempts a purchase.

- [ ] **Step 1: Add the overlay (index.html)**

```html
      <div id="pro-shop" class="overlay hidden">
        <h1>Pro Shop</h1>
        <p id="shop-balance" class="tagline"></p>
        <div id="shop-list"></div>
        <button id="shop-back" class="secondary">Back</button>
      </div>
```

- [ ] **Step 2: Register ids (tests/dom-stub.js)**

```js
    'pro-shop', 'shop-balance', 'shop-list', 'shop-back',
```

- [ ] **Step 3: Style (style.css)**

```css
#shop-list { margin: 12px 0; display: flex; flex-direction: column; gap: 8px; }
.shop-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  text-align: left;
}
.shop-row .pinfo { font-size: 13px; color: var(--text-dim); }
.shop-row .pinfo b { color: var(--text); font-family: var(--font-display); font-size: 16px; }
.shop-row.owned { opacity: 0.55; }
.shop-buy { min-height: 36px; font-size: 14px; padding: 6px 14px; }
```

- [ ] **Step 4: Add `showProShop` (ui.js)**

```js
export function showProShop(meta, { onBuy, onBack }) {
  hideOverlays();
  const el = document.getElementById('pro-shop');
  el.classList.remove('hidden');
  document.getElementById('shop-balance').textContent = `${meta.trophies} Trophies`;
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  for (const perk of PERKS) {
    if (perk.cost <= 0) continue; // starter perks aren't sold
    const owned = meta.unlocked.includes(perk.id);
    const row = document.createElement('div');
    row.className = `shop-row ${owned ? 'owned' : ''}`.trim();
    const info = document.createElement('div');
    info.className = 'pinfo';
    info.innerHTML = `<b>${perk.name}</b> — ${perk.desc}`;
    row.appendChild(info);
    if (owned) {
      const tag = document.createElement('span');
      tag.className = 'pinfo';
      tag.textContent = 'Owned';
      row.appendChild(tag);
    } else {
      const buy = document.createElement('button');
      buy.className = 'shop-buy';
      buy.textContent = `${perk.cost}`;
      buy.disabled = meta.trophies < perk.cost;
      buy.onclick = () => onBuy(perk.id);
      row.appendChild(buy);
    }
    list.appendChild(row);
  }
  document.getElementById('shop-back').onclick = () => {
    el.classList.add('hidden');
    onBack();
  };
}
```

`PERKS` must be imported in `ui.js` — extend the perks import:

```js
import { perkById as PERKS_BY_ID, PERKS } from './perks.js';
```

- [ ] **Step 5: Wire `openShop` (game.js)**

Add `spendTrophies`, `unlockPerk` to the `progress.js` import, then replace the stub `openShop`:

```js
function openShop() {
  ui.showProShop(loadCircuit(), {
    onBuy: (id) => {
      const perk = perkById(id);
      if (spendTrophies(perk.cost)) unlockPerk(id);
      openShop(); // re-render with the new balance / owned state
    },
    onBack: openCircuit,
  });
}
```

- [ ] **Step 6: Write the shop test**

Create `tests/shop.test.js`:

```js
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { loadCircuit, addTrophies, spendTrophies, unlockPerk } = await import('../progress.js');
const { perkById } = await import('../perks.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }

test('buying Overdrive deducts its cost and unlocks it', () => {
  const cost = perkById('overdrive').cost;
  addTrophies(cost);
  assert(!loadCircuit().unlocked.includes('overdrive'), 'locked before');
  assert(spendTrophies(cost), 'affordable');
  unlockPerk('overdrive');
  assert(loadCircuit().unlocked.includes('overdrive'), 'unlocked after');
  assert(loadCircuit().trophies === 0, 'spent to zero');
  assert(!spendTrophies(1), 'now broke');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 7: Run it**

Run: `node tests/shop.test.js`
Expected: `1 passed, 0 failed`.

- [ ] **Step 8: Wire the suite in and run everything**

In `package.json` extend `test`:

```json
"test": "node tests/rules.test.js && node tests/depth.test.js && node tests/perks.test.js && node tests/circuit.test.js && node tests/circuit-meta.test.js && node tests/player-perks.test.js && node tests/shop.test.js",
```

Run: `npm test && node tests/circuit-run.test.js && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add index.html style.css ui.js game.js tests/dom-stub.js tests/shop.test.js package.json
git commit -m "feat: Pro Shop — spend Trophies to unlock perks"
```

---

### Task 9: Docs + end-to-end verification

**Files:**
- Modify: `README.md`
- Verify: full suite + a browser session

- [ ] **Step 1: README**

Add to the Modes list (after the Daily challenge bullet):

```markdown
- **The Circuit:** a roguelike career run — climb 9 rungs of escalating
  matches (first to 4, then 7, then an 11-point boss), drafting a perk
  between each that changes how you play and stacks all run. Lose and the
  run ends, but how far you climbed banks **Trophies** you spend in the
  **Pro Shop** to unlock more perks. Everything persists in your browser.
```

- [ ] **Step 2: Full suite**

Run: `npm test && node tests/circuit-run.test.js && node tests/doubles.test.js && node tests/balance.test.js medium && node tests/ladder.test.js`
Expected: all green.

- [ ] **Step 3: Browser verification**

Serve locally (`python3 -m http.server 8123`) and, with headless Chrome plus a throwaway same-origin harness page (deleted after), capture:

- The main menu shows a **The Circuit** button in the mode grid.
- Clicking it shows the **start/bracket** overlay (9 rung chips, Trophy balance, Start / Pro Shop / Menu).
- Starting a run reaches a match; the serve banner reads "Rung 1: Rookie Rick — first to 4".
- Winning a match (or forcing `window.__pickleball` state) shows the **draft** with 3 cards.
- The **Pro Shop** lists the 4 buyable perks with costs and disabled buy buttons when broke.

Check `console --errors` (or a console hook) is clean on each screen.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: The Circuit roguelike mode"
```
