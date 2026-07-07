const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { loadCircuit, addTrophies, spendTrophies, unlockPerk } = await import('../progress.js');
const { perkById } = await import('../perks.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }

test('buying Overdrive deducts its cost and unlocks it', () => {
  const cost = perkById('overdrive').cost;
  addTrophies(cost);
  assert(!loadCircuit().unlocked.includes('overdrive'), 'locked before');
  assert(spendTrophies(cost), 'affordable');
  unlockPerk('overdrive');
  assert(loadCircuit().unlocked.includes('overdrive'), 'unlocked after');
  assert(loadCircuit().trophies === 0, 'spent to zero');
  assert(!spendTrophies(1), 'now broke');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
