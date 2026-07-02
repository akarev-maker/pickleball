// Tournament flow smoke test: the bot starts a tournament, beats rung 1
// (Rookie Rick must lose to perfect play), and the rung advances and
// persists. Run: node tests/tournament.test.js

import { runBotGame } from './bot.js';

const r = await runBotGame({ tournament: true, maxSeconds: 600 });

console.log(`match: ${r.title ?? '(unfinished)'}  bot ${r.player} — ${r.cpu}  (${r.seconds.toFixed(0)}s)`);

if (!r.title || r.player <= r.cpu) {
  console.error('FAIL: the bot should beat rung 1 (Rookie Rick)');
  process.exit(1);
}

const rung = globalThis.localStorage.getItem('pickleball.rung');
if (rung !== '1') {
  console.error(`FAIL: rung should advance to 1 after the win, got ${rung}`);
  process.exit(1);
}

// The game-over screen should route back to the ladder with rung 2 next.
r.dom.elements.restart.onclick();
const listHtml = r.dom.elements['ladder-list'].innerHTML;
if (!listHtml.includes('Grandpa Gene') || !listHtml.includes('✓')) {
  console.error('FAIL: ladder should show rung 1 beaten and Grandpa Gene next');
  process.exit(1);
}
if (!r.dom.elements['ladder-play'].textContent.includes('Grandpa Gene')) {
  console.error(`FAIL: play button should offer Grandpa Gene, got "${r.dom.elements['ladder-play'].textContent}"`);
  process.exit(1);
}

console.log('PASS: tournament win advances and persists the rung');
