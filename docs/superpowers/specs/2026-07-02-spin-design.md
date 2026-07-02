# Stage 2: Spin Mechanics — Design Spec (lean)

**Date:** 2026-07-02 · **Status:** implemented same-session (user requested minimal process due to usage budget)

- **Input:** hold **E** at contact = topspin (+1), **Q** = slice (−1). Dinks default to mild slice (−0.3) unless overridden. Serves are neutral.
- **Flight:** effective gravity `Geff = G · (1 + 0.35·spin)`. `launchTo`/`update`/`predictLanding` all use it, so shots still land exactly on target: topspin dips → same target reached faster (pairs with power); slice floats slower.
- **Bounce:** topspin kicks forward (friction 0.75→~0.97, slightly higher hop); slice skids low (restitution ×~0.28 at full slice) while keeping speed. Spin decays ×0.4 per bounce.
- **CPU:** no new roster knobs — drives carry `aggression · 0.6` topspin, dinks slice at −0.4, lobs neutral.
- **Visuals:** ball tints orange with topspin, icy blue with slice, while in flight.
- **Testing:** Node physics sanity (topspin faster to same target; slice bounces lower/skids), existing rules/smoke/tournament suites, ladder endpoints re-check.
