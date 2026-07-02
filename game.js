// Main loop and state machine: menu → serving → rally → point-banner →
// (serving | game-over) → menu.

import {
  PLAYER, CPU, other, Score, Rally, isValidServeLanding, inKitchen, LINE_TOL,
} from './rules.js';
import {
  setupCanvas, drawCourt, drawNet,
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X,
} from './court.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { Cpu } from './cpu.js';
import * as ui from './ui.js';
import { ROSTER, loadRung, saveRung, resetLadder } from './ladder.js';
import { initAudio, sfx, toggleMute, isMuted } from './audio.js';
import { Fx } from './fx.js';
import { ReplayRecorder } from './replay.js';
import {
  recordPoint, recordGame, recordDailyWin, dailyChallenge, todayStr, equippedColors,
} from './progress.js';

const NET_HEIGHT = 3; // ft
const BANNER_SECS = 2;
const CPU_SERVE_DELAY = 1.2;

const canvas = document.getElementById('game');
let viewMode = 'top';
try {
  if (localStorage.getItem('pickleball.view') === '3d') viewMode = '3d';
} catch { /* storage unavailable */ }
let view = setupCanvas(canvas, viewMode);
window.addEventListener('resize', () => { view = setupCanvas(canvas, viewMode); });

function toggleView() {
  viewMode = viewMode === 'top' ? '3d' : 'top';
  try {
    localStorage.setItem('pickleball.view', viewMode);
  } catch { /* storage unavailable */ }
  view = setupCanvas(canvas, viewMode);
}

const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  initAudio();
  if (e.code === 'KeyM') { ui.setMuteLabel(toggleMute()); return; }
  if (e.code === 'KeyV') { toggleView(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (state === 'replay') replaySkip = true;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') queueSwing();
});

// Mouse: crosshair aiming + hold-to-charge power.
const aim = { x: CENTER_X, y: 9, active: false };
let mouseHeld = false;
canvas.addEventListener('mousemove', (e) => {
  const c = view.toCourt(e.offsetX, e.offsetY);
  aim.x = clamp(c.x, 0.5, COURT_W - 0.5);
  aim.y = clamp(c.y, 0.5, NET_Y - 1);
  aim.active = true;
});
canvas.addEventListener('mousedown', () => { initAudio(); mouseHeld = true; });
window.addEventListener('mouseup', () => {
  mouseHeld = false;
  queueSwing();
});

const ball = new Ball();
const player = new Player();
const cpu = new Cpu('top');
const opp2 = new Cpu('top'); // second opponent in doubles
const partner = new Cpu('bottom'); // your doubles partner
const fx = new Fx();
const recorder = new ReplayRecorder();

let state = 'menu';
let score = new Score();
let rally = null;
let mode = 'quick'; // 'quick' | 'tournament' | 'daily'
let variant = 'singles'; // 'singles' | 'doubles' | 'skinny'
let bestOf3 = false;
let matchGames = { [PLAYER]: 0, [CPU]: 0 };
let opponent = null; // roster profile in tournament mode
let introTimer = 0;
let pendingResult = null;
let replayClip = [];
let replayIdx = 0;
let replaySkip = false;
let serveX = 0;
let serveTimer = 0;
let bannerTimer = 0;
let prevBallY = 0;
let prevBallZ = 0;
let charge = 0; // 0..1 shot power, held Space / mouse button charges it
let netRebound = false; // ball fell back off the net; label the point 'Netted!'
let swingWindow = 0; // buffered swing: connects if the ball arrives in time
let swingCooldown = 0; // whiff recovery; also grace right after serving
let swingMods = { dink: false, spin: 0 }; // captured when the swing starts

// A release starts a swing: it stays live for a short window so slightly
// early timing still connects. Dink/spin modifiers are locked in here —
// releasing them together with the swing button still counts.
function queueSwing() {
  if (state !== 'rally' || swingCooldown > 0 || swingWindow > 0) return;
  swingMods = {
    dink: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    spin: keys.has('KeyE') ? 1 : (keys.has('KeyQ') ? -1 : 0),
  };
  swingWindow = 0.16;
  player.swingT = 0.28;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function opponentName() {
  return opponent ? opponent.name : 'CPU';
}

let lastDifficulty = 'medium';
let daily = null;

function applyCosmetics() {
  const c = equippedColors();
  player.color = c.paddle;
  ball.skinColor = c.ball;
}

function clearModifiers() {
  ball.wind = 0;
  ball.gravityScale = 1;
}

let lastOpts = {};

function setVariant(v) {
  variant = v;
  cpu.homeX = v === 'skinny' ? CENTER_X / 2 : (v === 'doubles' ? CENTER_X - 5 : CENTER_X);
  cpu.coverHalf = v === 'doubles' ? 'left' : null;
  opp2.homeX = CENTER_X + 5;
  opp2.coverHalf = 'right';
}

function startGame(difficulty, opts = {}) {
  mode = 'quick';
  opponent = null;
  lastDifficulty = difficulty;
  lastOpts = opts;
  bestOf3 = !!opts.bestOf3;
  matchGames = { [PLAYER]: 0, [CPU]: 0 };
  clearModifiers();
  setVariant(opts.variant || 'singles');
  cpu.setDifficulty(difficulty);
  if (variant === 'doubles') {
    opp2.setDifficulty(difficulty);
    // Your partner is competent but a step slower than you.
    partner.setProfile({ ...cpu.difficulty, speed: cpu.difficulty.speed - 1 });
    opp2.reset();
    partner.reset();
  }
  score = new Score();
  ui.updateScore(score, score.servingSide);
  startServe();
}

function startDaily() {
  mode = 'daily';
  setVariant('singles');
  bestOf3 = false;
  daily = dailyChallenge();
  opponent = ROSTER[daily.opponentIndex];
  cpu.setProfile(opponent);
  ball.wind = daily.modifier.wind;
  ball.gravityScale = daily.modifier.gravityScale;
  score = new Score();
  ui.updateScore(score, score.servingSide, opponent.name);
  ui.showBanner(`Daily vs ${opponent.name}: ${daily.modifier.label}`, 0);
  introTimer = 3;
  state = 'intro';
}

const PAUSABLE = ['intro', 'serving', 'rally', 'replay', 'point-banner'];
let pausedFrom = null;

function togglePause() {
  if (state === 'paused') {
    ui.hidePause();
    state = pausedFrom;
  } else if (PAUSABLE.includes(state)) {
    pausedFrom = state;
    state = 'paused';
    ui.showPause({
      onResume: togglePause,
      onRestart: () => {
        ui.hidePause();
        if (mode === 'tournament') startTournamentMatch();
        else if (mode === 'daily') startDaily();
        else startGame(lastDifficulty, lastOpts);
      },
      onQuit: () => {
        ui.hidePause();
        showMainMenu();
      },
    });
  }
}

function showMainMenu() {
  state = 'menu';
  ui.showModeMenu(startGame, openLadder, {
    onDaily: startDaily,
    onCosmetics: applyCosmetics,
  });
}

function openLadder() {
  state = 'menu';
  ui.showLadder(ROSTER, loadRung(), {
    onPlay: startTournamentMatch,
    onReset: () => { resetLadder(); openLadder(); },
    onBack: showMainMenu,
  });
}

function startTournamentMatch() {
  mode = 'tournament';
  setVariant('singles');
  bestOf3 = false;
  clearModifiers();
  opponent = ROSTER[loadRung()];
  cpu.setProfile(opponent);
  score = new Score();
  ui.updateScore(score, score.servingSide, opponent.name);
  ui.showBanner(`Rung ${loadRung() + 1}: ${opponent.name} — ${opponent.tagline}`, 0);
  introTimer = 2.5;
  state = 'intro';
}

function handleMatchOver(winner) {
  const won = winner === PLAYER;
  const title = won
    ? `You win!  ${score.get(PLAYER)}–${score.get(CPU)}`
    : `${opponentName()} wins!  ${score.get(CPU)}–${score.get(PLAYER)}`;
  sfx.applause();

  const champion = mode === 'tournament' && won && loadRung() + 1 >= ROSTER.length;
  recordGame({ won, shutout: won && score.get(CPU) === 0, champion });

  if (mode === 'daily') {
    if (won) recordDailyWin(todayStr());
    ui.showGameOver(title, won ? 'Daily challenge complete!' : daily.modifier.label, 'Back to menu', showMainMenu);
    return;
  }

  if (mode !== 'tournament') {
    ui.showGameOver(title, '', 'Play again', showMainMenu);
    return;
  }

  if (won) {
    const newRung = loadRung() + 1;
    saveRung(newRung);
    if (champion) {
      fx.spawnConfetti();
      ui.showChampion(showMainMenu);
      return;
    }
    ui.showGameOver(title, opponent.loseLine, 'Back to ladder', openLadder);
  } else {
    ui.showGameOver(title, opponent.winLine, 'Back to ladder', openLadder);
  }
}

function startServe() {
  const server = score.servingSide;
  const evenScore = score.get(server) % 2 === 0;
  // Servers serve from their right on an even score. The bottom player's
  // right is +x; the top player's right is -x. Skinny plays the left
  // half-court only, so everyone serves straight from mid-half.
  if (server === PLAYER) {
    serveX = variant === 'skinny' ? CENTER_X / 2 : (evenScore ? CENTER_X + 5 : CENTER_X - 5);
    player.x = serveX;
    player.y = COURT_L + 1.5;
    cpu.reset();
    if (variant !== 'doubles') cpu.x = variant === 'skinny' ? serveX : COURT_W - serveX;
    ui.showBanner('Your serve — press SPACE (hold ←/→ to aim)', 0);
  } else {
    serveX = variant === 'skinny' ? CENTER_X / 2 : (evenScore ? CENTER_X - 5 : CENTER_X + 5);
    cpu.reset();
    cpu.x = serveX;
    cpu.y = -1.5;
    player.x = variant === 'skinny' ? serveX : COURT_W - serveX;
    player.y = COURT_L - 2;
    serveTimer = CPU_SERVE_DELAY;
    ui.showBanner(`${opponentName()} serves…`, 0);
  }
  if (variant === 'doubles') {
    opp2.reset();
    partner.reset();
    partner.x = player.x < CENTER_X ? CENTER_X + 5 : CENTER_X - 5;
  }
  const sy = server === PLAYER ? COURT_L + 1.5 : -1.5;
  ball.placeAt(serveX, sy, 2.5);
  state = 'serving';
}

function serve() {
  const server = score.servingSide;
  rally = new Rally(server);
  rally.recordHit(server, { volley: false, inKitchen: false });
  recorder.clear();
  (server === PLAYER ? player : cpu).swingT = 0.28;
  sfx.paddle(0.4);
  ui.hideBanner();

  // Skinny serves go straight up the half-court; normal serves go diagonal.
  const baseTx = variant === 'skinny' ? serveX : COURT_W - serveX;
  const maxTx = variant === 'skinny' ? CENTER_X - 1 : COURT_W - 1;
  if (server === PLAYER) {
    let tx;
    let ty;
    if (aim.active) {
      tx = clamp(aim.x + rand(-1, 1), 1, maxTx);
      ty = clamp(aim.y + rand(-1, 1), 1, KITCHEN_TOP - 0.5);
    } else {
      let steer = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
      tx = clamp(baseTx + steer * 3 + rand(-1.2, 1.2), 1, maxTx);
      ty = rand(6, 12);
    }
    ball.launchTo(tx, ty, rand(7.5, 9));
  } else {
    const err = cpu.difficulty.aimError;
    const tx = clamp(baseTx + rand(-err, err), 1, maxTx);
    ball.launchTo(tx, clamp(rand(33, 41) + rand(-err, err), 30, COURT_L + 1), rand(7.5, 9));
  }
  prevBallY = ball.y;
  prevBallZ = ball.z;
  netRebound = false;
  swingWindow = 0;
  swingCooldown = 0.5; // grace: releasing the serve keypress isn't a swing
  state = 'rally';
}

function endRally({ winner, reason }) {
  score.add(winner);
  recordPoint(winner === PLAYER, rally.hitCount);
  sfx.score();
  ui.updateScore(score, score.servingSide, opponentName());
  const who = winner === PLAYER ? 'Point: YOU' : `Point: ${opponentName()}`;
  ui.showBanner(`${reason}  ${who}`, 0);
  bannerTimer = BANNER_SECS;
  state = 'point-banner';
}

function playerShot() {
  // Modifiers were locked in when the swing started (queueSwing).
  const { dink, spin } = swingMods;
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
      dink: true,
      spin: spin !== 0 ? spin * 0.6 : -0.3, // dinks carry natural slice
    };
  }

  // Drives go where the crosshair points (keyboard steering as fallback).
  // More power flattens the arc AND compresses the flight time: faster and
  // harder to chase, but riskier — extra scatter, and a flat ball can find
  // the net.
  const apexZ = 5.4 - 1.8 * power + rand(-0.3, 0.3);
  const timeScale = 1 - 0.3 * power;
  if (aim.active) {
    return { tx: aim.x, ty: aim.y, apexZ, power, timeScale, spin };
  }
  const dir = player.moveDir();
  return {
    tx: clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
    ty: clamp(9 + dir.dy * 6 + rand(-1.5, 1.5), 2, NET_Y - 2),
    apexZ,
    power,
    timeScale,
    spin,
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
  const maxX = variant === 'skinny' ? CENTER_X + 0.2 : COURT_W + 0.2;
  return land.x >= -0.2 && land.x <= maxX
    && land.y >= -0.2 && land.y <= COURT_L + 0.2;
}

// A bot (opponent or partner) swings for its team. Returns undefined when it
// doesn't attempt the ball, null when it hits cleanly, or a rally result.
function botHit(bot, teamSide, target) {
  if (!bot.canReach(ball)) return undefined;
  const volley = !rally.bouncedSinceLastHit;
  // Competent bots know better than to volley from the kitchen.
  if (volley && hitterInKitchen(bot) && bot.difficulty.aimError < 4) return undefined;
  const result = rally.recordHit(teamSide, { volley, inKitchen: hitterInKitchen(bot) });
  if (result) return result;
  const shot = bot.chooseShot(ball, target);
  if (variant === 'skinny') shot.tx = Math.min(shot.tx, CENTER_X - 0.7);
  applyStress(shot, bot, bot.difficulty.aimError * 0.5);
  bot.swingT = 0.28;
  sfx.paddle(0.25);
  ball.launchTo(shot.tx, shot.ty, shot.apexZ, shot.timeScale ?? 1, shot.spin ?? 0);
  netRebound = false;
  return null;
}

function handleHits() {
  const playable = ballIsPlayable();

  // The player swings manually: release Space / the mouse button as the
  // ball arrives. The swing stays live for a short window, then whiffs
  // (dumping the charge). Swinging early on a required bounce is a real
  // fault — the rules call it.
  if (swingWindow > 0) {
    if (ball.inFlight && ball.vy > 0 && rally.lastHitter !== PLAYER
        && player.canReach(ball)) {
      swingWindow = 0;
      const volley = !rally.bouncedSinceLastHit;
      const result = rally.recordHit(PLAYER, { volley, inKitchen: hitterInKitchen(player) });
      if (result) return result;
      const shot = playerShot();
      applyStress(shot, player, 1.2 + 0.6 * shot.power);
      if (shot.dink) sfx.dink(); else sfx.paddle(shot.power);
      if ((shot.timeScale ?? 1) < 0.85) fx.shake(0.5);
      ball.launchTo(shot.tx, shot.ty, shot.apexZ, shot.timeScale ?? 1, shot.spin ?? 0);
      netRebound = false;
      return null;
    }
  }

  // Your doubles partner still plays automatically.
  if (ball.vy > 0 && playable && rally.lastHitter !== PLAYER && !mustLetBounce()
      && variant === 'doubles' && !player.canReach(ball)) {
    const r = botHit(partner, PLAYER, cpu);
    if (r !== undefined) return r;
  }

  if (ball.vy < 0 && playable && rally.lastHitter !== CPU && !mustLetBounce()) {
    for (const bot of variant === 'doubles' ? [cpu, opp2] : [cpu]) {
      const r = botHit(bot, CPU, player);
      if (r !== undefined) return r;
    }
  }

  return null;
}

// Skinny singles: straight serves into the left half-court, past the kitchen.
function skinnyServeValid(server, x, y) {
  if (x <= -LINE_TOL || x >= CENTER_X + LINE_TOL) return false;
  if (server === PLAYER) return y > -LINE_TOL && y < KITCHEN_TOP;
  return y > KITCHEN_BOTTOM && y < COURT_L + LINE_TOL;
}

function handleBounce() {
  const isFirstBounceOfServe = rally.hitCount === 1 && !rally.bouncedSinceLastHit;
  const serveOk = variant === 'skinny'
    ? skinnyServeValid(rally.server, ball.x, ball.y)
    : isValidServeLanding(rally.server, serveX, ball.x, ball.y);
  if (isFirstBounceOfServe && !serveOk) {
    return { winner: other(rally.server), reason: 'Service fault!' };
  }
  const isFirstBounceSinceHit = !rally.bouncedSinceLastHit;
  // A ball touching the line is in; in skinny the right half is out.
  const maxX = variant === 'skinny' ? CENTER_X + LINE_TOL : COURT_W + LINE_TOL;
  const out = ball.x < -LINE_TOL || ball.x > maxX
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

  sfx.net();
  sfx.ooh();
  fx.spawnNet(ball.x, NET_Y);
  fx.shake(0.35);

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
  const playable = ballIsPlayable();
  cpu.update(dt, ball, playable);
  if (variant === 'doubles') {
    // Your partner slides to whichever half you're not covering.
    partner.coverHalf = player.x < CENTER_X ? 'right' : 'left';
    partner.homeX = player.x < CENTER_X ? CENTER_X + 5 : CENTER_X - 5;
    partner.update(dt, ball, playable);
    opp2.update(dt, ball, playable);
  }

  let result = handleHits();

  if (!result) {
    prevBallY = ball.y;
    prevBallZ = ball.z;
    const event = ball.update(dt);
    if (event === 'bounce') {
      sfx.bounce();
      fx.spawnBounce(ball.x, ball.y);
      result = handleBounce();
    } else {
      handleNetCrossing();
    }
    // A ball that rolled dead: whichever side it died on failed to return it.
    if (!result && !ball.inFlight) {
      result = { winner: ball.y < NET_Y ? PLAYER : CPU, reason: 'No return!' };
    }
  }

  fx.trail(ball);
  recorder.record({
    bx: ball.x, by: ball.y, bz: ball.z,
    px: player.x, py: player.y, cx: cpu.x, cy: cpu.y,
    p2x: partner.x, p2y: partner.y, o2x: opp2.x, o2y: opp2.y,
  });

  if (result) {
    if (netRebound) result.reason = 'Netted!';
    fx.ring(ball.x, ball.y);
    pendingResult = result;
    replayClip = recorder.clip(1.2);
    if (replayClip.length >= 30) {
      replayIdx = 0;
      replaySkip = false;
      state = 'replay';
    } else {
      endRally(pendingResult);
    }
  }
}

function drawCrosshair(ctx) {
  const p = view.toPx(aim.x, aim.y);
  const r = view.scaleAt(aim.y) * 0.5;
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
  const s = view.scaleAt(player.y);
  const w = s * 2.4;
  const h = s * 0.35;
  const x = p.px - w / 2;
  const y = p.py + s * 1.3;
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

function drawLetterbox(ctx) {
  const barH = view.height * 0.09;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.fillRect(0, 0, view.width, barH);
  ctx.fillRect(0, view.height - barH, view.width, barH);
  ctx.fillStyle = '#f2f5f3';
  ctx.font = `600 ${Math.round(barH * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('● REPLAY', view.width / 2, barH * 0.65);
}

function draw() {
  const ctx = view.ctx;
  const { ox, oy } = fx.offsetPx(view.scale);
  ctx.save();
  ctx.translate(ox, oy);
  drawCourt(ctx, view);
  if (variant === 'skinny' && state !== 'menu') {
    // The right half-court is out of play.
    const tl = view.toPx(CENTER_X, 0);
    ctx.fillStyle = 'rgba(10, 20, 15, 0.35)';
    ctx.fillRect(tl.px, tl.py, (COURT_W - CENTER_X) * view.scale, COURT_L * view.scale);
  }
  fx.drawUnder(ctx, view);
  // Depth-sort so the 3D view occludes correctly (far first, net between).
  const drawables = [
    { y: NET_Y, draw: () => drawNet(ctx, view) },
    { y: cpu.y, draw: () => cpu.draw(ctx, view) },
    { y: player.y, draw: () => player.draw(ctx, view) },
  ];
  if (variant === 'doubles' && state !== 'menu') {
    drawables.push({ y: opp2.y, draw: () => opp2.draw(ctx, view) });
    drawables.push({ y: partner.y, draw: () => partner.draw(ctx, view) });
  }
  if (state !== 'menu') drawables.push({ y: ball.y, draw: () => ball.draw(ctx, view) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();
  fx.drawOver(ctx, view);
  if ((state === 'rally' || state === 'serving') && aim.active) drawCrosshair(ctx);
  if (charge > 0) drawChargeMeter(ctx);
  ctx.restore();
  if (state === 'replay') drawLetterbox(ctx);
}

let lastTime = performance.now();
function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state === 'intro') {
    introTimer -= dt;
    if (introTimer <= 0) startServe();
  } else if (state === 'serving') {
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
    swingCooldown = Math.max(0, swingCooldown - dt);
    if (swingWindow > 0) {
      swingWindow -= dt;
      if (swingWindow <= 0) {
        // Swung and missed.
        swingWindow = 0;
        swingCooldown = 0.3;
        charge = 0;
        sfx.whiff();
      }
    }
    updateRally(dt);
  } else if (state === 'replay') {
    replayIdx += dt * 60 * 0.4; // 40% speed
    const f = replayClip[Math.min(Math.floor(replayIdx), replayClip.length - 1)];
    ball.x = f.bx; ball.y = f.by; ball.z = f.bz;
    ball.inFlight = false; // suppress the landing marker during playback
    player.x = f.px; player.y = f.py;
    cpu.x = f.cx; cpu.y = f.cy;
    if (variant === 'doubles') {
      partner.x = f.p2x; partner.y = f.p2y;
      opp2.x = f.o2x; opp2.y = f.o2y;
    }
    if (replaySkip || replayIdx >= replayClip.length) {
      endRally(pendingResult);
    }
  } else if (state === 'point-banner') {
    player.update(dt, keys);
    bannerTimer -= dt;
    if (bannerTimer <= 0) {
      ui.hideBanner();
      const winner = score.winner();
      if (!winner) {
        startServe();
      } else if (bestOf3 && ++matchGames[winner] < 2) {
        // Game won, match still live: record it and play the next game.
        recordGame({ won: winner === PLAYER, shutout: score.get(other(winner)) === 0, champion: false });
        const g = matchGames[PLAYER] + matchGames[CPU];
        ui.showBanner(
          `${winner === PLAYER ? 'You take' : `${opponentName()} takes`} game ${g}! ${matchGames[PLAYER]}–${matchGames[CPU]}`,
          0,
        );
        score = new Score();
        ui.updateScore(score, score.servingSide, opponentName());
        introTimer = 2.5;
        state = 'intro';
      } else {
        state = 'game-over';
        handleMatchOver(winner);
      }
    }
  }

  fx.update(dt);

  if (keys.has('KeyR') && (state === 'rally' || state === 'serving' || state === 'intro')) {
    keys.delete('KeyR');
    showMainMenu();
  }

  draw();
  requestAnimationFrame(frame);
}

// Debug/test handle (used by tests/balance.test.js and handy in devtools).
window.__pickleball = {
  ball, player, cpu,
  getState: () => state,
  getScore: () => score,
  getRally: () => rally,
};

applyCosmetics();
ui.updateScore(score, score.servingSide);
ui.setMuteLabel(isMuted());
ui.onMuteClick(() => {
  initAudio();
  ui.setMuteLabel(toggleMute());
});
const hash = window.location?.hash;
if (hash === '#demo' || hash === '#demo3d') {
  // Dev/demo mode: start immediately on medium and auto-serve.
  if (hash === '#demo3d' && viewMode !== '3d') toggleView();
  ui.hideOverlays();
  keys.add('Space');
  startGame('medium');
} else {
  showMainMenu();
}
requestAnimationFrame(frame);
