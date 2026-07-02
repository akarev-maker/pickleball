// The human player: bottom half of the court.

import { COURT_W, COURT_L, NET_Y, MARGIN } from './court.js';

const SPEED = 16; // ft/s
export const REACH = 2.5; // ft
export const MAX_HIT_HEIGHT = 7; // ft

export class Player {
  constructor() {
    this.x = COURT_W / 2;
    this.y = COURT_L - 4;
    this.dx = 0;
    this.dy = 0;
    this.speedNow = 0;
    this.color = '#ffd75e'; // equipped paddle color
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
    return Math.hypot(ball.x - this.x, ball.y - this.y) < REACH
      && ball.z < MAX_HIT_HEIGHT;
  }

  draw(ctx, view) {
    drawFigure(ctx, view, this.x, this.y, this.color, -1);
  }
}

// Shared by player and CPU: a circle body with a paddle dot on the net side.
// facing: -1 draws the paddle above (toward the net for the player),
// +1 below (toward the net for the CPU).
export function drawFigure(ctx, view, x, y, color, facing) {
  const scale = view.scaleAt(y);
  const p = view.toPx(x, y);
  // In the 3D view the body stands on the court instead of lying on it.
  const lift = view.mode === '3d' ? scale * 1.1 : 0;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(p.px, p.py + (lift ? 0 : scale * 0.35), scale * 0.75, scale * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  if (lift) {
    ctx.ellipse(p.px, p.py - lift, scale * 0.8, scale * 1.1, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(p.px, p.py, scale * 0.8, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#3a2c1e';
  ctx.beginPath();
  ctx.arc(p.px + scale * 0.65, p.py - lift + facing * scale * 0.55, scale * 0.32, 0, Math.PI * 2);
  ctx.fill();
}
