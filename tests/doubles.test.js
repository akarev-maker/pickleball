// Doubles smoke test: motionless player + CPU partner vs two CPUs. The
// partner keeps the team alive, so points must accumulate without errors.
// Run: node tests/doubles.test.js

import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');

dom.elements['mode-doubles'].onclick(); // select the doubles variant
dom.startGame('medium'); // difficulty click starts the match
dom.keyDown('Space'); // auto-serve (and skip replays)

let time = 0;
let frames = 0;
try {
  while (frames < 60 * 180) {
    time += 1000 / 60;
    dom.step(time);
    frames++;
    if (dom.elements['gameover-title'].textContent) break;
  }
} catch (e) {
  console.error(`FAIL: doubles loop threw after ${frames} frames: ${e.stack}`);
  process.exit(1);
}

const points = [...dom.elements.score.innerHTML.matchAll(/\d+/g)].map((m) => Number(m[0]));
const total = points.reduce((a, b) => a + b, 0);
console.log(`ran ${(frames / 60).toFixed(0)}s — score HTML: ${dom.elements.score.innerHTML}`);
console.log(`game over: ${dom.elements['gameover-title'].textContent || '(not reached)'}`);

if (total === 0) {
  console.error('FAIL: no points scored in doubles');
  process.exit(1);
}
console.log(`PASS: doubles played ${total} points without exceptions`);
