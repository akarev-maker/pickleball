// Main loop and state machine: menu → serving → rally → point-banner →
// (serving | game-over) → menu.

import {
  PLAYER, CPU, other, Score, Rally, isValidServeLanding, inKitchen, LINE_TOL,
} from './rules.js';
import {
  setupCanvas, drawCourt, drawNet, netCrossing, setBackdrop,
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X, NET_HEIGHT, MARGIN,
} from './court.js';
import { Ball } from './ball.js';
import { SMASH_HEIGHT, serveParams, lobParams, smashParams } from './shots.js';
import { Player } from './player.js';
import { Cpu } from './cpu.js';
import * as ui from './ui.js';
import { ROSTER, loadRung, saveRung, resetLadder } from './ladder.js';
import { initAudio, sfx, toggleMute, isMuted } from './audio.js';
import { Fx } from './fx.js';
import { ReplayRecorder } from './replay.js';
import {
  recordPoint, recordGame, recordDailyWin, dailyChallenge, todayStr, equippedColors, equipped,
} from './progress.js';

const BANNER_SECS = 2;
const CPU_SERVE_DELAY = 1.2;

const canvas = document.getElementById('game');
let viewMode = 'top';
try {
  if (localStorage.getItem('pickleball.view') === '3d') viewMode = '3d';
} catch { /* storage unavailable */ }
// The HUD carries the view mode so CSS can place overlays per view
// (the banner has a different safe spot in each camera).
function applyView() {
  view = setupCanvas(canvas, viewMode);
  document.getElementById('hud').classList.toggle('top-view', viewMode === 'top');
}
let view = setupCanvas(canvas, viewMode);
applyView();
window.addEventListener('resize', applyView);

function toggleView() {
  viewMode = viewMode === 'top' ? '3d' : 'top';
  try {
    localStorage.setItem('pickleball.view', viewMode);
  } catch { /* storage unavailable */ }
  applyView();
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
  if (SWING_KEYS.includes(e.code)) queueSwing(e.code);
});

// Mouse: crosshair aiming + hold-to-charge power.
const aim = { x: CENTER_X, y: 9, active: false };
let mouseHeld = false;
let touchMode = false;
canvas.addEventListener('mousemove', (e) => {
  if (touchMode) return; // touch devices emit fake mousemoves; steer instead
  const c = view.toCourt(e.offsetX, e.offsetY);
  // Free aim: anywhere on the far side, including out of bounds — clean
  // strikes fly true now, so keeping the ball in the court is on you.
  // (Aiming wide on purpose is how around-the-post shots happen.)
  aim.x = clamp(c.x, -MARGIN + 0.5, COURT_W + MARGIN - 0.5);
  aim.y = clamp(c.y, -MARGIN + 0.5, NET_Y - 1);
  aim.active = true;
});
canvas.addEventListener('mousedown', () => { initAudio(); mouseHeld = true; });
window.addEventListener('mouseup', () => {
  // Only a release of a charge started on the canvas is a swing — clicking
  // UI buttons mid-rally must not cause phantom whiffs.
  if (mouseHeld) queueSwing('mouse');
  mouseHeld = false;
});

// --- Touch controls: left joystick moves (and steers shots), right-hand
// buttons are the four strokes with the same hold-to-charge scheme. ---
function enableTouch() {
  if (touchMode) return;
  touchMode = true;
  aim.active = false;
  initAudio();
  document.getElementById('touch').classList.remove('hidden');

  for (const btn of document.getElementById('touch').querySelectorAll('button[data-swing]')) {
    const code = btn.dataset.swing;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      keys.add(code);
    }, { passive: false });
    const release = (e) => {
      e.preventDefault();
      keys.delete(code);
      queueSwing(code);
    };
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
  }

  const pad = document.getElementById('joystick');
  const stick = document.getElementById('stick');
  const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const applyStick = (dx, dy) => {
    for (const d of DIRS) keys.delete(d);
    if (dx < -0.35) keys.add('ArrowLeft');
    if (dx > 0.35) keys.add('ArrowRight');
    if (dy < -0.35) keys.add('ArrowUp');
    if (dy > 0.35) keys.add('ArrowDown');
    stick.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  };
  const onStick = (e) => {
    e.preventDefault();
    const t = e.targetTouches[0];
    if (!t) return;
    const r = pad.getBoundingClientRect();
    const dx = clamp((t.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
    const dy = clamp((t.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
    applyStick(dx, dy);
  };
  pad.addEventListener('touchstart', onStick, { passive: false });
  pad.addEventListener('touchmove', onStick, { passive: false });
  const endStick = (e) => {
    e.preventDefault();
    applyStick(0, 0);
  };
  pad.addEventListener('touchend', endStick, { passive: false });
  pad.addEventListener('touchcancel', endStick, { passive: false });
}

window.addEventListener('touchstart', () => {
  enableTouch();
  if (state === 'replay') replaySkip = true;
}, { passive: true });

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
// Skinny singles plays on a centered 14 ft strip — its own narrow court.
const SKINNY_W = 14;
const SKINNY_L = (COURT_W - SKINNY_W) / 2;
const SKINNY_R = SKINNY_L + SKINNY_W;
const courtLeft = () => (variant === 'skinny' ? SKINNY_L : 0);
const courtRight = () => (variant === 'skinny' ? SKINNY_R : COURT_W);
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
let serveCharging = false;
let demoAutoServe = false; // #demo dev mode: serve without input
let bannerTimer = 0;
let prevBallX = 0;
let prevBallY = 0;
let prevBallZ = 0;
let atpShot = false; // last shot went around the post (outside the net span)
let charge = 0; // 0..1 shot power, held Space / mouse button charges it
let netRebound = false; // ball fell back off the net; label the point 'Netted!'
let swingWindow = 0; // buffered swing: connects if the ball arrives in time
let swingCooldown = 0; // whiff recovery; also grace right after serving
let swingMods = { dink: false, spin: 0, lob: false }; // captured when the swing starts
// Every stroke has its own swing button: hold it to charge, release to hit.
// Space/mouse = drive, Shift = dink, E = topspin, Q = slice, F = lob.
const SWING_KEYS = ['Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyQ', 'KeyF'];

// A release starts a swing: it stays live for a short window so slightly
// early timing still connects. Dink/spin modifiers are locked in here —
// releasing them together with the swing button still counts.
// source: the swing key that was released (or 'mouse'). The released key
// picks the stroke; keys still held count too, so combos also work.
function queueSwing(source) {
  if (state !== 'rally' || swingCooldown > 0 || swingWindow > 0) return;
  const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const lob = source === 'KeyF' || keys.has('KeyF');
  swingMods = {
    lob,
    dink: !lob && (source === 'ShiftLeft' || source === 'ShiftRight' || shiftHeld),
    spin: lob ? 0 : (source === 'KeyE' || keys.has('KeyE') ? 1
      : (source === 'KeyQ' || keys.has('KeyQ') ? -1 : 0)),
  };
  swingWindow = 0.16;
  player.swingT = 0.28;
  // Ball on the off-paddle side means this stroke renders as a backhand.
  player.swingBack = ball.x < player.x;
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
  setBackdrop(equipped().backdrop);
}

function clearModifiers() {
  ball.wind = 0;
  ball.gravityScale = 1;
}

let lastOpts = {};

function setVariant(v) {
  variant = v;
  cpu.homeX = v === 'doubles' ? CENTER_X - 6 : CENTER_X;
  cpu.coverHalf = v === 'doubles' ? 'left' : null;
  opp2.homeX = CENTER_X + 6;
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
    // Drop any serve charge: keys release while paused, and resuming
    // must not fire a phantom serve from the stored charge.
    if (state === 'serving') {
      serveCharging = false;
      charge = 0;
    }
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
  charge = 0; // a mid-charge quit must not leave the meter on screen
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
  let title = won
    ? `You win!  ${score.get(PLAYER)}–${score.get(CPU)}`
    : `${opponentName()} wins!  ${score.get(CPU)}–${score.get(PLAYER)}`;
  if (bestOf3) title += `  (games ${matchGames[PLAYER]}–${matchGames[CPU]})`;
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
    serveX = variant === 'skinny' ? CENTER_X : (evenScore ? CENTER_X + 5 : CENTER_X - 5);
    player.x = serveX;
    player.y = COURT_L + 1.5;
    cpu.reset();
    if (variant !== 'doubles') cpu.x = variant === 'skinny' ? serveX : COURT_W - serveX;
    ui.showBanner(touchMode
      ? 'Your serve — hold DRIVE'
      : 'Your serve — hold SPACE, release to hit', 0, 'soft');
  } else {
    serveX = variant === 'skinny' ? CENTER_X : (evenScore ? CENTER_X - 5 : CENTER_X + 5);
    cpu.reset();
    cpu.x = serveX;
    cpu.y = -1.5;
    player.x = variant === 'skinny' ? serveX : COURT_W - serveX;
    player.y = COURT_L - 2;
    serveTimer = CPU_SERVE_DELAY;
    ui.showBanner(`${opponentName()} serves…`, 0, 'soft');
  }
  if (variant === 'doubles') {
    opp2.reset();
    partner.reset();
    partner.x = player.x < CENTER_X ? CENTER_X + 6 : CENTER_X - 6;
  }
  const sy = server === PLAYER ? COURT_L + 1.5 : -1.5;
  // Hold the ball beside the server's paddle hand — spawning it dead on
  // their position hid it behind the (same-colored) player figure.
  ball.placeAt(serveX + (server === PLAYER ? 1.1 : -1.1), sy, 2.5);
  // Leftover charge from the last rally (or a quit) must not ride into
  // this serve — or linger on screen as a stale meter.
  charge = 0;
  serveCharging = false;
  state = 'serving';
}

function serve(power = 0.25) {
  const server = score.servingSide;
  rally = new Rally(server);
  rally.recordHit(server, { volley: false, inKitchen: false });
  recorder.clear();
  const server0 = server === PLAYER ? player : cpu;
  server0.swingT = 0.28;
  server0.swingBack = false; // serves are always struck forehand
  sfx.paddle(0.4);
  ui.hideBanner();

  // Skinny serves go straight up the strip; normal serves go diagonal.
  const baseTx = variant === 'skinny' ? serveX : COURT_W - serveX;
  const minTx = courtLeft() + 1;
  const maxTx = courtRight() - 1;
  if (server === PLAYER) {
    const sp = serveParams(power);
    const e = sp.err;
    let tx;
    let ty;
    if (aim.active) {
      // Loose clamps: an aimed serve can fly long, wide, or drop short
      // into the kitchen — all real service faults. Aim well.
      tx = clamp(aim.x + rand(-e, e), courtLeft() - 5, courtRight() + 5);
      ty = clamp(aim.y + rand(-e, e), -2, KITCHEN_TOP + 2);
    } else {
      let steer = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) steer -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) steer += 1;
      tx = clamp(baseTx + steer * 3 + rand(-e, e), minTx, maxTx);
      ty = rand(6, 12) - sp.depth + rand(-e, e) * 0.5;
    }
    ball.launchTo(tx, ty, sp.apexZ + rand(-0.3, 0.3), sp.timeScale);
  } else {
    // CPU serve power rides its aggression: bangers bomb serves (and
    // sometimes fault); patient types float them in.
    const cpuPower = Math.min(1, cpu.difficulty.aggression + 0.15);
    const sp = serveParams(cpuPower);
    const err = cpu.difficulty.aimError * (0.5 + 0.5 * cpuPower);
    const tx = clamp(baseTx + rand(-err, err), minTx, maxTx);
    const ty = clamp(rand(33, 41) + sp.depth * 0.5 + rand(-err, err), 30, COURT_L + 1.5);
    ball.launchTo(tx, ty, sp.apexZ + rand(-0.3, 0.3), sp.timeScale);
  }
  prevBallX = ball.x;
  prevBallY = ball.y;
  prevBallZ = ball.z;
  netRebound = false;
  atpShot = false;
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
  const { dink, spin, lob } = swingMods;
  const held = charge;
  // You can only unload on a ball you take high — power on a low ball is
  // throttled so a full meter doesn't just drill the net.
  const power = held * Math.max(0.3, Math.min(1, ball.z / 4));
  charge = 0;

  if (lob) {
    // Loft it over an opponent at the net: charge buys height and depth.
    // An under-charged lob falls short and sits up for a smash; a deep
    // one risks sailing long under stress scatter.
    const dir = player.moveDir();
    const tx = aim.active ? aim.x : clamp(CENTER_X + dir.dx * 7, 1, COURT_W - 1);
    const tyAimed = aim.active ? clamp(aim.y, -4, NET_Y - 3) : 4;
    const short = NET_Y - 6; // a dead lob drops at the opponent's kitchen
    return {
      tx: tx + rand(-0.7, 0.7),
      ty: short + (tyAimed - short) * held,
      apexZ: lobParams(held).apexZ,
      power: 0,
      spin: 0,
    };
  }

  if (dink) {
    // Drop it into the CPU's kitchen; the crosshair picks the spot along it.
    const dir = player.moveDir();
    const tx = aim.active ? aim.x : clamp(ball.x + dir.dx * 5, 1, COURT_W - 1);
    return {
      tx: clamp(tx + rand(-0.5, 0.5), 1, COURT_W - 1),
      ty: aim.active
        ? clamp(aim.y, KITCHEN_TOP + 1, NET_Y - 1)
        : rand(KITCHEN_TOP + 1.5, NET_Y - 1),
      apexZ: 4.5,
      power: 0,
      dink: true,
      spin: spin !== 0 ? spin * 0.6 : -0.3, // dinks carry natural slice
    };
  }

  // Overhead smash: any swing (drive or spin) contacting the ball above
  // SMASH_HEIGHT is punched steeply down at full power.
  if (ball.z >= SMASH_HEIGHT) {
    const sp = smashParams(ball.z, power);
    const dir = player.moveDir();
    return {
      tx: aim.active ? aim.x : clamp(CENTER_X + dir.dx * 7 + rand(-1.5, 1.5), 1, COURT_W - 1),
      ty: aim.active ? aim.y : clamp(9 + dir.dy * 6, 2, NET_Y - 2),
      apexZ: sp.apexZ,
      power,
      timeScale: sp.timeScale,
      spin: 0,
      smash: true,
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
  // Digging a ball up from below the net line is awkward for everyone —
  // this is what makes low skidding slices (and good dinks) dangerous.
  const lowBall = Math.max(0, (1.3 - ball.z) / 1.3);
  const stress = Math.min(1, Math.max(offset / 2.5, runFactor * 0.7, lowBall * 0.85));
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
  return land.x >= courtLeft() - 0.2 && land.x <= courtRight() + 0.2
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
  if (variant === 'skinny') shot.tx = clamp(shot.tx, SKINNY_L + 0.7, SKINNY_R - 0.7);
  applyStress(shot, bot, bot.difficulty.aimError * 0.5);
  bot.swingT = 0.28;
  bot.swingBack = bot.side === 'top' ? ball.x > bot.x : ball.x < bot.x;
  if (shot.smash) {
    sfx.smash();
    fx.shake(0.6);
    fx.text(ball.x, ball.y, 'SMASH!');
  } else {
    sfx.paddle(0.25);
  }
  ball.launchTo(shot.tx, shot.ty, shot.apexZ, shot.timeScale ?? 1, shot.spin ?? 0);
  netRebound = false;
  atpShot = false;
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
      applyStress(shot, player, 0.7 + 0.5 * shot.power);
      if (shot.dink) sfx.dink();
      else if (shot.smash) sfx.smash();
      else sfx.paddle(shot.power);
      if (shot.smash) {
        fx.shake(0.8);
        fx.text(ball.x, ball.y, 'SMASH!');
      } else if ((shot.timeScale ?? 1) < 0.85) {
        fx.shake(0.5);
      }
      ball.launchTo(shot.tx, shot.ty, shot.apexZ, shot.timeScale ?? 1, shot.spin ?? 0);
      netRebound = false;
      atpShot = false;
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

// Skinny singles: straight serves into the strip, past the kitchen.
function skinnyServeValid(server, x, y) {
  if (x <= SKINNY_L - LINE_TOL || x >= SKINNY_R + LINE_TOL) return false;
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
  // A ball touching the line is in; skinny narrows the sidelines.
  const out = ball.x < courtLeft() - LINE_TOL || ball.x > courtRight() + LINE_TOL
    || ball.y < -LINE_TOL || ball.y > COURT_L + LINE_TOL;
  if (isFirstBounceSinceHit && out) {
    return rally.recordOut(rally.lastHitter);
  }
  return rally.recordBounce(ball.y < NET_Y ? CPU : PLAYER);
}

// The net is physical: a ball clipping the tape may tumble over and stay
// live (net cord); a ball hit squarely into the net drops back on the
// hitter's side, where it dies and the normal rules award the point.
// A ball crossing outside the posts — around the post — never touches
// the net and stays live at any height.
function handleNetCrossing() {
  const hit = netCrossing(
    { x: prevBallX, y: prevBallY, z: prevBallZ },
    ball,
    courtLeft(),
    courtRight(),
  );
  if (!hit) return;

  if (hit.kind === 'around') {
    atpShot = true;
    sfx.ooh();
    return;
  }

  sfx.net();
  sfx.ooh();
  fx.spawnNet(ball.x, NET_Y);
  fx.shake(0.35);

  if (hit.zAtNet > NET_HEIGHT - 0.45 && Math.random() < 0.35) {
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
    partner.homeX = player.x < CENTER_X ? CENTER_X + 6 : CENTER_X - 6;
    partner.update(dt, ball, playable);
    opp2.update(dt, ball, playable);
  }

  let result = handleHits();

  if (!result) {
    prevBallX = ball.x;
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
    else if (atpShot) result.reason = `Around the post! ${result.reason}`;
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

function drawStrokeBadge(ctx) {
  // Shows the stroke you're currently charging.
  const labels = [];
  if (keys.has('KeyF')) {
    labels.push('LOB');
  } else {
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) labels.push('DINK');
    if (keys.has('KeyE')) labels.push('TOPSPIN');
    else if (keys.has('KeyQ')) labels.push('SLICE');
  }
  if (labels.length === 0) return;
  const p = view.toPx(player.x, player.y);
  const s = view.scaleAt(player.y);
  ctx.font = `700 ${Math.max(12, Math.round(s * 0.55))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b8e986';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 3;
  const ty = p.py + s * (view.mode === '3d' ? 1.1 : 2.4);
  ctx.strokeText(labels.join(' + '), p.px, ty);
  ctx.fillText(labels.join(' + '), p.px, ty);
}

function draw() {
  const ctx = view.ctx;
  const { ox, oy } = fx.offsetPx(view.scale);
  ctx.save();
  ctx.translate(ox, oy);
  drawCourt(ctx, view, courtLeft(), courtRight());
  fx.drawUnder(ctx, view);
  // Depth-sort so the 3D view occludes correctly (far first, net between).
  const drawables = [
    { y: NET_Y, draw: () => drawNet(ctx, view, courtLeft(), courtRight()) },
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
  if (state === 'rally') drawStrokeBadge(ctx);
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
      // Hold to charge, release to serve. Power trades the safe high arc
      // for depth and pace at the cost of scatter — see serveParams.
      if (demoAutoServe) {
        serve(0.5);
      } else {
        const holding = keys.has('Space') || mouseHeld;
        if (holding) {
          // The instruction banner has done its job — clear the view of
          // the net and opponent while the player lines up the serve.
          if (!serveCharging) ui.hideBanner();
          serveCharging = true;
          charge = Math.min(1, charge + dt / 0.8);
        } else if (serveCharging) {
          serveCharging = false;
          const power = Math.max(0.25, charge);
          charge = 0;
          serve(power);
        }
      }
    } else {
      cpu.update(dt, ball);
      player.update(dt, keys);
      serveTimer -= dt;
      if (serveTimer <= 0) serve();
    }
  } else if (state === 'rally') {
    const charging = mouseHeld || SWING_KEYS.some((k) => keys.has(k));
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
const hash = window.location?.hash || '';
if (hash.startsWith('#demo')) {
  // Dev/demo mode: start immediately on medium and auto-serve.
  if (hash.includes('3d') && viewMode !== '3d') toggleView();
  demoAutoServe = true;
  ui.hideOverlays();
  startGame('medium', { variant: hash.includes('skinny') ? 'skinny' : 'singles' });
} else {
  showMainMenu();
}
if (hash.includes('touch')) enableTouch(); // dev: preview the touch UI
requestAnimationFrame(frame);
