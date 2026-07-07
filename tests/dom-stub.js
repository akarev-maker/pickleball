// Minimal DOM stubs so game.js can run headless under Node.

const noop = () => {};

const gradientStub = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (_t, prop) => (
    prop === 'createLinearGradient' || prop === 'createRadialGradient'
      ? () => gradientStub
      : noop
  ),
  set: () => true,
});

function makeElement(id) {
  const el = {
    id,
    textContent: '',
    _html: '',
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = v; if (v === '') el.children = []; },
    children: [],
    appendChild(c) { el.children.push(c); return c; },
    style: {},
    dataset: {},
    onclick: null,
    classList: { add: noop, remove: noop, toggle: noop },
    width: 0,
    height: 0,
    getContext: () => ctxStub,
    addEventListener: noop,
    querySelectorAll: () => el.buttons || [],
    buttons: null,
  };
  return el;
}

// Installs global document/window/requestAnimationFrame stubs and returns
// handles for driving the game.
export function installDom() {
  const elements = {};
  const ids = [
    'game', 'score', 'banner', 'menu', 'hud', 'difficulty-row',
    'mode-grid', 'difficulty-title', 'difficulty-back',
    'mode-quick', 'mode-tournament', 'mode-doubles', 'mode-skinny', 'best3',
    'ladder', 'ladder-list', 'ladder-play', 'ladder-reset', 'ladder-back',
    'mode-circuit', 'circuit-start', 'circuit-bracket', 'circuit-meta',
    'circuit-play', 'circuit-shop', 'circuit-back',
    'pro-shop', 'shop-balance', 'shop-list', 'shop-back',
    'run-summary', 'run-summary-title', 'run-summary-line', 'run-summary-detail',
    'run-summary-continue',
    'champion', 'champion-restart',
    'draft', 'draft-cards', 'draft-owned',
    'pause', 'pause-resume', 'pause-restart', 'pause-quit',
    'menu-daily', 'menu-daily-label', 'menu-stats', 'menu-locker',
    'stats', 'stats-list', 'stats-back', 'locker', 'locker-list', 'locker-back',
    'gameover', 'gameover-title', 'gameover-line', 'restart', 'mute',
    'touch', 'joystick', 'stick',
  ];
  for (const id of ids) {
    elements[id] = makeElement(id);
  }

  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  // Difficulty buttons must exist before game.js is imported, since
  // showMenu wires their onclick handlers at import time.
  elements.menu.buttons = ['easy', 'medium', 'hard'].map((d) => {
    const btn = makeElement(`btn-${d}`);
    btn.dataset.difficulty = d;
    return btn;
  });

  const listeners = { keydown: [], keyup: [], resize: [] };
  const raf = { callback: null };

  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => makeElement('dynamic'),
  };
  globalThis.window = {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 1000,
    addEventListener: (type, fn) => { (listeners[type] || []).push(fn); },
  };
  globalThis.requestAnimationFrame = (fn) => { raf.callback = fn; };

  return {
    elements,
    startGame(difficulty) {
      const btn = elements.menu.buttons.find((b) => b.dataset.difficulty === difficulty);
      if (typeof btn.onclick !== 'function') {
        throw new Error('menu buttons not wired — import game.js first');
      }
      btn.onclick();
    },
    keyDown(code) {
      for (const fn of listeners.keydown) fn({ code, preventDefault: noop });
    },
    keyUp(code) {
      for (const fn of listeners.keyup) fn({ code });
    },
    step(time) {
      const cb = raf.callback;
      raf.callback = null;
      if (cb) cb(time);
      return cb !== null;
    },
  };
}
