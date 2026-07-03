// Balance check: the shared bot player (perfect tracking, release-to-swing)
// plays a full game against the CPU. Reports the final score.
// Run: node tests/balance.test.js <easy|medium|hard> [charge]
//
// Pass 'charge' as the second arg to make the bot hold Space during rallies
// (full-power shots); default is neutral shots.

import { runBotGame } from './bot.js';

const difficulty = process.argv[2] || 'medium';
const alwaysCharge = process.argv[3] === 'charge';

const res = await runBotGame({ difficulty, alwaysCharge });
console.log(`${difficulty}: ${res.title || 'no result'}  bot ${res.player} — ${res.cpu} cpu  (${res.seconds.toFixed(0)}s simulated)`);

if (res.player === 0 && res.cpu === 0) {
  console.error('FAIL: no points were played');
  process.exit(1);
}
