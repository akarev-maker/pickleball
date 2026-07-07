// A fresh localStorage per run keeps the test hermetic.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  loadCircuit, addTrophies, spendTrophies, unlockPerk, recordRunDepth, STARTER_PERKS,
} = await import('../progress.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('defaults: zero trophies, six starter perks unlocked', () => {
  const c = loadCircuit();
  assertEqual(c.trophies, 0);
  assertEqual(STARTER_PERKS.length, 6);
  for (const id of STARTER_PERKS) assert(c.unlocked.includes(id), `${id} unlocked`);
  assert(!c.unlocked.includes('overdrive'), 'rare starts locked');
});

test('trophies add, and spending is gated by balance', () => {
  addTrophies(50);
  assertEqual(loadCircuit().trophies, 50);
  assertEqual(spendTrophies(60), false, 'cannot overspend');
  assertEqual(loadCircuit().trophies, 50, 'balance unchanged on failed spend');
  assertEqual(spendTrophies(40), true);
  assertEqual(loadCircuit().trophies, 10);
});

test('unlock is idempotent; best depth only climbs', () => {
  unlockPerk('overdrive');
  unlockPerk('overdrive');
  assertEqual(loadCircuit().unlocked.filter((i) => i === 'overdrive').length, 1);
  recordRunDepth(5);
  recordRunDepth(3);
  assertEqual(loadCircuit().bestDepth, 5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
