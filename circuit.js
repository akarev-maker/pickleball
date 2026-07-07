// The Circuit run engine: a 9-rung roguelike climb. Pure logic + a draft
// helper. Persistence and UI live elsewhere (progress.js, ui.js, game.js).

import { ROSTER } from './ladder.js';
import { PERKS, perkById } from './perks.js';

// The rung-9 boss: tougher than The Wall, with its own look.
export const CHAMPION = {
  id: 'champion', name: 'The Champion', color: '#ffd700',
  tagline: '“You have to earn this one.”',
  winLine: 'The Champion offers a nod. You take it.',
  loseLine: 'The Champion has seen a thousand challengers. You were one.',
  speed: 17, reaction: 0.08, aimError: 1.3, dinkiness: 0.6, aggression: 0.7, lobbiness: 0.15,
  look: { hair: 'headband', hairColor: '#d4af37', skin: '#c98a52', h: 1.05, w: 1.05 },
};

// Match target (first to N, win by 2) per rung — rising stakes.
export const RUNGS = [
  { target: 4 }, { target: 4 }, { target: 4 },
  { target: 7 }, { target: 7 }, { target: 7 }, { target: 7 }, { target: 7 },
  { target: 11 },
];

// rung is 1-based. 1..8 walk the roster (already easy→hard); 9 is the boss.
export function matchConfig(rung) {
  const cfg = RUNGS[rung - 1];
  const opponent = rung >= RUNGS.length ? CHAMPION : ROSTER[rung - 1];
  return { target: cfg.target, opponent };
}

export function newRun() {
  return { rung: 1, perks: [], won: false, alive: true };
}

export function advance(run) {
  if (run.rung >= RUNGS.length) run.won = true;
  else run.rung += 1;
}

export function fail(run) {
  run.alive = false;
}

export function rungsCleared(run) {
  return run.won ? RUNGS.length : run.rung - 1;
}

export function trophies(run) {
  return rungsCleared(run) * 5 + (run.won ? 25 : 0);
}

const RARITY_WEIGHT = { common: 6, uncommon: 3, rare: 1 };

// Up to n distinct perk ids from unlockedIds minus ownedIds, rarity-weighted.
export function draftOptions(ownedIds, unlockedIds, n = 3, rng = Math.random) {
  const owned = new Set(ownedIds);
  const pool = unlockedIds.filter((id) => !owned.has(id) && perkById(id));
  const picks = [];
  while (picks.length < n && pool.length > 0) {
    const total = pool.reduce((sum, id) => sum + RARITY_WEIGHT[perkById(id).rarity], 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= RARITY_WEIGHT[perkById(pool[idx]).rarity];
      if (r <= 0) break;
    }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return picks;
}
