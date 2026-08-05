import type { Battle } from "./battle";
import { HEROES } from "./data";
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

// ------------------------------------------------------------------ background

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
): void {
  const p = stage.palette;
  const night = stage.id >= 4;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // sun / moon with soft halo
  const orbX = w * 0.78;
  const orbY = horizon * 0.38;
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
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 10) {
    ctx.lineTo(x, horizon - 48 - Math.sin(x * 0.005 + 4.2) * 26 - Math.sin(x * 0.013 + 1) * 12);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 8) {
    ctx.lineTo(x, horizon - 22 - Math.sin(x * 0.008 + 1.7) * 18 - Math.sin(x * 0.021) * 9);
  }
  ctx.lineTo(w, horizon);
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
      // round tree / boulder
      ctx.beginPath();
      ctx.arc(tx, ridgeY - th * 0.4, th * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(tx - 1.6, ridgeY - th * 0.35, 3.2, th * 0.4);
    }
  }

  // ground
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, p.ground);
  ground.addColorStop(1, p.groundDark);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);
  // ground edge highlight
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, horizon, w, 2.5);

  // texture: mottled patches + tufts + stones
  for (let i = 0; i < 14; i++) {
    const gx = hash01(i * 17 + stage.id * 31) * w;
    const gy = horizon + 12 + hash01(i * 23 + 5) * (h - horizon - 26);
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.beginPath();
    ctx.ellipse(gx, gy, 30 + hash01(i) * 46, 8 + hash01(i * 3) * 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 22; i++) {
    const gx = hash01(i * 127 + stage.id * 3) * w;
    const gy = horizon + 10 + hash01(i * 311 + stage.id) * (h - horizon - 26);
    const sway = Math.sin(time * 1.6 + i) * 1.4;
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

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const v = ctx.createRadialGradient(w / 2, h * 0.44, Math.min(w, h) * 0.55, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(16,10,26,0.26)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ zones

export function drawZones(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const zone of battle.zones) {
    const fade = Math.min(1, (zone.duration - zone.time) / 0.8, zone.time / 0.25 + 0.4);
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

function drawHealthBar(ctx: CanvasRenderingContext2D, unit: Unit, top: number): void {
  const w = Math.max(30, unit.radius * 2.4);
  const x = unit.x - w / 2;
  const y = top;
  const frac = Math.max(0, unit.hp / unit.stats.maxHp);
  roundRect(ctx, x - 1, y - 1, w + 2, 7, 3.5);
  ctx.fillStyle = "rgba(18, 12, 24, 0.78)";
  ctx.fill();
  if (frac > 0) {
    roundRect(ctx, x, y, w * frac, 5, 2.5);
    ctx.fillStyle = unit.team === "hero" ? (frac > 0.35 ? "#6fce65" : "#e0b23e") : "#d1543f";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, x, y, w * frac, 2, 1);
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
  const bounce = moving ? Math.abs(Math.cos(unit.bobPhase)) * 2.2 : 0;
  const swing = Math.sin(Math.min(1, unit.lunge) * Math.PI);
  const lx = unit.lungeDir.x * unit.lunge * 9;
  const ly = unit.lungeDir.y * unit.lunge * 9;
  return {
    cx: unit.x + lx,
    groundY: unit.y + ly,
    f: unit.facing,
    walk,
    bounce,
    swing,
    breathe: Math.sin(time * 2.4 + unit.id) * 0.8,
  };
}

function drawShadow(ctx: CanvasRenderingContext2D, unit: Unit): void {
  ctx.fillStyle = "rgba(20, 14, 30, 0.30)";
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.15, unit.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSelection(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  ctx.strokeStyle = "rgba(255, 240, 180, 0.95)";
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.55, unit.radius * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function flashOverlay(ctx: CanvasRenderingContext2D, unit: Unit, cx: number, cy: number, r: number): void {
  if (unit.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.75, unit.hitFlash * 4.5);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ heroes

function drawHero(ctx: CanvasRenderingContext2D, unit: Unit, save: SaveData, selected: boolean, time: number): void {
  const def = HEROES[unit.heroIndex];
  const pose = poseOf(unit, time);
  const H = unit.radius * 3.4;
  const { cx, f } = pose;
  const gy = pose.groundY - pose.bounce;

  drawShadow(ctx, unit);
  if (selected) drawSelection(ctx, unit, time);

  const hipY = gy - H * 0.30;
  const shoulderY = gy - H * 0.52 + pose.breathe * 0.4;
  const headR = H * 0.26;
  const headY = shoulderY - headR * 0.85;
  const bodyW = H * 0.34;
  const legW = H * 0.10;
  const stride = H * 0.14;
  const robed = unit.stats.weapon === "stave";

  // back leg, back arm behind body
  if (!robed) limb(ctx, cx - f * 2, hipY, cx - f * 2 - f * pose.walk * stride, gy - 1, legW, "#3a2f47");
  // free back arm
  limb(
    ctx,
    cx - f * bodyW * 0.3,
    shoulderY + 3,
    cx - f * bodyW * 0.55,
    shoulderY + H * 0.16 + pose.walk * 2,
    legW * 0.85,
    def.skin,
  );

  if (robed) {
    // full healer's robe: cream cloth to the ground, accent stole, swaying hem
    const hem = Math.sin(unit.bobPhase * 0.9) * 2;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.72 + hem * 0.4, gy);
    ctx.quadraticCurveTo(cx - bodyW * 0.6, hipY - H * 0.06, cx - bodyW * 0.34 + f * 1.5, shoulderY - 2);
    ctx.lineTo(cx + bodyW * 0.34 + f * 1.5, shoulderY - 2);
    ctx.quadraticCurveTo(cx + bodyW * 0.6, hipY - H * 0.06, cx + bodyW * 0.72 - hem * 0.4, gy);
    ctx.quadraticCurveTo(cx + hem, gy + 2.5, cx - bodyW * 0.72 + hem * 0.4, gy);
    ctx.closePath();
    outlined(ctx, "#efe6d0");
    // rope belt
    ctx.strokeStyle = "#c9a95c";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.5, hipY);
    ctx.quadraticCurveTo(cx, hipY + 3.5, cx + bodyW * 0.5, hipY);
    ctx.stroke();
  } else {
    // front leg
    limb(ctx, cx + f * 2, hipY, cx + f * 2 + f * pose.walk * stride, gy - 1, legW, "#4a3d5c");

    // tunic body (trapezoid, slightly leaning into facing)
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.52, hipY + 3);
    ctx.quadraticCurveTo(cx - bodyW * 0.62, shoulderY, cx - bodyW * 0.34 + f * 1.5, shoulderY - 2);
    ctx.lineTo(cx + bodyW * 0.34 + f * 1.5, shoulderY - 2);
    ctx.quadraticCurveTo(cx + bodyW * 0.62, shoulderY, cx + bodyW * 0.52, hipY + 3);
    ctx.quadraticCurveTo(cx, hipY + H * 0.07, cx - bodyW * 0.52, hipY + 3);
    ctx.closePath();
    outlined(ctx, def.accent);
    // belt
    ctx.fillStyle = "rgba(20,14,30,0.5)";
    ctx.fillRect(cx - bodyW * 0.5, hipY - 1, bodyW, 3);
  }

  // head (big, chibi)
  ctx.beginPath();
  ctx.arc(cx + f * 1.5, headY, headR, 0, Math.PI * 2);
  outlined(ctx, def.skin);
  if (robed) {
    // deep cream hood framing the face
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - 1, headR * 1.12, Math.PI * 0.72, Math.PI * 2.28);
    ctx.quadraticCurveTo(cx - f * headR * 0.2, headY + headR * 0.9, cx - f * headR * 1.05, headY + headR * 0.5);
    ctx.closePath();
    outlined(ctx, "#efe6d0", 2);

  } else {
    // hair cap
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - headR * 0.12, headR * 0.98, Math.PI * 0.98, Math.PI * 2.02);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
  }
  // eye + brow
  ctx.fillStyle = OUTLINE;
  ctx.beginPath();
  ctx.arc(cx + f * headR * 0.52, headY + headR * 0.05, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + f * headR * 0.3, headY - headR * 0.28);
  ctx.lineTo(cx + f * headR * 0.72, headY - headR * 0.22);
  ctx.stroke();

  // weapon arm + weapon (front)
  const shX = cx + f * bodyW * 0.36;
  const shY = shoulderY + 2;
  drawHeroWeapon(ctx, unit, def.accent, def.skin, shX, shY, H, f, pose.swing, unit.castGlow, time, legW);

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
  drawEffectPips(ctx, unit, cx, gy - H - 16);
  drawHealthBar(ctx, unit, gy - H - 12);
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
): void {
  if (unit.stats.weapon === "sword") {
    // arm rotates from rest (-0.5) through a big arc on swing
    const angle = f * (-0.85 + swing * 2.1);
    const handX = shX + Math.cos(angle) * H * 0.22;
    const handY = shY + Math.sin(angle) * H * 0.22 + H * 0.06;
    limb(ctx, shX, shY, handX, handY, armW * 0.9, skin);
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
    outlined(ctx, "#d8dee8", 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(-0.6, -H * 0.52, 1.2, H * 0.46);
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
  shaman: { body: "#578a86", shade: "#3f6a6644", trim: "#2c4a48" },
  warlord: { body: "#9a5240", shade: "#743c2f44", trim: "#40201a" },
};

function drawWolf(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const { cx, f } = pose;
  const gy = pose.groundY - pose.bounce * 0.7;
  const colors = ENEMY_COLORS.wolf;
  drawShadow(ctx, unit);
  const bodyY = gy - r * 0.9;
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
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, r * 1.3, r * 0.66, -f * 0.08, 0, Math.PI * 2);
  outlined(ctx, colors.body);
  // tail
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - f * r * 1.2, bodyY - r * 0.2);
  ctx.quadraticCurveTo(cx - f * r * 1.8, bodyY - r * 0.9, cx - f * r * 1.6, bodyY - r * 1.2);
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
  if (kind === "wolf") {
    drawWolf(ctx, unit, time);
    return;
  }
  const pose = poseOf(unit, time);
  const big = kind === "brute" || kind === "warlord";
  const H = unit.radius * (big ? 2.9 : 3.3);
  const { cx, f } = pose;
  const gy = pose.groundY - pose.bounce;
  const colors = ENEMY_COLORS[kind];
  drawShadow(ctx, unit);

  const hipY = gy - H * (big ? 0.26 : 0.30);
  const shoulderY = gy - H * (big ? 0.6 : 0.52) + pose.breathe * 0.5;
  const headR = H * (big ? 0.17 : 0.24);
  const headY = shoulderY - headR * (big ? 0.5 : 0.85);
  const bodyW = H * (big ? 0.52 : 0.34);
  const legW = H * (big ? 0.13 : 0.10);
  const stride = H * 0.13;

  limb(ctx, cx - f * 3, hipY, cx - f * 3 - f * pose.walk * stride, gy - 1, legW, colors.trim);
  limb(ctx, cx + f * 3, hipY, cx + f * 3 + f * pose.walk * stride, gy - 1, legW, colors.body);

  // back arm
  limb(ctx, cx - f * bodyW * 0.3, shoulderY + 3, cx - f * bodyW * 0.6, shoulderY + H * 0.16, legW * 0.85, colors.body);

  // torso — hulking for brutes
  ctx.beginPath();
  if (big) {
    ctx.moveTo(cx - bodyW * 0.5, hipY + 3);
    ctx.quadraticCurveTo(cx - bodyW * 0.85, shoulderY + H * 0.05, cx - bodyW * 0.5, shoulderY - H * 0.03);
    ctx.quadraticCurveTo(cx, shoulderY - H * 0.1, cx + bodyW * 0.55, shoulderY - H * 0.01);
    ctx.quadraticCurveTo(cx + bodyW * 0.7, hipY, cx + bodyW * 0.42, hipY + 4);
    ctx.quadraticCurveTo(cx, hipY + H * 0.08, cx - bodyW * 0.5, hipY + 3);
  } else {
    ctx.moveTo(cx - bodyW * 0.52, hipY + 3);
    ctx.quadraticCurveTo(cx - bodyW * 0.62, shoulderY, cx - bodyW * 0.34, shoulderY - 2);
    ctx.lineTo(cx + bodyW * 0.34, shoulderY - 2);
    ctx.quadraticCurveTo(cx + bodyW * 0.62, shoulderY, cx + bodyW * 0.52, hipY + 3);
    ctx.quadraticCurveTo(cx, hipY + H * 0.07, cx - bodyW * 0.52, hipY + 3);
  }
  ctx.closePath();
  outlined(ctx, colors.body);
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
  // loincloth
  ctx.fillStyle = colors.trim;
  ctx.fillRect(cx - bodyW * 0.32, hipY - 1, bodyW * 0.64, 4);

  // head
  ctx.beginPath();
  ctx.arc(cx + f * 2, headY, headR, 0, Math.PI * 2);
  outlined(ctx, colors.body);
  // goblinoid ears
  if (kind === "goblin" || kind === "archer" || kind === "shaman") {
    ctx.beginPath();
    ctx.moveTo(cx - f * headR * 0.5, headY - 2);
    ctx.lineTo(cx - f * headR * 1.75, headY - 6);
    ctx.lineTo(cx - f * headR * 0.45, headY + 4);
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
  } else if (kind === "brute" || kind === "warlord") {
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
  // eye
  ctx.fillStyle = kind === "warlord" ? "#ffd76b" : OUTLINE;
  ctx.beginPath();
  ctx.arc(cx + f * headR * 0.5, headY + headR * 0.05, kind === "warlord" ? 2.4 : 1.9, 0, Math.PI * 2);
  ctx.fill();

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
    ctx.beginPath();
    ctx.moveTo(-1.8, 0);
    ctx.lineTo(-1, -H * 0.34);
    ctx.lineTo(2.6, -H * 0.3);
    ctx.lineTo(1.8, 0);
    ctx.closePath();
    outlined(ctx, "#b8b2a4", 1.8);
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

export function drawUnits(ctx: CanvasRenderingContext2D, battle: Battle, save: SaveData, selected: Unit | null): void {
  const sorted = [...battle.units].sort((a, b) => a.y - b.y);
  for (const unit of sorted) {
    if (!unit.alive) drawFallen(ctx, unit);
  }
  for (const unit of sorted) {
    if (!unit.alive) continue;
    if (unit.team === "hero") drawHero(ctx, unit, save, unit === selected, battle.time);
    else drawEnemy(ctx, unit, battle.time);
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
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.aim.y, p.aim.x);
    ctx.rotate(angle);
    if (p.kind === "arrow") {
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
