// Pure pickleball rules logic. No imports, no DOM — testable with plain Node.
//
// Court geometry (feet): 20 wide (x 0..20), 44 long (y 0..44).
// Net at y = 22; kitchen (non-volley zone) spans y 15..29.
// Player occupies the bottom half (y > 22), CPU the top half (y < 22).

export const PLAYER = 'player';
export const CPU = 'cpu';

export const COURT_W = 20;
export const COURT_L = 44;
export const NET_Y = 22;
export const KITCHEN_TOP = 15;
export const KITCHEN_BOTTOM = 29;
export const CENTER_X = COURT_W / 2;

export function other(side) {
  return side === PLAYER ? CPU : PLAYER;
}

export function inKitchen(y) {
  return y > KITCHEN_TOP && y < KITCHEN_BOTTOM;
}

// Rally scoring to 11, win by 2. Serve alternates sides every point.
export class Score {
  constructor() {
    this[PLAYER] = 0;
    this[CPU] = 0;
    this.servingSide = PLAYER;
  }

  add(side) {
    this[side]++;
    this.servingSide = other(this.servingSide);
  }

  get(side) {
    return this[side];
  }

  winner() {
    for (const side of [PLAYER, CPU]) {
      if (this[side] >= 11 && this[side] - this[other(side)] >= 2) return side;
    }
    return null;
  }
}

// Tracks one rally. recordHit/recordBounce/recordOut return null while the
// rally continues, or { winner, reason } when it ends.
export class Rally {
  constructor(server) {
    this.server = server;
    this.hitCount = 0; // the serve is hit 1
    this.bouncedSinceLastHit = false;
    this.lastHitter = null;
  }

  recordHit(side, { volley = false, inKitchen: hitterInKitchen = false } = {}) {
    const hitNumber = this.hitCount + 1;
    // Two-bounce rule: the return of serve (hit 2) and the third shot (hit 3)
    // must be played off a bounce.
    if (volley && (hitNumber === 2 || hitNumber === 3)) {
      return { winner: other(side), reason: 'Two-bounce rule! Let it bounce.' };
    }
    if (volley && hitterInKitchen) {
      return { winner: other(side), reason: 'Kitchen fault! No volleys in the kitchen.' };
    }
    this.hitCount = hitNumber;
    this.bouncedSinceLastHit = false;
    this.lastHitter = side;
    return null;
  }

  recordBounce() {
    if (this.bouncedSinceLastHit) {
      return { winner: this.lastHitter, reason: 'Double bounce!' };
    }
    this.bouncedSinceLastHit = true;
    return null;
  }

  recordOut(hitterSide) {
    return { winner: other(hitterSide), reason: 'Out!' };
  }
}

// A serve must land diagonally: in the opposite absolute x-half from where it
// was struck, past the kitchen, inside the receiver's court.
export function isValidServeLanding(server, serveX, landX, landY) {
  if (landX <= 0 || landX >= COURT_W) return false;
  const servedFromRight = serveX > CENTER_X;
  const inDiagonalHalf = servedFromRight ? landX < CENTER_X : landX > CENTER_X;
  if (!inDiagonalHalf) return false;
  if (server === PLAYER) {
    // Lands in the top service area: between baseline and kitchen line.
    return landY > 0 && landY < KITCHEN_TOP;
  }
  return landY > KITCHEN_BOTTOM && landY < COURT_L;
}
