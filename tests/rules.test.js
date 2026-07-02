import {
  PLAYER, CPU, other, Score, Rally, isValidServeLanding, inKitchen,
} from '../rules.js';

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

// --- other ---

test('other flips sides', () => {
  assertEqual(other(PLAYER), CPU);
  assertEqual(other(CPU), PLAYER);
});

// --- Score ---

test('score starts 0-0 with player serving', () => {
  const s = new Score();
  assertEqual(s.get(PLAYER), 0);
  assertEqual(s.get(CPU), 0);
  assertEqual(s.servingSide, PLAYER);
  assertEqual(s.winner(), null);
});

test('serve alternates every point', () => {
  const s = new Score();
  s.add(PLAYER);
  assertEqual(s.servingSide, CPU);
  s.add(PLAYER);
  assertEqual(s.servingSide, PLAYER);
});

test('first to 11 wins', () => {
  const s = new Score();
  for (let i = 0; i < 11; i++) s.add(CPU);
  assertEqual(s.get(CPU), 11);
  assertEqual(s.winner(), CPU);
});

test('10-10 then 11-10 is not a win (win by 2)', () => {
  const s = new Score();
  for (let i = 0; i < 10; i++) { s.add(PLAYER); s.add(CPU); }
  s.add(PLAYER); // 11-10
  assertEqual(s.winner(), null);
  s.add(PLAYER); // 12-10
  assertEqual(s.winner(), PLAYER);
});

// --- inKitchen ---

test('kitchen spans y 15..29', () => {
  assert(!inKitchen(14.9), 'just above kitchen is not kitchen');
  assert(inKitchen(15.1), 'top kitchen');
  assert(inKitchen(22), 'net line');
  assert(inKitchen(28.9), 'bottom kitchen');
  assert(!inKitchen(29.1), 'below kitchen is not kitchen');
});

// --- Rally: two-bounce rule ---

test('volleying the serve return is a two-bounce fault', () => {
  const r = new Rally(PLAYER);
  assertEqual(r.recordHit(PLAYER, { volley: false, inKitchen: false }), null, 'serve');
  assertEqual(r.recordBounce(CPU), null, 'serve bounces on cpu side');
  assertEqual(r.recordHit(CPU, { volley: false, inKitchen: false }), null, 'return');
  // player volleys the return (hit #3) without letting it bounce -> fault
  const res = r.recordHit(PLAYER, { volley: true, inKitchen: false });
  assert(res !== null, 'expected a fault');
  assertEqual(res.winner, CPU, 'point to cpu');
});

test('receiver volleying the serve is a two-bounce fault', () => {
  const r = new Rally(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // serve
  const res = r.recordHit(CPU, { volley: true, inKitchen: false });
  assert(res !== null, 'expected a fault');
  assertEqual(res.winner, PLAYER);
});

test('volley is legal after both bounces have happened', () => {
  const r = new Rally(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // serve (hit 1)
  r.recordBounce(CPU);
  r.recordHit(CPU, { volley: false, inKitchen: false }); // return (hit 2)
  r.recordBounce(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // third shot (hit 3)
  const res = r.recordHit(CPU, { volley: true, inKitchen: false }); // volley hit 4
  assertEqual(res, null, 'volley on hit 4 is legal');
});

// --- Rally: kitchen ---

test('volleying while in the kitchen is a fault', () => {
  const r = new Rally(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // serve
  r.recordBounce(CPU);
  r.recordHit(CPU, { volley: false, inKitchen: false });
  r.recordBounce(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false });
  const res = r.recordHit(CPU, { volley: true, inKitchen: true });
  assert(res !== null, 'expected kitchen fault');
  assertEqual(res.winner, PLAYER);
});

test('groundstroke from inside the kitchen is legal', () => {
  const r = new Rally(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // serve
  r.recordBounce(CPU);
  const res = r.recordHit(CPU, { volley: false, inKitchen: true });
  assertEqual(res, null, 'bounced ball may be hit from the kitchen');
});

// --- Rally: double bounce ends rally ---

test('two bounces on one side gives the point to the last hitter', () => {
  const r = new Rally(PLAYER);
  r.recordHit(PLAYER, { volley: false, inKitchen: false }); // serve
  assertEqual(r.recordBounce(CPU), null);
  const res = r.recordBounce(CPU);
  assert(res !== null, 'second bounce ends rally');
  assertEqual(res.winner, PLAYER);
});

// --- Rally: out ---

test('hitting out gives the point to the other side', () => {
  const r = new Rally(CPU);
  r.recordHit(CPU, { volley: false, inKitchen: false }); // serve
  const res = r.recordOut(CPU);
  assert(res !== null);
  assertEqual(res.winner, PLAYER);
});

// --- Serve landing validation ---
// Court: 20 wide (x 0..20), 44 long (y 0..44), net y=22, kitchen 15..29.
// Player serves from bottom (y>22) into top; CPU serves from top into bottom.
// Diagonal: landing must be in the opposite absolute x-half from the serve position.

test('player serve from right half must land in top-left service court', () => {
  assert(isValidServeLanding(PLAYER, 15, 5, 8), 'x<10, past kitchen, in bounds');
  assert(!isValidServeLanding(PLAYER, 15, 15, 8), 'same x-half is not diagonal');
  assert(!isValidServeLanding(PLAYER, 15, 5, 16), 'kitchen landing is a fault');
  assert(!isValidServeLanding(PLAYER, 15, 5, -1), 'long serve is out');
  assert(!isValidServeLanding(PLAYER, 15, -2, 8), 'wide serve is out');
});

test('player serve from left half must land in top-right service court', () => {
  assert(isValidServeLanding(PLAYER, 5, 15, 8));
  assert(!isValidServeLanding(PLAYER, 5, 5, 8));
});

test('cpu serve from left half must land in bottom-right service court', () => {
  assert(isValidServeLanding(CPU, 5, 15, 36), 'x>10, past kitchen');
  assert(!isValidServeLanding(CPU, 5, 5, 36), 'same x-half is not diagonal');
  assert(!isValidServeLanding(CPU, 5, 15, 28), 'kitchen landing is a fault');
  assert(!isValidServeLanding(CPU, 5, 15, 45), 'long serve is out');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
