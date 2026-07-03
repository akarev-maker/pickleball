// Synthesized SFX and crowd sounds via Web Audio. No asset files.
// Everything no-ops when muted or when AudioContext is unavailable (tests).

const MUTE_KEY = 'pickleball.muted';

let ctx = null;
let muted = loadMuted();

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

// Call on the first user gesture (browsers block audio before interaction).
export function initAudio() {
  if (ctx) return;
  const AC = typeof window !== 'undefined'
    && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  ctx = new AC();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch { /* storage unavailable */ }
  return muted;
}

function ready() {
  if (!ctx || muted) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

// One enveloped oscillator note.
function note(type, startHz, endHz, dur, gainPeak = 0.25, when = 0) {
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startHz, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endHz, 1), t0 + dur);
  g.gain.setValueAtTime(gainPeak, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

// A burst of filtered noise (crowd, net rattle).
function noise(dur, filterHz, q, gainPeak, when = 0, rampUp = 0.05) {
  const t0 = ctx.currentTime + when;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterHz;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(gainPeak, t0 + rampUp);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  // The pickleball "pop": a sharp noise transient plus a quick hollow
  // thump — brighter and louder with power. No tonal beep.
  paddle(power = 0) {
    if (!ready()) return;
    noise(0.05 + power * 0.02, 1500 + power * 900, 1.4, 0.4 + power * 0.2, 0, 0.003);
    note('sine', 210 + power * 120, 85, 0.06, 0.22);
  },
  bounce() {
    if (!ready()) return;
    note('sine', 130, 60, 0.09, 0.16);
  },
  net() {
    if (!ready()) return;
    note('sine', 90, 40, 0.15, 0.2);
    noise(0.12, 900, 1.2, 0.1);
  },
  // Swing and a miss: just air.
  whiff() {
    if (!ready()) return;
    noise(0.12, 700, 0.7, 0.08, 0, 0.02);
  },
  // Overhead smash: the paddle pop scaled up — a hard crack, no beep.
  smash() {
    if (!ready()) return;
    noise(0.09, 2600, 1.2, 0.55, 0, 0.002);
    note('sine', 330, 70, 0.09, 0.3);
  },
  // A soft touch shot: same pop, much gentler.
  dink() {
    if (!ready()) return;
    noise(0.035, 1100, 1.8, 0.18, 0, 0.003);
    note('sine', 260, 140, 0.045, 0.1);
  },
  score() {
    if (!ready()) return;
    note('sine', 660, 660, 0.09, 0.14);
    note('sine', 990, 990, 0.14, 0.12, 0.09);
  },
  // Crowd "oooh" — a low vowel-ish swell.
  ooh() {
    if (!ready()) return;
    noise(0.5, 400, 2.5, 0.14, 0, 0.12);
    noise(0.5, 250, 2, 0.1, 0.02, 0.12);
  },
  // Applause — decaying clatter of noise bursts.
  applause() {
    if (!ready()) return;
    for (let i = 0; i < 10; i++) {
      noise(0.12, 1800 + Math.random() * 1200, 0.8, 0.08 * (1 - i / 12), i * 0.15 + Math.random() * 0.05);
    }
    noise(1.8, 1500, 0.5, 0.06, 0, 0.3);
  },
};
