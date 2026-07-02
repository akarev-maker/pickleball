// DOM HUD: score, banners, menus, ladder. All elements live in index.html
// with fixed ids (keeps the test DOM stub trivial).

import { PLAYER, CPU } from './rules.js';

const scoreEl = document.getElementById('score');
const bannerEl = document.getElementById('banner');
const menuEl = document.getElementById('menu');
const difficultyRow = document.getElementById('difficulty-row');
const ladderEl = document.getElementById('ladder');
const ladderList = document.getElementById('ladder-list');
const ladderPlay = document.getElementById('ladder-play');
const ladderReset = document.getElementById('ladder-reset');
const ladderBack = document.getElementById('ladder-back');
const championEl = document.getElementById('champion');
const championRestart = document.getElementById('champion-restart');
const gameoverEl = document.getElementById('gameover');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverLine = document.getElementById('gameover-line');
const restartBtn = document.getElementById('restart');
const muteBtn = document.getElementById('mute');

let bannerTimer = null;

export function updateScore(score, servingSide, opponentName = 'CPU') {
  const you = `YOU ${score.get(PLAYER)}`;
  const cpu = `${opponentName} ${score.get(CPU)}`;
  scoreEl.innerHTML = servingSide === PLAYER
    ? `<span class="serving">🏓 ${you}</span> — ${cpu}`
    : `${you} — <span class="serving">${cpu} 🏓</span>`;
}

export function showBanner(text, ms = 2000) {
  clearTimeout(bannerTimer);
  bannerEl.textContent = text;
  bannerEl.classList.remove('hidden');
  if (ms > 0) {
    bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), ms);
  }
}

export function hideBanner() {
  clearTimeout(bannerTimer);
  bannerEl.classList.add('hidden');
}

export function showModeMenu(onQuick, onTournament) {
  hideOverlays();
  menuEl.classList.remove('hidden');
  document.getElementById('mode-quick').onclick = () => {
    difficultyRow.classList.remove('hidden');
  };
  document.getElementById('mode-tournament').onclick = () => {
    menuEl.classList.add('hidden');
    onTournament();
  };
  // Difficulty buttons are always wired so the flow is one click in tests.
  for (const btn of menuEl.querySelectorAll('button[data-difficulty]')) {
    btn.onclick = () => {
      menuEl.classList.add('hidden');
      onQuick(btn.dataset.difficulty);
    };
  }
}

export function showLadder(roster, rung, { onPlay, onReset, onBack }) {
  hideOverlays();
  ladderEl.classList.remove('hidden');

  // Hardest at the top; beaten rungs checked, the current one highlighted.
  const rows = roster.map((p, i) => {
    const cls = i < rung ? 'rung beaten' : (i === rung ? 'rung current' : 'rung');
    const mark = i < rung ? '✓' : (i === rung ? '▶' : `${i + 1}`);
    return `<div class="${cls}"><span class="mark">${mark}</span>`
      + `<span class="dot" style="background:${p.color}"></span>`
      + `<span class="name">${p.name}</span></div>`;
  }).reverse();
  ladderList.innerHTML = rows.join('');

  if (rung >= roster.length) {
    ladderPlay.classList.add('hidden');
  } else {
    ladderPlay.classList.remove('hidden');
    ladderPlay.textContent = `Play ${roster[rung].name}`;
    ladderPlay.onclick = () => {
      ladderEl.classList.add('hidden');
      onPlay();
    };
  }
  ladderReset.onclick = onReset;
  ladderBack.onclick = () => {
    ladderEl.classList.add('hidden');
    onBack();
  };
}

export function showChampion(onDone) {
  hideOverlays();
  championEl.classList.remove('hidden');
  championRestart.onclick = () => {
    championEl.classList.add('hidden');
    onDone();
  };
}

export function showGameOver(title, line, buttonLabel, onContinue) {
  hideOverlays();
  gameoverTitle.textContent = title;
  gameoverLine.textContent = line;
  restartBtn.textContent = buttonLabel;
  gameoverEl.classList.remove('hidden');
  restartBtn.onclick = () => {
    gameoverEl.classList.add('hidden');
    onContinue();
  };
}

export function setMuteLabel(muted) {
  muteBtn.textContent = muted ? '🔇' : '🔊';
}

export function onMuteClick(fn) {
  muteBtn.onclick = fn;
}

export function hideOverlays() {
  for (const el of [menuEl, ladderEl, championEl, gameoverEl]) {
    el.classList.add('hidden');
  }
  hideBanner();
}
