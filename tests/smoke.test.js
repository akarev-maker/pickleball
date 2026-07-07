// Headless smoke test: runs the real game with a motionless player for up to
// 3 simulated minutes. Verifies rallies end, points accumulate, and nothing
// throws. Run: node tests/smoke.test.js

import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');

dom.startGame('medium');
const { getState } = window.__pickleball;

const reasons = new Set();
let time = 0;
const FRAME = 1000 / 60;
let frames = 0;
let serveFrames = 0;
let spaceHeld = false;
const MAX_FRAMES = 60 * 180;

try {
  while (frames < MAX_FRAMES) {
    // Charge-and-release serve (a motionless player still needs to serve):
    // hold Space, then release after ~a third of a second. Also skips replays.
    const st = getState();
    if (st === 'serving' || st === 'replay') {
      if (!spaceHeld) { dom.keyDown('Space'); spaceHeld = true; serveFrames = 0; }
      else if (st === 'serving' && ++serveFrames > 20) { dom.keyUp('Space'); spaceHeld = false; }
    } else if (spaceHeld) {
      dom.keyUp('Space');
      spaceHeld = false;
    }
    time += FRAME;
    dom.step(time);
    frames++;
    if (dom.elements.banner.textContent) reasons.add(dom.elements.banner.textContent);
    if (dom.elements['gameover-title'].textContent) break;
  }
} catch (e) {
  console.error(`FAIL: game loop threw after ${frames} frames: ${e.stack}`);
  process.exit(1);
}

const points = [...dom.elements.score.innerHTML.matchAll(/\d+/g)].map((m) => Number(m[0]));
const total = points.reduce((a, b) => a + b, 0);

console.log(`ran ${frames} frames (${(frames / 60).toFixed(0)}s simulated)`);
console.log(`game over: ${dom.elements['gameover-title'].textContent || '(not reached)'}`);
console.log('rally endings seen:');
for (const r of reasons) console.log(`  - ${r}`);

if (total === 0) {
  console.error('FAIL: no points were scored in 3 simulated minutes');
  process.exit(1);
}
console.log(`\nPASS: ${total} total points scored, no exceptions`);
