# Pickleball

A top-down arcade pickleball game for the browser. You vs the CPU, first to 11,
win by 2 — and yes, the kitchen rules are real.

No dependencies, no build step.

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
| Hold mouse button / Space | Charge power: flatter, faster, riskier shots |
| Shift (held at contact) | Dink — a soft drop shot into the opponent's kitchen |
| Space | Serve |
| R | Quit to menu |

You swing automatically whenever the ball is within reach. Clean, planted
hits go where you aim; hits at full stretch or on the run scatter. The net is
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
node tests/rules.test.js   # rules engine unit tests
node tests/smoke.test.js   # headless full-game simulation
```

Open `http://localhost:8000/#demo` for an auto-playing demo (medium CPU,
auto-serve) — handy for eyeballing rendering changes.
