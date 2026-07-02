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
  }

  placeAt(x, y, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.inFlight = false;
  }

  // Launches from the current position to land at (tx, ty), reaching roughly
  // apexZ at the top of the arc. Flight time follows from the vertical motion:
  // rise to the apex, then fall to the ground.
  launchTo(tx, ty, apexZ) {
    const rise = Math.max(apexZ - this.z, 0.5);
    const vz0 = Math.sqrt(2 * G * rise);
    const t = (vz0 + Math.sqrt(vz0 * vz0 + 2 * G * this.z)) / G;
    this.vx = (tx - this.x) / t;
    this.vy = (ty - this.y) / t;
    this.vz = vz0;
    this.inFlight = true;
  }

  // Integrates one step; returns 'bounce' if the ball hit the ground.
  update(dt) {
    if (!this.inFlight) return null;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vz -= G * dt;
    this.z += this.vz * dt;
    if (this.z <= 0 && this.vz < 0) {
      this.z = 0;
      this.vz = -this.vz * RESTITUTION;
      this.vx *= GROUND_FRICTION;
      this.vy *= GROUND_FRICTION;
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
    const t = (this.vz + Math.sqrt(this.vz * this.vz + 2 * G * this.z)) / G;
    return { x: this.x + this.vx * t, y: this.y + this.vy * t, t };
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

    // Ball, offset upward with height
    const by = sp.py - this.z * scale * 0.7;
    ctx.fillStyle = '#f3ff4e';
    ctx.beginPath();
    ctx.arc(sp.px, by, scale * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
