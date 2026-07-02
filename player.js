// The human player: bottom half of the court.

import { COURT_W, COURT_L, NET_Y, MARGIN } from './court.js';

const SPEED = 16; // ft/s
export const REACH = 2.5; // ft — CPU reach
export const PLAYER_REACH = 3.2; // ft — forgiving: the paddle extends past the body
export const MAX_HIT_HEIGHT = 7; // ft

export class Player {
  constructor() {
    this.x = COURT_W / 2;
    this.y = COURT_L - 4;
    this.dx = 0;
    this.dy = 0;
    this.speedNow = 0;
    this.color = '#ffd75e'; // equipped paddle color
    this.swingT = 0; // seconds left in the swing animation
  }

  update(dt, keys) {
    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    this.dx = dx;
    this.dy = dy;
    this.speedNow = len > 0 ? SPEED : 0;
    this.swingT = Math.max(0, this.swingT - dt);
    this.x += dx * SPEED * dt;
    this.y += dy * SPEED * dt;
    // Confined to own half plus a slim apron (stays in frame in both
    // camera views); can't cross the net.
    this.x = Math.max(-3, Math.min(COURT_W + 3, this.x));
    this.y = Math.max(NET_Y + 1.2, Math.min(COURT_L + 3.5, this.y));
  }

  moveDir() {
    return { dx: this.dx, dy: this.dy };
  }

  canReach(ball) {
    return Math.hypot(ball.x - this.x, ball.y - this.y) < PLAYER_REACH
      && ball.z < MAX_HIT_HEIGHT;
  }

  draw(ctx, view) {
    drawFigure(ctx, view, this.x, this.y, this.color, -1, this.swingT);
  }
}

// Shared by player and CPU.
// facing: -1 = seen from behind (bottom side), +1 = facing the viewer (top).
// swingT: seconds remaining in the swing animation (0 = at rest).
const SWING_TIME = 0.28;

export function drawFigure(ctx, view, x, y, color, facing, swingT = 0) {
  const p = view.toPx(x, y);
  // 0 at rest, sweeps 0→1→0 through the stroke.
  const sweep = swingT > 0 ? Math.sin((1 - swingT / SWING_TIME) * Math.PI) : 0;

  if (view.mode === '3d') {
    // Readability floor: far players never shrink into dots.
    const s = Math.max(view.scaleAt(y), view.scale * 0.55);
    // Shadow on the court
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.px, p.py, s * 0.75, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = '#2b3a33';
    ctx.lineWidth = Math.max(2, s * 0.24);
    for (const lx of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.moveTo(p.px + lx * s, p.py - s * 0.9);
      ctx.lineTo(p.px + lx * s * 1.2, p.py);
      ctx.stroke();
    }
    // Body (jersey)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.px, p.py - s * 1.5, s * 0.62, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(p.px, p.py - s * 2.7, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // Arm + paddle on the racket side; the stroke sweeps across the body.
    const side = facing === -1 ? 1 : -1;
    const armAngle = 0.35 - 2.1 * sweep; // radians below horizontal at rest
    const armLen = s * (0.95 + 0.25 * sweep);
    const shx = p.px + side * s * 0.45;
    const shy = p.py - s * 1.8;
    const hx = shx + side * Math.cos(armAngle) * armLen;
    const hy = shy + Math.sin(armAngle) * armLen * 0.55;
    ctx.strokeStyle = '#e8b98a';
    ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(shx, shy);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = '#7a4a2b';
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + side * s * 0.2, hy - s * 0.35);
    ctx.stroke();
    ctx.fillStyle = '#31456b';
    ctx.beginPath();
    ctx.ellipse(
      hx + side * s * 0.28,
      hy - s * 0.7,
      s * 0.32,
      s * 0.42,
      side * (0.4 + 1.4 * sweep),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    return;
  }

  // Top-down: circle body with a paddle dot on the net side.
  const scale = view.scaleAt(y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(p.px, p.py + scale * 0.35, scale * 0.75, scale * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.px, p.py, scale * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#3a2c1e';
  const dotAngle = Math.atan2(facing * 0.55, 0.65) - sweep * 2.2 * facing;
  ctx.beginPath();
  ctx.arc(
    p.px + Math.cos(dotAngle) * scale * 0.85,
    p.py + Math.sin(dotAngle) * scale * 0.85,
    scale * 0.32,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}
