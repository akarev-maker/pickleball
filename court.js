// Court geometry and rendering. Coordinates are in feet (see rules.js);
// a view maps them to canvas pixels. Two views exist: classic top-down and
// a pseudo-3D perspective from behind the player. Both expose the same
// interface: toPx(x, y) ground position, scaleAt(y) pixels-per-foot at that
// depth, zOffset(y, z) vertical pixel offset for height, toCourt(px, py).

import {
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X,
} from './rules.js';

export { COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X };

// Out-of-bounds apron (feet) drawn around the court; players may roam here.
export const MARGIN = 6;

// Selectable background themes. Visual tokens live here with the drawing
// code; the Locker lists them via progress.js. `swatch` is the picker dot.
export const BACKDROPS = [
  {
    id: 'classic', name: 'Club Green', swatch: '#2e6b4f',
    top: '#2e6b4f', skyTop: '#0e1713', skyBottom: '#27443a', ground: '#2e6b4f', deco: null,
  },
  {
    id: 'sunset', name: 'Golden Hour', swatch: '#ff9a5e',
    top: '#4a6247', skyTop: '#2b1a3a', skyBottom: '#ff9a5e', ground: '#3f5a44', deco: 'sun',
  },
  {
    id: 'night', name: 'Night Match', swatch: '#101b33',
    top: '#22303c', skyTop: '#05070f', skyBottom: '#101b33', ground: '#24313f', deco: 'stars',
  },
  {
    id: 'sand', name: 'Beachside', swatch: '#d9c07e',
    top: '#d3b874', skyTop: '#7fc4de', skyBottom: '#eadfa9', ground: '#d9c07e', deco: 'sea',
  },
  {
    id: 'synthwave', name: 'Neon Grid', swatch: '#ff4f9e',
    top: '#1a0b33', skyTop: '#0b0221', skyBottom: '#2d0a4e', ground: '#14062e', deco: 'synthwave',
  },
  {
    id: 'aurora', name: 'Northern Lights', swatch: '#3dffb0',
    top: '#8799a7', skyTop: '#020714', skyBottom: '#0a1a2e', ground: '#8599a9', deco: 'aurora',
  },
  {
    id: 'stadium', name: 'Championship Night', swatch: '#f2c14e',
    top: '#262c34', skyTop: '#05070a', skyBottom: '#10151c', ground: '#2a3038', deco: 'stadium',
  },
  {
    id: 'sakura', name: 'Hanami', swatch: '#ffb3c9',
    top: '#63845a', skyTop: '#ffd9e8', skyBottom: '#ffb3c9', ground: '#6f8f5e', deco: 'sakura',
  },
];

let backdrop = BACKDROPS[0];

export function setBackdrop(id) {
  backdrop = BACKDROPS.find((t) => t.id === id) || BACKDROPS[0];
}

// Animation clock: real time in the browser, frozen at 0 under
// prefers-reduced-motion and in headless tests (no matchMedia), so every
// scene also composes as a still image.
const ANIMATE = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;
const clock = () => (ANIMATE ? performance.now() / 1000 : 0);

// Deterministic pseudo-random in [0, 1): same n, same value, every frame.
function hash(n) {
  return (((Math.sin(n * 127.1) * 43758.5453) % 1) + 1) % 1;
}

export const NET_HEIGHT = 3; // ft

// Classifies one frame of ball travel against the net plane. Returns null
// when the net is not in play (no crossing, or cleared the tape), 'around'
// when the ball crossed below tape height but outside the posts (an
// around-the-post shot — legal), or 'contact' with the interpolated height.
// Posts sit 0.8 ft outside the sidelines; 0.9 adds the ball's radius.
export function netCrossing(prev, cur, left = 0, right = COURT_W) {
  if ((prev.y - NET_Y) * (cur.y - NET_Y) >= 0) return null;
  const f = (NET_Y - prev.y) / (cur.y - prev.y);
  const zAtNet = prev.z + (cur.z - prev.z) * f;
  if (zAtNet >= NET_HEIGHT) return null;
  const xAtNet = prev.x + (cur.x - prev.x) * f;
  if (xAtNet < left - 0.9 || xAtNet > right + 0.9) return { kind: 'around', zAtNet };
  return { kind: 'contact', zAtNet };
}

// Sizes canvas to the viewport and returns a view for the requested mode.
export function setupCanvas(canvas, mode = 'top') {
  const dpr = window.devicePixelRatio || 1;
  const availH = window.innerHeight;
  const availW = window.innerWidth;
  const totalW = COURT_W + MARGIN * 2;
  const totalL = COURT_L + MARGIN * 2;
  // Top-down fits the court's aspect; the 3D view fills the whole viewport.
  let scale;
  let width;
  let height;
  if (mode === '3d') {
    width = availW;
    height = availH;
    scale = availH / totalL;
  } else {
    scale = Math.min(availH / totalL, availW / totalW);
    width = totalW * scale;
    height = totalL * scale;
  }

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (mode === '3d') return perspectiveView(ctx, scale, width, height);

  return {
    mode: 'top',
    ctx,
    scale,
    width,
    height,
    toPx(x, y) {
      return { px: (x + MARGIN) * scale, py: (y + MARGIN) * scale };
    },
    scaleAt() {
      return scale;
    },
    zOffset(y, z) {
      return z * scale * 0.7;
    },
    toCourt(px, py) {
      return { x: px / scale - MARGIN, y: py / scale - MARGIN };
    },
  };
}

// Pinhole camera behind and above the player's baseline, looking up-court.
// Ground-plane projection is a projective map, so straight lines stay
// straight and the mouse inverse is exact.
function perspectiveView(ctx, scale, width, height) {
  const CAM_Y = COURT_L + 20; // camera position behind the baseline (ft)
  const CAM_H = 26; // camera height (ft)
  const FK = 29 * scale; // focal constant: scaleAt(y) = FK / (CAM_Y - y)
  const horizon = height * 0.12;

  const scaleAt = (y) => FK / Math.max(CAM_Y - y, 4);

  return {
    mode: '3d',
    ctx,
    scale,
    width,
    height,
    horizon,
    scaleAt,
    toPx(x, y) {
      const s = scaleAt(y);
      return { px: width / 2 + (x - CENTER_X) * s, py: horizon + CAM_H * s };
    },
    zOffset(y, z) {
      return z * scaleAt(y) * 0.9;
    },
    toCourt(px, py) {
      const s = Math.max((py - horizon) / CAM_H, FK / (CAM_Y + MARGIN));
      return { x: CENTER_X + (px - width / 2) / s, y: CAM_Y - FK / s };
    },
  };
}

// A shared starfield: deterministic positions, subtle brightness spread.
function starField(ctx, view, h) {
  ctx.fillStyle = 'rgba(238, 244, 255, 0.9)';
  for (let i = 0; i < 46; i++) {
    const sx = (((i * 137.508) % 97) / 97) * view.width;
    const sy = (((i * 61.803) % 89) / 89) * h * 0.85;
    const r = 0.6 + ((i * 7) % 10) / 9;
    ctx.globalAlpha = 0.35 + ((i * 13) % 10) / 15;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Sky decorations for the 3D view, one scene per theme. Positions are
// deterministic; motion comes only from the clock, so nothing flickers.
function drawDeco(ctx, view) {
  const h = view.horizon;
  const w = view.width;
  const t = clock();

  if (backdrop.deco === 'sun') {
    // A low sun sinking into the horizon, with a soft glow.
    const sx = w * 0.72;
    const sy = h * 0.82;
    const glow = ctx.createRadialGradient(sx, sy, h * 0.08, sx, sy, h * 0.9);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
    glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h + 2);
    ctx.fillStyle = '#ffd68c';
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (backdrop.deco === 'stars') {
    starField(ctx, view, h);
    // A gibbous moon.
    ctx.fillStyle = '#e8ecd8';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.32, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = backdrop.skyTop;
    ctx.beginPath();
    ctx.arc(w * 0.78 - h * 0.035, h * 0.3, h * 0.075, 0, Math.PI * 2);
    ctx.fill();
  } else if (backdrop.deco === 'sea') {
    // A band of ocean just above the horizon.
    const top = h * 0.8;
    const sea = ctx.createLinearGradient(0, top, 0, h + 2);
    sea.addColorStop(0, '#4f9ec4');
    sea.addColorStop(1, '#78b8d6');
    ctx.fillStyle = sea;
    ctx.fillRect(0, top, w, h + 2 - top);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, top, w, 1.5);
  } else if (backdrop.deco === 'synthwave') {
    // The retro sun: a hot gradient disc with widening gaps toward its
    // base, half-sunk behind the skyline. Offset from center so it never
    // sits directly behind the score bar.
    const sx = w * 0.67;
    const sy = h * 0.7;
    const r = h * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.clip();
    const g = ctx.createLinearGradient(0, sy - r, 0, sy + r);
    g.addColorStop(0, '#ffd85f');
    g.addColorStop(0.55, '#ff8d5f');
    g.addColorStop(1, '#ff4f9e');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    ctx.fillStyle = backdrop.skyBottom;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(sx - r, sy + r * (0.02 + i * 0.16), r * 2, 1.5 + i * 1.7);
    }
    ctx.restore();
    // City skyline with a scatter of lit windows.
    ctx.fillStyle = '#160726';
    let x = 0;
    let i = 0;
    while (x < w) {
      const bw = 16 + hash(i) * 30;
      const bh = h * (0.05 + hash(i + 40) * 0.2);
      ctx.fillRect(x, h - bh + 2, bw + 1, bh);
      for (let k = 0; k < 3; k++) {
        if (hash(i * 9 + k) < 0.45) continue;
        ctx.fillStyle = k % 2 ? 'rgba(94, 233, 255, 0.6)' : 'rgba(255, 95, 158, 0.65)';
        ctx.fillRect(
          x + 2 + hash(i * 13 + k) * (bw - 5),
          h - bh + 4 + hash(i * 17 + k) * (bh - 8),
          1.6,
          2.4,
        );
        ctx.fillStyle = '#160726';
      }
      x += bw;
      i++;
    }
  } else if (backdrop.deco === 'aurora') {
    starField(ctx, view, h);
    // Aurora: three ribbons, each stroked in three widths for a soft
    // glow, drifting on layered sine waves. Additive blending keeps
    // overlaps luminous.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const colors = ['61, 255, 176', '77, 208, 255', '176, 124, 255'];
    for (let rb = 0; rb < 3; rb++) {
      const baseY = h * (0.22 + rb * 0.15);
      for (const [lw, alpha] of [[26, 0.05], [13, 0.09], [5, 0.16]]) {
        ctx.strokeStyle = `rgba(${colors[rb]}, ${alpha})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 24) {
          const y = baseY
            + Math.sin(x * 0.006 + t * (0.35 + rb * 0.12) + rb * 2.1) * h * 0.1
            + Math.sin(x * 0.017 + t * 0.7 + rb) * h * 0.03;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  } else if (backdrop.deco === 'stadium') {
    // Two banked tiers of crowd under a black arena ceiling.
    for (const [top, bot] of [[0.3, 0.62], [0.68, 0.97]]) {
      ctx.fillStyle = '#10151d';
      ctx.fillRect(0, h * top, w, h * (bot - top));
      for (let row = 0; row < 3; row++) {
        const y = h * (top + (bot - top) * ((row + 0.6) / 3));
        for (let x = 6; x < w; x += 13) {
          const i = x * 7 + row * 131;
          ctx.fillStyle = `rgba(${140 + ((hash(i) * 60) | 0)}, ${130 + ((hash(i + 3) * 50) | 0)}, ${125 + ((hash(i + 9) * 60) | 0)}, 0.5)`;
          ctx.beginPath();
          ctx.arc(x + hash(i + 1) * 6, y + hash(i + 2) * 4, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Floodlight banks.
    for (const fx of [0.14, 0.86]) {
      const lx = w * fx;
      const ly = h * 0.13;
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(lx - 26, ly - 9, 52, 15);
      ctx.fillStyle = 'rgba(255, 244, 200, 0.95)';
      for (let b = 0; b < 4; b++) {
        ctx.beginPath();
        ctx.arc(lx - 18 + b * 12, ly, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Camera flashes popping in the stands.
    const tick = Math.floor(t * 6);
    for (let i = 0; i < 4; i++) {
      const s = hash(tick * 17 + i * 53);
      if (s < 0.5) continue;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + s * 0.4})`;
      ctx.beginPath();
      ctx.arc(
        hash(tick * 29 + i * 97) * w,
        h * (0.32 + hash(tick * 41 + i * 13) * 0.6),
        1.6 + s * 1.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  } else if (backdrop.deco === 'sakura') {
    // A pale spring sun and Mount Fuji on the horizon.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.28, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
    const mx = w * 0.78;
    const base = h + 2;
    const peak = h * 0.12;
    const half = w * 0.24;
    ctx.fillStyle = '#8494b8';
    ctx.beginPath();
    ctx.moveTo(mx - half, base);
    ctx.lineTo(mx, peak);
    ctx.lineTo(mx + half, base);
    ctx.closePath();
    ctx.fill();
    // Snowcap with a notched melt line.
    const capBase = peak + (base - peak) * 0.3;
    const capHalf = half * 0.32;
    ctx.fillStyle = '#f4f7fb';
    ctx.beginPath();
    ctx.moveTo(mx, peak);
    ctx.lineTo(mx - capHalf, capBase);
    ctx.lineTo(mx - capHalf * 0.5, capBase - h * 0.03);
    ctx.lineTo(mx - capHalf * 0.15, capBase);
    ctx.lineTo(mx + capHalf * 0.25, capBase - h * 0.035);
    ctx.lineTo(mx + capHalf * 0.6, capBase - h * 0.01);
    ctx.lineTo(mx + capHalf, capBase);
    ctx.closePath();
    ctx.fill();
    // Petals drifting across the sky on the breeze.
    for (let i = 0; i < 26; i++) {
      const px = (((hash(i * 3) * w + t * (14 + hash(i) * 20)) % (w + 30)) + (w + 30)) % (w + 30) - 15;
      const py = ((hash(i * 7) * h + t * (8 + hash(i + 5) * 10)) % (h * 0.96) + h * 0.96) % (h * 0.96);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * (0.8 + hash(i + 11)) + i);
      ctx.fillStyle = `rgba(255, 182, 205, ${0.65 + hash(i + 13) * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// Ground-level decoration, drawn after the ground fill and before the court
// surface (which paints over the middle) — so it lives on the apron.
function drawGroundDeco(ctx, view) {
  const h = view.horizon;
  const w = view.width;
  const t = clock();

  if (backdrop.deco === 'synthwave') {
    // The scrolling perspective grid: scan lines accelerate toward the
    // viewer, rays fan out from the vanishing point.
    ctx.strokeStyle = 'rgba(255, 79, 158, 0.3)';
    ctx.lineWidth = 1.5;
    const gh = view.height - h;
    const phase = (t * 0.6) % 1;
    for (let k = 0; k < 14; k++) {
      const f = (k + phase) / 14;
      const y = h + gh * f * f;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(94, 233, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let j = -9; j <= 9; j++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + j * w * 0.02, h);
      ctx.lineTo(w / 2 + j * w * 0.13, view.height);
      ctx.stroke();
    }
  } else if (backdrop.deco === 'aurora') {
    // The aurora reflects faintly off the snow below the horizon.
    const glow = ctx.createLinearGradient(0, h, 0, h + (view.height - h) * 0.6);
    glow.addColorStop(0, 'rgba(61, 255, 176, 0.16)');
    glow.addColorStop(1, 'rgba(61, 255, 176, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, h, w, (view.height - h) * 0.6);
  } else if (backdrop.deco === 'stadium') {
    // Floodlight beams wash down across the apron toward the court.
    ctx.fillStyle = 'rgba(255, 244, 200, 0.05)';
    for (const fx of [0.14, 0.86]) {
      ctx.beginPath();
      ctx.moveTo(w * fx, h * 0.13);
      ctx.lineTo(w * (fx < 0.5 ? 0.62 : 0.38), view.height);
      ctx.lineTo(w * (fx < 0.5 ? 0.16 : 0.84), view.height);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Top-down flourish: only themes whose signature survives shrinking to a
// flat backdrop get one — everything else stays a clean palette.
function drawTopDeco(ctx, view) {
  if (backdrop.deco !== 'synthwave') return;
  ctx.strokeStyle = 'rgba(255, 95, 158, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < view.width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, view.height);
    ctx.stroke();
  }
  for (let y = 0; y < view.height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(view.width, y);
    ctx.stroke();
  }
}

function line(ctx, view, x1, y1, x2, y2) {
  const a = view.toPx(x1, y1);
  const b = view.toPx(x2, y2);
  ctx.beginPath();
  ctx.moveTo(a.px, a.py);
  ctx.lineTo(b.px, b.py);
  ctx.stroke();
}

function quad(ctx, view, x1, y1, x2, y2) {
  // Filled ground rectangle (a trapezoid under perspective).
  const a = view.toPx(x1, y1);
  const b = view.toPx(x2, y1);
  const c = view.toPx(x2, y2);
  const d = view.toPx(x1, y2);
  ctx.beginPath();
  ctx.moveTo(a.px, a.py);
  ctx.lineTo(b.px, b.py);
  ctx.lineTo(c.px, c.py);
  ctx.lineTo(d.px, d.py);
  ctx.closePath();
  ctx.fill();
}

// left/right narrow the court for skinny singles (default: full width).
export function drawCourt(ctx, view, left = 0, right = COURT_W) {
  // Apron / backdrop
  if (view.mode === '3d') {
    // Themed sky gradient down to the horizon, plus the theme's decoration.
    const sky = ctx.createLinearGradient(0, 0, 0, view.horizon);
    sky.addColorStop(0, backdrop.skyTop);
    sky.addColorStop(1, backdrop.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, view.horizon + 2);
    drawDeco(ctx, view);
    ctx.fillStyle = backdrop.ground;
    ctx.fillRect(0, view.horizon + 2, view.width, view.height);
    drawGroundDeco(ctx, view);
  } else {
    ctx.fillStyle = backdrop.top;
    ctx.fillRect(0, 0, view.width, view.height);
    drawTopDeco(ctx, view);
    // A darker apron frames the playing surface (the court fills paint
    // over the middle), plus a soft vignette so the edges recede.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
    quad(ctx, view, left - 2.5, -2.5, right + 2.5, COURT_L + 2.5);
    const vg = ctx.createRadialGradient(
      view.width / 2, view.height / 2, Math.min(view.width, view.height) * 0.45,
      view.width / 2, view.height / 2, Math.max(view.width, view.height) * 0.8,
    );
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  // Court surface + a clearly distinct kitchen (non-volley zone)
  ctx.fillStyle = '#3f8ac2';
  quad(ctx, view, left, 0, right, COURT_L);
  // Light enough to read as a distinct zone, dark enough that the white
  // kitchen lines keep contrast against it (they vanish on paler fills).
  ctx.fillStyle = '#66aeda';
  quad(ctx, view, left, KITCHEN_TOP, right, KITCHEN_BOTTOM);

  // Lines
  ctx.strokeStyle = '#f4f7f5';
  ctx.lineWidth = Math.max(2, view.scale * 0.17);
  line(ctx, view, left, 0, right, 0);
  line(ctx, view, left, COURT_L, right, COURT_L);
  line(ctx, view, left, 0, left, COURT_L);
  line(ctx, view, right, 0, right, COURT_L);
  // Kitchen lines drawn heavier — they matter.
  ctx.lineWidth = Math.max(3, view.scale * 0.24);
  line(ctx, view, left, KITCHEN_TOP, right, KITCHEN_TOP);
  line(ctx, view, left, KITCHEN_BOTTOM, right, KITCHEN_BOTTOM);
  ctx.lineWidth = Math.max(2, view.scale * 0.17);
  // Centerlines split the service areas only (skinny has a single box)
  if (right - left === COURT_W) {
    line(ctx, view, CENTER_X, 0, CENTER_X, KITCHEN_TOP);
    line(ctx, view, CENTER_X, KITCHEN_BOTTOM, CENTER_X, COURT_L);
  }
}

// Drawn separately so the 3D view can depth-sort it against entities
// (far-side players go behind the net, near-side in front).
export function drawNet(ctx, view, left = 0, right = COURT_W) {
  if (view.mode === '3d') {
    // A standing mesh band between the posts: translucent with visible
    // strands so it reads as a net, not a wall.
    const l = view.toPx(left - 0.8, NET_Y);
    const r = view.toPx(right + 0.8, NET_Y);
    const top = view.zOffset(NET_Y, 3);
    ctx.fillStyle = 'rgba(20, 30, 26, 0.45)';
    ctx.fillRect(l.px, l.py - top, r.px - l.px, top);
    // Mesh: vertical strands every ~1.2 ft plus a mid strand.
    ctx.strokeStyle = 'rgba(232, 236, 234, 0.3)';
    ctx.lineWidth = 1;
    const strands = Math.round((right - left + 1.6) / 1.2);
    const step = (r.px - l.px) / strands;
    for (let x = l.px + step; x < r.px - 1; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, l.py - top);
      ctx.lineTo(x, l.py);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(l.px, l.py - top * 0.5);
    ctx.lineTo(r.px, r.py - top * 0.5);
    ctx.stroke();
    // White tape along the top, sturdy posts at the ends: planted a touch
    // into the ground, capped with a knob.
    ctx.fillStyle = '#e8ecea';
    ctx.fillRect(l.px, l.py - top, r.px - l.px, Math.max(2, top * 0.09));
    ctx.strokeStyle = '#aab6b0';
    ctx.lineWidth = 4.5;
    for (const p of [l, r]) {
      ctx.beginPath();
      ctx.moveTo(p.px, p.py + 3);
      ctx.lineTo(p.px, p.py - top - 2);
      ctx.stroke();
      ctx.fillStyle = '#e8ecea';
      ctx.beginPath();
      ctx.arc(p.px, p.py - top - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const net = view.toPx(left - 0.8, NET_Y);
    const netW = (right - left + 1.6) * view.scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(net.px, net.py, netW, view.scale * 0.5);
    ctx.fillStyle = '#1d2b26';
    ctx.fillRect(net.px, net.py - view.scale * 0.3, netW, view.scale * 0.45);
    ctx.fillStyle = '#e8ecea';
    ctx.fillRect(net.px, net.py - view.scale * 0.3, netW, view.scale * 0.12);
    // Posts anchor the net at each end.
    for (const px of [net.px, net.px + netW]) {
      ctx.fillStyle = '#aab6b0';
      ctx.beginPath();
      ctx.arc(px, net.py, view.scale * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}
