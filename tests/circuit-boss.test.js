// Regression test for the boss-clear re-fire bug: when the run's final (rung 9)
// win is processed, afterCircuitMatchWon() must leave `state` out of
// 'point-banner' before showing the run summary. Otherwise the point-banner
// branch keeps re-detecting the same winner every frame and re-banks Trophies
// (and re-records the game) on every animation frame until Continue is clicked.
//
// Run separately: node tests/circuit-boss.test.js (not part of npm test).
import { installDom } from './dom-stub.js';
import { COURT_W, COURT_L, NET_Y, KITCHEN_BOTTOM, CENTER_X } from '../rules.js';
import { loadCircuit } from '../progress.js';

const dom = installDom();
await import('../game.js');
const pk = window.__pickleball;
const { ball, player, getState, getCircuitRun, getRally } = pk;

const before = loadCircuit().trophies;

// Enter the Circuit and start match 1.
dom.elements['mode-circuit'].onclick();
dom.elements['circuit-play'].onclick();

const DIR = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const held = new Set();
const setKeys = (w) => {
  for (const [d, code] of Object.entries(DIR)) {
    if (w.has(d) && !held.has(code)) { dom.keyDown(code); held.add(code); }
    if (!w.has(d) && held.has(code)) { dom.keyUp(code); held.delete(code); }
  }
};

let t = 0; let sf = 0; let frames = 0;
let summaryHit = false;
let banked = null;

while (frames < 60 * 300) {
  // Force the run to be at the boss rung. The match itself still plays out
  // against whatever opponent/target it was configured with at match start
  // (the easy rung-1 opponent) — only what advance() does at win-time changes.
  const run = getCircuitRun();
  if (run && run.rung !== 9) run.rung = 9;

  let tx = CENTER_X; let ty = COURT_L - 6;
  if (ball.inFlight && ball.vy > 0) {
    const land = ball.predictLanding();
    if (land.x >= 0 && land.x <= COURT_W && land.y <= COURT_L) {
      tx = land.x;
      ty = land.y > NET_Y && land.y < KITCHEN_BOTTOM ? KITCHEN_BOTTOM + 0.5 : Math.max(land.y, NET_Y + 1.5);
    }
  }
  const w = new Set();
  if (tx < player.x - 0.5) w.add('left');
  if (tx > player.x + 0.5) w.add('right');
  if (ty < player.y - 0.5) w.add('up');
  if (ty > player.y + 0.5) w.add('down');
  setKeys(w);
  const st = getState();
  // Respect the two-bounce rule: hits 2 and 3 must be played off a bounce,
  // or the point is lost on a fault — without this the bot can lose to the
  // easy rung-1 opponent and never reach the boss-clear path being tested.
  const rally = getRally();
  const mustWait = rally && !rally.bouncedSinceLastHit
    && (rally.hitCount === 1 || rally.hitCount === 2);
  const swingNow = st === 'rally' && ball.inFlight && ball.vy > 0
    && Math.hypot(ball.x - player.x, ball.y - player.y) < 2.2 && !mustWait;
  if (st === 'serving' || st === 'replay') {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); sf = 0; }
    else if (st === 'serving' && ++sf > 20) { dom.keyUp('Space'); held.delete('Space'); }
  } else if (swingNow) {
    if (held.has('Space')) { dom.keyUp('Space'); held.delete('Space'); }
    else { dom.keyDown('Space'); held.add('Space'); }
  }
  t += 1000 / 60; dom.step(t); frames++;

  if (!summaryHit && dom.elements['run-summary-title'].textContent) {
    summaryHit = true;
    banked = loadCircuit().trophies;
    break;
  }
}

if (!summaryHit) {
  console.error('FAIL: run summary never appeared (boss match did not resolve)');
  process.exit(1);
}

// Step ~90 more frames WITHOUT clicking Continue. If the point-banner branch
// re-fires every frame, Trophies keep growing and `state` stays 'point-banner'.
for (let i = 0; i < 90; i++) {
  t += 1000 / 60;
  dom.step(t);
}

const afterIdling = loadCircuit().trophies;
const finalState = getState();

let ok = true;

if (finalState === 'point-banner') {
  console.error(`FAIL: state is still 'point-banner' after idling past the run summary (re-fire loop) — state=${finalState}`);
  ok = false;
}

if (afterIdling !== banked) {
  console.error(`FAIL: Trophies kept changing after the summary appeared (banked=${banked}, after idling=${afterIdling})`);
  ok = false;
}

const gained = banked - before;
if (gained !== 70) {
  console.error(`FAIL: expected exactly 70 Trophies banked for a full won run (9 rungs * 5 + 25 bonus), got ${gained} (before=${before}, banked=${banked})`);
  ok = false;
}

if (!ok) process.exit(1);
console.log(`PASS: boss-clear banked ${gained} Trophies exactly once and left point-banner (state=${finalState})`);
