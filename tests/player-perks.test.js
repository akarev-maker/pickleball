import { Player } from '../player.js';
import { Ball } from '../ball.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(c, m = 'assertion failed') { if (!c) throw new Error(m); }

test('speed multiplier moves the player farther in a step', () => {
  const base = new Player();
  const fast = new Player();
  const keys = new Set(['ArrowLeft']);
  base.update(0.1, keys, 1);
  fast.update(0.1, keys, 1.15);
  const baseDist = Math.abs(base.x - 13);
  const fastDist = Math.abs(fast.x - 13);
  assert(fastDist > baseDist * 1.1, `fast (${fastDist}) should out-cover base (${baseDist})`);
});

test('reach bonus lets the player reach a ball just out of normal reach', () => {
  const p = new Player(); // starts at x=13, y=40
  const ball = new Ball();
  ball.placeAt(p.x + 3.6, p.y, 1); // beyond PLAYER_REACH (3.2), within 3.2+0.6
  assert(!p.canReach(ball, 0), 'unreachable without the perk');
  assert(p.canReach(ball, 0.6), 'reachable with Long Reach');
});

// Integration: with Long Reach active, the game lets the player reach a ball
// the empty set would miss. Driven through the real game module.
import { installDom } from './dom-stub.js';

const dom = installDom();
await import('../game.js');
const pk = window.__pickleball;
dom.startGame('easy');
test('setPerks swaps the active set the game reads', () => {
  pk.setPerks(['longreach']);
  assert(pk.getPerks().reachBonus() > 0, 'game now holds a Long Reach set');
  pk.setPerks([]);
  assert(pk.getPerks().reachBonus() === 0, 'cleared');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
