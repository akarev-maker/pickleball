// Shared bot driver: plays one full game headless with a perfect-tracking
// player. One game per process (game.js holds module state).

import { installDom } from './dom-stub.js';
import { COURT_W, COURT_L, NET_Y, KITCHEN_BOTTOM, CENTER_X } from '../rules.js';

const DIR_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

export async function runBotGame({
  difficulty = 'medium',
  profile = null,
  tournament = false,
  alwaysCharge = false,
  maxSeconds = 600,
} = {}) {
  const dom = installDom();
  await import('../game.js');
  const { ball, player, cpu, getState, getScore, getRally } = window.__pickleball;

  if (tournament) {
    dom.elements['mode-tournament'].onclick();
    dom.elements['ladder-play'].onclick();
  } else {
    dom.startGame(difficulty);
  }
  if (profile) cpu.setProfile(profile);

  const held = new Set();
  function setKeys(wanted) {
    for (const [dir, code] of Object.entries(DIR_KEYS)) {
      if (wanted.has(dir) && !held.has(code)) { dom.keyDown(code); held.add(code); }
      if (!wanted.has(dir) && held.has(code)) { dom.keyUp(code); held.delete(code); }
    }
  }

  let time = 0;
  const FRAME = 1000 / 60;
  let frames = 0;
  const maxFrames = 60 * maxSeconds;

  while (frames < maxFrames) {
    // Chase the landing spot of incoming, in-bounds balls; let out balls fly;
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

    // Space: hold to serve/charge, RELEASE to swing (manual-swing scheme).
    // The bot releases when the incoming ball is in reach; with alwaysCharge
    // it holds through the rally and releases at contact (max power).
    const st = getState();
    const dist = Math.hypot(ball.x - player.x, ball.y - player.y);
    // Respect the two-bounce rule: hits 2 and 3 must be played off a bounce.
    const rally = getRally();
    const mustWait = rally && !rally.bouncedSinceLastHit
      && (rally.hitCount === 1 || rally.hitCount === 2);
    const swingNow = st === 'rally' && ball.inFlight && ball.vy > 0
      && dist < 2.2 && ball.z < 6 && !mustWait;
    if (st === 'serving' || st === 'replay') {
      if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); }
    } else if (st === 'rally') {
      if (swingNow) {
        if (held.has('Space')) { dom.keyUp('Space'); held.delete('Space'); }
        else { dom.keyDown('Space'); held.add('Space'); }
      } else if (alwaysCharge) {
        if (!held.has('Space')) { dom.keyDown('Space'); held.add('Space'); }
      } else if (held.has('Space')) {
        // Release right after serving — the serve grace absorbs it.
        dom.keyUp('Space');
        held.delete('Space');
      }
    }

    time += FRAME;
    dom.step(time);
    frames++;
    if (dom.elements['gameover-title'].textContent) break;
  }

  const score = getScore();
  return {
    player: score.get('player'),
    cpu: score.get('cpu'),
    seconds: frames / 60,
    title: dom.elements['gameover-title'].textContent || null,
    dom,
  };
}
