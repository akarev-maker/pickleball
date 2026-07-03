// Physics/shape tests for the gameplay-depth features: lob, smash,
// charged serves, and around-the-post geometry.

import { Ball } from '../ball.js';
import {
  SMASH_HEIGHT, serveParams, lobParams, smashParams,
} from '../shots.js';
import { netCrossing, NET_Y, COURT_W } from '../court.js';
import { MAX_HIT_HEIGHT } from '../player.js';
import { Cpu } from '../cpu.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${expected}, got ${actual}`);
  }
}

// --- shot parameters ---

test('serve pace, scatter, and depth all grow with power', () => {
  const soft = serveParams(0.25);
  const hot = serveParams(1);
  assert(hot.err > soft.err, 'scatter grows');
  assert(hot.timeScale < soft.timeScale, 'flight compresses');
  assert(hot.apexZ < soft.apexZ, 'arc flattens');
  assert(hot.depth > soft.depth, 'target deepens');
});

test('lob apex scales with charge and always clears CPU reach', () => {
  assert(lobParams(0).apexZ > MAX_HIT_HEIGHT, 'even a dead lob apexes above reach');
  assert(lobParams(1).apexZ > lobParams(0.3).apexZ, 'charge buys height');
  assert(lobParams(1).apexZ <= 13.5, 'sane ceiling');
});

test('smash barely rises and compresses hard', () => {
  const sp = smashParams(6, 1);
  assert(sp.apexZ <= 6.5, 'apex hugs the contact point');
  assert(sp.timeScale <= 0.45, 'full-power smash is heavily punched');
  assert(smashParams(6, 0).timeScale > sp.timeScale, 'power compresses');
  assert(SMASH_HEIGHT < MAX_HIT_HEIGHT, 'smash window exists below max reach');
});

// --- ball physics through the new parameters ---

test('full-charge lob is unreachable when it crosses the net', () => {
  const ball = new Ball();
  ball.placeAt(10, 40, 2);
  ball.launchTo(10, 4, lobParams(1).apexZ);
  let zAtNet = 0;
  let prevY = ball.y;
  for (let i = 0; i < 4000 && ball.inFlight; i++) {
    ball.update(1 / 240);
    if (prevY > NET_Y && ball.y <= NET_Y) zAtNet = ball.z;
    prevY = ball.y;
  }
  assert(zAtNet > MAX_HIT_HEIGHT, `lob crossed the net at z=${zAtNet.toFixed(2)}`);
});

test('smash leaves the paddle heading down and lands fast', () => {
  const ball = new Ball();
  ball.placeAt(10, 24, 6);
  const sp = smashParams(6, 1);
  ball.launchTo(10, 9, sp.apexZ, sp.timeScale);
  assert(ball.vz < 0, `vz=${ball.vz.toFixed(2)} should be downward`);
  assert(ball.predictLanding().t < 0.5, 'lands in under half a second');
});

// --- around-the-post geometry ---

test('crossing inside the posts below the tape is net contact', () => {
  const hit = netCrossing({ x: 10, y: 23, z: 2 }, { x: 10, y: 21, z: 2 });
  assertEqual(hit && hit.kind, 'contact');
  assert(Math.abs(hit.zAtNet - 2) < 1e-9, 'interpolated z');
});

test('the same ball outside the posts passes around', () => {
  const wide = COURT_W + 1.5;
  const hit = netCrossing({ x: wide, y: 23, z: 2 }, { x: wide, y: 21, z: 2 });
  assertEqual(hit && hit.kind, 'around');
});

test('clearing the tape is no interaction', () => {
  assertEqual(netCrossing({ x: 10, y: 23, z: 4 }, { x: 10, y: 21, z: 4 }), null);
});

test('no net-plane crossing, no interaction', () => {
  assertEqual(netCrossing({ x: 10, y: 26, z: 1 }, { x: 10, y: 24, z: 1 }), null);
});

test('skinny court narrows the post span', () => {
  // x=2 is inside the full court but outside a 14 ft strip starting at 4.5.
  const hit = netCrossing({ x: 2, y: 23, z: 2 }, { x: 2, y: 21, z: 2 }, 4.5, 18.5);
  assertEqual(hit && hit.kind, 'around');
});

// --- CPU smash branch ---

test('cpu smashes any ball it takes above SMASH_HEIGHT', () => {
  const cpu = new Cpu('top');
  cpu.setDifficulty('medium');
  const highBall = { x: 10, y: 6, z: 6, vx: 0, vy: -10, vz: 0 };
  const shot = cpu.chooseShot(highBall, { x: 5, y: 30 });
  assert(shot.smash, 'flagged as a smash');
  assert(shot.apexZ <= highBall.z + 0.5 + 1e-9, 'punched, not lifted');
  assert(shot.timeScale < 0.7, 'compressed flight');
});

test('cpu below smash height plays a normal shot', () => {
  const cpu = new Cpu('top');
  cpu.setDifficulty('medium');
  const lowBall = { x: 10, y: 6, z: 2, vx: 0, vy: -10, vz: 0 };
  const shot = cpu.chooseShot(lowBall, { x: 5, y: 30 });
  assert(!shot.smash, 'no smash flag on a low ball');
});

// --- charged serve, through the real game loop ---

import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');
const { ball: gameBall, getState } = window.__pickleball;

dom.startGame('medium');
let clock = 0;
const step = () => { clock += 1000 / 60; dom.step(clock); };

test('holding SPACE charges; releasing fires a flat, fast serve', () => {
  assertEqual(getState(), 'serving');
  dom.keyDown('Space');
  for (let i = 0; i < 90; i++) step(); // 1.5 s — charge caps at full
  assertEqual(getState(), 'serving', 'holding must not serve');
  dom.keyUp('Space');
  step();
  assertEqual(getState(), 'rally', 'release serves');
  const t = gameBall.predictLanding().t;
  assert(t < 1.05, `full-charge serve flight ${t.toFixed(2)}s (tap is ~1.4s)`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
