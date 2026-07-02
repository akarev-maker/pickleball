// Minimal DOM stubs so game.js can run headless under Node.

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

// Installs global document/window/requestAnimationFrame stubs and returns
// handles for driving the game.
export function installDom() {
  const elements = {};
  for (const id of ['game', 'score', 'banner', 'menu', 'gameover', 'gameover-title', 'restart']) {
    elements[id] = makeElement(id);
  }

  // Difficulty buttons must exist before game.js is imported, since
  // showMenu wires their onclick handlers at import time.
  elements.menu.buttons = ['easy', 'medium', 'hard'].map((d) => {
    const btn = makeElement(`btn-${d}`);
    btn.dataset.difficulty = d;
    return btn;
  });

  const listeners = { keydown: [], keyup: [], resize: [] };
  const raf = { callback: null };

  globalThis.document = { getElementById: (id) => elements[id] };
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
