// The CPU opponent: top half of the court.

import {
  COURT_W, COURT_L, NET_Y, KITCHEN_TOP, KITCHEN_BOTTOM, MARGIN, CENTER_X,
} from './court.js';
import { drawFigure, REACH, MAX_HIT_HEIGHT } from './player.js';
import { QUICK_PROFILES } from './ladder.js';
import { SMASH_HEIGHT } from './shots.js';

export class Cpu {
  // side 'top' plays toward the player; side 'bottom' is a doubles partner.
  // All tuning lives in the top-side frame; m() mirrors y for bottom-siders.
  constructor(side = 'top') {
    this.side = side;
    this.homeX = CENTER_X; // narrowed in skinny/doubles modes
    this.coverHalf = null; // 'left' | 'right' | null — doubles half coverage
    this.x = CENTER_X;
    this.y = this.m(4);
    this.setDifficulty('medium');
    this.reactionLeft = 0;
    this.trackedBall = null;
    this.swingT = 0;
  }

  m(y) {
    return this.side === 'top' ? y : COURT_L - y;
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
    this.x = this.homeX;
    this.y = this.m(4);
    this.reactionLeft = 0;
    this.trackedBall = null;
    this.speedNow = 0;
  }

  update(dt, ball, playable = true) {
    this.swingT = Math.max(0, this.swingT - dt);
    let targetX = this.homeX;
    let targetY = this.m(6); // home position between baseline and kitchen

    const toward = this.side === 'top' ? ball.vy < 0 : ball.vy > 0;
    const comingMyWay = ball.inFlight && toward && playable;
    if (comingMyWay) {
      if (this.trackedBall !== ball.launchId) {
        this.trackedBall = ball.launchId;
        this.reactionLeft = this.difficulty.reaction;
      }
      this.reactionLeft = Math.max(0, this.reactionLeft - dt);
      if (this.reactionLeft === 0) {
        const land = ball.predictLanding();
        const mine = !this.coverHalf
          || (this.coverHalf === 'left' ? land.x < CENTER_X : land.x >= CENTER_X);
        if (mine) {
          targetX = land.x;
          targetY = this.side === 'top'
            ? Math.min(land.y, NET_Y - 1.2)
            : Math.max(land.y, NET_Y + 1.2);
        }
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
    this.x = Math.max(-3, Math.min(COURT_W + 3, this.x));
    if (this.side === 'top') {
      this.y = Math.max(-MARGIN + 1, Math.min(NET_Y - 1.2, this.y));
    } else {
      this.y = Math.max(NET_Y + 1.2, Math.min(COURT_L + 3.5, this.y));
    }
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

    // A ball taken overhead is smashed: barely lifted, punched steeply
    // down and away from the player. This is what punishes short lobs.
    if (ball.z >= SMASH_HEIGHT) {
      const awayX = playerPos.x < CENTER_X
        ? rand(CENTER_X + 2, COURT_W - 2)
        : rand(2, CENTER_X - 2);
      return {
        tx: clampX(awayX + rand(-err, err)),
        ty: this.m(rand(KITCHEN_BOTTOM + 1, COURT_L - 2)) + rand(-err, err),
        apexZ: ball.z + 0.5,
        timeScale: 0.6 - 0.2 * p.aggression,
        spin: 0.3,
        smash: true,
      };
    }

    if (Math.random() < p.lobbiness * 0.35) {
      return {
        tx: clampX(rand(3, COURT_W - 3) + rand(-err, err)),
        ty: this.m(rand(COURT_L - 8, COURT_L - 2)) + rand(-err, err),
        apexZ: rand(9, 11),
        timeScale: 1,
        spin: 0,
      };
    }

    const atKitchenLine = this.m(this.y) > KITCHEN_TOP - 3;
    if (atKitchenLine && Math.random() < p.dinkiness * 0.8) {
      return {
        tx: clampX(rand(4, COURT_W - 4) + rand(-err, err)),
        ty: this.m(NET_Y + rand(2.5, KITCHEN_BOTTOM - NET_Y - 0.5)),
        apexZ: 4.5,
        timeScale: 1,
        spin: -0.4, // dinks carry slice
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
      ty: this.m(rand(KITCHEN_BOTTOM + 2, COURT_L - 1)) + rand(-err, err),
      apexZ: Math.max(3.6, rand(4.3, 5.5) - agg * 0.8),
      timeScale: 1 - 0.25 * agg,
      spin: agg * 0.6, // aggressive types drive with topspin
    };
  }

  draw(ctx, view) {
    const color = this.side === 'bottom' ? '#8fd3a8' : '#ff8a5e';
    drawFigure(ctx, view, this.x, this.y, color, this.side === 'top' ? 1 : -1, this.swingT);
  }
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clampX(x) {
  return Math.max(0.5, Math.min(COURT_W - 0.5, x));
}
