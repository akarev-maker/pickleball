// Visual juice: particles, ball trail, landing ring, screen shake, confetti.
// All positions in court feet; drawn through the view like everything else.

const MAX_PARTICLES = 200;

const CONFETTI_COLORS = ['#ff6b6b', '#ffd166', '#7fe0b0', '#6bd5ff', '#c8a2ff'];

export class Fx {
  constructor() {
    this.particles = [];
    this.trailPoints = [];
    this.rings = [];
    this.texts = [];
    this.shakeTime = 0;
    this.shakeMag = 0;
  }

  // Floating caption ("SMASH!") that rises and fades above a court point.
  text(x, y, str) {
    this.texts.push({ x, y, z: 5, str, life: 0.7, maxLife: 0.7 });
  }

  spawn(p) {
    if (this.particles.length < MAX_PARTICLES) this.particles.push(p);
  }

  spawnBounce(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.spawn({
        x, y, z: 0.1,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 2 + Math.random() * 3,
        life: 0.35, maxLife: 0.35, size: 0.12, color: 'rgba(230,225,210,0.7)',
      });
    }
  }

  spawnNet(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 5;
      this.spawn({
        x, y, z: 2.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.4, vz: Math.random() * 4 - 1,
        life: 0.3, maxLife: 0.3, size: 0.1, color: 'rgba(255,255,255,0.9)',
      });
    }
  }

  spawnConfetti() {
    for (let i = 0; i < 120; i++) {
      this.spawn({
        x: Math.random() * 23, y: Math.random() * 20 + 12, z: 14 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
        vz: -(2 + Math.random() * 3),
        life: 3.5, maxLife: 3.5, size: 0.18,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        confetti: true,
      });
    }
  }

  ring(x, y) {
    this.rings.push({ x, y, r: 0.3, life: 0.8, maxLife: 0.8 });
  }

  // Call each frame while the ball flies; stores a fading polyline.
  trail(ball) {
    if (!ball.inFlight) return;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 14) return;
    this.trailPoints.push({ x: ball.x, y: ball.y, z: ball.z, life: 0.25, maxLife: 0.25 });
    if (this.trailPoints.length > 40) this.trailPoints.shift();
  }

  shake(mag) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = 0.18;
  }

  offsetPx(scale) {
    if (this.shakeTime <= 0) return { ox: 0, oy: 0 };
    const m = this.shakeMag * (this.shakeTime / 0.18) * scale;
    return { ox: (Math.random() - 0.5) * m, oy: (Math.random() - 0.5) * m };
  }

  update(dt) {
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakeMag = 0;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.confetti) {
        p.z = Math.max(0, p.z + p.vz * dt);
        p.vx += (Math.random() - 0.5) * 2 * dt; // flutter
      } else {
        p.vz -= 20 * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.trailPoints) t.life -= dt;
    this.trailPoints = this.trailPoints.filter((t) => t.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      r.r += dt * 2.2;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.z += 4 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // Trail + rings: under the entities.
  drawUnder(ctx, view) {
    for (const t of this.trailPoints) {
      const p = view.toPx(t.x, t.y);
      const s = view.scaleAt(t.y);
      const alpha = 0.35 * (t.life / t.maxLife);
      ctx.fillStyle = `rgba(243,255,78,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.px, p.py - view.zOffset(t.y, t.z), s * 0.22 * (t.life / t.maxLife + 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      const p = view.toPx(r.x, r.y);
      const s = view.scaleAt(r.y);
      ctx.strokeStyle = `rgba(255,255,255,${(0.8 * (r.life / r.maxLife)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.px, p.py, r.r * s, r.r * s * (view.mode === '3d' ? 0.45 : 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Particles: over the entities.
  drawOver(ctx, view) {
    for (const p of this.particles) {
      const px = view.toPx(p.x, p.y);
      const s = view.scaleAt(p.y);
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.confetti) {
        ctx.fillRect(px.px, px.py - view.zOffset(p.y, p.z), p.size * s, p.size * s * 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(px.px, px.py - view.zOffset(p.y, p.z), p.size * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const t of this.texts) {
      const p = view.toPx(t.x, t.y);
      const s = view.scaleAt(t.y);
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.font = `800 ${Math.max(14, Math.round(s * 0.8))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      const py = p.py - view.zOffset(t.y, t.z);
      ctx.strokeText(t.str, p.px, py);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(t.str, p.px, py);
    }
    ctx.globalAlpha = 1;
  }
}
