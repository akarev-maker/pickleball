// The CPU opponent: top half of the court.

import {
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, MARGIN, CENTER_X,
} from './court.js';
import { drawFigure, REACH, MAX_HIT_HEIGHT } from './player.js';

const DIFFICULTIES = {
  easy: { speed: 9, reaction: 0.45, aimError: 4 },
  medium: { speed: 12, reaction: 0.25, aimError: 2.5 },
  hard: { speed: 15, reaction: 0.12, aimError: 1.2 },
};

export class Cpu {
  constructor() {
    this.x = CENTER_X;
    this.y = 4;
    this.setDifficulty('medium');
    this.reactionLeft = 0;
    this.trackedBall = null;
  }

  setDifficulty(name) {
    this.difficulty = DIFFICULTIES[name] || DIFFICULTIES.medium;
  }

  reset() {
    this.x = CENTER_X;
    this.y = 4;
    this.reactionLeft = 0;
    this.trackedBall = null;
  }

  update(dt, ball) {
    let targetX = CENTER_X;
    let targetY = 6; // home position between baseline and kitchen

    const comingMyWay = ball.inFlight && ball.vy < 0;
    if (comingMyWay) {
      if (this.trackedBall !== ball.launchId) {
        this.trackedBall = ball.launchId;
        this.reactionLeft = this.difficulty.reaction;
      }
      this.reactionLeft = Math.max(0, this.reactionLeft - dt);
      if (this.reactionLeft === 0) {
        const land = ball.predictLanding();
        targetX = land.x;
        targetY = Math.min(land.y, NET_Y - 1.2);
      }
    } else {
      this.trackedBall = null;
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.difficulty.speed * dt;
    if (dist > 0.2) {
      this.x += (dx / dist) * Math.min(step, dist);
      this.y += (dy / dist) * Math.min(step, dist);
    }
    this.x = Math.max(-MARGIN + 1, Math.min(COURT_W + MARGIN - 1, this.x));
    this.y = Math.max(-MARGIN + 1, Math.min(NET_Y - 1.2, this.y));
  }

  canReach(ball) {
    return Math.hypot(ball.x - this.x, ball.y - this.y) < REACH
      && ball.z < MAX_HIT_HEIGHT;
  }

  // Picks a target on the player's side, biased away from the player,
  // with difficulty-scaled aim error.
  chooseShot(ball, playerPos) {
    const { aimError } = this.difficulty;

    // Dink when close to the kitchen line: drop it just past the net.
    const atKitchenLine = this.y > KITCHEN_TOP - 3;
    if (atKitchenLine && Math.random() < 0.55) {
      return {
        tx: clampX(rand(4, COURT_W - 4) + rand(-aimError, aimError)),
        ty: NET_Y + rand(2.5, KITCHEN_BOTTOM - NET_Y - 0.5),
        apexZ: 4.5,
      };
    }

    // Drive toward the half away from the player.
    const awayX = playerPos.x < CENTER_X
      ? rand(CENTER_X + 2, COURT_W - 2)
      : rand(2, CENTER_X - 2);
    return {
      tx: clampX(awayX + rand(-aimError, aimError)),
      ty: rand(KITCHEN_BOTTOM + 2, COURT_L - 2) + rand(-aimError, aimError),
      apexZ: rand(6, 8),
    };
  }

  draw(ctx, view) {
    drawFigure(ctx, view, this.x, this.y, '#ff8a5e', 1);
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clampX(x) {
  return Math.max(0.5, Math.min(COURT_W - 0.5, x));
}
