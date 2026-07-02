// Headless smoke test: stubs the DOM, imports the real game, holds Space down,
// and simulates ~3 minutes of frames. Verifies rallies end, points accumulate,
// and nothing throws. Run: node tests/smoke.test.js

const noop = () => {};

const ctxStub = new Proxy({}, {
  get: () => noop,
  set: () => true,
});

function makeElement(id) {
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    onclick: null,
    classList: { add: noop, remove: noop },
    width: 0,
    height: 0,
    getContext: () => ctxStub,
    querySelectorAll: () => el.buttons || [],
    buttons: null,
  };
  return el;
}

const elements = {};
for (const id of ['game', 'score', 'banner', 'menu', 'gameover', 'gameover-title', 'restart']) {
  elements[id] = makeElement(id);
}
const difficultyBtn = makeElement('btn');
difficultyBtn.dataset.difficulty = 'medium';
elements.menu.buttons = [difficultyBtn];

const listeners = { keydown: [], keyup: [], resize: [] };
let rafCallback = null;

globalThis.document = { getElementById: (id) => elements[id] };
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 800,
  innerHeight: 1000,
  addEventListener: (type, fn) => { (listeners[type] || []).push(fn); },
};
globalThis.requestAnimationFrame = (fn) => { rafCallback = fn; };

await import('../game.js');

// Start the game on medium via the difficulty button the UI wired up.
if (typeof difficultyBtn.onclick !== 'function') {
  console.error('FAIL: menu did not wire difficulty buttons');
  process.exit(1);
}
difficultyBtn.onclick();

// Hold Space forever so player serves fire immediately.
for (const fn of listeners.keydown) fn({ code: 'Space', preventDefault: noop });

const reasons = new Set();
let time = 0;
const FRAME = 1000 / 60;
let frames = 0;
const MAX_FRAMES = 60 * 180; // 3 simulated minutes

try {
  while (frames < MAX_FRAMES && rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    time += FRAME;
    cb(time);
    frames++;
    if (elements.banner.textContent) reasons.add(elements.banner.textContent);
    if (elements['gameover-title'].textContent) break;
  }
} catch (e) {
  console.error(`FAIL: game loop threw after ${frames} frames: ${e.stack}`);
  process.exit(1);
}

const scoreText = elements.score.innerHTML;
const points = [...scoreText.matchAll(/\d+/g)].map((m) => Number(m[0]));
const total = points.reduce((a, b) => a + b, 0);

console.log(`ran ${frames} frames (${(frames / 60).toFixed(0)}s simulated)`);
console.log(`final score HTML: ${scoreText}`);
console.log(`game over: ${elements['gameover-title'].textContent || '(not reached)'}`);
console.log('rally endings seen:');
for (const r of reasons) console.log(`  - ${r}`);

if (total === 0) {
  console.error('FAIL: no points were scored in 3 simulated minutes');
  process.exit(1);
}
console.log(`\nPASS: ${total} total points scored, no exceptions`);
