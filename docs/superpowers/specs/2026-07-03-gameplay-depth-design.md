# Gameplay Depth: Lob/Smash, Serve Charge, Around-the-Post

**Date:** 2026-07-03
**Status:** approved

Three additions that deepen the shot vocabulary without adding assists.
All three live in the physics/input layer (`game.js`, `cpu.js`, touch UI);
`rules.js` scoring is untouched.

## 1. Lob — new stroke

- **Input:** `F` key, plus a fifth touch button `LOB`. Same
  hold-to-charge, release-to-hit scheme as the other four strokes.
  `SWING_KEYS` gains `KeyF`; `queueSwing` records `lob: true` when F is
  the released key or is held at release.
- **Flight:** targets the crosshair (keyboard steering fallback like
  drives). Apex scales with charge: `apexZ = 9 + 4 * power` (~9 ft at
  low charge to ~13 ft at full), always above the CPU's
  `MAX_HIT_HEIGHT` of 7 ft at the top of the arc. `timeScale = 1`
  (a lob buys time, it doesn't punch). Neutral spin.
- **Risk:** low charge or a stressed contact (existing `applyStress`)
  drops the lob short → it descends below 7 ft in front of the
  opponent → smash. Deep aims risk sailing long via normal scatter.
- **Feedback:** stroke badge shows `LOB` while F is held; soft paddle
  sfx (existing `sfx.paddle` at low power).
- **CPU:** no new movement code — the existing landing-spot chase makes
  fast profiles run lobs down and slow ones give chase late. The CPU
  already throws lobs (`lobbiness`); unchanged.

## 2. Overhead smash — contextual, both sides

- **Trigger:** a **drive** (not dink/spin/lob) contacting the ball at
  `z >= 5.5` ft becomes an overhead.
- **Player physics:** `apexZ = ball.z + 0.5` (barely rises),
  `timeScale = 0.55 - 0.15 * power` — a steep downward punch.
  The existing power throttle (`ball.z / 4`, capped at 1) already
  grants full power up there.
- **Feedback:** sharper crack sfx (new `sfx.smash`), stronger
  `fx.shake`, "SMASH!" text flair at the contact point.
- **CPU:** mirror branch at the top of `chooseShot`: if `ball.z >= 5.5`,
  return a smash — target the half away from the player,
  `apexZ = ball.z + 0.5`, `timeScale = 0.6 - 0.2 * aggression`,
  aim error applies as usual. Every profile smashes; quality scales
  with its existing traits. This is what keeps the player lob honest.

## 3. Serve charge + placement

- **Player:** in the `serving` state, holding Space (or the touch DRIVE
  button, or the mouse button) charges the existing meter; release
  serves. Power floor 0.25 (a tap ≈ today's safe serve).
  - `apexZ`: lerp 9 → 6.5 with power; `timeScale = 1 - 0.25 * power`.
  - Depth: aimed serves keep the crosshair target; unaimed serves bias
    deeper with power.
  - Scatter grows with power (`rand(-e, e)` with `e ≈ 1 + 2.5 * power`)
    — a full-power serve genuinely risks a service fault.
- **Wiring:** the frame loop's serving branch accrues charge while the
  input is held and fires `serve(power)` on release (release detected
  in the loop, not the keyup handler, so the existing keyup→queueSwing
  no-op stays safe). The post-serve `swingCooldown` grace is unchanged.
- **CPU:** serve power = its `aggression` trait: deeper target band,
  flatter apex, compressed flight, scatter scaled the same way as the
  player's. Banger Bob bombs serves and sometimes faults; Grandpa Gene
  floats them in.
- **Banner text:** "hold SPACE to charge" / "hold DRIVE" on touch.

## 4. Around-the-post

- **Geometry:** `handleNetCrossing` gains an x check: track `prevBallX`,
  interpolate `xAtNet`, and skip all net interaction when `xAtNet` is
  outside `[courtLeft() - 0.9, courtRight() + 0.9]` (posts are drawn at
  ±0.8 ft). Below-net-height balls pass cleanly around the post.
- **Legality:** already correct — only the landing spot is judged, and
  both player and CPU may roam 3 ft past the sidelines. ATPs emerge
  from geometry for both sides; no special shot code.
- **Feedback:** when a shot crosses the net line outside the posts
  below net height, set an `atpShot` flag (cleared on the next hit);
  if that shot wins the point, prefix the banner reason with
  "Around the post!" and fire `sfx.ooh`.
- **Skinny singles:** uses `courtLeft()/courtRight()`, so the narrowed
  net span is respected automatically.

## Supporting work

- **Touch UI:** add the LOB button to `#touch-buttons` (`data-swing="KeyF"`).
- **Help/README:** Controls list gains Lob: F and the charged serve;
  README controls table updated.
- **Tests:**
  - `tests/bot.js`: in the `serving` state, press Space then release
    after ~0.4 s (instead of holding indefinitely) so the
    charge-and-release serve fires.
  - New `tests/depth.test.js`: (a) a full-charge lob launched from the
    baseline is above 7 ft when it crosses the net line; (b) a smash
    contact (z = 6) produces a downward flight that lands in well under
    the normal flight time; (c) a ball crossing the net line at
    x outside the posts keeps its velocity (no net interaction) while
    the same ball inside the posts is blocked; (d) serve scatter grows
    with power (statistical: N charged serves fault more often than N
    tap serves).
  - Existing suites (`rules`, `doubles`, `balance`, `ladder`) must
    still pass; balance thresholds may need a re-run to confirm the
    smash/serve changes don't tilt CPU-vs-bot outcomes.

## Out of scope

- Spin serves (explicitly deferred).
- New stats/unlock hooks for smashes or ATPs.
- Dedicated smash button; lob combos.
