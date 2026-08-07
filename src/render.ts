import type { Battle } from "./battle";
import { ARMOR_FAMILY_TIER, BOSS_PHASES, ENEMIES, armorById, callingById, callingEligible, deriveStats, heroGearOf, HEROES } from "./data";
import {
  drawLateRoadAtmosphere,
  drawLateRoadSetDressing,
  drawLateRoadSkyline,
  lateRoadDarkness,
  lateRoadGrade,
  lateRoadIsNight,
} from "./late-road";
import { isLateBossKind } from "./late-content";
import { drawLateEnemy } from "./late-sprites";
import { drawLateTelegraph } from "./late-telegraphs";
import type { ElementId, EnemyRole, SaveData, StageDef, Unit } from "./types";

const OUTLINE = "#241b2e";
const ROLE_GLYPHS: Record<EnemyRole, string> = {
  vanguard: "◆", tank: "▣", hunter: "⌖", assassin: "✦", artillery: "⌁",
  support: "+", controller: "◎", disruptor: "×", summoner: "◇",
};
const ELEMENT_MARK_COLORS: Record<ElementId, string> = {
  flame: "#ff9b42", frost: "#a9ddf5", storm: "#8fc7e8", earth: "#c9a06b",
  venom: "#9ad06a", radiant: "#ffe9a3", blood: "#d95763", shadow: "#a89bd8",
};

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
  ctx.lineWidth = width + 3.2;
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
  travel?: number; // how far the band has marched — the world slides by this

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

/** Act I gains one readable destination silhouette per road, beyond its close props. */
function drawSouthRoadSkyline(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, horizon: number, time: number, travel: number): void {
  if (stage.id < 0 || stage.id > 5) return;
  const x = w * 0.72 - (travel * 0.12) % 90;
  ctx.save();
  ctx.lineCap = "round";
  if (stage.id === 0) {
    // MILLBROOK: the mill that gives the first village its name.
    ctx.fillStyle = "#6e6549"; ctx.fillRect(x - 42, horizon - 64, 68, 68);
    ctx.fillStyle = "#584a39"; ctx.beginPath(); ctx.moveTo(x - 52, horizon - 64); ctx.lineTo(x - 8, horizon - 94); ctx.lineTo(x + 36, horizon - 64); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#514535"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x + 30, horizon - 22, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(x + 30, horizon - 22); ctx.rotate(time * 0.18); for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(31, 0); ctx.stroke(); } ctx.restore();
  } else if (stage.id === 1) {
    // THORNWOOD: two ancient trunks have grown into a gate over the road.
    ctx.strokeStyle = "#243b2d"; ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(x - 58, horizon + 4); ctx.quadraticCurveTo(x - 56, horizon - 82, x, horizon - 96); ctx.quadraticCurveTo(x + 58, horizon - 84, x + 62, horizon + 4); ctx.stroke();
    ctx.strokeStyle = "#4d2830"; ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const tx = x - 58 + i * 11; const ty = horizon - 55 - Math.sin(i * 0.7) * 28; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + (i % 2 ? 8 : -8), ty - 12); ctx.stroke(); }
  } else if (stage.id === 2) {
    // MIREBROOK: a chapel sinking by inches, its steeple still above the fog.
    ctx.fillStyle = "#354d49"; ctx.fillRect(x - 48, horizon - 54, 92, 58);
    ctx.beginPath(); ctx.moveTo(x - 58, horizon - 54); ctx.lineTo(x - 5, horizon - 82); ctx.lineTo(x + 54, horizon - 54); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + 4, horizon - 112, 26, 60); ctx.beginPath(); ctx.moveTo(x, horizon - 112); ctx.lineTo(x + 17, horizon - 137); ctx.lineTo(x + 34, horizon - 112); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(172, 205, 184, 0.3)"; ctx.beginPath(); ctx.arc(x + 17, horizon - 94, 7, 0, Math.PI * 2); ctx.fill();
  } else if (stage.id === 3) {
    // CHARWOOD: a burned watchtower leans over the ash line.
    ctx.save(); ctx.translate(x, horizon + 4); ctx.rotate(-0.08);
    ctx.strokeStyle = "#302724"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-24, -108); ctx.moveTo(32, 0); ctx.lineTo(22, -108); ctx.stroke();
    ctx.fillStyle = "#3b2925"; ctx.fillRect(-42, -116, 76, 18); ctx.fillRect(-47, -87, 86, 11);
    ctx.fillStyle = `rgba(220, 92, 47, ${0.28 + Math.sin(time * 3) * 0.08})`; ctx.beginPath(); ctx.moveTo(-10, -114); ctx.quadraticCurveTo(2, -142, 13, -112); ctx.closePath(); ctx.fill(); ctx.restore();
  } else if (stage.id === 4) {
    // GLOAMING PASS: the moon gate frames the road to the Alpha.
    ctx.strokeStyle = "#3d3850"; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(x, horizon + 3, 68, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(200, 194, 232, 0.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, horizon + 3, 57, Math.PI, Math.PI * 2); ctx.stroke();
    for (const side of [-1, 1]) { ctx.fillStyle = "#332f45"; ctx.fillRect(x + side * 64 - 10, horizon - 53, 20, 58); }
  } else {
    // GOREHULK'S HOLLOW: a rough palisade and trophies announce the war camp.
    ctx.fillStyle = "#3a3028";
    for (let i = -5; i <= 5; i++) { const px = x + i * 19; const ph = 58 + Math.abs(i % 3) * 13; ctx.beginPath(); ctx.moveTo(px - 8, horizon + 4); ctx.lineTo(px - 8, horizon - ph); ctx.lineTo(px, horizon - ph - 13); ctx.lineTo(px + 8, horizon - ph); ctx.lineTo(px + 8, horizon + 4); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = "#7b302b"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, horizon - 54); ctx.lineTo(x, horizon - 132); ctx.stroke();
    ctx.fillStyle = "#8a342d"; ctx.beginPath(); ctx.moveTo(x, horizon - 130); ctx.lineTo(x + 48 + Math.sin(time * 2) * 5, horizon - 118); ctx.lineTo(x, horizon - 98); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Each Winterreach stage owns a skyline: drifts, glass pines, black ice,
 *  a crystal cave, avalanche country, and the throne of the Hollow Crown. */
function drawWinterSkyline(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, horizon: number, time: number, travel: number): void {
  const M = OVERSCAN;
  if (stage.id === 6) {
    // THE WHITE ROAD: open drift country and a fence line marching to nowhere
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#eef4f8";
    ctx.beginPath();
    ctx.moveTo(-M, horizon + 2);
    for (let x = -M; x <= w + M; x += 12) {
      ctx.lineTo(x, horizon - 8 - Math.abs(Math.sin((x + travel * 0.4) * 0.006 + 2)) * 14);
    }
    ctx.lineTo(w + M, horizon + 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // half-buried fence posts along the ridge
    ctx.strokeStyle = "#7d90a0";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const fx2 = ((i * (w / 7) - travel * 0.32) % (w + 60) + (w + 60)) % (w + 60) - 30;
      const fy = horizon - 4 - Math.sin(fx2 * 0.008 + 1.7) * 10;
      const lean = (hash01(i * 17) - 0.5) * 0.35;
      ctx.beginPath();
      ctx.moveTo(fx2, fy);
      ctx.lineTo(fx2 + lean * 20, fy - 16 - hash01(i * 3) * 8);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(125, 144, 160, 0.5)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-M, horizon - 14);
    for (let x = -M; x <= w + M; x += 30) ctx.lineTo(x, horizon - 14 - Math.sin(x * 0.01) * 4);
    ctx.stroke();
  } else if (stage.id === 7) {
    // HOARFROST FOREST: ranks of glass pines, deep and close, glittering
    for (const [depth, alpha, hgt] of [[0.6, 0.5, 30], [1, 0.85, 44]] as [number, number, number][]) {
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 16; i++) {
        const tx = ((i * (w / 15) + hash01(i * 7) * 30 - travel * 0.25 * depth) % (w + 80) + (w + 80)) % (w + 80) - 40;
        const ty = horizon - 6 + (1 - depth) * 10;
        const th = hgt + hash01(i * 3) * 18;
        ctx.fillStyle = depth < 1 ? "#8aa8bc" : "#5a7a8c";
        for (const [wf, hf] of [[0.4, 1], [0.5, 0.66]] as [number, number][]) {
          ctx.beginPath();
          ctx.moveTo(tx, ty - th * hf);
          ctx.lineTo(tx - th * wf * 0.5, ty + 2);
          ctx.lineTo(tx + th * wf * 0.5, ty + 2);
          ctx.closePath();
          ctx.fill();
        }
        // rime glitter on the near rank
        if (depth === 1 && Math.sin(time * 3 + i * 2.7) > 0.86) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(tx + (hash01(i * 13) - 0.5) * th * 0.5, ty - th * (0.3 + hash01(i * 5) * 0.5), 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    // frost mist lying between the ranks
    const mist = ctx.createLinearGradient(0, horizon - 26, 0, horizon + 4);
    mist.addColorStop(0, "rgba(232, 240, 245, 0)");
    mist.addColorStop(1, "rgba(232, 240, 245, 0.5)");
    ctx.fillStyle = mist;
    ctx.fillRect(-M, horizon - 26, w + M * 2, 30);
  } else if (stage.id === 8) {
    // THE FROZEN LAKE: a black-ice shore beyond — thin as promises
    ctx.fillStyle = "rgba(30, 48, 66, 0.5)";
    ctx.fillRect(-M, horizon - 10, w + M * 2, 12);
    ctx.strokeStyle = "rgba(220, 237, 245, 0.55)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      // pressure ridges: jagged bright seams across the far ice
      let lx = ((hash01(i * 9) * w - travel * 0.2) % (w + 100) + (w + 100)) % (w + 100) - 50;
      let ly = horizon - 8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      for (let s = 0; s < 5; s++) {
        lx += 22 + hash01(i * 7 + s) * 26;
        ly += (hash01(i * 3 + s) - 0.5) * 5;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }
  } else if (stage.id === 9) {
    // GLIMMERDEEP: the mountain's cold blue heart — ceiling, stalactites, crystals
    const rock = ctx.createLinearGradient(0, 0, 0, horizon);
    rock.addColorStop(0, "#141c2e");
    rock.addColorStop(1, "#1c2438");
    ctx.fillStyle = rock;
    ctx.fillRect(-M, -M, w + M * 2, horizon * 0.5 + M);
    // hanging teeth of stone and ice
    for (let i = 0; i < 14; i++) {
      const sx = ((i * (w / 13) + hash01(i * 11) * 40 - travel * 0.15) % (w + 80) + (w + 80)) % (w + 80) - 40;
      const len = 26 + hash01(i * 3) * 60;
      const wid = 8 + hash01(i * 7) * 12;
      ctx.beginPath();
      ctx.moveTo(sx - wid / 2, horizon * 0.28);
      ctx.lineTo(sx, horizon * 0.28 + len);
      ctx.lineTo(sx + wid / 2, horizon * 0.28);
      ctx.closePath();
      ctx.fillStyle = i % 3 === 0 ? "#2c3a54" : "#22304a";
      ctx.fill();
      // an icicle tip catching what light there is
      if (i % 3 === 0) {
        ctx.fillStyle = "rgba(159, 214, 232, 0.6)";
        ctx.beginPath();
        ctx.moveTo(sx - 2, horizon * 0.28 + len - 10);
        ctx.lineTo(sx, horizon * 0.28 + len + 6);
        ctx.lineTo(sx + 2, horizon * 0.28 + len - 10);
        ctx.closePath();
        ctx.fill();
      }
    }
    // crystal clusters glowing along the far wall
    for (let i = 0; i < 6; i++) {
      const cx = ((hash01(i * 23) * w - travel * 0.22) % (w + 60) + (w + 60)) % (w + 60) - 30;
      const cy = horizon - 12 - hash01(i * 5) * 30;
      const glow = 0.45 + Math.abs(Math.sin(time * 1.3 + i * 2)) * 0.4;
      const hue = i % 2 === 0 ? "159, 214, 232" : "180, 138, 232";
      ctx.save();
      ctx.shadowColor = `rgba(${hue}, ${glow})`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(${hue}, ${glow * 0.9})`;
      for (let cSpike = 0; cSpike < 3; cSpike++) {
        const a = -Math.PI / 2 + (cSpike - 1) * 0.5 + (hash01(i * 7 + cSpike) - 0.5) * 0.3;
        const len = 12 + hash01(i * 3 + cSpike) * 14;
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.lineTo(cx + 4, cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // pale shafts where the mountain lets a little day through
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2; i++) {
      const sx = w * (0.3 + i * 0.42) + Math.sin(time * 0.3 + i) * 10;
      const g = ctx.createLinearGradient(sx, 0, sx + 40, horizon);
      g.addColorStop(0, "rgba(200, 230, 245, 0.10)");
      g.addColorStop(1, "rgba(200, 230, 245, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - 12, 0);
      ctx.lineTo(sx + 26, 0);
      ctx.lineTo(sx + 90, horizon);
      ctx.lineTo(sx + 20, horizon);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (stage.id === 10) {
    // AVALANCHE PASS: hard-angled peaks with wind-torn cornices
    ctx.fillStyle = "rgba(160, 176, 188, 0.9)";
    for (let i = 0; i < 4; i++) {
      const px = ((i * (w / 3.2) + hash01(i * 5) * 60 - travel * 0.12) % (w + 240) + (w + 240)) % (w + 240) - 120;
      const ph = 60 + hash01(i * 3) * 60;
      ctx.beginPath();
      ctx.moveTo(px - 90, horizon + 2);
      ctx.lineTo(px, horizon - ph);
      ctx.lineTo(px + 24, horizon - ph + 16);
      ctx.lineTo(px + 44, horizon - ph * 0.55);
      ctx.lineTo(px + 110, horizon + 2);
      ctx.closePath();
      ctx.fill();
      // snowcap + a cornice curling off the summit in the gale
      ctx.fillStyle = "#e8eef2";
      ctx.beginPath();
      ctx.moveTo(px - 18, horizon - ph + 22);
      ctx.lineTo(px, horizon - ph);
      ctx.lineTo(px + 20, horizon - ph + 18);
      ctx.quadraticCurveTo(px + 4, horizon - ph + 12, px - 18, horizon - ph + 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(240, 248, 252, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, horizon - ph);
      ctx.quadraticCurveTo(px + 26 + Math.sin(time * 3 + i) * 6, horizon - ph - 8, px + 48 + Math.sin(time * 2 + i) * 10, horizon - ph - 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 176, 188, 0.9)";
    }
    // a distant slide, always mid-fall somewhere in the range
    const slide = (time * 0.08) % 1;
    const sx = w * 0.6;
    ctx.fillStyle = `rgba(238, 244, 248, ${0.35 * (1 - slide)})`;
    ctx.beginPath();
    ctx.ellipse(sx, horizon - 60 + slide * 52, 16 + slide * 30, 7 + slide * 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (stage.id === 11) {
    // THE HOLLOW CROWN: a colonnade of broken ice-pillars around the old throne
    ctx.fillStyle = "#243450";
    for (let i = 0; i < 7; i++) {
      const px = w * (0.08 + i * 0.14) + (hash01(i * 9) - 0.5) * 24;
      const ph = 34 + hash01(i * 3) * 40 * (i === 3 ? 0 : 1);
      const broken = hash01(i * 13) > 0.5;
      ctx.beginPath();
      ctx.rect(px - 7, horizon - ph, 14, ph + 4);
      ctx.fill();
      if (broken) {
        ctx.beginPath();
        ctx.moveTo(px - 7, horizon - ph);
        ctx.lineTo(px, horizon - ph - 10 - hash01(i) * 8);
        ctx.lineTo(px + 7, horizon - ph);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(159, 214, 232, 0.25)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px - 4, horizon - ph + 6);
      ctx.lineTo(px - 4, horizon);
      ctx.stroke();
    }
    // the crown itself: a great cracked arch dead center, moonlit
    const ax = w * 0.5;
    ctx.strokeStyle = "#2c3a54";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(ax, horizon + 10, 74, Math.PI * 1.08, Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, horizon + 10, 74, Math.PI * 1.72, Math.PI * 1.97);
    ctx.stroke();
    ctx.strokeStyle = "rgba(159, 214, 232, 0.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax, horizon + 10, 66, Math.PI * 1.1, Math.PI * 1.58);
    ctx.stroke();
  }
}

/** Six coastal silhouettes, each built around the landmark named by its stage. */
function drawCoastSkyline(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, horizon: number, time: number, travel: number): void {
  if (stage.id < 12 || stage.id > 17) return;
  const M = OVERSCAN;
  const drift = travel * 0.2;
  ctx.save();
  ctx.lineCap = "round";

  // A common strip of distant water ties the act together without making its locations identical.
  const water = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 5);
  water.addColorStop(0, "rgba(118, 174, 174, 0.08)");
  water.addColorStop(1, "rgba(23, 72, 79, 0.42)");
  ctx.fillStyle = water;
  ctx.fillRect(-M, horizon - 20, w + M * 2, 24);

  if (stage.id === 12) {
    // SALTROAD CAUSEWAY: broken arches and tide-swallowed milestones.
    ctx.strokeStyle = "#566d67";
    ctx.lineWidth = 9;
    for (let i = -1; i < 7; i++) {
      const x = ((i * 150 - drift) % (w + 300) + (w + 300)) % (w + 300) - 150;
      ctx.beginPath();
      ctx.moveTo(x - 42, horizon + 3);
      ctx.lineTo(x - 38, horizon - 35);
      ctx.quadraticCurveTo(x, horizon - 67, x + 38, horizon - 35);
      ctx.lineTo(x + 42, horizon + 3);
      ctx.stroke();
      ctx.strokeStyle = "rgba(205, 215, 184, 0.32)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 30, horizon - 45); ctx.lineTo(x + 6, horizon - 58); ctx.stroke();
      ctx.strokeStyle = "#566d67"; ctx.lineWidth = 9;
    }
  } else if (stage.id === 13) {
    // WEEPING REEDS: a drowned willow surrounded by a forest of breathing reeds.
    ctx.strokeStyle = "#304f48";
    for (let i = 0; i < 34; i++) {
      const x = ((i * 37 - drift * 1.3) % (w + 80) + (w + 80)) % (w + 80) - 40;
      const sway = Math.sin(time * 1.2 + i) * 4;
      ctx.lineWidth = 2 + hash01(i * 9) * 2;
      ctx.beginPath(); ctx.moveTo(x, horizon + 3); ctx.quadraticCurveTo(x + sway, horizon - 25, x + sway * 1.4, horizon - 42 - hash01(i * 7) * 28); ctx.stroke();
    }
    const wx = w * 0.7;
    ctx.strokeStyle = "#243f3c"; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(wx, horizon + 4); ctx.quadraticCurveTo(wx - 8, horizon - 62, wx + 12, horizon - 102); ctx.stroke();
    ctx.lineWidth = 6;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(wx + 4, horizon - 76); ctx.quadraticCurveTo(wx + side * 55, horizon - 104, wx + side * 74, horizon - 42); ctx.stroke(); }
    ctx.strokeStyle = "rgba(82, 111, 88, 0.75)"; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(wx + i * 15, horizon - 88 + Math.abs(i) * 5); ctx.quadraticCurveTo(wx + i * 20, horizon - 42, wx + i * 17 + Math.sin(time + i) * 3, horizon - 10); ctx.stroke(); }
  } else if (stage.id === 14) {
    // LANTERNWRECK BAY: a wrecked three-master makes the storm feel enormous.
    const sx = w * 0.58 - (drift % 80);
    ctx.fillStyle = "#263f48";
    ctx.beginPath(); ctx.moveTo(sx - 145, horizon - 5); ctx.lineTo(sx + 112, horizon - 8); ctx.lineTo(sx + 78, horizon + 4); ctx.lineTo(sx - 112, horizon + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#263f48"; ctx.lineWidth = 8;
    for (const [ox, lean, tall] of [[-82, -12, 105], [0, 6, 132], [75, 15, 92]] as number[][]) {
      ctx.beginPath(); ctx.moveTo(sx + ox, horizon - 4); ctx.lineTo(sx + ox + lean, horizon - tall); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + ox + lean - 40, horizon - tall + 28); ctx.lineTo(sx + ox + lean + 44, horizon - tall + 20); ctx.stroke(); ctx.lineWidth = 8;
    }
    ctx.fillStyle = "rgba(177, 191, 172, 0.18)";
    ctx.beginPath(); ctx.moveTo(sx - 75, horizon - 95); ctx.lineTo(sx - 10, horizon - 106); ctx.lineTo(sx - 2, horizon - 42); ctx.closePath(); ctx.fill();
  } else if (stage.id === 15) {
    // DROWNED BELFRY: one leaning tower and a bell that rocks before lightning.
    const bx = w * 0.52;
    ctx.fillStyle = "#2b464c";
    ctx.save(); ctx.translate(bx, horizon + 5); ctx.rotate(-0.055);
    ctx.fillRect(-44, -132, 88, 136);
    ctx.fillStyle = "#1b343b";
    ctx.beginPath(); ctx.arc(0, -92, 24, Math.PI, Math.PI * 2); ctx.lineTo(24, -69); ctx.lineTo(-24, -69); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#b19055"; ctx.lineWidth = 5;
    const bellSwing = Math.sin(time * 0.8) * 0.1;
    ctx.save(); ctx.translate(0, -78); ctx.rotate(bellSwing); ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 4); ctx.stroke(); ctx.fillStyle = "#a68148"; ctx.beginPath(); ctx.moveTo(-13, 2); ctx.quadraticCurveTo(-11, -15, 0, -17); ctx.quadraticCurveTo(11, -15, 13, 2); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#2b464c"; ctx.beginPath(); ctx.moveTo(-54, -132); ctx.lineTo(0, -164); ctx.lineTo(52, -132); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(185, 214, 206, 0.26)"; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx - 135 + i * 87, horizon + 2); ctx.lineTo(bx - 120 + i * 82, horizon - 35 - i * 5); ctx.stroke(); }
  } else if (stage.id === 16) {
    // EYE ROAD: sheer headlands form a narrow corridor beneath the storm's iris.
    ctx.fillStyle = "#253f49";
    ctx.beginPath(); ctx.moveTo(-M, horizon + 4); ctx.lineTo(-M, horizon - 120); ctx.lineTo(w * 0.28, horizon - 72); ctx.lineTo(w * 0.38, horizon + 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w + M, horizon + 4); ctx.lineTo(w + M, horizon - 138); ctx.lineTo(w * 0.75, horizon - 78); ctx.lineTo(w * 0.64, horizon + 4); ctx.closePath(); ctx.fill();
    const ex = w * 0.52, ey = horizon * 0.34;
    ctx.strokeStyle = "rgba(174, 221, 222, 0.32)"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.ellipse(ex, ey, 72 + Math.sin(time * 0.6) * 4, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(213, 238, 224, 0.38)"; ctx.beginPath(); ctx.ellipse(ex, ey, 10, 18, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // SLEEPING COAST: the beach is the plated back of something beginning to wake.
    ctx.fillStyle = "#1e3d48";
    ctx.beginPath(); ctx.moveTo(-M, horizon + 4);
    for (let x = -M; x <= w + M; x += 36) ctx.lineTo(x, horizon - 15 - Math.abs(Math.sin(x * 0.011)) * 35);
    ctx.lineTo(w + M, horizon + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#315c62"; ctx.lineWidth = 10;
    for (let i = 0; i < 7; i++) { const x = w * (0.12 + i * 0.13); const rise = 34 + Math.sin(i * 1.8) * 14; ctx.beginPath(); ctx.moveTo(x - 23, horizon); ctx.quadraticCurveTo(x, horizon - rise, x + 24, horizon); ctx.stroke(); }
    const blink = (time % 5.5) < 4.8 ? 1 : 0.15;
    ctx.fillStyle = `rgba(151, 224, 211, ${0.42 * blink})`; ctx.beginPath(); ctx.ellipse(w * 0.78, horizon - 34, 22, 7 * blink, -0.12, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** The winter grounds answer too: black ice, crystal light, wind-scoured drifts. */
function drawWinterGround(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, h: number, horizon: number, time: number, travel: number, camX = 0): void {
  const M = OVERSCAN;
  // world-anchored scatter: each item holds its ground until it leaves the
  // camera's window, then its twin enters from the far side
  const wrapW = (v: number, span: number) => camX - M + ((((v - (camX - M)) % span) + span) % span);
  if (stage.id === 8 || stage.id === 11) {
    // black ice underfoot: a cold sheen and pale pressure-cracks wandering the lake
    const sheen = ctx.createLinearGradient(0, horizon, 0, h);
    sheen.addColorStop(0, "rgba(120, 170, 200, 0.10)");
    sheen.addColorStop(0.5, "rgba(40, 70, 100, 0.14)");
    sheen.addColorStop(1, "rgba(120, 170, 200, 0.08)");
    ctx.fillStyle = sheen;
    ctx.fillRect(camX - M, horizon, w + M * 2, h - horizon + M);
    ctx.strokeStyle = "rgba(220, 237, 245, 0.28)";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      let cx = wrapW(hash01(i * 31) * w - travel * 0.9, w + 120) - 60;
      let cy = horizon + 20 + hash01(i * 7) * (h - horizon - 50);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 0; s < 6; s++) {
        cx += 16 + hash01(i * 5 + s) * 30;
        cy += (hash01(i * 11 + s) - 0.5) * 26;
        ctx.lineTo(cx, cy);
        if (s === 3 && hash01(i * 3) > 0.5) {
          // a fork in the crack
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + 18, cy + (hash01(i) - 0.5) * 30);
          ctx.moveTo(cx, cy);
        }
      }
      ctx.stroke();
    }
  } else if (stage.id === 9) {
    // crystal light pooling on the cave floor
    for (let i = 0; i < 4; i++) {
      const cx = wrapW(hash01(i * 23) * w - travel * 0.9, w + 80) - 40;
      const cy = horizon + 30 + hash01(i * 7) * (h - horizon - 60);
      const glow = 0.14 + Math.abs(Math.sin(time * 1.3 + i * 2)) * 0.12;
      const hue = i % 2 === 0 ? "159, 214, 232" : "180, 138, 232";
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 46);
      g.addColorStop(0, `rgba(${hue}, ${glow})`);
      g.addColorStop(1, `rgba(${hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (stage.id === 10) {
    // wind-scoured sastrugi: long white streaks combed by the gale
    ctx.strokeStyle = "rgba(240, 248, 252, 0.30)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const gx = wrapW(hash01(i * 41) * w - travel * 0.9 - time * 26, w + 100) - 50;
      const gy = horizon + 16 + hash01(i * 13) * (h - horizon - 34);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + 26, gy - 2, gx + 54 + hash01(i) * 26, gy + 1);
      ctx.stroke();
    }
  }
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
  const night = stage.id === 4 || stage.id === 5 || stage.id === 9 || stage.id === 11 || lateRoadIsNight(stage.id);
  const camX = opts.camX ?? 0;
  const camY = opts.camY ?? 0;
  const dusk = opts.dusk ?? 0;
  const travel = opts.travel ?? 0;
  const descending = stage.travelDirection === "south";
  const horizontalTravel = descending ? 0 : travel;
  // the far layer rides WITH the camera (so it always fills the view) and lags
  // behind the world inside its patterns — march-scroll and camera pan share
  // one parallax clock
  const px = horizontalTravel + camX;
  ctx.save();
  ctx.translate(camX, camY * 0.72);
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

  // Glimmerdeep is UNDER the mountain — no sky, no sun, no clouds down here
  const cave = stage.id === 9;
  // sun / moon with soft halo
  const orbX = w * 0.78;
  const orbY = horizon * (0.38 + dusk * 0.42);
  if (!cave) {
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
    // the White Road's low sun stands between two sun-dogs
    if (stage.id === 6) {
      for (const side of [-1, 1]) {
        const dg = ctx.createRadialGradient(orbX + side * 120, orbY, 2, orbX + side * 120, orbY, 34);
        dg.addColorStop(0, "rgba(255, 250, 225, 0.5)");
        dg.addColorStop(1, "rgba(255, 250, 225, 0)");
        ctx.fillStyle = dg;
        ctx.fillRect(orbX + side * 120 - 34, orbY - 34, 68, 68);
      }
      ctx.strokeStyle = "rgba(255, 250, 225, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(orbX, orbY, 120, 0, Math.PI * 2);
      ctx.stroke();
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
  }

  // birds crossing the day sky
  if (stage.id <= 1) {
    ctx.strokeStyle = "rgba(60, 58, 48, 0.7)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    for (let i = 0; i < 2; i++) {
      const bx = ((time * (16 + i * 7) + i * 420) % (w + 160)) - 80;
      const by = 34 + i * 26 + Math.sin(time * 1.8 + i * 3) * 8;
      const flap = Math.sin(time * 9 + i * 2) * 3;
      const s = 5 - i;
      ctx.beginPath();
      ctx.moveTo(bx - s, by + flap * 0.4);
      ctx.quadraticCurveTo(bx - s * 0.4, by - 2 - flap, bx, by);
      ctx.quadraticCurveTo(bx + s * 0.4, by - 2 - flap, bx + s, by + flap * 0.4);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  // far hill layer (lighter) then near hills — the cave has walls instead
  if (!cave) {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(-M, horizon + 2);
  for (let x = -M; x <= w + M; x += 10) {
    ctx.lineTo(x, horizon - 48 - Math.sin((x + px * 0.18) * 0.005 + 4.2) * 26 - Math.sin((x + px * 0.18) * 0.013 + 1) * 12);
  }
  ctx.lineTo(w + M, horizon + 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.hills;
  ctx.beginPath();
  ctx.moveTo(-M, horizon + 2);
  for (let x = -M; x <= w + M; x += 8) {
    ctx.lineTo(x, horizon - 22 - Math.sin((x + px * 0.32) * 0.008 + 1.7) * 18 - Math.sin((x + px * 0.32) * 0.021) * 9);
  }
  ctx.lineTo(w + M, horizon + 2);
  ctx.closePath();
  ctx.fill();
  }

  // Each act puts a readable destination above the shared terrain language.
  drawSouthRoadSkyline(ctx, stage, w, horizon, time, px);
  drawWinterSkyline(ctx, stage, w, horizon, time, px);
  // Stormbreak is landmark-led: every battlefield has a recognizable horizon.
  drawCoastSkyline(ctx, stage, w, horizon, time, px);
  drawLateRoadSkyline(ctx, stage, w, horizon, time, px);

  // tree / rock silhouettes on the ridge — they stream past at the near-hill rate
  for (let i = 0; i < (cave ? 0 : stage.id >= 12 ? 3 : 9); i++) {
    const span9 = w + 60;
    const tx = ((hash01(i * 13 + stage.id * 7) * w - px * 0.32) % span9 + span9) % span9 - 30;
    const ridgeY = horizon - 22 - Math.sin((tx + px * 0.32) * 0.008 + 1.7) * 18 - Math.sin((tx + px * 0.32) * 0.021) * 9;
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

  // ground: cached static layer, tiled across wherever the camera looks
  const gl = groundLayer(stage, w, h, horizon);
  const gspan = w + M * 2;
  const goff = ((horizontalTravel * 0.9) % gspan + gspan) % gspan;
  const k0 = Math.floor((camX - M + goff) / gspan);
  for (let k = k0; k * gspan - goff - M < camX + w + M; k++) {
    ctx.drawImage(gl, k * gspan - goff - M, horizon - 12, gspan, h - (horizon - 12) + M);
  }
  if (dusk > 0) {
    ctx.fillStyle = `rgba(30, 18, 50, ${dusk * 0.14})`;
    ctx.fillRect(camX - M, horizon, w + M * 2, h - horizon + M);
  }
  // winter grounds get their own dressing over the cached terrain
  if (stage.id >= 6 && stage.id < 12) drawWinterGround(ctx, stage, w, h, horizon, time, horizontalTravel, camX);

  if (descending) {
    // A descending route is read from the ground itself: the trail narrows
    // toward the ridge while cross-steps and ledges stream upward underfoot.
    const span = Math.max(80, h - horizon + 64);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 238, 198, 0.16)";
    ctx.lineWidth = 2;
    ctx.setLineDash([13, 10]);
    ctx.beginPath();
    ctx.moveTo(w * 0.43, horizon - 4);
    ctx.quadraticCurveTo(w * 0.34, horizon + (h - horizon) * 0.52, w * 0.28, h + 26);
    ctx.moveTo(w * 0.57, horizon - 4);
    ctx.quadraticCurveTo(w * 0.66, horizon + (h - horizon) * 0.52, w * 0.72, h + 26);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const y = horizon + ((((i * 62 - travel * 0.92) % span) + span) % span) - 18;
      const depth = Math.max(0, Math.min(1, (y - horizon) / Math.max(1, h - horizon)));
      const half = 42 + depth * w * 0.18;
      ctx.globalAlpha = 0.12 + depth * 0.12;
      ctx.beginPath();
      ctx.moveTo(w / 2 - half, y);
      ctx.quadraticCurveTo(w / 2, y + 6, w / 2 + half, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // texture: swaying tufts + stones — world-anchored, windowed to the camera
  const wrapG = (v: number, span: number) => camX - M + ((((v - (camX - M)) % span) + span) % span);
  for (let i = 0; i < 22; i++) {
    const gx = wrapG(hash01(i * 127 + stage.id * 3) * w - horizontalTravel * 0.9, w + M * 2);
    const groundSpan = Math.max(40, h - horizon - 26);
    const gy = descending
      ? horizon + 10 + ((((hash01(i * 311 + stage.id) * groundSpan - travel * 0.9) % groundSpan) + groundSpan) % groundSpan)
      : horizon + 10 + hash01(i * 311 + stage.id) * groundSpan;
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
    const gx = wrapG(hash01(i * 71 + stage.id * 19) * w, w + M * 2);
    const stoneSpan = Math.max(36, h - horizon - 40);
    const gy = descending
      ? horizon + 20 + ((((hash01(i * 37 + 9) * stoneSpan - travel * 0.9) % stoneSpan) + stoneSpan) % stoneSpan)
      : horizon + 20 + hash01(i * 37 + 9) * stoneSpan;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 6 + hash01(i * 2) * 5, 4 + hash01(i * 5) * 3, 0, 0, Math.PI);
    outlined(ctx, "rgba(255,255,255,0.18)", 1.6);
  }

  // screen-space skyworks (storms, weather, motes) ride with the camera
  ctx.save();
  ctx.translate(camX, 0);
  // lightning over Gloaming Pass: periodic flashes — the storm answers the Alpha's howl
  if (stage.id === 4) {
    const alphaUnit = opts.units?.find((u) => u.enemyKind === "alpha" && u.alive);
    const period = alphaUnit && alphaUnit.phase >= 3 ? 2.6 : alphaUnit && alphaUnit.phase >= 2 ? 4 : 6.5;
    const cycle = time % period;
    if (cycle > period - 0.6 && cycle < period - 0.25) {
      const k = 1 - Math.abs((cycle - (period - 0.45)) / 0.18);
      ctx.fillStyle = `rgba(230, 230, 255, ${Math.max(0, k) * 0.32})`;
      ctx.fillRect(0, 0, w, h);
      if (cycle > period - 0.5 && cycle < period - 0.38) {
        const bx = w * (0.25 + hash01(Math.floor(time / period)) * 0.5);
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
    // drops striking the wet ground ring outward and fade
    ctx.strokeStyle = "rgba(205, 230, 235, 0.55)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const rate = 0.9 + hash01(i * 3) * 0.6;
      const n = Math.floor(time * rate + hash01(i * 11) * 5);
      const cyc = (time * rate + hash01(i * 11) * 5) % 1;
      const sx = hash01(i * 29 + n * 1.7) * w;
      const sy = horizon + 30 + hash01(i * 7 + n * 2.3) * (h - horizon - 44);
      ctx.globalAlpha = (1 - cyc) * 0.45;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 3 + cyc * 9, (3 + cyc * 9) * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (stage.id >= 6 && stage.id < 12) {
    // the Winterreach: snow, always snow (a flaying gale at the Pass)
    const gale = stage.id === 10;
    ctx.fillStyle = "rgba(240, 248, 252, 0.75)";
    for (let i = 0; i < (gale ? 44 : 26); i++) {
      const drift = gale ? time * 340 : time * 30 + Math.sin(time * 0.7 + i) * 24;
      const sx = ((hash01(i * 11) * w - drift) % (w + 30) + (w + 30)) % (w + 30) - 15;
      const sy = (hash01(i * 5) * h + time * (gale ? 120 : 42) * (0.6 + hash01(i * 3))) % h;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 + hash01(i) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (stage.id === 11) {
      // the aurora over the Hollow Crown
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let band = 0; band < 3; band++) {
        const grad = ctx.createLinearGradient(0, 0, 0, horizon * 0.75);
        const hue = ["rgba(120, 232, 180,", "rgba(140, 180, 240,", "rgba(200, 140, 230,"][band];
        grad.addColorStop(0, hue + " 0.16)");
        grad.addColorStop(1, hue + " 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-OVERSCAN, 0);
        for (let x = -OVERSCAN; x <= w + OVERSCAN; x += 24) {
          ctx.lineTo(x, horizon * (0.28 + band * 0.1) + Math.sin(x * 0.008 + time * (0.5 + band * 0.2) + band * 2) * 26);
        }
        ctx.lineTo(w + OVERSCAN, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
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
  drawLateRoadAtmosphere(ctx, stage, w, h, horizon, time);
  ctx.restore();

  // stage set-dressing: each region gets its own furniture (drawn behind units),
  // tiled in world space so it streams past marches AND camera pans alike
  {
    const span = w + OVERSCAN * 2;
    const dist = travel * 0.9;
    const soff = ((dist % span) + span) % span;
    const seg = Math.floor(dist / span);
    const kd0 = Math.floor((camX - OVERSCAN + soff) / span);
    ctx.save();
    ctx.translate(kd0 * span - soff, 0);
    for (let k = kd0; k * span - soff < camX + w + OVERSCAN; k++) {
      drawSetDressing(ctx, stage, w, h, horizon, time, seg + k);
      drawLateRoadSetDressing(ctx, stage, w, h, horizon, time, seg + k);
      ctx.translate(span, 0);
    }
    ctx.restore();
  }

  // ambient motes / mist / leaves / rays / stars are all camera-space atmosphere
  ctx.save();
  ctx.translate(camX, 0);
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
  for (let i = 0; i < (stage.id >= 18 ? 0 : 12); i++) {
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

  // true tumbling leaves over the fields and through the pines
  if (stage.id <= 1) {
    const leaves = stage.id === 1 ? 13 : 8;
    for (let i = 0; i < leaves; i++) {
      const sd = i * 17.3 + stage.id * 5;
      const fall = 16 + hash01(sd) * 14;
      const lx = ((hash01(sd * 1.7) * (w + 60) + Math.sin(time * (0.7 + hash01(sd) * 0.5) + i) * 34 + time * 6) % (w + 60)) - 30;
      const ly = ((hash01(sd * 2.3) * (h + 40) + time * fall) % (h + 40)) - 20;
      const rot = time * (1.1 + hash01(sd) * 1.6) + i;
      const s = 2.6 + hash01(sd * 3.1) * 2.2;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      ctx.scale(1, 0.55 + Math.sin(rot * 1.7) * 0.3); // foreshortens as it tumbles
      ctx.fillStyle = i % 3 === 0 ? "rgba(214, 178, 84, 0.7)" : "rgba(122, 160, 88, 0.65)";
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // god rays: morning light slanting down through the air toward the sun's side
  if ((stage.id === 0 || stage.id === 1) && dusk < 0.85) {
    const rayA = (stage.id === 1 ? 0.1 : 0.05) * (1 - dusk);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      const baseX = w * (0.52 + i * 0.16) + Math.sin(time * 0.14 + i * 2.1) * 18;
      const topW = 26 + i * 10;
      const grad = ctx.createLinearGradient(0, -OVERSCAN, 0, h * 0.94);
      grad.addColorStop(0, `rgba(255, 244, 200, ${rayA * (0.8 + 0.2 * Math.sin(time * 0.5 + i * 1.4))})`);
      grad.addColorStop(1, "rgba(255, 244, 200, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(baseX, -OVERSCAN);
      ctx.lineTo(baseX + topW, -OVERSCAN);
      ctx.lineTo(baseX - h * 0.34 + topW * 2.6, h * 0.94);
      ctx.lineTo(baseX - h * 0.34, h * 0.94);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // a falling star over the road's end
  if (stage.id === 5) {
    const cyc = time % 9;
    if (cyc < 0.7) {
      const k = cyc / 0.7;
      const n = Math.floor(time / 9);
      const sx = w * (0.2 + hash01(n * 3.7) * 0.6) + k * 130;
      const sy = 20 + hash01(n * 7.1) * horizon * 0.3 + k * 46;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx - 26, sy - 9);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  }
  ctx.restore();
}

function drawSetDressing(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
  seed = 0,
): void {
  const groundAt = (t: number, band: number) => horizon + 14 + hash01(t) * (h - horizon - 30) * band;
  // ground variation shared by every field: scattered pebbles
  for (let i = 0; i < 9; i++) {
    const px = hash01(seed * 137.3 + i * 17 + stage.id * 91) * w;
    const py = horizon + 20 + hash01(seed * 137.3 + i * 29 + stage.id * 7) * (h - horizon - 40);
    if (i % 3 !== 0) {
      ctx.fillStyle = "rgba(20, 14, 30, 0.18)";
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + hash01(seed * 137.3 + i * 5) * 1.8, 0, Math.PI * 2);
      ctx.arc(px + 5, py + 2, 1.2 + hash01(seed * 137.3 + i * 7) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (stage.id === 0) {
    // meadow flowers nodding in the breeze, loosely clustered
    for (let i = 0; i < 12; i++) {
      const cluster = Math.floor(i / 3);
      const fx2 = hash01(seed * 137.3 + cluster * 41) * w + (hash01(seed * 137.3 + i * 7) - 0.5) * 46;
      const fy2 = horizon + 30 + hash01(seed * 137.3 + cluster * 23) * (h - horizon - 50) + (hash01(seed * 137.3 + i * 11) - 0.5) * 20;
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
      const mx2 = w * (0.15 + i * 0.35) + hash01(seed * 137.3 + i * 19) * 30;
      const my2 = groundAt(i * 6.7, 0.9);
      const pulse = 0.5 + Math.abs(Math.sin(time * 1.8 + i * 2.4)) * 0.5;
      for (let m = 0; m < 3; m++) {
        const ox = (m - 1) * 7 + hash01(seed * 137.3 + m * 3 + i) * 3;
        const mh = 6 + hash01(seed * 137.3 + m + i * 5) * 5;
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
      const ex = w * (0.1 + i * 0.4) + hash01(seed * 137.3 + i * 7) * 40;
      const ey = horizon + 12 + hash01(seed * 137.3 + i * 11) * 14;
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
      const px = w * (0.2 + i * 0.3) + hash01(seed * 137.3 + i * 9) * 40;
      const py = groundAt(i * 3.3, 0.8);
      ctx.fillStyle = "rgba(90, 140, 150, 0.5)";
      ctx.beginPath();
      ctx.ellipse(px, py, 40 + hash01(seed * 137.3 + i) * 24, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200, 230, 225, 0.35)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(px, py, 30 + hash01(seed * 137.3 + i) * 20, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#3a5c46";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      for (let rd = 0; rd < 4; rd++) {
        const rx = px - 30 + rd * 18 + hash01(seed * 137.3 + rd * 3 + i) * 8;
        const sway = Math.sin(time * 1.4 + rd + i) * 2;
        ctx.beginPath();
        ctx.moveTo(rx, py + 2);
        ctx.quadraticCurveTo(rx + sway, py - 12, rx + sway * 1.6, py - 20 - hash01(seed * 137.3 + rd) * 8);
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
      ctx.rotate((hash01(seed * 137.3 + i * 13) - 0.5) * 0.24);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-7, -34 - hash01(seed * 137.3 + i) * 14);
      ctx.lineTo(6, -38 - hash01(seed * 137.3 + i) * 14);
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
  } else if (stage.id >= 6 && stage.id < 12) {
    // the Winterreach's furniture: snow-caked pines, drifts, ice and old stone
    for (let i = 0; i < 4; i++) {
      const px = hash01(seed * 137.3 + i * 23 + stage.id * 13) * w;
      const py = groundAt(seed * 137.3 + i * 3.7, 0.85);
      const kind9 = stage.id === 9;
      const kind11 = stage.id === 11;
      if (kind9) {
        // glowing crystal clusters light the deep
        const glow = 0.5 + Math.abs(Math.sin(time * 1.4 + i * 2)) * 0.5;
        ctx.shadowColor = "#6ab8f0";
        ctx.shadowBlur = 12 * glow;
        ctx.fillStyle = "#8fd0f8";
        for (const [ox, sc] of [[-6, 1], [4, 0.7], [-1, 1.25]] as number[][]) {
          ctx.beginPath();
          ctx.moveTo(px + ox - 4 * sc, py);
          ctx.lineTo(px + ox, py - 22 * sc);
          ctx.lineTo(px + ox + 4 * sc, py);
          ctx.closePath();
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      } else if (kind11) {
        // ancient ice monoliths ringing the king's seat
        ctx.fillStyle = "#3d5570";
        ctx.beginPath();
        ctx.moveTo(px - 7, py);
        ctx.lineTo(px - 4, py - 34 - hash01(i * 7) * 14);
        ctx.lineTo(px + 5, py - 38 - hash01(i * 7) * 14);
        ctx.lineTo(px + 8, py);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#8fb8cc";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.strokeStyle = "rgba(200, 236, 248, 0.5)";
        ctx.beginPath();
        ctx.moveTo(px - 2, py - 8);
        ctx.lineTo(px + 1, py - 26);
        ctx.stroke();
      } else {
        // snow-caked pine
        const sc2 = 10 + hash01(seed + i * 31) * 10;
        ctx.fillStyle = stage.palette.prop;
        ctx.beginPath();
        ctx.moveTo(px, py - sc2 * 2.4);
        ctx.lineTo(px - sc2, py);
        ctx.lineTo(px + sc2, py);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(240, 248, 252, 0.85)";
        ctx.beginPath();
        ctx.moveTo(px, py - sc2 * 2.4);
        ctx.lineTo(px - sc2 * 0.55, py - sc2 * 1.1);
        ctx.lineTo(px + sc2 * 0.55, py - sc2 * 1.1);
        ctx.closePath();
        ctx.fill();
      }
    }
    // drifts and, on the lake, long cracks in the black ice
    for (let i = 0; i < 3; i++) {
      const dx2 = hash01(seed * 137.3 + i * 47 + stage.id) * w;
      const dy2 = groundAt(seed * 137.3 + i * 5.9, 0.55);
      if (stage.id === 8) {
        ctx.strokeStyle = "rgba(60, 100, 130, 0.4)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(dx2 - 30, dy2);
        ctx.lineTo(dx2 + 4, dy2 + 6);
        ctx.lineTo(dx2 + 34, dy2 + 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(244, 250, 253, 0.7)";
        ctx.beginPath();
        ctx.ellipse(dx2, dy2, 26 + hash01(i * 3) * 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

export function drawTelegraphs(ctx: CanvasRenderingContext2D, battle: Battle, colorIndependent = false): void {
  for (const mark of battle.telegraphs) {
    if (colorIndependent && mark.owner.team === "enemy") {
      // A steady double boundary keeps danger readable without relying on hue,
      // flicker, or animation. The inner telegraph still communicates its kind.
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.setLineDash([]);
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(15, 11, 22, 0.9)";
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius + 3, mark.radius * 0.55 + 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255, 246, 218, 0.96)";
      ctx.stroke();
      ctx.restore();
    }
    if (drawLateTelegraph(ctx, mark, battle.time)) continue;
    const t = mark.time / mark.duration;
    if (mark.kind === "lightning") {
      const pulse = 0.45 + Math.sin(battle.time * 18) * 0.18;
      ctx.globalAlpha = pulse + t * 0.3;
      ctx.strokeStyle = "#a9f2ff";
      ctx.lineWidth = 2.5 + t * 3;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = battle.time * 38;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius, mark.radius * 0.52, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(117, 220, 235, 0.13)";
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius * (1 - t * 0.35), mark.radius * 0.52 * (1 - t * 0.35), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(205, 250, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mark.x, mark.y - 18);
      ctx.lineTo(mark.x - 7, mark.y - 4);
      ctx.lineTo(mark.x + 4, mark.y - 7);
      ctx.lineTo(mark.x, mark.y + 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    if (mark.kind === "cannon") {
      // Enemy artillery: a blunt amber danger ring and iron shot reticle. Unlike
      // the friendly meteor, nothing travels across the sky into this marker.
      const urgency = 0.42 + t * 0.5;
      const squeeze = 1 - t * 0.42;
      ctx.globalAlpha = urgency;
      ctx.fillStyle = "rgba(183, 92, 37, 0.16)";
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius, mark.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e49a4f";
      ctx.lineWidth = 4 + t * 2;
      ctx.setLineDash([14, 5, 3, 5]);
      ctx.lineDashOffset = battle.time * 18;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius, mark.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#ffc36a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius * squeeze, mark.radius * 0.55 * squeeze, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Cannonball + fuse makes the source readable even when many marks overlap.
      ctx.fillStyle = "#2b2930";
      ctx.strokeStyle = "#f0b25f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y + 1, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mark.x + 5, mark.y - 5);
      ctx.quadraticCurveTo(mark.x + 11, mark.y - 13, mark.x + 15, mark.y - 8);
      ctx.stroke();
      ctx.fillStyle = "#ffd76b";
      ctx.beginPath();
      ctx.arc(mark.x + 15, mark.y - 8, 2.4 + Math.sin(battle.time * 20) * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    if (mark.kind === "meteor") {
      // a friendly omen: the impact ring plus the star streaking in
      const a = 0.4 + t * 0.5;
      ctx.globalAlpha = a;
      ctx.strokeStyle = "#ff9b42";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -battle.time * 30;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, mark.radius * (1 - t * 0.25), mark.radius * 0.55 * (1 - t * 0.25), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // the star falls along a diagonal
      const sx = mark.x + (1 - t) * 260;
      const sy = mark.y - (1 - t) * 340;
      ctx.fillStyle = "#ffb46b";
      ctx.shadowColor = "#ff9b42";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sx, sy, 6 + t * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255, 180, 107, 0.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + 16, sy - 22);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
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
    if (mark.kind === "sweep") {
      // crossed blades: get out of the arc
      ctx.globalAlpha = urgency;
      ctx.strokeStyle = "#ff8a70";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mark.x - s * 11, mark.y - 11);
        ctx.lineTo(mark.x + s * 11, mark.y + 11);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      ctx.globalAlpha = 1;
    } else {
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
}

export function drawZones(ctx: CanvasRenderingContext2D, battle: Battle): void {
  if ((battle.stage.terrain === "tide" || battle.stage.terrain === "tide-storm") && battle.tideLevel > 0.08) {
    const waterline = battle.field.top + (battle.field.bottom - battle.field.top) * (0.82 - battle.tideLevel * 0.24);
    ctx.globalAlpha = 0.16 + battle.tideLevel * 0.18;
    const tide = ctx.createLinearGradient(0, waterline, 0, battle.field.bottom);
    tide.addColorStop(0, "rgba(125, 220, 215, 0.12)");
    tide.addColorStop(1, "rgba(35, 112, 135, 0.72)");
    ctx.fillStyle = tide;
    ctx.fillRect(battle.field.left, waterline, battle.field.right - battle.field.left, battle.field.bottom - waterline + 30);
    ctx.strokeStyle = "rgba(205, 246, 232, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = battle.field.left; x <= battle.field.right; x += 18) {
      const y = waterline + Math.sin(x * 0.035 + battle.time * 2.2) * 3;
      if (x === battle.field.left) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
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
    if (zone.kind === "smoke") {
      // roiling grey cover
      ctx.globalAlpha = 0.4 * fade;
      const sg = ctx.createRadialGradient(zone.x, zone.y, 6, zone.x, zone.y, zone.radius);
      sg.addColorStop(0, "rgba(160, 168, 185, 0.85)");
      sg.addColorStop(1, "rgba(140, 148, 165, 0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = "rgba(185, 192, 205, 0.5)";
      for (let i = 0; i < 4; i++) {
        const a = battle.time * 0.7 + (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(zone.x + Math.cos(a) * zone.radius * 0.4, zone.y + Math.sin(a) * zone.radius * 0.22 - 8, 22, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      continue;
    }
    if (zone.kind === "gravity") {
      // spiraling violet pull
      ctx.globalAlpha = 0.5 * fade;
      const gg = ctx.createRadialGradient(zone.x, zone.y, 3, zone.x, zone.y, zone.radius);
      gg.addColorStop(0, "rgba(80, 60, 180, 0.7)");
      gg.addColorStop(1, "rgba(122, 106, 232, 0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.ellipse(zone.x, zone.y, zone.radius, zone.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#9a8af2";
      ctx.lineWidth = 1.8;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let s = 0; s < 10; s++) {
          const rr = zone.radius * (1 - s / 10) * 0.9;
          const a = battle.time * 2.4 + (arm / 3) * Math.PI * 2 + s * 0.45;
          const px2 = zone.x + Math.cos(a) * rr;
          const py2 = zone.y + Math.sin(a) * rr * 0.55;
          if (s === 0) ctx.moveTo(px2, py2);
          else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
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
  drawBossObjectives(ctx, battle);
}

function drawBossObjectives(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const labels = {
    furnaceHeart: "BREAK HEART",
    rootAnchor: "SEVER",
    trueShadow: "READ SHADOW",
    saintVessel: "SHATTER",
    lightningRod: "BAIT LIGHTNING",
    heartTrail: "FOLLOW",
    waystone: "ANCHOR",
  } as const;
  const colors = {
    furnaceHeart: "#ff9b42",
    rootAnchor: "#b9dc78",
    trueShadow: "#c4a9ee",
    saintVessel: "#ffe49a",
    lightningRod: "#bdefff",
    heartTrail: "#f06d68",
    waystone: "#b9ace4",
  } as const;

  for (const objective of battle.bossObjectives) {
    if (!objective.active) continue;
    const color = colors[objective.kind];
    const progress = Math.max(0, Math.min(1, objective.progress / Math.max(0.01, objective.required)));
    const pulse = 0.78 + Math.sin(battle.time * 4.5 + objective.id) * 0.12;
    ctx.save();
    ctx.translate(objective.x, objective.y);
    ctx.globalAlpha = objective.resolved ? 0.42 : 0.95;

    // Interaction footprint: a solid inner line plus a moving outer dash makes
    // it read as a destination rather than another incoming attack.
    ctx.fillStyle = objective.resolved ? "rgba(255,246,218,.08)" : `${color}22`;
    ctx.beginPath();
    ctx.ellipse(0, 0, objective.radius, objective.radius * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -battle.time * 15;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(20,15,28,.82)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, -17, 16, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = objective.resolved ? "#f7efd7" : color;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(0, -17, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (objective.resolved ? 1 : progress));
    ctx.stroke();

    if (objective.kind === "furnaceHeart") {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -35);
      ctx.bezierCurveTo(20, -48, 24, -18, 0, -6);
      ctx.bezierCurveTo(-24, -18, -20, -48, 0, -35);
      ctx.fill();
    } else if (objective.kind === "rootAnchor") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -32);
        ctx.quadraticCurveTo(side * 21, -25, side * 24, 0);
        ctx.stroke();
      }
      ctx.fillStyle = "#664b35";
      ctx.fillRect(-7, -38, 14, 31);
    } else if (objective.kind === "trueShadow") {
      // The real reflection is recognizable, but not labeled: its inner moon
      // turns against the outer orbit while false copies move together.
      const reverse = objective.correct ? -1 : 1;
      ctx.rotate(reverse * battle.time * 0.75);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -20, 14 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#261d35";
      ctx.beginPath();
      ctx.arc(objective.correct ? -6 : 6, -22, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (objective.kind === "saintVessel") {
      ctx.fillStyle = "#7a7059";
      ctx.fillRect(-9, -35, 18, 28);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, -40, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -40, 19, 0, Math.PI * 2);
      ctx.stroke();
    } else if (objective.kind === "lightningRod") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -48);
      ctx.lineTo(-8, -36);
      ctx.moveTo(0, -48);
      ctx.lineTo(8, -36);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-12, -5, 24, 6);
    } else if (objective.kind === "heartTrail") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -29);
      ctx.bezierCurveTo(15, -40, 21, -18, 0, -5);
      ctx.bezierCurveTo(-21, -18, -15, -40, 0, -29);
      ctx.fill();
    } else {
      ctx.fillStyle = "#393049";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -51);
      ctx.lineTo(14, -15);
      ctx.lineTo(8, 0);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-14, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (objective.resolved) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, -24, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "800 10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(19,14,25,.88)";
    ctx.fillText(objective.resolved ? "SECURED" : labels[objective.kind], objective.x + 1, objective.y - objective.radius - 9 + 1);
    ctx.fillStyle = objective.resolved ? "#f7efd7" : color;
    ctx.fillText(objective.resolved ? "SECURED" : labels[objective.kind], objective.x, objective.y - objective.radius - 9);
    if (objective.expires !== undefined && !objective.resolved) {
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.fillText(`${Math.max(0, objective.expires).toFixed(1)}s`, objective.x, objective.y + objective.radius * 0.75);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ shared unit bits

const hpGhosts = new WeakMap<Unit, number>();

let colorSafeBars = false;
let enemyHealthBarsVisible = true;

/** Colorblind-friendly mode: hero health reads blue instead of green. */
export function setColorSafe(on: boolean): void {
  colorSafeBars = on;
}

function drawHealthBar(ctx: CanvasRenderingContext2D, unit: Unit, top: number): void {
  if (unit.team === "enemy" && !enemyHealthBarsVisible) return;
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
    ctx.fillStyle = unit.team === "hero" ? (frac > 0.35 ? (colorSafeBars ? "#5aa7ff" : "#6fce65") : "#e0b23e") : "#d1543f";
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
  if (unit.team === "enemy" && unit.enemyKind) {
    const def = ENEMIES[unit.enemyKind];
    const role = def.role ?? "vanguard";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = def.priority ? "#ffe9a3" : "#9b90aa";
    ctx.fillText(ROLE_GLYPHS[role], x - 6, y + 2);
    ctx.beginPath();
    ctx.arc(x + w + 5, y + 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ELEMENT_MARK_COLORS[unit.element ?? def.affinity ?? "earth"];
    ctx.fill();
  }
  const buildupElement = unit.lastBuildElement;
  if (buildupElement) {
    const threshold = unit.enemyKind && Object.prototype.hasOwnProperty.call(BOSS_PHASES, unit.enemyKind) ? 165 : 100;
    const buildup = Math.max(0, Math.min(1, (unit.elementBuildup[buildupElement] ?? 0) / threshold));
    if (buildup > 0.01) {
      roundRect(ctx, x, y + 6.5, w, 2.2, 1.1);
      ctx.fillStyle = "rgba(18,12,24,0.62)";
      ctx.fill();
      roundRect(ctx, x, y + 6.5, Math.max(1.5, w * buildup), 2.2, 1.1);
      ctx.fillStyle = ELEMENT_MARK_COLORS[buildupElement];
      ctx.fill();
    }
  }
}

function drawEffectPips(ctx: CanvasRenderingContext2D, unit: Unit, x: number, y: number): void {
  const marks: { color: string; label: string }[] = [];
  for (const effect of unit.effects) {
    if (effect.kind === "stun") marks.push({ color: "#f2d16b", label: "✦" });
    if (effect.kind === "slow" && !unit.effects.some((other) => other.kind === "frozen")) marks.push({ color: "#9fd6f2", label: "❄" });
    if (effect.kind === "haste") marks.push({ color: "#8ed081", label: "»" });
    if (effect.kind === "guard") marks.push({ color: "#e0904b", label: "▲" });
    if (effect.kind === "burn") marks.push({ color: "#ff9b42", label: "♨" });
    if (effect.kind === "frozen") marks.push({ color: "#a9ddf5", label: "❄" });
    if (effect.kind === "conductive") marks.push({ color: "#8fc7e8", label: "ϟ" });
    if (effect.kind === "brittle") marks.push({ color: "#c9a06b", label: "◇" });
    if (effect.kind === "poisoned") marks.push({ color: "#9ad06a", label: "⌁" });
    if (effect.kind === "exposed") marks.push({ color: "#ffe9a3", label: "☼" });
    if (effect.kind === "bleeding") marks.push({ color: "#d95763", label: "♦" });
    if (effect.kind === "shrouded") marks.push({ color: "#a89bd8", label: "◐" });
    if (effect.kind === "cursed") marks.push({ color: "#b7a5d6", label: "☠" });
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
    unit.marching === true ||
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
  // Discipline, rather than element color, owns the hero's casting body language.
  if (unit.team === "hero" && unit.discipline && unit.castGlow > 0) {
    const cast = Math.min(1, unit.castGlow);
    if (unit.discipline === "knight") swing = Math.min(swing, -0.18 * cast);
    else if (unit.discipline === "warrior") swing = Math.max(swing, 0.42 + cast * 0.36);
    else if (unit.discipline === "rogue") bounce += Math.sin(cast * Math.PI) * 3.5;
    else if (unit.discipline === "archer") swing = Math.max(swing, 0.34 + cast * 0.3);
    else if (unit.discipline === "priest") bounce += cast * 1.7;
    else if (unit.discipline === "mage") bounce += cast * 3.2;
    else if (unit.discipline === "necromancer") bounce += cast * 1.1;
  }
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

/** A restrained cast gesture per Discipline. These sit behind the paper doll
 * so a crowded fight reads as seven different motions, not seven tints. */
function drawDisciplineCastSilhouette(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  cx: number,
  gy: number,
  H: number,
  time: number,
  reducedMotion: boolean,
): void {
  if (!unit.discipline || !unit.element || unit.castGlow <= 0.04) return;
  const color = ELEMENT_MARK_COLORS[unit.element];
  const pulse = Math.min(1, unit.castGlow * 1.45);
  const t = reducedMotion ? 0 : time;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.2 + pulse * 0.48;

  if (unit.discipline === "knight") {
    for (let plate = -1; plate <= 1; plate++) {
      const x = cx + unit.facing * H * 0.42 + plate * H * 0.14;
      ctx.lineWidth = 3 + pulse * 2;
      ctx.beginPath();
      ctx.moveTo(x - H * 0.08, gy - H * (0.2 + Math.abs(plate) * 0.03));
      ctx.lineTo(x, gy - H * 0.46);
      ctx.lineTo(x + H * 0.08, gy - H * (0.2 + Math.abs(plate) * 0.03));
      ctx.stroke();
    }
  } else if (unit.discipline === "warrior") {
    ctx.lineWidth = 5 + pulse * 3;
    for (let echo = 0; echo < 2; echo++) {
      ctx.globalAlpha = (echo ? 0.28 : 0.56) * pulse;
      ctx.beginPath();
      ctx.arc(cx, gy - H * 0.28, H * (0.48 + echo * 0.13), -Math.PI * 0.88, Math.PI * 0.18);
      ctx.stroke();
    }
  } else if (unit.discipline === "rogue") {
    for (let echo = 1; echo <= 3; echo++) {
      ctx.globalAlpha = (0.42 / echo) * pulse;
      ctx.beginPath();
      ctx.ellipse(cx - unit.facing * H * echo * 0.18, gy - H * 0.35, H * 0.13, H * 0.3, -unit.facing * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (unit.discipline === "archer") {
    ctx.lineWidth = 1.5 + pulse * 1.2;
    const far = cx + unit.facing * H * 1.55;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = -t * 28;
    ctx.beginPath();
    ctx.moveTo(cx + unit.facing * H * 0.22, gy - H * 0.48);
    ctx.lineTo(far, gy - H * 0.48);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(far - unit.facing * 9, gy - H * 0.55);
    ctx.lineTo(far, gy - H * 0.48);
    ctx.lineTo(far - unit.facing * 9, gy - H * 0.41);
    ctx.stroke();
  } else if (unit.discipline === "priest") {
    ctx.lineWidth = 2.2;
    for (let ray = 0; ray < 6; ray++) {
      const angle = ray * Math.PI / 3 + t * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * H * 0.3, gy - H * 0.64 + Math.sin(angle) * H * 0.11);
      ctx.lineTo(cx + Math.cos(angle) * H * 0.48, gy - H * 0.64 + Math.sin(angle) * H * 0.17);
      ctx.stroke();
    }
  } else if (unit.discipline === "mage") {
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(cx, gy - H * 0.42);
    ctx.rotate(t * 0.8);
    for (let rune = 0; rune < 3; rune++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.strokeRect(H * 0.42, -H * 0.055, H * 0.11, H * 0.11);
    }
    ctx.restore();
  } else if (unit.discipline === "necromancer") {
    ctx.lineWidth = 2.4;
    for (let hand = -1; hand <= 1; hand++) {
      const x = cx + hand * H * 0.24;
      const lift = H * (0.08 + pulse * (0.12 + (hand + 1) * 0.025));
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.quadraticCurveTo(x - hand * 5, gy - lift * 0.55, x + hand * 3, gy - lift);
      ctx.stroke();
      for (let finger = -1; finger <= 1; finger++) {
        ctx.beginPath();
        ctx.moveTo(x + hand * 3, gy - lift);
        ctx.lineTo(x + finger * 4, gy - lift - H * 0.08);
        ctx.stroke();
      }
    }
  }
  if (unit.advCalling && pulse > 0.45) {
    const ascendant = unit.advCalling.endsWith("-ascendant");
    ctx.globalAlpha = pulse * 0.44;
    ctx.lineWidth = 1.8 + pulse;
    if (ascendant) {
      ctx.beginPath();
      ctx.ellipse(cx, gy - H * 0.08, H * 0.55, H * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + side * H * 0.28, gy - H * 0.2);
        ctx.lineTo(cx + side * H * 0.52, gy - H * 0.35);
        ctx.lineTo(cx + side * H * 0.3, gy - H * 0.5);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** Priority foes announce their job through a compact ground heraldry mark.
 * It is deliberately made from the same painted lines as attack telegraphs:
 * readable at combat scale, but still part of the world rather than a badge. */
function drawEnemyRoleTell(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  if (!unit.enemyKind || Object.prototype.hasOwnProperty.call(BOSS_PHASES, unit.enemyKind)) return;
  const def = ENEMIES[unit.enemyKind];
  const intent = unit.castGlow > 0.12 || unit.windup > 0;
  if (!def.priority && !intent) return;
  const role = def.role ?? "vanguard";
  const pulse = 1 + Math.sin(time * 7 + unit.id) * (intent ? 0.08 : 0.03);
  const radius = unit.radius * (def.priority ? 1.55 : 1.3) * pulse;
  const y = unit.y + 2;
  ctx.save();
  ctx.translate(unit.x, y);
  ctx.globalAlpha = intent ? 0.72 : 0.28;
  ctx.strokeStyle = def.trim;
  ctx.fillStyle = def.trim;
  ctx.lineWidth = intent ? 2.5 : 1.6;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.38, 0, Math.PI * 0.12, Math.PI * 0.88);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.38, 0, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();

  if (role === "tank") {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.34, -radius * 0.12);
    ctx.lineTo(0, -radius * 0.26);
    ctx.lineTo(radius * 0.34, -radius * 0.12);
    ctx.lineTo(radius * 0.25, radius * 0.18);
    ctx.lineTo(0, radius * 0.29);
    ctx.lineTo(-radius * 0.25, radius * 0.18);
    ctx.closePath();
    ctx.stroke();
  } else if (role === "assassin" || role === "hunter") {
    const direction = unit.facing;
    ctx.beginPath();
    ctx.moveTo(-direction * radius * 0.42, radius * 0.2);
    ctx.lineTo(direction * radius * 0.35, 0);
    ctx.lineTo(-direction * radius * 0.42, -radius * 0.2);
    ctx.stroke();
    if (role === "assassin") {
      ctx.beginPath();
      ctx.moveTo(-direction * radius * 0.18, radius * 0.18);
      ctx.lineTo(direction * radius * 0.5, 0);
      ctx.lineTo(-direction * radius * 0.18, -radius * 0.18);
      ctx.stroke();
    }
  } else if (role === "support" || role === "summoner") {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    const motes = role === "summoner" ? 3 : 4;
    for (let i = 0; i < motes; i++) {
      const angle = time * (role === "summoner" ? -1 : 1) + (i / motes) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius * 0.48, Math.sin(angle) * radius * 0.18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (role === "artillery") {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    ctx.moveTo(-radius * 0.52, 0);
    ctx.lineTo(radius * 0.52, 0);
    ctx.moveTo(0, -radius * 0.25);
    ctx.lineTo(0, radius * 0.25);
    ctx.stroke();
  } else if (role === "controller" || role === "disruptor") {
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-radius * 0.25, -radius * 0.25, radius * 0.5, radius * 0.5);
    if (role === "disruptor") {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.38, radius * 0.15);
      ctx.lineTo(-radius * 0.08, -radius * 0.08);
      ctx.lineTo(radius * 0.08, radius * 0.08);
      ctx.lineTo(radius * 0.38, -radius * 0.15);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(-radius * 0.38, radius * 0.18);
    ctx.lineTo(radius * 0.42, -radius * 0.18);
    ctx.stroke();
  }
  ctx.restore();
}

/** How far into dusk this battle is (0-1) — set by drawUnits, stretches every shadow. */
let shadowDusk = 0;
/** Which stage the current battle is on — regional dress for enemies keys off it. */
let regionStage = 0;

function drawShadow(ctx: CanvasRenderingContext2D, unit: Unit, bounce = 0): void {
  // the shadow shrinks and fades a touch at the top of a hop — grounds the bounce
  const lift = Math.min(1, bounce / 6);
  const alpha = (0.3 - lift * 0.1) * (1 - shadowDusk * 0.25);
  ctx.fillStyle = `rgba(20, 14, 30, ${alpha})`;
  if (shadowDusk > 0.02) {
    // the sinking sun drags every shadow long toward the east
    ctx.save();
    ctx.translate(unit.x, unit.y + 2);
    ctx.transform(1, 0, -shadowDusk * 1.1, 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(0, 0, unit.radius * 1.15 * (1 - lift * 0.18) * (1 + shadowDusk * 0.9), unit.radius * 0.4 * (1 - lift * 0.18), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
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
 * Living title backdrop: the recruited band idles around a campfire under a
 * starry sky. Drawn behind the DOM menus every frame.
 */
export function drawTitleDiorama(ctx: CanvasRenderingContext2D, save: SaveData, w: number, h: number, time: number): void {
  const horizon = h * 0.46;
  // night sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#141127");
  sky.addColorStop(1, "#2b2344");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon + 2);
  // stars
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (let i = 0; i < 40; i++) {
    const sx = hash01(i * 3.1) * w;
    const sy = hash01(i * 7.7) * horizon * 0.9;
    ctx.globalAlpha = 0.2 + Math.abs(Math.sin(time * 1.4 + i * 2.2)) * 0.6;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  // moon
  ctx.fillStyle = "#e8e6f5";
  ctx.beginPath();
  ctx.arc(w * 0.82, horizon * 0.3, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#141127";
  ctx.beginPath();
  ctx.arc(w * 0.82 - 7, horizon * 0.3 - 4, 14, 0, Math.PI * 2);
  ctx.fill();
  // hills + ground
  ctx.fillStyle = "#1d1a33";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 2);
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, horizon - 20 - Math.sin(x * 0.006 + 2) * 16 - Math.sin(x * 0.017) * 7);
  ctx.lineTo(w, horizon + 2);
  ctx.closePath();
  ctx.fill();
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, "#232338");
  ground.addColorStop(1, "#17141f");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);
  // pines silhouetted on the ridge
  ctx.fillStyle = "#151228";
  for (let i = 0; i < 8; i++) {
    const tx = hash01(i * 13.7) * w;
    const ty = horizon - 14 - Math.sin(tx * 0.006 + 2) * 16;
    const th = 22 + hash01(i * 5.1) * 20;
    ctx.beginPath();
    ctx.moveTo(tx, ty - th);
    ctx.lineTo(tx - th * 0.36, ty);
    ctx.lineTo(tx + th * 0.36, ty);
    ctx.closePath();
    ctx.fill();
  }
  // campfire
  const fx2 = w * 0.5;
  const fy2 = h * 0.76;
  const flick = 0.85 + Math.sin(time * 9) * 0.08 + Math.sin(time * 23.7) * 0.07;
  const glow = ctx.createRadialGradient(fx2, fy2 - 8, 4, fx2, fy2 - 8, 150 * flick);
  glow.addColorStop(0, "rgba(255, 170, 80, 0.34)");
  glow.addColorStop(1, "rgba(255, 150, 60, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(fx2 - 160, fy2 - 160, 320, 320);
  // logs
  ctx.save();
  ctx.translate(fx2, fy2 + 2);
  for (const a of [-0.42, 0.42]) {
    ctx.save();
    ctx.rotate(a);
    roundRect(ctx, -16, -3, 32, 6, 3);
    outlined(ctx, "#4a3626", 1.8);
    ctx.restore();
  }
  ctx.restore();
  // flames: three flickering teardrops
  for (const [off, scale, color] of [
    [0, 1, "#ff9b42"],
    [-5, 0.65, "#ffc46b"],
    [5, 0.55, "#ffc46b"],
  ] as [number, number, string][]) {
    const fl = flick + Math.sin(time * 13 + off) * 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx2 + off, fy2 - 2);
    ctx.quadraticCurveTo(fx2 + off - 7 * scale, fy2 - 12 * scale * fl, fx2 + off + Math.sin(time * 11 + off) * 2.4, fy2 - 26 * scale * fl);
    ctx.quadraticCurveTo(fx2 + off + 7 * scale, fy2 - 12 * scale * fl, fx2 + off, fy2 - 2);
    ctx.fill();
  }
  // sparks drifting up
  ctx.fillStyle = "#ffce8a";
  for (let i = 0; i < 6; i++) {
    const cyc = (time * 26 + i * 21) % 70;
    ctx.globalAlpha = Math.max(0, 1 - cyc / 70) * 0.8;
    ctx.beginPath();
    ctx.arc(fx2 + Math.sin(time * 2 + i * 4) * (6 + cyc * 0.24), fy2 - 12 - cyc, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the band, gathered round
  const roster = save.heroes.map((hs, i) => ({ hs, i })).filter(({ hs }) => hs.recruited).slice(0, 6);
  figureMode = true;
  roster.forEach(({ i }, at) => {
    const side = at % 2 === 0 ? -1 : 1;
    const rank = Math.floor(at / 2);
    const ux = fx2 + side * (62 + rank * 52);
    const uy = fy2 + 8 + rank * 9;
    const hs = save.heroes[i];
    const oathDef = callingById(hs.calling);
    const active = oathDef && callingEligible(oathDef, hs.attrs) ? hs.calling : null;
    const mock = {
      id: i + 40,
      name: HEROES[i].name,
      team: "hero",
      heroIndex: i,
      enemyKind: null,
      calling: active,
      advCalling: active ? hs.advCalling : null,
      discipline: active ? hs.discipline : null,
      element: active ? hs.element : null,
      ultCharge: 0,
      entered: true,
      x: ux,
      y: uy,
      radius: 13,
      stats: deriveStats(hs.attrs, hs.weaponTier, heroGearOf(hs, save.forge), hs.talents, hs.trinket, active, active ? hs.advCalling : null, hs.masteredElements),
      hp: 1,
      attackTimer: 0,
      moveTarget: null,
      attackTarget: null,
      healTarget: null,
      stance: "attack",
      autoOrder: false,
      abilities: [],
      effects: [],
      facing: (side < 0 ? 1 : -1) as 1 | -1,
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
      leap: null,
    } as unknown as Unit;
    mock.hp = mock.stats.maxHp;
    drawHero(ctx, mock, save, false, time + i * 1.7);
  });
  figureMode = false;
  // warm firelight kisses the near ground
  ctx.globalAlpha = 0.5;
  const warm = ctx.createRadialGradient(fx2, fy2, 6, fx2, fy2, 120);
  warm.addColorStop(0, "rgba(255, 160, 70, 0.22)");
  warm.addColorStop(1, "rgba(255, 160, 70, 0)");
  ctx.fillStyle = warm;
  ctx.beginPath();
  ctx.ellipse(fx2, fy2 + 4, 130, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawVignette(ctx, w, h);
}

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
  const oathDef = callingById(hero.calling);
  const activeOath = oathDef && callingEligible(oathDef, hero.attrs) ? hero.calling : null;
  const stats = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, activeOath, activeOath ? hero.advCalling : null, hero.masteredElements);
  const radius = 13;
  const scale = canvas.height / (radius * 3.7 * 1.55);
  const unit = {
    id: heroIndex,
    name: HEROES[heroIndex].name,
    team: "hero",
    heroIndex,
    enemyKind: null,
    calling: activeOath,
    advCalling: activeOath ? hero.advCalling : null,
    discipline: activeOath ? hero.discipline : null,
    element: activeOath ? hero.element : null,
    entered: true,
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
    leap: null,
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

  const build = def.build ?? { torso: 1, limb: 1, head: 1 };
  const hipY = gy - H * 0.30;
  const shoulderY = gy - H * 0.52 + pose.breathe * 0.4;
  const headR = H * 0.29 * build.head;
  const headY = shoulderY - headR * 0.85;
  const bodyW = H * 0.34 * build.torso;
  const legW = H * 0.10 * build.limb;
  const stride = H * 0.14;
  const robed = unit.stats.weapon === "stave";
  const gear = save.heroes[unit.heroIndex];
  const wTier = gear?.weaponTier ?? 0;
  const wornPiece = armorById(gear?.armor ?? null);
  const aTier = wornPiece ? ARMOR_FAMILY_TIER[wornPiece.family] : 0;
  const plateTint = wornPiece?.tint ?? "#aab4c2";
  const helmPiece = armorById(gear?.helm ?? null);
  const bootsPiece = armorById(gear?.boots ?? null);
  const BOOT_TINTS: Record<string, string> = { cloth: "#5d5378", leather: "#6e5236", mail: "#7e8794", plate: "#98a2b2" };
  const bootColor = bootsPiece ? (bootsPiece.tint ?? BOOT_TINTS[bootsPiece.family]) : null;
  const bodyForge = gear?.armor ? (save.forge?.[gear.armor] ?? 0) : 0;

  drawDisciplineCastSilhouette(ctx, unit, cx, gy, H, time, save.reducedMotion);

  // Path identity is carried by a physical silhouette first and magic second:
  // quiver, shield, stole, scarf, or orbiting folio. The attunement stays low
  // at the feet so combat remains readable when four heroes overlap.
  if (unit.discipline && unit.element) {
    const pathTime = save.reducedMotion ? 0 : time;
    const pathColor = ELEMENT_MARK_COLORS[unit.element];
    ctx.save();
    ctx.globalAlpha = 0.2 + Math.sin(pathTime * 1.8 + unit.id) * 0.035;
    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, gy + 1, H * 0.38, H * 0.11, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let mark = 0; mark < 3; mark++) {
      const angle = pathTime * 0.55 + mark * (Math.PI * 2 / 3) + unit.id;
      ctx.fillStyle = pathColor;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * H * 0.31, gy + Math.sin(angle) * H * 0.065, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (unit.discipline === "knight") {
      const sx = cx - f * bodyW * 0.72;
      const shield = new Path2D();
      shield.moveTo(sx - bodyW * 0.28, shoulderY - 3);
      shield.lineTo(sx + bodyW * 0.28, shoulderY - 3);
      shield.lineTo(sx + bodyW * 0.22, hipY + H * 0.1);
      shield.lineTo(sx, hipY + H * 0.18);
      shield.lineTo(sx - bodyW * 0.22, hipY + H * 0.1);
      shield.closePath();
      shaded(ctx, shield, "#657078", f, sx, hipY, bodyW * 0.35, 2.2);
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, shoulderY + 1);
      ctx.lineTo(sx, hipY + H * 0.1);
      ctx.stroke();
    } else if (unit.discipline === "warrior") {
      // A broad back harness keeps the two-handed silhouette readable even
      // while the blade crosses the body during a swing.
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx - f * bodyW * 0.65, shoulderY - H * 0.16);
      ctx.lineTo(cx + f * bodyW * 0.5, hipY + H * 0.18);
      ctx.stroke();
      ctx.fillStyle = "#6a4b34";
      roundRect(ctx, cx - bodyW * 0.5, hipY + H * 0.08, bodyW, H * 0.08, 2);
      ctx.fill();
    } else if (unit.discipline === "rogue") {
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - f * bodyW * 0.2, shoulderY);
      ctx.quadraticCurveTo(cx - f * bodyW * 1.1, shoulderY + H * 0.13, cx - f * bodyW * (1.35 + Math.sin(pathTime * 3) * 0.12), hipY + H * 0.08);
      ctx.stroke();
    } else if (unit.discipline === "archer") {
      ctx.save();
      ctx.translate(cx - f * bodyW * 0.58, shoulderY + H * 0.07);
      ctx.rotate(-f * 0.28);
      roundRect(ctx, -4, -H * 0.19, 8, H * 0.37, 3);
      outlined(ctx, "#654b32", 2);
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 1.5;
      for (const arrow of [-2, 1, 4]) {
        ctx.beginPath();
        ctx.moveTo(arrow, -H * 0.15);
        ctx.lineTo(arrow + f, -H * 0.29);
        ctx.stroke();
      }
      ctx.restore();
    } else if (unit.discipline === "priest") {
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR * 1.15, headR * 0.95, headR * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (unit.discipline === "necromancer") {
      // Three restrained grave-lights orbit the tome instead of reusing the
      // Mage's rune folio; their count echoes stored Remains.
      for (let spirit = 0; spirit < 3; spirit++) {
        const angle = pathTime * 0.82 + spirit * (Math.PI * 2 / 3);
        const sx = cx + Math.cos(angle) * bodyW;
        const sy = shoulderY + H * 0.13 + Math.sin(angle) * H * 0.18;
        ctx.globalAlpha = 0.42 + Math.min(0.45, (unit.pathResource ?? 0) / 220);
        ctx.fillStyle = pathColor;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.quadraticCurveTo(sx + 5, sy, sx, sy + 6);
        ctx.quadraticCurveTo(sx - 5, sy, sx, sy - 4);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = pathColor;
      ctx.font = `700 ${Math.max(7, H * 0.13)}px Georgia, serif`;
      ctx.textAlign = "center";
      for (let rune = 0; rune < 3; rune++) {
        const angle = pathTime * 0.7 + rune * (Math.PI * 2 / 3);
        ctx.globalAlpha = 0.55 + rune * 0.1;
        ctx.fillText(["◇", "·", "△"][rune], cx + Math.cos(angle) * bodyW * 0.9, shoulderY + H * 0.18 + Math.sin(angle) * H * 0.16);
      }
    }
    ctx.restore();
  }

  // back leg, back arm behind body
  if (!robed) {
    const bfx = cx - f * 2 - f * pose.walk * stride;
    limb(ctx, cx - f * 2, hipY, bfx, gy - 1, legW, "#3a2f47");
    boot(ctx, bfx, gy - 1, bootColor ?? "#2b2136");
  }
  // free back arm swings opposite the stride
  const bhx = cx - f * bodyW * 0.55 - f * pose.walk * H * 0.06;
  const bhy = shoulderY + H * 0.16 + pose.walk * 2;
  limb(ctx, cx - f * bodyW * 0.3, shoulderY + 3, bhx, bhy, legW * 0.85, def.skin);
  hand(ctx, bhx, bhy, def.skin);

  // path regalia: a cape in the attunement color billows out behind
  const oath = callingById(unit.calling);
  if (oath && !robed) {
    const sway = Math.sin(unit.bobPhase * 0.8) * 2 - f * pose.walk * 4;
    const hemY = gy - H * 0.06;
    const cape = new Path2D();
    cape.moveTo(cx + f * bodyW * 0.1, shoulderY - 4);
    cape.lineTo(cx - f * bodyW * 0.6, shoulderY - 2);
    cape.quadraticCurveTo(cx - f * bodyW * 1.35 + sway, (shoulderY + hemY) / 2, cx - f * bodyW * 1.05 + sway * 1.3, hemY);
    cape.lineTo(cx - f * bodyW * 0.25, hemY - 2);
    cape.quadraticCurveTo(cx - f * bodyW * 0.1, (hipY + shoulderY) / 2, cx + f * bodyW * 0.1, shoulderY - 4);
    cape.closePath();
    shaded(ctx, cape, oath.color, f, cx - f * bodyW * 0.7, (shoulderY + hemY) / 2, bodyW * 0.6, 2.2);
  }

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
    shaded(ctx, robe, "#efe6d0", f, cx, (shoulderY + gy) / 2, H * 0.32, 3);
    // accent stole draped down the front — breaks up the snowman silhouette
    // (an active Path dyes the stole in its attunement color)
    ctx.save();
    ctx.clip(robe);
    ctx.fillStyle = oath?.color ?? def.accent;
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
    // hip mass so the legs grow out of a body, not a point
    ctx.beginPath();
    ctx.ellipse(cx, hipY + H * 0.045, bodyW * 0.4, H * 0.075, 0, 0, Math.PI * 2);
    outlined(ctx, "#433753", 2.6);
    // front leg
    const ffx = cx + f * 2 + f * pose.walk * stride;
    limb(ctx, cx + f * 2, hipY, ffx, gy - 1, legW, "#4a3d5c");
    boot(ctx, ffx, gy - 1, bootColor ?? "#33283f");

    // tunic body (trapezoid, slightly leaning into facing)
    const tunic = new Path2D();
    tunic.moveTo(cx - bodyW * 0.52, hipY + 3);
    tunic.quadraticCurveTo(cx - bodyW * 0.62, shoulderY, cx - bodyW * 0.34 + f * 1.5, shoulderY - 2);
    tunic.lineTo(cx + bodyW * 0.34 + f * 1.5, shoulderY - 2);
    tunic.quadraticCurveTo(cx + bodyW * 0.62, shoulderY, cx + bodyW * 0.52, hipY + 3);
    tunic.quadraticCurveTo(cx, hipY + H * 0.07, cx - bodyW * 0.52, hipY + 3);
    tunic.closePath();
    shaded(ctx, tunic, def.accent, f, cx, (shoulderY + hipY) / 2, bodyW * 0.55, 3);
    // belt
    ctx.fillStyle = "rgba(20,14,30,0.5)";
    ctx.fillRect(cx - bodyW * 0.5, hipY - 1, bodyW, 3);
    ctx.fillStyle = "#c9a95c";
    ctx.fillRect(cx + f * 1.5 - 1.6, hipY - 0.5, 3.2, 2.2);
  }
  // Waymark clasp pinned at the shoulder
  if (oath) {
    const px2 = cx + f * bodyW * 0.32;
    const py2 = shoulderY + 1;
    ctx.beginPath();
    ctx.arc(px2, py2, 3.4, 0, Math.PI * 2);
    outlined(ctx, oath.color, 1.6);
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath();
    ctx.arc(px2, py2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // armor flair grows with tier
  if (!robed && aTier >= 1) {
    // leather shoulder pad
    ctx.beginPath();
    ctx.ellipse(cx + f * bodyW * 0.34, shoulderY, bodyW * 0.26, bodyW * 0.18, f * 0.3, 0, Math.PI * 2);
    outlined(ctx, aTier >= 3 ? plateTint : "#7a5a3a", 2);
  }
  if (!robed && aTier >= 2) {
    // chain band across the chest
    ctx.strokeStyle = aTier >= 3 ? plateTint : "#9aa3ad";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, shoulderY + 2);
    ctx.lineTo(cx + bodyW * 0.42, hipY - 2);
    ctx.stroke();
  }
  // some pieces wear their story on the outside
  const pieceId = wornPiece?.id;
  if (pieceId === "wolfpelt" || pieceId === "alphasPelt") {
    // a fur ruff at the collar (the Alpha's is moon-pale)
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const mx = cx - bodyW * 0.42 + i * bodyW * 0.21;
      ctx.moveTo(mx, shoulderY - 1);
      ctx.lineTo(mx + bodyW * 0.09, shoulderY - 6 - (i % 2) * 2);
      ctx.lineTo(mx + bodyW * 0.2, shoulderY - 1);
    }
    ctx.closePath();
    outlined(ctx, pieceId === "alphasPelt" ? "#b8b0d4" : "#7a6a52", 1.8);
  } else if (pieceId === "emberweave" || (robed && pieceId === "emberweave")) {
    ctx.strokeStyle = `rgba(255, 150, 70, ${0.5 + Math.abs(Math.sin(time * 2.4)) * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.42, hipY + 3);
    ctx.lineTo(cx + bodyW * 0.42, hipY + 3);
    ctx.stroke();
  } else if (pieceId === "gorehulkWall") {
    // the warlord's cracked pauldron, worn like a trophy
    ctx.strokeStyle = "#2f1a12";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + f * bodyW * 0.24, shoulderY - 4);
    ctx.lineTo(cx + f * bodyW * 0.38, shoulderY + 1);
    ctx.lineTo(cx + f * bodyW * 0.3, shoulderY + 5);
    ctx.stroke();
  } else if (pieceId === "mosstoothHide") {
    ctx.fillStyle = "rgba(110, 140, 80, 0.65)";
    ctx.beginPath();
    ctx.ellipse(cx - f * bodyW * 0.3, shoulderY + 2, bodyW * 0.16, bodyW * 0.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // a forged piece wears its marks: gilt trim at +2, a living gleam at masterwork
  if (bodyForge >= 2 && !robed) {
    ctx.strokeStyle = "rgba(255, 215, 107, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.5, hipY + 1);
    ctx.lineTo(cx + bodyW * 0.5, hipY + 1);
    ctx.stroke();
  }
  if (bodyForge >= 3) {
    const tw = (time * 2.1 + unit.id * 1.3) % (Math.PI * 2);
    const glint = Math.max(0, Math.sin(tw)) ** 6;
    if (glint > 0.05) {
      ctx.save();
      ctx.globalAlpha = glint * 0.9;
      ctx.strokeStyle = "#fff3c0";
      ctx.lineWidth = 1.4;
      const gx = cx + f * bodyW * 0.28;
      const gyy = shoulderY + H * 0.06;
      ctx.beginPath();
      ctx.moveTo(gx - 3.5, gyy);
      ctx.lineTo(gx + 3.5, gyy);
      ctx.moveTo(gx, gyy - 3.5);
      ctx.lineTo(gx, gyy + 3.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  // head (big, chibi)
  const faceX = cx + f * 1.5;
  const head = new Path2D();
  head.arc(faceX, headY, headR, 0, Math.PI * 2);
  shaded(ctx, head, def.skin, f, faceX, headY, headR, 3);
  if (!robed && (helmPiece?.family === "plate" || (!helmPiece && aTier >= 3))) {
    // plate helm with a nose guard (tinted by the piece's making)
    const helmTint = helmPiece?.tint ?? plateTint;
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - headR * 0.1, headR * 1.04, Math.PI * 0.9, Math.PI * 2.1);
    ctx.closePath();
    outlined(ctx, helmTint, 2.2);
    ctx.fillStyle = helmTint;
    ctx.fillRect(cx + f * headR * 0.3 - 1.6, headY - headR * 0.35, 3.2, headR * 0.75);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx + f * headR * 0.3 - 1.6, headY - headR * 0.35, 3.2, headR * 0.75);
    // plume (the Winged Helm earns wings instead)
    if (helmPiece?.id === "wingedHelm") {
      ctx.beginPath();
      ctx.moveTo(cx - f * 1, headY - headR * 0.95);
      ctx.lineTo(cx - f * headR * 1.05, headY - headR * 1.45);
      ctx.lineTo(cx - f * headR * 0.75, headY - headR * 0.8);
      ctx.closePath();
      outlined(ctx, "#e8e0cc", 1.6);
      ctx.beginPath();
      ctx.moveTo(cx + f * headR * 0.55, headY - headR * 0.85);
      ctx.lineTo(cx + f * headR * 1.35, headY - headR * 1.3);
      ctx.lineTo(cx + f * headR * 0.85, headY - headR * 0.62);
      ctx.closePath();
      outlined(ctx, "#e8e0cc", 1.6);
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - f * 1, headY - headR * 1.05);
      ctx.quadraticCurveTo(cx - f * headR * 0.9, headY - headR * 1.7, cx - f * headR * 1.35, headY - headR * 1.2);
      ctx.quadraticCurveTo(cx - f * headR * 0.8, headY - headR * 1.05, cx - f * 1, headY - headR * 0.85);
      ctx.closePath();
      outlined(ctx, def.accent, 1.8);
    }
  } else if (!robed && helmPiece?.family === "mail") {
    // chain coif: ringed steel hugging the crown and chin
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - headR * 0.05, headR * 1.02, Math.PI * 0.8, Math.PI * 2.2);
    ctx.quadraticCurveTo(cx - f * headR * 0.4, headY + headR * 0.85, cx - f * headR * 1.0, headY + headR * 0.45);
    ctx.closePath();
    outlined(ctx, helmPiece.tint ?? "#8f98a6", 2);
    ctx.strokeStyle = "rgba(20,14,30,0.35)";
    ctx.lineWidth = 1;
    for (let r = 0.35; r <= 0.85; r += 0.25) {
      ctx.beginPath();
      ctx.arc(cx + f * 0.5, headY - headR * 0.05, headR * r + headR * 0.14, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  } else if (!robed && helmPiece?.family === "leather") {
    // snug hunter's cap with a short brim
    ctx.beginPath();
    ctx.arc(cx + f * 0.5, headY - headR * 0.18, headR * 0.98, Math.PI * 1.0, Math.PI * 2.0);
    ctx.closePath();
    outlined(ctx, "#6e5236", 2);
    ctx.strokeStyle = "#57402a";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - f * headR * 0.85, headY - headR * 0.28);
    ctx.lineTo(cx + f * headR * 1.12, headY - headR * 0.28);
    ctx.stroke();
  } else if (!robed && helmPiece?.family === "cloth") {
    // woven circlet with a small stone at the brow
    ctx.strokeStyle = helmPiece.id === "pilgrimCowl" ? "#e0d6b8" : "#b48ae8";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(faceX, headY - headR * 0.1, headR * 0.99, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(faceX + f * headR * 0.02, headY - headR * 0.72, 1.8, 0, Math.PI * 2);
    outlined(ctx, "#fff0c0", 1.2);
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
  } else if (unit.heroIndex === 4) {
    // Maren: sea-glass hair with a braid draped over the front shoulder
    ctx.beginPath();
    ctx.arc(faceX - f * 0.5, headY - headR * 0.1, headR * 0.99, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 5.6;
    ctx.beginPath();
    ctx.moveTo(faceX + f * headR * 0.75, headY - headR * 0.2);
    ctx.quadraticCurveTo(faceX + f * headR * 1.15, headY + headR * 0.7, faceX + f * headR * 0.9, headY + headR * 1.5);
    ctx.stroke();
    ctx.strokeStyle = def.hair;
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(faceX + f * headR * 0.9, headY + headR * 1.55, 2.2, 0, Math.PI * 2);
    outlined(ctx, "#e8f2f0", 1.4);
  } else if (unit.heroIndex === 5) {
    // Kellan: cropped iron-dark hair under a notched browband
    ctx.beginPath();
    ctx.arc(faceX - f * 0.5, headY - headR * 0.16, headR * 0.96, Math.PI * 1.0, Math.PI * 2.0);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    ctx.strokeStyle = "#8a8f9c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(faceX, headY - headR * 0.16, headR * 0.95, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
    // old scar across the cheek
    ctx.strokeStyle = "rgba(120, 62, 42, 0.75)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(faceX - f * headR * 0.42, headY + headR * 0.28);
    ctx.lineTo(faceX - f * headR * 0.18, headY + headR * 0.55);
    ctx.stroke();
  } else if (unit.heroIndex === 6) {
    // Sigrid: golden hair in a crown braid, ringed by a steel circlet
    ctx.beginPath();
    ctx.arc(faceX - f * 0.5, headY - headR * 0.12, headR * 0.99, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    ctx.strokeStyle = def.hair;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(faceX, headY - headR * 0.28, headR * 0.88, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    for (let bi = 0; bi < 4; bi++) {
      const ba = Math.PI * (1.2 + bi * 0.18);
      ctx.beginPath();
      ctx.moveTo(faceX + Math.cos(ba) * headR * 0.78, headY - headR * 0.28 + Math.sin(ba) * headR * 0.78);
      ctx.lineTo(faceX + Math.cos(ba) * headR * 0.98, headY - headR * 0.28 + Math.sin(ba) * headR * 0.98);
      ctx.stroke();
    }
    ctx.strokeStyle = "#9aa7b8";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(faceX, headY - headR * 0.12, headR * 0.97, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else if (unit.heroIndex === 7) {
    // Vesna: winter-white sweep with a frost-blue streak, wind-caught
    ctx.beginPath();
    ctx.arc(faceX - f * 1.2, headY - headR * 0.1, headR * 1.0, Math.PI * 0.92, Math.PI * 2.08);
    ctx.closePath();
    outlined(ctx, def.hair, 2);
    ctx.strokeStyle = "#8fc7e8";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(faceX - f * headR * 0.55, headY - headR * 0.85);
    ctx.quadraticCurveTo(faceX - f * headR * 1.05, headY - headR * 0.3, faceX - f * headR * 0.85, headY + headR * 0.35);
    ctx.stroke();
    // a stray lock across the brow
    ctx.strokeStyle = def.hair;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(faceX + f * headR * 0.3, headY - headR * 0.75);
    ctx.quadraticCurveTo(faceX + f * headR * 0.75, headY - headR * 0.45, faceX + f * headR * 0.6, headY - headR * 0.1);
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
  // the Winterreach shows every breath
  if (regionStage >= 6) {
    const puffW = ((time * 0.5 + unit.id * 0.41) % 1);
    if (puffW < 0.35) {
      const pk = puffW / 0.35;
      ctx.globalAlpha = (1 - pk) * 0.35;
      ctx.fillStyle = "#e8f2f8";
      ctx.beginPath();
      ctx.ellipse(cx + f * (headR * 0.9 + pk * 7), headY + headR * 0.25 - pk * 4, 2.5 + pk * 4, 1.8 + pk * 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // chibi face: two eyes toward facing (they blink!), brows, a living mouth, blush
  // — with per-hero character: sharp, gentle, lashed, or glowering
  const face = { eyeRy: 0.26, browW: 1.5, browTilt: 0, uniBrow: false, lashes: false, softLids: false };
  switch (unit.heroIndex) {
    case 2: // Ezri: sharp, knowing
      face.eyeRy = 0.21;
      face.browTilt = 0.09;
      break;
    case 3: // Sol: gentle
      face.softLids = true;
      face.browW = 1.2;
      break;
    case 4: // Maren: lashes
      face.lashes = true;
      break;
    case 5: // Kellan: one heavy brow
      face.eyeRy = 0.22;
      face.uniBrow = true;
      break;
    case 6: // Sigrid: steady, unimpressed
      face.eyeRy = 0.23;
      face.browW = 1.7;
      break;
    case 7: // Vesna: wide winter eyes, lashed
      face.eyeRy = 0.3;
      face.lashes = true;
      face.browTilt = 0.05;
      break;
  }
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
    ctx.ellipse(ex, eyeY, headR * 0.2, headR * face.eyeRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fdf8ee";
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(ex + f * headR * 0.07, eyeY + headR * 0.04, headR * 0.115, 0, Math.PI * 2);
    ctx.fill();
    if (face.lashes) {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex + f * headR * 0.16, eyeY - headR * 0.2);
      ctx.lineTo(ex + f * headR * 0.3, eyeY - headR * 0.3);
      ctx.stroke();
    }
    if (face.softLids) {
      ctx.strokeStyle = "rgba(36, 27, 46, 0.4)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex - f * headR * 0.14, eyeY + headR * 0.3);
      ctx.quadraticCurveTo(ex, eyeY + headR * 0.36, ex + f * headR * 0.14, eyeY + headR * 0.3);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = OUTLINE;
  if (!shut && face.uniBrow) {
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(eyeXs[1] - f * headR * 0.22, eyeY - headR * 0.4);
    ctx.lineTo(eyeXs[0] + f * headR * 0.24, eyeY - headR * 0.32);
    ctx.stroke();
  } else if (!shut) {
    ctx.lineWidth = face.browW;
    for (const ex of eyeXs) {
      ctx.beginPath();
      ctx.moveTo(ex - f * headR * 0.18, eyeY - headR * (0.42 - face.browTilt));
      ctx.lineTo(ex + f * headR * 0.2, eyeY - headR * (0.36 + face.browTilt));
      ctx.stroke();
    }
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

  // weapon arm + weapon (front) — the shoulder sways against the stride,
  // and idle flourishes raise the weapon in a small salute
  const shX = cx + f * bodyW * 0.36 - f * pose.walk * 1.4;
  const shY = shoulderY + 2;
  const idleRaise = unit.idleAnim > 0 ? Math.sin((1 - unit.idleAnim / 0.7) * Math.PI) * 0.14 : 0;
  drawHeroWeapon(ctx, unit, def.accent, def.skin, shX, shY, H, f, Math.max(pose.swing, idleRaise), unit.castGlow, time, legW, wTier);

  flashOverlay(ctx, unit, cx, gy - H * 0.45, H * 0.5);
  if (unit.castGlow > 0) {
    ctx.globalAlpha = unit.castGlow * 1.6;
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, gy - H * 0.45, Math.max(2, H * 0.55 + (0.4 - unit.castGlow) * 26), 0, Math.PI * 2);
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
  if (unit.stats.weapon === "sword" || unit.stats.weapon === "greatsword") {
    const heavy = unit.stats.weapon === "greatsword";
    // arm rotates from rest through a big arc on swing
    const angle = f * (-0.6 + swing * (heavy ? 2.15 : 1.85));
    const handX = shX + Math.cos(angle) * H * 0.22;
    const handY = shY + Math.sin(angle) * H * 0.22 + H * 0.06;
    limb(ctx, shX, shY, handX, handY, armW * (heavy ? 1.05 : 0.9), skin);
    if (heavy) limb(ctx, shX - f * H * 0.05, shY + H * 0.08, handX - f * H * 0.075, handY + H * 0.07, armW * 0.95, skin);
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
        ctx.lineTo(0, -H * (heavy ? 0.72 : 0.55));
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(handX, handY);
    ctx.rotate(angle + f * 0.35 - f * Math.PI / 2);
    // blade — broad enough to mean it
    ctx.beginPath();
    const bladeHalf = heavy ? 5.2 : 3.4;
    const bladeLength = heavy ? 0.78 : 0.6;
    ctx.moveTo(-bladeHalf, -4);
    ctx.lineTo(-bladeHalf * 0.65, -H * (bladeLength - 0.08));
    ctx.lineTo(0, -H * bladeLength);
    ctx.lineTo(bladeHalf * 0.65, -H * (bladeLength - 0.08));
    ctx.lineTo(bladeHalf, -4);
    ctx.closePath();
    if (glow) {
      ctx.shadowColor = "#9fd0ff";
      ctx.shadowBlur = 8;
    }
    outlined(ctx, metal, 2.2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(-0.8, -H * 0.52, 1.6, H * 0.46);
    if (wTier >= 2) {
      // steel and above get a fuller, wider blade profile
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1.8, -6);
      ctx.lineTo(-1.2, -H * 0.5);
      ctx.stroke();
    }
    // crossguard + grip + pommel
    roundRect(ctx, -6.4, -4.8, 12.8, 3.8, 1.8);
    outlined(ctx, "#a8862f", 1.8);
    roundRect(ctx, -2.1, -1, 4.2, 7, 1.8);
    outlined(ctx, "#6b4a2a", 1.6);
    ctx.beginPath();
    ctx.arc(0, 6.6, 2, 0, Math.PI * 2);
    outlined(ctx, "#a8862f", 1.4);
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
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.26, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    ctx.strokeStyle = "#9c7440";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.26, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.stroke();
    // recurve tips + a wrapped grip where the hand sits
    const tipR = H * 0.26;
    for (const s of [-1, 1]) {
      const ta = (s * Math.PI) / 2.5;
      ctx.strokeStyle = "#9c7440";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ta) * tipR, Math.sin(ta) * tipR);
      ctx.lineTo(Math.cos(ta) * tipR + 3.4, Math.sin(ta) * tipR + s * 2.4);
      ctx.stroke();
    }
    ctx.fillStyle = "#6b4a2a";
    ctx.fillRect(tipR - 2.4, -4.5, 4.4, 9);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(tipR - 2.4, -4.5, 4.4, 9);
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
    limb(ctx, 0, H * 0.2, 0, -H * 0.56, 4.4, "#d9c9a0");
    // wrapped grip
    ctx.strokeStyle = "#8a6a42";
    ctx.lineWidth = 1.6;
    for (let wIdx = 0; wIdx < 3; wIdx++) {
      ctx.beginPath();
      ctx.moveTo(-2.6, H * 0.02 + wIdx * 3);
      ctx.lineTo(2.6, H * 0.02 + wIdx * 3 + 1.4);
      ctx.stroke();
    }
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
  } else if (unit.stats.weapon === "tome") {
    const raise = Math.max(swing, castGlow * 2.2);
    const handX = shX + f * H * 0.16;
    const handY = shY + H * 0.09;
    limb(ctx, shX, shY, handX, handY, armW * 0.82, skin);
    hand(ctx, handX, handY, skin);
    ctx.save();
    ctx.translate(handX + f * H * 0.08, handY - H * (0.08 + raise * 0.04));
    ctx.scale(f, 1);
    ctx.rotate(-0.12 + Math.sin(time * 1.8) * 0.025);
    const bookW = H * 0.28, bookH = H * 0.2;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 5 + raise * 10;
    roundRect(ctx, -bookW / 2, -bookH / 2, bookW, bookH, 2.5);
    outlined(ctx, "#51405f", 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d9cde5";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -bookH / 2 + 2);
    ctx.lineTo(0, bookH / 2 - 2);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(-bookW * 0.22, 0, 2 + raise, 0, Math.PI * 2);
    ctx.fill();
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
    limb(ctx, 0, H * 0.14, 0, -H * 0.5, 4.2, "#6d5638");
    // wrapped grip
    ctx.strokeStyle = "#4a3a26";
    ctx.lineWidth = 1.6;
    for (let wIdx = 0; wIdx < 3; wIdx++) {
      ctx.beginPath();
      ctx.moveTo(-2.4, H * 0.01 + wIdx * 3);
      ctx.lineTo(2.4, H * 0.01 + wIdx * 3 + 1.2);
      ctx.stroke();
    }
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
  frostwolf: { body: "#b8c9d8", shade: "#94a8ba", trim: "#8fa8b8" },
  icewisp: { body: "#9fd6e8", shade: "#7ab8d0", trim: "#d8f0f8" },
  rimetroll: { body: "#7ba0b8", shade: "#5f8298", trim: "#4a6a80" },
  snowhag: { body: "#a8b8c9", shade: "#8a9cb0", trim: "#e8f0f5" },
  rimeheart: { body: "#8fb8cc", shade: "#6f98ac", trim: "#dcedf5" },
  goblin: { body: "#6f9c44", shade: "#54793156", trim: "#3c5c24" },
  wolf: { body: "#5f5a70", shade: "#48445533", trim: "#3b3844" },
  archer: { body: "#8a7844", shade: "#6b5c3444", trim: "#4b431f" },
  brute: { body: "#8a6350", shade: "#6b4c3c44", trim: "#4a3526" },
  ogre: { body: "#75875a", shade: "#5a6a4444", trim: "#39442a" },
  shaman: { body: "#578a86", shade: "#3f6a6644", trim: "#2c4a48" },
  warlord: { body: "#9a5240", shade: "#743c2f44", trim: "#40201a" },
  bonecaller: { body: "#7a748c", shade: "#5c5870", trim: "#3f3b50" },
  shambler: { body: "#6a7a5a", shade: "#525f44", trim: "#3a4434" },
  stalker: { body: "#4a5a44", shade: "#38463447", trim: "#2c3830" },
  shieldbearer: { body: "#7a6a4a", shade: "#5c503844", trim: "#aab4c2" },
  harrier: { body: "#8a7a9c", shade: "#6a5e7c44", trim: "#d8cfc0" },
  drummer: { body: "#a05c3c", shade: "#7c462e44", trim: "#e8a05a" },
  warbanner: { body: "#9a2f28", shade: "#742420", trim: "#5a4a52" },
  wyrm: { body: "#8fb8cc", shade: "#6f98ac", trim: "#dcedf5" },
  brinecrawler: { body: "#587f78", shade: "#3e625e", trim: "#a9c6ac" },
  kelpbound: { body: "#496e59", shade: "#345243", trim: "#8ea36f" },
  saltwitch: { body: "#7ca1a0", shade: "#587b7c", trim: "#e2d6a5" },
  galeharrier: { body: "#70899a", shade: "#526b7b", trim: "#d6e4df" },
  bellkeeper: { body: "#526b70", shade: "#394f54", trim: "#b59458" },
  reefhound: { body: "#467b82", shade: "#315c63", trim: "#b2d2c7" },
  stormcaller: { body: "#506a8b", shade: "#394e6b", trim: "#b7e5df" },
  wreckgunner: { body: "#5e6868", shade: "#3e4a4c", trim: "#c68d55" },
  stormeel: { body: "#397884", shade: "#245661", trim: "#a9f2ff" },
  conchseer: { body: "#735f79", shade: "#51465a", trim: "#e0c79d" },
  bellwidow: { body: "#526e75", shade: "#385158", trim: "#d2ae67" },
  stormjaw: { body: "#315f69", shade: "#20464f", trim: "#9ed2c7" },
};

function drawWolf(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const { cx, f } = pose;
  const isAlpha = unit.enemyKind === "alpha";
  // airborne pounce: the body rises along a sine arc while the shadow stays grounded
  const leapK = unit.leap ? Math.min(1, unit.leap.t / unit.leap.dur) : 0;
  const leapLift = unit.leap ? Math.sin(leapK * Math.PI) * r * 2.4 : 0;
  const gy = pose.groundY - pose.bounce * 0.7 - leapLift;
  const colors = isAlpha
    ? { body: "#3f3a4d", trim: "#292534" }
    : unit.enemyKind === "frostwolf"
      ? ENEMY_COLORS.frostwolf
      : unit.enemyKind === "reefhound"
        ? ENEMY_COLORS.reefhound
        : ENEMY_COLORS.wolf;
  const stretchB = (isAlpha ? 1.18 : 1) * (unit.leap ? 1.22 : 1); // stretched out mid-flight
  drawShadow(ctx, unit, pose.bounce * 0.7 + leapLift);
  if (unit.leap) {
    // wind streaks trailing the leap
    ctx.strokeStyle = "rgba(220, 215, 240, 0.35)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let s = 0; s < 3; s++) {
      ctx.beginPath();
      ctx.moveTo(cx - f * r * (1.6 + s * 0.5), gy + r * (0.1 - s * 0.25));
      ctx.lineTo(cx - f * r * (0.7 + s * 0.3), gy + r * (0.1 - s * 0.25));
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
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
  shaded(ctx, wolfBody, colors.body, f, cx, bodyY, r * 0.9, 3);
  if (unit.enemyKind === "reefhound") {
    // Coral dorsal plates and a fin-tail keep it from reading as a recolored wolf.
    ctx.fillStyle = colors.trim; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      const sx = cx + f * i * r * 0.34;
      ctx.beginPath(); ctx.moveTo(sx - f * r * 0.16, bodyY - r * 0.48); ctx.lineTo(sx, bodyY - r * (0.95 - Math.abs(i) * 0.08)); ctx.lineTo(sx + f * r * 0.18, bodyY - r * 0.46); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // every wolf carries a little ruff at the neck (the Alpha's is grander)
  if (!isAlpha) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const mx = cx + f * r * (0.4 + i * 0.2);
      const my = bodyY - r * 0.52;
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + f * r * 0.08, my - r * 0.28);
      ctx.lineTo(mx + f * r * 0.2, my);
    }
    ctx.closePath();
    outlined(ctx, colors.trim, 1.8);
  }
  if (isAlpha) {
    const frenzied = unit.phase >= 3;
    // old wounds: pale claw scars raked across the flank
    ctx.strokeStyle = "#8a8298";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    for (let s = 0; s < 3; s++) {
      ctx.beginPath();
      ctx.moveTo(cx - f * r * (0.15 + s * 0.22), bodyY - r * 0.3);
      ctx.lineTo(cx - f * r * (0.32 + s * 0.22), bodyY + r * 0.28);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // heavy chest ruff — the shoulders of something that has never lost
    ctx.beginPath();
    ctx.moveTo(cx + f * r * 0.75, bodyY - r * 0.45);
    ctx.quadraticCurveTo(cx + f * r * 1.15, bodyY + r * 0.1, cx + f * r * 0.8, bodyY + r * 0.55);
    ctx.quadraticCurveTo(cx + f * r * 0.5, bodyY + r * 0.3, cx + f * r * 0.55, bodyY - r * 0.2);
    ctx.closePath();
    outlined(ctx, "#4c4560", 2.2);
    // towering hackles, frost-pale at the tips (blood-tinged in frenzy)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const mx = cx + f * r * (0.05 + i * 0.24);
      const my = bodyY - r * (0.52 + Math.sin(i * 1.3) * 0.06);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + f * r * 0.1, my - r * (0.62 - i * 0.06));
      ctx.lineTo(mx + f * r * 0.28, my);
    }
    ctx.closePath();
    outlined(ctx, "#524b63", 2);
    ctx.fillStyle = frenzied ? "#a85560" : "#8d84a8";
    for (let i = 0; i < 6; i++) {
      const mx = cx + f * r * (0.05 + i * 0.24);
      const my = bodyY - r * (0.52 + Math.sin(i * 1.3) * 0.06);
      ctx.beginPath();
      ctx.moveTo(mx + f * r * 0.04, my - r * (0.4 - i * 0.045));
      ctx.lineTo(mx + f * r * 0.1, my - r * (0.62 - i * 0.06));
      ctx.lineTo(mx + f * r * 0.17, my - r * (0.4 - i * 0.045));
      ctx.closePath();
      ctx.fill();
    }
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
  // ear — the Alpha's is torn from old challenges
  if (isAlpha) {
    ctx.beginPath();
    ctx.moveTo(hx - f * r * 0.1, hy - r * 0.4);
    ctx.lineTo(hx + f * r * 0.0, hy - r * 0.95);
    ctx.lineTo(hx + f * r * 0.1, hy - r * 0.62);
    ctx.lineTo(hx + f * r * 0.2, hy - r * 0.88);
    ctx.lineTo(hx + f * r * 0.38, hy - r * 0.35);
    ctx.closePath();
    outlined(ctx, colors.body, 2);
  } else {
    ctx.beginPath();
    ctx.moveTo(hx - f * r * 0.1, hy - r * 0.4);
    ctx.lineTo(hx + f * r * 0.12, hy - r * 0.95);
    ctx.lineTo(hx + f * r * 0.38, hy - r * 0.35);
    ctx.closePath();
    outlined(ctx, colors.body, 2);
  }
  if (isAlpha) {
    const frenzied = unit.phase >= 3;
    // bone-pale blaze down the snout
    ctx.strokeStyle = "#9a92ad";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx - f * r * 0.05, hy - r * 0.35);
    ctx.lineTo(hx + f * r * 0.75, hy + r * 0.05);
    ctx.stroke();
    ctx.lineCap = "butt";
    // a scar through the brow
    ctx.strokeStyle = "#8a8298";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx + f * r * 0.02, hy - r * 0.42);
    ctx.lineTo(hx + f * r * 0.3, hy + r * 0.12);
    ctx.stroke();
    // fangs bared even at rest
    ctx.fillStyle = "#efe8d4";
    for (const fx2 of [0.45, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(hx + f * r * fx2, hy + r * 0.3);
      ctx.lineTo(hx + f * r * (fx2 + 0.06), hy + r * 0.5);
      ctx.lineTo(hx + f * r * (fx2 + 0.12), hy + r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    // the eye burns — moon-violet, blood-red in frenzy
    const eyeColor = frenzied ? "#ff5a48" : "#c9b8ff";
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = 9;
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(hx + f * r * 0.15, hy - r * 0.08, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.fillRect(hx + f * r * 0.15, hy - r * 0.08 - 1, 1.2, 1.2);
    // cold breath in the night air
    const puff = ((time * 0.45 + unit.id * 0.37) % 1);
    if (puff < 0.4 && pose.swing <= 0.2) {
      const pk = puff / 0.4;
      ctx.globalAlpha = (1 - pk) * 0.4;
      ctx.fillStyle = "#d8d4ec";
      ctx.beginPath();
      ctx.ellipse(hx + f * r * (1.0 + pk * 0.5), hy + r * 0.18 - pk * 5, 3 + pk * 5, 2 + pk * 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    // eye
    ctx.fillStyle = "#ffd76b";
    ctx.beginPath();
    ctx.arc(hx + f * r * 0.15, hy - r * 0.08, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  flashOverlay(ctx, unit, cx, bodyY, r * 1.4);
  drawEffectPips(ctx, unit, cx, bodyY - r * 1.8);
  drawHealthBar(ctx, unit, bodyY - r * 1.7);
}

/** The same goblin dresses for the country it raids: cloth muddied in the
 *  marsh, soot-dark in the burn, cold slate at the pass. Bosses keep their look. */
const REGION_TRIM: Record<number, string> = { 2: "#566047", 3: "#463c34", 4: "#46536b", 5: "#5e3a44", 6: "#9ab4c4", 7: "#8aa8ba", 8: "#7ba4b8", 9: "#5a7a94", 10: "#98a8b4", 11: "#6a84a0" };

function regionalColors(kind: string): { body: string; shade: string; trim: string } {
  // Never let presentation data take down the simulation. New enemies receive
  // a readable neutral palette until their bespoke colors are added above.
  const base = ENEMY_COLORS[kind] ?? { body: "#6f7780", shade: "#4d555e", trim: "#c9d0d2" };
  const trim = REGION_TRIM[regionStage];
  if (!trim || kind === "warlord" || kind === "ogre" || kind === "rimeheart") return base;
  return { ...base, trim };
}

function drawIceWisp(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const r = unit.radius;
  const bob = Math.sin(time * 2.4 + unit.id) * 4;
  const y = unit.y - r * 1.6 + bob;
  // grounded shadow far below the hovering shard
  drawShadow(ctx, unit, 6);
  ctx.save();
  ctx.translate(unit.x, y);
  ctx.rotate(Math.sin(time * 1.3 + unit.id) * 0.15);
  ctx.shadowColor = "#9fd6e8";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.5);
  ctx.lineTo(r * 0.8, 0);
  ctx.lineTo(0, r * 1.3);
  ctx.lineTo(-r * 0.8, 0);
  ctx.closePath();
  outlined(ctx, "#9fd6e8", 2.2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#e8f8fc";
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.lineTo(r * 0.34, 0);
  ctx.lineTo(0, r * 0.6);
  ctx.lineTo(-r * 0.34, 0);
  ctx.closePath();
  ctx.fill();
  // cold motes orbiting
  for (let i = 0; i < 3; i++) {
    const a = time * 2 + (i / 3) * Math.PI * 2;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#d8f0f8";
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.9, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  flashOverlay(ctx, unit, unit.x, y, r * 1.3);
  drawEffectPips(ctx, unit, unit.x, y - r * 2.2);
  drawHealthBar(ctx, unit, y - r * 2);
}

/** Moor Harrier: all wing and grudge — circles aloft, folds to dive, sulks when grounded. */
function drawHarrier(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const colors = regionalColors(unit.enemyKind ?? "harrier");
  const aloft = !!unit.aloft || !!unit.leap;
  const lift = unit.leap ? 26 : aloft ? 32 + Math.sin(time * 2.1 + unit.id) * 4 : 0;
  const f = unit.facing;
  const cx = unit.x;
  const by = unit.y - 8 - lift;
  // shadow shrinks the higher it rides
  ctx.beginPath();
  ctx.ellipse(unit.x, unit.y + 2, unit.radius * (aloft ? 0.9 : 1.5), unit.radius * (aloft ? 0.3 : 0.5), 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(20, 14, 30, ${aloft ? 0.16 : 0.3})`;
  ctx.fill();
  // wings: broad triangles that beat aloft, fold when grounded
  const flap = aloft ? Math.sin(time * 9 + unit.id) * 10 : 2;
  for (const side of [-1, 1]) {
    const wing = new Path2D();
    wing.moveTo(cx + side * 4, by - 4);
    wing.quadraticCurveTo(cx + side * (aloft ? 26 : 12), by - (aloft ? 14 + flap * side * f * 0.4 : 2) - flap * 0.4, cx + side * (aloft ? 34 : 14), by + (aloft ? -6 - flap : 6));
    wing.quadraticCurveTo(cx + side * (aloft ? 20 : 10), by + (aloft ? 2 : 8), cx + side * 3, by + 5);
    wing.closePath();
    shaded(ctx, wing, colors.trim, f, cx + side * 16, by - 4, 18, 2.2);
  }
  // body: a lean feathered spindle
  const body = new Path2D();
  body.ellipse(cx, by, 10, 13, 0, 0, Math.PI * 2);
  shaded(ctx, body, colors.body, f, cx, by, 12, 2.6);
  // tail feathers trail against the flight
  ctx.beginPath();
  ctx.moveTo(cx - f * 6, by + 8);
  ctx.lineTo(cx - f * 15, by + 15);
  ctx.lineTo(cx - f * 8, by + 11);
  ctx.closePath();
  outlined(ctx, colors.trim, 1.8);
  // head + hooked beak
  ctx.beginPath();
  ctx.arc(cx + f * 6, by - 10, 5.5, 0, Math.PI * 2);
  outlined(ctx, colors.body, 2);
  ctx.beginPath();
  ctx.moveTo(cx + f * 10.5, by - 11);
  ctx.quadraticCurveTo(cx + f * 15, by - 10, cx + f * 12, by - 6.5);
  ctx.lineTo(cx + f * 9.5, by - 8);
  ctx.closePath();
  outlined(ctx, "#e8c25a", 1.6);
  // one keen eye
  ctx.fillStyle = "#241d2e";
  ctx.beginPath();
  ctx.arc(cx + f * 6.5, by - 11, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // talons when grounded
  if (!aloft) {
    ctx.strokeStyle = "#e8c25a";
    ctx.lineWidth = 2;
    for (const side of [-4, 4]) {
      ctx.beginPath();
      ctx.moveTo(cx + side, by + 12);
      ctx.lineTo(cx + side, unit.y - 1);
      ctx.stroke();
    }
  }
  // Flying enemies still need the same combat read as grounded foes. Anchor
  // their chrome to the airborne body so the bar follows dives and landings.
  const barTop = by - (aloft ? 34 : 25);
  flashOverlay(ctx, unit, cx, by, unit.radius * 1.45);
  drawEffectPips(ctx, unit, cx, barTop - 6);
  drawHealthBar(ctx, unit, barTop);
}

/** Stormbreak's shield-beast: a reef crab, broad and low rather than another ogre. */
function drawBrinecrawler(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const c = regionalColors("brinecrawler");
  const r = unit.radius;
  const f = unit.facing;
  const bob = Math.sin(time * 5 + unit.id) * 1.5;
  const x = unit.x, y = unit.y - r * 0.55 + bob;
  drawShadow(ctx, unit, 0);
  ctx.strokeStyle = c.shade; ctx.lineWidth = 5; ctx.lineCap = "round";
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const oy = (i - 1) * r * 0.35;
    ctx.beginPath(); ctx.moveTo(x + s * r * 0.55, y + oy); ctx.lineTo(x + s * r * (1.05 + i * 0.08), y + oy + r * 0.38); ctx.lineTo(x + s * r * 1.35, unit.y + 1); ctx.stroke();
  }
  const shell = new Path2D(); shell.ellipse(x, y, r * 1.05, r * 0.72, 0, 0, Math.PI * 2);
  shaded(ctx, shell, c.body, f, x, y, r, 3);
  ctx.strokeStyle = c.trim; ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.3, y - r * 0.55); ctx.lineTo(x + i * r * 0.2, y + r * 0.48); ctx.stroke(); }
  // One huge forward claw explains its frontal protection at a glance.
  const clawX = x + f * r * 1.15;
  ctx.beginPath(); ctx.ellipse(clawX, y - r * 0.08, r * 0.58, r * 0.48, f * 0.25, 0, Math.PI * 2); outlined(ctx, c.trim, 2.5);
  ctx.beginPath(); ctx.moveTo(clawX + f * r * 0.2, y - r * 0.1); ctx.lineTo(clawX + f * r * 0.72, y - r * 0.52); ctx.lineTo(clawX + f * r * 0.48, y + r * 0.05); ctx.closePath(); outlined(ctx, c.trim, 2);
  ctx.fillStyle = "#d9f3df";
  for (const ey of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(x + f * r * 0.72, y + ey * r, 2.3, 0, Math.PI * 2); ctx.fill(); }
  flashOverlay(ctx, unit, x, y, r * 1.2); drawEffectPips(ctx, unit, x, y - r); drawHealthBar(ctx, unit, y - r * 1.15);
  ctx.lineCap = "butt";
}

/** A drowned suit held upright by living weed: narrow, trailing, unmistakably coastal. */
function drawKelpbound(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const c = regionalColors("kelpbound");
  const r = unit.radius, f = unit.facing;
  const x = unit.x, gy = unit.y;
  const sway = Math.sin(time * 2.2 + unit.id) * 5;
  drawShadow(ctx, unit, 0);
  ctx.strokeStyle = c.trim; ctx.lineWidth = 4; ctx.lineCap = "round";
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 4, gy - r * 0.8); ctx.quadraticCurveTo(x + sway + i * 7, gy - r * 2, x + i * 5 - sway * 0.4, gy - r * (2.8 + Math.abs(i) * 0.12)); ctx.stroke(); }
  ctx.fillStyle = c.shade; roundRect(ctx, x - r * 0.6, gy - r * 2.25, r * 1.2, r * 1.55, 5); ctx.fill();
  ctx.strokeStyle = "#9bb0a1"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + f * 2, gy - r * 2.45, r * 0.52, 0, Math.PI * 2); outlined(ctx, c.body, 2.3);
  ctx.fillStyle = "#9fe0bd"; ctx.beginPath(); ctx.arc(x + f * r * 0.22, gy - r * 2.48, 2.2, 0, Math.PI * 2); ctx.fill();
  // Hooked kelp tether carried like a drowned boat-hook.
  ctx.strokeStyle = "#6d7250"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + f * r * 0.45, gy - r * 1.7); ctx.lineTo(x + f * r * 1.35, gy - r * 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + f * r * 1.25, gy - r * 3, r * 0.28, -0.8, 1.2); ctx.stroke();
  flashOverlay(ctx, unit, x, gy - r * 1.6, r); drawEffectPips(ctx, unit, x, gy - r * 3.2); drawHealthBar(ctx, unit, gy - r * 3.1);
  ctx.lineCap = "butt";
}

/** Wreck Gunner: the weapon is the silhouette — a barnacled deck cannon with
 *  its drowned crewman chained behind it. */
function drawWreckGunner(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const c = ENEMY_COLORS.wreckgunner;
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.45;
  const f = pose.f;
  const recoil = pose.swing * r * 0.28;
  drawShadow(ctx, unit, pose.bounce * 0.45);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);
  ctx.fillStyle = "#60452f";
  roundRect(ctx, -r * 0.74, -r * 0.55, r * 1.48, r * 0.42, 4);
  outlined(ctx, "#60452f", 2.2);
  for (const wx of [-0.48, 0.48]) {
    ctx.beginPath();
    ctx.arc(r * wx, -r * 0.08, r * 0.36, 0, Math.PI * 2);
    outlined(ctx, "#714e32", 2.4);
    ctx.strokeStyle = "#b68a58";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(r * wx, -r * 0.08);
      ctx.lineTo(r * wx + Math.cos(a) * r * 0.3, -r * 0.08 + Math.sin(a) * r * 0.3);
      ctx.stroke();
    }
  }

  // Barrel points well beyond the crewman and kicks backward on attack.
  ctx.save();
  ctx.translate(-recoil, -r * 0.58);
  ctx.rotate(-0.1 - pose.swing * 0.08);
  const barrel = new Path2D();
  barrel.moveTo(-r * 0.48, -r * 0.2);
  barrel.lineTo(r * 1.18, -r * 0.3);
  barrel.lineTo(r * 1.35, r * 0.06);
  barrel.lineTo(-r * 0.45, r * 0.2);
  barrel.closePath();
  shaded(ctx, barrel, "#4b5353", 1, r * 0.35, 0, r, 2.6);
  ctx.beginPath();
  ctx.ellipse(r * 1.3, -r * 0.11, r * 0.22, r * 0.27, 0, 0, Math.PI * 2);
  outlined(ctx, "#242d30", 2.2);
  ctx.fillStyle = "#171d20";
  ctx.beginPath();
  ctx.ellipse(r * 1.32, -r * 0.11, r * 0.12, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b8aa83";
  for (const [bx, by, br] of [[0.1, -0.22, 0.08], [0.45, 0.08, 0.06], [0.82, -0.2, 0.07]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(r * bx, r * by, r * br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Hunched drowned artilleryman — small beside the gun, visibly chained to it.
  const hx = -r * 0.55;
  const hy = -r * 1.22;
  const body = new Path2D();
  body.moveTo(-r * 0.94, -r * 0.38);
  body.lineTo(-r * 0.88, -r * 1.1);
  body.quadraticCurveTo(-r * 0.45, -r * 1.36, -r * 0.14, -r * 0.78);
  body.lineTo(-r * 0.2, -r * 0.38);
  body.closePath();
  shaded(ctx, body, c.body, 1, -r * 0.5, -r * 0.75, r * 0.52, 2.4);
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.31, 0, Math.PI * 2);
  outlined(ctx, "#738080", 2);
  ctx.beginPath();
  ctx.arc(hx - r * 0.04, hy - r * 0.1, r * 0.34, Math.PI, Math.PI * 2);
  ctx.closePath();
  outlined(ctx, "#3e4a4c", 1.8);
  ctx.fillStyle = "#a9e5d6";
  ctx.beginPath();
  ctx.arc(hx + r * 0.12, hy, 2, 0, Math.PI * 2);
  ctx.fill();
  limb(ctx, -r * 0.22, -r * 0.88, r * 0.2, -r * (0.62 + pose.swing * 0.16), r * 0.17, c.body);
  ctx.strokeStyle = "#c68d55";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let link = 0; link < 5; link++) {
    const lx = -r * 0.56 + link * r * 0.18;
    const ly = -r * 0.56 + Math.sin(link) * 2;
    ctx.ellipse(lx, ly, 3.2, 2, link % 2 ? Math.PI / 2 : 0, 0, Math.PI * 2);
  }
  ctx.stroke();

  if (unit.castGlow > 0) {
    ctx.globalAlpha = Math.min(0.85, unit.castGlow);
    ctx.fillStyle = "#ffb25f";
    ctx.shadowColor = "#ff8a48";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(r * 1.5, -r * 0.78);
    ctx.lineTo(r * 2.0, -r * 0.62);
    ctx.lineTo(r * 1.5, -r * 0.43);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - r * 0.75, r * 1.25);
  drawEffectPips(ctx, unit, x, gy - r * 1.88);
  drawHealthBar(ctx, unit, gy - r * 1.76);
}

/** Storm Eel: a single long electric stroke with a hammer-shaped head. */
function drawStormEel(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const c = ENEMY_COLORS.stormeel;
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.35;
  const f = pose.f;
  const wriggle = Math.sin(time * 8 + unit.id) * r * 0.22;
  drawShadow(ctx, unit, pose.bounce * 0.35);

  ctx.save();
  ctx.translate(x, gy - r * 0.48);
  ctx.scale(f, 1);
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.72;
  ctx.beginPath();
  ctx.moveTo(-r * 1.75, wriggle * 0.15);
  ctx.bezierCurveTo(-r * 1.15, -r * 0.62 + wriggle, -r * 0.42, r * 0.5 - wriggle, r * 0.5, 0);
  ctx.stroke();
  ctx.strokeStyle = c.body;
  ctx.lineWidth = r * 0.52;
  ctx.stroke();
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = r * 0.1;
  ctx.globalAlpha = 0.75;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = "butt";

  const hx = r * (0.68 + pose.swing * 0.12);
  const hy = pose.swing * r * 0.15;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.68, r * 0.5, -0.08, 0, Math.PI * 2);
  outlined(ctx, c.body, 2.2);
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.15, hy - r * 0.3);
  ctx.lineTo(hx + r * 0.78, hy - r * 0.2);
  ctx.lineTo(hx + r * 0.9, hy + r * 0.08);
  ctx.lineTo(hx + r * 0.2, hy + r * 0.12);
  ctx.closePath();
  outlined(ctx, "#4f929a", 1.8);
  ctx.fillStyle = "#eafcff";
  for (const ox of [0.28, 0.5, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(hx + r * ox, hy + r * 0.08);
    ctx.lineTo(hx + r * (ox + 0.06), hy + r * 0.26);
    ctx.lineTo(hx + r * (ox + 0.12), hy + r * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = c.trim;
  ctx.shadowBlur = 8;
  ctx.fillStyle = c.trim;
  ctx.beginPath();
  ctx.arc(hx + r * 0.28, hy - r * 0.08, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Two dorsal arcs advertise the chain-shock behavior before it bites.
  ctx.globalAlpha = 0.5 + Math.abs(Math.sin(time * 10 + unit.id)) * 0.35;
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 1.7;
  for (const ox of [-0.9, -0.25]) {
    ctx.beginPath();
    ctx.moveTo(r * ox, -r * 0.28);
    ctx.lineTo(r * (ox + 0.16), -r * 0.62);
    ctx.lineTo(r * (ox + 0.3), -r * 0.24);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - r * 0.45, r * 1.15);
  drawEffectPips(ctx, unit, x, gy - r * 1.35);
  drawHealthBar(ctx, unit, gy - r * 1.22);
}

/** Conch Seer: an enormous spiral shell carries the silhouette; the oracle is
 *  only a small, soft creature peering from beneath it. */
function drawConchSeer(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const c = ENEMY_COLORS.conchseer;
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.25;
  const f = pose.f;
  const shellPulse = unit.castGlow > 0 ? 1 + unit.castGlow * 0.1 : 1;
  drawShadow(ctx, unit, pose.bounce * 0.25);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);
  const foot = new Path2D();
  foot.moveTo(-r * 0.95, -r * 0.14);
  foot.quadraticCurveTo(-r * 0.1, -r * 0.55, r * 0.92, -r * 0.18);
  foot.quadraticCurveTo(r * 1.08, r * 0.02, r * 0.65, r * 0.08);
  foot.lineTo(-r * 0.92, r * 0.05);
  foot.closePath();
  shaded(ctx, foot, c.body, 1, 0, -r * 0.18, r, 2.2);

  // Pearlescent conch consumes most of the sprite and carries a clear spiral.
  ctx.save();
  ctx.translate(-r * 0.22, -r * 0.82);
  ctx.scale(shellPulse, shellPulse);
  ctx.shadowColor = unit.castGlow > 0 ? "#f3dfbd" : "transparent";
  ctx.shadowBlur = unit.castGlow > 0 ? 12 : 0;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  outlined(ctx, c.trim, 2.6);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#9b7f83";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const a = i * 0.48;
    const sr = r * (0.08 + i * 0.024);
    const sx = Math.cos(a) * sr;
    const sy = Math.sin(a) * sr;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.48, -r * 0.48);
  ctx.lineTo(r * 1.0, -r * 0.72);
  ctx.lineTo(r * 0.82, -r * 0.22);
  ctx.lineTo(r * 1.12, r * 0.08);
  ctx.lineTo(r * 0.52, r * 0.32);
  ctx.closePath();
  outlined(ctx, "#dbc299", 2);
  ctx.restore();

  // Small head and eye stalks beneath the shell lip.
  const hx = r * 0.62;
  const hy = -r * 0.45;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.42, r * 0.34, -0.1, 0, Math.PI * 2);
  outlined(ctx, c.body, 2);
  ctx.strokeStyle = c.body;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  for (const [ox, lift] of [[0.15, 0.7], [0.52, 0.78]] as [number, number][]) {
    const eyeY = hy - r * lift + Math.sin(time * 2.5 + ox) * 2;
    ctx.beginPath();
    ctx.moveTo(hx + r * ox * 0.35, hy - r * 0.12);
    ctx.lineTo(hx + r * ox, eyeY);
    ctx.stroke();
    ctx.fillStyle = "#b9f2ec";
    ctx.beginPath();
    ctx.arc(hx + r * ox, eyeY, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "butt";
  // Tiny shell horn held forward while warding.
  ctx.strokeStyle = "#e0c79d";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(hx + r * 0.15, hy + r * 0.15);
  ctx.quadraticCurveTo(hx + r * 0.75, hy - r * (0.12 + unit.castGlow * 0.16), hx + r * 0.94, hy + r * 0.06);
  ctx.stroke();
  if (unit.castGlow > 0) {
    ctx.globalAlpha = Math.min(0.72, unit.castGlow);
    ctx.strokeStyle = "#f4dfbd";
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.75, r * (1.05 + ring * 0.28), r * (0.78 + ring * 0.18), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - r * 0.72, r * 1.05);
  drawEffectPips(ctx, unit, x, gy - r * 2.0);
  drawHealthBar(ctx, unit, gy - r * 1.86);
}

/** THE WINTER WYRM — a serpent of old ice wearing the mountain like a shell. */
function drawWyrm(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const trail = unit.trail ?? [];
  const f = unit.facing;
  if (unit.submerged) {
    // only a moving darkness and a fin ridge cutting the snow
    ctx.beginPath();
    ctx.ellipse(unit.x, unit.y, unit.radius * 2.6, unit.radius * 1.0, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 48, 70, 0.32)";
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const p = trail[i * 3];
      if (!p) break;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, unit.y + 2);
      ctx.lineTo(p.x, unit.y - 10 - Math.sin(time * 6 + i) * 3);
      ctx.lineTo(p.x + 6, unit.y + 2);
      ctx.closePath();
      outlined(ctx, "#9fc4d8", 1.6);
    }
    // frost spray in its wake
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#dcedf5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(unit.x - f * 20, unit.y + 6);
    ctx.quadraticCurveTo(unit.x - f * 46, unit.y + 2 + Math.sin(time * 8) * 3, unit.x - f * 66, unit.y + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawEffectPips(ctx, unit, unit.x, unit.y - unit.radius * 2.6);
    drawHealthBar(ctx, unit, unit.y - unit.radius * 2.35);
    return;
  }
  const bared = unit.effects.some((e) => e.kind === "vulnerable");
  // body: tapering plated segments following the head
  const segs = 11;
  for (let i = segs - 1; i >= 0; i--) {
    const p = trail[Math.min(trail.length - 1, i * 2 + 2)] ?? { x: unit.x - f * (i + 1) * 14, y: unit.y };
    const r = unit.radius * (0.92 - i * 0.065);
    const sway = Math.sin(time * 2.2 + i * 0.7) * 2;
    const py = p.y - 14 + sway;
    // segment shadow
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 4, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 14, 30, 0.22)";
    ctx.fill();
    const seg = new Path2D();
    seg.ellipse(p.x, py, r, r * 0.85, sway * 0.02, 0, Math.PI * 2);
    shaded(ctx, seg, i % 2 === 0 ? "#8fb8cc" : "#7ba8be", 1, p.x, py, r, 2.4);
    // dorsal ice-fin on every other segment
    if (i % 2 === 1 && i < 8) {
      ctx.beginPath();
      ctx.moveTo(p.x - 4, py - r * 0.7);
      ctx.lineTo(p.x + 1, py - r * 0.7 - r * 0.9);
      ctx.lineTo(p.x + 6, py - r * 0.7);
      ctx.closePath();
      outlined(ctx, "#dcedf5", 1.8);
    }
    // THE HEART rides the second segment — dim in armor, blazing when bared
    if (i === 2) {
      const pulse = bared ? 0.75 + Math.abs(Math.sin(time * 7)) * 0.25 : 0.3 + Math.abs(Math.sin(time * 2)) * 0.15;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = bared ? "#ffe9a3" : "#9fd6e8";
      ctx.shadowBlur = bared ? 18 : 8;
      ctx.beginPath();
      ctx.arc(p.x, py + r * 0.15, r * (bared ? 0.5 : 0.34), 0, Math.PI * 2);
      ctx.fillStyle = bared ? "#ffd76b" : "#9fd6e8";
      ctx.fill();
      ctx.restore();
    }
  }
  // head: an angular skull of old ice under a broken crown
  const hx = unit.x;
  const hy = unit.y - 16 + Math.sin(time * 2.2) * 2;
  const hr = unit.radius;
  const skull = new Path2D();
  skull.moveTo(hx + f * hr * 1.5, hy + hr * 0.1);
  skull.lineTo(hx + f * hr * 0.6, hy - hr * 0.75);
  skull.lineTo(hx - f * hr * 0.7, hy - hr * 0.65);
  skull.lineTo(hx - f * hr * 0.95, hy + hr * 0.3);
  skull.lineTo(hx - f * hr * 0.3, hy + hr * 0.75);
  skull.lineTo(hx + f * hr * 0.9, hy + hr * 0.6);
  skull.closePath();
  shaded(ctx, skull, "#a5c8da", f, hx, hy, hr * 1.2, 2.8);
  // the jaw, slightly parted — winter breathes
  ctx.beginPath();
  ctx.moveTo(hx + f * hr * 1.45, hy + hr * 0.35);
  ctx.lineTo(hx + f * hr * 0.5, hy + hr * 0.72);
  ctx.lineTo(hx - f * hr * 0.2, hy + hr * 0.7);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#efe8d4";
  for (const tx of [1.25, 0.95, 0.65]) {
    ctx.beginPath();
    ctx.moveTo(hx + f * hr * tx, hy + hr * 0.42);
    ctx.lineTo(hx + f * hr * (tx - 0.08), hy + hr * 0.62);
    ctx.lineTo(hx + f * hr * (tx - 0.18), hy + hr * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  // horn crown: the old king's shape, grown from the skull
  for (const [ox, len, tilt] of [[-0.55, 1.15, -0.5], [-0.15, 1.45, -0.15], [0.25, 1.1, 0.25]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(hx + f * hr * ox, hy - hr * 0.6);
    ctx.quadraticCurveTo(hx + f * hr * (ox + tilt), hy - hr * (0.6 + len * 0.7), hx + f * hr * (ox + tilt * 1.4), hy - hr * (0.6 + len));
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#dcedf5";
    ctx.stroke();
  }
  // one eye of cold light
  ctx.save();
  ctx.shadowColor = bared ? "#ffd76b" : "#9fd6e8";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(hx + f * hr * 0.55, hy - hr * 0.15, hr * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = bared ? "#ffd76b" : "#b8ecff";
  ctx.fill();
  ctx.restore();
  // breath vapor curling from the jaw
  ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 1.7)) * 0.2;
  ctx.strokeStyle = "#dcedf5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx + f * hr * 1.5, hy + hr * 0.25);
  ctx.quadraticCurveTo(hx + f * hr * 2.0, hy + hr * 0.1 + Math.sin(time * 3) * 4, hx + f * hr * 2.4, hy - hr * 0.2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  flashOverlay(ctx, unit, hx, hy, hr * 1.45);
  drawEffectPips(ctx, unit, hx, hy - hr * 2.2);
  drawHealthBar(ctx, unit, hy - hr * 2.05);
}

/** MOSSTOOTH — a walking deadfall. The uprooted pine, sagging belly, and
 *  lopsided moss mantle keep him legible beside ordinary brutes. */
function drawMosstooth(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.55;
  const f = pose.f;
  const h = r * 3.15;
  drawShadow(ctx, unit, pose.bounce * 0.55);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);

  // A whole dead pine serves as a club; its branch stubs make a strong outline.
  const logAngle = -0.62 + pose.swing * 1.15;
  ctx.save();
  ctx.translate(-r * 0.25, -h * 0.54);
  ctx.rotate(logAngle);
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, r * 0.75);
  ctx.lineTo(r * 0.1, -h * 0.66);
  ctx.stroke();
  ctx.strokeStyle = "#68513a";
  ctx.lineWidth = r * 0.3;
  ctx.stroke();
  ctx.strokeStyle = "#39442a";
  ctx.lineWidth = r * 0.1;
  for (const [by, side, len] of [[-0.12, -1, 0.45], [-0.35, 1, 0.55], [-0.55, -1, 0.34]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(0, h * by);
    ctx.lineTo(side * r * len, h * by - r * 0.2);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.restore();

  // Stump-like feet and low, dragging legs.
  limb(ctx, -r * 0.38, -h * 0.28, -r * (0.48 + pose.walk * 0.3), -2, r * 0.42, "#39442a");
  limb(ctx, r * 0.28, -h * 0.27, r * (0.4 + pose.walk * 0.28), -2, r * 0.46, "#75875a");

  const body = new Path2D();
  body.moveTo(-r * 1.08, -h * 0.56);
  body.quadraticCurveTo(-r * 1.28, -h * 0.35, -r * 0.82, -h * 0.08);
  body.quadraticCurveTo(0, h * 0.08, r * 0.92, -h * 0.07);
  body.quadraticCurveTo(r * 1.22, -h * 0.38, r * 0.74, -h * 0.64);
  body.quadraticCurveTo(-r * 0.12, -h * 0.8, -r * 1.08, -h * 0.56);
  body.closePath();
  shaded(ctx, body, "#75875a", 1, 0, -h * 0.35, r * 1.2, 3.2);

  // Hanging belly and navel sell mass without another armor silhouette.
  ctx.beginPath();
  ctx.ellipse(r * 0.15, -h * 0.25, r * 0.67, r * 0.74, -0.08, 0, Math.PI * 2);
  outlined(ctx, "#87996a", 2.4);
  ctx.strokeStyle = "rgba(20,14,30,0.32)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(r * 0.15, -h * 0.12, 3, 0, Math.PI);
  ctx.stroke();

  // Long free arm and root-knuckle.
  const handX = r * (0.98 + pose.swing * 0.18);
  const handY = -h * (0.24 + pose.swing * 0.18);
  limb(ctx, r * 0.72, -h * 0.55, handX, handY, r * 0.38, "#75875a");
  ctx.beginPath();
  ctx.arc(handX, handY, r * 0.3, 0, Math.PI * 2);
  outlined(ctx, "#65774d", 2.2);

  // Moss mantle with dangling roots, deliberately asymmetrical.
  ctx.fillStyle = "#476337";
  ctx.beginPath();
  ctx.moveTo(-r * 1.02, -h * 0.6);
  ctx.quadraticCurveTo(-r * 0.45, -h * 0.85, r * 0.7, -h * 0.64);
  ctx.lineTo(r * 0.55, -h * 0.49);
  ctx.lineTo(r * 0.18, -h * 0.57);
  ctx.lineTo(-r * 0.15, -h * 0.42);
  ctx.lineTo(-r * 0.55, -h * 0.53);
  ctx.lineTo(-r * 0.83, -h * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "#567641";
  ctx.lineWidth = 2.2;
  for (const ox of [-0.72, -0.38, 0.1, 0.46]) {
    ctx.beginPath();
    ctx.moveTo(r * ox, -h * 0.56);
    ctx.quadraticCurveTo(r * (ox + 0.16), -h * 0.42 + Math.sin(time * 1.7 + ox) * 2, r * (ox + 0.05), -h * 0.31);
    ctx.stroke();
  }

  // Small, sleepy head sunk between the shoulders; only one horn survived.
  const hx = r * 0.2;
  const hy = -h * 0.68;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.55, r * 0.48, 0.08, 0, Math.PI * 2);
  outlined(ctx, "#75875a", 2.6);
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.35, hy - r * 0.28);
  ctx.quadraticCurveTo(hx - r * 0.92, hy - r * 0.92, hx - r * 0.58, hy - r * 1.2);
  ctx.lineTo(hx - r * 0.2, hy - r * 0.42);
  ctx.closePath();
  outlined(ctx, "#e5ddc8", 1.8);
  ctx.fillStyle = "#efe8d4";
  for (const ox of [0.28, 0.58]) {
    ctx.beginPath();
    ctx.moveTo(hx + r * ox, hy + r * 0.18);
    ctx.lineTo(hx + r * (ox + 0.1), hy + r * 0.55);
    ctx.lineTo(hx + r * (ox + 0.2), hy + r * 0.16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.18, hy - r * 0.05);
  ctx.lineTo(hx + r * 0.62, hy + r * 0.02);
  ctx.stroke();
  ctx.fillStyle = "#e7ddbf";
  for (const ox of [0.06, 0.47]) {
    ctx.beginPath();
    ctx.arc(hx + r * ox, hy + r * 0.02, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // After enraging, the stolen cart wheel remains hooked over his shoulder.
  if (unit.phase >= 1) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(-r * 0.62, -h * 0.58, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#8a6745";
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, -h * 0.58);
      ctx.lineTo(-r * 0.62 + Math.cos(a) * r * 0.46, -h * 0.58 + Math.sin(a) * r * 0.46);
      ctx.stroke();
    }
  }
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - h * 0.42, r * 1.35);
  drawEffectPips(ctx, unit, x, gy - h - 16);
  drawHealthBar(ctx, unit, gy - h - 11);
}

/** GOREHULK — iron geometry against Mosstooth's organic bulk: tower shield,
 *  cleaver-axe, horned helm, and a banner-split cloak. */
function drawGorehulk(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.4;
  const h = r * 3.12;
  const f = pose.f;
  drawShadow(ctx, unit, pose.bounce * 0.4);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);

  // Torn command cloak creates a forked, banner-like rear silhouette.
  const flap = Math.sin(time * 4 + unit.id) * r * 0.08;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -h * 0.72);
  ctx.lineTo(-r * 1.08 - flap, -h * 0.24);
  ctx.lineTo(-r * 0.75 - flap, -h * 0.31);
  ctx.lineTo(-r * 0.9 - flap, -h * 0.05);
  ctx.lineTo(-r * 0.22, -h * 0.25);
  ctx.closePath();
  outlined(ctx, "#762e28", 2.4);

  // Armored legs are deliberately columnar and upright.
  limb(ctx, -r * 0.3, -h * 0.28, -r * (0.34 + pose.walk * 0.25), -2, r * 0.42, "#403a42");
  limb(ctx, r * 0.3, -h * 0.28, r * (0.36 + pose.walk * 0.25), -2, r * 0.42, "#5a4a52");
  ctx.fillStyle = "#343038";
  roundRect(ctx, -r * 0.72, -r * 0.18, r * 0.72, r * 0.24, 3);
  ctx.fill();
  roundRect(ctx, r * 0.03, -r * 0.18, r * 0.72, r * 0.24, 3);
  ctx.fill();

  const cuirass = new Path2D();
  cuirass.moveTo(-r * 0.86, -h * 0.69);
  cuirass.lineTo(r * 0.78, -h * 0.69);
  cuirass.lineTo(r * 0.64, -h * 0.26);
  cuirass.lineTo(0, -h * 0.16);
  cuirass.lineTo(-r * 0.68, -h * 0.28);
  cuirass.closePath();
  shaded(ctx, cuirass, "#5a4a52", 1, 0, -h * 0.48, r, 3.2);
  ctx.strokeStyle = "#9a7770";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.65);
  ctx.lineTo(0, -h * 0.24);
  ctx.moveTo(-r * 0.62, -h * 0.5);
  ctx.lineTo(r * 0.58, -h * 0.5);
  ctx.stroke();

  // Three-tier pauldrons make the shoulders wider than any other humanoid.
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier++) {
      ctx.beginPath();
      ctx.ellipse(side * r * (0.75 + tier * 0.06), -h * (0.69 + tier * 0.035), r * (0.43 - tier * 0.06), r * (0.22 - tier * 0.025), side * 0.15, 0, Math.PI * 2);
      outlined(ctx, tier === 0 ? "#6c5962" : "#51464f", 2);
    }
  }

  // Shieldwall: a literal iron wall carried forward of the body.
  const shieldX = r * 0.86;
  const shieldTop = -h * 0.66;
  ctx.beginPath();
  ctx.moveTo(shieldX - r * 0.2, shieldTop);
  ctx.lineTo(shieldX + r * 0.58, shieldTop + r * 0.08);
  ctx.lineTo(shieldX + r * 0.54, -h * 0.12);
  ctx.lineTo(shieldX + r * 0.08, -h * 0.03);
  ctx.lineTo(shieldX - r * 0.22, -h * 0.14);
  ctx.closePath();
  outlined(ctx, "#48434a", 3);
  ctx.strokeStyle = "#a2776e";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(shieldX + r * 0.13, shieldTop + r * 0.14);
  ctx.lineTo(shieldX + r * 0.15, -h * 0.15);
  ctx.moveTo(shieldX + r * 0.38, shieldTop + r * 0.16);
  ctx.lineTo(shieldX + r * 0.38, -h * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(shieldX + r * 0.2, -h * 0.39, r * 0.16, 0, Math.PI * 2);
  outlined(ctx, "#8c655f", 1.8);

  // The executioner's axe tracks the huge sweep windup.
  const axeAngle = -1.05 + pose.swing * 1.75;
  const handX = -r * 0.74;
  const handY = -h * 0.55;
  limb(ctx, -r * 0.58, -h * 0.62, handX, handY, r * 0.3, "#9a5240");
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(axeAngle);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.35);
  ctx.lineTo(0, -h * 0.64);
  ctx.stroke();
  ctx.strokeStyle = "#72523b";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, -h * 0.6);
  ctx.quadraticCurveTo(r * 0.72, -h * 0.67, r * 0.82, -h * 0.38);
  ctx.lineTo(r * 0.12, -h * 0.31);
  ctx.closePath();
  outlined(ctx, "#a7a1a0", 2.4);
  ctx.restore();

  // Horned execution helm and glowing slit.
  const hx = -r * 0.02;
  const hy = -h * 0.78;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.47, Math.PI, Math.PI * 2);
  ctx.lineTo(hx + r * 0.42, hy + r * 0.45);
  ctx.lineTo(hx - r * 0.42, hy + r * 0.45);
  ctx.closePath();
  outlined(ctx, "#4b444d", 2.6);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + side * r * 0.34, hy - r * 0.24);
    ctx.lineTo(hx + side * r * 0.88, hy - r * 0.72);
    ctx.lineTo(hx + side * r * 0.5, hy - r * 0.08);
    ctx.closePath();
    outlined(ctx, "#d9d0c0", 1.8);
  }
  ctx.shadowColor = "#ffd76b";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffd76b";
  ctx.fillRect(hx - r * 0.25, hy + r * 0.03, r * 0.5, 3);
  ctx.shadowBlur = 0;
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - h * 0.48, r * 1.3);
  drawEffectPips(ctx, unit, x, gy - h - 17);
  drawHealthBar(ctx, unit, gy - h - 12);
}

/** RIMEHEART — a crown moving inside a glacier. Long ape-like arms, mountain
 *  shoulders, and a visible heart distinguish him from the smaller Rimeclad. */
function drawRimeheartBoss(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.3;
  const h = r * 3.05;
  const f = pose.f;
  const shattered = unit.phase >= 3;
  drawShadow(ctx, unit, pose.bounce * 0.3);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);

  // Rear glacier peaks make the body a mountain rather than another ogre.
  ctx.fillStyle = shattered ? "#6f98ac" : "#b9d9e6";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  for (const [ox, top, wide] of [[-0.64, -1.04, 0.48], [0.02, -1.24, 0.56], [0.65, -0.96, 0.43]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(r * (ox - wide), -h * 0.52);
    ctx.lineTo(r * ox, h * top);
    ctx.lineTo(r * (ox + wide), -h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Feet and enormous knuckle-dragging arms establish an ape-like body plan.
  limb(ctx, -r * 0.4, -h * 0.25, -r * (0.48 + pose.walk * 0.22), -2, r * 0.46, "#557f96");
  limb(ctx, r * 0.36, -h * 0.25, r * (0.46 + pose.walk * 0.22), -2, r * 0.46, "#6f98ac");

  const torso = new Path2D();
  torso.moveTo(-r * 1.12, -h * 0.68);
  torso.quadraticCurveTo(0, -h * 0.94, r * 1.15, -h * 0.66);
  torso.lineTo(r * 0.68, -h * 0.24);
  torso.quadraticCurveTo(0, -h * 0.08, -r * 0.68, -h * 0.24);
  torso.closePath();
  shaded(ctx, torso, shattered ? "#6f98ac" : "#8fb8cc", 1, 0, -h * 0.48, r * 1.25, 3.2);

  const armSwing = pose.swing * r * 0.46;
  for (const side of [-1, 1]) {
    const sx = side * r * 0.92;
    const ex = side * r * (1.2 + (side > 0 ? pose.swing * 0.18 : 0));
    const ey = -h * 0.16 - (side > 0 ? armSwing : 0);
    limb(ctx, sx, -h * 0.62, ex, ey, r * 0.5, side > 0 ? "#8fb8cc" : "#6f98ac");
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.42, r * 0.3, side * 0.12, 0, Math.PI * 2);
    outlined(ctx, side > 0 ? "#9fc4d6" : "#789fb2", 2.4);
  }

  // Glacier armor plates crack away by phase three.
  if (!shattered) {
    ctx.fillStyle = "rgba(217, 242, 250, 0.78)";
    ctx.strokeStyle = "#eafaff";
    ctx.lineWidth = 1.8;
    for (const [ox, oy, pw, ph] of [[-0.62, -0.65, 0.58, 0.32], [0.18, -0.71, 0.66, 0.29], [-0.32, -0.37, 0.52, 0.26]] as [number, number, number, number][]) {
      ctx.beginPath();
      ctx.moveTo(r * ox, h * oy);
      ctx.lineTo(r * (ox + pw), h * (oy + 0.03));
      ctx.lineTo(r * (ox + pw * 0.78), h * (oy + ph));
      ctx.lineTo(r * (ox + 0.08), h * (oy + ph * 0.86));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // The heart is always hinted; after the shatter it becomes the focal point.
  const pulse = 0.72 + Math.sin(time * (shattered ? 7 : 2.4)) * 0.18;
  ctx.save();
  ctx.globalAlpha = shattered ? 1 : 0.48;
  ctx.shadowColor = shattered ? "#ffb164" : "#bdefff";
  ctx.shadowBlur = shattered ? 19 : 9;
  ctx.fillStyle = shattered ? "#ffb164" : "#bdefff";
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.48 - r * 0.22 * pulse);
  ctx.lineTo(r * 0.25 * pulse, -h * 0.48);
  ctx.lineTo(0, -h * 0.48 + r * 0.28 * pulse);
  ctx.lineTo(-r * 0.25 * pulse, -h * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Small ancient face beneath a five-point icicle crown.
  const hx = r * 0.08;
  const hy = -h * 0.76;
  ctx.beginPath();
  ctx.ellipse(hx, hy, r * 0.47, r * 0.42, 0, 0, Math.PI * 2);
  outlined(ctx, shattered ? "#789fb2" : "#9fc4d6", 2.4);
  ctx.fillStyle = shattered ? "#ff9d5c" : "#d9f6ff";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 8;
  for (const ox of [0.05, 0.34]) {
    ctx.beginPath();
    ctx.arc(hx + r * ox, hy - r * 0.02, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#dcedf5";
  ctx.strokeStyle = "#6f98ac";
  ctx.lineWidth = 1.6;
  for (let ic = -2; ic <= 2; ic++) {
    const bx = hx + ic * r * 0.2;
    const topY = hy - r * (0.42 - Math.abs(ic) * 0.04);
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.1, topY);
    ctx.lineTo(bx, topY - r * (0.72 - Math.abs(ic) * 0.12));
    ctx.lineTo(bx + r * 0.1, topY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Breath haze points toward his facing and keeps the otherwise static giant alive.
  ctx.globalAlpha = 0.28 + Math.abs(Math.sin(time * 1.6)) * 0.18;
  ctx.fillStyle = "#e1f4fa";
  ctx.beginPath();
  ctx.ellipse(r * 0.74, hy + r * 0.22, r * 0.36, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - h * 0.5, r * 1.42);
  drawEffectPips(ctx, unit, x, gy - h - 20);
  drawHealthBar(ctx, unit, gy - h - 14);
}

/** THE BELL WIDOW — an abbess whose drowned vestments have become the bell.
 *  A bronze halo, flared bell-skirt, and swinging clapper read at combat scale. */
function drawBellWidow(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.25;
  // Taller than every ordinary humanoid: she is a walking belfry, not a large
  // Bellkeeper. The wide hem and narrow crown read even when effects obscure detail.
  const h = r * 3.58;
  const f = pose.f;
  const lastToll = unit.phase >= 3;
  const toll = Math.max(unit.castGlow, pose.swing);
  const idlePendulum = Math.sin(time * 1.45 + unit.id) * r * 0.06;
  const sway = idlePendulum + Math.sin(toll * Math.PI) * r * 0.26;
  drawShadow(ctx, unit, pose.bounce * 0.25);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);

  // Funeral streamers trail behind the otherwise rigid bell shape.
  ctx.strokeStyle = lastToll ? "#d2ae67" : "#35535a";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  for (const [ox, len, phase] of [[-0.4, 0.72, 0], [-0.12, 0.88, 1.5], [0.22, 0.64, 3]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(r * ox, -h * 0.56);
    ctx.quadraticCurveTo(-r * 0.8 + sway, -h * (0.36 + len * 0.1), -r * 1.0 + Math.sin(time * 2 + phase) * 5, -h * (0.16 + len * 0.08));
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  // The broken bronze bell-frame forms a halo visible above the hood.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(0, -h * 0.73, r * 0.82, Math.PI * 0.84, Math.PI * 2.12);
  ctx.stroke();
  // Iron belfry struts frame the veil and visually connect halo to bell-body.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 7;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * r * 0.6, -h * 0.83);
    ctx.lineTo(side * r * 0.45, -h * 0.57);
    ctx.stroke();
    ctx.strokeStyle = "#8f7046";
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 7;
  }
  ctx.strokeStyle = "#b58c4f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -h * 0.73, r * 0.82, Math.PI * 0.84, Math.PI * 2.12);
  ctx.stroke();
  ctx.fillStyle = "#d2ae67";
  for (const a of [Math.PI * 0.9, Math.PI * 1.2, Math.PI * 1.5, Math.PI * 1.82, Math.PI * 2.06]) {
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.82, -h * 0.73 + Math.sin(a) * r * 0.82, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bell-shaped vestment: narrow shoulders, enormous flared bronze-edged hem.
  const robe = new Path2D();
  robe.moveTo(-r * 0.38, -h * 0.69);
  robe.quadraticCurveTo(-r * 0.68, -h * 0.48, -r * 1.16, -h * 0.1);
  robe.quadraticCurveTo(0, h * 0.04, r * 1.18, -h * 0.1);
  robe.quadraticCurveTo(r * 0.62, -h * 0.48, r * 0.38, -h * 0.69);
  robe.closePath();
  shaded(ctx, robe, lastToll ? "#405e63" : "#526e75", 1, 0, -h * 0.35, r * 1.1, 3);
  ctx.strokeStyle = "#d2ae67";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-r * 1.15, -h * 0.1);
  ctx.quadraticCurveTo(0, h * 0.04, r * 1.17, -h * 0.1);
  ctx.stroke();
  ctx.strokeStyle = "#8a6b3f";
  ctx.lineWidth = 1.8;
  for (const ox of [-0.62, -0.2, 0.2, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(r * ox * 0.45, -h * 0.62);
    ctx.lineTo(r * ox, -h * 0.13);
    ctx.stroke();
  }

  // Sleeves hang like two smaller bells; one lifts to conduct a toll.
  for (const side of [-1, 1]) {
    const raised = side > 0 ? toll : 0;
    const sx = side * r * 0.42;
    const sy = -h * 0.58;
    const ex = side * r * (0.9 + raised * 0.28);
    const ey = -h * (0.39 + raised * 0.28);
    limb(ctx, sx, sy, ex, ey, r * 0.26, "#385158");
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.23, ey - r * 0.08);
    ctx.lineTo(ex + r * 0.23, ey - r * 0.08);
    ctx.lineTo(ex + r * 0.32, ey + r * 0.28);
    ctx.lineTo(ex - r * 0.32, ey + r * 0.28);
    ctx.closePath();
    outlined(ctx, "#4a666b", 2);
    ctx.strokeStyle = "#d2ae67";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - r * 0.3, ey + r * 0.27);
    ctx.lineTo(ex + r * 0.3, ey + r * 0.27);
    ctx.stroke();
  }

  // White mourning veil around a face that is almost entirely dark water.
  const hx = 0;
  const hy = -h * 0.77;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.42, hy + r * 0.44);
  ctx.quadraticCurveTo(hx - r * 0.6, hy - r * 0.2, hx, hy - r * 0.62);
  ctx.quadraticCurveTo(hx + r * 0.6, hy - r * 0.2, hx + r * 0.42, hy + r * 0.44);
  ctx.closePath();
  outlined(ctx, "#b9c9c8", 2.4);
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.05, hy, r * 0.29, r * 0.36, 0, 0, Math.PI * 2);
  outlined(ctx, "#152a2f", 2);
  ctx.shadowColor = lastToll ? "#ffd76b" : "#b9f2ec";
  ctx.shadowBlur = 9;
  ctx.fillStyle = lastToll ? "#ffd76b" : "#b9f2ec";
  ctx.beginPath();
  ctx.arc(hx + r * 0.12, hy, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // The clapper swings independently beneath the robe; it is the visual attack clock.
  const clapperX = sway * 1.2;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.43);
  ctx.lineTo(clapperX, -h * 0.08);
  ctx.stroke();
  ctx.strokeStyle = "#8f7046";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(clapperX, -h * 0.07, r * 0.18 + toll * 2, 0, Math.PI * 2);
  outlined(ctx, "#d2ae67", 2);

  // In the last phase, the drowned bronze splits and the final toll shines
  // through the cracks instead of merely recoloring the robe.
  if (lastToll) {
    ctx.strokeStyle = "#ffd76b";
    ctx.lineWidth = 2.4;
    ctx.shadowColor = "#ffb85c";
    ctx.shadowBlur = 10;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.18, -h * 0.51);
      ctx.lineTo(side * r * 0.38, -h * 0.4);
      ctx.lineTo(side * r * 0.24, -h * 0.29);
      ctx.lineTo(side * r * 0.56, -h * 0.17);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  if (toll > 0.08) {
    ctx.globalAlpha = Math.min(0.7, toll);
    ctx.strokeStyle = "#f0d28b";
    ctx.lineWidth = 2.5;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.42, r * (1.15 + ring * 0.3), r * (0.55 + ring * 0.12), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - h * 0.43, r * 1.25);
  drawEffectPips(ctx, unit, x, gy - h - 20);
  drawHealthBar(ctx, unit, gy - h - 14);
}

/** STORMJAW — a low coastal leviathan, half snapping turtle and half reef.
 *  Its broad shell, enormous jaw, lightning spines, and surfacing heart ensure
 *  it cannot be mistaken for a scaled ogre. */
function drawStormjaw(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  const pose = poseOf(unit, time);
  const r = unit.radius;
  const x = pose.cx;
  const gy = pose.groundY - pose.bounce * 0.2;
  const f = pose.f;
  const open = Math.min(1, pose.swing * 1.4 + unit.castGlow * 0.55);
  const heartUp = unit.phase >= 3;
  drawShadow(ctx, unit, pose.bounce * 0.2);

  ctx.save();
  ctx.translate(x, gy);
  ctx.scale(f, 1);

  // Heavy tidal tail gives the monster a long horizontal read.
  ctx.lineCap = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.58;
  ctx.beginPath();
  ctx.moveTo(-r * 0.82, -r * 0.62);
  ctx.quadraticCurveTo(-r * 1.65, -r * 0.76, -r * 2.02, -r * 0.05 + Math.sin(time * 2.2) * 3);
  ctx.stroke();
  ctx.strokeStyle = "#315f69";
  ctx.lineWidth = r * 0.42;
  ctx.stroke();
  ctx.lineCap = "butt";

  // Four sea-cliff legs, broad and jointed enough to establish a true low
  // quadruped before the shell and effects are drawn over them.
  for (const [lx, near] of [[-0.75, false], [-0.28, true], [0.4, false], [0.78, true]] as [number, boolean][]) {
    const step = pose.walk * (near ? 1 : -1) * r * 0.15;
    const leg = new Path2D();
    leg.moveTo(r * (lx - 0.27), -r * 0.72);
    leg.lineTo(r * (lx + 0.12), -r * 0.2);
    leg.lineTo(r * (lx + 0.4) + step, r * 0.06);
    leg.lineTo(r * (lx - 0.13) + step, r * 0.02);
    leg.closePath();
    shaded(ctx, leg, near ? "#315f69" : "#274f58", 1, r * lx, -r * 0.3, r * 0.52, 2.6);
    ctx.strokeStyle = "#9ed2c7";
    ctx.lineWidth = 2;
    for (let claw = 0; claw < 3; claw++) {
      const toeX = r * (lx + 0.08 + claw * 0.13) + step;
      ctx.beginPath();
      ctx.moveTo(toeX, -r * 0.02);
      ctx.lineTo(toeX + r * 0.1, r * 0.09);
      ctx.stroke();
    }
  }

  // Reef shell: broad and low, with an eroded coastline edge.
  const shell = new Path2D();
  shell.moveTo(-r * 1.18, -r * 0.55);
  shell.quadraticCurveTo(-r * 0.8, -r * 1.65, r * 0.52, -r * 1.72);
  shell.quadraticCurveTo(r * 1.12, -r * 1.38, r * 1.1, -r * 0.52);
  shell.quadraticCurveTo(0, -r * 0.2, -r * 1.18, -r * 0.55);
  shell.closePath();
  shaded(ctx, shell, "#315f69", 1, 0, -r, r * 1.3, 3.4);
  ctx.strokeStyle = "#9ed2c7";
  ctx.lineWidth = 2;
  for (const [sx, sy, ex, ey] of [[-0.85, -0.72, -0.2, -1.42], [-0.25, -0.42, 0.18, -1.5], [0.28, -0.38, 0.72, -1.3]] as [number, number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(r * sx, r * sy);
    ctx.quadraticCurveTo(r * ((sx + ex) / 2 + 0.12), r * ((sy + ey) / 2), r * ex, r * ey);
    ctx.stroke();
  }
  // Barnacles/coral keep the shell from becoming a smooth generic oval.
  ctx.fillStyle = "#a9c6ac";
  for (const [bx, by, br] of [[-0.72, -1.15, 0.13], [-0.34, -1.45, 0.09], [0.18, -1.5, 0.12], [0.62, -1.18, 0.1]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(r * bx, r * by, r * br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Conductive dorsal plates flash when the sky has marked the boss.
  const spineGlow = unit.castGlow > 0 || unit.phase >= 2;
  for (let i = 0; i < 5; i++) {
    const sx = r * (-0.58 + i * 0.3);
    const top = -r * (1.52 + (2 - Math.abs(2 - i)) * 0.13);
    ctx.beginPath();
    ctx.moveTo(sx - r * 0.16, -r * 1.25);
    ctx.lineTo(sx, top);
    ctx.lineTo(sx + r * 0.17, -r * 1.24);
    ctx.closePath();
    outlined(ctx, spineGlow ? "#b9f4ff" : "#6ea49f", 1.8);
  }
  if (spineGlow) {
    ctx.globalAlpha = 0.42 + Math.abs(Math.sin(time * 7)) * 0.28;
    ctx.strokeStyle = "#b9f4ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const sx = r * (-0.58 + i * 0.3);
      const sy = -r * (1.52 + (2 - Math.abs(2 - i)) * 0.13);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Heart plate rises only in the final phase, matching the fight's promise.
  if (heartUp) {
    const pulse = 0.78 + Math.sin(time * 7) * 0.16;
    ctx.save();
    ctx.shadowColor = "#ffe9a3";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffd76b";
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.92 - r * 0.3 * pulse);
    ctx.lineTo(r * 0.2 * pulse, -r * 0.92);
    ctx.lineTo(-r * 0.15, -r * 0.92 + r * 0.3 * pulse);
    ctx.lineTo(-r * 0.45 * pulse, -r * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // A plated neck wedges the skull into the shell: no floating round head.
  const hx = r * 1.22;
  const hy = -r * 0.78;
  const neck = new Path2D();
  neck.moveTo(r * 0.62, -r * 1.28);
  neck.lineTo(hx + r * 0.12, hy - r * 0.42);
  neck.lineTo(hx + r * 0.04, hy + r * 0.42);
  neck.lineTo(r * 0.62, -r * 0.38);
  neck.closePath();
  shaded(ctx, neck, "#2b5962", 1, r * 0.9, -r * 0.8, r * 0.7, 2.8);

  // The head is almost all jaw: a long crocodilian upper shelf, separated
  // lower mandible, black mouth gap, and teeth that remain visible when closed.
  const upper = new Path2D();
  upper.moveTo(hx - r * 0.46, hy - r * 0.36);
  upper.lineTo(hx + r * 0.18, hy - r * 0.58 - open * r * 0.12);
  upper.lineTo(hx + r * 1.34, hy - r * 0.28 - open * r * 0.22);
  upper.lineTo(hx + r * 1.48, hy + r * 0.02 - open * r * 0.25);
  upper.lineTo(hx - r * 0.02, hy + r * 0.16);
  upper.closePath();
  shaded(ctx, upper, "#3d7179", 1, hx + r * 0.35, hy, r * 1.05, 3);
  // Armored brow and nostrils make the long snout readable against dark water.
  ctx.strokeStyle = "#9ed2c7";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.08, hy - r * 0.28 - open * r * 0.08);
  ctx.lineTo(hx + r * 1.17, hy - r * 0.14 - open * r * 0.16);
  ctx.stroke();
  ctx.fillStyle = "#182f35";
  for (const nx of [1.12, 1.31]) {
    ctx.beginPath();
    ctx.arc(hx + r * nx, hy - r * (0.12 + open * 0.14), r * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mouth darkness appears before the mandible so jaw opening reads as motion.
  ctx.fillStyle = "#17252a";
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.02, hy + r * 0.11);
  ctx.lineTo(hx + r * 1.4, hy + r * (0.04 - open * 0.15));
  ctx.lineTo(hx + r * 1.05, hy + r * (0.35 + open * 0.38));
  ctx.lineTo(hx + r * 0.02, hy + r * 0.33);
  ctx.closePath();
  ctx.fill();
  const lower = new Path2D();
  lower.moveTo(hx - r * 0.04, hy + r * 0.14 + open * r * 0.08);
  lower.lineTo(hx + r * 1.4, hy + r * (0.13 + open * 0.42));
  lower.lineTo(hx + r * 1.02, hy + r * (0.46 + open * 0.5));
  lower.lineTo(hx - r * 0.18, hy + r * 0.42);
  lower.closePath();
  outlined(ctx, "#274f58", 2.6);
  ctx.fillStyle = "#efe8d4";
  for (let i = 0; i < 8; i++) {
    const tx = hx + r * (0.08 + i * 0.16);
    ctx.beginPath();
    ctx.moveTo(tx, hy + r * 0.1);
    ctx.lineTo(tx + r * 0.07, hy + r * (0.3 + open * 0.16));
    ctx.lineTo(tx + r * 0.13, hy + r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = "#b9f4ff";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#c8ffff";
  ctx.beginPath();
  ctx.arc(hx + r * 0.34, hy - r * 0.2 - open * r * 0.12, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Foam gathers at the belly so the beast seems to bring the surf with it.
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#d9f3ef";
  for (let i = 0; i < 6; i++) {
    const foamX = -r * 0.9 + i * r * 0.38;
    ctx.beginPath();
    ctx.arc(foamX, -r * 0.1 + Math.sin(time * 3 + i) * 2, r * (0.06 + (i % 3) * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  flashOverlay(ctx, unit, x, gy - r * 0.85, r * 1.6);
  drawEffectPips(ctx, unit, x, gy - r * 2.35);
  drawHealthBar(ctx, unit, gy - r * 2.22);
}

function drawEnemy(ctx: CanvasRenderingContext2D, unit: Unit, time: number): void {
  if (drawLateEnemy(ctx, unit, time)) {
    const boss = isLateBossKind(unit.enemyKind);
    const top = unit.y - unit.radius * (boss ? 3.15 : 2.8);
    drawEffectPips(ctx, unit, unit.x, top - 5);
    drawHealthBar(ctx, unit, top);
    return;
  }
  // Keep this as a presentation string so bespoke early-return renderers do not
  // narrow the remaining generic branch into an unwieldy TypeScript union.
  const kind = String(unit.enemyKind);
  if (kind === "wolf" || kind === "alpha" || kind === "frostwolf" || kind === "reefhound") {
    drawWolf(ctx, unit, time);
    return;
  }
  if (kind === "icewisp") {
    drawIceWisp(ctx, unit, time);
    return;
  }
  if (kind === "harrier" || kind === "galeharrier") {
    drawHarrier(ctx, unit, time);
    return;
  }
  if (kind === "wyrm") {
    drawWyrm(ctx, unit, time);
    return;
  }
  if (kind === "ogre") { drawMosstooth(ctx, unit, time); return; }
  if (kind === "warlord") { drawGorehulk(ctx, unit, time); return; }
  if (kind === "rimeheart") { drawRimeheartBoss(ctx, unit, time); return; }
  if (kind === "bellwidow") { drawBellWidow(ctx, unit, time); return; }
  if (kind === "stormjaw") { drawStormjaw(ctx, unit, time); return; }
  if (kind === "brinecrawler") { drawBrinecrawler(ctx, unit, time); return; }
  if (kind === "kelpbound") { drawKelpbound(ctx, unit, time); return; }
  if (kind === "wreckgunner") { drawWreckGunner(ctx, unit, time); return; }
  if (kind === "stormeel") { drawStormEel(ctx, unit, time); return; }
  if (kind === "conchseer") { drawConchSeer(ctx, unit, time); return; }
  if (kind === "warbanner") {
    // Gorehulk's standard: a spear-shaft driven into the dirt, rag snapping
    const bx = unit.x;
    const gy = unit.y;
    ctx.beginPath();
    ctx.ellipse(bx, gy + 2, 16, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 14, 30, 0.3)";
    ctx.fill();
    ctx.strokeStyle = "#4a3a30";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(bx, gy);
    ctx.lineTo(bx, gy - 64);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const wave = Math.sin(time * 5 + unit.id) * 4;
    const rag = new Path2D();
    rag.moveTo(bx + 2, gy - 62);
    rag.quadraticCurveTo(bx + 22, gy - 58 + wave, bx + 38, gy - 52 + wave * 1.4);
    rag.lineTo(bx + 30, gy - 44 + wave);
    rag.lineTo(bx + 36, gy - 38 + wave * 0.8);
    rag.lineTo(bx + 2, gy - 36);
    rag.closePath();
    shaded(ctx, rag, "#9a2f28", 1, bx + 18, gy - 48, 20, 2.2);
    // the lord's crude sigil
    ctx.strokeStyle = "#e8ddc8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 10, gy - 56);
    ctx.lineTo(bx + 20, gy - 44);
    ctx.moveTo(bx + 20, gy - 56);
    ctx.lineTo(bx + 10, gy - 44);
    ctx.stroke();
    // spearhead + rage pulse
    ctx.beginPath();
    ctx.moveTo(bx - 3, gy - 64);
    ctx.lineTo(bx, gy - 76);
    ctx.lineTo(bx + 3, gy - 64);
    ctx.closePath();
    outlined(ctx, "#8a939e", 1.6);
    if (unit.castGlow > 0) {
      ctx.strokeStyle = `rgba(255, 90, 72, ${unit.castGlow})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx, gy - 40, 30 + (0.5 - unit.castGlow) * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  const pose = poseOf(unit, time);
  const big = kind === "brute" || kind === "warlord" || kind === "ogre" || kind === "rimetroll" || kind === "rimeheart";
  // slight per-unit size wobble keeps a wave from reading as stamped clones
  const wobble = big ? 1 : 0.94 + hash01(unit.id * 1.3) * 0.12;
  const H = unit.radius * (big ? 2.9 : 3.5) * wobble;
  const { cx, f } = pose;
  // goblins scamper — springier hop than anyone else
  const scamper = kind === "goblin" ? 1.45 : 1;
  const gy = pose.groundY - pose.bounce * scamper;
  const colors = regionalColors(kind);
  drawShadow(ctx, unit, pose.bounce * scamper);

  const hipY = gy - H * (big ? 0.26 : 0.30);
  const shoulderY = gy - H * (big ? 0.6 : 0.52) + pose.breathe * 0.5;
  const headR = H * (big ? 0.17 : 0.27);
  // brutes hunch — head slung low, knuckles near the ground
  const headY = shoulderY - headR * (big ? 0.5 : 0.85) + (kind === "brute" ? H * 0.09 : 0);
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
  shaded(ctx, torso, colors.body, f, cx, (shoulderY + hipY) / 2, bodyW * (big ? 0.7 : 0.55), 3);
  // Fixed combat roles alter the silhouette, not just the health-bar badge.
  // These marks stay material and regional: shields, pennants, ammunition,
  // hooked tools and pursuit ribbons instead of floating UI symbols.
  const enemyRole = ENEMIES[unit.enemyKind!]?.role;
  if (enemyRole === "tank") {
    ctx.beginPath();
    ctx.ellipse(cx - f * bodyW * 0.58, shoulderY + H * 0.14, bodyW * 0.34, H * 0.24, f * 0.08, 0, Math.PI * 2);
    outlined(ctx, colors.trim, 2.4);
    ctx.strokeStyle = "rgba(235,225,195,.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - f * bodyW * 0.58, shoulderY + H * 0.02);
    ctx.lineTo(cx - f * bodyW * 0.58, shoulderY + H * 0.26);
    ctx.stroke();
  } else if (enemyRole === "assassin" || enemyRole === "hunter") {
    const trail = Math.sin(time * 5 + unit.id) * H * 0.04;
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = enemyRole === "assassin" ? 3.5 : 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - f * bodyW * 0.25, shoulderY + 2);
    ctx.quadraticCurveTo(cx - f * bodyW, shoulderY + H * 0.12, cx - f * bodyW * 1.35, hipY + trail);
    ctx.stroke();
  } else if (enemyRole === "support" || enemyRole === "summoner") {
    const poleX = cx - f * bodyW * 0.7;
    ctx.strokeStyle = "#4b3b2d";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(poleX, hipY + H * 0.16);
    ctx.lineTo(poleX, shoulderY - H * 0.18);
    ctx.stroke();
    ctx.fillStyle = colors.trim;
    ctx.beginPath();
    ctx.moveTo(poleX, shoulderY - H * 0.17);
    ctx.lineTo(poleX + f * bodyW * 0.52, shoulderY - H * 0.09);
    ctx.lineTo(poleX, shoulderY + H * 0.01);
    ctx.closePath();
    ctx.fill();
  } else if (enemyRole === "artillery" || enemyRole === "controller" || enemyRole === "disruptor") {
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - f * bodyW * 0.5, shoulderY + H * 0.04);
    ctx.lineTo(cx + f * bodyW * 0.45, hipY);
    ctx.stroke();
    for (let charge = 0; charge < 2; charge++) {
      ctx.beginPath();
      ctx.arc(cx - f * bodyW * (0.28 + charge * 0.2), shoulderY + H * (0.05 + charge * 0.11), 2.2, 0, Math.PI * 2);
      outlined(ctx, colors.trim, 1.1);
    }
  }
  // archer's quiver rides the back
  if (kind === "archer") {
    ctx.save();
    ctx.translate(cx - f * bodyW * 0.48, shoulderY + 2);
    ctx.rotate(-f * 0.35);
    roundRect(ctx, -3.5, -H * 0.16, 7, H * 0.3, 3);
    outlined(ctx, "#6b4a2a", 2);
    ctx.strokeStyle = "#d9c9a0";
    ctx.lineWidth = 1.6;
    for (const ox of [-1.6, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(ox, -H * 0.15);
      ctx.lineTo(ox + 1.4, -H * 0.26);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (kind === "warlord") {
    // armor plate
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.4, shoulderY + 2);
    ctx.lineTo(cx + bodyW * 0.45, shoulderY + 1);
    ctx.lineTo(cx + bodyW * 0.32, hipY - 2);
    ctx.lineTo(cx - bodyW * 0.3, hipY - 1);
    ctx.closePath();
    outlined(ctx, "#5a4a52", 2);
    // stacked pauldrons: this one came dressed for war
    for (const s of [0, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + f * bodyW * 0.42, shoulderY - 2 - s * 4.5, bodyW * (0.26 - s * 0.06), 5.2 - s, f * 0.2, 0, Math.PI * 2);
      outlined(ctx, "#6b5a62", 2);
    }
  }
  if (kind === "ogre") {
    // moss grown over the shoulders — it slept a long time
    ctx.fillStyle = "#4f6a3a";
    ctx.beginPath();
    ctx.ellipse(cx - bodyW * 0.3, shoulderY - 2, bodyW * 0.22, 5, 0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + bodyW * 0.35, shoulderY - 1, bodyW * 0.18, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // a real hanging belly, paler where the sun never reached
    ctx.beginPath();
    ctx.ellipse(cx + f * 1.5, hipY - H * 0.01, bodyW * 0.42, H * 0.15, 0, 0, Math.PI * 2);
    outlined(ctx, "#87996a", 2.4);
    ctx.strokeStyle = "rgba(20,14,30,0.3)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx + f * 2, hipY + H * 0.02, 2.2, 0, Math.PI);
    ctx.stroke();
  }
  // loincloth
  ctx.fillStyle = colors.trim;
  ctx.fillRect(cx - bodyW * 0.32, hipY - 1, bodyW * 0.64, 4);

  // head
  const hx0 = cx + f * 2;
  const head = new Path2D();
  head.arc(hx0, headY, headR, 0, Math.PI * 2);
  shaded(ctx, head, colors.body, f, hx0, headY, headR, 3);
  // goblinoid ears — per-goblin tilt so a mob doesn't read as clones
  if (kind === "goblin" || kind === "archer" || kind === "shaman" || kind === "snowhag" || kind === "shambler") {
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
  if (kind === "shaman" || kind === "snowhag" || kind === "bonecaller" || kind === "saltwitch" || kind === "stormcaller") {
    // hood + glowing mask eyes + ritual paint
    ctx.beginPath();
    ctx.arc(cx + f * 1, headY - 1.5, headR * 1.04, Math.PI * 0.85, Math.PI * 2.15);
    ctx.closePath();
    outlined(ctx, colors.trim, 2);
    ctx.fillStyle = "#7de8c9";
    ctx.beginPath();
    ctx.arc(cx + f * headR * 0.45, headY + 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d9a441";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + f * headR * 0.15, headY + headR * 0.32);
    ctx.lineTo(cx + f * headR * 0.32, headY + headR * 0.6);
    ctx.moveTo(cx + f * headR * 0.48, headY + headR * 0.28);
    ctx.lineTo(cx + f * headR * 0.65, headY + headR * 0.55);
    ctx.stroke();
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
      // jaw guard
      ctx.fillStyle = "#5a4a52";
      roundRect(ctx, hx0 - f * headR * 0.1 - headR * 0.45, headY + headR * 0.5, headR * 0.9, headR * 0.3, 2);
      outlined(ctx, "#5a4a52", 1.6);
    }
  } else if (kind === "archer") {
    ctx.beginPath();
    ctx.arc(cx + f * 1, headY - 2, headR * 1.02, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    outlined(ctx, colors.trim, 2);
  } else if (kind === "stalker") {
    // a deep hood swallows the face — only two knife-glints beneath
    ctx.beginPath();
    ctx.arc(cx + f * 1, headY - 1, headR * 1.1, Math.PI * 0.75, Math.PI * 2.25);
    ctx.quadraticCurveTo(cx - f * headR * 0.2, headY + headR * 0.95, cx - f * headR * 1.1, headY + headR * 0.55);
    ctx.closePath();
    outlined(ctx, colors.trim, 2);
    ctx.fillStyle = "rgba(12, 16, 12, 0.75)";
    ctx.beginPath();
    ctx.arc(cx + f * 1.5, headY + headR * 0.08, headR * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b6f0a8";
    for (const off of [0.45, 0.02]) {
      ctx.beginPath();
      ctx.arc(hx0 + f * headR * off, headY + headR * 0.02, headR * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
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
  } else if (!["shaman", "snowhag", "bonecaller", "saltwitch", "stormcaller", "stalker"].includes(kind)) {
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
    // Mosstooth is barely awake: heavy lids sag over his eyes
    if (kind === "ogre") {
      ctx.fillStyle = colors.body;
      for (const off of [0.62, 0.1]) {
        ctx.beginPath();
        ctx.arc(hx0 + f * headR * off, eyeY - headR * 0.03, headR * 0.15, Math.PI, Math.PI * 2);
        ctx.closePath();
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
  } else if (kind === "shaman" || kind === "snowhag" || kind === "saltwitch" || kind === "stormcaller") {
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
  } else if (kind === "stalker") {
    // a long knife carried low, point back — killer's grammar
    const hx = shX + f * H * 0.14;
    const hy = shY + H * 0.18 + pose.swing * 4;
    limb(ctx, shX, shY, hx, hy, legW * 0.8, colors.body);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(f * (2.4 - pose.swing * 1.6));
    ctx.beginPath();
    ctx.moveTo(-1.3, 0);
    ctx.lineTo(0, -H * 0.3);
    ctx.lineTo(1.5, -1);
    ctx.closePath();
    outlined(ctx, "#c9ccd2", 1.6);
    ctx.fillStyle = "#2c3830";
    ctx.fillRect(-1.6, -1, 3.4, 4.5);
    ctx.restore();
  } else if (kind === "drummer" || kind === "bellkeeper") {
    // A support instrument slung at the belly: hide drum inland, drowned bell on the coast.
    const drumY = hipY - H * 0.06;
    ctx.beginPath();
    if (kind === "bellkeeper") {
      ctx.moveTo(cx - bodyW * 0.38, drumY - H * 0.1); ctx.lineTo(cx + bodyW * 0.38, drumY - H * 0.1); ctx.lineTo(cx + bodyW * 0.5, drumY + H * 0.12); ctx.lineTo(cx - bodyW * 0.5, drumY + H * 0.12); ctx.closePath();
      outlined(ctx, "#b59458", 2.2);
      ctx.fillStyle = "#d2ae67"; ctx.beginPath(); ctx.arc(cx, drumY + H * 0.15, 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.ellipse(cx + f * 2, drumY, bodyW * 0.42, H * 0.11, 0, 0, Math.PI * 2); outlined(ctx, "#d9c9a0", 2.2);
    }
    ctx.strokeStyle = "#8a5a3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.36, drumY + 2);
    ctx.lineTo(cx - bodyW * 0.2, shoulderY + 2);
    ctx.moveTo(cx + bodyW * 0.38, drumY + 2);
    ctx.lineTo(cx + bodyW * 0.22, shoulderY + 2);
    ctx.stroke();
    // both arms beat — castGlow marks the downstroke
    const beat = unit.castGlow > 0 ? 1 : Math.abs(Math.sin(time * 6 + unit.id)) * 0.5;
    for (const s of [-1, 1]) {
      const hx = cx + s * bodyW * 0.28;
      const hy = drumY - H * (0.12 + 0.1 * (s > 0 ? beat : 1 - beat));
      limb(ctx, cx + s * bodyW * 0.3, shY, hx, hy, legW * 0.8, colors.body);
      ctx.strokeStyle = "#6b4a2a";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + s * 3, hy - H * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + s * 3, hy - H * 0.1, 2.2, 0, Math.PI * 2);
      outlined(ctx, "#d9c9a0", 1.4);
    }
  } else if (kind === "shieldbearer") {
    // a mace behind, and the pavise itself in front — a door taught to walk
    const hx = shX + f * H * 0.12;
    const hy = shY + H * 0.12 + pose.swing * 5;
    limb(ctx, shX, shY, hx, hy, legW * 0.85, colors.body);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(f * (0.5 + pose.swing * 1.4));
    roundRect(ctx, -1.8, -H * 0.26, 3.6, H * 0.26, 2);
    outlined(ctx, "#7a5a38", 1.8);
    ctx.beginPath();
    ctx.arc(0, -H * 0.27, 3.4, 0, Math.PI * 2);
    outlined(ctx, "#8a939e", 1.8);
    ctx.restore();
    // the pavise: tall, slatted, dented — drawn last so it shields the body
    const px = cx + f * bodyW * 0.62;
    const pw = bodyW * 0.52;
    const pTop = shoulderY - H * 0.18;
    ctx.save();
    ctx.translate(px, 0);
    roundRect(ctx, -pw / 2, pTop, pw, gy - pTop, 4);
    outlined(ctx, colors.trim, 2.6);
    ctx.strokeStyle = "rgba(20,14,30,0.35)";
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-pw / 2 + (pw / 3) * i, pTop + 2);
      ctx.lineTo(-pw / 2 + (pw / 3) * i, gy - 2);
      ctx.stroke();
    }
    // boss-iron rim and a proud dent
    ctx.strokeStyle = "#6b7480";
    ctx.lineWidth = 2;
    roundRect(ctx, -pw / 2 + 1.5, pTop + 1.5, pw - 3, gy - pTop - 3, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pw * 0.12, (pTop + gy) / 2, 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    // brute / warlord club — huge overhead slam (brutes drag longer arms)
    const armLen = kind === "brute" ? H * 0.3 : H * 0.24;
    const angle = f * (-1.9 + pose.swing * 2.6);
    const hx = shX + Math.cos(angle) * armLen;
    const hy = shY + Math.sin(angle) * armLen + H * 0.04;
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

  // the Rimeclad's casing: slabs of glacier ice until they shatter off
  if (kind === "rimetroll" && unit.phase === 0) {
    ctx.fillStyle = "rgba(200, 232, 244, 0.55)";
    ctx.strokeStyle = "#d8f0f8";
    ctx.lineWidth = 1.6;
    for (const [ox, oy, pw, ph] of [[-0.3, 0.4, 0.32, 0.2], [0.05, 0.28, 0.3, 0.24], [-0.12, 0.55, 0.26, 0.16]] as number[][]) {
      ctx.beginPath();
      ctx.moveTo(cx + ox * H, gy - oy * H);
      ctx.lineTo(cx + (ox + pw) * H, gy - (oy + 0.04) * H);
      ctx.lineTo(cx + (ox + pw * 0.8) * H, gy - (oy - ph) * H);
      ctx.lineTo(cx + (ox + pw * 0.1) * H, gy - (oy - ph * 0.9) * H);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // the king's crown of icicles
  if (kind === "rimeheart") {
    ctx.fillStyle = "#dcedf5";
    ctx.strokeStyle = "#8fb8cc";
    ctx.lineWidth = 1.4;
    for (let ic = -2; ic <= 2; ic++) {
      const bx = cx + ic * H * 0.09;
      const topY = headY - headR * (1.0 - Math.abs(ic) * 0.12);
      ctx.beginPath();
      ctx.moveTo(bx - 2.6, topY);
      ctx.lineTo(bx, topY - headR * (0.55 - Math.abs(ic) * 0.1));
      ctx.lineTo(bx + 2.6, topY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // frost breath haze
    ctx.globalAlpha = 0.3 + Math.sin(time * 1.8) * 0.12;
    ctx.fillStyle = "#d8f0f8";
    ctx.beginPath();
    ctx.ellipse(cx + f * H * 0.34, headY + headR * 0.4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // regional wear: mud of the marsh, soot of the burn, frost of the passes
  if (regionStage >= 2 && kind !== "ogre" && kind !== "warlord" && kind !== "rimeheart") {
    const sd = unit.id * 7.3;
    if (regionStage === 2) {
      ctx.fillStyle = "rgba(72, 60, 38, 0.7)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + (hash01(sd + i) - 0.5) * H * 0.3, gy - 2 - hash01(sd + i * 2.7) * H * 0.18, 1.2 + hash01(sd + i * 1.7), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (regionStage === 3) {
      ctx.fillStyle = "rgba(30, 26, 24, 0.45)";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + (hash01(sd + i * 3.1) - 0.5) * H * 0.28, hipY - hash01(sd + i * 1.9) * H * 0.2, 1.6 + hash01(sd + i) * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // frost glinting along the shoulders
      ctx.fillStyle = "rgba(205, 228, 255, 0.75)";
      for (let i = 0; i < 3; i++) {
        const tw = 0.4 + Math.abs(Math.sin(time * 2.2 + sd + i * 2.4)) * 0.6;
        ctx.globalAlpha = tw;
        ctx.fillRect(cx + (hash01(sd + i * 4.3) - 0.5) * H * 0.3, shoulderY - 2 - hash01(sd + i * 2.2) * 3, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
  }

  flashOverlay(ctx, unit, cx, gy - H * 0.45, H * 0.5);
  drawEffectPips(ctx, unit, cx, gy - H - 14);
  drawHealthBar(ctx, unit, gy - H - 10);
}

// ------------------------------------------------------------------ death + assembly

/** Wayband's contact language: a held arc before the blow, ink-speed strokes
 *  through the swing, then short directional splinters at contact. These are
 *  deliberately sparse so telegraphs and health bars remain the loudest cues. */
function drawCombatMotion(ctx: CanvasRenderingContext2D, unit: Unit, calm: boolean): void {
  const dir = unit.lungeDir.x || unit.lungeDir.y ? unit.lungeDir : { x: unit.facing, y: 0 };
  const perp = { x: -dir.y, y: dir.x };
  ctx.save();
  ctx.lineCap = "round";

  if (unit.windup > 0 && !calm) {
    const pull = Math.min(1, unit.windup / (unit.team === "hero" ? 0.13 : 0.55));
    ctx.globalAlpha = 0.2 + pull * 0.35;
    ctx.strokeStyle = unit.team === "hero" ? "#ffe9a3" : "#ff9a85";
    ctx.lineWidth = 1.5 + unit.radius * 0.035;
    ctx.beginPath();
    ctx.arc(unit.x - unit.facing * unit.radius * 0.25, unit.y - unit.radius * 0.75, unit.radius * 1.25, unit.facing > 0 ? 2.8 : 0.35, unit.facing > 0 ? 4.65 : 2.2);
    ctx.stroke();
  }

  if (unit.lunge > 0.08 && !calm) {
    const a = Math.min(0.6, unit.lunge * 0.75);
    ctx.strokeStyle = unit.team === "hero" ? "#f1d99a" : "rgba(92,54,62,.9)";
    for (let i = -1; i <= 1; i++) {
      const spread = i * unit.radius * 0.42;
      const tail = unit.radius * (1.35 + Math.abs(i) * 0.25);
      ctx.globalAlpha = a * (i === 0 ? 1 : 0.55);
      ctx.lineWidth = i === 0 ? 2.4 : 1.25;
      ctx.beginPath();
      ctx.moveTo(unit.x - dir.x * tail + perp.x * spread, unit.y - unit.radius * 0.8 - dir.y * tail + perp.y * spread);
      ctx.lineTo(unit.x - dir.x * unit.radius * 0.25 + perp.x * spread, unit.y - unit.radius * 0.8 - dir.y * unit.radius * 0.25 + perp.y * spread);
      ctx.stroke();
    }
  }

  if (unit.hitFlash > 0) {
    const a = Math.min(1, unit.hitFlash / 0.26);
    const ix = unit.x - dir.x * unit.radius * 0.45;
    const iy = unit.y - unit.radius * 0.72 - dir.y * unit.radius * 0.45;
    ctx.strokeStyle = unit.team === "hero" ? "#ffb09a" : "#fff0c2";
    ctx.globalAlpha = calm ? a * 0.45 : a * 0.8;
    ctx.lineWidth = calm ? 1.8 : 2.3;
    const rays = calm ? 2 : 4;
    for (let i = 0; i < rays; i++) {
      const fan = (i - (rays - 1) / 2) * 0.48;
      const rx = -dir.x * Math.cos(fan) - dir.y * Math.sin(fan);
      const ry = -dir.y * Math.cos(fan) + dir.x * Math.sin(fan);
      const inner = unit.radius * 0.55;
      const outer = unit.radius * (1.05 + (i % 2) * 0.35);
      ctx.beginPath();
      ctx.moveTo(ix + rx * inner, iy + ry * inner);
      ctx.lineTo(ix + rx * outer, iy + ry * outer);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFallen(ctx: CanvasRenderingContext2D, unit: Unit): void {
  const t = unit.deathTime;
  const bossFallen = unit.team === "enemy" && !!unit.enemyKind && (BOSS_PHASES[unit.enemyKind]?.length ?? 0) > 0;
  if (bossFallen && unit.enemyKind && t < 2.15) {
    const accent = ENEMIES[unit.enemyKind].trim;
    const bloom = Math.min(1, t / 0.42);
    const vanish = Math.min(1, (2.15 - t) / 0.55);
    ctx.save();
    ctx.translate(unit.x, unit.y + 2);
    ctx.scale(1, 0.46);
    ctx.globalAlpha = bloom * vanish * 0.72;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([8, 7]);
    ctx.lineDashOffset = t * 36;
    ctx.beginPath();
    ctx.arc(0, 0, unit.radius * (2.1 + bloom * 1.25), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha *= 0.62;
    ctx.beginPath();
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = spoke * Math.PI / 4 + t * 0.2;
      const inner = unit.radius * 1.25;
      const outer = unit.radius * (1.6 + bloom * 0.42);
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    ctx.stroke();
    ctx.restore();
  }
  // fall with a little bounce, linger, then fade away
  const fallRaw = Math.min(1, t * 2.6);
  const fall = fallRaw >= 1 ? 1 : fallRaw + Math.sin(fallRaw * Math.PI) * 0.12;
  const fade = Math.max(0, 1 - Math.max(0, t - 1.1) / 1.2);
  if (t < 0.22) {
    const burst = 1 - t / 0.22;
    const dir = unit.lungeDir.x || unit.lungeDir.y ? unit.lungeDir : { x: unit.facing, y: 0 };
    ctx.save();
    ctx.globalAlpha = burst * 0.72;
    ctx.strokeStyle = unit.team === "hero" ? "#ffd0c2" : "#f6dfaa";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      const angle = i * 0.34;
      const rx = dir.x * Math.cos(angle) - dir.y * Math.sin(angle);
      const ry = dir.y * Math.cos(angle) + dir.x * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(unit.x + rx * unit.radius * 0.5, unit.y - unit.radius + ry * unit.radius * 0.5);
      ctx.lineTo(unit.x + rx * unit.radius * (1.5 + Math.abs(i) * 0.22), unit.y - unit.radius + ry * unit.radius * (1.5 + Math.abs(i) * 0.22));
      ctx.stroke();
    }
    ctx.restore();
  }
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
  const isWolf = unit.enemyKind === "wolf" || unit.enemyKind === "alpha";
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(unit.x, unit.y);
  const r = unit.radius;
  if (isWolf) {
    // a wolf falls on its side: long body, legs out, head thrown back
    const wolfColor = unit.enemyKind === "alpha" ? "#3f3a4d" : color;
    const flop = fall; // rolls onto the flank as it lands
    ctx.rotate(-unit.facing * (1 - flop) * 0.3);
    // flank
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 1.35, r * 0.55 + flop * r * 0.1, unit.facing * 0.06, 0, Math.PI * 2);
    outlined(ctx, wolfColor, 2);
    // legs stiff toward the viewer
    ctx.strokeStyle = wolfColor;
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = "round";
    for (const lx of [-r * 0.6, -r * 0.2, r * 0.35, r * 0.7]) {
      ctx.beginPath();
      ctx.moveTo(lx, -r * 0.25);
      ctx.lineTo(lx + unit.facing * r * 0.16, r * 0.12 * flop);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // head back, snout up
    ctx.beginPath();
    ctx.arc(unit.facing * r * 1.35, -r * 0.55, r * 0.45, 0, Math.PI * 2);
    outlined(ctx, wolfColor, 2);
    ctx.beginPath();
    ctx.moveTo(unit.facing * r * 1.55, -r * 0.75);
    ctx.lineTo(unit.facing * r * 2.05, -r * 0.95);
    ctx.lineTo(unit.facing * r * 1.6, -r * 0.45);
    ctx.closePath();
    outlined(ctx, wolfColor, 1.8);
    // limp ear + tail
    ctx.beginPath();
    ctx.moveTo(unit.facing * r * 1.2, -r * 0.9);
    ctx.lineTo(unit.facing * r * 1.05, -r * 1.2);
    ctx.lineTo(unit.facing * r * 1.4, -r * 0.95);
    ctx.closePath();
    outlined(ctx, wolfColor, 1.6);
    ctx.strokeStyle = wolfColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-unit.facing * r * 1.3, -r * 0.3);
    ctx.quadraticCurveTo(-unit.facing * r * 1.8, -r * 0.15, -unit.facing * r * 2.0, -r * 0.05);
    ctx.stroke();
    ctx.lineCap = "butt";
    // x eye
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    const wex = unit.facing * r * 1.4;
    ctx.beginPath();
    ctx.moveTo(wex - 2, -r * 0.6 - 2);
    ctx.lineTo(wex + 2, -r * 0.6 + 2);
    ctx.moveTo(wex + 2, -r * 0.6 - 2);
    ctx.lineTo(wex - 2, -r * 0.6 + 2);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }
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
const idlePrev = new WeakMap<Unit, number>();

/** Each hero's idle flourish leaves a little signature in the air. */
function idleFlourishFx(battle: Battle, unit: Unit): void {
  switch (unit.heroIndex) {
    case 0: // Bram: a glint along the raised blade
      battle.fx.burst(unit.x + unit.facing * 14, unit.y - 34, "#fff6d8", 3, 40, { glow: true, life: 0.3 });
      break;
    case 1: // Wren: a leaf shaken loose
      battle.fx.burst(unit.x - unit.facing * 6, unit.y - 30, "#8ba86b", 3, 36, { gravity: 50, life: 0.7 });
      break;
    case 2: // Ezri: embers flicked off a fingertip
      battle.fx.burst(unit.x + unit.facing * 10, unit.y - 28, "#ff9b42", 4, 46, { glow: true, gravity: -50, life: 0.5 });
      break;
    case 3: // Sol: drifting light motes
      battle.fx.burst(unit.x, unit.y - 32, "#ffe9a3", 4, 34, { glow: true, gravity: -60, life: 0.7 });
      break;
    case 4: // Maren: a scatter of seawater droplets
      battle.fx.burst(unit.x + unit.facing * 8, unit.y - 26, "#7bc8d8", 4, 50, { gravity: 140, life: 0.5 });
      break;
    case 5: // Kellan: a heavy stomp of dust
      battle.fx.burst(unit.x, unit.y + 1, "rgba(185,170,145,0.7)", 5, 40, { gravity: -25, size: 3, life: 0.4 });
      break;
  }
}

export function drawUnits(ctx: CanvasRenderingContext2D, battle: Battle, save: SaveData, selected: Unit | null): void {
  enemyHealthBarsVisible = save.enemyHealthBars;
  regionStage = battle.stage.id;
  // night stages have no sinking sun; everyone else's shadows stretch as the waves wear on
  shadowDusk =
    battle.tutorialMode || battle.stage.id >= 4 || battle.stage.waves.length <= 1
      ? 0
      : (Math.max(0, battle.waveIndex) / (battle.stage.waves.length - 1)) * 0.8;
  // Raised servants occupy real space and travel toward their quarry. Their
  // small, translucent silhouette keeps them readable without competing with
  // heroes for selection, health bars, or HUD space.
  for (const servant of [...battle.necroServants].sort((a, b) => a.y - b.y)) {
    const color = ELEMENT_MARK_COLORS[servant.element];
    const fade = Math.min(1, servant.life / 1.2, (servant.maxLife - servant.life + 0.35) / 0.7);
    const bob = Math.sin(servant.bob) * 2.4;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade) * 0.82;
    ctx.fillStyle = "rgba(10,8,16,.42)";
    ctx.beginPath();
    ctx.ellipse(servant.x, servant.y + 2, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(servant.x, servant.y - 14 + bob);
    ctx.strokeStyle = "#241d2c";
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-9, 14);
    ctx.quadraticCurveTo(-13, 2, -7, -5);
    ctx.quadraticCurveTo(0, -12, 7, -5);
    ctx.quadraticCurveTo(13, 2, 9, 14);
    ctx.quadraticCurveTo(4, 9, 0, 15);
    ctx.quadraticCurveTo(-4, 9, -9, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ded8c4";
    ctx.beginPath();
    ctx.arc(0, -9, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#241d2c";
    ctx.beginPath();
    ctx.arc(-2.5, -10, 1.3, 0, Math.PI * 2);
    ctx.arc(2.5, -10, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -3, 15, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.restore();
  }
  const sorted = [...battle.units].sort((a, b) => a.y - b.y);
  for (const unit of sorted) {
    if (!unit.alive) drawFallen(ctx, unit);
  }
  for (const unit of sorted) {
    if (!unit.alive) continue;
    // squash on hit, stretch on lunge, lean into movement — anchored at the feet
    const squash = Math.min(0.22, unit.hitFlash * 1.4);
    const stretch = unit.lunge * 0.1;
    const moving = unit.moveTarget !== null || unit.marching === true || (unit.team === "enemy" && unit.lunge <= 0.01 && !unit.attackTarget);
    // footfall dust: a small puff each time the stride plants
    const stride = Math.sin(unit.bobPhase);
    const prevStride = stepPhases.get(unit) ?? stride;
    stepPhases.set(unit, stride);
    if (moving && (prevStride >= 0) !== (stride >= 0)) {
      battle.fx.burst(unit.x - unit.facing * 3, unit.y + 1, battle.stage.id >= 6 && battle.stage.id < 12 ? "rgba(238,246,250,0.7)" : "rgba(185,170,145,0.6)", 2, 24, { gravity: -26, size: 2.4, life: 0.3 });
      if (battle.stage.id >= 6 && battle.stage.id < 12 && unit.alive) {
        battle.decals.push({ x: unit.x - unit.facing * 4, y: unit.y + 2, kind: "print", age: 0, size: unit.radius * 0.34, angle: unit.facing * 0.3 });
        if (battle.decals.length > 90) battle.decals.shift();
      }
    }
    // idle flourishes: fire once as each flourish begins
    if (unit.team === "hero" && unit.idleAnim > 0.6 && (idlePrev.get(unit) ?? 0) <= 0.6) {
      idleFlourishFx(battle, unit);
    }
    idlePrev.set(unit, unit.idleAnim);
    // elite affixes wear a turning gold ring — you can see the trouble coming
    if (unit.team === "enemy" && unit.affix && unit.entered) {
      const spin = battle.time * 1.6 + unit.id;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = unit.affix === "burning" ? "#ff9a5a" : unit.affix === "vengeful" ? "#ff8a70" : "#ffd76b";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -spin * 14;
      ctx.beginPath();
      ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.7, unit.radius * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // Hard+ difficulty shows on the enemies themselves: a smoldering crimson ring
    if (unit.team === "enemy" && (save.difficulty ?? 1) >= 2 && unit.entered) {
      const brutal = (save.difficulty ?? 1) >= 3;
      ctx.globalAlpha = brutal ? 0.4 : 0.24;
      ctx.strokeStyle = brutal ? "#ff5a48" : "#c85a3a";
      ctx.lineWidth = brutal ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.ellipse(unit.x, unit.y + 2, unit.radius * 1.5, unit.radius * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    if (unit.team === "enemy") drawEnemyRoleTell(ctx, unit, battle.time);
    drawCombatMotion(ctx, unit, save.reducedMotion);
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
  // the near layer overshoots camera AND march for depth: world coords already
  // pan at 1.0, so the camera only adds its extra 0.15 here
  const camX = opts.camX ?? 0;
  const fdrift = (opts.travel ?? 0) * 1.15 + camX * 0.15;
  ctx.fillStyle = stage.palette.prop;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 11; i++) {
    const fspan = w + OVERSCAN * 2;
    const winL = camX - OVERSCAN;
    const gx = winL + ((hash01(i * 41 + stage.id * 5) * fspan - fdrift - winL) % fspan + fspan) % fspan;
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
  for (const lm of battle.landmarks) {
    ctx.globalAlpha = lm.alpha;
    drawLandmark(ctx, lm.type, lm.x, lm.y, battle.time, battle.stage.id >= 6 && battle.stage.id < 12);
    ctx.globalAlpha = 1;
  }
  drawBossDressing(ctx, battle);
}

/** Winter's roadside sights: a frozen well, an ice-bound statue, a cairn, a dead tree, a buried sled. */
function drawWinterLandmark(ctx: CanvasRenderingContext2D, type: number, x: number, y: number, time: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(20, 24, 38, 0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (type === 0) {
    // a well, iced over
    ctx.fillStyle = "#7a94a8";
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#243244";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#b8e0f0";
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 9, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a7488";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 6);
    ctx.lineTo(x - 11, y - 14);
    ctx.moveTo(x + 11, y + 6);
    ctx.lineTo(x + 11, y - 14);
    ctx.stroke();
    ctx.fillStyle = "#e8f2f8";
    ctx.beginPath();
    ctx.moveTo(x - 15, y - 12);
    ctx.lineTo(x, y - 22);
    ctx.lineTo(x + 15, y - 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#243244";
    ctx.lineWidth = 1.8;
    ctx.stroke();
  } else if (type === 1) {
    // an old statue sheathed in ice
    ctx.fillStyle = "#8aa0b4";
    ctx.fillRect(x - 8, y + 8, 16, 8);
    ctx.strokeStyle = "#243244";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x - 8, y + 8, 16, 8);
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 6, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#9ab4c6";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - 18, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#d8f0f8";
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 9, 18, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (type === 2) {
    // a wayfarer's cairn, capped with snow
    for (const [ox, oy, rr] of [[0, 10, 9], [0, 1, 7], [0, -6, 5], [0, -11.5, 3.4]] as number[][]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rr, rr * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#6e8496";
      ctx.fill();
      ctx.strokeStyle = "#243244";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.fillStyle = "#eef6fa";
    ctx.beginPath();
    ctx.ellipse(x, y - 13, 3.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 3) {
    // a dead tree, black against the snow
    ctx.strokeStyle = "#2c3a4a";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x + 2, y - 20);
    ctx.moveTo(x + 1, y - 8);
    ctx.lineTo(x + 12, y - 18);
    ctx.moveTo(x + 1.5, y - 14);
    ctx.lineTo(x - 9, y - 24);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "rgba(238, 246, 250, 0.9)";
    ctx.beginPath();
    ctx.ellipse(x + 12, y - 19, 3, 1.4, 0.4, 0, Math.PI * 2);
    ctx.ellipse(x - 9, y - 25, 3, 1.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a sled the snow is slowly keeping
    ctx.save();
    ctx.translate(x, y + 4);
    ctx.rotate(-0.08);
    ctx.fillStyle = "#5e7488";
    ctx.fillRect(-16, -6, 32, 8);
    ctx.strokeStyle = "#243244";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-16, -6, 32, 8);
    ctx.strokeStyle = "#46596b";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-18, 6);
    ctx.quadraticCurveTo(-22, 2, -18, -2);
    ctx.moveTo(-18, 6);
    ctx.lineTo(18, 6);
    ctx.stroke();
    ctx.fillStyle = "rgba(238, 246, 250, 0.92)";
    ctx.beginPath();
    ctx.ellipse(2, -7, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** One-off roadside sights: a shrine, a signpost, a cart, old stones, a stump. */
function drawLandmark(ctx: CanvasRenderingContext2D, type: number, x: number, y: number, time: number, winter = false): void {
  if (winter) {
    drawWinterLandmark(ctx, type, x, y, time);
    return;
  }
  ctx.save();
  // grounding shadow
  ctx.fillStyle = "rgba(20, 14, 30, 0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (type === 0) {
    // moss-eaten wayshrine with a guttering candle
    ctx.fillStyle = "#6e6478";
    ctx.fillRect(x - 8, y - 14, 16, 30);
    ctx.strokeStyle = "#241d2e";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 8, y - 14, 16, 30);
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 14);
    ctx.lineTo(x, y - 24);
    ctx.lineTo(x + 11, y - 14);
    ctx.closePath();
    ctx.fillStyle = "#584e70";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 210, 120, ${0.6 + Math.sin(time * 7) * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(110, 140, 80, 0.6)";
    ctx.beginPath();
    ctx.ellipse(x - 6, y + 10, 5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 1) {
    // leaning signpost, letters long since weathered away
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + 16);
    ctx.lineTo(x + 4, y - 22);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#6b4a2a";
    ctx.save();
    ctx.translate(x + 3, y - 16);
    ctx.rotate(-0.12);
    ctx.fillRect(-2, -5, 26, 9);
    ctx.strokeStyle = "#241d2e";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-2, -5, 26, 9);
    ctx.strokeStyle = "#4a3826";
    ctx.beginPath();
    ctx.moveTo(2, -0.5);
    ctx.lineTo(20, -0.5);
    ctx.stroke();
    ctx.restore();
  } else if (type === 2) {
    // an abandoned handcart, one wheel gone
    ctx.fillStyle = "#5e4a30";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.1);
    ctx.fillRect(-16, -8, 32, 10);
    ctx.strokeStyle = "#241d2e";
    ctx.lineWidth = 2;
    ctx.strokeRect(-16, -8, 32, 10);
    ctx.beginPath();
    ctx.arc(-8, 6, 7, 0, Math.PI * 2);
    ctx.stroke();
    for (let sp = 0; sp < 3; sp++) {
      const a = sp * 1.05;
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-8 + Math.cos(a) * 6, 6 + Math.sin(a) * 6);
      ctx.stroke();
    }
    ctx.restore();
  } else if (type === 3) {
    // a ring of old standing stones, waist-high
    for (const [ox, oh] of [[-14, 14], [-2, 20], [10, 12]] as number[][]) {
      ctx.fillStyle = "#6e6880";
      ctx.beginPath();
      ctx.moveTo(x + ox - 4, y + 14);
      ctx.lineTo(x + ox - 3, y + 14 - oh);
      ctx.lineTo(x + ox + 4, y + 12 - oh);
      ctx.lineTo(x + ox + 5, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#241d2e";
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  } else {
    // a stump with a forgotten axe
    ctx.fillStyle = "#6b4a2a";
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#241d2e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#8a6a48";
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 1);
    ctx.lineTo(x + 13, y - 12);
    ctx.stroke();
    ctx.fillStyle = "#9aa3ad";
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 14);
    ctx.lineTo(x + 17, y - 10);
    ctx.lineTo(x + 12, y - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The arena dresses for its boss: banners for the Warlord, old bones for the
 *  Alpha, a wrecked cart for the ogre. Fades in with the introduction. */
function drawBossDressing(ctx: CanvasRenderingContext2D, battle: Battle): void {
  const boss = battle.bossRef;
  if (!boss || battle.tutorialMode) return;
  const a = Math.min(1, Math.max(0, (2.6 - battle.cinematic) / 0.9));
  if (a <= 0) return;
  const fl = battle.field;
  const t = battle.time;
  ctx.save();
  ctx.globalAlpha = a;
  const ground = (x: number, y: number, rx: number) => {
    ctx.fillStyle = "rgba(20, 14, 30, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (boss.enemyKind === "warlord") {
    // war banners planted at the field's shoulders
    for (const [bx, by, dir] of [
      [fl.left + 46, fl.top + 20, 1],
      [fl.right - 46, fl.top + 34, -1],
    ] as [number, number, number][]) {
      ground(bx, by + 2, 12);
      ctx.strokeStyle = "#4a3826";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 52);
      ctx.stroke();
      ctx.lineCap = "butt";
      const flut = Math.sin(t * 3 + bx) * 2.5;
      ctx.fillStyle = "#8a2f3d";
      ctx.beginPath();
      ctx.moveTo(bx, by - 52);
      ctx.lineTo(bx + dir * 26, by - 47 + flut);
      ctx.lineTo(bx, by - 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 14, 30, 0.8)";
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // crude skull daub on the cloth
      ctx.fillStyle = "#e8ddc8";
      ctx.beginPath();
      ctx.arc(bx + dir * 11, by - 46.5 + flut * 0.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (boss.enemyKind === "alpha") {
    // the pack's old kills, strewn where they fell
    for (let i = 0; i < 4; i++) {
      const px = fl.left + 30 + hash01(i * 13.7) * (fl.right - fl.left - 60);
      const py = fl.top + 12 + hash01(i * 7.1) * 40;
      ground(px, py + 2, 10);
      ctx.strokeStyle = "#d9d2c2";
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      for (let b = 0; b < 2; b++) {
        const ang = hash01(i * 5 + b * 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(ang) * 7, py - Math.sin(ang) * 2.4);
        ctx.lineTo(px + Math.cos(ang) * 7, py + Math.sin(ang) * 2.4);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      if (i % 2 === 0) {
        ctx.fillStyle = "#d9d2c2";
        ctx.beginPath();
        ctx.arc(px + 6, py - 3, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a2436";
        ctx.fillRect(px + 4.6, py - 4, 1.4, 1.4);
      }
    }
  } else if (boss.enemyKind === "ogre") {
    // a wrecked cart nobody came back for
    const cx = fl.right - 74;
    const cy = fl.top + 30;
    ground(cx, cy + 6, 26);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    ctx.fillStyle = "#5e4a30";
    for (const [px, py, pw, ph, rot] of [
      [-20, -8, 34, 6, 0.05],
      [-16, -16, 30, 6, -0.08],
      [4, -24, 6, 20, 0.3],
    ] as number[][]) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      roundRect(ctx, 0, 0, pw, ph, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 14, 30, 0.7)";
      ctx.lineWidth = 1.6;
      roundRect(ctx, 0, 0, pw, ph, 2);
      ctx.stroke();
      ctx.restore();
    }
    // the broken wheel, half-sunk
    ctx.strokeStyle = "#4a3826";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(22, -4, 12, Math.PI * 1.05, Math.PI * 2.4);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let s = 0; s < 3; s++) {
      const ang = Math.PI * 1.2 + s * 0.55;
      ctx.beginPath();
      ctx.moveTo(22, -4);
      ctx.lineTo(22 + Math.cos(ang) * 11, -4 + Math.sin(ang) * 11);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Per-stage ambient color grade over the whole scene (soft-light keeps detail). */
const STAGE_GRADE: Record<number, string> = {
  0: "rgba(255, 235, 170, 0.14)",
  1: "rgba(90, 140, 170, 0.18)",
  2: "rgba(110, 190, 150, 0.16)",
  3: "rgba(255, 130, 60, 0.2)",
  4: "rgba(120, 100, 220, 0.22)",
  5: "rgba(255, 90, 60, 0.18)",
  6: "rgba(180, 210, 240, 0.16)",
  7: "rgba(140, 190, 220, 0.18)",
  8: "rgba(120, 200, 230, 0.16)",
  9: "rgba(80, 130, 230, 0.26)",
  10: "rgba(190, 200, 210, 0.2)",
  11: "rgba(140, 160, 240, 0.24)",
};

export function drawColorGrade(ctx: CanvasRenderingContext2D, stage: StageDef, w: number, h: number): void {
  const tint = STAGE_GRADE[stage.id] ?? lateRoadGrade(stage.id);
  if (!tint) return;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** How dark each stage's night layer is (0 = fully lit). */
export const STAGE_DARKNESS: Record<number, number> = { 2: 0.16, 4: 0.5, 5: 0.32, 9: 0.55, 11: 0.42 };

let lightCanvas: HTMLCanvasElement | null = null;

/** Dynamic lighting: a darkness sheet with holes cut by every light source. */
export function drawLighting(
  ctx: CanvasRenderingContext2D,
  battle: Battle,
  w: number,
  h: number,
): void {
  const darkness = STAGE_DARKNESS[battle.stage.id] ?? lateRoadDarkness(battle.stage.id);
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
