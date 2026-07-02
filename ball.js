// Ball physics: 2D court position (x, y in feet) plus simulated height z.

export const G = 32; // ft/s²

const RESTITUTION = 0.55;
const GROUND_FRICTION = 0.75;

export class Ball {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.inFlight = false;
    this.launchId = 0; // increments per launch so the CPU can react per shot
    this.spin = 0; // -1 slice .. +1 topspin
    this.wind = 0; // horizontal accel (ft/s²), daily-challenge modifier
    this.gravityScale = 1; // daily-challenge modifier
    this.skinColor = '#f3ff4e';
  }

  // Topspin makes the ball fly "heavy" (dips → same target, faster flight);
  // slice floats. Using effective gravity keeps landing prediction exact.
  get geff() {
    return G * (1 + 0.35 * this.spin) * this.gravityScale;
  }

  placeAt(x, y, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.inFlight = false;
  }

  // Launches from the current position to land at (tx, ty), reaching roughly
  // apexZ at the top of the arc. Flight time follows from the vertical motion:
  // rise to the apex, then fall to the ground. timeScale < 1 compresses the
  // flight (a punched shot): same landing spot, flatter and faster — from a
  // high contact point it can even be driven downward.
  launchTo(tx, ty, apexZ, timeScale = 1, spin = 0) {
    this.spin = spin;
    const g = this.geff;
    const rise = Math.max(apexZ - this.z, 0.5);
    const vz0Arc = Math.sqrt(2 * g * rise);
    let t = (vz0Arc + Math.sqrt(vz0Arc * vz0Arc + 2 * g * this.z)) / g;
    t *= timeScale;
    // Vertical speed that still lands at z = 0 at time t; horizontal aim
    // leads the wind so the shot still arrives at the target.
    this.vz = (0.5 * g * t * t - this.z) / t;
    this.vx = (tx - this.x) / t - 0.5 * this.wind * t;
    this.vy = (ty - this.y) / t;
    this.inFlight = true;
    this.launchId++;
  }

  // Integrates one step; returns 'bounce' if the ball hit the ground.
  update(dt) {
    if (!this.inFlight) return null;
    this.vx += this.wind * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vz -= this.geff * dt;
    this.z += this.vz * dt;
    if (this.z <= 0 && this.vz < 0) {
      this.z = 0;
      // Topspin kicks forward with a livelier hop; slice skids low.
      const rest = RESTITUTION * (this.spin >= 0 ? 1 + 0.15 * this.spin : 1 + 0.5 * this.spin);
      const friction = GROUND_FRICTION
        + (this.spin > 0 ? 0.22 * this.spin : 0.12 * -this.spin);
      this.vz = -this.vz * rest;
      this.vx *= friction;
      this.vy *= friction;
      this.spin *= 0.4;
      // A bounce too weak to matter ends the flight (ball rolls dead).
      if (this.vz < 2) {
        this.vz = 0;
        this.inFlight = false;
      }
      return 'bounce';
    }
    return null;
  }

  // Where and when the ball next reaches z = 0 while descending.
  predictLanding() {
    if (!this.inFlight) return { x: this.x, y: this.y, t: 0 };
    const g = this.geff;
    const t = (this.vz + Math.sqrt(this.vz * this.vz + 2 * g * this.z)) / g;
    return {
      x: this.x + this.vx * t + 0.5 * this.wind * t * t,
      y: this.y + this.vy * t,
      t,
    };
  }

  draw(ctx, view) {
    const { scale } = view;

    // Landing marker
    if (this.inFlight && this.z > 0.5) {
      const land = this.predictLanding();
      const lp = view.toPx(land.x, land.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lp.px, lp.py, scale * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow at the true court position
    const sp = view.toPx(this.x, this.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(sp.px, sp.py, scale * 0.32, scale * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball, offset upward with height; tinted by spin while flying
    const by = sp.py - this.z * scale * 0.7;
    let color = this.skinColor;
    if (this.inFlight && this.spin > 0.15) color = '#ffb14e';
    else if (this.inFlight && this.spin < -0.15) color = '#a7e9ff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sp.px, by, scale * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
