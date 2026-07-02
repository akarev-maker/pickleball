// Court geometry and rendering. Coordinates are in feet (see rules.js);
// this module maps them to canvas pixels.

import {
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X,
} from './rules.js';

export { COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, CENTER_X };

// Out-of-bounds apron (feet) drawn around the court; players may roam here.
export const MARGIN = 6;

// Sizes canvas to the viewport and returns a view with feet→pixel helpers.
export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const availH = window.innerHeight;
  const availW = window.innerWidth;
  const totalW = COURT_W + MARGIN * 2;
  const totalL = COURT_L + MARGIN * 2;
  const scale = Math.min(availH / totalL, availW / totalW);

  canvas.width = totalW * scale * dpr;
  canvas.height = totalL * scale * dpr;
  canvas.style.width = `${totalW * scale}px`;
  canvas.style.height = `${totalL * scale}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    scale,
    width: totalW * scale,
    height: totalL * scale,
    toPx(x, y) {
      return { px: (x + MARGIN) * scale, py: (y + MARGIN) * scale };
    },
    toCourt(px, py) {
      return { x: px / scale - MARGIN, y: py / scale - MARGIN };
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

export function drawCourt(ctx, view) {
  const { scale } = view;

  // Apron
  ctx.fillStyle = '#2e6b4f';
  ctx.fillRect(0, 0, view.width, view.height);

  // Court surface
  const tl = view.toPx(0, 0);
  ctx.fillStyle = '#3f8ac2';
  ctx.fillRect(tl.px, tl.py, COURT_W * scale, COURT_L * scale);

  // Kitchen tint
  const kt = view.toPx(0, KITCHEN_TOP);
  ctx.fillStyle = '#5aa0d0';
  ctx.fillRect(kt.px, kt.py, COURT_W * scale, (KITCHEN_BOTTOM - KITCHEN_TOP) * scale);

  // Lines
  ctx.strokeStyle = '#f4f7f5';
  ctx.lineWidth = Math.max(2, scale * 0.17);
  ctx.strokeRect(tl.px, tl.py, COURT_W * scale, COURT_L * scale);
  line(ctx, view, 0, KITCHEN_TOP, COURT_W, KITCHEN_TOP);
  line(ctx, view, 0, KITCHEN_BOTTOM, COURT_W, KITCHEN_BOTTOM);
  // Centerlines split the service areas only (not the kitchen)
  line(ctx, view, CENTER_X, 0, CENTER_X, KITCHEN_TOP);
  line(ctx, view, CENTER_X, KITCHEN_BOTTOM, CENTER_X, COURT_L);

  // Net: a dark band with a light tape edge, slightly wider than the court
  const net = view.toPx(-0.8, NET_Y);
  const netW = (COURT_W + 1.6) * scale;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fillRect(net.px, net.py, netW, scale * 0.5); // shadow
  ctx.fillStyle = '#1d2b26';
  ctx.fillRect(net.px, net.py - scale * 0.3, netW, scale * 0.45);
  ctx.fillStyle = '#e8ecea';
  ctx.fillRect(net.px, net.py - scale * 0.3, netW, scale * 0.12);
}
