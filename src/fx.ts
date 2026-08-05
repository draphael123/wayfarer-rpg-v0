export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  glow: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  squash: number; // vertical squash for ground rings
}

export interface SlashArc {
  x: number;
  y: number;
  angle: number;
  spread: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

export class FxSystem {
  particles: Particle[] = [];
  floaters: Floater[] = [];
  rings: Ring[] = [];
  arcs: SlashArc[] = [];
  shake = 0;

  ring(x: number, y: number, maxR: number, color: string, opts: { width?: number; life?: number; squash?: number } = {}): void {
    this.rings.push({
      x,
      y,
      r: maxR * 0.15,
      maxR,
      life: opts.life ?? 0.4,
      maxLife: opts.life ?? 0.4,
      color,
      width: opts.width ?? 3,
      squash: opts.squash ?? 0.55,
    });
  }

  slash(x: number, y: number, angle: number, radius: number, color: string, spread = Math.PI * 0.9): void {
    this.arcs.push({ x, y, angle, spread, radius, life: 0.22, maxLife: 0.22, color });
  }

  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed = 90,
    opts: { gravity?: number; size?: number; glow?: boolean; life?: number } = {},
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const mag = speed * (0.35 + Math.random() * 0.65);
      const life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag - speed * 0.25,
        life,
        maxLife: life,
        size: (opts.size ?? 3.5) * (0.6 + Math.random() * 0.8),
        color,
        gravity: opts.gravity ?? 160,
        glow: opts.glow ?? false,
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string, size = 15): void {
    this.floaters.push({ x, y, text, color, life: 1, maxLife: 1, size });
  }

  addShake(amount: number): void {
    this.shake = Math.min(14, this.shake + amount);
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 22);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.6 * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt * 0.9;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      f.y -= 34 * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - ring.life / ring.maxLife;
      ring.r = ring.maxR * (0.15 + 0.85 * (1 - Math.pow(1 - t, 2.4)));
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const ring of this.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * (0.4 + alpha * 0.6);
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.r, ring.r * ring.squash, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const arc of this.arcs) {
      const t = 1 - arc.life / arc.maxLife;
      const alpha = Math.max(0, arc.life / arc.maxLife);
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      const sweepStart = arc.angle - arc.spread / 2 + arc.spread * t * 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 7 * alpha + 1.5;
      ctx.beginPath();
      ctx.arc(arc.x, arc.y, arc.radius, sweepStart, sweepStart + arc.spread * 0.7);
      ctx.stroke();
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 3.4 * alpha + 1;
      ctx.beginPath();
      ctx.arc(arc.x, arc.y, arc.radius + 3, sweepStart, sweepStart + arc.spread * 0.7);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      const age = 1 - f.life / f.maxLife;
      const alpha = Math.min(1, f.life / f.maxLife + 0.2);
      // pop: overshoot then settle
      const pop = age < 0.18 ? 0.5 + (age / 0.18) * 0.85 : 1.35 - Math.min(0.35, (age - 0.18) * 1.2);
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(f.size * pop)}px "Trebuchet MS", Verdana, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = "rgba(20, 16, 28, 0.8)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
    this.floaters.length = 0;
    this.rings.length = 0;
    this.arcs.length = 0;
    this.shake = 0;
  }
}
