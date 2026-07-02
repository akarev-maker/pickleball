// Progress logic: stats accumulation, unlock predicates, daily determinism.
// Run: node tests/progress.test.js

import { installDom } from './dom-stub.js';
installDom(); // provides the localStorage stub

const {
  loadStats, recordPoint, recordGame, recordDailyWin, PADDLES, BALLS,
  isUnlocked, equip, equipped, dailyChallenge,
} = await import('../progress.js');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assert') { if (!c) throw new Error(m); }

test('stats accumulate and persist', () => {
  recordPoint(true, 17); // player wins a 17-hit rally
  recordPoint(false, 3);
  recordGame({ won: true, shutout: true, champion: false });
  const s = loadStats();
  assert(s.points === 1 && s.pointsAgainst === 1, 'points');
  assert(s.longestRally === 17, 'longest rally');
  assert(s.games === 1 && s.wins === 1 && s.shutouts === 1, 'game counters');
});

test('unlocks derive from stats', () => {
  assert(isUnlocked(PADDLES[0]), 'default paddle');
  assert(isUnlocked(PADDLES.find((p) => p.id === 'sunset')), 'win-a-game paddle');
  assert(isUnlocked(BALLS.find((b) => b.id === 'snow')), '15+ rally ball');
  assert(!isUnlocked(BALLS.find((b) => b.id === 'flamingo')), '10 wins not yet');
  assert(!isUnlocked(PADDLES.find((p) => p.id === 'gold')) === false, 'shutout paddle unlocked');
});

test('equip persists and rejects locked items', () => {
  equip('ball', 'snow');
  assert(equipped().ball === 'snow', 'equips unlocked');
  equip('ball', 'flamingo');
  assert(equipped().ball === 'snow', 'locked equip ignored');
});

test('daily challenge is date-deterministic', () => {
  const a = dailyChallenge('2026-07-02');
  const b = dailyChallenge('2026-07-02');
  const c = dailyChallenge('2026-07-03');
  assert(a.opponentIndex === b.opponentIndex && a.modifier.id === b.modifier.id, 'same day same challenge');
  assert(a.opponentIndex !== c.opponentIndex || a.modifier.id !== c.modifier.id, 'different day differs');
  assert(a.opponentIndex >= 0 && a.opponentIndex < 8, 'valid opponent');
});

test('daily win records once per day', () => {
  recordDailyWin('2026-07-02');
  recordDailyWin('2026-07-02');
  assert(loadStats().dailyWins === 1, 'no double-count same day');
  recordDailyWin('2026-07-03');
  assert(loadStats().dailyWins === 2, 'next day counts');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
