# Stage 1: Juice, Tournament & Personalities — Design Spec

**Date:** 2026-07-01
**Status:** Approved by user
**Builds on:** 2026-07-01-pickleball-game-design.md

## Overview

Turn the pickleball sim into a game with an arc: a ladder of 8 named CPU
personalities, plus audio/visual juice (SFX, crowd, particles, trails,
screen shake) and slow-motion point replays. Zero new dependencies.

## Modes & menu

- Start screen offers **Quick Play** (existing easy/medium/hard) and
  **Tournament**.
- Tournament shows a ladder screen: 8 opponents listed bottom (easiest) to
  top (hardest), beaten rungs marked, current rung highlighted, with
  "Play" and "Reset ladder" actions.
- Each match is a single game to 11, win by 2. Winning advances one rung;
  losing lets you retry the same rung.
- Current rung persists in `localStorage` (`pickleball.rung`); storage
  failures (private mode) degrade to in-memory only.
- Beating rung 8 shows a champion screen (confetti burst + applause);
  the ladder can then be reset and replayed.

## Opponents & personalities

`cpu.js` generalizes its difficulty knobs into personality profiles:

| Knob | Meaning |
|------|---------|
| `speed`, `reaction`, `aimError` | existing difficulty knobs |
| `dinkiness` 0..1 | preference for the kitchen dink game |
| `aggression` 0..1 | flat/fast drive bias (uses launchTo timeScale, like player power) |
| `lobbiness` 0..1 | chance of deep, high lobs |

Roster of 8 (ascending): Rookie Rick (slow, wild), Grandpa Gene (slow but
deadly-accurate dinker), Lob Lisa (lobs), Banger Bob (max aggression, no
touch), Steady Stella (balanced), Kitchen Kate (fast dink game), Marathon
Mike (retriever: very fast, patient), The Wall (fast, accurate, adaptable).
Each has a name, paddle color, tagline shown before the match, and win/lose
lines shown at match end. Quick Play difficulties map to equivalent profiles.

## Juice (fx.js)

- Dust particle burst on bounces; white flash burst on net cords/net hits.
- Ball trail whose length/intensity scales with horizontal ball speed.
- Screen shake (small, ~0.15 s) on smashes (timeScale-compressed hits) and
  net impacts; canvas translate, capped magnitude.
- Winning shot's landing spot briefly ringed at rally end.
- Champion confetti burst.
- All canvas-drawn; particle count capped (~200).

## Audio (audio.js)

- Web Audio only, no asset files. Context created lazily on first user
  gesture; absent AudioContext (tests/old browsers) disables audio silently.
- SFX: paddle pop (pitch rises with shot power), bounce thump, net thunk,
  dink tick, score ding.
- Crowd: short filtered-noise "oooh" on net cords and netted balls;
  applause swell on game point and match/championship win.
- Mute: M key and a speaker button; persisted in `localStorage`
  (`pickleball.muted`).

## Slow-mo replay (replay.js)

- During rallies, a ring buffer records ~2.5 s of frames:
  ball (x, y, z) + player and CPU positions.
- On rally end, the final ~1.2 s plays back at 0.4× speed with a letterbox
  and "REPLAY" label, then the point banner shows. Any key skips.
- Pure position playback (no physics re-run); entities' positions are
  driven from the recording, then reset by the next serve setup as usual.
- New game state: `rally → replay → point-banner`.

## Architecture

New modules: `audio.js`, `fx.js`, `replay.js`, `ladder.js` (roster +
persistence). `cpu.js` gains `setProfile()`; `ui.js` gains ladder/champion
screens and mode menu; `index.html` gains the static overlay markup
(stub-friendly: fixed element ids, lists filled via innerHTML);
`game.js` wires hooks (SFX/FX/replay/tournament flow).

## Testing

- Existing 18 rules tests unchanged and passing.
- `tests/ladder.test.js`: neutral bot vs each roster profile (capped sim);
  asserts the bot beats rung 1 and that rung 8 concedes fewer points than
  rung 1 (difficulty ascends); prints the full sweep for tuning.
- Smoke test extension: tournament flow — start tournament, bot wins vs
  rung 1, rung advances and persists in the localStorage stub.
- FX/audio verified via demo-mode screenshots and by ear.
