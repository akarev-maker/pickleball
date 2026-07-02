# Pickleball Web Game — Design Spec

**Date:** 2026-07-01
**Status:** Approved by user

## Overview

A single-player, top-down arcade pickleball game that runs in the browser with no
build step or dependencies. The player rallies against a CPU opponent under core
pickleball rules. Open `index.html` (or serve the directory statically) and play.

## Decisions

- **View:** Top-down (bird's-eye) view of the full court, player on the bottom half,
  CPU on the top half.
- **Players:** Single player vs CPU with three difficulty levels (Easy / Medium / Hard)
  chosen on the start screen.
- **Rules fidelity:** Core rules — diagonal serve that must clear the kitchen,
  two-bounce rule, kitchen (non-volley zone) volley fault, rally scoring to 11 win-by-2.
- **Tech:** Vanilla JavaScript + HTML Canvas, ES modules, zero dependencies.

## Gameplay

- **Movement:** Arrow keys or WASD move the player anywhere in their half.
- **Hitting:** The ball is hit automatically when it comes within reach of the player.
  Shot direction is influenced by the player's movement at contact (moving left aims
  left, etc.).
- **Shot types:** Normal drive by default; holding **Shift** at contact plays a soft
  dink (short, low arc — useful at the kitchen line). Serves are triggered with
  **Space** when it's the player's serve.
- **Ball height:** Simulated vertically — the ball sprite and a separate shadow
  diverge with height so lobs, drives, and dinks read clearly from above.
- **Landing marker:** A subtle marker shows where the ball will land, so both bounce
  positioning and kitchen judgment feel fair.

## Rules enforcement

- **Serve:** Served diagonally from behind the baseline into the opposite service
  court; must clear the kitchen. Landing in the kitchen or wrong court is a fault.
- **Two-bounce rule:** The receiving side must let the serve bounce, and the serving
  side must let the return bounce, before either side may volley.
- **Kitchen:** Volleying (hitting before the bounce) while standing in the non-volley
  zone is a fault.
- **Scoring:** Rally scoring — the winner of every rally scores. First to 11,
  win by 2. Serve alternates sides on each point (simplified: no server numbers).
- **Feedback:** Every point/fault shows a short banner naming the reason
  ("Kitchen fault!", "Two bounces missed!", "Out!") so the rules teach themselves.

## CPU opponent

Predicts the ball's landing spot and moves toward it with capped speed plus random
aim/positioning error. Difficulty scales speed, reaction delay, and error magnitude.
The CPU obeys the same rules as the player (it can commit faults on Easy).

## Architecture

Files in the project root; `game.js` is the entry ES module.

| File | Responsibility |
|------|----------------|
| `index.html` | Canvas element, HUD containers, loads `game.js` |
| `style.css` | Page layout, HUD/banner/menu styling |
| `game.js` | Main loop (requestAnimationFrame), state machine, input handling, wiring |
| `court.js` | Court dimensions/coordinates, court + kitchen rendering, coordinate helpers |
| `ball.js` | Ball state (position, velocity, height), physics integration, bounce, landing prediction, rendering with shadow |
| `player.js` | Human player movement, reach/contact detection, rendering |
| `cpu.js` | CPU movement and shot selection per difficulty |
| `rules.js` | Pure rules logic: serve validity, two-bounce tracking, kitchen faults, scoring, win condition |
| `ui.js` | Score display, banners, start/game-over menus |

**Game states:** `menu → serving → rally → point-banner → (serving | game-over) → menu`.

`rules.js` is pure logic (no canvas/DOM) so it can be unit-tested with Node.

## Error handling

No network, no storage, no user input beyond keys/clicks — failure modes are limited
to logic bugs. Rules logic is unit-tested; the game loop guards against the ball
leaving all bounds by ending the rally with an "Out!" call.

## Testing

- Node-based unit tests for `rules.js` (scoring, win-by-2, two-bounce sequences,
  kitchen faults, serve validity) runnable via `node tests/rules.test.js`.
- Manual playtest for feel: serve flow, rally, dinks, CPU difficulty spread.
