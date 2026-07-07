// Player progression: persistent stats, unlockable cosmetics, daily challenge.
// Unlocks are derived from stats at read time — nothing to migrate.

import { ROSTER } from './ladder.js';
import { BACKDROPS as THEMES } from './court.js';

const STATS_KEY = 'pickleball.stats';
const EQUIP_KEY = 'pickleball.equip';
const CIRCUIT_KEY = 'pickleball.circuit';

// The six perks a player starts with; the other four are bought in the shop.
export const STARTER_PERKS = [
  'cannon', 'feather', 'quickfeet', 'longreach', 'sureserve', 'netmagnet',
];

const DEFAULT_CIRCUIT = { trophies: 0, unlocked: STARTER_PERKS.slice(), bestDepth: 0 };

let memCircuit = null;

const DEFAULT_STATS = {
  games: 0, wins: 0, shutouts: 0, champs: 0,
  points: 0, pointsAgainst: 0, longestRally: 0,
  dailyWins: 0, lastDailyWin: '',
};

let memStats = null;
let memEquip = null;

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    if (v && typeof v === 'object') return { ...fallback, ...v };
  } catch { /* unavailable or corrupt */ }
  return { ...fallback };
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* unavailable */ }
}

export function loadStats() {
  if (!memStats) memStats = read(STATS_KEY, DEFAULT_STATS);
  return memStats;
}

function saveStats() {
  write(STATS_KEY, loadStats());
}

export function recordPoint(playerWon, rallyHits) {
  const s = loadStats();
  if (playerWon) s.points++; else s.pointsAgainst++;
  s.longestRally = Math.max(s.longestRally, rallyHits);
  saveStats();
}

export function recordGame({ won, shutout, champion }) {
  const s = loadStats();
  s.games++;
  if (won) s.wins++;
  if (won && shutout) s.shutouts++;
  if (champion) s.champs++;
  saveStats();
}

export function recordDailyWin(dateStr) {
  const s = loadStats();
  if (s.lastDailyWin === dateStr) return;
  s.dailyWins++;
  s.lastDailyWin = dateStr;
  saveStats();
}

// --- Cosmetics ---

export const PADDLES = [
  { id: 'classic', name: 'Classic', color: '#ffd75e', how: 'Always yours', unlocked: () => true },
  { id: 'sunset', name: 'Sunset', color: '#ff8a5e', how: 'Win a game', unlocked: (s) => s.wins >= 1 },
  { id: 'mint', name: 'Mint', color: '#7fe0b0', how: 'Reach rung 5 of the ladder', unlocked: (s, rung) => rung >= 4 },
  { id: 'gold', name: 'Gold', color: '#ffd700', how: 'Win a game 11–0', unlocked: (s) => s.shutouts >= 1 },
  { id: 'midnight', name: 'Midnight', color: '#5d6cff', how: 'Become tournament champion', unlocked: (s) => s.champs >= 1 },
];

export const BALLS = [
  { id: 'classic', name: 'Classic', color: '#f3ff4e', how: 'Always yours', unlocked: () => true },
  { id: 'snow', name: 'Snowball', color: '#ffffff', how: 'Survive a 15-hit rally', unlocked: (s) => s.longestRally >= 15 },
  { id: 'flamingo', name: 'Flamingo', color: '#ff9ecb', how: 'Win 10 games', unlocked: (s) => s.wins >= 10 },
  { id: 'ice', name: 'Ice', color: '#8de3ff', how: 'Win a daily challenge', unlocked: (s) => s.dailyWins >= 1 },
];

// Court backdrops are a free setting, not an unlock — every theme is open.
export const BACKDROPS = THEMES.map((t) => (
  { id: t.id, name: t.name, color: t.swatch, how: 'Always yours', unlocked: () => true }
));

export function isUnlocked(item, rung = currentRung()) {
  return item.unlocked(loadStats(), rung);
}

function currentRung() {
  try {
    return Number(localStorage.getItem('pickleball.rung')) || 0;
  } catch {
    return 0;
  }
}

const SLOTS = { paddle: PADDLES, ball: BALLS, backdrop: BACKDROPS };

export function equipped() {
  if (!memEquip) memEquip = read(EQUIP_KEY, { paddle: 'classic', ball: 'classic', backdrop: 'classic' });
  // Never keep something equipped that isn't unlocked (e.g. cleared stats).
  for (const [slot, items] of Object.entries(SLOTS)) {
    const item = items.find((i) => i.id === memEquip[slot]);
    if (!item || !isUnlocked(item)) memEquip[slot] = 'classic';
  }
  return memEquip;
}

export function equip(slot, id) {
  const item = (SLOTS[slot] || []).find((i) => i.id === id);
  if (!item || !isUnlocked(item)) return;
  equipped()[slot] = id;
  write(EQUIP_KEY, memEquip);
}

export function equippedColors() {
  const e = equipped();
  return {
    paddle: PADDLES.find((p) => p.id === e.paddle).color,
    ball: BALLS.find((b) => b.id === e.ball).color,
  };
}

// --- Daily challenge ---

export const MODIFIERS = [
  { id: 'breeze-e', label: 'Easterly breeze — shots drift right', wind: 6, gravityScale: 1 },
  { id: 'breeze-w', label: 'Westerly breeze — shots drift left', wind: -6, gravityScale: 1 },
  { id: 'gale-e', label: 'Easterly gale — hold onto your hat', wind: 12, gravityScale: 1 },
  { id: 'gale-w', label: 'Westerly gale — hold onto your hat', wind: -12, gravityScale: 1 },
  { id: 'moon', label: 'Moon gravity — everything floats', wind: 0, gravityScale: 0.62 },
  { id: 'heavy', label: 'Heavy air — the ball dies fast', wind: 0, gravityScale: 1.3 },
];

export function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function dailyChallenge(dateStr = todayStr()) {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    date: dateStr,
    opponentIndex: h % ROSTER.length,
    modifier: MODIFIERS[Math.floor(h / 8) % MODIFIERS.length],
    doneToday: loadStats().lastDailyWin === dateStr,
  };
}

// --- The Circuit meta (Trophies, unlocked perks, best run depth) ---

export function loadCircuit() {
  if (!memCircuit) {
    memCircuit = read(CIRCUIT_KEY, DEFAULT_CIRCUIT);
    memCircuit.unlocked = memCircuit.unlocked.slice(); // never alias DEFAULT_CIRCUIT / the parsed ref
    // Guarantee starter perks even if an older save predates one.
    for (const id of STARTER_PERKS) {
      if (!memCircuit.unlocked.includes(id)) memCircuit.unlocked.push(id);
    }
  }
  return memCircuit;
}

function saveCircuit() {
  write(CIRCUIT_KEY, loadCircuit());
}

export function addTrophies(n) {
  const c = loadCircuit();
  c.trophies += n;
  saveCircuit();
  return c.trophies;
}

export function spendTrophies(n) {
  const c = loadCircuit();
  if (c.trophies < n) return false;
  c.trophies -= n;
  saveCircuit();
  return true;
}

export function unlockPerk(id) {
  const c = loadCircuit();
  if (!c.unlocked.includes(id)) { c.unlocked.push(id); saveCircuit(); }
}

export function recordRunDepth(d) {
  const c = loadCircuit();
  if (d > c.bestDepth) { c.bestDepth = d; saveCircuit(); }
}
