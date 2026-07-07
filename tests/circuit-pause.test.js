import { installDom } from './dom-stub.js';
import { COURT_W, COURT_L, NET_Y, KITCHEN_BOTTOM, CENTER_X } from '../rules.js';

const dom = installDom();
await import('../game.js');
const pk = window.__pickleball;
const { ball, player, getState } = pk;

// Enter the Circuit and start the first match.
dom.elements['mode-circuit'].onclick();
dom.elements['circuit-play'].onclick();

const DIR = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const held = new Set();
const setKeys = (w) => {
  for (const [d, code] of Object.entries(DIR)) {
    if (w.has(d) && !held.has(code)) { dom.keyDown(code); held.add(code); }
    if (!w.has(d) && held.has(code)) { dom.keyUp(code); held.delete(code); }
  }
};

let t = 0; let sf = 0; let frames = 0;
let live = false;
let rungAtPause = null;

while (frames < 60 * 300) {
  let tx = CENTER_X; let ty = COURT_L - 6;
  if (ball.inFlight && ball.vy > 0) {
    const land = ball.predictLanding();
    if (land.x >= 0 && land.x <= COURT_W && land.y <= COURT_L) {
      tx = land.x;
      ty = land.y > NET_Y && land.y < KITCHEN_BOTTOM ? KITCHEN_BOTTOM + 0.5 : Math.max(land.y, NET_Y + 1.5);
    }
  }
  const w = new Set();
  if (tx < player.x - 0.5) w.add('left');
  if (tx > player.x + 0.5) w.add('right');
  if (ty < player.y - 0.5) w.add('up');
  if (ty > player.y + 0.5) w.add('down');
  setKeys(w);
  const st = getState();
  if (st === 'serving' || st === 'replay') {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); sf = 0; }
    else if (st === 'serving' && ++sf > 20) { dom.keyUp('Space'); held.delete('Space'); }
  } else if (st === 'rally' && ball.inFlight && ball.vy > 0
      && Math.hypot(ball.x - player.x, ball.y - player.y) < 2.2) {
    if (held.has('Space')) { dom.keyUp('Space'); held.delete('Space'); }
    else { dom.keyDown('Space'); held.add('Space'); }
  }
  t += 1000 / 60; dom.step(t); frames++;

  // Once a match is clearly live (intro/serving/rally), pause and restart.
  if (['intro', 'serving', 'rally'].includes(getState())) {
    live = true;
    rungAtPause = pk.getCircuitRun().rung;
    break;
  }
}

if (!live) {
  console.error('FAIL: never reached a live Circuit match to pause');
  process.exit(1);
}

// Release any held keys before pausing, matching normal play.
for (const code of held) dom.keyUp(code);
held.clear();

dom.keyDown('Escape'); // pause
dom.elements['pause-restart'].onclick(); // restart the current rung

const modeAfter = pk.getMode();
const rungAfter = pk.getCircuitRun().rung;

if (modeAfter === 'circuit' && rungAfter === rungAtPause) {
  console.log('PASS: restart during a Circuit match replays the current rung');
} else {
  console.error(
    `FAIL: expected mode 'circuit' (got '${modeAfter}'), rung ${rungAtPause} (got ${rungAfter})`,
  );
  process.exit(1);
}
