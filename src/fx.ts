import { drawAbilityGlyph } from "./icons";

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
  vx: number;
  vy: number;
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

export interface LightPool {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: string; // rgb triplet like "255,150,60"
}

export interface Beam {
  x: number;
  y: number; // ground point the column stands on
  height: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

export interface Sigil {
  x: number;
  y: number;
  icon: string;
  color: string;
  life: number;
  maxLife: number;
}

export class FxSystem {
  particles: Particle[] = [];
  floaters: Floater[] = [];
  rings: Ring[] = [];
  arcs: SlashArc[] = [];
  pools: LightPool[] = [];
  beams: Beam[] = [];
  tracers: Tracer[] = [];
  sigils: Sigil[] = [];
  shake = 0;

  /** The spell's own mark, flashed over the caster — every cast wears its name. */
  sigil(x: number, y: number, icon: string, color: string): void {
    this.sigils.push({ x, y, icon, color, life: 0.65, maxLife: 0.65 });
  }

  /** Vertical column of light standing on a ground point. */
  beam(x: number, y: number, height: number, width: number, color: string, life = 0.5): void {
    this.beams.push({ x, y, height, width, life, maxLife: life, color });
  }

  /** Straight glowing line — sniper trails, chain arcs. */
  tracer(x1: number, y1: number, x2: number, y2: number, color: string, life = 0.3, width = 2.5): void {
    this.tracers.push({ x1, y1, x2, y2, life, maxLife: life, color, width });
  }

  pool(x: number, y: number, r: number, color: string, life = 0.7): void {
    this.pools.push({ x, y, r, life, maxLife: life, color });
  }

  /** Directional cone burst — debris flies away from the attacker. */
  spray(x: number, y: number, dirX: number, dirY: number, color: string, count: number, speed = 120): void {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const angle = base + (Math.random() - 0.5) * 1.1;
      const mag = speed * (0.5 + Math.random() * 0.7);
      const life = 0.4 * (0.6 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * mag,
        vy: Math.sin(angle) * mag - 40,
        life, maxLife: life,
        size: 2.5 + Math.random() * 2,
        color, gravity: 260, glow: false,
      });
    }
  }

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
    // jitter + drift so rapid hits fan out instead of stacking into a blob
    this.floaters.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y - Math.random() * 6,
      vx: (Math.random() - 0.5) * 26,
      vy: -64 - Math.random() * 18,
      text,
      color,
      life: 1,
      maxLife: 1,
      size,
    });
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
      // rise fast, then hover as it fades
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - 2.2 * dt;
      f.vy *= 1 - 4.6 * dt;
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
    for (let i = this.pools.length - 1; i >= 0; i--) {
      this.pools[i].life -= dt;
      if (this.pools[i].life <= 0) this.pools.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.sigils.length - 1; i >= 0; i--) {
      this.sigils[i].life -= dt;
      if (this.sigils[i].life <= 0) this.sigils.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const pool of this.pools) {
      const a = Math.max(0, pool.life / pool.maxLife);
      const g = ctx.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, pool.r);
      g.addColorStop(0, `rgba(${pool.color},${0.34 * a})`);
      g.addColorStop(1, `rgba(${pool.color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(pool.x, pool.y, pool.r, pool.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
    for (const beam of this.beams) {
      const a = Math.max(0, beam.life / beam.maxLife);
      const w = beam.width * (0.5 + a * 0.5);
      const grad = ctx.createLinearGradient(beam.x, beam.y - beam.height, beam.x, beam.y);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.35, beam.color);
      grad.addColorStop(1, beam.color);
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = grad;
      ctx.fillRect(beam.x - w / 2, beam.y - beam.height, w, beam.height);
      ctx.globalAlpha = a * 0.35;
      ctx.fillRect(beam.x - w * 1.4, beam.y - beam.height * 0.92, w * 2.8, beam.height * 0.92);
      // pooled light where it meets the ground
      ctx.globalAlpha = a * 0.6;
      ctx.beginPath();
      ctx.ellipse(beam.x, beam.y, w * 2.2, w * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const tr of this.tracers) {
      const a = Math.max(0, tr.life / tr.maxLife);
      ctx.globalAlpha = a;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = tr.width * a + 0.6;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = (tr.width + 2.4) * a;
      ctx.globalAlpha = a * 0.4;
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.globalAlpha = 1;
    for (const arc of this.arcs) {
      const t = 1 - arc.life / arc.maxLife;
      const alpha = Math.max(0, arc.life / arc.maxLife);
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      const sweepStart = arc.angle - arc.spread / 2 + arc.spread * t * 0.5;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 5 * alpha + 1.2;
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
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "rgba(20, 16, 28, 0.72)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    // cast sigils: the spell's own mark blooms over the caster and rises away
    for (const s of this.sigils) {
      const k = 1 - s.life / s.maxLife;
      const scale = k < 0.2 ? 0.6 + (k / 0.2) * 0.6 : 1.2 + (k - 0.2) * 0.5;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (s.life / s.maxLife) * 1.8);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 14;
      drawAbilityGlyph(ctx, s.icon, s.x, s.y - k * 30, 13 * scale, s.color);
      ctx.restore();
    }
  }

  clear(): void {
    this.sigils.length = 0;
    this.particles.length = 0;
    this.floaters.length = 0;
    this.rings.length = 0;
    this.arcs.length = 0;
    this.pools.length = 0;
    this.beams.length = 0;
    this.tracers.length = 0;
    this.shake = 0;
  }
}
