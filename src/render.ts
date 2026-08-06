import type { Battle } from "./battle";
import { deriveStats, HEROES } from "./data";
import type { SaveData, StageDef, Unit } from "./types";

const OUTLINE = "#241b2e";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outlined(ctx: CanvasRenderingContext2D, fill: string, lineWidth = 2.4): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** Small mitten hand at the end of a limb. */
function hand(ctx: CanvasRenderingContext2D, x: number, y: number, skin: string): void {
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  outlined(ctx, skin, 1.4);
}

/** Boot cap planted at a foot position. */
function boot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.beginPath();
  ctx.ellipse(x + 0.4, y, 4.4, 2.5, 0, 0, Math.PI * 2);
  outlined(ctx, color, 1.6);
}

/** Capsule limb: dark outline pass then colored core, round caps. */
function limb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 2.6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = "butt";
}

/**
 * Fill + outline a Path2D, painting a back-side shade and a top-front
 * highlight clipped inside it — the two-tone pass that keeps flat vector
 * shapes from reading as stickers. (cx, cy, r) describe the shape's core so
 * the shade crescent lands on the side away from facing `f`.
 */
function shaded(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  fill: string,
  f: number,
  cx: number,
  cy: number,
  r: number,
  lineWidth = 2.4,
): void {
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(cx - f * r * 0.7, cy + r * 0.25, r * 1.05, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx + f * r * 0.4, cy - r * 0.55, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.stroke(path);
}

// ------------------------------------------------------------------ background

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface BgOpts {
  camX?: number;
  camY?: number;
  dusk?: number; // 0..1 wave progression toward sundown
  units?: Unit[]; // for reactive vegetation
}

/** Parallax layers overdraw this many logical px past each edge so camera
 *  drift never exposes stale canvas. */
const OVERSCAN = 64;

let groundCache: HTMLCanvasElement | null = null;
let groundKey = "";

/**
 * Static ground layer, cached per stage/size: base gradient, soft mottled
 * patches, a worn path, and a grass fringe that breaks the razor horizon
 * line. Rendered once at 2x then stamped every frame.
 */
function groundLayer(stage: StageDef, w: number, h: number, horizon: number): HTMLCanvasElement {
  const key = `${stage.id}|${Math.round(w)}|${Math.round(h)}|${Math.round(horizon)}`;
  if (groundCache && groundKey === key) return groundCache;
  const p = stage.palette;
  const M = OVERSCAN;
  const fringeTop = horizon - 12;
  const cw = w + M * 2;
  const ch = h - fringeTop + M;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(cw * 2);
  cv.height = Math.ceil(ch * 2);
  const g = cv.getContext("2d")!;
  g.scale(2, 2);
  g.translate(M, -fringeTop);

  // grass fringe: irregular scallops of ground color biting into the hills
  g.fillStyle = p.ground;
  g.beginPath();
  g.moveTo(-M, horizon + 4);
  for (let x = -M; x <= w + M; x += 7) {
    const n = hash01(x * 0.71 + stage.id * 13);
    g.lineTo(x, horizon - 1.5 - n * 4.5 - Math.sin(x * 0.05) * 1.5);
  }
  g.lineTo(w + M, horizon + 4);
  g.closePath();
  g.fill();

  // base gradient
  const grad = g.createLinearGradient(0, horizon, 0, h);
  grad.addColorStop(0, p.ground);
  grad.addColorStop(1, p.groundDark);
  g.fillStyle = grad;
  g.fillRect(-M, horizon + 2, w + M * 2, h - horizon + M);

  // soft mottled patches — dark and light, radial falloff, no hard edges
  for (let i = 0; i < 16; i++) {
    const px = (hash01(i * 17 + stage.id * 31) * (w + M * 2)) - M;
    const py = horizon + 14 + hash01(i * 23 + 5) * (h - horizon - 22);
    const pr = 34 + hash01(i * 7) * 55;
    const dark = i % 2 === 0;
    const rad = g.createRadialGradient(px, py, 2, px, py, pr);
    rad.addColorStop(0, dark ? "rgba(20,14,30,0.10)" : "rgba(255,255,240,0.07)");
    rad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rad;
    g.save();
    g.translate(px, py);
    g.scale(1, 0.34);
    g.beginPath();
    g.arc(0, 0, pr, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // worn path meandering across the field
  const pathY = horizon + (h - horizon) * (0.42 + hash01(stage.id * 7.7) * 0.2);
  const wave = (x: number) => pathY + Math.sin(x * 0.006 + stage.id * 2) * 16 + Math.sin(x * 0.017 + 1) * 7;
  g.lineCap = "round";
  for (const [lw, style] of [
    [30, "rgba(20,14,30,0.05)"],
    [20, "rgba(120,90,60,0.08)"],
    [9, "rgba(255,240,210,0.06)"],
  ] as [number, string][]) {
    g.strokeStyle = style;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(-M, wave(-M));
    for (let x = -M; x <= w + M; x += 18) g.lineTo(x, wave(x));
    g.stroke();
  }
  g.lineCap = "butt";
  // scattered stones along the path's shoulders
  g.fillStyle = "rgba(20,14,30,0.16)";
  for (let i = 0; i < 10; i++) {
    const sx = hash01(i * 41 + stage.id) * w;
    const sy = wave(sx) + (hash01(i * 13) - 0.5) * 34;
    g.beginPath();
    g.ellipse(sx, sy, 1.8 + hash01(i * 3) * 2.4, 1.2 + hash01(i * 5) * 1.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  groundCache = cv;
  groundKey = key;
  return cv;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
  opts: BgOpts = {},
): void {
  const p = stage.palette;
  const night = stage.id >= 4;
  const camX = opts.camX ?? 0;
  const camY = opts.camY ?? 0;
  const dusk = opts.dusk ?? 0;
  // far layer barely moves with the camera (parallax)
  ctx.save();
  ctx.translate(camX * 0.72, camY * 0.72);
  const M = OVERSCAN;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(-M, -M, w + M * 2, horizon + M);
  if (dusk > 0) {
    // the sun sinks as the waves wear on
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, `rgba(60, 40, 90, ${dusk * 0.22})`);
    g.addColorStop(0.7, `rgba(255, 120, 60, ${dusk * 0.16})`);
    g.addColorStop(1, `rgba(255, 160, 80, ${dusk * 0.1})`);
    ctx.fillStyle = g;
    ctx.fillRect(-M, -M, w + M * 2, horizon + M);
  }

  // sun / moon with soft halo
  const orbX = w * 0.78;
  const orbY = horizon * (0.38 + dusk * 0.42);
  const halo = ctx.createRadialGradient(orbX, orbY, 4, orbX, orbY, 90);
  halo.addColorStop(0, night ? "rgba(235,235,255,0.55)" : "rgba(255,245,200,0.75)");
  halo.addColorStop(1, "rgba(255,245,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(orbX - 90, orbY - 90, 180, 180);
  ctx.fillStyle = night ? "#e8e6f5" : "#fff3c8";
  ctx.beginPath();
  ctx.arc(orbX, orbY, night ? 16 : 20, 0, Math.PI * 2);
  ctx.fill();
  if (night) {
    ctx.fillStyle = p.skyTop;
    ctx.beginPath();
    ctx.arc(orbX - 7, orbY - 5, 13, 0, Math.PI * 2);
    ctx.fill();
    // stars
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 24; i++) {
      const sx = hash01(i * 3 + stage.id) * w;
      const sy = hash01(i * 7 + 2) * horizon * 0.85;
      const tw = 0.5 + Math.sin(time * 2 + i) * 0.5;
      ctx.globalAlpha = 0.25 + tw * 0.55;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  // clouds
  ctx.fillStyle = night ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.4)";
  for (let i = 0; i < 4; i++) {
    const cx = ((time * (5 + i * 2.2) + i * 270) % (w + 240)) - 120;
    const cy = 26 + i * 24;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60 + i * 9, 13 + i * 2, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 38, cy + 6, 38, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 34, cy + 5, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // far hill layer (lighter) then near hills
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(-M, horizon + 2);
  for (let x = -M; x <= w + M; x += 10) {
    ctx.lineTo(x, horizon - 48 - Math.sin(x * 0.005 + 4.2) * 26 - Math.sin(x * 0.013 + 1) * 12);
  }
  ctx.lineTo(w + M, horizon + 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(-M, horizon + 2);
  for (let x = -M; x <= w + M; x += 8) {
    ctx.lineTo(x, horizon - 22 - Math.sin(x * 0.008 + 1.7) * 18 - Math.sin(x * 0.021) * 9);
  }
  ctx.lineTo(w + M, horizon + 2);
  ctx.closePath();
  ctx.fill();

  // tree / rock silhouettes on the ridge
  for (let i = 0; i < 9; i++) {
    const tx = hash01(i * 13 + stage.id * 7) * w;
    const ridgeY = horizon - 22 - Math.sin(tx * 0.008 + 1.7) * 18 - Math.sin(tx * 0.021) * 9;
    const th = 16 + hash01(i * 5 + 1) * 22;
    ctx.fillStyle = p.prop;
    if (hash01(i * 11 + stage.id) > 0.4) {
      // pine
      ctx.beginPath();
      ctx.moveTo(tx, ridgeY - th);
      ctx.lineTo(tx - th * 0.34, ridgeY + 2);
      ctx.lineTo(tx + th * 0.34, ridgeY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, ridgeY - th * 0.72);
      ctx.lineTo(tx - th * 0.42, ridgeY + 4);
      ctx.lineTo(tx + th * 0.42, ridgeY + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // low boulder hunkered on the ridge (no floating heads)
      ctx.beginPath();
      ctx.ellipse(tx, ridgeY - th * 0.16, th * 0.42, th * 0.3, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
  // mid layer: soft parallax
  ctx.save();
  ctx.translate(camX * 0.35, camY * 0.35);
  ctx.restore();

  // ground: cached static layer (gradient, mottling, worn path, fringe)
  const gl = groundLayer(stage, w, h, horizon);
  ctx.drawImage(gl, -M, horizon - 12, w + M * 2, h - (horizon - 12) + M);
  if (dusk > 0) {
    ctx.fillStyle = `rgba(30, 18, 50, ${dusk * 0.14})`;
    ctx.fillRect(-M, horizon, w + M * 2, h - horizon + M);
  }

  // texture: swaying tufts + stones
  for (let i = 0; i < 22; i++) {
    const gx = hash01(i * 127 + stage.id * 3) * w;
    const gy = horizon + 10 + hash01(i * 311 + stage.id) * (h - horizon - 26);
    let sway = Math.sin(time * 1.6 + i) * 1.4;
    if (opts.units) {
      for (const u of opts.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.x - gx, u.y - gy);
        if (d < 34) sway += ((gx - u.x) / (d + 4)) * (34 - d) * 0.32;
      }
    }
    ctx.strokeStyle = p.prop;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx - 2 + sway, gy - 7, gx - 1 + sway * 1.4, gy - 11);
    ctx.moveTo(gx + 3, gy);
    ctx.quadraticCurveTo(gx + 5 + sway, gy - 6, gx + 6 + sway * 1.4, gy - 9);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const gx = hash01(i * 71 + stage.id * 19) * w;
    const gy = horizon + 20 + hash01(i * 37 + 9) * (h - horizon - 40);
    ctx.beginPath();
    ctx.ellipse(gx, gy, 6 + hash01(i * 2) * 5, 4 + hash01(i * 5) * 3, 0, 0, Math.PI);
    outlined(ctx, "rgba(255,255,255,0.18)", 1.6);
  }

  // lightning over Gloaming Pass: periodic flashes with a jagged bolt
  if (stage.id === 4) {
    const cycle = time % 6.5;
    if (cycle > 5.9 && cycle < 6.25) {
      const k = 1 - Math.abs((cycle - 6.05) / 0.18);
      ctx.fillStyle = `rgba(230, 230, 255, ${Math.max(0, k) * 0.32})`;
      ctx.fillRect(0, 0, w, h);
      if (cycle > 6.0 && cycle < 6.12) {
        const bx = w * (0.25 + hash01(Math.floor(time / 6.5)) * 0.5);
        ctx.strokeStyle = "rgba(240, 240, 255, 0.9)";
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        let ly = 0;
        let lx = bx;
        while (ly < horizon) {
          lx += (hash01(lx + ly) - 0.5) * 34;
          ly += 14 + hash01(ly) * 12;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
    }
  }

  // weather layers
  if (stage.id === 2) {
    // fine swamp drizzle
    ctx.strokeStyle = "rgba(200, 225, 235, 0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 34; i++) {
      const rx = ((hash01(i * 7) * w + time * 240 * (0.7 + hash01(i) * 0.5) * 0.25) % (w + 40)) - 20;
      const ry = (hash01(i * 13) * h + time * 240 * (0.7 + hash01(i) * 0.5)) % h;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 11);
    }
    ctx.stroke();
  } else if (stage.id === 3) {
    // slow ash fall
    ctx.fillStyle = "rgba(200, 195, 188, 0.5)";
    for (let i = 0; i < 18; i++) {
      const ax = ((hash01(i * 11) * w + Math.sin(time * 0.8 + i) * 30) % (w + 20)) - 10;
      const ay = (hash01(i * 5) * h + time * 26 * (0.6 + hash01(i * 3))) % h;
      ctx.beginPath();
      ctx.arc(ax, ay, 1.5 + hash01(i) * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // stage set-dressing: each region gets its own furniture (drawn behind units)
  drawSetDressing(ctx, stage, w, h, horizon, time);

  // ambient motes per region: leaves, dusk fireflies, witchlights, embers
  const MOTES: Record<number, { color: string; glow: boolean }> = {
    0: { color: "rgba(190,225,140,0.6)", glow: false }, // drifting leaves
    1: { color: "rgba(190,235,200,0.8)", glow: true }, // pale dusk fireflies
    2: { color: "rgba(140,235,205,0.85)", glow: true }, // swamp witchlights
    3: { color: "rgba(255,150,80,0.8)", glow: true }, // rising embers
    4: { color: "rgba(255,250,170,0.85)", glow: true }, // fireflies
    5: { color: "rgba(255,130,60,0.8)", glow: true }, // embers
  };
  const mote = MOTES[stage.id] ?? MOTES[0];
  for (let i = 0; i < 12; i++) {
    const speed = 12 + hash01(i) * 20;
    const rise = stage.id === 3 || stage.id === 5 ? time * 9 * (0.6 + hash01(i * 9)) : 0;
    const mx = ((hash01(i * 31) * w + time * speed) % (w + 30)) - 15;
    let my = horizon * 0.4 + hash01(i * 57) * (h - horizon * 0.4) + Math.sin(time * (1 + hash01(i)) + i * 2) * 14;
    if (rise) my = h - ((my + rise) % (h - horizon * 0.3));
    const pulse = mote.glow ? 0.3 + Math.abs(Math.sin(time * 2.4 + i * 1.7)) * 0.7 : 0.7;
    ctx.globalAlpha = pulse;
    if (mote.glow) {
      ctx.shadowColor = mote.color;
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = mote.color;
    ctx.beginPath();
    ctx.arc(mx, my, mote.glow ? 1.9 : 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  // low mist banks for the swamp hollow
  if (stage.id === 2) {
    ctx.fillStyle = "rgba(215, 230, 210, 0.13)";
    for (let i = 0; i < 4; i++) {
      const mx = ((time * (7 + i * 3) + i * 240) % (w + 320)) - 160;
      const my = horizon + 26 + i * ((h - horizon) / 5);
      ctx.beginPath();
      ctx.ellipse(mx, my, 130 + i * 20, 13 + i * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSetDressing(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
): void {
  const groundAt = (t: number, band: number) => horizon + 14 + hash01(t) * (h - horizon - 30) * band;
  // ground variation shared by every field: scattered pebbles
  for (let i = 0; i < 9; i++) {
    const px = hash01(i * 17 + stage.id * 91) * w;
    const py = horizon + 20 + hash01(i * 29 + stage.id * 7) * (h - horizon - 40);
    if (i % 3 !== 0) {
      ctx.fillStyle = "rgba(20, 14, 30, 0.18)";
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + hash01(i * 5) * 1.8, 0, Math.PI * 2);
      ctx.arc(px + 5, py + 2, 1.2 + hash01(i * 7) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (stage.id === 0) {
    // meadow flowers nodding in the breeze, loosely clustered
    for (let i = 0; i < 12; i++) {
      const cluster = Math.floor(i / 3);
      const fx2 = hash01(cluster * 41) * w + (hash01(i * 7) - 0.5) * 46;
      const fy2 = horizon + 30 + hash01(cluster * 23) * (h - horizon - 50) + (hash01(i * 11) - 0.5) * 20;
      const sway = Math.sin(time * 1.8 + i * 2) * 1.5;
      ctx.strokeStyle = "#5c7a3e";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fx2, fy2);
      ctx.quadraticCurveTo(fx2 + sway, fy2 - 6, fx2 + sway * 1.4, fy2 - 11);
      ctx.stroke();
      ctx.fillStyle = i % 2 ? "#e8d9b0" : "#d98a8a";
      ctx.beginPath();
      ctx.arc(fx2 + sway * 1.4, fy2 - 12, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2d16b";
      ctx.beginPath();
      ctx.arc(fx2 + sway * 1.4, fy2 - 12, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    // a broken cart, wheels off, spilled sacks — the goblins got here first
    const cx2 = w * 0.3;
    const cy2 = groundAt(6.1, 0.35);
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(-0.09);
    roundRect(ctx, -30, -18, 60, 16, 3);
    outlined(ctx, "#7a5a38", 2.2);
    ctx.strokeStyle = "#5c4228";
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, -18);
      ctx.lineTo(i * 12, -2);
      ctx.stroke();
    }
    ctx.restore();
    // detached wheel leaning on the cart
    ctx.beginPath();
    ctx.arc(cx2 + 36, cy2 - 6, 10, 0, Math.PI * 2);
    outlined(ctx, "#6b4a2a", 2.2);
    ctx.strokeStyle = "#4a3220";
    ctx.lineWidth = 1.6;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx2 + 36 - Math.cos(a) * 9, cy2 - 6 - Math.sin(a) * 9);
      ctx.lineTo(cx2 + 36 + Math.cos(a) * 9, cy2 - 6 + Math.sin(a) * 9);
      ctx.stroke();
    }
    // spilled grain sack
    ctx.beginPath();
    ctx.ellipse(cx2 - 42, cy2 - 3, 11, 6, 0.4, 0, Math.PI * 2);
    outlined(ctx, "#c9b98a", 1.8);
    ctx.fillStyle = "#e8d9a8";
    ctx.beginPath();
    ctx.ellipse(cx2 - 50, cy2 + 2, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (stage.id === 1) {
    // the ogre's deadfall: gnawed bone pile + a claw-scarred trunk
    const bx2 = w * 0.7;
    const by2 = groundAt(2.2, 0.6);
    ctx.fillStyle = "#d8cfc0";
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(bx2, by2, 13, 5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx2 - 10, by2 - 4);
    ctx.lineTo(bx2 - 2, by2 - 9);
    ctx.moveTo(bx2 + 3, by2 - 3);
    ctx.lineTo(bx2 + 10, by2 - 8);
    ctx.strokeStyle = "#c9bfae";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
    // mossy fallen log to fight around
    const lx2 = w * 0.45;
    const ly2 = groundAt(9.4, 0.85);
    ctx.save();
    ctx.translate(lx2, ly2);
    ctx.rotate(0.06);
    roundRect(ctx, -36, -6, 72, 12, 6);
    outlined(ctx, "#4a3a2c", 2.2);
    ctx.fillStyle = "#4f6a3a";
    ctx.beginPath();
    ctx.ellipse(-14, -5, 14, 4, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(16, -5, 10, 3, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (stage.id === 2) {
    // clusters of glowing marsh mushrooms
    for (let i = 0; i < 3; i++) {
      const mx2 = w * (0.15 + i * 0.35) + hash01(i * 19) * 30;
      const my2 = groundAt(i * 6.7, 0.9);
      const pulse = 0.5 + Math.abs(Math.sin(time * 1.8 + i * 2.4)) * 0.5;
      for (let m = 0; m < 3; m++) {
        const ox = (m - 1) * 7 + hash01(m * 3 + i) * 3;
        const mh = 6 + hash01(m + i * 5) * 5;
        ctx.strokeStyle = "#5c7a66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx2 + ox, my2);
        ctx.lineTo(mx2 + ox, my2 - mh);
        ctx.stroke();
        ctx.shadowColor = "#7de8c9";
        ctx.shadowBlur = 7 * pulse;
        ctx.fillStyle = `rgba(125, 232, 201, ${0.5 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(mx2 + ox, my2 - mh, 4.5, 3, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
  if (stage.id === 4) {
    // wolf eyes blinking in the dark brush — the pack is watching
    for (let i = 0; i < 3; i++) {
      const ex = w * (0.1 + i * 0.4) + hash01(i * 7) * 40;
      const ey = horizon + 12 + hash01(i * 11) * 14;
      const blink = Math.abs(Math.sin(time * 0.7 + i * 2.9));
      if (blink > 0.2) {
        ctx.fillStyle = `rgba(255, 200, 90, ${Math.min(0.85, blink)})`;
        ctx.shadowColor = "#ffc85a";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.7, 0, Math.PI * 2);
        ctx.arc(ex + 7, ey, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
  if (stage.id === 0) {
    // farmland: a worn fence line + a haystack
    const fy = horizon + 26;
    ctx.strokeStyle = "#6b5a3a";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const fx = w * 0.12 + i * 34;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 16);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(w * 0.12 - 8, fy - 12);
    ctx.lineTo(w * 0.12 + 4 * 34 + 8, fy - 13);
    ctx.moveTo(w * 0.12 - 8, fy - 5);
    ctx.lineTo(w * 0.12 + 4 * 34 + 8, fy - 6);
    ctx.stroke();
    const hx = w * 0.82;
    const hy = groundAt(3.7, 0.5);
    ctx.beginPath();
    ctx.ellipse(hx, hy, 26, 17, 0, Math.PI, Math.PI * 2);
    outlined(ctx, "#c9a95c", 2);
    ctx.strokeStyle = "#a8863f";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(hx - 18 + i * 10, hy - 2);
      ctx.lineTo(hx - 12 + i * 10, hy - 13 + (i % 2) * 3);
      ctx.stroke();
    }
  } else if (stage.id === 1) {
    // deep pines: tapered flanking trunks with bark and a root flare
    for (const [tx, s] of [[w * 0.05, 1.15], [w * 0.96, 0.95]] as [number, number][]) {
      const tw = 10 * s;
      const topY = horizon + 6;
      ctx.beginPath();
      ctx.moveTo(tx - tw * 1.5, h - 2);
      ctx.quadraticCurveTo(tx - tw * 0.7, h - 16, tx - tw * 0.6, horizon + 44);
      ctx.lineTo(tx - tw * 0.52, topY);
      ctx.lineTo(tx + tw * 0.52, topY);
      ctx.lineTo(tx + tw * 0.6, horizon + 44);
      ctx.quadraticCurveTo(tx + tw * 0.7, h - 16, tx + tw * 1.5, h - 2);
      ctx.closePath();
      outlined(ctx, "#31473a", 2.2);
      // bark streaks
      ctx.strokeStyle = "rgba(20, 30, 22, 0.55)";
      ctx.lineWidth = 1.6;
      for (let bkI = 0; bkI < 3; bkI++) {
        const bx = tx - tw * 0.3 + bkI * tw * 0.3;
        ctx.beginPath();
        ctx.moveTo(bx, topY + 14 + bkI * 9);
        ctx.quadraticCurveTo(bx + 2, (topY + h) / 2, bx - 1, h - 22 - bkI * 8);
        ctx.stroke();
      }
      // canopy shade pooling at the base
      ctx.fillStyle = "rgba(20, 40, 28, 0.4)";
      ctx.beginPath();
      ctx.ellipse(tx, topY + 4, 46 * s, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (stage.id === 2) {
    // swamp: still pools with reeds
    for (let i = 0; i < 3; i++) {
      const px = w * (0.2 + i * 0.3) + hash01(i * 9) * 40;
      const py = groundAt(i * 3.3, 0.8);
      ctx.fillStyle = "rgba(90, 140, 150, 0.5)";
      ctx.beginPath();
      ctx.ellipse(px, py, 40 + hash01(i) * 24, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200, 230, 225, 0.35)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(px, py, 30 + hash01(i) * 20, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#3a5c46";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      for (let rd = 0; rd < 4; rd++) {
        const rx = px - 30 + rd * 18 + hash01(rd * 3 + i) * 8;
        const sway = Math.sin(time * 1.4 + rd + i) * 2;
        ctx.beginPath();
        ctx.moveTo(rx, py + 2);
        ctx.quadraticCurveTo(rx + sway, py - 12, rx + sway * 1.6, py - 20 - hash01(rd) * 8);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }
  } else if (stage.id === 3) {
    // charwood: fallen burnt logs + rising smoke wisps
    for (let i = 0; i < 2; i++) {
      const lx = w * (0.25 + i * 0.45);
      const ly = groundAt(i * 7.1, 0.7);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(i === 0 ? 0.12 : -0.18);
      roundRect(ctx, -44, -7, 88, 14, 7);
      outlined(ctx, "#2e2420", 2.2);
      ctx.fillStyle = "#4a3226";
      ctx.beginPath();
      ctx.arc(-44, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      // ember cracks
      ctx.strokeStyle = "#ff8a50";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-20, -2);
      ctx.lineTo(-6, 2);
      ctx.moveTo(10, -3);
      ctx.lineTo(24, 1);
      ctx.stroke();
      ctx.restore();
      const puff = (time * 8 + i * 30) % 40;
      ctx.globalAlpha = Math.max(0, 0.35 - puff * 0.008);
      ctx.fillStyle = "#b8afa5";
      ctx.beginPath();
      ctx.arc(lx + 10, ly - 10 - puff, 5 + puff * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else if (stage.id === 4) {
    // gloaming pass: leaning standing stones with faint runes
    for (let i = 0; i < 3; i++) {
      const sx = w * (0.18 + i * 0.32);
      const sy = groundAt(i * 5.9, 0.75);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate((hash01(i * 13) - 0.5) * 0.24);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-7, -34 - hash01(i) * 14);
      ctx.lineTo(6, -38 - hash01(i) * 14);
      ctx.lineTo(11, 0);
      ctx.closePath();
      outlined(ctx, "#4a4468", 2.2);
      ctx.fillStyle = "rgba(200, 190, 255, " + (0.25 + Math.abs(Math.sin(time * 1.5 + i)) * 0.3) + ")";
      ctx.fillRect(-2, -26, 3, 8);
      ctx.fillRect(-4, -14, 6, 2.5);
      ctx.restore();
    }
  } else if (stage.id === 5) {
    // the hollow: bone piles + a crooked war banner
    for (let i = 0; i < 2; i++) {
      const bx = w * (0.3 + i * 0.4);
      const by = groundAt(i * 4.4, 0.7);
      ctx.fillStyle = "#d8cfc0";
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(bx, by, 16, 6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx - 8, by - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(bx - 10, by - 7, 1.4, 0, Math.PI * 2);
      ctx.arc(bx - 6, by - 7, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const px = w * 0.85;
    const py = groundAt(8.3, 0.5);
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 4, py - 52);
    ctx.stroke();
    const flap = Math.sin(time * 2.6) * 4;
    ctx.beginPath();
    ctx.moveTo(px + 4, py - 52);
    ctx.lineTo(px + 30 + flap, py - 46);
    ctx.lineTo(px + 22 + flap, py - 40);
    ctx.lineTo(px + 30 + flap, py - 34);
    ctx.lineTo(px + 3, py - 30);
    ctx.closePath();
    outlined(ctx, "#8a2f2a", 2);
  }
}

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const v = ctx.createRadialGradient(w / 2, h * 0.44, Math.min(w, h) * 0.55, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(16,10,26,0.26)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ zones

export function drawTelegraphs(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const mark of battle.telegraphs) {
    const t = mark.time / mark.duration;
    const urgency = 0.35 + t * 0.55;
    ctx.globalAlpha = urgency;
    ctx.strokeStyle = "#ff8a70";
    ctx.lineWidth = 3 + t * 2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -battle.time * 30;
    ctx.beginPath();
    ctx.ellipse(mark.x, mark.y, mark.radius, mark.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // shrinking inner ring counts down the impact
    ctx.globalAlpha = urgency * 0.6;
    ctx.fillStyle = "rgba(255, 100, 70, 0.18)";
    ctx.beginPath();
    ctx.ellipse(mark.x, mark.y, mark.radius * (1 - t * 0.5), mark.radius * 0.55 * (1 - t * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();
    // paw mark
    ctx.globalAlpha = urgency;
    ctx.fillStyle = "#ff8a70";
    ctx.beginPath();
    ctx.ellipse(mark.x, mark.y + 2, 7, 5, 0, 0, Math.PI * 2);
    for (let i = -1; i <= 1; i++) {
      ctx.ellipse(mark.x + i * 7, mark.y - 7, 2.8, 3.6, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawZones(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const zone of battle.zones) {
    const fade = Math.min(1, (zone.duration - zone.time) / 0.8, zone.time / 0.25 + 0.4);
    if (zone.kind === "sanctuary") {
      // consecrated ground: warm glow, slow halo ring, drifting motes
      ctx.globalAlpha = 0.4 * fade;
      const holy = ctx.createRadialGradient(zone.x, zone.y, 4, zone.x, zone.y, zone.radius);
      holy.addColorStop(0, "#fff6d0");
      holy.addColorStop(1, "rgba(242, 231, 160, 0)");
      ctx.fillStyle = holy;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75 * fade;
      ctx.strokeStyle = "#f2e7a0";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -battle.time * 18;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius * 0.92, zone.radius * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff6d0";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + battle.time * 0.7;
        const rise = ((battle.time * 14 + i * 17) % 30);
        ctx.globalAlpha = (1 - rise / 30) * 0.8 * fade;
        ctx.beginPath();
        ctx.arc(zone.x + Math.cos(a) * zone.radius * 0.5, zone.y + Math.sin(a) * zone.radius * 0.28 - rise, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = 0.45 * fade;
    const grad = ctx.createRadialGradient(zone.x, zone.y, 4, zone.x, zone.y, zone.radius);
    grad.addColorStop(0, "#e4f4ff");
    grad.addColorStop(1, "rgba(120, 190, 235, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = "#cfeaff";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + zone.x * 0.13;
      const sx = zone.x + Math.cos(a) * zone.radius * (0.3 + hash01(i + zone.x) * 0.35);
      const sy = zone.y + Math.sin(a) * zone.radius * 0.3;
      const s = 3 + hash01(i * 3 + zone.y) * 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx + s * 0.7, sy + s * 0.5);
      ctx.lineTo(sx - s * 0.7, sy + s * 0.5);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ shared unit bits

const hpGhosts = new WeakMap<Unit, number>();

function drawHealthBar(ctx: CanvasRenderingContext2D, unit: Unit, top: number): void {
  const w = Math.max(28, unit.radius * 2.2);
  const x = unit.x - w / 2;
  const y = top;
  const frac = Math.max(0, unit.hp / unit.stats.maxHp);
  // ghost trails the real bar so damage reads as a draining chunk
  let ghost = hpGhosts.get(unit) ?? frac;
  ghost = ghost < frac ? frac : Math.max(frac, ghost - Math.max(0.008, (ghost - frac) * 0.09));
  hpGhosts.set(unit, ghost);
  roundRect(ctx, x - 1, y - 1, w + 2, 6, 3);
  ctx.fillStyle = "rgba(18, 12, 24, 0.78)";
  ctx.fill();
  if (ghost > frac + 0.004) {
    roundRect(ctx, x, y, w * ghost, 4, 2);
    ctx.fillStyle = "rgba(255, 235, 210, 0.8)";
    ctx.fill();
  }
  if (frac > 0) {
    roundRect(ctx, x, y, w * frac, 4, 2);
    ctx.fillStyle = unit.team === "hero" ? (frac > 0.35 ? "#6fce65" : "#e0b23e") : "#d1543f";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, x, y, w * frac, 1.6, 0.8);
    ctx.fill();
  }
  const shield = unit.effects.find((e) => e.kind === "shield");
  if (shield) {
    roundRect(ctx, x, y - 4.5, Math.min(w, (shield.power / unit.stats.maxHp) * w), 3, 1.5);
    ctx.fillStyle = "#9fc6e8";
    ctx.fill();
  }
}

function drawEffectPips(ctx: CanvasRenderingContext2D, unit: Unit, x: number, y: number): void {
  const marks: { color: string; label: string }[] = [];
  for (const effect of unit.effects) {
    if (effect.kind === "stun") marks.push({ color: "#f2d16b", label: "✦" });
    if (effect.kind === "slow") marks.push({ color: "#9fd6f2", label: "❄" });
    if (effect.kind === "haste") marks.push({ color: "#8ed081", label: "»" });
    if (effect.kind === "guard") marks.push({ color: "#e0904b", label: "▲" });
    if (effect.kind === "burn") marks.push({ color: "#ff9b42", label: "♨" });
  }
  if (!marks.length) return;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  marks.slice(0, 4).forEach((mark, i) => {
    ctx.fillStyle = mark.color;
    ctx.fillText(mark.label, x + (i - (Math.min(marks.length, 4) - 1) / 2) * 12, y);
  });
}

interface Pose {
  cx: number;
  groundY: number;
  f: 1 | -1;
  walk: number; // leg scissor -1..1
  bounce: number; // vertical hop from walking
  swing: number; // 0..1 attack swing envelope
  breathe: number;
}

function poseOf(unit: Unit, time: number): Pose {
  const moving =
    unit.moveTarget !== null ||
    (unit.team === "enemy" && unit.lunge <= 0) ||
    (unit.attackTarget !== null && unit.lunge <= 0);
  const walk = moving ? Math.sin(unit.bobPhase) : 0;
  let bounce = moving ? Math.abs(Math.cos(unit.bobPhase)) * 2.2 : 0;
  // anticipation pulls the weapon back just before the strike lands
  let swing = Math.sin(Math.min(1, unit.lunge) * Math.PI);
  if (unit.windup > 0) swing = -0.4 * (unit.windup / 0.13);
  if (unit.alert > 0) bounce += Math.sin((1 - unit.alert / 0.5) * Math.PI) * 5;
  if (unit.celebrate) bounce += Math.abs(Math.sin(time * 6 + unit.id)) * 5;
  if (unit.idleAnim > 0) bounce += Math.sin((1 - unit.idleAnim / 0.7) * Math.PI * 2) * 1.6;
  const lx = unit.lungeDir.x * unit.lunge * 9;
  const ly = unit.lungeDir.y * unit.lunge * 9;
  return {
    cx: unit.x + lx,
    groundY: unit.y + ly,
    f: unit.facing,
    walk,
    bounce,
    swing,
    breathe: Math.sin(time * 2.4 + unit.id) * 0.8 + (unit.idleAnim > 0 ? Math.sin((1 - unit.idleAnim / 0.7) * Math.PI) * 1.4 : 0),
  };
}

function drawShadow(ctx: CanvasRenderingContext2D, unit: Unit, bounce = 0): void {
  // the shadow shrinks and fades a touch at the top of a hop — grounds the bounce
  const lift = Math.min(1, bounce / 6);
  ctx.fillStyle = `rgba(20, 14, 30, ${0.3 - lift * 0.1})`;
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.15 * (1 - lift * 0.18), unit.radius * 0.4 * (1 - lift * 0.18), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Is this unit's blink shut right now? Cheap periodic blink, offset per unit. */
function blinkShut(unit: Unit, time: number): boolean {
  const period = 2.8 + hash01(unit.id * 13.7) * 2.2;
  return ((time + unit.id * 1.31) % period) > period - 0.14;
}

function drawSelection(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const accent = unit.heroIndex >= 0 ? HEROES[unit.heroIndex].accent : "#fff0b4";
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.55, unit.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function flashOverlay(ctx: CanvasRenderingContext2D, unit: Unit, cx: number, cy: number, r: number): void {
  if (unit.hitFlash > 0) {
    // soft radial pop, not a hard white disc
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 0.9);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.65, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = Math.min(0.55, unit.hitFlash * 3.4);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ heroes

/** When true, unit renderers skip battle chrome (health bars, status pips). */
let figureMode = false;

/**
 * Full-body hero render for menu screens — the real in-battle drawing with
 * live weapon morph and armor tier, minus combat chrome. `t` animates idle.
 */
export function drawHeroFigure(
  canvas: HTMLCanvasElement,
  heroIndex: number,
  save: SaveData,
  t: number,
): void {
  const ctx = canvas.getContext("2d")!;
  const hero = save.heroes[heroIndex];
  const stats = deriveStats(hero.attrs, hero.weaponTier, hero.armorTier, hero.talents, hero.trinket, hero.calling);
  const radius = 13;
  const scale = canvas.height / (radius * 3.7 * 1.55);
  const unit = {
    id: heroIndex,
    name: HEROES[heroIndex].name,
    team: "hero",
    heroIndex,
    enemyKind: null,
    calling: hero.calling,
    x: canvas.width / 2 / scale,
    y: canvas.height / scale - radius * 0.9,
    radius,
    stats,
    hp: stats.maxHp,
    attackTimer: 0,
    moveTarget: null,
    attackTarget: null,
    healTarget: null,
    stance: "attack",
    autoOrder: false,
    abilities: [],
    effects: [],
    facing: 1,
    bobPhase: 0,
    lunge: 0,
    lungeDir: { x: 0, y: 0 },
    hitFlash: 0,
    castGlow: 0,
    channelBeam: 0,
    deathTime: 0,
    alive: true,
    aggro: null,
    supportTimer: 0,
    phase: 0,
    windup: 0,
    pendingTarget: null,
    alert: 0,
    celebrate: false,
    idleTimer: 0,
    idleAnim: 0,
  } as unknown as Unit;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  figureMode = true;
  drawHero(ctx, unit, save, false, t);
  figureMode = false;
  ctx.restore();
}

function drawHero(ctx: CanvasRenderingContext2D, unit: Unit, save: SaveData, selected: boolean, time: number): void {
  const def = HEROES[unit.heroIndex];
  const pose = poseOf(unit, time);
  const H = unit.radius * 3.7;
  const { cx, f } = pose;
  const gy = pose.groundY - pose.bounce;

  drawShadow(ctx, unit, pose.bounce);
  if (selected) drawSelection(ctx, unit, time);

  const hipY = gy - H * 0.30;
  const shoulderY = gy - H * 0.52 + pose.breathe * 0.4;
  const headR = H * 0.29;
  const headY = shoulderY - headR * 0.85;
  const bodyW = H * 0.34;
  const legW = H * 0.10;
  const stride = H * 0.14;
  const robed = unit.stats.weapon === "stave";
  const gear = save.heroes[unit.heroIndex];
  const wTier = gear?.weaponTier ?? 0;
  const aTier = gear?.armorTier ?? 0;

  // back leg, back arm behind body
  if (!robed) {
    const bfx = cx - f * 2 - f * pose.walk * stride;
    limb(ctx, cx - f * 2, hipY, bfx, gy - 1, legW, "#3a2f47");
    boot(ctx, bfx, gy - 1, "#2b2136");
  }
  // free back arm swings opposite the stride
  const bhx = cx - f * bodyW * 0.55 - f * pose.walk * H * 0.06;
  const bhy = shoulderY + H * 0.16 + pose.walk * 2;
  limb(ctx, cx - f * bodyW * 0.3, shoulderY + 3, bhx, bhy, legW * 0.85, def.skin);
  hand(ctx, bhx, bhy, def.skin);

  if (robed) {
    // full healer's robe: cream cloth to the ground, accent stole, swaying hem
    const hem = Math.sin(unit.bobPhase * 0.9) * 2;
    const robe = new Path2D();
    robe.moveTo(cx - bodyW * 0.72 + hem * 0.4, gy);
    robe.quadraticCurveTo(cx - bodyW * 0.6, hipY - H * 0.06, cx - bodyW * 0.34 + f * 1.5, shoulderY - 2);
    robe.lineTo(cx + bodyW * 0.34 + f * 1.5, shoulderY - 2);
    robe.quadraticCurveTo(cx + bodyW * 0.6, hipY - H * 0.06, cx + bodyW * 0.72 - hem * 0.4, gy);
    robe.quadraticCurveTo(cx + hem, gy + 2.5, cx - bodyW * 0.72 + hem * 0.4, gy);
    robe.closePath();
    shaded(ctx, robe, "#efe6d0", f, cx, (shoulderY + gy) / 2, H * 0.32);
    // accent stole draped down the front — breaks up the snowman silhouette
    ctx.save();
    ctx.clip(robe);
    ctx.fillStyle = def.accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(cx + f * bodyW * 0.16 - 2.2, shoulderY - 2, 4.4, gy - shoulderY);
    ctx.globalAlpha = 1;
    ctx.restore();
    // rope belt
    ctx.strokeStyle = "#c9a95c";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.5, hipY);
    ctx.quadraticCurveTo(cx, hipY + 3.5, cx + bodyW * 0.5, hipY);
    ctx.stroke();
  } else {
    // front leg
    const ffx = cx + f * 2 + f * pose.walk * stride;
    limb(ctx, cx + f * 2, hipY, ffx, gy - 1, legW, "#4a3d5c");
    boot(ctx, ffx, gy - 1, "#33283f");

    // tunic body (trapezoid, slightly leaning into facing)
    const tunic = new Path2D();
    tunic.moveTo(cx - bodyW * 0.52, hipY + 3);
    tunic.quadraticCurveTo(cx - bodyW * 0.62, shoulderY, cx - bodyW * 0.34 + f * 1.5, shoulderY - 2);
    tunic.lineTo(cx + bodyW * 0.34 + f * 1.5, shoulderY - 2);
    tunic.quadraticCurveTo(cx + bodyW * 0.62, shoulderY, cx + bodyW * 0.52, hipY + 3);
    tunic.quadraticCurveTo(cx, hipY + H * 0.07, cx - bodyW * 0.52, hipY + 3);
    tunic.closePath();
    shaded(ctx, tunic, def.accent, f, cx, (shoulderY + hipY) / 2, bodyW * 0.55);
    // belt
    ctx.fillStyle = "rgba(20,14,30,0.5)";
    ctx.fillRect(cx - bodyW * 0.5, hipY - 1, bodyW, 3);
    ctx.fillStyle = "#c9a95c";
    ctx.fillRect(cx + f * 1.5 - 1.6, hipY - 0.5, 3.2, 2.2);
  }

  // armor flair grows with tier
  if (!robed && aTier >= 1) {
    // leather shoulder pad
    ctx.beginPath();
    ctx.ellipse(cx + f * bodyW * 0.34, shoulderY, bodyW * 0.26, bodyW * 0.18, f * 0.3, 0, Math.PI * 2);
    outlined(ctx, aTier >= 3 ? "#aab4c2" : "#7a5a3a", 2);
  }
  if (!robed && aTier >= 2) {
    // chain band across the chest
    ctx.strokeStyle = aTier >= 3 ? "#c2ccda" : "#9aa3ad";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, shoulderY + 2);
    ctx.lineTo(cx + bodyW * 0.42, hipY - 2);
    ctx.stroke();
  }

  // head (big, chibi)
  const faceX = cx + f * 1.5;
  const head = new Path2D();
  head.arc(faceX, headY, headR, 0, Math.PI * 2);
  shaded(ctx, head, def.skin, f, faceX, headY, headR);
  if (!robed && aTier >= 3) {
    // plate helm with a nose guard
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - headR * 0.1, headR * 1.04, Math.PI * 0.9, Math.PI * 2.1);
    ctx.closePath();
    outlined(ctx, "#aab4c2", 2.2);
    ctx.fillStyle = "#aab4c2";
    ctx.fillRect(cx + f * headR * 0.3 - 1.6, headY - headR * 0.35, 3.2, headR * 0.75);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx + f * headR * 0.3 - 1.6, headY - headR * 0.35, 3.2, headR * 0.75);
    // plume
    ctx.beginPath();
    ctx.moveTo(cx - f * 1, headY - headR * 1.05);
    ctx.quadraticCurveTo(cx - f * headR * 0.9, headY - headR * 1.7, cx - f * headR * 1.35, headY - headR * 1.2);
    ctx.quadraticCurveTo(cx - f * headR * 0.8, headY - headR * 1.05, cx - f * 1, headY - headR * 0.85);
    ctx.closePath();
    outlined(ctx, def.accent, 1.8);
  } else if (robed) {
    // deep cream hood framing the face, with an inner shadow so the face pops
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - 1, headR * 1.12, Math.PI * 0.72, Math.PI * 2.28);
    ctx.quadraticCurveTo(cx - f * headR * 0.2, headY + headR * 0.9, cx - f * headR * 1.05, headY + headR * 0.5);
    ctx.closePath();
    outlined(ctx, "#efe6d0", 2);
    ctx.strokeStyle = "rgba(20,14,30,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - 1, headR * 0.98, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
  } else if (unit.heroIndex === 1) {
    // Wren: forest hood with a fletcher's feather
    ctx.beginPath();
    ctx.arc(faceX - f * 0.5, headY - 1, headR * 1.08, Math.PI * 0.76, Math.PI * 2.24);
    ctx.quadraticCurveTo(faceX - f * headR * 0.3, headY + headR * 0.8, faceX - f * headR * 1.1, headY + headR * 0.4);
    ctx.closePath();
    outlined(ctx, def.accent, 2);
    ctx.beginPath();
    ctx.moveTo(faceX - f * headR * 0.5, headY - headR * 0.9);
    ctx.quadraticCurveTo(faceX - f * headR * 1.2, headY - headR * 1.7, faceX - f * headR * 1.5, headY - headR * 1.1);
    ctx.quadraticCurveTo(faceX - f * headR * 1.0, headY - headR * 1.05, faceX - f * headR * 0.5, headY - headR * 0.7);
    ctx.closePath();
    outlined(ctx, "#d9534f", 1.6);
  } else if (unit.heroIndex === 2) {
    // Ezri: long ember hair swept back + a thin circlet
    ctx.beginPath();
    ctx.arc(faceX - f * 0.5, headY - headR * 0.1, headR * 1.0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.quadraticCurveTo(faceX - f * headR * 1.5, headY + headR * 0.4, faceX - f * headR * 1.15, headY + headR * 1.05);
    ctx.quadraticCurveTo(faceX - f * headR * 0.75, headY + headR * 0.65, faceX - f * headR * 0.55, headY + headR * 0.35);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    ctx.strokeStyle = "#d8b25a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(faceX, headY - headR * 0.05, headR * 0.99, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    // hair cap (Bram gets a leather headband)
    ctx.beginPath();
    ctx.arc(faceX - f * 1, headY - headR * 0.12, headR * 0.98, Math.PI * 0.98, Math.PI * 2.02);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    if (unit.heroIndex === 0) {
      ctx.strokeStyle = "#8a4a2a";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(faceX, headY - headR * 0.1, headR * 0.96, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  }
  // chibi face: two eyes toward facing (they blink!), brows, a living mouth, blush
  const eyeY = headY + headR * 0.1;
  const eyeXs = [faceX + f * headR * 0.62, faceX + f * headR * 0.06];
  const shut = blinkShut(unit, time);
  for (const ex of eyeXs) {
    if (shut) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ex - f * headR * 0.17, eyeY + headR * 0.03);
      ctx.quadraticCurveTo(ex, eyeY + headR * 0.12, ex + f * headR * 0.17, eyeY + headR * 0.03);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, headR * 0.2, headR * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fdf8ee";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(ex + f * headR * 0.07, eyeY + headR * 0.04, headR * 0.115, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  for (const ex of eyeXs) {
    ctx.beginPath();
    ctx.moveTo(ex - f * headR * 0.18, eyeY - headR * 0.42);
    ctx.lineTo(ex + f * headR * 0.2, eyeY - headR * 0.36);
    ctx.stroke();
  }
  // mouth tracks the fight: grit while swinging, worry when hurt, easy smile otherwise
  const mouthX = faceX + f * headR * 0.34;
  const mouthY = headY + headR * 0.5;
  const hurt = unit.hp < unit.stats.maxHp * 0.3;
  const fighting = (unit.attackTarget?.alive ?? false) || pose.swing > 0.25 || unit.windup > 0;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (hurt) {
    ctx.arc(mouthX, mouthY + headR * 0.18, headR * 0.13, Math.PI * 1.15, Math.PI * 1.85);
  } else if (fighting) {
    ctx.moveTo(mouthX - headR * 0.17, mouthY + headR * 0.02);
    ctx.lineTo(mouthX + headR * 0.17, mouthY - headR * 0.03);
    ctx.moveTo(mouthX - headR * 0.04, mouthY - headR * 0.05);
    ctx.lineTo(mouthX - headR * 0.04, mouthY + headR * 0.06);
  } else {
    ctx.arc(mouthX, mouthY, headR * 0.14, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#d96a4a";
  ctx.beginPath();
  ctx.ellipse(faceX + f * headR * 0.78, headY + headR * 0.42, headR * 0.16, headR * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(faceX - f * headR * 0.18, headY + headR * 0.46, headR * 0.16, headR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // weapon arm + weapon (front) — the shoulder sways against the stride
  const shX = cx + f * bodyW * 0.36 - f * pose.walk * 1.4;
  const shY = shoulderY + 2;
  drawHeroWeapon(ctx, unit, def.accent, def.skin, shX, shY, H, f, pose.swing, unit.castGlow, time, legW, wTier);

  flashOverlay(ctx, unit, cx, gy - H * 0.45, H * 0.5);
  if (unit.castGlow > 0) {
    ctx.globalAlpha = unit.castGlow * 1.6;
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, gy - H * 0.45, H * 0.55 + (0.4 - unit.castGlow) * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (!figureMode) {
    drawEffectPips(ctx, unit, cx, gy - H - 16);
    drawHealthBar(ctx, unit, gy - H - 12);
  }
}

function drawHeroWeapon(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  accent: string,
  skin: string,
  shX: number,
  shY: number,
  H: number,
  f: number,
  swing: number,
  castGlow: number,
  time: number,
  armW: number,
  wTier = 0,
): void {
  // blade metals sharpen with tier; mythril glows faintly
  const metal = ["#c9ccd2", "#d8dee8", "#e8eef8", "#cfe8ff"][wTier] ?? "#d8dee8";
  const glow = wTier >= 3;
  if (unit.stats.weapon === "sword") {
    // arm rotates from rest through a big arc on swing
    const angle = f * (-0.6 + swing * 1.85);
    const handX = shX + Math.cos(angle) * H * 0.22;
    const handY = shY + Math.sin(angle) * H * 0.22 + H * 0.06;
    limb(ctx, shX, shY, handX, handY, armW * 0.9, skin);
    hand(ctx, handX, handY, skin);
    // ghost trail of the blade sweeping through its arc
    if (swing > 0.15) {
      for (let g = 1; g <= 3; g++) {
        const gAngle = f * (-0.6 + Math.max(0, swing - g * 0.22) * 1.85);
        const gx = shX + Math.cos(gAngle) * H * 0.22;
        const gy = shY + Math.sin(gAngle) * H * 0.22 + H * 0.06;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(gAngle + f * 0.35 - f * Math.PI / 2);
        ctx.globalAlpha = 0.16 * (4 - g) * swing;
        ctx.strokeStyle = "#fff6d8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, -H * 0.55);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle + f * 0.35 - f * Math.PI / 2);
    // blade
    ctx.beginPath();
    ctx.moveTo(-2.4, -4);
    ctx.lineTo(-1.6, -H * 0.52);
    ctx.lineTo(0, -H * 0.58);
    ctx.lineTo(1.6, -H * 0.52);
    ctx.lineTo(2.4, -4);
    ctx.closePath();
    if (glow) {
      ctx.shadowColor = "#9fd0ff";
      ctx.shadowBlur = 8;
    }
    outlined(ctx, metal, 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(-0.6, -H * 0.52, 1.2, H * 0.46);
    if (wTier >= 2) {
      // steel and above get a fuller, wider blade profile
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1.8, -6);
      ctx.lineTo(-1.2, -H * 0.5);
      ctx.stroke();
    }
    // crossguard + grip
    roundRect(ctx, -5, -4.5, 10, 3.4, 1.5);
    outlined(ctx, "#a8862f", 1.8);
    roundRect(ctx, -1.7, -1, 3.4, 6.5, 1.5);
    outlined(ctx, "#6b4a2a", 1.6);
    ctx.restore();
  } else if (unit.stats.weapon === "bow") {
    const handX = shX + f * H * 0.2;
    const handY = shY + H * 0.05;
    limb(ctx, shX, shY, handX, handY, armW * 0.85, skin);
    hand(ctx, handX, handY, skin);
    ctx.save();
    ctx.translate(handX, handY);
    ctx.scale(f, 1);
    const draw = swing; // string pull
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.26, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    ctx.strokeStyle = "#9c7440";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.26, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    const tipY = Math.sin(Math.PI / 2.5) * H * 0.26;
    const tipX = Math.cos(Math.PI / 2.5) * H * 0.26;
    ctx.strokeStyle = "#efe8d4";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tipX, -tipY);
    ctx.lineTo(-draw * H * 0.14, 0);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (draw > 0.08) {
      limb(ctx, -draw * H * 0.14 - 6, 0, -draw * H * 0.14 + H * 0.2, 0, 2.4, "#d9c9a0");
    }
    ctx.restore();
  } else if (unit.stats.weapon === "stave") {
    // healer's stave: tall crook with a radiant sun-disc that flares when casting
    const raise = Math.max(swing, castGlow * 2.2);
    const angle = f * (-0.25 - raise * 0.5);
    const handX = shX + Math.cos(angle) * H * 0.18;
    const handY = shY + Math.sin(angle) * H * 0.18 + H * 0.05;
    limb(ctx, shX, shY, handX, handY, armW * 0.85, skin);
    hand(ctx, handX, handY, skin);
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle * 0.35 - f * 0.08);
    limb(ctx, 0, H * 0.2, 0, -H * 0.56, 3.6, "#d9c9a0");
    const discY = -H * 0.6;
    const flare = 0.55 + Math.sin(time * 4) * 0.15 + raise;
    ctx.globalAlpha = Math.min(1, flare);
    ctx.shadowColor = "#ffe9a3";
    ctx.shadowBlur = 10 + raise * 12;
    ctx.strokeStyle = "#ffe9a3";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time * 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4.5, discY + Math.sin(a) * 4.5);
      ctx.lineTo(Math.cos(a) * (7.5 + raise * 3), discY + Math.sin(a) * (7.5 + raise * 3));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, discY, 4.4, 0, Math.PI * 2);
    outlined(ctx, "#ffe9a3", 1.8);
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    // staff raised on cast
    const raise = Math.max(swing, castGlow * 2.2);
    const angle = f * (-0.35 - raise * 0.75);
    const handX = shX + Math.cos(angle) * H * 0.2;
    const handY = shY + Math.sin(angle) * H * 0.2 + H * 0.04;
    limb(ctx, shX, shY, handX, handY, armW * 0.85, skin);
    hand(ctx, handX, handY, skin);
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle * 0.4 - f * 0.12);
    limb(ctx, 0, H * 0.14, 0, -H * 0.5, 3.4, "#6d5638");
    const orbPulse = 3.6 + Math.sin(time * 5) * 0.7 + raise * 2.5;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 9 + raise * 10;
    ctx.beginPath();
    ctx.arc(0, -H * 0.54, orbPulse, 0, Math.PI * 2);
    outlined(ctx, accent, 1.8);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

// ------------------------------------------------------------------ enemies

const ENEMY_COLORS: Record<string, { body: string; shade: string; trim: string }> = {
  goblin: { body: "#6f9c44", shade: "#54793156", trim: "#3c5c24" },
  wolf: { body: "#5f5a70", shade: "#48445533", trim: "#3b3844" },
  archer: { body: "#8a7844", shade: "#6b5c3444", trim: "#4b431f" },
  brute: { body: "#8a6350", shade: "#6b4c3c44", trim: "#4a3526" },
  ogre: { body: "#75875a", shade: "#5a6a4444", trim: "#39442a" },
  shaman: { body: "#578a86", shade: "#3f6a6644", trim: "#2c4a48" },
  warlord: { body: "#9a5240", shade: "#743c2f44", trim: "#40201a" },
};

function drawWolf(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const { cx, f } = pose;
  const gy = pose.groundY - pose.bounce * 0.7;
  const isAlpha = unit.enemyKind === "alpha";
  const colors = isAlpha ? { body: "#3f3a4d", trim: "#292534" } : ENEMY_COLORS.wolf;
  const stretchB = isAlpha ? 1.18 : 1; // longer, rangier frame for the boss
  drawShadow(ctx, unit, pose.bounce * 0.7);
  const bodyY = gy - r * (isAlpha ? 1.05 : 0.9);
  // legs scissor
  const legPairs = [
    { x: cx - f * r * 0.85, phase: pose.walk },
    { x: cx + f * r * 0.7, phase: -pose.walk },
  ];
  for (const leg of legPairs) {
    limb(ctx, leg.x, bodyY, leg.x + f * leg.phase * r * 0.5, gy - 1, r * 0.24, colors.trim);
    limb(ctx, leg.x + f * 3, bodyY, leg.x + f * 3 - f * leg.phase * r * 0.5, gy - 1, r * 0.24, colors.body);
  }
  // body
  const wolfBody = new Path2D();
  wolfBody.ellipse(cx, bodyY, r * 1.3 * stretchB, r * 0.62, -f * 0.08, 0, Math.PI * 2);
  shaded(ctx, wolfBody, colors.body, f, cx, bodyY, r * 0.9);
  if (isAlpha) {
    // bristling mane along the neck and shoulders
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const mx = cx + f * r * (0.2 + i * 0.22);
      const my = bodyY - r * (0.52 + Math.sin(i * 1.3) * 0.06);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + f * r * 0.1, my - r * (0.42 - i * 0.05));
      ctx.lineTo(mx + f * r * 0.26, my);
    }
    ctx.closePath();
    outlined(ctx, "#524b63", 2);
  }
  // tail — wags when the wolf has nothing to chase
  const wag = pose.walk === 0 && pose.swing <= 0 ? Math.sin(time * 6 + unit.id) * r * 0.22 : 0;
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - f * r * 1.2, bodyY - r * 0.2);
  ctx.quadraticCurveTo(cx - f * r * 1.8 - f * wag, bodyY - r * 0.9, cx - f * r * 1.6 - f * wag * 1.6, bodyY - r * 1.2 + Math.abs(wag) * 0.4);
  ctx.stroke();
  ctx.strokeStyle = colors.body;
  ctx.lineWidth = 3.6;
  ctx.stroke();
  ctx.lineCap = "butt";
  // head with snout, lunging forward on attack
  const hx = cx + f * (r * 1.15 + pose.swing * 4);
  const hy = bodyY - r * 0.5 + pose.swing * 2;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
  outlined(ctx, colors.body);
  ctx.beginPath();
  ctx.moveTo(hx + f * r * 0.3, hy - r * 0.15);
  ctx.lineTo(hx + f * r * 0.95, hy + r * 0.1 - pose.swing * 3);
  ctx.lineTo(hx + f * r * 0.28, hy + r * 0.32);
  ctx.closePath();
  outlined(ctx, colors.body, 2);
  // open jaw on attack
  if (pose.swing > 0.2) {
    ctx.beginPath();
    ctx.moveTo(hx + f * r * 0.3, hy + r * 0.3);
    ctx.lineTo(hx + f * r * 0.8, hy + r * 0.55);
    ctx.lineTo(hx + f * r * 0.25, hy + r * 0.45);
    ctx.closePath();
    outlined(ctx, colors.trim, 1.6);
  }
  // ear
  ctx.beginPath();
  ctx.moveTo(hx - f * r * 0.1, hy - r * 0.4);
  ctx.lineTo(hx + f * r * 0.12, hy - r * 0.95);
  ctx.lineTo(hx + f * r * 0.38, hy - r * 0.35);
  ctx.closePath();
  outlined(ctx, colors.body, 2);
  // eye
  ctx.fillStyle = "#ffd76b";
  ctx.beginPath();
  ctx.arc(hx + f * r * 0.15, hy - r * 0.08, 1.9, 0, Math.PI * 2);
  ctx.fill();
  flashOverlay(ctx, unit, cx, bodyY, r * 1.4);
  drawEffectPips(ctx, unit, cx, bodyY - r * 1.8);
  drawHealthBar(ctx, unit, bodyY - r * 1.7);
}

function drawEnemy(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const kind = unit.enemyKind!;
  if (kind === "wolf" || kind === "alpha") {
    drawWolf(ctx, unit, time);
    return;
  }
  const pose = poseOf(unit, time);
  const big = kind === "brute" || kind === "warlord" || kind === "ogre";
  // slight per-unit size wobble keeps a wave from reading as stamped clones
  const wobble = big ? 1 : 0.94 + hash01(unit.id * 1.3) * 0.12;
  const H = unit.radius * (big ? 2.9 : 3.5) * wobble;
  const { cx, f } = pose;
  // goblins scamper — springier hop than anyone else
  const scamper = kind === "goblin" ? 1.45 : 1;
  const gy = pose.groundY - pose.bounce * scamper;
  const colors = ENEMY_COLORS[kind];
  drawShadow(ctx, unit, pose.bounce * scamper);

  const hipY = gy - H * (big ? 0.26 : 0.30);
  const shoulderY = gy - H * (big ? 0.6 : 0.52) + pose.breathe * 0.5;
  const headR = H * (big ? 0.17 : 0.27);
  const headY = shoulderY - headR * (big ? 0.5 : 0.85);
  const bodyW = H * (big ? 0.52 : 0.34);
  const legW = H * (big ? 0.13 : 0.10);
  const stride = H * 0.13;

  limb(ctx, cx - f * 3, hipY, cx - f * 3 - f * pose.walk * stride, gy - 1, legW, colors.trim);
  limb(ctx, cx + f * 3, hipY, cx + f * 3 + f * pose.walk * stride, gy - 1, legW, colors.body);

  // back arm
  limb(ctx, cx - f * bodyW * 0.3, shoulderY + 3, cx - f * bodyW * 0.6, shoulderY + H * 0.16, legW * 0.85, colors.body);

  // torso — hulking for brutes
  const torso = new Path2D();
  if (big) {
    torso.moveTo(cx - bodyW * 0.5, hipY + 3);
    torso.quadraticCurveTo(cx - bodyW * 0.85, shoulderY + H * 0.05, cx - bodyW * 0.5, shoulderY - H * 0.03);
    torso.quadraticCurveTo(cx, shoulderY - H * 0.1, cx + bodyW * 0.55, shoulderY - H * 0.01);
    torso.quadraticCurveTo(cx + bodyW * 0.7, hipY, cx + bodyW * 0.42, hipY + 4);
    torso.quadraticCurveTo(cx, hipY + H * 0.08, cx - bodyW * 0.5, hipY + 3);
  } else {
    torso.moveTo(cx - bodyW * 0.52, hipY + 3);
    torso.quadraticCurveTo(cx - bodyW * 0.62, shoulderY, cx - bodyW * 0.34, shoulderY - 2);
    torso.lineTo(cx + bodyW * 0.34, shoulderY - 2);
    torso.quadraticCurveTo(cx + bodyW * 0.62, shoulderY, cx + bodyW * 0.52, hipY + 3);
    torso.quadraticCurveTo(cx, hipY + H * 0.07, cx - bodyW * 0.52, hipY + 3);
  }
  torso.closePath();
  shaded(ctx, torso, colors.body, f, cx, (shoulderY + hipY) / 2, bodyW * (big ? 0.7 : 0.55));
  if (kind === "warlord") {
    // armor plate
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, shoulderY + 2);
    ctx.lineTo(cx + bodyW * 0.45, shoulderY + 1);
    ctx.lineTo(cx + bodyW * 0.32, hipY - 2);
    ctx.lineTo(cx - bodyW * 0.3, hipY - 1);
    ctx.closePath();
    outlined(ctx, "#5a4a52", 2);
  }
  if (kind === "ogre") {
    // moss grown over the shoulders — it slept a long time
    ctx.fillStyle = "#4f6a3a";
    ctx.beginPath();
    ctx.ellipse(cx - bodyW * 0.3, shoulderY - 2, bodyW * 0.22, 5, 0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + bodyW * 0.35, shoulderY - 1, bodyW * 0.18, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // pot belly line
    ctx.strokeStyle = "rgba(20,14,30,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, hipY - H * 0.05, bodyW * 0.34, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
  // loincloth
  ctx.fillStyle = colors.trim;
  ctx.fillRect(cx - bodyW * 0.32, hipY - 1, bodyW * 0.64, 4);

  // head
  const hx0 = cx + f * 2;
  const head = new Path2D();
  head.arc(hx0, headY, headR, 0, Math.PI * 2);
  shaded(ctx, head, colors.body, f, hx0, headY, headR);
  // goblinoid ears — per-goblin tilt so a mob doesn't read as clones
  if (kind === "goblin" || kind === "archer" || kind === "shaman") {
    const tilt = (hash01(unit.id * 3.7) - 0.5) * 8;
    ctx.beginPath();
    ctx.moveTo(cx - f * headR * 0.5, headY - 2);
    ctx.lineTo(cx - f * headR * 1.75, headY - 6 - tilt);
    ctx.lineTo(cx - f * headR * 0.45, headY + 4);
    ctx.closePath();
    outlined(ctx, colors.body, 2);
    ctx.beginPath();
    ctx.moveTo(cx + f * headR * 0.75, headY - headR * 0.5);
    ctx.lineTo(cx + f * headR * 1.55, headY - headR * 0.9 + tilt * 0.5);
    ctx.lineTo(cx + f * headR * 0.85, headY + 1);
    ctx.closePath();
    outlined(ctx, colors.body, 2);
  }
  if (kind === "shaman") {
    // hood + glowing mask eyes
    ctx.beginPath();
    ctx.arc(cx + f * 1, headY - 1.5, headR * 1.04, Math.PI * 0.85, Math.PI * 2.15);
    ctx.closePath();
    outlined(ctx, colors.trim, 2);
    ctx.fillStyle = "#7de8c9";
    ctx.beginPath();
    ctx.arc(cx + f * headR * 0.45, headY + 1, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "brute" || kind === "warlord" || kind === "ogre") {
    // horns + underbite tusks
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * headR * 0.55, headY - headR * 0.35);
      ctx.quadraticCurveTo(cx + s * headR * 1.35, headY - headR * 1.15, cx + s * headR * 0.85, headY - headR * 1.6);
      ctx.lineTo(cx + s * headR * 0.42, headY - headR * 0.6);
      ctx.closePath();
      outlined(ctx, "#e8ddc8", 1.8);
    }
    ctx.fillStyle = "#efe8d4";
    ctx.fillRect(cx + f * headR * 0.15, headY + headR * 0.5, 2.4, 4);
    ctx.fillRect(cx + f * headR * 0.6, headY + headR * 0.45, 2.4, 4);
    if (kind === "warlord") {
      ctx.beginPath();
      ctx.arc(cx + f * 2, headY - headR * 0.3, headR * 1.02, Math.PI, Math.PI * 2);
      ctx.closePath();
      outlined(ctx, "#5a4a52", 2);
    }
  } else if (kind === "archer") {
    ctx.beginPath();
    ctx.arc(cx + f * 1, headY - 2, headR * 1.02, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    outlined(ctx, colors.trim, 2);
  }
  // face
  if (kind === "goblin" || kind === "archer") {
    // beady yellow eyes under a scowling brow, plus a jagged grin
    const eyeY = headY + headR * 0.05;
    const eyeXs = [hx0 + f * headR * 0.55, hx0 + f * headR * 0.02];
    const gobShut = blinkShut(unit, time);
    for (const ex of eyeXs) {
      if (gobShut) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - f * headR * 0.16, eyeY + headR * 0.02);
        ctx.quadraticCurveTo(ex, eyeY + headR * 0.1, ex + f * headR * 0.16, eyeY + headR * 0.02);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, headR * 0.19, headR * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#f2d16b";
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.arc(ex + f * headR * 0.06, eyeY + headR * 0.03, headR * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    for (const ex of eyeXs) {
      ctx.beginPath();
      ctx.moveTo(ex - f * headR * 0.2, eyeY - headR * 0.42);
      ctx.lineTo(ex + f * headR * 0.2, eyeY - headR * 0.28);
      ctx.stroke();
    }
    // grin with snaggle-teeth
    const my = headY + headR * 0.48;
    ctx.beginPath();
    ctx.moveTo(hx0 - f * headR * 0.15, my);
    ctx.quadraticCurveTo(hx0 + f * headR * 0.35, my + headR * 0.22, hx0 + f * headR * 0.78, my - headR * 0.08);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#efe8d4";
    for (const tx of [0.14, 0.44]) {
      ctx.beginPath();
      ctx.moveTo(hx0 + f * headR * tx, my + headR * (0.1 + tx * 0.16));
      ctx.lineTo(hx0 + f * headR * (tx + 0.09), my - headR * 0.12 + headR * tx * 0.16);
      ctx.lineTo(hx0 + f * headR * (tx + 0.18), my + headR * (0.08 + tx * 0.16));
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind !== "shaman") {
    // brutes: deep-set glower under a single heavy brow
    const glow = kind === "warlord";
    const eyeY = headY + headR * 0.02;
    for (const off of [0.62, 0.1]) {
      ctx.fillStyle = glow ? "#ffd76b" : "#f2e6c9";
      ctx.beginPath();
      ctx.arc(hx0 + f * headR * off, eyeY, headR * 0.13, 0, Math.PI * 2);
      ctx.fill();
      if (!glow) {
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.arc(hx0 + f * headR * (off + 0.03), eyeY + headR * 0.02, headR * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(hx0 - f * headR * 0.12, eyeY - headR * 0.34);
    ctx.lineTo(hx0 + f * headR * 0.85, eyeY - headR * 0.18);
    ctx.stroke();
  }

  // weapon arm
  const shX = cx + f * bodyW * 0.4;
  const shY = shoulderY + 3;
  if (kind === "goblin") {
    const angle = f * (-0.7 + pose.swing * 1.9);
    const hx = shX + Math.cos(angle) * H * 0.2;
    const hy = shY + Math.sin(angle) * H * 0.2 + H * 0.05;
    limb(ctx, shX, shY, hx, hy, legW * 0.85, colors.body);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle - f * Math.PI / 2.4);
    // scavenged arms: each goblin grabbed whatever was lying around
    const arm = hash01(unit.id * 7.3);
    if (arm < 0.45) {
      // rusty cleaver
      ctx.beginPath();
      ctx.moveTo(-1.8, 0);
      ctx.lineTo(-1, -H * 0.34);
      ctx.lineTo(2.6, -H * 0.3);
      ctx.lineTo(1.8, 0);
      ctx.closePath();
      outlined(ctx, "#b8b2a4", 1.8);
    } else if (arm < 0.78) {
      // knobbly club
      roundRect(ctx, -2, -H * 0.36, 4.5, H * 0.36, 2);
      outlined(ctx, "#7a5a38", 1.8);
      ctx.beginPath();
      ctx.arc(0.4, -H * 0.36, H * 0.06, 0, Math.PI * 2);
      outlined(ctx, "#7a5a38", 1.8);
    } else {
      // stubby dagger
      ctx.beginPath();
      ctx.moveTo(-1.4, -2);
      ctx.lineTo(0, -H * 0.26);
      ctx.lineTo(1.4, -2);
      ctx.closePath();
      outlined(ctx, "#c9ccd2", 1.6);
      ctx.fillStyle = "#6b4a2a";
      ctx.fillRect(-1.6, -2, 3.2, 4);
    }
    ctx.restore();
  } else if (kind === "archer") {
    limb(ctx, shX, shY, shX + f * H * 0.18, shY + H * 0.04, legW * 0.8, colors.body);
    ctx.save();
    ctx.translate(shX + f * H * 0.18, shY + H * 0.04);
    ctx.scale(f, 1);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.24, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.24, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    ctx.restore();
  } else if (kind === "shaman") {
    limb(ctx, shX, shY, shX + f * H * 0.16, shY - H * 0.1 - pose.swing * 5, legW * 0.8, colors.body);
    const sx = shX + f * H * 0.2;
    limb(ctx, sx, shY + H * 0.16, sx, shY - H * 0.42 - pose.swing * 4, 3, "#6d5638");
    ctx.shadowColor = "#7de8c9";
    ctx.shadowBlur = 8 + pose.swing * 8;
    ctx.beginPath();
    ctx.arc(sx, shY - H * 0.46 - pose.swing * 4, 4 + pose.swing * 2, 0, Math.PI * 2);
    outlined(ctx, "#7de8c9", 1.6);
    ctx.shadowBlur = 0;
    // feathers
    ctx.fillStyle = "#d9a441";
    ctx.beginPath();
    ctx.moveTo(sx - 3, shY - H * 0.3);
    ctx.lineTo(sx - 9, shY - H * 0.36);
    ctx.lineTo(sx - 3, shY - H * 0.24);
    ctx.closePath();
    ctx.fill();
  } else {
    // brute / warlord club — huge overhead slam
    const angle = f * (-1.9 + pose.swing * 2.6);
    const hx = shX + Math.cos(angle) * H * 0.24;
    const hy = shY + Math.sin(angle) * H * 0.24 + H * 0.04;
    limb(ctx, shX, shY, hx, hy, legW, colors.body);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + f * 0.5 - f * Math.PI / 2);
    roundRect(ctx, -3, -H * 0.5, 6.5, H * 0.5, 3);
    outlined(ctx, "#6b5136", 2);
    ctx.beginPath();
    ctx.arc(0.4, -H * 0.5, H * 0.09, 0, Math.PI * 2);
    outlined(ctx, "#6b5136", 2);
    // studs
    ctx.fillStyle = "#c9c2b8";
    ctx.beginPath();
    ctx.arc(-2, -H * 0.46, 1.4, 0, Math.PI * 2);
    ctx.arc(3, -H * 0.52, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  flashOverlay(ctx, unit, cx, gy - H * 0.45, H * 0.5);
  drawEffectPips(ctx, unit, cx, gy - H - 14);
  drawHealthBar(ctx, unit, gy - H - 10);
}

// ------------------------------------------------------------------ death + assembly

function drawFallen(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const t = unit.deathTime;
  // fall with a little bounce, linger, then fade away
  const fallRaw = Math.min(1, t * 2.6);
  const fall = fallRaw >= 1 ? 1 : fallRaw + Math.sin(fallRaw * Math.PI) * 0.12;
  const fade = Math.max(0, 1 - Math.max(0, t - 1.1) / 1.2);
  // soul wisp drifting up from the body
  if (t > 0.25 && t < 1.6) {
    const wt = (t - 0.25) / 1.35;
    ctx.globalAlpha = Math.sin(wt * Math.PI) * 0.8;
    const wx = unit.x + Math.sin(t * 5 + unit.id) * 5;
    const wy = unit.y - 14 - wt * 46;
    ctx.shadowColor = unit.team === "hero" ? "#ffeebe" : "#bfe0d8";
    ctx.shadowBlur = 8;
    ctx.fillStyle = unit.team === "hero" ? "#fff6d8" : "#d8efe8";
    ctx.beginPath();
    ctx.arc(wx, wy, 4 - wt * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx - Math.sin(t * 5 + unit.id) * 3, wy + 6, 2 - wt, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (fade <= 0) return;
  const color = unit.team === "hero" ? HEROES[unit.heroIndex].accent : ENEMY_COLORS[unit.enemyKind!]?.body ?? "#777";
  const skin = unit.team === "hero" ? HEROES[unit.heroIndex].skin : color;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(unit.x, unit.y);
  ctx.rotate(-unit.facing * fall * Math.PI * 0.5);
  const H = unit.radius * 2.6;
  ctx.beginPath();
  ctx.ellipse(0, -H * 0.35, unit.radius * 0.55, H * 0.38, 0, 0, Math.PI * 2);
  outlined(ctx, color, 2);
  ctx.beginPath();
  ctx.arc(0, -H * 0.85, unit.radius * 0.5, 0, Math.PI * 2);
  outlined(ctx, skin, 2);
  // x eye
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  const ex = unit.facing * unit.radius * 0.2;
  ctx.beginPath();
  ctx.moveTo(ex - 2.4, -H * 0.85 - 2.4);
  ctx.lineTo(ex + 2.4, -H * 0.85 + 2.4);
  ctx.moveTo(ex + 2.4, -H * 0.85 - 2.4);
  ctx.lineTo(ex - 2.4, -H * 0.85 + 2.4);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

const stepPhases = new WeakMap<Unit, number>();

export function drawUnits(ctx: CanvasRenderingContext2D, battle: Battle, save: SaveData, selected: Unit | null): void {
  const sorted = [...battle.units].sort((a, b) => a.y - b.y);
  for (const unit of sorted) {
    if (!unit.alive) drawFallen(ctx, unit);
  }
  for (const unit of sorted) {
    if (!unit.alive) continue;
    // squash on hit, stretch on lunge, lean into movement — anchored at the feet
    const squash = Math.min(0.22, unit.hitFlash * 1.4);
    const stretch = unit.lunge * 0.1;
    const moving = unit.moveTarget !== null || (unit.team === "enemy" && unit.lunge <= 0.01 && !unit.attackTarget);
    // footfall dust: a small puff each time the stride plants
    const stride = Math.sin(unit.bobPhase);
    const prevStride = stepPhases.get(unit) ?? stride;
    stepPhases.set(unit, stride);
    if (moving && (prevStride >= 0) !== (stride >= 0)) {
      battle.fx.burst(unit.x - unit.facing * 3, unit.y + 1, "rgba(185,170,145,0.6)", 2, 24, { gravity: -26, size: 2.4, life: 0.3 });
    }
    const lowHp = unit.team === "hero" && unit.hp / unit.stats.maxHp < 0.25;
    if (lowHp) {
      // danger ring pulsing under the wounded hero
      ctx.globalAlpha = 0.35 + Math.abs(Math.sin(battle.time * 5)) * 0.3;
      ctx.strokeStyle = "#ff5a48";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.7, unit.radius * 0.68, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const lean = (moving ? unit.facing * 0.055 : 0) - unit.facing * Math.min(0.1, unit.hitFlash * 0.7) + (lowHp ? unit.facing * 0.03 : 0);
    if (squash > 0.01 || stretch > 0.01 || Math.abs(lean) > 0.01) {
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(lean);
      ctx.scale(1 + squash + stretch, 1 - squash + stretch * 0.4);
      ctx.translate(-unit.x, -unit.y);
      if (unit.team === "hero") drawHero(ctx, unit, save, unit === selected, battle.time);
      else drawEnemy(ctx, unit, battle.time);
      ctx.restore();
    } else if (unit.team === "hero") {
      drawHero(ctx, unit, save, unit === selected, battle.time);
    } else {
      drawEnemy(ctx, unit, battle.time);
    }
  }
  for (const unit of battle.units) {
    if (unit.alive && unit.channelBeam > 0 && unit.healTarget && unit.healTarget.alive) {
      const t = unit.healTarget;
      ctx.globalAlpha = 0.55 + Math.sin(battle.time * 10) * 0.18;
      ctx.strokeStyle = "#bff0b0";
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -battle.time * 44;
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y - 22);
      ctx.quadraticCurveTo((unit.x + t.x) / 2, Math.min(unit.y, t.y) - 52, t.x, t.y - 20);
      ctx.stroke();
      ctx.setLineDash([]);
      // sparkle at target
      const sp = battle.time * 6;
      ctx.fillStyle = "#e4ffd9";
      for (let i = 0; i < 3; i++) {
        const a = sp + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(t.x + Math.cos(a) * 12, t.y - 22 + Math.sin(a) * 7, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function drawProjectiles(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const p of battle.projectiles) {
    // small ground shadow keeps flight readable
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#141020";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 20, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.aim.y, p.aim.x);
    ctx.rotate(angle);
    if (p.kind === "arrow") {
      // motion streak
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#fff8e0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
      ctx.fillStyle = "#e8e4da";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -3);
      ctx.lineTo(4, 3);
      ctx.closePath();
      ctx.fill();
      // fletching
      ctx.fillStyle = "#c96a4a";
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-13, -3);
      ctx.lineTo(-11, 0);
      ctx.lineTo(-13, 3);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.kind === "bolt" ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(0.8, -0.8, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(-7, 0, 2.8, 0, Math.PI * 2);
      ctx.arc(-12, 0, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}


/** Foreground silhouette layer drawn OVER units for depth: large swaying tufts along the bottom. */
export function drawForeground(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  time: number,
  opts: BgOpts = {},
): void {
  ctx.save();
  // the near layer overshoots the camera slightly for depth
  ctx.translate(-(opts.camX ?? 0) * 0.35, -(opts.camY ?? 0) * 0.35);
  ctx.fillStyle = stage.palette.prop;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 11; i++) {
    const gx = hash01(i * 41 + stage.id * 5) * (w + OVERSCAN * 2) - OVERSCAN;
    const base = h - 2 + hash01(i * 7) * 6;
    const s = 14 + hash01(i * 13) * 16;
    let sway = Math.sin(time * 1.3 + i * 2.2) * 3;
    if (opts.units) {
      for (const u of opts.units) {
        if (!u.alive) continue;
        const d = Math.hypot(u.x - gx, u.y - base);
        if (d < 44) sway += ((gx - u.x) / (d + 5)) * (44 - d) * 0.4;
      }
    }
    ctx.beginPath();
    ctx.moveTo(gx - s * 0.5, base);
    ctx.quadraticCurveTo(gx - s * 0.45 + sway, base - s * 1.4, gx - s * 0.15 + sway * 1.3, base - s * 1.8);
    ctx.quadraticCurveTo(gx - s * 0.05, base - s * 0.8, gx, base);
    ctx.moveTo(gx + s * 0.1, base);
    ctx.quadraticCurveTo(gx + s * 0.2 + sway, base - s * 1.1, gx + s * 0.5 + sway * 1.2, base - s * 1.5);
    ctx.quadraticCurveTo(gx + s * 0.45, base - s * 0.6, gx + s * 0.55, base);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}


/** Battle decals: scorch marks, dark stains, and footprints the fight leaves behind. */
export function drawDecals(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const d of battle.decals) {
    if (d.kind === "scorch") {
      const g = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.size);
      g.addColorStop(0, "rgba(30, 18, 12, 0.4)");
      g.addColorStop(0.7, "rgba(30, 18, 12, 0.22)");
      g.addColorStop(1, "rgba(30, 18, 12, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.size, d.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "stain") {
      ctx.fillStyle = "rgba(40, 24, 20, 0.25)";
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.size, d.size * 0.4, d.angle * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(30, 24, 18, 0.22)";
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.size * 0.7, d.size * 0.4, d.angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Per-stage ambient color grade over the whole scene (soft-light keeps detail). */
const STAGE_GRADE: Record<number, string> = {
  0: "rgba(255, 235, 170, 0.14)",
  1: "rgba(90, 140, 170, 0.18)",
  2: "rgba(110, 190, 150, 0.16)",
  3: "rgba(255, 130, 60, 0.2)",
  4: "rgba(120, 100, 220, 0.22)",
  5: "rgba(255, 90, 60, 0.18)",
};

export function drawColorGrade(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, h: number): void {
  const tint = STAGE_GRADE[stage.id];
  if (!tint) return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** How dark each stage's night layer is (0 = fully lit). */
export const STAGE_DARKNESS: Record<number, number> = { 2: 0.16, 4: 0.5, 5: 0.32 };

let lightCanvas: HTMLCanvasElement | null = null;

/** Dynamic lighting: a darkness sheet with holes cut by every light source. */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  battle: Battle,
  w: number,
  h: number,
): void {
  const darkness = STAGE_DARKNESS[battle.stage.id] ?? 0;
  if (darkness <= 0) return;
  if (!lightCanvas) lightCanvas = document.createElement("canvas");
  const iw = Math.ceil(w);
  const ih = Math.ceil(h);
  if (lightCanvas.width !== iw || lightCanvas.height !== ih) {
    lightCanvas.width = iw;
    lightCanvas.height = ih;
  }
  const lc = lightCanvas.getContext("2d")!;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = "source-over";
  lc.clearRect(0, 0, iw, ih);
  lc.fillStyle = `rgba(10, 8, 32, ${darkness})`;
  lc.fillRect(0, 0, iw, ih);
  lc.globalCompositeOperation = "destination-out";
  const carve = (x: number, y: number, r: number, strength: number) => {
    const g = lc.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    lc.fillStyle = g;
    lc.beginPath();
    lc.arc(x, y, r, 0, Math.PI * 2);
    lc.fill();
  };
  for (const u of battle.units) {
    if (!u.alive) continue;
    if (u.team === "hero") carve(u.x, u.y - 14, 92, 0.9);
    if (u.enemyKind === "shaman") carve(u.x, u.y - 20, 60, 0.8);
    if (u.enemyKind === "alpha" || u.enemyKind === "warlord") carve(u.x, u.y - 16, 70, 0.6);
    if (u.castGlow > 0) carve(u.x, u.y - 16, 130, Math.min(1, u.castGlow * 2));
  }
  for (const p of battle.projectiles) {
    if (p.kind !== "arrow") carve(p.x, p.y, 46, 0.85);
  }
  for (const pool of battle.fx.pools) {
    carve(pool.x, pool.y, pool.r * 1.2, (pool.life / pool.maxLife) * 0.9);
  }
  for (const ring of battle.fx.rings) {
    carve(ring.x, ring.y, ring.r, (ring.life / ring.maxLife) * 0.5);
  }
  ctx.drawImage(lightCanvas, 0, 0);
}

/** Faded, flipped ghosts of units standing near the Mirebrook pools. */
export function drawReflections(
  ctx: CanvasRenderingContext2D,
  battle: Battle,
  save: SaveData,
  w: number,
  h: number,
  horizon: number,
  time: number,
): void {
  if (battle.stage.id !== 2) return;
  const groundAt = (t: number, band: number) => horizon + 14 + hash01(t) * (h - horizon - 30) * band;
  const pools = [0, 1, 2].map((i) => ({
    x: w * (0.2 + i * 0.3) + hash01(i * 9) * 40,
    y: groundAt(i * 3.3, 0.8),
    rx: 40 + hash01(i) * 24,
  }));
  for (const unit of battle.units) {
    if (!unit.alive) continue;
    const pool = pools.find((p) => Math.hypot(unit.x - p.x, unit.y - p.y) < p.rx + 14);
    if (!pool) continue;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pool.x, pool.y + 4, pool.rx, 11, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.22;
    ctx.translate(unit.x + Math.sin(time * 2 + unit.id) * 1.2, unit.y * 2 + 6);
    ctx.scale(1, -0.8);
    ctx.translate(-unit.x, -unit.y);
    if (unit.team === "hero") drawHero(ctx, unit, save, false, time);
    else drawEnemy(ctx, unit, time);
    ctx.restore();
  }
}
