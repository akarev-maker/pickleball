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

// Sizes canvas to the viewport and returns a view for the requested mode.
export function setupCanvas(canvas, mode = 'top') {
  const dpr = window.devicePixelRatio || 1;
  const availH = window.innerHeight;
  const availW = window.innerWidth;
  const totalW = COURT_W + MARGIN * 2;
  const totalL = COURT_L + MARGIN * 2;
  const scale = Math.min(availH / totalL, availW / totalW);
  const width = totalW * scale;
  const height = totalL * scale;

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
  const CAM_Y = COURT_L + 18; // camera position behind the baseline (ft)
  const CAM_H = 26; // camera height (ft)
  const FK = 27 * scale; // focal constant: scaleAt(y) = FK / (CAM_Y - y)
  const horizon = height * 0.16;

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

export function drawCourt(ctx, view) {
  // Apron / backdrop
  if (view.mode === '3d') {
    ctx.fillStyle = '#16211c'; // sky above the horizon
    ctx.fillRect(0, 0, view.width, view.horizon + 2);
    ctx.fillStyle = '#2e6b4f';
    ctx.fillRect(0, view.horizon + 2, view.width, view.height);
  } else {
    ctx.fillStyle = '#2e6b4f';
    ctx.fillRect(0, 0, view.width, view.height);
  }

  // Court surface + kitchen tint
  ctx.fillStyle = '#3f8ac2';
  quad(ctx, view, 0, 0, COURT_W, COURT_L);
  ctx.fillStyle = '#5aa0d0';
  quad(ctx, view, 0, KITCHEN_TOP, COURT_W, KITCHEN_BOTTOM);

  // Lines
  ctx.strokeStyle = '#f4f7f5';
  ctx.lineWidth = Math.max(2, view.scale * 0.17);
  line(ctx, view, 0, 0, COURT_W, 0);
  line(ctx, view, 0, COURT_L, COURT_W, COURT_L);
  line(ctx, view, 0, 0, 0, COURT_L);
  line(ctx, view, COURT_W, 0, COURT_W, COURT_L);
  line(ctx, view, 0, KITCHEN_TOP, COURT_W, KITCHEN_TOP);
  line(ctx, view, 0, KITCHEN_BOTTOM, COURT_W, KITCHEN_BOTTOM);
  // Centerlines split the service areas only (not the kitchen)
  line(ctx, view, CENTER_X, 0, CENTER_X, KITCHEN_TOP);
  line(ctx, view, CENTER_X, KITCHEN_BOTTOM, CENTER_X, COURT_L);

}

// Drawn separately so the 3D view can depth-sort it against entities
// (far-side players go behind the net, near-side in front).
export function drawNet(ctx, view) {
  if (view.mode === '3d') {
    // A standing mesh band between the posts.
    const l = view.toPx(-0.8, NET_Y);
    const r = view.toPx(COURT_W + 0.8, NET_Y);
    const top = view.zOffset(NET_Y, 3);
    ctx.fillStyle = 'rgba(20, 30, 26, 0.82)';
    ctx.fillRect(l.px, l.py - top, r.px - l.px, top);
    ctx.fillStyle = '#e8ecea';
    ctx.fillRect(l.px, l.py - top, r.px - l.px, Math.max(2, top * 0.09));
    ctx.strokeStyle = 'rgba(232, 236, 234, 0.85)';
    ctx.lineWidth = 2;
    for (const p of [l, r]) {
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.px, p.py - top);
      ctx.stroke();
    }
  } else {
    const net = view.toPx(-0.8, NET_Y);
    const netW = (COURT_W + 1.6) * view.scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(net.px, net.py, netW, view.scale * 0.5);
    ctx.fillStyle = '#1d2b26';
    ctx.fillRect(net.px, net.py - view.scale * 0.3, netW, view.scale * 0.45);
    ctx.fillStyle = '#e8ecea';
    ctx.fillRect(net.px, net.py - view.scale * 0.3, netW, view.scale * 0.12);
  }
}
