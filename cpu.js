// The CPU opponent: top half of the court.

import {
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, MARGIN, CENTER_X,
} from './court.js';
import { drawFigure, REACH, MAX_HIT_HEIGHT } from './player.js';
import { QUICK_PROFILES } from './ladder.js';

export class Cpu {
  constructor() {
    this.x = CENTER_X;
    this.y = 4;
    this.setDifficulty('medium');
    this.reactionLeft = 0;
    this.trackedBall = null;
  }

  setDifficulty(name) {
    this.setProfile(QUICK_PROFILES[name] || QUICK_PROFILES.medium);
  }

  // A personality profile: speed, reaction, aimError, dinkiness, aggression,
  // lobbiness (see ladder.js). Kept on `difficulty` for existing callers.
  setProfile(profile) {
    this.difficulty = profile;
  }

  reset() {
    this.x = CENTER_X;
    this.y = 4;
    this.reactionLeft = 0;
    this.trackedBall = null;
    this.speedNow = 0;
  }

  update(dt, ball, playable = true) {
    let targetX = CENTER_X;
    let targetY = 6; // home position between baseline and kitchen

    const comingMyWay = ball.inFlight && ball.vy < 0 && playable;
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
      const moved = Math.min(step, dist);
      this.x += (dx / dist) * moved;
      this.y += (dy / dist) * moved;
      this.speedNow = moved / dt;
    } else {
      this.speedNow = 0;
    }
    this.x = Math.max(-MARGIN + 1, Math.min(COURT_W + MARGIN - 1, this.x));
    this.y = Math.max(-MARGIN + 1, Math.min(NET_Y - 1.2, this.y));
  }

  canReach(ball) {
    return Math.hypot(ball.x - this.x, ball.y - this.y) < REACH
      && ball.z < MAX_HIT_HEIGHT;
  }

  // Picks a target on the player's side shaped by personality: lobbers go
  // deep and high, dinkers play the kitchen, aggressive types drive flat
  // and fast. Aim error is deliberately unclamped: wild shots go out.
  chooseShot(ball, playerPos) {
    const p = this.difficulty;
    const err = p.aimError;

    if (Math.random() < p.lobbiness * 0.35) {
      return {
        tx: clampX(rand(3, COURT_W - 3) + rand(-err, err)),
        ty: rand(COURT_L - 8, COURT_L - 2) + rand(-err, err),
        apexZ: rand(9, 11),
        timeScale: 1,
      };
    }

    const atKitchenLine = this.y > KITCHEN_TOP - 3;
    if (atKitchenLine && Math.random() < p.dinkiness * 0.8) {
      return {
        tx: clampX(rand(4, COURT_W - 4) + rand(-err, err)),
        ty: NET_Y + rand(2.5, KITCHEN_BOTTOM - NET_Y - 0.5),
        apexZ: 4.5,
        timeScale: 1,
      };
    }

    const awayX = playerPos.x < CENTER_X
      ? rand(CENTER_X + 2, COURT_W - 2)
      : rand(2, CENTER_X - 2);
    // Like the player's power throttle: you can only flatten a ball you
    // take high — driving a low ball flat just finds the net.
    const agg = p.aggression * Math.max(0.3, Math.min(1, ball.z / 4));
    return {
      tx: awayX + rand(-err, err),
      ty: rand(KITCHEN_BOTTOM + 2, COURT_L - 1) + rand(-err, err),
      apexZ: Math.max(3.6, rand(4.3, 5.5) - agg * 0.8),
      timeScale: 1 - 0.25 * agg,
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
