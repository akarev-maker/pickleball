import { PERKS, perkById, PerkSet } from '../perks.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('catalog has 10 perks with the required shape', () => {
  assertEqual(PERKS.length, 10);
  for (const p of PERKS) {
    assert(p.id && p.name && p.desc, `perk ${p.id} missing fields`);
    assert(['common', 'uncommon', 'rare'].includes(p.rarity), `bad rarity ${p.rarity}`);
    assert(typeof p.cost === 'number', `perk ${p.id} needs a cost`);
  }
  assert(perkById('cannon'), 'cannon exists');
  assertEqual(perkById('nope'), undefined);
});

test('empty set is fully neutral', () => {
  const s = new PerkSet();
  assertEqual(s.powerMult(), 1);
  assertEqual(s.throttleFloor(), 0.3);
  assertEqual(s.scatterMult({}), 1);
  assertEqual(s.scatterMult({ dink: true }), 1);
  assertEqual(s.moveSpeedMult(), 1);
  assertEqual(s.reachBonus(), 0);
  assertEqual(s.smashHeight(), 5.5);
  assertEqual(s.smashBonus(), 0);
  assertEqual(s.netMagnet(), false);
  assertEqual(s.kitchenTolerance(), 0);
});

test('Cannon boosts power and scatter; Feather zeroes dink/lob scatter', () => {
  const cannon = new PerkSet(['cannon']);
  assert(cannon.powerMult() > 1, 'cannon powers up');
  assert(cannon.scatterMult({}) > 1, 'cannon scatters drives more');
  const feather = new PerkSet(['feather']);
  assertEqual(feather.scatterMult({ dink: true }), 0);
  assertEqual(feather.scatterMult({ lob: true }), 0);
  assertEqual(feather.scatterMult({}), 1, 'feather leaves drives alone');
  // Feather wins on a dink even stacked with Cannon.
  assertEqual(new PerkSet(['cannon', 'feather']).scatterMult({ dink: true }), 0);
});

test('movement, reach, smash, kitchen, net perks', () => {
  assert(new PerkSet(['quickfeet']).moveSpeedMult() > 1);
  assert(new PerkSet(['longreach']).reachBonus() > 0);
  assert(new PerkSet(['smashbro']).smashHeight() < 5.5);
  assert(new PerkSet(['smashbro']).smashBonus() > 0);
  assert(new PerkSet(['kitchenninja']).kitchenTolerance() > 0);
  assertEqual(new PerkSet(['netmagnet']).netMagnet(), true);
  assertEqual(new PerkSet(['overdrive']).throttleFloor(), 1);
});

test('Sure Serve and Wall fire once per game then re-arm on reset', () => {
  const s = new PerkSet(['sureserve', 'wall']);
  assertEqual(s.takeServeLet(), true);
  assertEqual(s.takeServeLet(), false, 'only once');
  assertEqual(s.takeWhiffGrace(), true);
  assertEqual(s.takeWhiffGrace(), false);
  s.resetGame();
  assertEqual(s.takeServeLet(), true, 're-armed');
  assertEqual(s.takeWhiffGrace(), true);
  assertEqual(new PerkSet().takeServeLet(), false, 'not owned → never');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
