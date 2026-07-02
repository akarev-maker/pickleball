// Balance check: a bot player that runs toward the ball's predicted landing
// spot plays a full game against the CPU. Reports the final score.
// Run: node tests/balance.test.js <easy|medium|hard>

import { installDom } from './dom-stub.js';
import { COURT_W, COURT_L, NET_Y, KITCHEN_BOTTOM, CENTER_X } from '../rules.js';

const difficulty = process.argv[2] || 'medium';

// Pass 'charge' as the second arg to make the bot hold Space during rallies
// (full-power shots); default is neutral shots.
const alwaysCharge = process.argv[3] === 'charge';

const dom = installDom();
await import('../game.js');
const { ball, player, getState } = window.__pickleball;

dom.startGame(difficulty);
dom.keyDown('Space');

const DIR_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const held = new Set();

function setKeys(wanted) {
  for (const [dir, code] of Object.entries(DIR_KEYS)) {
    if (wanted.has(dir) && !held.has(code)) { dom.keyDown(code); held.add(code); }
    if (!wanted.has(dir) && held.has(code)) { dom.keyUp(code); held.delete(code); }
  }
}

function botThink() {
  // Chase the landing spot when the ball is coming and in; let out balls fly;
  // stay behind the kitchen line for balls dropping into it.
  let tx = CENTER_X;
  let ty = COURT_L - 6;
  if (ball.inFlight && ball.vy > 0) {
    const land = ball.predictLanding();
    const landsIn = land.x >= 0 && land.x <= COURT_W && land.y <= COURT_L;
    if (landsIn) {
      tx = land.x;
      ty = land.y > NET_Y && land.y < KITCHEN_BOTTOM
        ? KITCHEN_BOTTOM + 0.5
        : Math.max(land.y, NET_Y + 1.5);
    }
  }
  const wanted = new Set();
  if (tx < player.x - 0.5) wanted.add('left');
  if (tx > player.x + 0.5) wanted.add('right');
  if (ty < player.y - 0.5) wanted.add('up');
  if (ty > player.y + 0.5) wanted.add('down');
  setKeys(wanted);
}

let time = 0;
const FRAME = 1000 / 60;
let frames = 0;
const MAX_FRAMES = 60 * 600; // 10 simulated minutes

while (frames < MAX_FRAMES) {
  botThink();
  // Hold Space only to serve (unless testing always-charged play).
  if (getState() === 'serving' || alwaysCharge) {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); }
  } else if (held.has('Space')) {
    dom.keyUp('Space');
    held.delete('Space');
  }
  time += FRAME;
  dom.step(time);
  frames++;
  if (dom.elements['gameover-title'].textContent) break;
}

const result = dom.elements['gameover-title'].textContent || 'no result';
console.log(`${difficulty}: ${result}  (${(frames / 60).toFixed(0)}s simulated)`);
