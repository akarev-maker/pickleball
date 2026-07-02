// Main loop and state machine: menu → serving → rally → point-banner →
// (serving | game-over) → menu.

import {
  PLAYER, CPU, other, Score, Rally, isValidServeLanding, inKitchen, LINE_TOL,
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

// Mouse: crosshair aiming + hold-to-charge power.
const aim = { x: CENTER_X, y: 9, active: false };
let mouseHeld = false;
canvas.addEventListener('mousemove', (e) => {
  const c = view.toCourt(e.offsetX, e.offsetY);
  aim.x = clamp(c.x, 0.5, COURT_W - 0.5);
  aim.y = clamp(c.y, 0.5, NET_Y - 1);
  aim.active = true;
});
canvas.addEventListener('mousedown', () => { mouseHeld = true; });
window.addEventListener('mouseup', () => { mouseHeld = false; });

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
let charge = 0; // 0..1 shot power, held Space / mouse button charges it
let netRebound = false; // ball fell back off the net; label the point 'Netted!'

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
    let tx;
    let ty;
    if (aim.active) {
      tx = clamp(aim.x + rand(-1, 1), 1, COURT_W - 1);
      ty = clamp(aim.y + rand(-1, 1), 1, KITCHEN_TOP - 0.5);
    } else {
      let steer = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
      tx = clamp(COURT_W - serveX + steer * 3 + rand(-1.2, 1.2), 1, COURT_W - 1);
      ty = rand(6, 12);
    }
    ball.launchTo(tx, ty, rand(7.5, 9));
  } else {
    const err = cpu.difficulty.aimError;
    const tx = clamp(COURT_W - serveX + rand(-err, err), 1, COURT_W - 1);
    ball.launchTo(tx, clamp(rand(33, 41) + rand(-err, err), 30, COURT_L + 1), rand(7.5, 9));
  }
  prevBallY = ball.y;
  prevBallZ = ball.z;
  netRebound = false;
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
  const dink = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // You can only unload on a ball you take high — power on a low ball is
  // throttled so a full meter doesn't just drill the net.
  const power = charge * Math.max(0.3, Math.min(1, ball.z / 4));
  charge = 0;

  if (dink) {
    // Drop it into the CPU's kitchen; the crosshair picks the spot along it.
    const dir = player.moveDir();
    const tx = aim.active ? aim.x : clamp(ball.x + dir.dx * 5, 1, COURT_W - 1);
    return {
      tx: clamp(tx + rand(-1, 1), 1, COURT_W - 1),
      ty: aim.active
        ? clamp(aim.y, KITCHEN_TOP + 1, NET_Y - 1)
        : rand(KITCHEN_TOP + 1.5, NET_Y - 1),
      apexZ: 4.5,
      power: 0,
    };
  }

  // Drives go where the crosshair points (keyboard steering as fallback).
  // More power flattens the arc AND compresses the flight time: faster and
  // harder to chase, but riskier — extra scatter, and a flat ball can find
  // the net.
  const apexZ = 5.4 - 1.8 * power + rand(-0.3, 0.3);
  const timeScale = 1 - 0.3 * power;
  if (aim.active) {
    return { tx: aim.x, ty: aim.y, apexZ, power, timeScale };
  }
  const dir = player.moveDir();
  return {
    tx: clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
    ty: clamp(9 + dir.dy * 6 + rand(-1.5, 1.5), 2, NET_Y - 2),
    apexZ,
    power,
    timeScale,
  };
}

// Shots hit at full stretch are error-prone: extra scatter (which can send
// the ball out) and a flattened arc (which can find the net). This is what
// lets good placement win rallies.
function applyStress(shot, hitter, base) {
  // Stress is the hitter's lateral offset from the ball's flight line — a
  // defender standing on the path plays a clean shot; a lunge is erratic.
  const speed = Math.hypot(ball.vx, ball.vy);
  let offset;
  if (speed > 0.1) {
    const ux = ball.vx / speed;
    const uy = ball.vy / speed;
    offset = Math.abs((ball.x - hitter.x) * uy - (ball.y - hitter.y) * ux);
  } else {
    offset = Math.hypot(ball.x - hitter.x, ball.y - hitter.y);
  }
  const runFactor = Math.min((hitter.speedNow || 0) / 16, 1);
  const stress = Math.min(1, Math.max(offset / 2.5, runFactor * 0.7));
  const e = base * (0.3 + 3 * stress * stress);
  shot.tx += rand(-e, e);
  shot.ty += rand(-e, e);
  shot.apexZ = Math.max(3.2, shot.apexZ - stress * rand(0, 2));
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

// A ball on course to land out is left alone (playing it would rescue the
// opponent's error); once it has bounced in, it's live.
function ballIsPlayable() {
  if (rally.bouncedSinceLastHit) return true;
  const land = ball.predictLanding();
  return land.x >= -0.2 && land.x <= COURT_W + 0.2
    && land.y >= -0.2 && land.y <= COURT_L + 0.2;
}

function handleHits() {
  const playable = ballIsPlayable();
  // Player hits balls coming toward them (vy > 0), CPU the reverse; nobody
  // may hit their own shot twice (e.g. after it rebounds off the net).
  if (ball.vy > 0 && playable && rally.lastHitter !== PLAYER
      && player.canReach(ball) && !mustLetBounce()) {
    const volley = !rally.bouncedSinceLastHit;
    const result = rally.recordHit(PLAYER, { volley, inKitchen: hitterInKitchen(player) });
    if (result) return result;
    const shot = playerShot();
    applyStress(shot, player, 1.2 + 0.6 * shot.power);
    ball.launchTo(shot.tx, shot.ty, shot.apexZ, shot.timeScale ?? 1);
    netRebound = false;
    return null;
  }

  if (ball.vy < 0 && playable && rally.lastHitter !== CPU
      && cpu.canReach(ball) && !mustLetBounce()) {
    const volley = !rally.bouncedSinceLastHit;
    // Medium and hard CPUs know better than to volley from the kitchen.
    if (volley && hitterInKitchen(cpu) && cpu.difficulty.aimError < 4) return null;
    const result = rally.recordHit(CPU, { volley, inKitchen: hitterInKitchen(cpu) });
    if (result) return result;
    const shot = cpu.chooseShot(ball, player);
    applyStress(shot, cpu, cpu.difficulty.aimError * 0.5);
    ball.launchTo(shot.tx, shot.ty, shot.apexZ);
    netRebound = false;
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
  // A ball touching the line is in.
  const out = ball.x < -LINE_TOL || ball.x > COURT_W + LINE_TOL
    || ball.y < -LINE_TOL || ball.y > COURT_L + LINE_TOL;
  if (isFirstBounceSinceHit && out) {
    return rally.recordOut(rally.lastHitter);
  }
  return rally.recordBounce(ball.y < NET_Y ? CPU : PLAYER);
}

// The net is physical: a ball clipping the tape may tumble over and stay
// live (net cord); a ball hit squarely into the net drops back on the
// hitter's side, where it dies and the normal rules award the point.
function handleNetCrossing() {
  const crossed = (prevBallY - NET_Y) * (ball.y - NET_Y) < 0;
  if (!crossed) return;
  const f = (NET_Y - prevBallY) / (ball.y - prevBallY);
  const zAtNet = prevBallZ + (ball.z - prevBallZ) * f;
  if (zAtNet >= NET_HEIGHT) return;

  if (zAtNet > NET_HEIGHT - 0.45 && Math.random() < 0.35) {
    // Net cord: the ball clips the tape and dribbles over.
    ball.vy *= 0.3;
    ball.vx *= 0.5;
    ball.vz = Math.min(ball.vz, 1);
    return;
  }

  // Into the net: the ball pops back off the net and drops on the
  // hitter's side.
  ball.y = NET_Y + (prevBallY > NET_Y ? 0.5 : -0.5);
  ball.vy = -ball.vy * 0.22;
  ball.vx *= 0.35;
  ball.vz = Math.min(ball.vz, 0.5);
  netRebound = true;
}

function updateRally(dt) {
  player.update(dt, keys);
  cpu.update(dt, ball, ballIsPlayable());

  let result = handleHits();

  if (!result) {
    prevBallY = ball.y;
    prevBallZ = ball.z;
    const event = ball.update(dt);
    if (event === 'bounce') {
      result = handleBounce();
    } else {
      handleNetCrossing();
    }
    // A ball that rolled dead: whichever side it died on failed to return it.
    if (!result && !ball.inFlight) {
      result = { winner: ball.y < NET_Y ? PLAYER : CPU, reason: 'No return!' };
    }
  }

  if (result) {
    if (netRebound) result.reason = 'Netted!';
    endRally(result);
  }
}

function drawCrosshair(ctx) {
  const p = view.toPx(aim.x, aim.y);
  const r = view.scale * 0.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.px, p.py, r, 0, Math.PI * 2);
  ctx.moveTo(p.px - r * 1.6, p.py);
  ctx.lineTo(p.px - r * 0.6, p.py);
  ctx.moveTo(p.px + r * 0.6, p.py);
  ctx.lineTo(p.px + r * 1.6, p.py);
  ctx.moveTo(p.px, p.py - r * 1.6);
  ctx.lineTo(p.px, p.py - r * 0.6);
  ctx.moveTo(p.px, p.py + r * 0.6);
  ctx.lineTo(p.px, p.py + r * 1.6);
  ctx.stroke();
}

function drawChargeMeter(ctx) {
  const p = view.toPx(player.x, player.y);
  const w = view.scale * 2.4;
  const h = view.scale * 0.35;
  const x = p.px - w / 2;
  const y = p.py + view.scale * 1.3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = charge < 0.7 ? '#b8e986' : '#ff8a5e';
  ctx.fillRect(x, y, w * charge, h);
  if (charge >= 1) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }
}

function draw() {
  drawCourt(view.ctx, view);
  cpu.draw(view.ctx, view);
  player.draw(view.ctx, view);
  if (state !== 'menu') ball.draw(view.ctx, view);
  if ((state === 'rally' || state === 'serving') && aim.active) drawCrosshair(view.ctx);
  if (charge > 0) drawChargeMeter(view.ctx);
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
    const charging = keys.has('Space') || mouseHeld;
    charge = charging ? Math.min(1, charge + dt / 0.8) : Math.max(0, charge - dt * 0.5);
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

// Debug/test handle (used by tests/balance.test.js and handy in devtools).
window.__pickleball = { ball, player, cpu, getState: () => state, getScore: () => score };

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
