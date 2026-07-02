// Worker: one bot game vs one roster profile (game.js state = one per process).
// Usage: node tests/ladder-run.js <rosterIndex>

import { runBotGame } from './bot.js';
import { ROSTER } from '../ladder.js';

const index = Number(process.argv[2] ?? 0);
const profile = ROSTER[index];
const r = await runBotGame({ profile, maxSeconds: 600 });
console.log(JSON.stringify({
  index, name: profile.name, player: r.player, cpu: r.cpu, seconds: r.seconds,
}));
