import { audio } from "./audio";
import type { Battle } from "./battle";
import { HEROES } from "./data";
import type { AbilityState, SaveData, Unit } from "./types";

export const HUD_H = 100;

type DragState =
  | { mode: "unit"; hero: Unit; startX: number; startY: number; x: number; y: number }
  | { mode: "ability"; hero: Unit; ability: AbilityState; startX: number; startY: number; x: number; y: number }
  | null;

interface OverlayButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  accent?: string;
}

interface AbilityButtonRect {
  x: number;
  y: number;
  w: number;
  h: number;
  hero: Unit;
  ability: AbilityState;
}

interface PortraitRect {
  x: number;
  y: number;
  w: number;
  h: number;
  hero: Unit;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ABILITY_REACH: Record<string, number> = { pierce: 430, frostwake: 360 };

export class Hud {
  drag: DragState = null;
  selected: Unit | null = null;
  paused = false;
  private abilityButtons: AbilityButtonRect[] = [];
  private portraits: PortraitRect[] = [];
  private overlayButtons: OverlayButton[] = [];
  private stanceChips: PortraitRect[] = [];
  hint = "";
  hintTime = 0;
  tutorial: {
    text: string;
    sub: string;
    step: number;
    total: number;
    highlight?: { x: number; y: number } | null;
  } | null = null;
  private skipRect: { x: number; y: number; w: number; h: number } | null = null;

  abilityButtonCenter(abilityId: string): { x: number; y: number } | null {
    const b = this.abilityButtons.find((b) => b.ability.def.id === abilityId);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }

  stanceChipCenter(): { x: number; y: number } | null {
    const c = this.stanceChips[0];
    return c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : null;
  }

  constructor(
    public battle: Battle,
    public save: SaveData,
    public width: number,
    public height: number,
  ) {}

  showHint(text: string): void {
    this.hint = text;
    this.hintTime = 2.4;
  }

  private overlayActive(): boolean {
    return (
      this.paused ||
      ((this.battle.state === "victory" || this.battle.state === "defeat") && this.battle.resultDelay <= 0)
    );
  }

  /** Returns an action id when a menu-level button is pressed. */
  pointerDown(x: number, y: number): string | null {
    if (this.overlayActive()) {
      for (const button of this.overlayButtons) {
        if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
          audio.play("click");
          return button.id;
        }
      }
      return null;
    }

    // top-right pause target
    if (x > this.width - 46 && y < 42) {
      audio.play("click");
      return "pause";
    }

    if (this.tutorial && this.skipRect) {
      const s = this.skipRect;
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) {
        audio.play("click");
        return "skip-tutorial";
      }
    }

    if (y >= this.height - HUD_H) {
      for (const chip of this.stanceChips) {
        if (x >= chip.x && x <= chip.x + chip.w && y >= chip.y && y <= chip.y + chip.h) {
          const hero = chip.hero;
          hero.stance = hero.stance === "heal" ? "attack" : "heal";
          if (hero.autoOrder) {
            hero.healTarget = null;
            hero.autoOrder = false;
          }
          this.showHint(
            hero.stance === "heal"
              ? `${hero.name}: mending — heals allies on their own`
              : `${hero.name}: fighting — attacks like the rest`,
          );
          audio.play("click");
          return null;
        }
      }
      for (const p of this.portraits) {
        if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
          if (p.hero.alive) {
            this.selected = p.hero;
            audio.play("click");
          }
          return null;
        }
      }
      for (const b of this.abilityButtons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (!b.hero.alive) return null;
          if (b.ability.timer > 0) {
            audio.play("click");
            return null;
          }
          this.selected = b.hero;
          if (b.ability.def.targeting === "instant") {
            this.battle.castAbility(b.hero, b.ability, this.save, null, null);
          } else {
            this.drag = {
              mode: "ability",
              hero: b.hero,
              ability: b.ability,
              startX: x,
              startY: y,
              x,
              y,
            };
            this.showHint(
              b.ability.def.targeting === "ally" ? "Drag onto an ally, then release" : "Drag to aim, then release",
            );
          }
          return null;
        }
      }
      return null;
    }

    // battlefield
    const unit = this.battle.unitAt(x, y);
    if (unit && unit.team === "hero") {
      this.selected = unit;
      this.drag = { mode: "unit", hero: unit, startX: x, startY: y, x, y };
      return null;
    }
    if (unit && unit.team === "enemy" && this.selected && this.selected.alive) {
      this.battle.orderAttack(this.selected, unit);
      audio.play("click");
      return null;
    }
    if (!unit && this.selected && this.selected.alive) {
      this.battle.orderMove(this.selected, { x, y });
      return null;
    }
    return null;
  }

  pointerMove(x: number, y: number): void {
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
  }

  pointerUp(x: number, y: number): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;

    if (drag.mode === "unit") {
      const hero = drag.hero;
      if (!hero.alive) return;
      const moved = Math.hypot(x - drag.startX, y - drag.startY);
      const target = this.battle.unitAt(x, y, undefined, 22);
      if (target && target.team === "enemy") {
        this.battle.orderAttack(hero, target);
        audio.play("click");
      } else if (target && target.team === "hero" && target !== hero) {
        if (hero.stats.healPower > 4) {
          this.battle.orderHeal(hero, target);
          audio.play("heal");
        } else {
          this.battle.orderMove(hero, { x: target.x + 30, y: target.y });
          this.showHint(`${hero.name} has no Spirit to heal with`);
        }
      } else if (moved > 12 && y < this.height - HUD_H + 20) {
        this.battle.orderMove(hero, { x, y });
      }
      return;
    }

    // ability gesture
    const { hero, ability } = drag;
    if (!hero.alive || ability.timer > 0) return;
    const targeting = ability.def.targeting;
    if (targeting === "ally") {
      const target = this.battle.unitAt(x, y, "hero", 22);
      if (target) {
        this.battle.castAbility(hero, ability, this.save, null, target);
      } else {
        this.showHint("Release on an ally to cast");
      }
      return;
    }
    // Forgiving aim: any real pull counts, and releases inside the HUD are
    // clamped up onto the field instead of cancelling.
    const pulled = Math.hypot(x - drag.startX, y - drag.startY);
    if (pulled < 10) {
      this.showHint("Hold the button and drag to aim");
      return;
    }
    const aim = this.battle.clampToField({ x, y }, 0);
    this.battle.castAbility(hero, ability, this.save, aim, null);
  }

  update(dt: number): void {
    this.hintTime = Math.max(0, this.hintTime - dt);
    if (this.selected && !this.selected.alive) this.selected = null;
  }

  // ------------------------------------------------------------------ drawing

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawTargetMarkers(ctx);
    this.drawDragIndicators(ctx);
    this.drawTopBar(ctx);
    this.drawBossBar(ctx);
    this.drawBar(ctx);
    this.drawBanner(ctx);
    this.drawTutorialCard(ctx);
    this.drawHintText(ctx);
    this.overlayButtons = [];
    if (this.paused) this.drawPauseOverlay(ctx);
    else if (this.battle.state === "victory" && this.battle.resultDelay <= 0) this.drawResultOverlay(ctx, true);
    else if (this.battle.state === "defeat" && this.battle.resultDelay <= 0) this.drawResultOverlay(ctx, false);
  }

  /** Pulsing markers over each hero's current attack / heal target. */
  private drawTargetMarkers(ctx: CanvasRenderingContext2D): void {
    const pulse = Math.sin(this.battle.time * 7) * 2.5;
    const seen = new Set<number>();
    for (const hero of this.battle.units) {
      if (hero.team !== "hero" || !hero.alive) continue;
      const target = hero.attackTarget;
      if (target && target.alive && !seen.has(target.id)) {
        seen.add(target.id);
        const y = target.y - target.radius * 3.4 - 16 + pulse;
        ctx.fillStyle = "#ff8a70";
        ctx.strokeStyle = "rgba(20,14,30,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(target.x, y + 9);
        ctx.lineTo(target.x - 7, y);
        ctx.lineTo(target.x + 7, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      const heal = hero.healTarget;
      if (heal && heal.alive && hero.channelBeam > 0 && !seen.has(heal.id + 10000)) {
        seen.add(heal.id + 10000);
        const y = heal.y - heal.radius * 3.4 - 18 - pulse;
        ctx.strokeStyle = "#8ee88b";
        ctx.lineWidth = 3.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(heal.x, y - 5);
        ctx.lineTo(heal.x, y + 5);
        ctx.moveTo(heal.x - 5, y);
        ctx.lineTo(heal.x + 5, y);
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }
  }

  private drawDragIndicators(ctx: CanvasRenderingContext2D): void {
    const drag = this.drag;
    if (!drag) return;
    const hero = drag.hero;
    if (drag.mode === "unit") {
      const target = this.battle.unitAt(drag.x, drag.y, undefined, 22);
      const hostile = target?.team === "enemy";
      const friendly = target?.team === "hero" && target !== hero;
      ctx.strokeStyle = hostile ? "#ff8a70" : friendly ? "#9be89b" : "rgba(255,250,220,0.85)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y - 10);
      ctx.lineTo(drag.x, drag.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (target && target !== hero) {
        ctx.strokeStyle = hostile ? "#ff8a70" : "#9be89b";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(target.x, target.y + 2, target.radius * 1.5, target.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255,250,220,0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(drag.x, drag.y, 13, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    // ability aiming
    const def = drag.ability.def;
    const pulled = Math.hypot(drag.x - drag.startX, drag.y - drag.startY);
    if (def.targeting === "ray") {
      if (pulled < 8) return;
      const dx = drag.x - hero.x;
      const dy = drag.y - hero.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = ABILITY_REACH[def.id] ?? 400;
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y - 8);
      ctx.lineTo(hero.x + (dx / len) * reach, hero.y - 8 + (dy / len) * reach);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else if (def.targeting === "point") {
      const radius = def.id === "fireball" ? 85 : 60;
      ctx.strokeStyle = def.color;
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.ellipse(drag.x, drag.y, radius, radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else if (def.targeting === "ally") {
      const target = this.battle.unitAt(drag.x, drag.y, "hero", 22);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y - 10);
      ctx.lineTo(drag.x, drag.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (target) {
        ctx.beginPath();
        ctx.ellipse(target.x, target.y + 2, target.radius * 1.6, target.radius * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawBossBar(ctx: CanvasRenderingContext2D): void {
    const boss = this.battle.units.find((u) => u.alive && (u.enemyKind === "alpha" || u.enemyKind === "warlord"));
    if (!boss) return;
    const w = Math.min(360, this.width * 0.5);
    const x = this.width / 2 - w / 2;
    const y = 14;
    ctx.fillStyle = "rgba(20, 14, 30, 0.7)";
    roundRect(ctx, x - 8, y - 4, w + 16, 30, 10);
    ctx.fill();
    ctx.font = "800 11px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffb4a0";
    ctx.fillText(boss.name.toUpperCase(), this.width / 2, y + 7);
    const frac = Math.max(0, boss.hp / boss.stats.maxHp);
    roundRect(ctx, x, y + 11, w, 9, 4.5);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fill();
    if (frac > 0) {
      roundRect(ctx, x, y + 11, w * frac, 9, 4.5);
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, "#d1543f");
      grad.addColorStop(1, "#8a2f3d");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      roundRect(ctx, x, y + 11, w * frac, 3, 1.5);
      ctx.fill();
    }
    // phase markers at 60% / 30%
    for (const mark of [0.6, 0.3]) {
      ctx.fillStyle = frac > mark ? "#ffe9a3" : "rgba(255,255,255,0.25)";
      ctx.fillRect(x + w * mark - 1, y + 9, 2, 13);
    }
  }

  private drawTopBar(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "rgba(20, 16, 28, 0.55)";
    roundRect(ctx, 10, 10, 250, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#f2ecd8";
    ctx.font = "700 13px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "left";
    const waveNumber = Math.min(this.battle.waveIndex + 1, this.battle.stage.waves.length);
    const label = this.battle.stage.waves.length
      ? `${this.battle.stage.name} — wave ${Math.max(1, waveNumber)}/${this.battle.stage.waves.length}`
      : this.battle.stage.name;
    ctx.fillText(label, 20, 29);
    // pause button
    ctx.fillStyle = "rgba(20, 16, 28, 0.55)";
    roundRect(ctx, this.width - 42, 10, 32, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#f2ecd8";
    ctx.fillRect(this.width - 33, 17, 4.5, 16);
    ctx.fillRect(this.width - 25, 17, 4.5, 16);
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (this.battle.waveBanner <= 0 || this.battle.state !== "fighting" || this.tutorial) return;
    const alpha = Math.min(1, this.battle.waveBanner / 0.5);
    const age = 2.2 - this.battle.waveBanner;
    const pop = age < 0.22 ? 0.4 + (age / 0.22) * 0.75 : Math.max(1, 1.15 - (age - 0.22) * 0.7);
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${Math.round(36 * pop)}px 'Trebuchet MS', Verdana, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20, 16, 28, 0.8)";
    const text =
      this.battle.waveIndex >= this.battle.stage.waves.length - 1
        ? "Final Wave!"
        : `Wave ${this.battle.waveIndex + 1}`;
    ctx.strokeText(text, this.width / 2, 120);
    ctx.fillStyle = "#ffe9a3";
    ctx.fillText(text, this.width / 2, 120);
    ctx.globalAlpha = 1;
  }

  private drawTutorialCard(ctx: CanvasRenderingContext2D): void {
    this.skipRect = null;
    if (!this.tutorial) return;
    const t = this.tutorial;
    ctx.font = "700 16px 'Trebuchet MS', Verdana, sans-serif";
    const w = Math.max(ctx.measureText(t.text).width + 44, 320);
    const x = this.width / 2 - w / 2;
    const y = 50;
    const h = t.sub ? 74 : 54;
    ctx.fillStyle = "rgba(24, 18, 38, 0.92)";
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = "#ffe9a3";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
    ctx.fillStyle = "#ffeebe";
    ctx.textAlign = "center";
    ctx.fillText(t.text, this.width / 2, y + 26);
    if (t.sub) {
      ctx.font = "600 12.5px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "#b9aed0";
      ctx.fillText(t.sub, this.width / 2, y + 47);
    }
    // step dots
    for (let i = 0; i < t.total; i++) {
      ctx.beginPath();
      ctx.arc(this.width / 2 + (i - (t.total - 1) / 2) * 14, y + h - 10, 3, 0, Math.PI * 2);
      ctx.fillStyle = i <= t.step ? "#ffe9a3" : "rgba(255,255,255,0.2)";
      ctx.fill();
    }
    // skip button
    const sw = 120;
    const sx = this.width / 2 - sw / 2;
    const sy = y + h + 8;
    ctx.fillStyle = "rgba(24, 18, 38, 0.8)";
    roundRect(ctx, sx, sy, sw, 30, 9);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,233,163,0.4)";
    ctx.lineWidth = 1.4;
    roundRect(ctx, sx, sy, sw, 30, 9);
    ctx.stroke();
    ctx.fillStyle = "#cfc7de";
    ctx.font = "700 12.5px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillText("Skip tutorial", this.width / 2, sy + 19);
    this.skipRect = { x: sx, y: sy, w: sw, h: 30 };

    // animated pointer at whatever the step wants touched
    const hl = t.highlight;
    if (hl) {
      const bob = Math.sin(this.battle.time * 5) * 5;
      const pulse = 1 + Math.sin(this.battle.time * 5) * 0.15;
      ctx.strokeStyle = "#ffe9a3";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ffe9a3";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(hl.x, hl.y, 26 * pulse, 26 * pulse * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      // bouncing arrow above
      const ay = hl.y - 40 + bob;
      ctx.fillStyle = "#ffe9a3";
      ctx.beginPath();
      ctx.moveTo(hl.x, ay + 14);
      ctx.lineTo(hl.x - 10, ay);
      ctx.lineTo(hl.x - 4, ay);
      ctx.lineTo(hl.x - 4, ay - 12);
      ctx.lineTo(hl.x + 4, ay - 12);
      ctx.lineTo(hl.x + 4, ay);
      ctx.lineTo(hl.x + 10, ay);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  private drawHintText(ctx: CanvasRenderingContext2D): void {
    if (this.hintTime <= 0) return;
    ctx.globalAlpha = Math.min(1, this.hintTime);
    ctx.font = "600 14px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(20,16,28,0.6)";
    const y = this.height - HUD_H - 26;
    const w = ctx.measureText(this.hint).width + 26;
    roundRect(ctx, this.width / 2 - w / 2, y - 17, w, 24, 10);
    ctx.fill();
    ctx.fillStyle = "#ffeebe";
    ctx.fillText(this.hint, this.width / 2, y);
    ctx.globalAlpha = 1;
  }

  private drawBar(ctx: CanvasRenderingContext2D): void {
    const top = this.height - HUD_H;
    const grad = ctx.createLinearGradient(0, top, 0, this.height);
    grad.addColorStop(0, "#241d31");
    grad.addColorStop(1, "#171221");
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, this.width, HUD_H);
    ctx.fillStyle = "rgba(255,235,180,0.16)";
    ctx.fillRect(0, top, this.width, 2);

    this.abilityButtons = [];
    this.portraits = [];
    this.stanceChips = [];
    const heroes = this.battle.heroes();
    const count = Math.max(1, heroes.length);
    const clusterW = Math.min(300, this.width / count);
    const rowX0 = (this.width - clusterW * count) / 2;
    for (let i = 0; i < heroes.length; i++) {
      const hero = heroes[i];
      const def = HEROES[hero.heroIndex];
      const x0 = rowX0 + i * clusterW + 8;
      const py = top + 12;
      const ps = 52;

      // cluster divider
      if (i > 0) {
        ctx.strokeStyle = "rgba(255,235,180,0.10)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rowX0 + i * clusterW, top + 10);
        ctx.lineTo(rowX0 + i * clusterW, this.height - 10);
        ctx.stroke();
      }

      // portrait
      const isSel = this.selected === hero;
      const pgrad = ctx.createLinearGradient(x0, py, x0, py + ps);
      pgrad.addColorStop(0, hero.alive ? (isSel ? "#463a5e" : "#332a48") : "#241f2e");
      pgrad.addColorStop(1, hero.alive ? (isSel ? "#332a48" : "#262038") : "#1d1926");
      ctx.fillStyle = pgrad;
      roundRect(ctx, x0, py, ps, ps, 9);
      ctx.fill();
      ctx.strokeStyle = isSel ? "#ffe9a3" : "rgba(255,255,255,0.14)";
      ctx.lineWidth = isSel ? 2 : 1.2;
      roundRect(ctx, x0, py, ps, ps, 9);
      ctx.stroke();
      // chibi face
      ctx.save();
      ctx.globalAlpha = hero.alive ? 1 : 0.35;
      ctx.beginPath();
      roundRect(ctx, x0 + 1, py + 1, ps - 2, ps - 2, 8);
      ctx.clip();
      const mx = x0 + ps / 2;
      const robedMini = hero.stats.weapon === "stave";
      // shoulders
      ctx.beginPath();
      ctx.ellipse(mx, py + ps * 1.02, ps * 0.44, ps * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = robedMini ? "#efe6d0" : def.accent;
      ctx.fill();
      ctx.strokeStyle = "rgba(20,14,30,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // head
      ctx.beginPath();
      ctx.arc(mx, py + ps * 0.44, ps * 0.27, 0, Math.PI * 2);
      ctx.fillStyle = def.skin;
      ctx.fill();
      ctx.stroke();
      // hair or hood
      ctx.beginPath();
      if (robedMini) {
        ctx.arc(mx, py + ps * 0.42, ps * 0.31, Math.PI * 0.75, Math.PI * 2.25);
        ctx.fillStyle = "#efe6d0";
      } else {
        ctx.arc(mx, py + ps * 0.40, ps * 0.27, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fillStyle = def.hair;
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // eyes
      ctx.fillStyle = "#241d2e";
      ctx.beginPath();
      ctx.arc(mx - ps * 0.09, py + ps * 0.47, 1.7, 0, Math.PI * 2);
      ctx.arc(mx + ps * 0.09, py + ps * 0.47, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // hp sliver under portrait
      const frac = Math.max(0, hero.hp / hero.stats.maxHp);
      ctx.fillStyle = "rgba(18,14,24,0.8)";
      roundRect(ctx, x0, py + ps + 6, ps, 7, 3);
      ctx.fill();
      if (frac > 0) {
        ctx.fillStyle = frac > 0.35 ? "#6fce65" : "#e0b23e";
        roundRect(ctx, x0 + 1, py + ps + 7, (ps - 2) * frac, 5, 2);
        ctx.fill();
      }
      ctx.fillStyle = "#cfc7de";
      ctx.font = "700 10px 'Trebuchet MS', Verdana, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(def.name, x0 + ps / 2, py + ps + 24);
      this.portraits.push({ x: x0, y: py, w: ps, h: ps + 14, hero });

      // stance chip for capable healers: tap to switch mend/fight mode
      if (hero.stats.healPower >= 8) {
        const cs = 22;
        const chipX = x0 + ps - cs / 2 - 2;
        const chipY = py - cs / 2 + 4;
        const healing = hero.stance === "heal";
        ctx.beginPath();
        ctx.arc(chipX + cs / 2, chipY + cs / 2, cs / 2, 0, Math.PI * 2);
        ctx.fillStyle = healing ? "#2f5232" : "#54303a";
        ctx.fill();
        ctx.strokeStyle = healing ? "#8ee88b" : "#ff8a70";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = healing ? "#b8f5b0" : "#ffb4a0";
        const mx = chipX + cs / 2;
        const my = chipY + cs / 2;
        ctx.beginPath();
        if (healing) {
          ctx.moveTo(mx, my - 4.5);
          ctx.lineTo(mx, my + 4.5);
          ctx.moveTo(mx - 4.5, my);
          ctx.lineTo(mx + 4.5, my);
        } else {
          ctx.moveTo(mx - 4, my + 4);
          ctx.lineTo(mx + 4, my - 4);
          ctx.moveTo(mx + 1.5, my + 3.5);
          ctx.lineTo(mx - 3.5, my - 1.5);
        }
        ctx.stroke();
        ctx.lineCap = "butt";
        this.stanceChips.push({ x: chipX - 6, y: chipY - 6, w: cs + 12, h: cs + 12, hero });
      }

      // ability buttons
      const bs = 40;
      const bx0 = x0 + ps + 7;
      for (let a = 0; a < hero.abilities.length; a++) {
        const ability = hero.abilities[a];
        const bx = bx0 + a * (bs + 6);
        const by = py + 4;
        if (bx + bs > rowX0 + (i + 1) * clusterW - 2) break;
        this.drawAbilityButton(ctx, bx, by, bs, hero, ability);
        this.abilityButtons.push({ x: bx, y: by, w: bs, h: bs, hero, ability });
      }
      if (hero.abilities.length === 0) {
        ctx.fillStyle = "rgba(207,199,222,0.4)";
        ctx.font = "600 9px 'Trebuchet MS', Verdana, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("no abilities —", bx0, py + 20);
        ctx.fillText("train attributes", bx0, py + 32);
      }
    }
  }

  private drawAbilityButton(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    hero: Unit,
    ability: AbilityState,
  ): void {
    const ready = ability.timer <= 0 && hero.alive;
    const grad = ctx.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, ready ? "#3d3356" : "#282138");
    grad.addColorStop(1, ready ? "#2c2440" : "#1f1a2c");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, s, s, 8);
    ctx.fill();
    if (ready) {
      ctx.shadowColor = ability.def.color;
      ctx.shadowBlur = 6;
    }
    ctx.strokeStyle = ready ? ability.def.color : "rgba(255,255,255,0.12)";
    ctx.lineWidth = ready ? 2 : 1;
    roundRect(ctx, x, y, s, s, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.4;
    this.drawAbilityGlyph(ctx, ability.def.icon, x + s / 2, y + s / 2, s * 0.3, ability.def.color);
    ctx.restore();

    if (ability.timer > 0) {
      const frac = ability.timer / ability.def.cooldown;
      ctx.fillStyle = "rgba(12, 9, 18, 0.65)";
      ctx.beginPath();
      ctx.moveTo(x + s / 2, y + s / 2);
      ctx.arc(x + s / 2, y + s / 2, s * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.closePath();
      ctx.save();
      roundRect(ctx, x, y, s, s, 8);
      ctx.clip();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#f2ecd8";
      ctx.font = "700 12px 'Trebuchet MS', Verdana, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(Math.ceil(ability.timer).toString(), x + s / 2, y + s / 2 + 4);
    }
    // gesture affordance dot
    if (ability.def.targeting !== "instant") {
      ctx.fillStyle = ready ? ability.def.color : "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(x + s - 7, y + 7, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawAbilityGlyph(
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
      default:
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.lineCap = "butt";
  }

  private drawOverlayFrame(
    ctx: CanvasRenderingContext2D,
    title: string,
    accent: string,
    h = 250,
  ): { x: number; y: number; w: number } {
    ctx.fillStyle = "rgba(14, 10, 22, 0.72)";
    ctx.fillRect(0, 0, this.width, this.height);
    const w = 340;
    const x = this.width / 2 - w / 2;
    const y = this.height / 2 - h / 2 - 20;
    ctx.fillStyle = "#251e36";
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "800 26px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.width / 2, y + 44);
    return { x, y, w };
  }

  private addOverlayButton(
    ctx: CanvasRenderingContext2D,
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    accent = "#ffe9a3",
  ): void {
    const h = 40;
    ctx.fillStyle = "#332a4a";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.fillStyle = "#f2ecd8";
    ctx.font = "700 15px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + 26);
    this.overlayButtons.push({ id, x, y, w, h, label });
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    const frame = this.drawOverlayFrame(ctx, "Paused", "#ffe9a3", 296);
    const bw = frame.w - 60;
    const bx = frame.x + 30;
    this.addOverlayButton(ctx, "resume", "Resume", bx, frame.y + 64, bw);
    this.addOverlayButton(ctx, "retry", "Restart Battle", bx, frame.y + 108, bw);
    this.addOverlayButton(ctx, "map", "Retreat to Map", bx, frame.y + 152, bw);
    this.addOverlayButton(ctx, "speed", `Combat speed: ×${this.save.speed}`, bx, frame.y + 196, bw);
    this.addOverlayButton(ctx, "sound", `Sound: ${this.save.sound ? "on" : "off"}`, bx, frame.y + 240, bw / 2 - 5);
    this.addOverlayButton(
      ctx,
      "music",
      `Music: ${this.save.music ? "on" : "off"}`,
      bx + bw / 2 + 5,
      frame.y + 240,
      bw / 2 - 5,
    );
  }

  private drawResultOverlay(ctx: CanvasRenderingContext2D, victory: boolean): void {
    const frame = this.drawOverlayFrame(
      ctx,
      victory ? "Victory!" : "The band falls...",
      victory ? "#8ee88b" : "#ff8a70",
    );
    ctx.fillStyle = "#cfc7de";
    ctx.font = "600 14px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    if (victory) {
      const xp = this.battle.xpEarned + this.battle.stage.xpReward;
      ctx.fillText(`+${xp} experience earned`, this.width / 2, frame.y + 78);
    } else {
      ctx.fillText("Regroup, retrain, and try again.", this.width / 2, frame.y + 78);
    }
    const bw = frame.w - 60;
    const bx = frame.x + 30;
    if (victory) {
      this.addOverlayButton(ctx, "continue", "Continue", bx, frame.y + 104, bw, "#8ee88b");
      this.addOverlayButton(ctx, "retry", "Replay Stage", bx, frame.y + 152, bw);
    } else {
      this.addOverlayButton(ctx, "retry", "Try Again", bx, frame.y + 104, bw, "#ff8a70");
      this.addOverlayButton(ctx, "map", "Back to Map", bx, frame.y + 152, bw);
    }
  }
}
