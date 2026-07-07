import {
  CHAMPION, RUNGS, matchConfig, newRun, advance, fail, rungsCleared, trophies, draftOptions,
} from '../circuit.js';
import { ROSTER } from '../ladder.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }
function assertEqual(a, b, m = '') { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); }

test('nine rungs with escalating targets', () => {
  assertEqual(RUNGS.length, 9);
  assertEqual(matchConfig(1).target, 4);
  assertEqual(matchConfig(3).target, 4);
  assertEqual(matchConfig(4).target, 7);
  assertEqual(matchConfig(8).target, 7);
  assertEqual(matchConfig(9).target, 11);
});

test('opponents walk the roster then the Champion', () => {
  assertEqual(matchConfig(1).opponent, ROSTER[0]);
  assertEqual(matchConfig(8).opponent, ROSTER[7]);
  assertEqual(matchConfig(9).opponent, CHAMPION);
  assert(CHAMPION.name && CHAMPION.color && CHAMPION.look, 'Champion is a full profile');
});

test('advance climbs then wins at the top', () => {
  const run = newRun();
  assertEqual(run.rung, 1);
  for (let i = 0; i < 8; i++) advance(run);
  assertEqual(run.rung, 9, 'eight wins reach rung 9');
  assert(!run.won, 'not won until the boss falls');
  advance(run);
  assert(run.won, 'winning rung 9 wins the run');
});

test('trophies scale with depth and reward a full clear', () => {
  const lost = newRun(); lost.rung = 5; fail(lost);
  assertEqual(rungsCleared(lost), 4, 'failed at rung 5 → cleared 4');
  const early = newRun(); fail(early);
  const deep = newRun(); deep.rung = 7; fail(deep);
  assert(trophies(deep) > trophies(early), 'deeper banks more');
  const won = newRun(); for (let i = 0; i < 9; i++) advance(won);
  assertEqual(rungsCleared(won), 9);
  assert(trophies(won) > trophies(deep), 'a full clear beats a deep loss');
});

test('draft offers distinct unlocked, unowned perks', () => {
  const unlocked = ['cannon', 'feather', 'quickfeet', 'longreach', 'sureserve', 'netmagnet'];
  const opts = draftOptions(['cannon'], unlocked);
  assertEqual(opts.length, 3);
  assertEqual(new Set(opts).size, 3, 'distinct');
  assert(!opts.includes('cannon'), 'excludes owned');
  for (const id of opts) assert(unlocked.includes(id), 'only unlocked');
});

test('draft never offers more than remain', () => {
  const opts = draftOptions(['cannon', 'feather'], ['cannon', 'feather', 'quickfeet']);
  assertEqual(opts.length, 1);
  assertEqual(opts[0], 'quickfeet');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
