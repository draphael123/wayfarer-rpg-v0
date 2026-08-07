import { isLateBossKind, isLateFoeKind } from "./late-content";
import type { EnemyKind, Unit } from "./types";

const INK = "#201a2d";

function fillStroke(ctx: CanvasRenderingContext2D, fill: string, width = 2.4): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  fillStroke(ctx, fill);
}

function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number, fill: string): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.lineCap = "butt";
}

function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y - h * 0.15);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x - w * 0.55, y - h * 0.08);
  ctx.lineTo(x - w, y - h * 0.3);
  ctx.closePath();
  fillStroke(ctx, fill);
  ctx.strokeStyle = "rgba(220,250,255,.65)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.86);
  ctx.lineTo(x + w * 0.32, y - h * 0.2);
  ctx.stroke();
}

function castHalo(ctx: CanvasRenderingContext2D, unit: Unit, color: string, radius: number): void {
  if (unit.castGlow <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.85, 0.2 + unit.castGlow);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.8, radius * (1.1 + (1 - unit.castGlow) * 0.25), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Draws every enemy introduced after Stormbreak. Returns false for old foes. */
export function drawLateEnemy(ctx: CanvasRenderingContext2D, unit: Unit, time: number): boolean {
  const kind = String(unit.enemyKind);
  if (!isLateFoeKind(kind) && !isLateBossKind(kind)) return false;
  const boss = isLateBossKind(kind);
  const r = unit.radius;
  const bob = Math.sin(time * (boss ? 2 : 3.6) + unit.id * 0.7) * (boss ? 1.5 : 2.2);
  const pulse = 0.5 + Math.sin(time * 4 + unit.id) * 0.5;

  ctx.save();
  ctx.translate(unit.x, unit.y);
  // Broad, grounded shadow first; floating creatures override it with a softer one.
  ctx.globalAlpha = boss ? 0.28 : 0.22;
  ctx.fillStyle = "#171221";
  ctx.beginPath();
  ctx.ellipse(0, 2, r * (boss ? 1.35 : 1.05), r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.scale(unit.facing, 1);

  if (kind === "cinderkin") {
    castHalo(ctx, unit, "#ff9b42", r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 0.45, -r * 1.7 + bob);
    ctx.lineTo(r * 0.42, -r * 1.65 + bob);
    ctx.lineTo(r * 0.78, 0);
    ctx.closePath();
    fillStroke(ctx, "#6f352c");
    ellipse(ctx, 0, -r * 1.48 + bob, r * 0.42, r * 0.48, "#2b2230");
    ctx.fillStyle = "#ffc35b";
    ctx.shadowColor = "#ff6a32";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(r * 0.12, -r * 1.5 + bob, 2.6 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    limb(ctx, r * 0.42, -r * 1.05, r * 0.9, -r * 0.42, 4, "#9a5437");
    limb(ctx, r * 0.88, -r * 1.55, r * 0.88, 0, 3.5, "#432d2b");
    ellipse(ctx, r * 0.88, -r * 1.72, r * 0.17, r * 0.22, "#ff9b42");
  } else if (kind === "briarback") {
    castHalo(ctx, unit, "#9ad06a", r);
    ellipse(ctx, 0, -r * 0.65 + bob * 0.3, r * 0.95, r * 0.62, "#405d3a", -0.08);
    for (const sx of [-0.55, -0.15, 0.26]) {
      ctx.beginPath();
      ctx.moveTo(r * sx, -r * 1.05);
      ctx.lineTo(r * (sx + 0.15), -r * 1.68 - pulse * 4);
      ctx.lineTo(r * (sx + 0.34), -r * 1.02);
      ctx.closePath();
      fillStroke(ctx, "#728a48", 1.8);
    }
    ellipse(ctx, r * 0.75, -r * 0.7, r * 0.5, r * 0.42, "#557348");
    ctx.strokeStyle = "#e8dfb7";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r * 0.95, -r * 0.55, r * 0.32, 0.2, 1.45);
    ctx.stroke();
    for (const x of [-0.55, 0.1, 0.58]) limb(ctx, r * x, -r * 0.35, r * x, 0, 6, "#493a2e");
  } else if (kind === "gloomwing") {
    castHalo(ctx, unit, "#b9a1e5", r);
    ctx.save();
    ctx.translate(0, -r * 0.95 + bob);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.25);
      ctx.quadraticCurveTo(side * r * 1.45, -r * 1.05, side * r * 1.25, r * 0.25);
      ctx.quadraticCurveTo(side * r * 0.8, r * 0.75, 0, r * 0.28);
      ctx.closePath();
      fillStroke(ctx, side < 0 ? "#4c3d63" : "#5b4974");
      ctx.fillStyle = "#b9a1e5";
      ctx.beginPath();
      ctx.arc(side * r * 0.72, -r * 0.1, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ellipse(ctx, 0, 0, r * 0.25, r * 0.82, "#282134");
    for (const side of [-1, 1]) limb(ctx, side * 2, -r * 0.68, side * r * 0.5, -r * 1.2, 1.5, "#b9a1e5");
    ctx.restore();
  } else if (kind === "reliquaryguard") {
    castHalo(ctx, unit, "#ffe39a", r);
    ellipse(ctx, 0, -r * 1.15 + bob, r * 0.62, r * 0.76, "#736d60");
    ellipse(ctx, 0, -r * 1.86 + bob, r * 0.42, r * 0.38, "#918875");
    ctx.fillStyle = "#171221";
    ctx.fillRect(-r * 0.25, -r * 1.92 + bob, r * 0.5, r * 0.12);
    ctx.strokeStyle = "#f3d98e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -r * 2.36 + bob, r * 0.55, r * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
    limb(ctx, -r * 0.42, -r * 1.25, -r * 0.7, -r * 0.12, 7, "#847a66");
    limb(ctx, r * 0.42, -r * 1.25, r * 0.72, -r * 0.12, 7, "#847a66");
  } else if (kind === "shardling") {
    castHalo(ctx, unit, "#c7f1ff", r);
    crystal(ctx, 0, bob, r * 0.9, r * 2.25, "#5a809a");
    crystal(ctx, -r * 0.65, -r * 0.05 + bob, r * 0.4, r * 1.3, "#82aabc");
    crystal(ctx, r * 0.65, -r * 0.1 + bob, r * 0.42, r * 1.48, "#719bb0");
    ctx.fillStyle = "#e8fdff";
    ctx.shadowColor = "#8aeaff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 1.35 + bob, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (kind === "bloodreaver") {
    castHalo(ctx, unit, "#ef6b68", r);
    limb(ctx, -r * 0.25, -r * 0.55, -r * 0.48, 0, 6, "#392631");
    limb(ctx, r * 0.22, -r * 0.55, r * 0.55, 0, 6, "#4a2934");
    ellipse(ctx, 0, -r * 1.02 + bob * 0.3, r * 0.55, r * 0.72, "#602c38");
    ellipse(ctx, r * 0.1, -r * 1.75 + bob * 0.3, r * 0.38, r * 0.42, "#7a3940");
    for (const side of [-1, 1]) {
      ctx.strokeStyle = "#d8c6aa";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(side * r * 0.16, -r * 2.02);
      ctx.lineTo(side * r * 0.44, -r * 2.45);
      ctx.lineTo(side * r * 0.63, -r * 2.22);
      ctx.stroke();
    }
    ctx.strokeStyle = "#f08879";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(r * 0.48, -r * 1.12);
    ctx.lineTo(r * 1.15, -r * 0.1);
    ctx.stroke();
  } else if (kind === "nullwalker") {
    castHalo(ctx, unit, "#9f91d1", r);
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, 0);
    ctx.quadraticCurveTo(-r * 0.55, -r * 1.85 + bob, 0, -r * 2.2 + bob);
    ctx.quadraticCurveTo(r * 0.62, -r * 1.75 + bob, r * 0.8, 0);
    ctx.closePath();
    fillStroke(ctx, "#29263a");
    ctx.fillStyle = "#11101a";
    ctx.beginPath();
    ctx.ellipse(r * 0.08, -r * 1.55 + bob, r * 0.27, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9f91d1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(r * 0.08, -r * 1.55 + bob, r * 0.29, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (["ashenhound", "vinelurker", "glassjackal", "moonfang", "rifthound"].includes(kind)) {
    const styles: Record<string, [string, string]> = {
      ashenhound: ["#4d3733", "#ff8f4f"], vinelurker: ["#284b3c", "#8fcf6a"], glassjackal: ["#3a3852", "#d8c7ff"],
      moonfang: ["#4d2834", "#ff8176"], rifthound: ["#262337", "#a99ae0"],
    };
    const [body, glow] = styles[kind];
    castHalo(ctx, unit, glow, r);
    ellipse(ctx, -r * 0.12, -r * 0.66 + bob * 0.15, r * 0.92, r * 0.47, body, -0.08);
    ellipse(ctx, r * 0.72, -r * 0.88 + bob * 0.15, r * 0.46, r * 0.4, body);
    for (const x of [-0.62, -0.18, 0.38, 0.7]) limb(ctx, r * x, -r * 0.5, r * (x + (x > 0 ? 0.1 : -0.08)), 0, 5, body);
    ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.arc(r * 0.88, -r * 0.94, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (kind === "ashenhound") {
      for (let i = 0; i < 4; i++) crystal(ctx, -r * 0.55 + i * r * 0.28, -r * 0.95, r * 0.1, r * (0.32 + i * 0.05), glow);
      ctx.strokeStyle = "rgba(255,130,65,.55)"; ctx.beginPath(); ctx.arc(-r * 0.92, -r * 0.75, r * 0.55, 2.9, 5.2); ctx.stroke();
    } else if (kind === "vinelurker") {
      ctx.strokeStyle = glow; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.72); ctx.bezierCurveTo(-r * 1.5, -r * 1.25, -r * 1.4, 0, -r * 0.92, -r * 0.05); ctx.stroke();
      ellipse(ctx, -r * 0.38, -r * 1.08, r * 0.22, r * 0.12, glow, -0.4);
    } else if (kind === "glassjackal") {
      for (const side of [-1, 1]) crystal(ctx, r * (0.63 + side * 0.18), -r * 1.1, r * 0.12, r * (0.48 + (side > 0 ? 0.12 : 0)), glow);
      ctx.strokeStyle = glow; ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.82); ctx.lineTo(-r * 1.35, -r * 1.15); ctx.stroke();
    } else if (kind === "moonfang") {
      ctx.strokeStyle = "#e7cfb2"; ctx.lineWidth = 2.6; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 0.67, -r * 1.13); ctx.lineTo(r * (0.7 + side * 0.28), -r * 1.55); ctx.lineTo(r * (0.82 + side * 0.38), -r * 1.38); ctx.stroke(); }
    } else {
      ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(-r * 0.12, -r * 0.66, r * 1.02, r * 0.58, -0.08, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#11101a"; ctx.beginPath(); ctx.ellipse(-r * 0.15, -r * 0.68, r * 0.32, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (["furnacecantor", "sporeseer", "mirageseer", "censerwraith", "briarwitch", "waylostarcher"].includes(kind)) {
    const styles: Record<string, [string, string]> = {
      furnacecantor: ["#592f2b", "#ffd06b"], sporeseer: ["#3e5947", "#d6ea82"], mirageseer: ["#51476b", "#edddff"],
      censerwraith: ["#655d58", "#f4d997"], briarwitch: ["#542938", "#f1a08a"], waylostarcher: ["#343044", "#c3b5e9"],
    };
    const [robe, glow] = styles[kind];
    castHalo(ctx, unit, glow, r);
    ctx.beginPath(); ctx.moveTo(-r * 0.72, 0); ctx.lineTo(-r * 0.43, -r * 1.58 + bob); ctx.quadraticCurveTo(0, -r * 2, r * 0.43, -r * 1.58 + bob); ctx.lineTo(r * 0.72, 0); ctx.closePath(); fillStroke(ctx, robe);
    ellipse(ctx, 0, -r * 1.72 + bob, r * 0.34, r * 0.4, "#251f2c");
    if (kind === "furnacecantor") {
      limb(ctx, r * 0.38, -r * 1.15, r * 0.9, -r * 0.1, 3, "#3c2826"); ellipse(ctx, r * 0.9, -r * 1.55, r * 0.19, r * 0.24, glow);
      ctx.strokeStyle = glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -r * 2.08, r * 0.42, Math.PI, Math.PI * 2); ctx.stroke();
    } else if (kind === "sporeseer") {
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(0, -r * 2.08, r * 0.72, r * 0.24, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const x of [-0.38, 0, 0.4]) ellipse(ctx, r * x, -r * 2.2, r * 0.08, r * 0.08, "#f5f2b1");
    } else if (kind === "mirageseer") {
      ctx.strokeStyle = glow; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -r * (1.78 + i * 0.15), r * (0.46 + i * 0.14), r * 0.16, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else if (kind === "censerwraith") {
      ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 1.2); ctx.quadraticCurveTo(r * 1.0, -r * 0.8, r * 0.76, -r * 0.2); ctx.stroke(); ellipse(ctx, r * 0.76, -r * 0.08, r * 0.18, r * 0.2, glow);
      ctx.globalAlpha = 0.4; for (let i = 0; i < 3; i++) ellipse(ctx, -r * 0.2 + i * r * 0.2, -r * (2.2 + i * 0.12), r * 0.16, r * 0.09, glow); ctx.globalAlpha = 1;
    } else if (kind === "briarwitch") {
      ctx.strokeStyle = "#d9c2aa"; ctx.lineWidth = 3; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * r * 0.18, -r * 1.98); ctx.lineTo(side * r * 0.55, -r * 2.52); ctx.lineTo(side * r * 0.72, -r * 2.3); ctx.stroke(); }
      limb(ctx, r * 0.35, -r * 1.1, r * 0.95, -r * 0.25, 3, glow);
    } else {
      ctx.strokeStyle = glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 0.58, -r * 1.05, r * 0.62, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r * 0.56, -r * 1.62); ctx.lineTo(r * 0.56, -r * 0.48); ctx.stroke();
    }
  } else if (kind === "oathbreaker" || kind === "thundermonk") {
    const storm = kind === "thundermonk";
    const body = storm ? "#526a79" : "#6f665b";
    const glow = storm ? "#f1fdff" : "#d9b866";
    castHalo(ctx, unit, glow, r);
    limb(ctx, -r * 0.28, -r * 0.55, -r * 0.42, 0, 7, body); limb(ctx, r * 0.28, -r * 0.55, r * 0.42, 0, 7, body);
    ellipse(ctx, 0, -r * 1.15 + bob * 0.2, r * 0.62, r * 0.8, body); ellipse(ctx, 0, -r * 1.92 + bob * 0.2, r * 0.4, r * 0.4, storm ? "#344e5d" : "#857866");
    if (storm) {
      ctx.strokeStyle = glow; ctx.lineWidth = 3; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * r * 0.4, -r * 1.25); ctx.lineTo(side * r * 0.95, -r * 0.8); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, -r * 1.95, r * 0.2, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = "#2a2329"; ctx.fillRect(-r * 0.28, -r * 2.0, r * 0.56, r * 0.12); limb(ctx, r * 0.45, -r * 1.25, r * 0.95, -r * 0.15, 5, glow);
      ctx.strokeStyle = glow; ctx.beginPath(); ctx.arc(0, -r * 2.45, r * 0.52, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (kind === "galeroc") {
    castHalo(ctx, unit, "#c9f7ff", r);
    ctx.save(); ctx.translate(0, -r * 0.82 + bob);
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * r * 1.55, -r * 1.1, side * r * 1.45, r * 0.28); ctx.lineTo(side * r * 0.35, r * 0.38); ctx.closePath(); fillStroke(ctx, side < 0 ? "#41677b" : "#527f91"); }
    ellipse(ctx, 0, 0, r * 0.38, r * 0.72, "#355767"); crystal(ctx, r * 0.08, -r * 0.75, r * 0.22, r * 0.55, "#c9f7ff");
    ctx.restore();
  } else if (["kilntyrant", "rootboundmatriarch", "dunerevenant", "gildedinquisitor", "tempestroc", "redhuntsman", "lastpilgrim"].includes(kind)) {
    const styles: Record<string, [string, string]> = {
      kilntyrant: ["#66342b", "#ffb253"], rootboundmatriarch: ["#3d5439", "#b9dc78"], dunerevenant: ["#403650", "#d7c1f3"],
      gildedinquisitor: ["#746a57", "#ffe195"], tempestroc: ["#416477", "#c7f6ff"], redhuntsman: ["#542733", "#f47a70"], lastpilgrim: ["#302b40", "#c3b2e8"],
    };
    const [body, glow] = styles[kind];
    castHalo(ctx, unit, glow, r * 1.25);
    if (kind === "rootboundmatriarch") {
      ellipse(ctx, 0, -r * 0.72, r * 0.9, r * 0.65, body); for (const side of [-1, 1]) for (let i = 0; i < 3; i++) limb(ctx, side * r * (0.3 + i * 0.2), -r * 0.55, side * r * (1.15 + i * 0.16), -r * (0.05 + i * 0.18), 7, body);
      ctx.strokeStyle = glow; ctx.lineWidth = 4; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * r * 0.2, -r * 1.2); ctx.lineTo(side * r * 0.62, -r * 2.05); ctx.stroke(); }
    } else if (kind === "tempestroc") {
      ctx.save(); ctx.translate(0, -r * 0.7 + bob); for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * r * 2.0, -r * 1.35, side * r * 1.75, r * 0.45); ctx.lineTo(side * r * 0.38, r * 0.55); ctx.closePath(); fillStroke(ctx, side < 0 ? body : "#547d8e", 4); } ellipse(ctx, 0, 0, r * 0.42, r * 0.95, body); crystal(ctx, 0, -r * 0.95, r * 0.3, r * 0.75, glow); ctx.restore();
    } else {
      ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 0.56, -r * 2.05 + bob * 0.15); ctx.quadraticCurveTo(0, -r * 2.55 + bob * 0.15, r * 0.56, -r * 2.05 + bob * 0.15); ctx.lineTo(r * 0.9, 0); ctx.closePath(); fillStroke(ctx, body, 4);
      ellipse(ctx, 0, -r * 2.0 + bob * 0.15, r * 0.46, r * 0.48, kind === "lastpilgrim" ? "#15131e" : body);
      if (kind === "kilntyrant") { ctx.fillStyle = "#251a1c"; ctx.fillRect(-r * 0.46, -r * 1.42, r * 0.92, r * 0.68); ctx.strokeStyle = glow; ctx.strokeRect(-r * 0.36, -r * 1.32, r * 0.72, r * 0.45); for (const x of [-0.45, 0, 0.45]) crystal(ctx, r * x, -r * 2.42, r * 0.12, r * 0.48, glow); }
      else if (kind === "dunerevenant") { ctx.strokeStyle = glow; ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -r * (1.45 + i * 0.35), r * (0.72 + i * 0.2), r * 0.22, 0, 0, Math.PI * 2); ctx.stroke(); } }
      else if (kind === "gildedinquisitor") { ctx.fillStyle = "#1c1820"; ctx.fillRect(-r * 0.3, -r * 2.1, r * 0.6, r * 0.14); ctx.strokeStyle = glow; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -r * 2.72, r * 0.8, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke(); limb(ctx, r * 0.42, -r * 1.5, r * 1.15, -r * 0.1, 6, glow); }
      else if (kind === "redhuntsman") { ctx.strokeStyle = "#e4ceb0"; ctx.lineWidth = 4; for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * r * 0.15, -r * 2.35); ctx.lineTo(side * r * 0.62, -r * 3.0); ctx.lineTo(side * r * 0.88, -r * 2.7); ctx.stroke(); } limb(ctx, r * 0.42, -r * 1.35, r * 1.2, -r * 0.05, 6, glow); }
      else { ctx.strokeStyle = glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -r * 1.65, r * 0.82, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r * 0.35, 0); ctx.lineTo(0, -r * 1.45); ctx.lineTo(r * 0.35, 0); ctx.stroke(); }
    }
  } else if (kind === "cindermaw") {
    castHalo(ctx, unit, "#ff7d38", r * 1.25);
    ellipse(ctx, -r * 0.15, -r * 0.68 + bob * 0.2, r * 1.25, r * 0.68, "#663025", -0.08);
    for (const x of [-0.75, -0.15, 0.5]) limb(ctx, r * x, -r * 0.48, r * (x - 0.12), 0, 10, "#512923");
    ellipse(ctx, r * 0.95, -r * 0.78 + bob * 0.2, r * 0.72, r * 0.52, "#7a3827");
    ctx.fillStyle = "#1d1721";
    ctx.beginPath();
    ctx.ellipse(r * 1.28, -r * 0.62, r * 0.42, r * (0.1 + pulse * 0.12), 0.05, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 7; i++) crystal(ctx, -r * 0.8 + i * r * 0.28, -r * 1.05, r * 0.13, r * (0.38 + (i % 2) * 0.16), "#d85c2e");
    ctx.strokeStyle = "#ffad4d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.72);
    ctx.lineTo(-r * 0.25, -r * 0.52);
    ctx.lineTo(r * 0.08, -r * 0.82);
    ctx.lineTo(r * 0.48, -r * 0.58);
    ctx.stroke();
  } else if (kind === "verdantcolossus") {
    castHalo(ctx, unit, "#a5cf72", r * 1.3);
    limb(ctx, -r * 0.3, -r * 0.75, -r * 0.55, 0, 14, "#4c3d2d");
    limb(ctx, r * 0.3, -r * 0.75, r * 0.6, 0, 14, "#554431");
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, -r * 0.45);
    ctx.lineTo(-r * 0.55, -r * 2.1 + bob * 0.2);
    ctx.lineTo(r * 0.55, -r * 2.05 + bob * 0.2);
    ctx.lineTo(r * 0.78, -r * 0.4);
    ctx.closePath();
    fillStroke(ctx, "#4b3c2d", 4);
    for (const side of [-1, 1]) {
      limb(ctx, side * r * 0.45, -r * 1.65, side * r * 1.22, -r * 1.95, 9, "#5a4934");
      limb(ctx, side * r * 0.9, -r * 1.85, side * r * 1.35, -r * 2.38, 5, "#5a4934");
      ellipse(ctx, side * r * 1.25, -r * 2.18, r * 0.48, r * 0.35, "#527044");
    }
    ctx.fillStyle = "#b9e37d";
    ctx.shadowColor = "#82c85c";
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 1.42, r * 0.16 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (kind === "nightmother") {
    castHalo(ctx, unit, "#c2a4e8", r * 1.35);
    ctx.save();
    ctx.translate(0, -r * 1.15 + bob);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.45);
      ctx.quadraticCurveTo(side * r * 1.9, -r * 1.35, side * r * 1.58, r * 0.55);
      ctx.quadraticCurveTo(side * r * 0.9, r * 1.0, 0, r * 0.38);
      ctx.closePath();
      fillStroke(ctx, side < 0 ? "#3b2f50" : "#493961", 4);
      ellipse(ctx, side * r, -r * 0.12, r * 0.27, r * 0.38, "#ad8ace");
    }
    ellipse(ctx, 0, 0, r * 0.36, r * 1.05, "#211a2d");
    for (const side of [-1, 1]) limb(ctx, side * r * 0.12, -r * 0.75, side * r * 0.72, -r * 1.5, 3, "#d2b6ee");
    ctx.restore();
  } else if (kind === "reliquaryseraph") {
    castHalo(ctx, unit, "#ffe6a0", r * 1.35);
    ctx.save();
    ctx.translate(0, -r * 1.05 + bob);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.28, -r * 0.45 + i * r * 0.32);
        ctx.quadraticCurveTo(side * r * (1.75 - i * 0.12), -r * (1.05 - i * 0.5), side * r * (1.35 - i * 0.1), r * (0.05 + i * 0.35));
        ctx.quadraticCurveTo(side * r * 0.72, r * (0.05 + i * 0.25), side * r * 0.28, -r * 0.45 + i * r * 0.32);
        fillStroke(ctx, i % 2 ? "#c6b778" : "#e1d39a", 2.2);
      }
    }
    ellipse(ctx, 0, 0, r * 0.58, r * 0.88, "#77715f");
    ellipse(ctx, 0, -r * 0.92, r * 0.4, r * 0.42, "#9b9176");
    ctx.fillStyle = "#191421";
    ctx.fillRect(-r * 0.25, -r, r * 0.5, r * 0.12);
    ctx.strokeStyle = "#ffe6a0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.52, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (kind === "skybreaker") {
    castHalo(ctx, unit, "#bdefff", r * 1.35);
    ctx.save();
    ctx.translate(0, -r * 0.8 + bob);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.lineTo(side * r * 1.75, -r * 1.22);
      ctx.lineTo(side * r * 1.35, r * 0.25);
      ctx.lineTo(side * r * 0.42, r * 0.55);
      ctx.closePath();
      fillStroke(ctx, side < 0 ? "#426177" : "#54778e", 4);
      for (let i = 0; i < 3; i++) crystal(ctx, side * r * (0.65 + i * 0.34), r * (0.22 - i * 0.18), r * 0.15, r * 0.7, "#8fc8dc");
    }
    crystal(ctx, 0, r * 0.55, r * 0.65, r * 1.9, "#547c93");
    ctx.fillStyle = "#efffff";
    ctx.shadowColor = "#91e9ff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(r * 0.14, -r * 0.7, r * 0.12 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (kind === "bloodmoonstag") {
    castHalo(ctx, unit, "#ef6d68", r * 1.3);
    ellipse(ctx, -r * 0.15, -r * 0.8 + bob * 0.25, r * 1.1, r * 0.57, "#552631", -0.08);
    for (const x of [-0.75, -0.2, 0.35, 0.72]) limb(ctx, r * x, -r * 0.55, r * (x + (x > 0 ? 0.12 : -0.12)), 0, 8, "#3e2530");
    limb(ctx, r * 0.58, -r * 1.02, r * 0.84, -r * 1.78, 12, "#602c37");
    ellipse(ctx, r * 0.9, -r * 1.92, r * 0.42, r * 0.5, "#6f303a");
    for (const side of [-1, 1]) {
      ctx.strokeStyle = "#dbc6a5";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(r * (0.78 + side * 0.12), -r * 2.25);
      ctx.lineTo(r * (0.62 + side * 0.58), -r * 2.9);
      ctx.lineTo(r * (0.75 + side * 0.72), -r * 2.62);
      ctx.moveTo(r * (0.82 + side * 0.42), -r * 2.68);
      ctx.lineTo(r * (0.95 + side * 0.65), -r * 2.42);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff8a78";
    ctx.shadowColor = "#ff4e52";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(r * 1.06, -r * 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (kind === "wayeater") {
    castHalo(ctx, unit, "#aa9ce0", r * 1.4);
    ctx.save();
    ctx.translate(0, bob * 0.4);
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, 0);
    ctx.quadraticCurveTo(-r * 1.0, -r * 2.5, 0, -r * 2.72);
    ctx.quadraticCurveTo(r * 1.05, -r * 2.45, r * 1.08, 0);
    ctx.lineTo(r * 0.58, 0);
    ctx.quadraticCurveTo(r * 0.55, -r * 1.78, 0, -r * 1.9);
    ctx.quadraticCurveTo(-r * 0.55, -r * 1.72, -r * 0.58, 0);
    ctx.closePath();
    fillStroke(ctx, "#29263b", 5);
    // The road continues into the hollow body, establishing the final silhouette.
    ctx.fillStyle = "#11101a";
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(-r * 0.18, -r * 1.65);
    ctx.quadraticCurveTo(0, -r * 2, r * 0.18, -r * 1.65);
    ctx.lineTo(r * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#8f83c4";
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.24, 0);
      ctx.lineTo(side * r * 0.08, -r * 1.58);
      ctx.stroke();
    }
    ctx.fillStyle = "#d7ccff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * r * 0.22, -r * 2.22, r * (0.075 + pulse * 0.02), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (unit.hitFlash > 0) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = Math.min(0.75, unit.hitFlash * 1.8);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, -r, r * (boss ? 1.4 : 1.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return true;
}

/** Portrait-safe reuse of the authored battle silhouettes. Arena, scout and
 * bestiary cards therefore show the same creature players learn in combat. */
export function drawLateEnemyIcon(ctx: CanvasRenderingContext2D, kind: EnemyKind): boolean {
  if (!isLateFoeKind(kind) && !isLateBossKind(kind)) return false;
  const boss = isLateBossKind(kind);
  const portraitUnit = {
    enemyKind: kind,
    id: 0,
    radius: boss ? 12.5 : 14,
    x: 32,
    y: boss ? 59 : 58,
    facing: 1,
    castGlow: 0,
    hitFlash: 0,
  } as Unit;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 64, 64);
  ctx.clip();
  const drawn = drawLateEnemy(ctx, portraitUnit, 0);
  ctx.restore();
  return drawn;
}
