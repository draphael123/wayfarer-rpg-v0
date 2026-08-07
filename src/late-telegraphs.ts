import type { Telegraph } from "./types";

export type LateTelegraphKind = "eruption" | "roots" | "eclipse" | "beam" | "shatter" | "bloodmoon" | "void";

interface LateTelegraphShape extends Telegraph {
  kind: Telegraph["kind"] | LateTelegraphKind;
  label?: string;
  angle?: number;
  length?: number;
}

const COLORS: Record<LateTelegraphKind, { edge: string; fill: string }> = {
  eruption: { edge: "#ff8a3d", fill: "rgba(255,84,32,.2)" },
  roots: { edge: "#aad16f", fill: "rgba(92,139,65,.18)" },
  eclipse: { edge: "#c4a9ee", fill: "rgba(72,48,108,.22)" },
  beam: { edge: "#ffe49a", fill: "rgba(255,215,112,.18)" },
  shatter: { edge: "#bdefff", fill: "rgba(109,213,242,.17)" },
  bloodmoon: { edge: "#f06d68", fill: "rgba(173,39,55,.2)" },
  void: { edge: "#aa9ce0", fill: "rgba(44,35,73,.3)" },
};

function isLateKind(kind: string): kind is LateTelegraphKind {
  return kind in COLORS;
}

/**
 * Late-road warnings deliberately differ in silhouette as well as hue. Their
 * short verb labels remain legible when effects overlap or color perception is
 * limited. Returns true when the mark was consumed.
 */
export function drawLateTelegraph(ctx: CanvasRenderingContext2D, source: Telegraph, battleTime: number): boolean {
  const mark = source as LateTelegraphShape;
  const kind = String(mark.kind);
  if (!isLateKind(kind)) return false;
  const t = Math.max(0, Math.min(1, mark.time / Math.max(0.01, mark.duration)));
  const colors = COLORS[kind];
  const ry = mark.radius * 0.55;
  const squeeze = 1 - t * 0.52;
  const pulse = 0.72 + Math.sin(battleTime * 12) * 0.12;

  ctx.save();
  ctx.globalAlpha = 0.72 + t * 0.22;
  ctx.translate(mark.x, mark.y);
  ctx.rotate(mark.angle ?? 0);

  if (kind === "beam" || kind === "bloodmoon") {
    const length = mark.length ?? mark.radius * (kind === "beam" ? 6 : 5);
    const halfWidth = mark.radius * (kind === "beam" ? 0.55 : 0.42);
    ctx.fillStyle = colors.fill;
    ctx.fillRect(-length / 2, -halfWidth, length, halfWidth * 2);
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 3 + t * 2;
    ctx.setLineDash(kind === "beam" ? [18, 5, 3, 5] : [10, 7]);
    ctx.lineDashOffset = (kind === "beam" ? 1 : -1) * battleTime * 24;
    ctx.strokeRect(-length / 2, -halfWidth, length, halfWidth * 2);
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-length / 2, -halfWidth * squeeze);
    ctx.lineTo(length / 2, -halfWidth * squeeze);
    ctx.moveTo(-length / 2, halfWidth * squeeze);
    ctx.lineTo(length / 2, halfWidth * squeeze);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    if (kind === "beam") {
      // A sun-ray symbol: parallel bars make the lane readable without color.
      for (const x of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(x, -9);
        ctx.lineTo(x, 9);
        ctx.stroke();
      }
    } else {
      // Forward chevrons communicate a charge, not a stationary blast.
      for (const x of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.moveTo(x - 7, -8);
        ctx.lineTo(x + 2, 0);
        ctx.lineTo(x - 7, 8);
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 3 + t * 2;
    ctx.setLineDash(kind === "roots" ? [5, 4] : kind === "void" ? [3, 8] : [11, 6]);
    ctx.lineDashOffset = (kind === "void" ? 1 : -1) * battleTime * 28;
    if (kind === "shatter") {
      // Match the actual hit shape: two narrow cardinal arms, with diagonal
      // pockets deliberately left transparent and safe.
      const armX = mark.radius * 0.2;
      const armY = mark.radius * 0.18;
      ctx.fillRect(-mark.radius, -armY, mark.radius * 2, armY * 2);
      ctx.fillRect(-armX, -mark.radius * 0.7, armX * 2, mark.radius * 1.4);
      ctx.strokeRect(-mark.radius, -armY, mark.radius * 2, armY * 2);
      ctx.strokeRect(-armX, -mark.radius * 0.7, armX * 2, mark.radius * 1.4);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, mark.radius, ry, 0, 0, Math.PI * 2);
      if (kind === "eclipse") ctx.ellipse(0, 0, mark.radius * 0.36, ry * 0.36, 0, 0, Math.PI * 2);
      ctx.fill(kind === "eclipse" ? "evenodd" : "nonzero");
      ctx.beginPath();
      ctx.ellipse(0, 0, mark.radius, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (kind === "eclipse") {
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.ellipse(0, 0, mark.radius * 0.36, ry * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.72;
    ctx.lineWidth = 2.2;
    if (kind !== "shatter") {
      ctx.beginPath();
      ctx.ellipse(0, 0, mark.radius * squeeze, ry * squeeze, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = pulse;

    if (kind === "eruption") {
      // Cracked triangular vent.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 3);
        ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 10);
      }
      ctx.stroke();
      ctx.fillStyle = colors.edge;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(9, 7);
      ctx.lineTo(-9, 7);
      ctx.closePath();
      ctx.fill();
    } else if (kind === "roots") {
      // Four hooked roots close toward the center.
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(mark.radius * 0.62, 0);
        ctx.quadraticCurveTo(mark.radius * 0.3, -9, 7, 0);
        ctx.stroke();
        ctx.restore();
      }
    } else if (kind === "eclipse") {
      // A crescent instead of a generic danger dot.
      ctx.fillStyle = colors.edge;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(27,20,39,.92)";
      ctx.beginPath();
      ctx.arc(6, -2, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "shatter") {
      // A cross-shaped fracture warns that cardinal dodges remain dangerous.
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(mark.radius * 0.52, -4);
        ctx.lineTo(mark.radius * 0.82, 3);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // The void spirals inward, visibly unlike an impact ring.
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = i * 0.5 + battleTime * 0.7;
        const radius = (i / 28) * mark.radius * 0.55;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius * 0.52;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
  // Text stays upright even for diagonal lanes. The timer is short enough to
  // read at a glance and is not the only urgency cue.
  const label = mark.label ?? kind.toUpperCase();
  const seconds = Math.max(0, mark.duration - mark.time);
  const lane = kind === "beam" || kind === "bloodmoon";
  const labelOffset = mark.radius + 8;
  const labelX = lane ? mark.x + Math.sin(mark.angle ?? 0) * labelOffset : mark.x;
  const labelY = lane ? mark.y - Math.cos(mark.angle ?? 0) * labelOffset : mark.y - ry - 7;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(22,16,29,.9)";
  ctx.fillText(`${label} ${seconds.toFixed(1)}`, labelX + 1, labelY + 1);
  ctx.fillStyle = colors.edge;
  ctx.fillText(`${label} ${seconds.toFixed(1)}`, labelX, labelY);
  ctx.restore();
  return true;
}
