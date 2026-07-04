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
];

let backdrop = BACKDROPS[0];

export function setBackdrop(id) {
  backdrop = BACKDROPS.find((t) => t.id === id) || BACKDROPS[0];
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

// Sky decorations for the 3D view, one per theme. All positions derive
// from the viewport and deterministic math — nothing flickers frame to frame.
function drawDeco(ctx, view) {
  const h = view.horizon;
  if (backdrop.deco === 'sun') {
    // A low sun sinking into the horizon, with a soft glow.
    const sx = view.width * 0.72;
    const sy = h * 0.82;
    const glow = ctx.createRadialGradient(sx, sy, h * 0.08, sx, sy, h * 0.9);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
    glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, view.width, h + 2);
    ctx.fillStyle = '#ffd68c';
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (backdrop.deco === 'stars') {
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
    // A gibbous moon.
    ctx.fillStyle = '#e8ecd8';
    ctx.beginPath();
    ctx.arc(view.width * 0.78, h * 0.32, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = backdrop.skyTop;
    ctx.beginPath();
    ctx.arc(view.width * 0.78 - h * 0.035, h * 0.3, h * 0.075, 0, Math.PI * 2);
    ctx.fill();
  } else if (backdrop.deco === 'sea') {
    // A band of ocean just above the horizon.
    const top = h * 0.8;
    const sea = ctx.createLinearGradient(0, top, 0, h + 2);
    sea.addColorStop(0, '#4f9ec4');
    sea.addColorStop(1, '#78b8d6');
    ctx.fillStyle = sea;
    ctx.fillRect(0, top, view.width, h + 2 - top);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, top, view.width, 1.5);
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
  } else {
    ctx.fillStyle = backdrop.top;
    ctx.fillRect(0, 0, view.width, view.height);
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
  ctx.fillStyle = '#79c2e9';
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
    // White tape along the top, sturdy posts at the ends.
    ctx.fillStyle = '#e8ecea';
    ctx.fillRect(l.px, l.py - top, r.px - l.px, Math.max(2, top * 0.09));
    ctx.strokeStyle = '#cfd8d3';
    ctx.lineWidth = 3;
    for (const p of [l, r]) {
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.px, p.py - top);
      ctx.stroke();
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
  }
}
