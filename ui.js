// DOM HUD: score, banners, menus, ladder. All elements live in index.html
// with fixed ids (keeps the test DOM stub trivial).

import { PLAYER, CPU } from './rules.js';
import {
  PADDLES, BALLS, BACKDROPS, isUnlocked, equip, equipped, loadStats, dailyChallenge,
} from './progress.js';

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
const pauseEl = document.getElementById('pause');
const gameoverEl = document.getElementById('gameover');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverLine = document.getElementById('gameover-line');
const restartBtn = document.getElementById('restart');
const muteBtn = document.getElementById('mute');

let bannerTimer = null;

export function updateScore(score, servingSide, opponentName = 'CPU') {
  const you = `YOU ${score.get(PLAYER)}`;
  const cpu = `${opponentName} ${score.get(CPU)}`;
  // The serving side is named outright — a bare dot read as a separator.
  const tag = '<em class="serve-tag">serve</em>';
  scoreEl.innerHTML = servingSide === PLAYER
    ? `<span class="serving">${you}${tag}</span> — ${cpu}`
    : `${you} — <span class="serving">${cpu}${tag}</span>`;
}

// kind 'soft' renders as a quiet uppercase prompt (serve instructions);
// the default stays punchy for point results and announcements.
export function showBanner(text, ms = 2000, kind = '') {
  bannerEl.classList.toggle('soft', kind === 'soft');
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

export function showModeMenu(onQuick, onTournament, { onDaily, onCosmetics } = {}) {
  hideOverlays();
  menuEl.classList.remove('hidden');

  // Quick Play, Doubles, and Skinny share the difficulty step; picking one
  // swaps the mode grid for the difficulty row, and the chosen variant and
  // Best-of-3 toggle ride along with the difficulty pick.
  const modeGrid = document.getElementById('mode-grid');
  const difficultyTitle = document.getElementById('difficulty-title');
  difficultyRow.classList.add('hidden');
  modeGrid.classList.remove('hidden');
  let variant = 'singles';
  let bestOf3 = false;
  const reveal = (v, label) => {
    variant = v;
    modeGrid.classList.add('hidden');
    difficultyRow.classList.remove('hidden');
    difficultyTitle.textContent = label;
  };
  document.getElementById('mode-quick').onclick = () => reveal('singles', 'Quick Play');
  document.getElementById('mode-doubles').onclick = () => reveal('doubles', 'Doubles');
  document.getElementById('mode-skinny').onclick = () => reveal('skinny', 'Skinny Singles');
  document.getElementById('difficulty-back').onclick = () => {
    difficultyRow.classList.add('hidden');
    modeGrid.classList.remove('hidden');
  };
  const best3Btn = document.getElementById('best3');
  best3Btn.onclick = () => {
    bestOf3 = !bestOf3;
    best3Btn.classList.toggle('on', bestOf3);
  };
  document.getElementById('mode-tournament').onclick = () => {
    menuEl.classList.add('hidden');
    onTournament();
  };
  document.getElementById('menu-daily').onclick = () => {
    menuEl.classList.add('hidden');
    if (onDaily) onDaily();
  };
  const dailyLabel = document.getElementById('menu-daily-label');
  if (dailyLabel) {
    dailyLabel.textContent = dailyChallenge().doneToday ? 'Daily ✓' : 'Daily';
  }
  document.getElementById('menu-stats').onclick = () => showStats();
  document.getElementById('menu-locker').onclick = () => showLocker(onCosmetics);
  // Difficulty buttons are always wired so the flow is one click in tests.
  for (const btn of menuEl.querySelectorAll('button[data-difficulty]')) {
    btn.onclick = () => {
      menuEl.classList.add('hidden');
      onQuick(btn.dataset.difficulty, { variant, bestOf3 });
    };
  }
}

export function showStats() {
  hideOverlays();
  const s = loadStats();
  const rows = [
    ['Games', `${s.wins} W — ${s.games - s.wins} L`],
    ['Shutouts (11–0)', s.shutouts],
    ['Championships', s.champs],
    ['Points', `${s.points} W — ${s.pointsAgainst} L`],
    ['Longest rally', `${s.longestRally} hits`],
    ['Daily challenges won', s.dailyWins],
  ];
  document.getElementById('stats-list').innerHTML = rows
    .map(([k, v]) => `<div class="stat-row"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  const statsEl = document.getElementById('stats');
  statsEl.classList.remove('hidden');
  document.getElementById('stats-back').onclick = () => {
    statsEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
  };
}

export function showLocker(onCosmetics) {
  hideOverlays();
  const lockerEl = document.getElementById('locker');
  const list = document.getElementById('locker-list');

  function render() {
    const eq = equipped();
    const section = (title, slot, items) => `<h3>${title}</h3>` + items.map((item) => {
      const open = isUnlocked(item);
      const cls = `locker-item${open ? '' : ' locked'}${eq[slot] === item.id ? ' equipped' : ''}`;
      const label = open ? item.name : `${item.name} — ${item.how}`;
      return `<button class="${cls}" data-slot="${slot}" data-id="${item.id}" ${open ? '' : 'disabled'}>`
        + `<span class="dot" style="background:${item.color}"></span>${label}</button>`;
    }).join('');
    list.innerHTML = section('Paddles', 'paddle', PADDLES)
      + section('Balls', 'ball', BALLS)
      + section('Courts', 'backdrop', BACKDROPS);
  }

  list.onclick = (e) => {
    const btn = e.target?.closest?.('button[data-slot]');
    if (!btn) return;
    equip(btn.dataset.slot, btn.dataset.id);
    if (onCosmetics) onCosmetics();
    render();
  };

  render();
  lockerEl.classList.remove('hidden');
  document.getElementById('locker-back').onclick = () => {
    lockerEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
  };
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

// Pause overlays on top of the frozen scene; it does not hide the banner.
export function showPause({ onResume, onRestart, onQuit }) {
  pauseEl.classList.remove('hidden');
  document.getElementById('pause-resume').onclick = onResume;
  document.getElementById('pause-restart').onclick = onRestart;
  document.getElementById('pause-quit').onclick = onQuit;
}

export function hidePause() {
  pauseEl.classList.add('hidden');
}

const SPEAKER_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/>'
  + '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none"/>'
  + '<line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>';

export function setMuteLabel(muted) {
  muteBtn.innerHTML = muted ? SPEAKER_OFF : SPEAKER_ON;
  muteBtn.classList.toggle('muted', muted);
}

export function onMuteClick(fn) {
  muteBtn.onclick = fn;
}

export function hideOverlays() {
  const extras = [document.getElementById('stats'), document.getElementById('locker')];
  for (const el of [menuEl, ladderEl, championEl, gameoverEl, pauseEl, ...extras]) {
    el.classList.add('hidden');
  }
  hideBanner();
}
