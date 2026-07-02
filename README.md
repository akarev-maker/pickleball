# Pickleball

A top-down arcade pickleball game for the browser. You vs the CPU, first to 11,
win by 2 — and yes, the kitchen rules are real.

No dependencies, no build step.

## Modes

- **Tournament:** climb a ladder of 8 named opponents, each with a distinct
  playstyle — from Rookie Rick to The Wall. Win to advance a rung; lose and
  retry. Progress is saved in your browser.
- **Quick Play:** a single game vs an easy/medium/hard CPU.

Points end with a slow-mo replay of the final shot (any key skips it). Sound
is fully synthesized — mute with **M** or the speaker button.

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
| Esc / P | Pause (resume, restart match, or quit) |
| M | Mute |
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
node tests/rules.test.js        # rules engine unit tests
node tests/smoke.test.js        # headless full-game simulation
node tests/tournament.test.js   # tournament flow: win advances the rung
node tests/ladder.test.js       # ladder difficulty ascends (--sweep for all 8)
node tests/balance.test.js hard # bot vs quick-play difficulty (add 'charge')
```

Open `http://localhost:8000/#demo` for an auto-playing demo (medium CPU,
auto-serve) — handy for eyeballing rendering changes.
