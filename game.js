// Main loop and state machine: menu → serving → rally → point-banner →
// (serving | game-over) → menu.

import {
  PLAYER, CPU, other, Score, Rally, isValidServeLanding, inKitchen,
} from './rules.js';
import {
  setupCanvas, drawCourt, COURT_W, COURT_L, NET_Y, KITCHEN_TOP, CENTER_X,
} from './court.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { Cpu } from './cpu.js';
import * as ui from './ui.js';

const NET_HEIGHT = 3; // ft
const BANNER_SECS = 2;
const CPU_SERVE_DELAY = 1.2;

const canvas = document.getElementById('game');
let view = setupCanvas(canvas);
window.addEventListener('resize', () => { view = setupCanvas(canvas); });

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const ball = new Ball();
const player = new Player();
const cpu = new Cpu();

let state = 'menu';
let score = new Score();
let rally = null;
let serveX = 0;
let serveTimer = 0;
let bannerTimer = 0;
let prevBallY = 0;
let prevBallZ = 0;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function startGame(difficulty) {
  cpu.setDifficulty(difficulty);
  score = new Score();
  ui.updateScore(score, score.servingSide);
  startServe();
}

function startServe() {
  const server = score.servingSide;
  const evenScore = score.get(server) % 2 === 0;
  // Servers serve from their right on an even score. The bottom player's
  // right is +x; the top player's right is -x.
  if (server === PLAYER) {
    serveX = evenScore ? CENTER_X + 5 : CENTER_X - 5;
    player.x = serveX;
    player.y = COURT_L + 1.5;
    cpu.reset();
    cpu.x = COURT_W - serveX; // receiver covers the diagonal box
    ui.showBanner('Your serve — press SPACE (hold ←/→ to aim)', 0);
  } else {
    serveX = evenScore ? CENTER_X - 5 : CENTER_X + 5;
    cpu.reset();
    cpu.x = serveX;
    cpu.y = -1.5;
    player.x = COURT_W - serveX;
    player.y = COURT_L - 2;
    serveTimer = CPU_SERVE_DELAY;
    ui.showBanner('CPU serves…', 0);
  }
  const sy = server === PLAYER ? COURT_L + 1.5 : -1.5;
  ball.placeAt(serveX, sy, 2.5);
  state = 'serving';
}

function serve() {
  const server = score.servingSide;
  rally = new Rally(server);
  rally.recordHit(server, { volley: false, inKitchen: false });
  ui.hideBanner();

  if (server === PLAYER) {
    let aim = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) aim -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) aim += 1;
    const tx = clamp(COURT_W - serveX + aim * 3 + rand(-1.2, 1.2), 1, COURT_W - 1);
    ball.launchTo(tx, rand(6, 12), rand(7.5, 9));
  } else {
    const err = cpu.difficulty.aimError;
    const tx = clamp(COURT_W - serveX + rand(-err, err), 1, COURT_W - 1);
    ball.launchTo(tx, clamp(rand(33, 41) + rand(-err, err), 30, COURT_L + 1), rand(7.5, 9));
  }
  prevBallY = ball.y;
  prevBallZ = ball.z;
  state = 'rally';
}

function endRally({ winner, reason }) {
  score.add(winner);
  ui.updateScore(score, score.servingSide);
  const who = winner === PLAYER ? 'Point: YOU' : 'Point: CPU';
  ui.showBanner(`${reason}  ${who}`, 0);
  bannerTimer = BANNER_SECS;
  state = 'point-banner';
}

function playerShot() {
  const dir = player.moveDir();
  const dink = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (dink) {
    // Drop it into the CPU's kitchen.
    return {
      tx: clamp(ball.x + dir.dx * 5 + rand(-1, 1), 1, COURT_W - 1),
      ty: rand(KITCHEN_TOP + 1.5, NET_Y - 1),
      apexZ: 4.5,
    };
  }
  return {
    tx: clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
    ty: clamp(9 + dir.dy * 6 + rand(-1.5, 1.5), 2, NET_Y - 2),
    apexZ: rand(6.5, 7.5),
  };
}

function hitterInKitchen(who) {
  return inKitchen(who.y) && who.x > 0 && who.x < COURT_W;
}

// The return of serve and the third shot must be played off the bounce;
// since hitting is automatic, both sides simply wait for that bounce
// instead of being forced into a fault.
function mustLetBounce() {
  const hitNumber = rally.hitCount + 1;
  return (hitNumber === 2 || hitNumber === 3) && !rally.bouncedSinceLastHit;
}

function handleHits() {
  // Player hits balls coming toward them (vy > 0), CPU the reverse.
  if (ball.vy > 0 && player.canReach(ball) && !mustLetBounce()) {
    const volley = !rally.bouncedSinceLastHit;
    const result = rally.recordHit(PLAYER, { volley, inKitchen: hitterInKitchen(player) });
    if (result) return result;
    const shot = playerShot();
    ball.launchTo(shot.tx, shot.ty, shot.apexZ);
    return null;
  }

  if (ball.vy < 0 && cpu.canReach(ball) && !mustLetBounce()) {
    const volley = !rally.bouncedSinceLastHit;
    // Medium and hard CPUs know better than to volley from the kitchen.
    if (volley && hitterInKitchen(cpu) && cpu.difficulty.aimError < 4) return null;
    const result = rally.recordHit(CPU, { volley, inKitchen: hitterInKitchen(cpu) });
    if (result) return result;
    const shot = cpu.chooseShot(ball, player);
    ball.launchTo(shot.tx, shot.ty, shot.apexZ);
    return null;
  }

  return null;
}

function handleBounce() {
  const isFirstBounceOfServe = rally.hitCount === 1 && !rally.bouncedSinceLastHit;
  if (isFirstBounceOfServe && !isValidServeLanding(rally.server, serveX, ball.x, ball.y)) {
    return { winner: other(rally.server), reason: 'Service fault!' };
  }
  const isFirstBounceSinceHit = !rally.bouncedSinceLastHit;
  const out = ball.x < 0 || ball.x > COURT_W || ball.y < 0 || ball.y > COURT_L;
  if (isFirstBounceSinceHit && out) {
    return rally.recordOut(rally.lastHitter);
  }
  return rally.recordBounce();
}

function checkNet() {
  const crossed = (prevBallY - NET_Y) * (ball.y - NET_Y) < 0;
  if (!crossed) return null;
  const f = (NET_Y - prevBallY) / (ball.y - prevBallY);
  const zAtNet = prevBallZ + (ball.z - prevBallZ) * f;
  if (zAtNet < NET_HEIGHT) {
    return { winner: other(rally.lastHitter), reason: 'Into the net!' };
  }
  return null;
}

function updateRally(dt) {
  player.update(dt, keys);
  cpu.update(dt, ball);

  let result = handleHits();

  if (!result) {
    prevBallY = ball.y;
    prevBallZ = ball.z;
    const event = ball.update(dt);
    if (event === 'bounce') {
      result = handleBounce();
    } else {
      result = checkNet();
    }
    // A ball that rolled dead without a rally-ending bounce: last hitter wins.
    if (!result && !ball.inFlight) {
      result = { winner: rally.lastHitter, reason: 'No return!' };
    }
  }

  if (result) endRally(result);
}

function draw() {
  drawCourt(view.ctx, view);
  cpu.draw(view.ctx, view);
  player.draw(view.ctx, view);
  if (state !== 'menu') ball.draw(view.ctx, view);
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state === 'serving') {
    if (score.servingSide === PLAYER) {
      if (keys.has('Space')) serve();
    } else {
      cpu.update(dt, ball);
      player.update(dt, keys);
      serveTimer -= dt;
      if (serveTimer <= 0) serve();
    }
  } else if (state === 'rally') {
    updateRally(dt);
  } else if (state === 'point-banner') {
    player.update(dt, keys);
    ball.update(dt); // let the ball settle visually
    bannerTimer -= dt;
    if (bannerTimer <= 0) {
      ui.hideBanner();
      const winner = score.winner();
      if (winner) {
        state = 'game-over';
        const title = winner === PLAYER ? 'You win!' : 'CPU wins!';
        ui.showGameOver(
          `${title}  ${score.get(PLAYER)}–${score.get(CPU)}`,
          () => { state = 'menu'; ui.showMenu(startGame); },
        );
      } else {
        startServe();
      }
    }
  }

  if (keys.has('KeyR') && (state === 'rally' || state === 'serving')) {
    keys.delete('KeyR');
    state = 'menu';
    ui.hideOverlays();
    ui.showMenu(startGame);
  }

  draw();
  requestAnimationFrame(frame);
}

ui.updateScore(score, score.servingSide);
if (window.location?.hash === '#demo') {
  // Dev/demo mode: start immediately on medium and auto-serve.
  ui.hideOverlays();
  keys.add('Space');
  startGame('medium');
} else {
  ui.showMenu(startGame);
}
requestAnimationFrame(frame);
