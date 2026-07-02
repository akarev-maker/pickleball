// Ladder difficulty test: the neutral bot must beat rung 1, and rung 8 must
// concede fewer points than rung 1 (difficulty ascends).
// Run: node tests/ladder.test.js          (rungs 1 and 8 only)
//      node tests/ladder.test.js --sweep  (all 8, prints tuning table)

import { spawnSync } from 'node:child_process';
import { ROSTER } from '../ladder.js';

function runRung(index) {
  const r = spawnSync('node', ['tests/ladder-run.js', String(index)], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`FAIL: ladder-run ${index} crashed:\n${r.stderr}`);
    process.exit(1);
  }
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const sweep = process.argv.includes('--sweep');
const indexes = sweep ? ROSTER.map((_, i) => i) : [0, ROSTER.length - 1];
const results = indexes.map(runRung);

for (const r of results) {
  console.log(`rung ${r.index + 1} ${r.name.padEnd(14)} bot ${r.player} — ${r.cpu} cpu  (${r.seconds.toFixed(0)}s)`);
}

const first = results.find((r) => r.index === 0);
const last = results.find((r) => r.index === ROSTER.length - 1);

let failed = false;
if (!(first.player === 11 || first.player > first.cpu)) {
  console.error('FAIL: the bot should beat rung 1');
  failed = true;
}
if (!(last.player < first.player || last.cpu > first.cpu)) {
  console.error('FAIL: rung 8 should be clearly harder than rung 1');
  failed = true;
}
if (failed) process.exit(1);
console.log('PASS: ladder difficulty ascends');
