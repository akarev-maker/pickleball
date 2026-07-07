# The Circuit — Roguelike Career Mode

**Date:** 2026-07-06
**Status:** approved (design); Phase 1 to be planned

A run-based roguelike mode that layers "one more game" session pull and a
long mastery arc on top of the existing pickleball game. Each run is a
self-contained climb of escalating matches; between matches you draft
perks that change how you play and stack for the run; how far you climb
banks Trophies that permanently deepen future runs. Named after a pro
tour circuit.

## Goals

- **Session pull ("one more run"):** a run is ~15–20 minutes, self-contained,
  always ends in a payoff (win *or* loss banks Trophies — no wasted runs).
- **Mastery arc:** perks, characters, and prestige tiers give a durable
  chase that outlasts the finite Tournament ladder and cosmetic Locker.
- **Reuse, don't reinvent:** the roster (personalities + looks), the
  Locker pattern, the personality knobs, and every existing shot mechanic
  become the raw material.

## Non-goals

- No backend, no dependencies, no build step (unchanged repo constraint).
- No online leaderboards or multiplayer (a different pull we deferred).
- Tournament, Quick Play, Doubles, Skinny, and Daily modes are untouched —
  the Circuit sits alongside them.

## The run loop (spine)

A run is a climb of **9 rungs**. Rungs 1–8 escalate; rung 9 is a Champion
boss. Clearing rung 9 is a full "you won a run" celebration; then
**Prestige tiers** (Circuit II, III, …) replay the climb at higher
difficulty for larger payouts — the endless ladder past The Wall.

**Match length rises with the stakes** (win by 2 throughout):

- Rungs 1–3: first to 4
- Rungs 4–8: first to 7
- Rung 9 (boss): first to 11

Rising length is rising drama and keeps a full run near 15–20 minutes.

**Opponents reuse the roster.** `ROSTER` is already ordered easy→hard
(Rookie Rick → The Wall), so rungs 1–8 walk it directly, and rung 9 is a
scaled Champion beyond The Wall. Each opponent keeps its personality,
color, and per-opponent look. A per-rung difficulty scalar (and, in later
phases, opponent modifiers) makes the same faces tougher on higher
Prestige tiers. Phase 1 uses a fixed opponent order — run-to-run variety
comes from the perk draft; opponent shuffling/modifiers arrive later.

**Losing any match ends the run.** You always bank Trophies scaled by how
far you climbed, so no run is a dead loss.

**Between every match you draft one perk** (below).

## Perks (the build)

After each won match, you're offered **3 perk cards and choose 1**. Perks
**stack for the whole run** and change *how you play* — never cosmetics.
Cards are rarity-weighted; a rare in your three choices is an event. Your
owned perks are shown alongside the draft so you build toward a plan.

Perks are data objects with effect hooks; the game reads the active perk
set at existing decision points (shot scatter, power, serve faults,
net-cord, kitchen fault, smash threshold, swing whiff, movement). Outside
the Circuit the perk set is empty and every hook returns its neutral
value, so nothing changes in other modes.

**Phase 1 catalog (10 perks).** Exact tuning is fixed in the plan; effects:

| Perk | Rarity | Effect |
|------|--------|--------|
| Cannon | common | Drive/serve power up; scatter up (risk/reward power) |
| Feather | common | Dinks and lobs never scatter |
| Quick Feet | common | Player move speed up |
| Long Reach | common | Player paddle reach up |
| Sure Serve | common | First service fault each game is a let (replayed, no point) |
| Wall | uncommon | First mistimed swing each game doesn't whiff |
| Net Magnet | uncommon | Your net-cord balls always dribble over and stay live |
| Kitchen Ninja | uncommon | Volley up to ~1 ft inside the kitchen without faulting |
| Smash Bro | uncommon | Smash reachable on lower balls, and hits harder |
| Overdrive | rare | +50% power everywhere and no low-ball throttle, but +50% scatter |

Synergies are the point: Cannon + Feather covers power's downside;
Overdrive wants Long Reach and Quick Feet to survive its own scatter.

## Flow (moment-to-moment) — Phase 2

Winning consecutive rallies builds a **Flow meter**. As Flow climbs the
juice escalates (hotter trail, louder crowd, a warm "ON FIRE" tint at the
top) and a **Trophy multiplier** rises (×1 → ×2 → ×3). A lost rally drops
Flow. Flow feeds the end-of-run payout, so moment-to-moment play powers
long-term progression, and some perks (a Phase 2 "Momentum") supercharge
it. Phase 1 payout is flat (rungs cleared only); Flow multiplies it later.

## Meta-progression (mastery)

**Trophies** bank on every run end, scaled by rungs cleared (× best Flow
in Phase 2). Spent in the **Pro Shop** (an extension of the Locker
pattern) on:

- **Unlock perks** into the draft pool — the main sink; each unlock makes
  future drafts richer. Phase 1 starts with 6 of the 10 perks unlocked and
  4 buyable, giving an immediate meta goal.
- **Starter characters** (Phase 2), each a passive playstyle — The Banger
  (starts with power), The Dinker (starts Kitchen Ninja), The Retriever
  (speed + reach). Different characters, different builds to master.
- **Prestige tiers** (Phase 3) — Circuit II/III… with ascension-style
  twists for bigger payouts.

Persistent (localStorage, following `progress.js` conventions): total
Trophies, unlocked perk ids, best run depth. Later: characters owned,
prestige tier, longest Flow. A run itself is in-memory in Phase 1 (closing
the tab abandons it) — mid-run save is a later nicety.

## Screens

All new overlays reuse the existing overlay/HUD/banner styling:

- **Circuit start / bracket** — the 9 rungs, your position, the next
  opponent (portrait + name + any modifier), a Start/Continue button, and
  a link to the Pro Shop.
- **Draft** — 3 perk cards, pick 1; your current build listed alongside.
- **Run summary** — on win or loss: rungs cleared, Trophies earned (with
  the multiplier breakdown once Flow exists), and the next unlock teased
  ("42 Trophies from The Dinker").
- **Pro Shop** — spend Trophies; Phase 1 shows the Perks tab, later adds
  Characters / Prestige. Cosmetics stay in the Locker.

## Architecture

New focused modules keep run and perk logic out of the already-large
`game.js`:

- **`circuit.js`** — run state machine: current rung, per-rung match config
  and opponent, `advance()` / `fail()`, Trophy calc, and persistence of
  meta state. Pure logic, unit-testable headless.
- **`perks.js`** — the perk catalog (data) plus a `PerkSet` that answers
  the queries `game.js` asks: `powerMult()`, `scatterMult(kind)`,
  `moveSpeedMult()`, `reachBonus()`, `smashHeight()`, `netMagnet()`,
  `kitchenTolerance()`, `throttleFloor()`, and consumable
  `takeServeLet()` / `takeWhiffGrace()`. Neutral defaults when empty.
- **`game.js`** — integrates: the Circuit mode and its state transitions,
  reads the active `PerkSet` at existing hook points, drives `circuit.js`
  between matches, shows the draft/summary overlays.
- **`ui.js`** — the new overlays above.
- **`progress.js`** — Trophies + unlocked-perk persistence, extending the
  existing stats/equip pattern.

Perk hook points in `game.js` (all already exist): `playerShot` (power,
smash threshold, throttle), `applyStress` (scatter by shot kind), `serve`
(fault → let), `handleNetCrossing` (net magnet), `hitterInKitchen`
(tolerance), the swing-whiff branch (grace), `player.update` (speed/reach).

## Phasing

Each phase is independently playable.

1. **The addictive core** — run engine (9 escalating rungs, roster
   opponents, escalating match length), perk draft with the 10-perk
   catalog, flat Trophy payout, minimal Pro Shop (unlock perks), run
   summary. This alone is the roguelike loop. **← the plan builds this.**
2. **Depth** — Flow meter + juice escalation, starter characters with
   passives, a "Momentum" perk, perk synergy polish.
3. **Endless mastery** — Prestige tiers, ascension + opponent modifiers,
   opponent shuffling, expanded records, optional mid-run save.

## Testing

Headless, following the existing `tests/*.test.js` node-script style:

- `perks.js` pure unit tests: each perk's `PerkSet` query returns the
  right modifier; empty set is neutral; consumables (Sure Serve, Wall)
  fire once per game.
- `circuit.js` pure unit tests: a run advances rung on win, ends on loss,
  produces the right match config per rung, and computes Trophies from
  depth; draft offers only unlocked perks and always 3 distinct cards.
- A headless Circuit smoke test driving the existing bot through a full
  run (advance on wins, fail path, Trophies banked) — mirrors
  `tests/doubles.test.js`.
- All existing suites (rules, depth, doubles, balance, ladder) must keep
  passing — perk hooks are no-ops outside the Circuit.

## Out of scope (this spec)

Online play, leaderboards, mid-run cloud save, and the Phase 2/3 content
beyond the sketches above. The spec fixes the vision; the implementation
plan covers Phase 1.
