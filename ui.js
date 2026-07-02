// DOM HUD: score, banners, menus. All elements live in index.html.

import { PLAYER, CPU } from './rules.js';

const scoreEl = document.getElementById('score');
const bannerEl = document.getElementById('banner');
const menuEl = document.getElementById('menu');
const gameoverEl = document.getElementById('gameover');
const gameoverTitle = document.getElementById('gameover-title');
const restartBtn = document.getElementById('restart');

let bannerTimer = null;

export function updateScore(score, servingSide) {
  const you = `YOU ${score.get(PLAYER)}`;
  const cpu = `CPU ${score.get(CPU)}`;
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

export function showMenu(onStart) {
  menuEl.classList.remove('hidden');
  for (const btn of menuEl.querySelectorAll('button[data-difficulty]')) {
    btn.onclick = () => {
      menuEl.classList.add('hidden');
      onStart(btn.dataset.difficulty);
    };
  }
}

export function showGameOver(winnerText, onRestart) {
  gameoverTitle.textContent = winnerText;
  gameoverEl.classList.remove('hidden');
  restartBtn.onclick = () => {
    gameoverEl.classList.add('hidden');
    onRestart();
  };
}

export function hideOverlays() {
  menuEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  hideBanner();
}
