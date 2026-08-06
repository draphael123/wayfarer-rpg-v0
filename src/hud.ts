import { audio } from "./audio";
import type { Battle } from "./battle";
import { callingById, DIFFICULTIES, HEROES } from "./data";
import { drawAbilityGlyph } from "./icons";
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
  freshPlayer = false;
  private aimHintShown = false;
  private ultHintShown = false;
  private coachStage = 0;
  private lastLivingHeroes = -1;
  private readyFlash: Record<number, number> = {}; // per ability-slot key
  private prevTimers: Record<number, number> = {};
  private portraitShake: Record<number, number> = {};
  private prevHp: Record<number, number> = {};
  private lastChime = -10;
  overlayAge = 0;
  pendingLoot: { icon: string; name: string; rare: boolean } | null = null;
  cam: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 };

  /** Convert a screen-space point into battle-world coordinates (camera-aware). */
  private toWorld(x: number, y: number): { x: number; y: number } {
    const CY = (this.height - HUD_H) * 0.5;
    return {
      x: (x - this.width / 2) / this.cam.zoom + this.width / 2 + this.cam.x,
      y: (y - CY) / this.cam.zoom + CY + this.cam.y,
    };
  }
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
              !this.aimHintShown
                ? "Time slows while you aim — drag out, take your time, release"
                : b.ability.def.targeting === "ally"
                  ? "Drag onto an ally, then release"
                  : "Drag to aim, then release",
            );
            this.aimHintShown = true;
          }
          return null;
        }
      }
      return null;
    }

    // battlefield (convert through the camera)
    const wp = this.toWorld(x, y);
    const unit = this.battle.unitAt(wp.x, wp.y);
    if (unit && unit.team === "hero") {
      this.selected = unit;
      this.drag = { mode: "unit", hero: unit, startX: wp.x, startY: wp.y, x: wp.x, y: wp.y };
      return null;
    }
    if (unit && unit.team === "enemy" && this.selected && this.selected.alive) {
      this.battle.orderAttack(this.selected, unit);
      audio.play("click");
      return null;
    }
    if (!unit && this.selected && this.selected.alive) {
      this.battle.orderMove(this.selected, wp);
      return null;
    }
    return null;
  }

  pointerMove(x: number, y: number): void {
    if (!this.drag) return;
    const wp = this.toWorld(x, y);
    this.drag.x = wp.x;
    this.drag.y = wp.y;
    if (this.drag.mode === "ability") {
      this.drag.hero.castGlow = Math.min(0.55, this.drag.hero.castGlow + 0.04);
    }
  }

  pointerUp(sx: number, sy: number): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    const wp = this.toWorld(sx, sy);
    const x = wp.x;
    const y = wp.y;

    if (drag.mode === "unit") {
      const hero = drag.hero;
      if (!hero.alive) return;
      const moved = Math.hypot(x - drag.startX, y - drag.startY);
      const target = this.battle.unitAt(x, y, undefined, 22);
      if (target && target.team === "enemy") {
        this.battle.orderAttack(hero, target);
        audio.play("click");
      } else if (target && target.team === "hero" && (target !== hero || moved > 12)) {
        // a drag looped back onto the healer themself is a self-heal
        if (hero.stats.healPower > 4) {
          this.battle.orderHeal(hero, target);
          audio.play("heal");
        } else if (target !== hero) {
          this.battle.orderMove(hero, { x: target.x + 30, y: target.y });
          this.showHint(`${hero.name} has no Spirit to heal with`);
        }
      } else if (moved > 12 && sy < this.height - HUD_H + 20) {
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
    if (this.overlayActive() && (this.battle.state === "victory" || this.battle.state === "defeat")) {
      this.overlayAge += dt;
    } else if (this.battle.state === "fighting") {
      this.overlayAge = 0;
    }
    // ability-ready flourish detection
    for (const hero of this.battle.heroes()) {
      hero.abilities.forEach((ability, slot) => {
        const key = hero.id * 10 + slot;
        const prev = this.prevTimers[key] ?? 0;
        if (prev > 0 && ability.timer <= 0 && hero.alive) {
          this.readyFlash[key] = 0.6;
          if (ability.ult && !this.ultHintShown) {
            this.ultHintShown = true;
            this.showHint(`${hero.name}'s ULTIMATE is ready — the glowing diamond button!`);
          }
          if (this.battle.time - this.lastChime > 1.2) {
            audio.play("ready");
            this.lastChime = this.battle.time;
          }
        }
        this.prevTimers[key] = ability.timer;
        this.readyFlash[key] = Math.max(0, (this.readyFlash[key] ?? 0) - dt);
      });
      // portrait shake on big hits
      const prevHp = this.prevHp[hero.id] ?? hero.hp;
      if (prevHp - hero.hp > 8) this.portraitShake[hero.id] = 0.35;
      this.prevHp[hero.id] = hero.hp;
      this.portraitShake[hero.id] = Math.max(0, (this.portraitShake[hero.id] ?? 0) - dt);
    }
    if (this.selected && !this.selected.alive) this.selected = null;

    // gentle coaching for brand-new players (never during tutorials)
    if (this.freshPlayer && !this.tutorial && this.battle.state === "fighting" && !this.paused) {
      const b = this.battle;
      if (this.coachStage === 0 && b.time > 4 && b.ordersIssued === 0 && this.hintTime <= 0) {
        this.showHint("Drag a hero toward the enemies to fight!");
      }
      if (b.ordersIssued > 0 && this.coachStage === 0) this.coachStage = 1;
      if (
        this.coachStage === 1 &&
        b.time > 10 &&
        Object.keys(b.castCounts).length === 0 &&
        this.hintTime <= 0 &&
        this.battle.heroes().some((h) => h.alive && h.abilities.some((a) => a.timer <= 0))
      ) {
        this.showHint("The glowing buttons below are abilities — tap one!");
        this.coachStage = 2;
      }
      const living = this.battle.livingHeroes().length;
      if (this.lastLivingHeroes > 0 && living < this.lastLivingHeroes) {
        this.showHint("A hero has fallen — they'll return after the battle");
      }
      this.lastLivingHeroes = living;
    }
  }

  // ------------------------------------------------------------------ drawing

  /** World-space overlays: drawn inside the camera transform. */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    this.drawTargetMarkers(ctx);
    this.drawCastingSigil(ctx);
    this.drawDragIndicators(ctx);
  }

  /** A rotating spell circle under a hero while their gesture is being aimed. */
  private drawCastingSigil(ctx: CanvasRenderingContext2D): void {
    const drag = this.drag;
    if (!drag || drag.mode !== "ability") return;
    const hero = drag.hero;
    const color = drag.ability.def.color;
    const t = this.battle.time;
    ctx.save();
    ctx.translate(hero.x, hero.y + 2);
    ctx.scale(1, 0.45);
    ctx.rotate(t * 1.4);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // rotating tri-rune
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -t * 2.2 + (i / 3) * Math.PI * 2;
      const px = Math.cos(a) * 30;
      const py = Math.sin(a) * 30;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 1.8 + (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 30, Math.sin(a) * 30, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawCinematic(ctx);
    this.drawTopBar(ctx);
    this.drawBossBar(ctx);
    this.drawBar(ctx);
    this.drawBanner(ctx);
    this.drawIntroBanner(ctx);
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
      const friendly =
        target?.team === "hero" &&
        (target !== hero || Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 12);
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
    // phase markers at 60% / 30% (the Alpha's phase transitions)
    if (this.battle.bossRef?.enemyKind === "alpha") {
      for (const mark of [0.6, 0.3]) {
        ctx.fillStyle = frac > mark ? "#ffe9a3" : "rgba(255,255,255,0.25)";
        ctx.fillRect(x + w * mark - 1, y + 9, 2, 13);
      }
    }
  }

  private drawCinematic(ctx: CanvasRenderingContext2D): void {
    const c = this.battle.cinematic;
    if (c <= 0 || !this.battle.bossRef) return;
    const inT = Math.min(1, (2.6 - c) / 0.35);
    const outT = Math.min(1, c / 0.35);
    const bar = 44 * Math.min(inT, outT);
    ctx.fillStyle = "#0c0914";
    ctx.fillRect(0, 0, this.width, bar);
    ctx.fillRect(0, this.height - bar, this.width, bar);
    if (c < 2.1 && c > 0.4) {
      const boss = this.battle.bossRef;
      ctx.textAlign = "center";
      ctx.font = "700 34px Cinzel, Palatino, 'Palatino Linotype', Georgia, serif";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(12, 9, 20, 0.9)";
      const y = this.height * 0.26;
      ctx.strokeText(boss.name.toUpperCase(), this.width / 2, y);
      ctx.fillStyle = "#ff8a70";
      ctx.fillText(boss.name.toUpperCase(), this.width / 2, y);
      // flanking dashes give the name card some ceremony
      const nameW = ctx.measureText(boss.name.toUpperCase()).width;
      ctx.strokeStyle = "rgba(255, 138, 112, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.width / 2 - nameW / 2 - 48, y - 10);
      ctx.lineTo(this.width / 2 - nameW / 2 - 14, y - 10);
      ctx.moveTo(this.width / 2 + nameW / 2 + 14, y - 10);
      ctx.lineTo(this.width / 2 + nameW / 2 + 48, y - 10);
      ctx.stroke();
      ctx.font = "600 italic 13px Georgia, serif";
      ctx.fillStyle = "#e6dcc2";
      const tip =
        boss.enemyKind === "alpha"
          ? "Dodge the pounce. Punish the exhaustion."
          : boss.enemyKind === "ogre"
            ? "Never stand still for the slam."
            : "His slam wounds everyone near it. Spread out.";
      ctx.fillText(tip, this.width / 2, y + 22);
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

  private drawIntroBanner(ctx: CanvasRenderingContext2D): void {
    if (this.battle.introBanner <= 0 || this.tutorial) return;
    const t = 2.6 - this.battle.introBanner;
    const alpha = Math.min(1, this.battle.introBanner / 0.6, t / 0.35);
    const slide = t < 0.35 ? (1 - t / 0.35) * -26 : 0;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = "center";
    ctx.font = "800 30px Palatino, 'Palatino Linotype', Georgia, serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20, 16, 28, 0.85)";
    const y = this.height * 0.36 + slide;
    ctx.strokeText(this.battle.stage.name, this.width / 2, y);
    ctx.fillStyle = "#ffe9a3";
    ctx.fillText(this.battle.stage.name, this.width / 2, y);
    ctx.font = "600 italic 14px Georgia, serif";
    ctx.lineWidth = 4;
    ctx.strokeText(this.battle.stage.subtitle, this.width / 2, y + 24);
    ctx.fillStyle = "#e6dcc2";
    ctx.fillText(this.battle.stage.subtitle, this.width / 2, y + 24);
    ctx.globalAlpha = 1;
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (this.battle.waveBanner <= 0 || this.battle.state !== "fighting" || this.tutorial) return;
    if (this.battle.introBanner > 0.4) return;
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
    // contact shadow: the field tucks under the bar
    const drop = ctx.createLinearGradient(0, top - 12, 0, top);
    drop.addColorStop(0, "rgba(10, 6, 18, 0)");
    drop.addColorStop(1, "rgba(10, 6, 18, 0.3)");
    ctx.fillStyle = drop;
    ctx.fillRect(0, top - 12, this.width, 12);
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
      const shakeAmt = this.portraitShake[hero.id] ?? 0;
      const shakeX = shakeAmt > 0 ? Math.sin(this.battle.time * 60) * shakeAmt * 10 : 0;
      const x0 = rowX0 + i * clusterW + 8 + shakeX;
      const py = top + 12;
      const ps = 52;

      // cluster card
      roundRect(ctx, rowX0 + i * clusterW + 3, top + 7, clusterW - 6, HUD_H - 14, 10);
      ctx.fillStyle = "rgba(255, 245, 225, 0.032)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 235, 180, 0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // portrait
      const isSel = this.selected === hero;
      const pgrad = ctx.createLinearGradient(x0, py, x0, py + ps);
      pgrad.addColorStop(0, hero.alive ? (isSel ? "#463a5e" : "#332a48") : "#241f2e");
      pgrad.addColorStop(1, hero.alive ? (isSel ? "#332a48" : "#262038") : "#1d1926");
      ctx.fillStyle = pgrad;
      roundRect(ctx, x0, py, ps, ps, 9);
      ctx.fill();
      const hpFrac = hero.alive ? hero.hp / hero.stats.maxHp : 1;
      const critical = hero.alive && hpFrac < 0.25;
      ctx.strokeStyle = critical
        ? `rgba(255, 90, 72, ${0.55 + Math.abs(Math.sin(this.battle.time * 5)) * 0.45})`
        : isSel
          ? "#ffe9a3"
          : "rgba(255,255,255,0.14)";
      ctx.lineWidth = critical ? 2.6 : isSel ? 2 : 1.2;
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
      // face: eyes + a mouth that tracks their condition
      ctx.strokeStyle = "#241d2e";
      ctx.fillStyle = "#241d2e";
      if (!hero.alive) {
        ctx.lineWidth = 1.6;
        for (const ex of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(mx + ex * ps * 0.09 - 2.4, py + ps * 0.47 - 2.4);
          ctx.lineTo(mx + ex * ps * 0.09 + 2.4, py + ps * 0.47 + 2.4);
          ctx.moveTo(mx + ex * ps * 0.09 + 2.4, py + ps * 0.47 - 2.4);
          ctx.lineTo(mx + ex * ps * 0.09 - 2.4, py + ps * 0.47 + 2.4);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(mx - ps * 0.09, py + ps * 0.47, 1.7, 0, Math.PI * 2);
        ctx.arc(mx + ps * 0.09, py + ps * 0.47, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (hpFrac < 0.25) {
          // gritted grimace
          ctx.moveTo(mx - 4.5, py + ps * 0.6);
          ctx.lineTo(mx + 4.5, py + ps * 0.6);
          ctx.moveTo(mx - 2.5, py + ps * 0.57);
          ctx.lineTo(mx - 2.5, py + ps * 0.63);
          ctx.moveTo(mx + 2.5, py + ps * 0.57);
          ctx.lineTo(mx + 2.5, py + ps * 0.63);
        } else if (hpFrac < 0.55) {
          ctx.moveTo(mx - 3.5, py + ps * 0.61);
          ctx.quadraticCurveTo(mx, py + ps * 0.58, mx + 3.5, py + ps * 0.61);
        } else {
          ctx.moveTo(mx - 3.5, py + ps * 0.58);
          ctx.quadraticCurveTo(mx, py + ps * 0.63, mx + 3.5, py + ps * 0.58);
        }
        ctx.stroke();
      }
      ctx.restore();

      // sworn-oath crest pinned to the portrait corner
      const heroOath = callingById(hero.calling);
      if (heroOath) {
        ctx.save();
        ctx.translate(x0 + 5, py + 5);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = heroOath.color;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeStyle = "#17111f";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
      }

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
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = def.accent;
      roundRect(ctx, x0 + ps / 2 - 11, py + ps + 27, 22, 2, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
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
        this.drawAbilityButton(ctx, bx, by, bs, hero, ability, this.readyFlash[hero.id * 10 + a] ?? 0);
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
    readyFlash = 0,
  ): void {
    const ready = ability.timer <= 0 && hero.alive;
    const isUlt = !!ability.ult;
    const charge = Math.min(1, hero.ultCharge / 100);
    const grad = ctx.createLinearGradient(x, y, x, y + s);
    grad.addColorStop(0, ready ? "#3d3356" : "#282138");
    grad.addColorStop(1, ready ? "#2c2440" : "#1f1a2c");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, s, s, 8);
    ctx.fill();
    if (isUlt) {
      // the meter IS the button: charge fills bottom-up in the calling color
      ctx.save();
      roundRect(ctx, x, y, s, s, 8);
      ctx.clip();
      ctx.globalAlpha = ready ? 0.4 : 0.3;
      ctx.fillStyle = ability.def.color;
      ctx.fillRect(x, y + s * (1 - charge), s, s * charge);
      if (!ready && charge > 0.02) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#fff6d8";
        ctx.fillRect(x, y + s * (1 - charge), s, 1.4);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    const pulse = isUlt && ready ? 0.5 + Math.abs(Math.sin(this.battle.time * 4)) * 0.5 : 1;
    if (ready) {
      ctx.shadowColor = ability.def.color;
      ctx.shadowBlur = isUlt ? 6 + pulse * 8 : 6;
    }
    ctx.strokeStyle = ready ? ability.def.color : isUlt ? `rgba(255,255,255,0.2)` : "rgba(255,255,255,0.12)";
    ctx.lineWidth = ready ? (isUlt ? 2.5 : 2) : 1;
    roundRect(ctx, x, y, s, s, 8);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (isUlt) {
      // ultimate marker: a small diamond stud at the top edge
      ctx.save();
      ctx.translate(x + s / 2, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = ready ? ability.def.color : "rgba(255,255,255,0.35)";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.strokeStyle = "#17111f";
      ctx.lineWidth = 1;
      ctx.strokeRect(-3, -3, 6, 6);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = ready ? 1 : isUlt ? 0.55 : 0.4;
    drawAbilityGlyph(ctx, ability.def.icon, x + s / 2, y + s / 2, s * 0.3, ability.def.color);
    ctx.restore();

    if (!isUlt && ability.timer > 0) {
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
    if (readyFlash > 0) {
      const t = 1 - readyFlash / 0.6;
      ctx.globalAlpha = readyFlash / 0.6;
      ctx.strokeStyle = ability.def.color;
      ctx.lineWidth = 2.5;
      roundRect(ctx, x - t * 8, y - t * 8, s + t * 16, s + t * 16, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // gesture affordance dot
    if (ability.def.targeting !== "instant") {
      ctx.fillStyle = ready ? ability.def.color : "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(x + s - 7, y + 7, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
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
    // paneled card with a soft top light
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#2c2342");
    g.addColorStop(0.2, "#251e36");
    g.addColorStop(1, "#1d1730");
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 16);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 245, 225, 0.08)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 12);
    ctx.stroke();
    // corner diamonds
    ctx.fillStyle = accent;
    for (const [dx, dy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as [number, number][]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
      ctx.restore();
    }
    ctx.fillStyle = accent;
    ctx.font = "700 26px Cinzel, Palatino, Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.width / 2, y + 42);
    // divider with a center diamond
    ctx.strokeStyle = "rgba(255, 245, 225, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 46, y + 56);
    ctx.lineTo(x + w - 46, y + 56);
    ctx.stroke();
    ctx.save();
    ctx.translate(this.width / 2, y + 56);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    ctx.restore();
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
      victory ? 318 : 262,
    );
    ctx.fillStyle = "#cfc7de";
    ctx.font = "600 14px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    const mins = Math.floor(this.battle.time / 60);
    const secs = String(Math.floor(this.battle.time % 60)).padStart(2, "0");
    if (victory) {
      const mult = DIFFICULTIES[this.save.difficulty ?? 1]?.rewardMult ?? 1;
      const xp = Math.round((this.battle.xpEarned + this.battle.stage.xpReward) * mult);
      const gold = Math.round((this.battle.goldEarned + Math.round(this.battle.stage.xpReward * 0.8)) * mult);
      const shownGold = Math.min(gold, Math.floor(this.overlayAge * gold * 1.6));
      const shownXp = Math.min(xp, Math.floor(this.overlayAge * xp * 1.6));
      // reward rows with drawn icons (no OS emoji)
      const rowY = frame.y + 80;
      const drawReward = (y: number, value: string, label: string, icon: "star" | "coin") => {
        ctx.font = "800 16px 'Trebuchet MS', Verdana, sans-serif";
        const text = `${value} ${label}`;
        const tw = ctx.measureText(text).width;
        const ix = this.width / 2 - tw / 2 - 14;
        if (icon === "coin") {
          ctx.fillStyle = "#e8c25a";
          ctx.beginPath();
          ctx.arc(ix, y - 5, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8a6a1e";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(ix, y - 5, 4.2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#ffe9a3";
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
            ctx.lineTo(ix + Math.cos(a) * 8, y - 5 + Math.sin(a) * 8);
            ctx.lineTo(ix + Math.cos(a + Math.PI / 4) * 3, y - 5 + Math.sin(a + Math.PI / 4) * 3);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "#f2ecd8";
        ctx.textAlign = "left";
        ctx.fillText(text, ix + 12, y);
        ctx.textAlign = "center";
      };
      drawReward(rowY, `+${shownXp}`, "experience", "star");
      drawReward(rowY + 26, `+${shownGold}`, "gold", "coin");
      // battle summary
      ctx.font = "600 12px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "#a89fc0";
      ctx.fillText(
        `Cleared in ${mins}:${secs} · ${this.battle.heroDeaths === 0 ? "no heroes fell" : `${this.battle.heroDeaths} hero${this.battle.heroDeaths === 1 ? "" : "es"} fell`}`,
        this.width / 2,
        rowY + 48,
      );
      // loot reveal: card flips in after a beat
      if (this.pendingLoot) {
        const flip = Math.min(1, Math.max(0, (this.overlayAge - 0.5) / 0.45));
        const scaleX = flip < 0.5 ? 1 - flip * 2 : flip * 2 - 1;
        const showFace = flip >= 0.5;
        const cw = 216;
        const ch = 34;
        const cxm = this.width / 2;
        const cy = frame.y + 148;
        ctx.save();
        ctx.translate(cxm, cy + ch / 2);
        ctx.scale(Math.max(0.04, scaleX), 1);
        ctx.translate(-cxm, -(cy + ch / 2));
        roundRect(ctx, cxm - cw / 2, cy, cw, ch, 9);
        ctx.fillStyle = showFace ? (this.pendingLoot.rare ? "#3d2d52" : "#33402a") : "#2a3122";
        ctx.fill();
        ctx.strokeStyle = this.pendingLoot.rare ? "#c9a0ff" : "#8ee88b";
        ctx.lineWidth = 1.8;
        roundRect(ctx, cxm - cw / 2, cy, cw, ch, 9);
        ctx.stroke();
        if (showFace) {
          ctx.fillStyle = this.pendingLoot.rare ? "#e2ccff" : "#d9efc9";
          ctx.font = "700 13px 'Trebuchet MS', Verdana, sans-serif";
          ctx.fillText(
            `${this.pendingLoot.icon} ${this.pendingLoot.name}${this.pendingLoot.rare ? "  ·  RARE" : ""}`,
            cxm,
            cy + 22,
          );
        }
        ctx.restore();
        if (this.pendingLoot.rare && flip >= 1 && this.overlayAge < 1.6) {
          ctx.globalAlpha = Math.max(0, 1.6 - this.overlayAge) * 0.8;
          ctx.strokeStyle = "#c9a0ff";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(cxm, cy + ch / 2, (this.overlayAge - 0.95) * 260 + 30, ((this.overlayAge - 0.95) * 260 + 30) * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    } else {
      const TIPS = [
        "Tip: drag your healer onto wounded allies",
        "Tip: kill shamans first — they heal the pack",
        "Tip: drag heroes out of red pounce circles",
        "Tip: spend gold at the Village between tries",
        "Tip: attribute points make heroes stronger — see Party",
        "Tip: lower the difficulty on the map, no shame in it",
      ];
      const tip = TIPS[Math.floor(this.battle.time) % TIPS.length];
      ctx.fillText(
        `Fell on wave ${this.battle.waveIndex + 1} of ${this.battle.stage.waves.length} · ${mins}:${secs}`,
        this.width / 2,
        frame.y + 78,
      );
      ctx.font = "600 12px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "#a89fc0";
      ctx.fillText(tip, this.width / 2, frame.y + 100);
    }
    const bw = frame.w - 60;
    const bx = frame.x + 30;
    if (victory) {
      this.addOverlayButton(ctx, "continue", "Continue", bx, frame.y + 200, bw, "#8ee88b");
      this.addOverlayButton(ctx, "retry", "Replay", bx, frame.y + 248, (bw - 10) / 2);
      this.addOverlayButton(ctx, "share", "Share", bx + (bw - 10) / 2 + 10, frame.y + 248, (bw - 10) / 2, "#ffe9a3");
    } else {
      this.addOverlayButton(ctx, "retry", "Try Again", bx, frame.y + 126, bw, "#ff8a70");
      this.addOverlayButton(ctx, "map", "Back to Map", bx, frame.y + 174, bw);
    }
  }
}
