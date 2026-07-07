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
    this.swingBack = false; // current stroke is a backhand
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
    return {
      walk: this.walk, idle: this.idle, moving: this.speedNow > 1, back: this.swingBack,
    };
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

// Darken a #rrggbb color by factor f (0..1).
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

const SKIN = '#e8b98a';
const SHOE = '#232a30';
const OUTLINE = 'rgba(20, 25, 22, 0.5)';

// Draws a two-segment limb (thigh/shin or upper arm/forearm) from a joint.
// a1: first-segment angle from straight down (positive = +x); a2: bend of
// the second segment relative to the first. Returns the end point.
function limb(ctx, x0, y0, a1, l1, a2, l2, width, color) {
  const kx = x0 + Math.sin(a1) * l1;
  const ky = y0 + Math.cos(a1) * l1;
  const ex = kx + Math.sin(a1 + a2) * l2;
  const ey = ky + Math.cos(a1 + a2) * l2;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(kx, ky);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  return { x: ex, y: ey };
}

export function drawFigure(ctx, view, x, y, color, facing, swingT = 0, gait = null, look = null) {
  const p = view.toPx(x, y);
  const sweep = swingCurve(swingT);
  const moving = !!(gait && gait.moving);
  const back = swingT > 0 && !!(gait && gait.back); // backhand stroke
  // Standing figures breathe; running ones bounce with their stride.
  const idleSway = gait ? Math.sin(gait.idle * 2.2) : 0;
  // Per-character appearance (see ladder.js roster `look` docs).
  const lk = {
    h: 1, w: 1, hunch: 0, skin: SKIN, hair: 'cap', hairColor: '#5a4632',
    headShape: 'round', glasses: false,
    ...(look || {}),
  };

  if (view.mode === '3d') {
    // Readability floor: far players never shrink into dots.
    const s = Math.max(view.scaleAt(y), view.scale * 0.66);
    const bob = moving
      ? Math.abs(Math.sin(gait.walk)) * s * 0.13
      : idleSway * s * 0.05;
    const side = facing === -1 ? 1 : -1;
    const handDir = back ? -side : side;
    const stoop = lk.hunch * s * 0.16; // shoulders/head sag forward-down
    // Shadow on the court
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(p.px, p.py, s * 0.75 * lk.w, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs: articulated thigh + shin. Running gets a real cycle (front
    // leg reaching, rear leg folded heel-up); standing is a soft-kneed
    // athletic crouch.
    const hipY = p.py - s * 1.08 * lk.h - bob;
    for (let i = 0; i < 2; i++) {
      const hx0 = p.px + (i === 0 ? -0.2 : 0.2) * s * lk.w;
      const stride = moving ? Math.sin(gait.walk + i * Math.PI) : 0;
      const thigh = moving ? stride * 0.55 : (i === 0 ? -0.1 : 0.1) + idleSway * 0.02;
      const knee = moving
        ? -0.15 - Math.max(0, -stride) * 1.0
        : -0.16;
      const foot = limb(
        ctx, hx0, hipY, thigh, s * 0.52 * lk.h, knee, s * 0.5 * lk.h,
        Math.max(2, s * 0.22 * lk.w), lk.skin,
      );
      ctx.fillStyle = SHOE;
      ctx.beginPath();
      ctx.ellipse(foot.x + s * 0.05, foot.y, s * 0.17, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Free arm: bent and ready in front, pumping on the run.
    const shY = p.py - s * 1.95 * lk.h - bob + stoop;
    const freeSwing = moving ? Math.sin(gait.walk) * 0.6 : idleSway * 0.07;
    limb(
      ctx,
      p.px - side * s * 0.42 * lk.w, shY,
      -side * (0.78 + freeSwing), s * 0.42,
      -side * 1.3, s * 0.38,
      Math.max(2, s * 0.19), lk.skin,
    );

    // Shorts, then the tapered jersey over them.
    ctx.fillStyle = shade(color, 0.55);
    ctx.beginPath();
    ctx.ellipse(p.px, p.py - s * 1.08 * lk.h - bob, s * 0.42 * lk.w, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    const hipW = s * 0.36 * lk.w;
    const shW = s * 0.46 * lk.w;
    const hipLine = p.py - s * 1.12 * lk.h - bob;
    const shLine = p.py - s * 2.02 * lk.h - bob + stoop;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.px - hipW, hipLine);
    ctx.quadraticCurveTo(p.px - shW * 1.15, (hipLine + shLine) / 2, p.px - shW, shLine);
    ctx.quadraticCurveTo(p.px, shLine - s * 0.24, p.px + shW, shLine);
    ctx.quadraticCurveTo(p.px + shW * 1.15, (hipLine + shLine) / 2, p.px + hipW, hipLine);
    ctx.quadraticCurveTo(p.px, hipLine + s * 0.14, p.px - hipW, hipLine);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.stroke();

    // Head: shaped, haired, and (when facing the camera) with a face.
    const heady = p.py - s * 2.52 * lk.h - bob + stoop * 1.6;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    if (lk.headShape === 'square') {
      // Blocky and unbothered (The Wall).
      ctx.fillStyle = lk.skin;
      ctx.fillRect(p.px - s * 0.38, heady - s * 0.36, s * 0.76, s * 0.72);
      ctx.strokeRect(p.px - s * 0.38, heady - s * 0.36, s * 0.76, s * 0.72);
      if (facing === 1) {
        ctx.fillStyle = '#2b2420';
        for (const ex of [-0.15, 0.15]) {
          ctx.fillRect(p.px + ex * s - s * 0.045, heady - s * 0.02, s * 0.09, s * 0.09);
        }
      }
    } else {
      ctx.fillStyle = lk.skin;
      ctx.beginPath();
      ctx.arc(p.px, heady, s * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (lk.hair === 'cap') {
        ctx.fillStyle = shade(color, 0.72);
        ctx.beginPath();
        ctx.arc(p.px, heady - s * 0.06, s * 0.37, Math.PI, Math.PI * 2);
        ctx.fill();
        if (facing === 1) {
          ctx.beginPath();
          ctx.ellipse(p.px, heady - s * 0.03, s * 0.4, s * 0.09, 0, 0, Math.PI);
          ctx.fill();
        }
      } else if (lk.hair === 'spiky') {
        ctx.fillStyle = lk.hairColor;
        for (let i = -2; i <= 2; i++) {
          const sx = p.px + i * s * 0.14;
          ctx.beginPath();
          ctx.moveTo(sx - s * 0.08, heady - s * 0.28);
          ctx.lineTo(sx, heady - s * 0.52 - Math.abs(i) * -0.04 * s);
          ctx.lineTo(sx + s * 0.08, heady - s * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      } else if (lk.hair === 'bald') {
        // A shiny dome with gray side tufts.
        ctx.fillStyle = '#cfd2cf';
        for (const hxSide of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(p.px + hxSide * s * 0.31, heady + s * 0.08, s * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (lk.hair === 'ponytail') {
        ctx.fillStyle = lk.hairColor;
        ctx.beginPath();
        ctx.arc(p.px, heady - s * 0.05, s * 0.37, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(
          p.px - s * 0.3, heady - s * 0.38, s * 0.1, s * 0.24, -0.6, 0, Math.PI * 2,
        );
        ctx.fill();
      } else if (lk.hair === 'headband') {
        ctx.fillStyle = lk.hairColor;
        ctx.beginPath();
        ctx.arc(p.px, heady - s * 0.07, s * 0.37, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(p.px - s * 0.37, heady - s * 0.14, s * 0.74, s * 0.11);
      }
      if (facing === 1) {
        ctx.fillStyle = '#2b2420';
        for (const ex of [-0.13, 0.13]) {
          ctx.beginPath();
          ctx.arc(p.px + ex * s, heady + s * 0.08, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
        if (lk.glasses) {
          ctx.strokeStyle = '#4a443c';
          ctx.lineWidth = Math.max(1.2, s * 0.045);
          for (const ex of [-0.13, 0.13]) {
            ctx.beginPath();
            ctx.arc(p.px + ex * s, heady + s * 0.08, s * 0.1, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(p.px - s * 0.03, heady + s * 0.08);
          ctx.lineTo(p.px + s * 0.03, heady + s * 0.08);
          ctx.stroke();
        }
      }
    }

    // Paddle arm: two segments — the elbow folds deep into the windup and
    // straightens through contact. Mirrored across the body on a backhand.
    const armSway = swingT > 0 ? 0
      : (moving ? Math.sin(gait.walk + Math.PI) * 0.35 : idleSway * 0.08);
    const upper = handDir * (0.65 + sweep * 1.5) + armSway * handDir;
    const elbow = handDir * (-1.15 + Math.abs(sweep) * (sweep > 0 ? 0.95 : 0.35));
    const hand = limb(
      ctx,
      p.px + side * s * 0.42 * lk.w, shY,
      upper, s * 0.42,
      elbow, s * 0.4,
      Math.max(2, s * 0.19), lk.skin,
    );
    // Grip, handle, and the blade in the equipped paddle color.
    ctx.fillStyle = lk.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a4a2b';
    ctx.lineWidth = Math.max(2, s * 0.13);
    ctx.beginPath();
    ctx.moveTo(hand.x, hand.y);
    ctx.lineTo(hand.x + handDir * s * 0.16, hand.y - s * 0.3);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(
      hand.x + handDir * s * 0.24,
      hand.y - s * 0.62,
      s * 0.3,
      s * 0.4,
      handDir * (0.4 + 1.4 * sweep),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.stroke();
    return;
  }

  // Top-down: jersey disc, capped head, and the paddle on the net side.
  const scale = view.scaleAt(y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(p.px, p.py + scale * 0.35, scale * 0.75, scale * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet peek out on the baseline side and scissor while moving.
  if (gait) {
    const step = moving ? Math.sin(gait.walk) : 0;
    ctx.fillStyle = SHOE;
    for (let i = 0; i < 2; i++) {
      const fx = p.px + (i === 0 ? -0.4 : 0.4) * scale;
      const fy = p.py - facing * scale * (0.62 + (i === 0 ? step : -step) * 0.3);
      ctx.beginPath();
      ctx.ellipse(fx, fy, scale * 0.2, scale * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shoulders pulse with the stride (and faintly with breath at rest).
  const bodyR = scale * 0.8 * lk.w * (moving
    ? 1 + Math.sin(gait.walk * 2) * 0.06
    : 1 + idleSway * 0.02);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.px, p.py, bodyR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Head and headgear seen from above.
  const capColor = lk.hair === 'bald' ? shade(lk.skin, 0.92)
    : (lk.hair === 'cap' ? shade(color, 0.72) : lk.hairColor);
  if (lk.headShape === 'square') {
    ctx.fillStyle = lk.skin;
    ctx.fillRect(p.px - scale * 0.4, p.py - scale * 0.4, scale * 0.8, scale * 0.8);
  } else {
    ctx.fillStyle = lk.skin;
    ctx.beginPath();
    ctx.arc(p.px, p.py, scale * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = capColor;
    ctx.beginPath();
    ctx.arc(p.px, p.py, scale * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  // Paddle: winds up then sweeps across the body — mirrored on a backhand.
  // Between swings it sways with the stride (or drifts gently at rest).
  const paddleSway = swingT > 0 ? 0
    : (moving ? Math.sin(gait.walk) * 0.28 : idleSway * 0.09);
  const ang = Math.atan2(facing * 0.55, back ? -0.65 : 0.65)
    - sweep * 2.2 * facing * (back ? -1 : 1) + paddleSway;
  const hx = p.px + Math.cos(ang) * scale * 1.05;
  const hy = p.py + Math.sin(ang) * scale * 1.05;
  ctx.strokeStyle = '#7a4a2b';
  ctx.lineWidth = Math.max(2, scale * 0.16);
  ctx.beginPath();
  ctx.moveTo(p.px + Math.cos(ang) * scale * 0.6, p.py + Math.sin(ang) * scale * 0.6);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = color;
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
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}
