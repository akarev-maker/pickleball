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

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move (your movement direction also steers your shots) |
| Space | Serve (hold ← / → while serving to aim) |
| Shift (held at contact) | Dink — a soft drop shot into the opponent's kitchen |
| R | Quit to menu |

You swing automatically whenever the ball is within reach — position and
movement are the whole game.

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
