/** Shared icon drawing: canvas ability glyphs (battle HUD + menus) and inline
 *  SVG chrome icons that replace emoji in the DOM screens. */

export function drawAbilityGlyph(
  ctx: CanvasRenderingContext2D,
  icon: string,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (icon) {
    case "cleave":
      ctx.arc(cx, cy, r, -Math.PI * 0.85, Math.PI * 0.15);
      ctx.moveTo(cx - r * 0.5, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.6);
      ctx.stroke();
      break;
    case "warcry":
      ctx.moveTo(cx - r, cy + r * 0.6);
      ctx.lineTo(cx, cy - r * 0.8);
      ctx.lineTo(cx + r, cy + r * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.15, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "pierce":
      ctx.moveTo(cx - r, cy + r * 0.7);
      ctx.lineTo(cx + r * 0.7, cy - r * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx + r * 0.15, cy - r * 0.65);
      ctx.lineTo(cx + r * 0.65, cy - r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case "flurry":
      ctx.moveTo(cx - r, cy - r * 0.5);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - r, cy + r * 0.5);
      ctx.moveTo(cx, cy - r * 0.5);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r * 0.5);
      ctx.stroke();
      break;
    case "fireball":
      ctx.arc(cx + r * 0.25, cy + r * 0.2, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.2, cy - r * 0.1);
      ctx.quadraticCurveTo(cx - r * 1.1, cy - r * 0.9, cx - r * 0.6, cy - r * 1.05);
      ctx.stroke();
      break;
    case "frostwake":
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.stroke();
      break;
    case "mend":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();
      break;
    case "radiance":
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
        ctx.lineTo(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05);
      }
      ctx.stroke();
      break;
    case "bulwark":
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx + r, cy - r * 0.6, cx + r * 0.8, cy + r * 0.1);
      ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.8, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.8, cx - r * 0.8, cy + r * 0.1);
      ctx.quadraticCurveTo(cx - r, cy - r * 0.6, cx, cy - r);
      ctx.closePath();
      ctx.stroke();
      break;
    case "sunder":
      // cracked guard
      ctx.moveTo(cx, cy - r);
      ctx.quadraticCurveTo(cx + r, cy - r * 0.6, cx + r * 0.8, cy + r * 0.1);
      ctx.quadraticCurveTo(cx + r * 0.5, cy + r * 0.8, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.5, cy + r * 0.8, cx - r * 0.8, cy + r * 0.1);
      ctx.quadraticCurveTo(cx - r, cy - r * 0.6, cx, cy - r);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.1, cy - r * 0.85);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.25);
      ctx.lineTo(cx - r * 0.15, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.1, cy + r * 0.8);
      ctx.stroke();
      break;
    case "groundbreaker":
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + (i / 4) * 0.7);
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.5);
        ctx.lineTo(cx - Math.cos(a) * r * 1.05, cy + r * 0.5 - Math.sin(a) * r * 1.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.5, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "rush":
      for (const off of [-0.5, 0.25]) {
        ctx.beginPath();
        ctx.moveTo(cx + off * r, cy - r * 0.7);
        ctx.lineTo(cx + off * r + r * 0.75, cy);
        ctx.lineTo(cx + off * r, cy + r * 0.7);
        ctx.stroke();
      }
      break;
    case "twinshot":
      for (const oy of [-0.45, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(cx - r, cy + oy * r);
        ctx.lineTo(cx + r * 0.55, cy + oy * r);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.3, cy + oy * r - r * 0.25);
        ctx.lineTo(cx + r * 0.85, cy + oy * r);
        ctx.lineTo(cx + r * 0.3, cy + oy * r + r * 0.25);
        ctx.stroke();
      }
      break;
    case "smokebomb":
      for (const [ox, oy, rr] of [[-0.4, 0.25, 0.45], [0.35, 0.2, 0.5], [0, -0.35, 0.55]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(cx + ox * r, cy + oy * r, rr * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case "deadeye":
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        ctx.moveTo(cx + dx * r * 0.45, cy + dy * r * 0.45);
        ctx.lineTo(cx + dx * r, cy + dy * r);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "missiles":
      for (const [ox, oy] of [[-0.6, -0.4], [0, 0], [0.55, 0.45]] as [number, number][]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox * r - r * 0.35, cy + oy * r + r * 0.2);
        ctx.lineTo(cx + ox * r + r * 0.35, cy + oy * r - r * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + ox * r + r * 0.35, cy + oy * r - r * 0.2, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "gravity":
      for (let s2 = 0; s2 < 14; s2++) {
        const a = s2 * 0.55;
        const rr = r * (1 - s2 / 15);
        const px2 = cx + Math.cos(a) * rr;
        const py2 = cy + Math.sin(a) * rr;
        if (s2 === 0) ctx.moveTo(px2, py2);
        else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
      break;
    case "meteor":
      ctx.arc(cx - r * 0.25, cy + r * 0.35, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.1, cy - r * 0.05);
      ctx.lineTo(cx + r, cy - r);
      ctx.moveTo(cx + r * 0.35, cy + r * 0.3);
      ctx.lineTo(cx + r * 1.05, cy - r * 0.15);
      ctx.stroke();
      break;
    case "blessing":
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx, cy + r * 0.1);
      ctx.moveTo(cx - r * 0.5, cy - r * 0.4);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.55, r * 0.55, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      break;
    case "ward":
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.5, cx + r * 0.7, cy + r * 0.15);
      ctx.quadraticCurveTo(cx + r * 0.45, cy + r * 0.75, cx, cy + r * 0.9);
      ctx.quadraticCurveTo(cx - r * 0.45, cy + r * 0.75, cx - r * 0.7, cy + r * 0.15);
      ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.5, cx, cy - r * 0.9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "judgement":
      for (const ox of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox * r, cy - r);
        ctx.lineTo(cx + ox * r, cy + r * (ox === 0 ? 0.9 : 0.5));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy - r, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "secondwind":
      ctx.arc(cx, cy, r * 0.75, -Math.PI * 0.4, Math.PI * 1.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.35, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.75, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.15, cy - r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    case "ramwall":
      ctx.moveTo(cx - r * 0.15, cy - r);
      ctx.lineTo(cx - r * 0.15, cy + r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.8, cy);
      ctx.lineTo(cx + r * 0.15, cy + r * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95, cy - r * 0.45);
      ctx.lineTo(cx - r * 0.55, cy - r * 0.45);
      ctx.moveTo(cx - r * 0.95, cy + r * 0.45);
      ctx.lineTo(cx - r * 0.55, cy + r * 0.45);
      ctx.stroke();
      break;
    case "bastion":
      ctx.moveTo(cx - r * 0.85, cy + r);
      ctx.lineTo(cx - r * 0.85, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.5, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.5, cy - r * 0.75);
      ctx.lineTo(cx - r * 0.15, cy - r * 0.75);
      ctx.lineTo(cx - r * 0.15, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.15, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.15, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.75);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.85, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.85, cy + r);
      ctx.closePath();
      ctx.stroke();
      break;
    case "overpower":
      // heavy blow driving down
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r * 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r * 0.1);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.1);
      ctx.stroke();
      break;
    case "caltrops":
      for (const [ox, oy] of [[-0.55, 0.45], [0.5, 0.35], [0, -0.35]] as [number, number][]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox * r - r * 0.28, cy + oy * r + r * 0.28);
        ctx.lineTo(cx + ox * r, cy + oy * r - r * 0.34);
        ctx.lineTo(cx + ox * r + r * 0.28, cy + oy * r + r * 0.28);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case "chainspark":
      ctx.moveTo(cx - r, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.15, cy - r * 0.15);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.1);
      ctx.lineTo(cx + r, cy + r * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r, cy + r * 0.85, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "sunlance":
      ctx.arc(cx, cy - r * 0.65, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.22, cy - r * 0.25);
      ctx.lineTo(cx - r * 0.1, cy + r);
      ctx.lineTo(cx + r * 0.1, cy + r);
      ctx.lineTo(cx + r * 0.22, cy - r * 0.25);
      ctx.closePath();
      ctx.fill();
      break;
    case "shieldslam":
      ctx.moveTo(cx + r * 0.2, cy - r * 0.9);
      ctx.quadraticCurveTo(cx + r * 0.95, cy - r * 0.5, cx + r * 0.8, cy + r * 0.1);
      ctx.quadraticCurveTo(cx + r * 0.55, cy + r * 0.75, cx + r * 0.2, cy + r * 0.9);
      ctx.quadraticCurveTo(cx - r * 0.15, cy + r * 0.75, cx - r * 0.35, cy + r * 0.1);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.5, cx + r * 0.2, cy - r * 0.9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.35);
      ctx.lineTo(cx - r * 0.65, cy - r * 0.35);
      ctx.moveTo(cx - r, cy + r * 0.15);
      ctx.lineTo(cx - r * 0.65, cy + r * 0.15);
      ctx.stroke();
      break;
    case "stoneskin":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px2 = cx + Math.cos(a) * r * 0.85;
        const py2 = cy + Math.sin(a) * r * 0.85;
        if (i === 0) ctx.moveTo(px2, py2);
        else ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "challenge":
      // planted banner
      ctx.moveTo(cx - r * 0.3, cy + r);
      ctx.lineTo(cx - r * 0.3, cy - r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r);
      ctx.lineTo(cx + r, cy - r * 0.55);
      ctx.lineTo(cx - r * 0.3, cy - r * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    case "whirlwind":
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (0.45 + i * 0.28), a0, a0 + Math.PI * 1.1);
        ctx.stroke();
      }
      break;
    case "volley":
      for (const off of [-0.7, 0, 0.7]) {
        ctx.beginPath();
        ctx.moveTo(cx + off * r, cy + r);
        ctx.lineTo(cx + off * r * 0.5, cy - r * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + off * r * 0.5 - r * 0.22, cy - r * 0.25);
        ctx.lineTo(cx + off * r * 0.5, cy - r * 0.6);
        ctx.lineTo(cx + off * r * 0.5 + r * 0.22, cy - r * 0.25);
        ctx.stroke();
      }
      break;
    case "barrage":
      for (const [ox, oy, rr] of [[-0.55, 0.4, 0.3], [0.15, -0.45, 0.38], [0.6, 0.45, 0.26]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(cx + ox * r, cy + oy * r, rr * r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "sanctuary":
      // sheltering dome over a spark
      ctx.arc(cx, cy + r * 0.5, r, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.05, cy + r * 0.5);
      ctx.lineTo(cx + r * 1.05, cy + r * 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.05, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "blink":
      // fading afterimage arrow
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.6);
      ctx.lineTo(cx - r * 0.25, cy);
      ctx.lineTo(cx - r, cy + r * 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.1, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.65, cy);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case "duel": {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.8, cy + r * 0.8);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.8);
      ctx.moveTo(cx + r * 0.8, cy + r * 0.8);
      ctx.lineTo(cx - r * 0.8, cy - r * 0.8);
      ctx.stroke();
      break;
    }
    case "aegis": {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r * 0.75, cy - r * 0.35);
      ctx.quadraticCurveTo(cx + r * 0.65, cy + r * 0.55, cx, cy + r * 0.95);
      ctx.quadraticCurveTo(cx - r * 0.65, cy + r * 0.55, cx - r * 0.75, cy - r * 0.35);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.05, r * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "nova": {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35);
        ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "shadows": {
      for (const o of [-0.55, 0, 0.55]) {
        ctx.beginPath();
        ctx.arc(cx + o * r, cy, r * 0.42, Math.PI * 0.25, Math.PI * 1.75);
        ctx.stroke();
      }
      break;
    }
    default:
      ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.lineCap = "butt";
}

const PATHS: Record<string, string> = {
  sword: '<line x1="19" y1="5" x2="9.5" y2="14.5"/><line x1="7" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="5" y2="19"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z"/>',
  gem: '<path d="M7.5 4.5h9L20 9l-8 10.5L4 9l3.5-4.5z"/><path d="M4 9h16"/>',
  spark: '<path d="M12 3.5l1.7 6.8 6.8 1.7-6.8 1.7-1.7 6.8-1.7-6.8L3.5 12l6.8-1.7L12 3.5z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8.2a3.8 3.8 0 100 7.6"/>',
  star: '<path d="M12 3.5l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6-5-2.9-5 2.9 1.2-5.6-4.2-3.9 5.6-.6L12 3.5z"/>',
  book: '<path d="M12 6.2C10 4.9 7.3 4.4 4.5 4.4v13.8c2.8 0 5.5.5 7.5 1.8 2-1.3 4.7-1.8 7.5-1.8V4.4c-2.8 0-5.5.5-7.5 1.8z"/><line x1="12" y1="6.2" x2="12" y2="20"/>',
  chart: '<line x1="4.5" y1="19.5" x2="19.5" y2="19.5"/><line x1="7.5" y1="19.5" x2="7.5" y2="12"/><line x1="12" y1="19.5" x2="12" y2="7"/><line x1="16.5" y1="19.5" x2="16.5" y2="10"/>',
  upload: '<path d="M12 15V4.5"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 15v3.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V15"/>',
  download: '<path d="M12 4.5V15"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M4.5 15v3.5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V15"/>',
  bag: '<path d="M6.5 8.5h11l1 11h-13l1-11z"/><path d="M9 8.5V7a3 3 0 016 0v1.5"/>',
  play: '<path d="M8 5.5l10 6.5-10 6.5v-13z"/>',
  moon: '<path d="M19.5 13.5A8 8 0 1110.5 4.5a6.3 6.3 0 009 9z"/>',
  banner: '<path d="M6 3.5v17"/><path d="M6 4.5h11.5L14.5 8.5l3 4H6"/>',
  arrow: '<line x1="4" y1="12" x2="19" y2="12"/><path d="M13.5 6.5L19 12l-5.5 5.5"/>',
  skull: '<path d="M12 3.5a7 7 0 00-7 7c0 2.6 1.4 4.4 3 5.5V19a1.5 1.5 0 001.5 1.5h5A1.5 1.5 0 0016 19v-3c1.6-1.1 3-2.9 3-5.5a7 7 0 00-7-7z"/><circle cx="9.3" cy="11" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.7" cy="11" r="1.4" fill="currentColor" stroke="none"/><line x1="12" y1="16.5" x2="12" y2="18"/>',
  bow: '<path d="M6 4c6 2.5 6 13.5 0 16"/><line x1="6" y1="4" x2="6" y2="20"/><line x1="10.5" y1="12" x2="20" y2="12"/><path d="M16.5 8.5L20 12l-3.5 3.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  home: '<path d="M4.5 11L12 4l7.5 7"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>',
};

/** Inline SVG chrome icon; inherits text color via currentColor. */
export function ico(name: keyof typeof PATHS | string): string {
  const body = PATHS[name] ?? PATHS.spark;
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
