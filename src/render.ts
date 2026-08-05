import type { Battle } from "./battle";
import { HEROES } from "./data";
import type { SaveData, StageDef, Unit } from "./types";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  // drifting clouds
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 4; i++) {
    const cx = ((time * (6 + i * 2.5) + i * 260) % (w + 220)) - 110;
    const cy = 30 + i * 26;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 58 + i * 8, 13 + i * 2, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 34, cy + 6, 36, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // hills
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let x = 0; x <= w; x += 8) {
    const y = horizon - 26 - Math.sin(x * 0.008 + 1.7) * 20 - Math.sin(x * 0.021) * 10;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();

  // ground
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, p.ground);
  ground.addColorStop(1, p.groundDark);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  // scattered tufts / stones, deterministic per stage
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  for (let i = 0; i < 26; i++) {
    const gx = (Math.sin(i * 127.3 + stage.id * 31) * 0.5 + 0.5) * w;
    const gy = horizon + 14 + (Math.sin(i * 311.7 + stage.id * 17) * 0.5 + 0.5) * (h - horizon - 30);
    ctx.beginPath();
    ctx.ellipse(gx, gy, 9, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = p.prop;
  for (let i = 0; i < 10; i++) {
    const gx = (Math.sin(i * 73.7 + stage.id * 57) * 0.5 + 0.5) * w;
    const gy = horizon + 10 + (Math.sin(i * 41.3 + stage.id * 13) * 0.5 + 0.5) * (h - horizon - 26);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx - 3, gy - 9, gx - 1, gy - 12);
    ctx.quadraticCurveTo(gx + 1, gy - 8, gx + 2, gy - 3);
    ctx.quadraticCurveTo(gx + 5, gy - 10, gx + 6, gy - 13);
    ctx.quadraticCurveTo(gx + 7, gy - 6, gx + 4, gy);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawZones(ctx: CanvasRenderingContext2D, battle: Battle): void {
  for (const zone of battle.zones) {
    const fade = Math.min(1, (zone.duration - zone.time) / 0.8, zone.time / 0.25 + 0.4);
    ctx.globalAlpha = 0.4 * fade;
    const grad = ctx.createRadialGradient(zone.x, zone.y, 4, zone.x, zone.y, zone.radius);
    grad.addColorStop(0, "#dff2ff");
    grad.addColorStop(1, "rgba(120, 190, 235, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7 * fade;
    ctx.strokeStyle = "#bfe6ff";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + zone.x * 0.1;
      const sx = zone.x + Math.cos(a) * zone.radius * 0.55;
      const sy = zone.y + Math.sin(a) * zone.radius * 0.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3);
      ctx.lineTo(sx + 2.5, sy + 2);
      ctx.lineTo(sx - 2.5, sy + 2);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawHealthBar(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const w = Math.max(30, unit.radius * 2.4);
  const x = unit.x - w / 2;
  const y = unit.y - unit.radius * 2 - 26;
  const frac = Math.max(0, unit.hp / unit.stats.maxHp);
  roundRect(ctx, x - 1, y - 1, w + 2, 6, 3);
  ctx.fillStyle = "rgba(18, 14, 24, 0.7)";
  ctx.fill();
  if (frac > 0) {
    roundRect(ctx, x, y, w * frac, 4, 2);
    ctx.fillStyle = unit.team === "hero" ? (frac > 0.35 ? "#6fce65" : "#e0b23e") : "#d1543f";
    ctx.fill();
  }
  const shield = unit.effects.find((e) => e.kind === "shield");
  if (shield) {
    roundRect(ctx, x, y - 4, Math.min(w, (shield.power / unit.stats.maxHp) * w), 2.5, 1);
    ctx.fillStyle = "#9fc6e8";
    ctx.fill();
  }
}

function bodyCenter(unit: Unit): { x: number; y: number; bob: number } {
  const moving = unit.moveTarget !== null || unit.lunge > 0;
  const bob = Math.sin(unit.bobPhase) * (moving ? 2.4 : 1.2);
  const lx = unit.lungeDir.x * unit.lunge * 10;
  const ly = unit.lungeDir.y * unit.lunge * 10;
  return { x: unit.x + lx, y: unit.y + ly + bob, bob };
}

function drawWeapon(ctx: CanvasRenderingContext2D, unit: Unit, cx: number, cy: number, accent: string): void {
  const f = unit.facing;
  ctx.save();
  ctx.translate(cx + f * (unit.radius + 2), cy - 14);
  ctx.scale(f, 1);
  const swing = unit.lunge * 0.9;
  if (unit.stats.weapon === "sword") {
    ctx.rotate(-0.5 + swing * 1.4);
    ctx.fillStyle = "#cfd6de";
    roundRect(ctx, -1.5, -22, 4, 22, 1.5);
    ctx.fill();
    ctx.fillStyle = "#8a6d3b";
    roundRect(ctx, -3.5, -2, 8, 4, 1.5);
    ctx.fill();
  } else if (unit.stats.weapon === "bow") {
    ctx.rotate(swing * 0.4);
    ctx.strokeStyle = "#8a6d3b";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, -8, 12, -Math.PI / 2.3, Math.PI / 2.3);
    ctx.stroke();
    ctx.strokeStyle = "#e8e2d0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(-Math.PI / 2.3) * 12, -8 + Math.sin(-Math.PI / 2.3) * 12);
    ctx.lineTo(Math.cos(Math.PI / 2.3) * 12, -8 + Math.sin(Math.PI / 2.3) * 12);
    ctx.stroke();
  } else {
    ctx.rotate(-0.15 + swing * 0.6);
    ctx.fillStyle = "#6d5638";
    roundRect(ctx, -1.5, -26, 3.6, 30, 1.5);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0.5, -28, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawHero(ctx: CanvasRenderingContext2D, unit: Unit, save: SaveData, selected: boolean): void {
  const def = HEROES[unit.heroIndex];
  const { x: cx, y: cy } = bodyCenter(unit);
  const r = unit.radius;
  const f = unit.facing;

  // shadow
  ctx.fillStyle = "rgba(20, 16, 28, 0.28)";
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = "rgba(255, 245, 200, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y + 2, r * 1.5, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const spi = save.heroes[unit.heroIndex].attrs.spi;
  const highSpirit = spi >= 8;

  // cloak / body
  ctx.fillStyle = def.accent;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.75, cy + r * 0.35);
  ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.9, cx, cy - r * 1.05);
  ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.9, cx + r * 0.75, cy + r * 0.35);
  ctx.quadraticCurveTo(cx, cy + r * 0.62, cx - r * 0.75, cy + r * 0.35);
  ctx.closePath();
  ctx.fill();
  // trim
  ctx.strokeStyle = highSpirit ? "#f5edd0" : "rgba(20,16,28,0.35)";
  ctx.lineWidth = highSpirit ? 2 : 1.4;
  ctx.stroke();

  // belt
  ctx.fillStyle = "rgba(20,16,28,0.3)";
  roundRect(ctx, cx - r * 0.7, cy - r * 0.05, r * 1.4, 3.4, 1.5);
  ctx.fill();

  // head
  const hy = cy - r * 1.35;
  ctx.fillStyle = def.skin;
  ctx.beginPath();
  ctx.arc(cx + f * 1.5, hy, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = def.hair;
  ctx.beginPath();
  ctx.arc(cx + f * 0.5, hy - 2, r * 0.6, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  // eye
  ctx.fillStyle = "#241d2e";
  ctx.beginPath();
  ctx.arc(cx + f * (r * 0.34), hy + 1, 1.6, 0, Math.PI * 2);
  ctx.fill();

  drawWeapon(ctx, unit, cx, cy, def.accent);

  // status tints
  if (unit.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.7, unit.hitFlash * 4);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.5, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (unit.castGlow > 0) {
    ctx.globalAlpha = unit.castGlow;
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.5, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawEffectPips(ctx, unit, cx, cy - r * 2.15);
  drawHealthBar(ctx, unit);
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

function drawEnemy(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const { x: cx, y: cy } = bodyCenter(unit);
  const r = unit.radius;
  const f = unit.facing;
  const kind = unit.enemyKind!;
  const bodyColors: Record<string, { body: string; trim: string }> = {
    goblin: { body: "#5e8c3a", trim: "#3c5c24" },
    wolf: { body: "#5a5666", trim: "#3b3844" },
    archer: { body: "#7a6a3c", trim: "#4b431f" },
    brute: { body: "#7d5a44", trim: "#4a3526" },
    shaman: { body: "#4f7d7a", trim: "#2c4a48" },
    warlord: { body: "#8a4a3a", trim: "#40201a" },
  };
  const colors = bodyColors[kind];

  ctx.fillStyle = "rgba(20, 16, 28, 0.28)";
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, r * 1.05, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === "wolf") {
    // low, long body
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.45, r * 1.25, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(cx + f * r * 1.15, cy - r * 0.75, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // snout + ear
    ctx.beginPath();
    ctx.moveTo(cx + f * r * 1.45, cy - r * 0.8);
    ctx.lineTo(cx + f * r * 1.85, cy - r * 0.62);
    ctx.lineTo(cx + f * r * 1.4, cy - r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + f * r * 0.95, cy - r * 1.15);
    ctx.lineTo(cx + f * r * 1.15, cy - r * 1.5);
    ctx.lineTo(cx + f * r * 1.3, cy - r * 1.05);
    ctx.closePath();
    ctx.fill();
    // tail
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(cx - f * r * 1.2, cy - r * 0.6);
    ctx.quadraticCurveTo(cx - f * r * 1.7, cy - r * 1.15, cx - f * r * 1.5, cy - r * 1.35);
    ctx.stroke();
    ctx.fillStyle = "#e8d9b0";
    ctx.beginPath();
    ctx.arc(cx + f * r * 1.25, cy - r * 0.82, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const tall = kind === "brute" || kind === "warlord" ? 1.25 : 1;
    // body
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, cy + r * 0.35);
    ctx.quadraticCurveTo(cx - r * 0.95, cy - r * tall, cx, cy - r * 1.1 * tall);
    ctx.quadraticCurveTo(cx + r * 0.95, cy - r * tall, cx + r * 0.8, cy + r * 0.35);
    ctx.quadraticCurveTo(cx, cy + r * 0.6, cx - r * 0.8, cy + r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // head
    const hy = cy - r * 1.32 * tall;
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.arc(cx + f * 2, hy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.trim;
    ctx.stroke();
    // ears for goblinoids
    if (kind === "goblin" || kind === "shaman" || kind === "archer") {
      ctx.fillStyle = colors.body;
      ctx.beginPath();
      ctx.moveTo(cx - f * r * 0.3, hy - 2);
      ctx.lineTo(cx - f * r * 0.95, hy - 5);
      ctx.lineTo(cx - f * r * 0.3, hy + 3);
      ctx.closePath();
      ctx.fill();
    }
    // horns for brute/warlord
    if (kind === "brute" || kind === "warlord") {
      ctx.fillStyle = "#e8ddc8";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, hy - r * 0.3);
      ctx.quadraticCurveTo(cx - r * 0.75, hy - r * 0.95, cx - r * 0.5, hy - r * 1.1);
      ctx.lineTo(cx - r * 0.28, hy - r * 0.45);
      ctx.closePath();
      ctx.moveTo(cx + r * 0.4, hy - r * 0.3);
      ctx.quadraticCurveTo(cx + r * 0.75, hy - r * 0.95, cx + r * 0.5, hy - r * 1.1);
      ctx.lineTo(cx + r * 0.28, hy - r * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    // shaman hood + totem
    if (kind === "shaman") {
      ctx.fillStyle = colors.trim;
      ctx.beginPath();
      ctx.arc(cx + f * 1, hy - 1.5, r * 0.58, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.strokeStyle = "#7de8c9";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + f * (r + 3), cy + 2);
      ctx.lineTo(cx + f * (r + 3), cy - r * 1.8);
      ctx.stroke();
      ctx.fillStyle = "#7de8c9";
      ctx.shadowColor = "#7de8c9";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(cx + f * (r + 3), cy - r * 1.9, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // archer bow
    if (kind === "archer") {
      ctx.strokeStyle = "#4b431f";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx + f * (r + 4), cy - 12, 9, -Math.PI / 2.4, Math.PI / 2.4);
      ctx.stroke();
    }
    // brute club
    if (kind === "brute" || kind === "warlord") {
      ctx.save();
      ctx.translate(cx + f * (r + 4), cy - 8);
      ctx.scale(f, 1);
      ctx.rotate(-0.5 + unit.lunge * 1.5);
      ctx.fillStyle = "#5c4630";
      roundRect(ctx, -2.5, -r * 1.5, 6, r * 1.5, 2.5);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.5, -r * 1.5, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // eyes
    ctx.fillStyle = kind === "warlord" ? "#ffd76b" : "#241d2e";
    ctx.beginPath();
    ctx.arc(cx + f * (r * 0.3), hy + 0.5, kind === "warlord" ? 2.2 : 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (unit.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.7, unit.hitFlash * 4);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.55, r * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawEffectPips(ctx, unit, cx, cy - r * 2.3);
  drawHealthBar(ctx, unit);
}

function drawCorpse(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const fade = Math.max(0, 1 - unit.deathTime / 1.4);
  if (fade <= 0) return;
  ctx.globalAlpha = fade * 0.55;
  ctx.fillStyle = unit.team === "hero" ? "#8d7f96" : "#6e6659";
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y, unit.radius * 1.15, unit.radius * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawUnits(ctx: CanvasRenderingContext2D, battle: Battle, save: SaveData, selected: Unit | null): void {
  const sorted = [...battle.units].sort((a, b) => a.y - b.y);
  for (const unit of sorted) {
    if (!unit.alive) drawCorpse(ctx, unit);
  }
  for (const unit of sorted) {
    if (!unit.alive) continue;
    if (unit.team === "hero") drawHero(ctx, unit, save, unit === selected);
    else drawEnemy(ctx, unit);
  }
  // heal channel beams above bodies
  for (const unit of battle.units) {
    if (unit.alive && unit.channelBeam > 0 && unit.healTarget && unit.healTarget.alive) {
      const t = unit.healTarget;
      ctx.globalAlpha = 0.5 + Math.sin(battle.time * 10) * 0.15;
      ctx.strokeStyle = "#bff0b0";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -battle.time * 40;
      ctx.beginPath();
      ctx.moveTo(unit.x, unit.y - 18);
      ctx.quadraticCurveTo((unit.x + t.x) / 2, Math.min(unit.y, t.y) - 46, t.x, t.y - 18);
      ctx.stroke();
      ctx.setLineDash([]);
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
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(3, -2.6);
      ctx.lineTo(3, 2.6);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.kind === "bolt" ? 4.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(-7, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}
