# Pickleball

A top-down arcade pickleball game for the browser. You vs the CPU, first to 11,
win by 2 — and yes, the kitchen rules are real.

No dependencies, no build step.

## Modes

- **Tournament:** climb a ladder of 8 named opponents, each with a distinct
  playstyle — from Rookie Rick to The Wall. Win to advance a rung; lose and
  retry. Progress is saved in your browser.
- **Quick Play:** a single game vs an easy/medium/hard CPU.
- **Doubles:** you and a CPU partner vs two CPUs — one hit per team, your
  partner covers whichever half you don't.
- **Skinny Singles:** half-court practice game; the right half is out for
  everyone.
- **Best of 3:** toggle on the difficulty row for any quick-play variant.
- **Daily challenge:** a date-seeded opponent and physics modifier (crosswinds,
  moon gravity…) — one win credit per day.

Points end with a slow-mo replay of the final shot (any key skips it). Sound
is fully synthesized — mute with **M** or the speaker button.

**Stats** (wins, shutouts, championships, longest rally, dailies) persist in
your browser, and milestones unlock paddle colors and ball skins in the
**Locker** on the main menu.

## Run it

ES modules need an HTTP server (opening `index.html` directly won't work):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npm start`, which runs the same command.

## Controls

| Input | Action |
|-------|--------|
| Arrow keys / WASD | Move |
| Mouse | Aim — the crosshair is where your shots (and serves) go |
| Hold + release Space / mouse button | Swing: hold to charge power, release as the ball arrives. Mistimed swings whiff. |
| Shift (held at contact) | Dink — a soft drop shot into the opponent's kitchen |
| E / Q (held at contact) | Topspin / slice. Topspin dips — same target, faster ball, kicks forward off the bounce. Slice floats in and skids low. |
| Space | Serve |
| V | Toggle camera: top-down or behind-the-player pseudo-3D |
| Esc / P | Pause (resume, restart match, or quit) |
| M | Mute |
| R | Quit to menu |

Clean, planted hits go where you aim; hits at full stretch or on the run
scatter. Swinging before a required bounce (the serve and its return) is a
fault, and volleying from the kitchen still costs you the point. The net is
physical: tape clips can tumble over and stay live, netted balls drop back
and cost you the point. Balls touching a line are in.

## Rules enforced

- **Serve:** diagonal, must land past the kitchen in the correct service court.
- **Two-bounce rule:** the serve and the return must each bounce before anyone
  may volley. (Your player automatically waits for these bounces.)
- **Kitchen:** volleying while standing in the non-volley zone is a fault —
  step back before taking balls out of the air.
- **Scoring:** rally scoring, first to 11, win by 2. Serve alternates each point.

Every rally ends with a banner telling you why.

## Development

```sh
node tests/rules.test.js        # rules engine unit tests
node tests/smoke.test.js        # headless full-game simulation
node tests/tournament.test.js   # tournament flow: win advances the rung
node tests/ladder.test.js       # ladder difficulty ascends (--sweep for all 8)
node tests/balance.test.js hard # bot vs quick-play difficulty (add 'charge')
```

Open `http://localhost:8000/#demo` for an auto-playing demo (medium CPU,
auto-serve) — handy for eyeballing rendering changes.
