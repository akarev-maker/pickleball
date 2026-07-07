// Tournament roster and ladder progress persistence.
//
// Personality knobs (beyond speed/reaction/aimError):
//   dinkiness  0..1  preference for the kitchen dink game
//   aggression 0..1  flat/fast drive bias (compresses flight time)
//   lobbiness  0..1  chance of deep, high lobs
//
// `look` shapes the on-court figure (see player.js drawFigure): h/w scale
// the build, hunch stoops the shoulders, hair is one of cap | spiky |
// bald | ponytail | headband, headShape 'square' blocks out the head,
// glasses adds spectacles, skin/hairColor recolor. Omit for the default.

export const ROSTER = [
  {
    id: 'rick', name: 'Rookie Rick', color: '#9fd8ff',
    tagline: '“Which side is the kitchen again?”',
    winLine: 'Rick can\'t believe it either.',
    loseLine: '“Good game! I almost hit one!”',
    speed: 9, reaction: 0.5, aimError: 4.5, dinkiness: 0.1, aggression: 0.1, lobbiness: 0.15,
    look: { hair: 'spiky', hairColor: '#7a4520', h: 0.92, w: 0.9 },
  },
  {
    id: 'gene', name: 'Grandpa Gene', color: '#d9c79e',
    tagline: '“Slow down, kid. The kitchen decides who wins.”',
    winLine: '“Patience beats pace. Every time.”',
    loseLine: '“Not bad. Now help me find my glasses.”',
    speed: 9.5, reaction: 0.42, aimError: 2.2, dinkiness: 0.8, aggression: 0.05, lobbiness: 0.1,
    look: { hair: 'bald', glasses: true, h: 0.88, hunch: 1, skin: '#e3c39a' },
  },
  {
    id: 'lisa', name: 'Lob Lisa', color: '#c8a2ff',
    tagline: '“Keep your eyes on the sky.”',
    winLine: '“Gravity is my doubles partner.”',
    loseLine: '“Fine. The sun was in MY eyes.”',
    speed: 11, reaction: 0.35, aimError: 3, dinkiness: 0.25, aggression: 0.1, lobbiness: 0.75,
    look: { hair: 'ponytail', hairColor: '#4a2f1d', h: 1.12, w: 0.82 },
  },
  {
    id: 'bob', name: 'Banger Bob', color: '#ff6b6b',
    tagline: '“Dinking is for cowards. FULL POWER.”',
    winLine: '“BOOM. That\'s the Bob special.”',
    loseLine: '“Whatever. Touch shots are still cheating.”',
    speed: 12, reaction: 0.3, aimError: 2.8, dinkiness: 0, aggression: 0.9, lobbiness: 0,
    look: { hair: 'headband', hairColor: '#3a2a18', w: 1.3, skin: '#e0a075' },
  },
  {
    id: 'stella', name: 'Steady Stella', color: '#7fe0b0',
    tagline: '“No weaknesses. No mercy. No rush.”',
    winLine: '“Consistency is a superpower.”',
    loseLine: '“Well played. I\'ll be recalibrating.”',
    speed: 13, reaction: 0.25, aimError: 2.6, dinkiness: 0.4, aggression: 0.35, lobbiness: 0.15,
    look: { hair: 'ponytail', hairColor: '#1e1a16', skin: '#a06a42', w: 0.95 },
  },
  {
    id: 'kate', name: 'Kitchen Kate', color: '#ffd166',
    tagline: '“Welcome to my kitchen. You won\'t like the menu.”',
    winLine: '“Order up: one soft game, well done.”',
    loseLine: '“Hmph. Stay out of my kitchen.”',
    speed: 13.5, reaction: 0.2, aimError: 2.1, dinkiness: 0.8, aggression: 0.25, lobbiness: 0.1,
    look: { hair: 'headband', hairColor: '#c7842e', h: 0.95, skin: '#edc79b' },
  },
  {
    id: 'mike', name: 'Marathon Mike', color: '#6bd5ff',
    tagline: '“I\'ve never met a ball I couldn\'t reach.”',
    winLine: '“You can\'t outlast the marathon.”',
    loseLine: '“Nice. Same time tomorrow? I\'ll jog there.”',
    speed: 15, reaction: 0.16, aimError: 2.2, dinkiness: 0.3, aggression: 0.3, lobbiness: 0.25,
    look: { hair: 'cap', h: 1.15, w: 0.85, skin: '#8a5a34' },
  },
  {
    id: 'wall', name: 'The Wall', color: '#e8ecea',
    tagline: '“Everything comes back.”',
    winLine: 'The Wall says nothing. The Wall never does.',
    loseLine: 'A single brick falls. Somewhere, thunder.',
    speed: 16, reaction: 0.1, aimError: 1.6, dinkiness: 0.5, aggression: 0.55, lobbiness: 0.1,
    look: { headShape: 'square', h: 1.18, w: 1.4, skin: '#b9c0bd' },
  },
];

// Quick Play difficulties as personality profiles (mirrors the original
// easy/medium/hard tuning).
export const QUICK_PROFILES = {
  easy: {
    name: 'Easy CPU', color: '#ff8a5e',
    speed: 10, reaction: 0.45, aimError: 4, dinkiness: 0.35, aggression: 0.2, lobbiness: 0.2,
  },
  medium: {
    name: 'Medium CPU', color: '#ff8a5e',
    speed: 13, reaction: 0.25, aimError: 3, dinkiness: 0.45, aggression: 0.35, lobbiness: 0.15,
  },
  hard: {
    name: 'Hard CPU', color: '#ff8a5e',
    speed: 15, reaction: 0.12, aimError: 1.8, dinkiness: 0.5, aggression: 0.5, lobbiness: 0.15,
  },
};

const RUNG_KEY = 'pickleball.rung';
let memoryRung = 0;

// Rung n means opponents 0..n-1 are beaten; ROSTER[n] is next.
export function loadRung() {
  try {
    const v = Number(localStorage.getItem(RUNG_KEY));
    if (Number.isInteger(v) && v >= 0 && v <= ROSTER.length) return v;
  } catch { /* storage unavailable */ }
  return memoryRung;
}

export function saveRung(n) {
  memoryRung = n;
  try {
    localStorage.setItem(RUNG_KEY, String(n));
  } catch { /* storage unavailable */ }
}

export function resetLadder() {
  saveRung(0);
}
