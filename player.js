// The human player: bottom half of the court.

import { COURT_W, COURT_L, NET_Y, MARGIN } from './court.js';

const SPEED = 17.5; // ft/s (scaled with the widened court)
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
    this.walk = 0; // stride phase, advances with distance covered
    this.idle = Math.random() * 10; // breathing phase, desynced per figure
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
    this.idle += dt;
    this.walk += this.speedNow * dt * 1.5;
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

  gait() {
    return { walk: this.walk, idle: this.idle, moving: this.speedNow > 1 };
  }

  draw(ctx, view) {
    drawFigure(ctx, view, this.x, this.y, this.color, -1, this.swingT, this.gait());
  }
}

// Shared by player and CPU.
// facing: -1 = seen from behind (bottom side), +1 = facing the viewer (top).
// swingT: seconds remaining in the swing animation (0 = at rest).
// gait: { walk, idle, moving } — stride phase, breathing phase, in motion.
const SWING_TIME = 0.28;

// The stroke: a windup pulling the paddle back, then the whip through
// the ball. Ranges -0.6 (backswing) → 1 (full extension) → 0.
function swingCurve(swingT) {
  if (swingT <= 0) return 0;
  const phase = 1 - swingT / SWING_TIME;
  return phase < 0.3
    ? -(phase / 0.3) * 0.6
    : Math.sin(((phase - 0.3) / 0.7) * Math.PI);
}

export function drawFigure(ctx, view, x, y, color, facing, swingT = 0, gait = null) {
  const p = view.toPx(x, y);
  const sweep = swingCurve(swingT);
  const moving = !!(gait && gait.moving);
  // Standing figures breathe; running ones bounce with their stride.
  const idleSway = gait ? Math.sin(gait.idle * 2.2) : 0;

  if (view.mode === '3d') {
    // Readability floor: far players never shrink into dots.
    const s = Math.max(view.scaleAt(y), view.scale * 0.66);
    const bob = moving
      ? Math.abs(Math.sin(gait.walk)) * s * 0.15
      : idleSway * s * 0.055;
    // Shadow on the court
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.px, p.py, s * 0.75, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs: scissor while moving, planted when still.
    ctx.strokeStyle = '#2b3a33';
    ctx.lineWidth = Math.max(2, s * 0.24);
    for (let i = 0; i < 2; i++) {
      const lx = i === 0 ? -0.3 : 0.3;
      const stride = moving ? Math.sin(gait.walk + i * Math.PI) : 0;
      ctx.beginPath();
      ctx.moveTo(p.px + lx * s, p.py - s * 0.9 - bob);
      ctx.lineTo(
        p.px + (lx * 1.2 + stride * 0.42) * s,
        p.py - Math.max(0, stride) * s * 0.3,
      );
      ctx.stroke();
    }
    // Free arm counter-swings on the run, hangs loose otherwise.
    const side = facing === -1 ? 1 : -1;
    const shy = p.py - s * 1.8 - bob;
    const offAngle = 0.95 + (moving ? Math.sin(gait.walk) * 0.75 : idleSway * 0.12);
    ctx.strokeStyle = '#e8b98a';
    ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(p.px - side * s * 0.45, shy);
    ctx.lineTo(
      p.px - side * (s * 0.45 + Math.cos(offAngle) * s * 0.75),
      shy + Math.sin(offAngle) * s * 0.55,
    );
    ctx.stroke();
    // Body (jersey)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.px, p.py - s * 1.5 - bob, s * 0.62, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(p.px, p.py - s * 2.7 - bob, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // Arm + paddle on the racket side; the stroke winds up, then sweeps
    // across the body. At rest it sways gently; on the run it pumps.
    const armSway = swingT > 0 ? 0
      : (moving ? Math.sin(gait.walk + Math.PI) * 0.3 : idleSway * 0.1);
    const armAngle = 0.35 - 2.1 * sweep + armSway;
    // The arm bends into the windup (sweep < 0) and extends through the hit.
    const armLen = s * (0.95 + 0.3 * sweep);
    const shx = p.px + side * s * 0.45;
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

  // Top-down: circle body with a paddle held out on the net side.
  const scale = view.scaleAt(y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(p.px, p.py + scale * 0.35, scale * 0.75, scale * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet peek out on the baseline side and scissor while moving.
  if (gait) {
    const step = moving ? Math.sin(gait.walk) : 0;
    ctx.fillStyle = '#4a3826';
    for (let i = 0; i < 2; i++) {
      const fx = p.px + (i === 0 ? -0.4 : 0.4) * scale;
      const fy = p.py - facing * scale * (0.62 + (i === 0 ? step : -step) * 0.3);
      ctx.beginPath();
      ctx.ellipse(fx, fy, scale * 0.2, scale * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The body pulses with the stride (and faintly with breath at rest).
  const bodyR = scale * 0.8 * (moving
    ? 1 + Math.sin(gait.walk * 2) * 0.06
    : 1 + idleSway * 0.02);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.px, p.py, bodyR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Paddle: a short handle from the body to an angled blade; the stroke
  // winds up then sweeps across the body, same timing as the 3D arm.
  // Between swings it sways with the stride (or drifts gently at rest).
  const paddleSway = swingT > 0 ? 0
    : (moving ? Math.sin(gait.walk) * 0.28 : idleSway * 0.09);
  const ang = Math.atan2(facing * 0.55, 0.65) - sweep * 2.2 * facing + paddleSway;
  const hx = p.px + Math.cos(ang) * scale * 1.05;
  const hy = p.py + Math.sin(ang) * scale * 1.05;
  ctx.strokeStyle = '#7a4a2b';
  ctx.lineWidth = Math.max(2, scale * 0.16);
  ctx.beginPath();
  ctx.moveTo(p.px + Math.cos(ang) * scale * 0.6, p.py + Math.sin(ang) * scale * 0.6);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = '#31456b';
  ctx.beginPath();
  ctx.ellipse(
    hx + Math.cos(ang) * scale * 0.28,
    hy + Math.sin(ang) * scale * 0.28,
    scale * 0.36,
    scale * 0.27,
    ang,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
