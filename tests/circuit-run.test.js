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
let advanced = false;
while (frames < 60 * 600) {
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
  const draftCards = dom.elements['draft-cards'];
  if (draftCards.children.length) draftCards.children[0].onclick();
  if (st === 'serving' || st === 'replay') {
    if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); sf = 0; }
    else if (st === 'serving' && ++sf > 20) { dom.keyUp('Space'); held.delete('Space'); }
  } else if (st === 'rally' && ball.inFlight && ball.vy > 0
      && Math.hypot(ball.x - player.x, ball.y - player.y) < 2.2) {
    if (held.has('Space')) { dom.keyUp('Space'); held.delete('Space'); }
    else { dom.keyDown('Space'); held.add('Space'); }
  }
  t += 1000 / 60; dom.step(t); frames++;
  // Resolved either way: the bot beat rung 1 and moved on, or lost → summary.
  const run = pk.getCircuitRun();
  if ((run && run.rung > 1) || dom.elements['run-summary-title'].textContent) {
    advanced = true;
    break;
  }
}

if (advanced) console.log('PASS: a Circuit run advanced past its first match');
else { console.error('FAIL: run never advanced'); process.exit(1); }
