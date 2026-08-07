import { audio } from "./audio";
import { speedLabel } from "./save";
import type { Battle } from "./battle";
import { BOSS_PHASES, callingById, DIFFICULTIES, elementById, ENEMIES, HEROES } from "./data";
import { drawAbilityGlyph } from "./icons";
import type { AbilityState, EnemyKind, SaveData, Unit } from "./types";

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

const BOSS_INTRO_TIPS: Partial<Record<EnemyKind, string>> = {
  alpha: "Dodge the pounce. Punish the exhaustion.",
  ogre: "Leave the slam, then break the exposed brute.",
  warlord: "Spread for the sweep. Break his shieldwall.",
  rimeheart: "Leave the hail. Strike when the heart is bare.",
  wyrm: "Follow the ridge. Punish the breach.",
  bellwidow: "Read the toll. Stand in the open lane.",
  stormjaw: "Escape the jaws. The missed breach exposes its heart.",
  kilntyrant: "Empty the eruption marks to crack its shell.",
  cindermaw: "The caldera speaks before it burns.",
  rootboundmatriarch: "Cut free of the roots before the brood closes.",
  verdantcolossus: "Move between root lines. Strike the bared heartwood.",
  dunerevenant: "Trust the warning edge, not the false moon.",
  nightmother: "The eclipse silences. Leave its shadow early.",
  gildedinquisitor: "Cross the verdict lines only after they pass.",
  reliquaryseraph: "Gold lines cross twice. Keep an exit behind you.",
  tempestroc: "Clear the crystal lanes before the wings descend.",
  skybreaker: "Shards fall in sequence. Move with the storm.",
  redhuntsman: "Make the marked charge miss to starve the hunt.",
  bloodmoonstag: "Break the red trail. Deny the Stag its healing.",
  lastpilgrim: "Keep moving toward ground the void has not named.",
  wayeater: "Recall every road. Each old warning still tells the truth.",
};

/** Key labels on ability buttons only make sense where a keyboard likely exists. */
const FINE_POINTER = typeof matchMedia !== "undefined" && matchMedia("(pointer: fine)").matches;

export class Hud {
  drag: DragState = null;
  selected: Unit | null = null;
  paused = false;
  /** A pressed ability button: short press casts/aims, a long hold peeks at the tooltip. */
  hold: { hero: Unit; ability: AbilityState; x: number; y: number; w: number; time: number } | null = null;
  /** Recently planted move orders — a flag marks where the hero was sent. */
  private moveMarks: { x: number; y: number; t: number }[] = [];
  /** Double-tapping an enemy converges the whole band on it. */
  private lastEnemyTap: { id: number; time: number } | null = null;
  /** Exposed to the practice ring so its focus-fire lesson advances only
   *  after the player actually issues the band command. */
  lastBandFocusId: number | null = null;
  /** Monotonic count of explicit ground orders, used by interactive lessons. */
  moveCommandSerial = 0;
  /** When true the sim AI fights the battle; any time is a good time to retake command. */
  autopilot = false;
  /** A hotkey armed an aimed ability: the preview follows the mouse, click casts. */
  keyAim = false;
  /** Last known pointer position in screen space (for keyboard-armed aiming). */
  private mouseX = 0;
  private mouseY = 0;

  /** Track the pointer even when no button is held — keyboard aim follows it. */
  trackMouse(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
    if (this.keyAim && this.drag && this.drag.mode === "ability") {
      const wp = this.toWorld(x, y);
      this.drag.x = wp.x;
      this.drag.y = wp.y;
      this.drag.hero.castGlow = Math.min(0.55, this.drag.hero.castGlow + 0.04);
    }
  }

  /** Hotkey: pick the Nth party member (party order, alive or not — dead just clears). */
  selectHeroByIndex(i: number): void {
    const heroes = this.battle.heroes();
    const hero = heroes[i];
    if (!hero || !hero.alive) return;
    this.selected = hero;
    audio.play("click");
  }

  /** Hotkey: cast the selected hero's Nth ability (2 = ultimate, 3 = legendary armor exception). */
  hotkeyAbility(slot: number): void {
    if (this.overlayActive() || this.tutorial) return;
    const hero = this.selected && this.selected.alive ? this.selected : this.battle.livingHeroes()[0];
    if (!hero) return;
    this.selected = hero;
    const ability =
      slot === 2
        ? (hero.abilities.find((a) => a.ult) ?? hero.abilities[2])
        : slot === 3
          ? hero.abilities.find((a) => a.armorSkill)
          : hero.abilities[slot];
    if (!ability) return;
    if (ability.timer > 0) {
      audio.play("click");
      return;
    }
    if (ability.def.targeting === "instant") {
      this.battle.castAbility(hero, ability, this.save, null, null);
      return;
    }
    // arm keyboard aim: the existing drag preview + bullet time carry it
    const wp = this.toWorld(this.mouseX, this.mouseY);
    this.keyAim = true;
    this.drag = { mode: "ability", hero, ability, startX: hero.x, startY: hero.y - 40, x: wp.x, y: wp.y };
    this.showHint(ability.def.targeting === "ally" ? "Click an ally to cast — Esc cancels" : "Aim with the mouse, click to cast — Esc cancels");
    audio.play("click");
  }

  /** Returns true if an armed keyboard aim was cancelled (Esc). */
  cancelKeyAim(): boolean {
    if (!this.keyAim) return false;
    this.keyAim = false;
    this.drag = null;
    return true;
  }
  private abilityButtons: AbilityButtonRect[] = [];
  private portraits: PortraitRect[] = [];
  private overlayButtons: OverlayButton[] = [];
  private stanceChips: PortraitRect[] = [];
  hint = "";
  hintTime = 0;
  freshPlayer = false;
  private aimHintShown = false;
  private ultHintShown = false;
  private threatHintShown = false;
  private marchHintShown = false;
  private coachStage = 0;
  private lastLivingHeroes = -1;
  private readyFlash: Record<number, number> = {}; // per ability-slot key
  private prevTimers: Record<number, number> = {};
  private portraitShake: Record<number, number> = {};
  private clusterAnim: Record<number, number> = {}; // hero id -> eased cluster width
  private frameDt = 1 / 60;
  private prevHp: Record<number, number> = {};
  private lastChime = -10;
  overlayAge = 0;
  private lootRevealed = false; // the reveal chime fires once per victory
  pendingLoot: { icon: string; name: string; rare: boolean } | null = null;
  rewardOverride: { xp: number; gold: number; note: string } | null = null;
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

  heroPortraitCenter(index = 0): { x: number; y: number } | null {
    const portrait = this.portraits[index];
    return portrait ? { x: portrait.x + portrait.w / 2, y: portrait.y + portrait.h / 2 } : null;
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
    // a keyboard-armed aim resolves on the next click, wherever it lands
    if (this.keyAim && this.drag && this.drag.mode === "ability") {
      const drag = this.drag;
      this.keyAim = false;
      this.drag = null;
      const wp = this.toWorld(x, y);
      if (drag.ability.def.targeting === "ally") {
        const target = this.battle.unitAt(wp.x, wp.y, "hero", 26);
        if (target) this.battle.castAbility(drag.hero, drag.ability, this.save, null, target);
        else this.showHint("No ally there — the spell waits");
      } else {
        this.battle.castAbility(drag.hero, drag.ability, this.save, this.battle.clampToField(wp, 0), null);
      }
      return null;
    }
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
    // AUTO chip beside it: hand the battle to the band (or take it back)
    if (x > this.width - 104 && x <= this.width - 46 && y < 42 && this.battle.state === "fighting" && !this.tutorial) {
      this.autopilot = !this.autopilot;
      audio.play("click");
      this.showHint(this.autopilot ? "The band fights on its own — tap AUTO to retake command" : "Command is yours again");
      return null;
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
          this.hold = { hero: b.hero, ability: b.ability, x: b.x, y: b.y, w: b.w, time: 0 };
          if (b.ability.timer > 0) {
            audio.play("click");
            return null;
          }
          this.selected = b.hero;
          if (b.ability.def.targeting === "instant") {
            // cast lands on release — a long hold shows the tooltip instead
          } else {
            const wp = this.toWorld(x, y);
            this.drag = {
              mode: "ability",
              hero: b.hero,
              ability: b.ability,
              // Keep the entire gesture in world space. Mixing the HUD's
              // screen coordinates with a camera-shifted release made taps
              // look like long pulls after the camera had moved.
              startX: wp.x,
              startY: wp.y,
              x: wp.x,
              y: wp.y,
            };
            const openingAimHint =
              this.save.aimMode === "freeze"
                ? "Time pauses while you aim — drag out, take your time, release"
                : this.save.aimMode === "realtime"
                  ? "Battle keeps moving while you aim — drag out and release"
                  : "Time slows while you aim — drag out, take your time, release";
            this.showHint(
              !this.aimHintShown
                ? openingAimHint
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
      // double-tap: everyone who fights converges on this one
      if (this.lastEnemyTap && this.lastEnemyTap.id === unit.id && this.battle.time - this.lastEnemyTap.time < 0.5) {
        for (const hero of this.battle.livingHeroes()) {
          if (hero.stance === "heal" && hero.stats.healPower >= 8) continue;
          this.battle.orderAttack(hero, unit);
        }
        this.battle.fx.ring(unit.x, unit.y + 2, unit.radius * 2.6, "#ff8a70", { width: 3.4, life: 0.5 });
        this.showHint("The band converges!");
        audio.play("click");
        this.lastBandFocusId = unit.id;
        this.lastEnemyTap = null;
        return null;
      }
      this.lastEnemyTap = { id: unit.id, time: this.battle.time };
      this.battle.orderAttack(this.selected, unit);
      audio.play("click");
      return null;
    }
    if (!unit && this.selected && this.selected.alive) {
      this.battle.orderMove(this.selected, wp);
      this.moveCommandSerial += 1;
      this.moveMarks.push({ x: wp.x, y: wp.y, t: 0 });
      return null;
    }
    return null;
  }

  pointerMove(x: number, y: number): void {
    if (!this.drag) {
      // sliding off a pressed ability button abandons both tooltip and tap
      if (this.hold) {
        const h = this.hold;
        if (x < h.x - 18 || x > h.x + h.w + 18 || y < h.y - 18 || y > h.y + h.w + 18) this.hold = null;
      }
      return;
    }
    const wp = this.toWorld(x, y);
    this.drag.x = wp.x;
    this.drag.y = wp.y;
    if (this.drag.mode === "ability") {
      this.drag.hero.castGlow = Math.min(0.55, this.drag.hero.castGlow + 0.04);
      // once the aim gesture is really pulling, the tooltip peek is over
      if (this.hold && Math.hypot(this.drag.x - this.drag.startX, this.drag.y - this.drag.startY) > 14) this.hold = null;
    }
  }

  pointerUp(sx: number, sy: number): void {
    const hold = this.hold;
    this.hold = null;
    const drag = this.drag;
    this.drag = null;
    if (!drag) {
      // a tapped instant ability fires on release; a long hold only peeked
      if (
        hold &&
        hold.ability.def.targeting === "instant" &&
        hold.time < 0.45 &&
        hold.hero.alive &&
        hold.ability.timer <= 0 &&
        sx >= hold.x - 18 &&
        sx <= hold.x + hold.w + 18 &&
        sy >= hold.y - 18
      ) {
        this.battle.castAbility(hold.hero, hold.ability, this.save, null, null);
      }
      return;
    }
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
        this.moveCommandSerial += 1;
        this.moveMarks.push({ x, y, t: 0 });
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
    this.frameDt = dt;
    this.hintTime = Math.max(0, this.hintTime - dt);
    // teach the new game, once each, at the moment it matters
    if (!this.marchHintShown && this.battle.marching) {
      this.marchHintShown = true;
      this.showHint("The road goes on — the band marches to the next fight");
    }
    if (!this.threatHintShown && this.battle.bossRef?.alive && this.battle.cinematic <= 0 && this.battle.state === "fighting") {
      this.threatHintShown = true;
      this.showHint("It hunts whoever hurts it most — your warrior can hold its anger");
    }
    if (this.hold) this.hold.time += dt;
    for (const m of this.moveMarks) m.t += dt;
    this.moveMarks = this.moveMarks.filter((m) => m.t < 0.9);
    if (this.overlayActive() && (this.battle.state === "victory" || this.battle.state === "defeat")) {
      this.overlayAge += dt;
      // the loot card's reveal gets its moment: a chime as the face turns up
      if (this.pendingLoot && !this.lootRevealed && this.overlayAge > 0.5 + 0.45 * 0.5) {
        this.lootRevealed = true;
        audio.play(this.pendingLoot.rare ? "relic" : "coin");
        navigator.vibrate?.(this.pendingLoot.rare ? [15, 25, 45] : 15);
      }
    } else if (this.battle.state === "fighting") {
      this.overlayAge = 0;
      this.lootRevealed = false;
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
      if (!this.save.reducedMotion && this.save.screenShake && prevHp - hero.hp > 8) this.portraitShake[hero.id] = 0.35;
      this.prevHp[hero.id] = hero.hp;
      this.portraitShake[hero.id] = Math.max(0, (this.portraitShake[hero.id] ?? 0) - dt);
    }
    if (this.selected && !this.selected.alive) this.selected = null;

    // gentle coaching for brand-new players (never during tutorials)
    if (this.save.tutorialHints && this.freshPlayer && !this.tutorial && this.battle.state === "fighting" && !this.paused) {
      const b = this.battle;
      if (this.coachStage === 0 && b.time > 4 && b.ordersIssued === 0 && this.hintTime <= 0) {
        this.showHint("Drag a hero onto open ground to move — or onto a foe to attack");
      }
      if (b.ordersIssued > 0 && this.coachStage === 0) this.coachStage = 1;
      if (
        this.coachStage === 1 &&
        b.time > 10 &&
        Object.keys(b.castCounts).length === 0 &&
        this.hintTime <= 0 &&
        this.battle.heroes().some((h) => h.alive && h.abilities.some((a) => a.timer <= 0))
      ) {
        this.showHint("Glowing buttons are ready abilities — tap one, or drag it if it shows a dot");
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
    this.drawMoveMarks(ctx);
    this.drawTargetMarkers(ctx);
    this.drawCastingSigil(ctx);
    this.drawDragIndicators(ctx);
  }

  /** A brief planted pennant wherever a move order landed. */
  private drawMoveMarks(ctx: CanvasRenderingContext2D): void {
    for (const m of this.moveMarks) {
      const life = 1 - m.t / 0.9;
      const pop = Math.min(1, m.t / 0.12); // the flag plants with a little pop
      ctx.globalAlpha = life * 0.9;
      // expanding ground ring
      ctx.strokeStyle = "rgba(255,250,220,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + 2, 10 + m.t * 26, (10 + m.t * 26) * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      // pennant: pole + fluttering triangle
      const h = 22 * pop;
      ctx.strokeStyle = "#e0c896";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y + 2);
      ctx.lineTo(m.x, m.y + 2 - h);
      ctx.stroke();
      ctx.lineCap = "butt";
      if (pop >= 1) {
        const wave = Math.sin(this.battle.time * 9 + m.x) * 1.6;
        ctx.fillStyle = "#ffe9a3";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y + 2 - h);
        ctx.lineTo(m.x + 11, m.y + 2 - h + 3.4 + wave);
        ctx.lineTo(m.x, m.y + 2 - h + 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
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
    this.drawAbilityTooltip(ctx);
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
    // Battle owns the authoritative boss classification. Using its reference here
    // keeps the HUD in sync when new bosses are added (wyrm, Bell Widow, Stormjaw).
    const boss = this.battle.bossRef;
    if (!boss?.alive) return;
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
    if (boss.enemyKind) {
      const def = ENEMIES[boss.enemyKind];
      ctx.font = "800 8px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "rgba(232, 217, 160, 0.78)";
      ctx.textAlign = "left";
      ctx.fillText((def.role ?? "vanguard").toUpperCase(), x, y + 7);
      ctx.textAlign = "right";
      ctx.fillText((boss.element ?? def.affinity ?? "earth").toUpperCase(), x + w, y + 7);
    }
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
    // poise: the amber bar that promises a window
    if (this.battle.bossStaggerMax > 0) {
      const sfrac = Math.min(1, this.battle.bossStagger / this.battle.bossStaggerMax);
      roundRect(ctx, x, y + 22, w, 4, 2);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      if (sfrac > 0) {
        roundRect(ctx, x, y + 22, w * sfrac, 4, 2);
        ctx.fillStyle = sfrac > 0.85 ? `rgba(255, 233, 163, ${0.7 + Math.abs(Math.sin(this.battle.time * 6)) * 0.3})` : "#e0b23e";
        ctx.fill();
      }
      if (boss.effects.some((e) => e.kind === "stun")) {
        ctx.fillStyle = "#ffe9a3";
        ctx.font = "800 10px 'Trebuchet MS', Verdana, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("STAGGERED — strike now!", this.width / 2, y + 36);
      }
    }
    const phaseMarks = BOSS_PHASES[this.battle.bossRef?.enemyKind ?? "goblin"] ?? [];
    if (phaseMarks.length) {
      for (const mark of phaseMarks) {
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
      const bossKind = boss.enemyKind;
      const accent = bossKind ? ENEMIES[bossKind].trim : "#ff8a70";
      const bossName = boss.name.toUpperCase();
      ctx.textAlign = "center";
      ctx.font = `700 ${bossName.length > 24 ? 27 : bossName.length > 18 ? 30 : 34}px Cinzel, Palatino, 'Palatino Linotype', Georgia, serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(12, 9, 20, 0.9)";
      const y = this.height * 0.26;
      ctx.strokeText(bossName, this.width / 2, y);
      ctx.fillStyle = accent;
      ctx.fillText(bossName, this.width / 2, y);
      // flanking dashes give the name card some ceremony
      const nameW = ctx.measureText(bossName).width;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.width / 2 - nameW / 2 - 48, y - 10);
      ctx.lineTo(this.width / 2 - nameW / 2 - 14, y - 10);
      ctx.moveTo(this.width / 2 + nameW / 2 + 14, y - 10);
      ctx.lineTo(this.width / 2 + nameW / 2 + 48, y - 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "800 9px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "rgba(255,240,205,.78)";
      ctx.fillText(`GREAT FOE · WAYMARK ${this.battle.stage.id + 1}`, this.width / 2, y - 34);
      ctx.font = "600 italic 13px Georgia, serif";
      ctx.fillStyle = "#e6dcc2";
      const tip = (bossKind && BOSS_INTRO_TIPS[bossKind]) ?? "Read the warning. Move first, then answer.";
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
    ctx.fillText(this.battle.stage.name, 20, 29);
    // the road so far: a thin progress bar, no wave arithmetic shown
    const total = this.battle.stage.waves.length;
    if (total > 0 && !this.tutorial) {
      const marchFrac = this.battle.marching ? 1 - Math.max(0, this.battle.breakTimer) / 4.2 : 0;
      const p =
        this.battle.state === "victory"
          ? 1
          : Math.max(0, Math.min(1, (Math.max(0, this.battle.waveIndex) + marchFrac) / total));
      roundRect(ctx, 20, 44, 230, 5, 2.5);
      ctx.fillStyle = "rgba(18, 14, 24, 0.7)";
      ctx.fill();
      if (p > 0) {
        roundRect(ctx, 21, 45, 228 * p, 3, 1.5);
        ctx.fillStyle = "#e0c896";
        ctx.fill();
      }
      // the band itself, a little marker walking the road
      ctx.fillStyle = "#ffe9a3";
      ctx.beginPath();
      ctx.arc(21 + 228 * p, 46.5, 3.4, 0, Math.PI * 2);
      ctx.fill();
      if (this.battle.marching) {
        ctx.globalAlpha = 0.5 + Math.abs(Math.sin(this.battle.time * 3)) * 0.5;
        ctx.fillStyle = "#e0c896";
        ctx.font = "700 10.5px 'Trebuchet MS', Verdana, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("the band marches on…", 258, 49);
        ctx.globalAlpha = 1;
      }
    }
    if (this.battle.stage.terrain && !this.tutorial) {
      const terrain = this.battle.stage.terrain;
      const tide = terrain === "tide" || terrain === "tide-storm";
      const labels: Record<typeof terrain, string> = {
        tide: this.battle.tideHigh ? "TIDE HIGH" : "TIDE TURNING", storm: "STORM ACTIVE", "tide-storm": `${this.battle.tideHigh ? "TIDE HIGH" : "TIDE TURNING"} · LIGHTNING`,
        cinder: "VENTS ERUPTING", overgrowth: "ROOTS STIRRING", mirage: "MIRAGE SHIFTING", sanctified: "VERDICT GATHERING", hunt: "THE HUNT MOVES", void: "ROAD UNMAKING",
      };
      const colors: Record<typeof terrain, [string, string, string]> = {
        tide: ["rgba(18,42,50,.78)", "#9ee9ed", "#c9eef0"], storm: ["rgba(18,42,50,.78)", "#9ee9ed", "#c9eef0"], "tide-storm": ["rgba(18,42,50,.78)", "#9ee9ed", "#c9eef0"],
        cinder: ["rgba(61,29,25,.82)", "#ff9b52", "#ffe0b2"], overgrowth: ["rgba(25,55,38,.82)", "#a8d978", "#e5f3bb"], mirage: ["rgba(35,29,63,.82)", "#c5adeb", "#eee3ff"],
        sanctified: ["rgba(67,54,35,.82)", "#f0d187", "#fff0bc"], hunt: ["rgba(67,25,37,.82)", "#ef7c75", "#ffd3c9"], void: ["rgba(27,23,42,.86)", "#aa9ce0", "#e5dcff"],
      };
      const label = labels[terrain];
      const chipW = terrain === "tide-storm" ? 176 : Math.max(118, label.length * 7 + 28);
      const chipX = this.width / 2 - chipW / 2;
      ctx.fillStyle = colors[terrain][0];
      roundRect(ctx, chipX, 10, chipW, 30, 8);
      ctx.fill();
      ctx.strokeStyle = tide && !this.battle.tideHigh ? "rgba(145, 194, 196, 0.55)" : colors[terrain][1];
      ctx.lineWidth = 1.2;
      roundRect(ctx, chipX, 10, chipW, 30, 8);
      ctx.stroke();
      ctx.fillStyle = colors[terrain][2];
      ctx.font = "800 10px 'Trebuchet MS', Verdana, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, this.width / 2, 29);
      ctx.textAlign = "left";
    }
    // pause button
    ctx.fillStyle = "rgba(20, 16, 28, 0.55)";
    roundRect(ctx, this.width - 42, 10, 32, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#f2ecd8";
    ctx.fillRect(this.width - 33, 17, 4.5, 16);
    ctx.fillRect(this.width - 25, 17, 4.5, 16);
    // AUTO chip: lets the band fight for itself on farmed stages
    if (this.battle.state === "fighting" && !this.tutorial) {
      const on = this.autopilot;
      ctx.fillStyle = on ? "rgba(56, 44, 20, 0.75)" : "rgba(20, 16, 28, 0.55)";
      roundRect(ctx, this.width - 100, 10, 52, 30, 8);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = `rgba(255, 233, 163, ${0.5 + Math.abs(Math.sin(this.battle.time * 3)) * 0.5})`;
        ctx.lineWidth = 1.6;
        roundRect(ctx, this.width - 100, 10, 52, 30, 8);
        ctx.stroke();
      }
      ctx.fillStyle = on ? "#ffe9a3" : "rgba(242, 236, 216, 0.55)";
      ctx.font = "800 11px 'Trebuchet MS', Verdana, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AUTO", this.width - 74, 29);
      ctx.textAlign = "left";
    }
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
    ctx.font = `600 ${this.save.bigText ? 16.5 : 14}px 'Trebuchet MS', Verdana, sans-serif`;
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
    // Battleheart rule: the selected hero's cluster stretches to seat every
    // ability button; the others fold to compact portrait cards. (Equal-width
    // clusters could never fit a full row for a full band on 16:9 screens.)
    const effSel = this.selected && this.selected.alive ? this.selected : (this.battle.livingHeroes()[0] ?? heroes[0]);
    const compactW = Math.min(104, this.width / count);
    const bs = 46;
    const selBtns = Math.max(1, effSel?.abilities.length ?? 1);
    const selNeed = 8 + 52 + 7 + selBtns * (bs + 6) + 6;
    const selW = Math.max(compactW, Math.min(this.width - compactW * (count - 1), Math.max(230, selNeed)));
    // clusters glide open and closed instead of snapping when selection moves
    const ease = this.save.reducedMotion ? 1 : Math.min(1, this.frameDt * 14);
    const widths = heroes.map((h) => {
      const target = h === effSel ? selW : compactW;
      const cur = this.clusterAnim[h.id] ?? target;
      const next = Math.abs(target - cur) < 0.5 ? target : cur + (target - cur) * ease;
      this.clusterAnim[h.id] = next;
      return next;
    });
    const rowX0 = (this.width - widths.reduce((a, b) => a + b, 0)) / 2;
    let clusterX = rowX0;
    for (let i = 0; i < heroes.length; i++) {
      const hero = heroes[i];
      const cw = widths[i];
      if (i > 0) clusterX += widths[i - 1];
      const def = HEROES[hero.heroIndex];
      const shakeAmt = this.portraitShake[hero.id] ?? 0;
      const shakeX = shakeAmt > 0 ? Math.sin(this.battle.time * 60) * shakeAmt * 10 : 0;
      const x0 = clusterX + 8 + shakeX;
      const py = top + 12;
      const ps = 52;

      // cluster card
      roundRect(ctx, clusterX + 3, top + 7, cw - 6, HUD_H - 14, 10);
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
      const breathe = 0.75 + Math.abs(Math.sin(this.battle.time * 2.2)) * 0.25;
      ctx.strokeStyle = critical
        ? `rgba(255, 90, 72, ${0.55 + Math.abs(Math.sin(this.battle.time * 5)) * 0.45})`
        : isSel
          ? `rgba(255, 233, 163, ${this.save.reducedMotion ? 1 : breathe})`
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

      // the path's Waymark is pinned to the portrait corner
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

      // active effects march along the portrait's bottom edge
      if (hero.alive) {
        const shown = hero.effects.filter((e) => e.time > 0).slice(0, 4);
        shown.forEach((eff, k) => this.drawEffectPip(ctx, x0 + 8 + k * 12.5, py + ps - 8, eff.kind, eff.time));
      }

      // hp sliver under portrait
      const frac = Math.max(0, hero.hp / hero.stats.maxHp);
      ctx.fillStyle = "rgba(18,14,24,0.8)";
      roundRect(ctx, x0, py + ps + 6, ps, 7, 3);
      ctx.fill();
      if (frac > 0) {
        ctx.fillStyle = frac > 0.35 ? (this.save.colorSafe ? "#5aa7ff" : "#6fce65") : "#e0b23e";
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

      // ability buttons: only the selected hero unfolds their full row.
      // folded cards still whisper when something is ready to fire.
      if (hero !== effSel) {
        if (hero.alive && hero.ultCharge >= 100) {
          const pulse = 0.6 + Math.abs(Math.sin(this.battle.time * 4)) * 0.4;
          const oathColor = callingById(hero.calling)?.color ?? "#ffe9a3";
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.translate(x0 + ps - 4, py + ps - 4);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = oathColor;
          ctx.fillRect(-4.5, -4.5, 9, 9);
          ctx.strokeStyle = "#fff6d8";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-4.5, -4.5, 9, 9);
          ctx.restore();
        }
        continue;
      }
      const bx0 = x0 + ps + 7;
      for (let a = 0; a < hero.abilities.length; a++) {
        const ability = hero.abilities[a];
        const bx = bx0 + a * (bs + 6);
        const by = py + 4;
        if (bx + bs > clusterX + cw - 2) break;
        this.drawAbilityButton(ctx, bx, by, bs, hero, ability, this.readyFlash[hero.id * 10 + a] ?? 0);
        // key label for keyboard players
        if (FINE_POINTER) {
          const bind = this.save.keybinds?.[ability.ult ? "ability3" : ability.armorSkill ? "ability4" : `ability${a + 1}`];
          if (bind && bind.length === 1) {
            ctx.fillStyle = "rgba(12, 9, 18, 0.85)";
            roundRect(ctx, bx - 3, by - 3, 13, 13, 4);
            ctx.fill();
            ctx.fillStyle = "#cfc7de";
            ctx.font = "800 9px 'Trebuchet MS', Verdana, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(bind.toUpperCase(), bx + 3.5, by + 6.5);
          }
        }
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

  /** Tiny status chip: what's riding on this hero right now. */
  private drawEffectPip(ctx: CanvasRenderingContext2D, cx: number, cy: number, kind: string, time: number): void {
    const COLORS: Record<string, string> = {
      shield: "#7db4e8",
      haste: "#8ee88b",
      guard: "#c9d2dd",
      stun: "#ffe9a3",
      slow: "#7de8e0",
      burn: "#ff9a5a",
      taunt: "#ff8a70",
      vulnerable: "#c9a0ff",
    };
    const color = COLORS[kind] ?? "#cfc7de";
    // expiring effects blink out
    ctx.globalAlpha = time < 1 ? 0.35 + Math.abs(Math.sin(this.battle.time * 8)) * 0.65 : 1;
    ctx.fillStyle = "rgba(16, 12, 24, 0.9)";
    roundRect(ctx, cx - 5.5, cy - 5.5, 11, 11, 3);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    roundRect(ctx, cx - 5.5, cy - 5.5, 11, 11, 3);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    switch (kind) {
      case "shield": // a little kite shield
        ctx.moveTo(cx, cy - 3.2);
        ctx.lineTo(cx + 2.8, cy - 1.4);
        ctx.quadraticCurveTo(cx + 2.4, cy + 2, cx, cy + 3.4);
        ctx.quadraticCurveTo(cx - 2.4, cy + 2, cx - 2.8, cy - 1.4);
        ctx.closePath();
        ctx.stroke();
        break;
      case "haste": // double chevron
        ctx.moveTo(cx - 3, cy - 2.6);
        ctx.lineTo(cx - 0.6, cy);
        ctx.lineTo(cx - 3, cy + 2.6);
        ctx.moveTo(cx + 0.6, cy - 2.6);
        ctx.lineTo(cx + 3, cy);
        ctx.lineTo(cx + 0.6, cy + 2.6);
        ctx.stroke();
        break;
      case "guard": // heavy bracket
        ctx.moveTo(cx - 2.8, cy - 3);
        ctx.lineTo(cx - 2.8, cy + 3);
        ctx.moveTo(cx + 2.8, cy - 3);
        ctx.lineTo(cx + 2.8, cy + 3);
        ctx.moveTo(cx - 2.8, cy);
        ctx.lineTo(cx + 2.8, cy);
        ctx.stroke();
        break;
      case "stun": // dazed star
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4);
        }
        ctx.stroke();
        break;
      case "slow": // snowflake
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.moveTo(cx - Math.cos(a) * 3.4, cy - Math.sin(a) * 3.4);
          ctx.lineTo(cx + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4);
        }
        ctx.stroke();
        break;
      case "burn": // flame lick
        ctx.moveTo(cx, cy + 3.2);
        ctx.quadraticCurveTo(cx - 3, cy, cx - 0.6, cy - 1.4);
        ctx.quadraticCurveTo(cx + 0.4, cy - 2.4, cx, cy - 3.4);
        ctx.quadraticCurveTo(cx + 3.2, cy - 0.6, cx, cy + 3.2);
        ctx.closePath();
        ctx.fill();
        break;
      case "taunt": // exclamation
        ctx.moveTo(cx, cy - 3.2);
        ctx.lineTo(cx, cy + 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 3, 0.9, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "vulnerable": // cracked-open arrow down
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx, cy + 2.6);
        ctx.moveTo(cx - 2.4, cy + 0.4);
        ctx.lineTo(cx, cy + 3.2);
        ctx.lineTo(cx + 2.4, cy + 0.4);
        ctx.stroke();
        break;
      default:
        ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.lineCap = "butt";
    ctx.globalAlpha = 1;
  }

  /** Hold an ability button ~half a second and its card unfolds above the bar. */
  private drawAbilityTooltip(ctx: CanvasRenderingContext2D): void {
    const hold = this.hold;
    if (!hold || hold.time < 0.42 || this.overlayActive()) return;
    const def = hold.ability.def;
    const grow = Math.min(1, (hold.time - 0.42) / 0.12);
    // wrap the blurb to ~2 lines
    ctx.font = "600 11.5px 'Trebuchet MS', Verdana, sans-serif";
    const words = def.blurb.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 186 && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const path = hold.ability.ult ? callingById(hold.hero.calling) : null;
    const element = def.element && def.element !== "physical" ? elementById(def.element) : null;
    const footer = hold.ability.ult
      ? path
        ? `ULTIMATE · ${path.chargeHint}`
        : "ULTIMATE"
      : hold.ability.armorSkill
        ? `ARMOR SKILL · cooldown ${def.cooldown}s`
        : `${element ? `${element.name.toUpperCase()} · ` : ""}cooldown ${def.cooldown}s${def.targeting === "instant" ? "" : " · drag to aim"}`;
    const w = 210;
    const h = 44 + lines.length * 14;
    const x = Math.max(8, Math.min(this.width - w - 8, hold.x + hold.w / 2 - w / 2));
    const y = this.height - HUD_H - h - 10;
    ctx.save();
    ctx.globalAlpha = grow;
    ctx.translate(0, (1 - grow) * 8);
    ctx.fillStyle = "rgba(24, 18, 38, 0.94)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 1.6;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    // little tail pointing at the held button
    const tx = Math.max(x + 14, Math.min(x + w - 14, hold.x + hold.w / 2));
    ctx.fillStyle = "rgba(24, 18, 38, 0.94)";
    ctx.beginPath();
    ctx.moveTo(tx - 7, y + h);
    ctx.lineTo(tx, y + h + 7);
    ctx.lineTo(tx + 7, y + h);
    ctx.closePath();
    ctx.fill();
    drawAbilityGlyph(ctx, def.icon, x + 17, y + 17, 8.5, def.color);
    ctx.fillStyle = def.color;
    ctx.font = "800 13px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(def.name, x + 32, y + 21);
    ctx.fillStyle = "#e8e2f2";
    ctx.font = "600 11.5px 'Trebuchet MS', Verdana, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l, x + 12, y + 38 + i * 14));
    ctx.fillStyle = "#a89fc0";
    ctx.font = "700 10px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillText(footer, x + 12, y + h - 8);
    ctx.restore();
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
      // the meter IS the button: charge fills bottom-up in the path color
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
    ctx.fillStyle = "rgba(8, 7, 11, 0.78)";
    ctx.fillRect(0, 0, this.width, this.height);
    const w = 340;
    const x = this.width / 2 - w / 2;
    const y = this.height / 2 - h / 2 - 20;
    // A field-ledger leaf: flat ink, a brass binding and ruled paper. This is
    // the same visual language as Settings and the Handbook, carried into play.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#211b25");
    g.addColorStop(0.18, "#19151d");
    g.addColorStop(1, "#141119");
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(207, 181, 121, 0.62)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 5);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(x, y, 4, h);
    ctx.globalAlpha = 1;
    // faint ledger rules keep the large sheet from feeling like an empty card
    ctx.strokeStyle = "rgba(229, 215, 187, 0.035)";
    for (let lineY = y + 70; lineY < y + h - 8; lineY += 22) {
      ctx.beginPath();
      ctx.moveTo(x + 14, lineY);
      ctx.lineTo(x + w - 14, lineY);
      ctx.stroke();
    }
    ctx.fillStyle = "#9c8c70";
    ctx.font = "700 7.5px ui-monospace, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText("WAYFINDER'S FIELD LEDGER", x + 24, y + 18);
    ctx.fillStyle = accent;
    ctx.font = "700 23px Cinzel, Palatino, Georgia, serif";
    ctx.fillText(title.toUpperCase(), x + 24, y + 46);
    ctx.strokeStyle = "rgba(207, 181, 121, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 56);
    ctx.lineTo(x + w - 18, y + 56);
    ctx.stroke();
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
    ctx.fillStyle = "rgba(35, 29, 41, 0.94)";
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(211, 193, 155, 0.28)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 4);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = "#f2ecd8";
    ctx.font = "700 13.5px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, y + 25.5);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + w - 13, y + h / 2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    this.overlayButtons.push({ id, x, y, w, h, label });
  }

  private drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
    const frame = this.drawOverlayFrame(ctx, "Paused", "#ffe9a3", 296);
    const bw = frame.w - 60;
    const bx = frame.x + 30;
    this.addOverlayButton(ctx, "resume", "Resume", bx, frame.y + 64, bw);
    this.addOverlayButton(ctx, "retry", this.battle.tutorialMode ? "Restart Lesson" : "Restart Battle", bx, frame.y + 108, bw);
    this.addOverlayButton(ctx, "map", this.battle.tutorialMode ? "Leave Lesson" : "Retreat to Map", bx, frame.y + 152, bw);
    this.addOverlayButton(ctx, "speed", `Combat speed: ${speedLabel(this.save.speed)}`, bx, frame.y + 196, bw);
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
      victory ? 384 : 262,
    );
    ctx.fillStyle = "#cfc7de";
    ctx.font = "600 14px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = "center";
    const mins = Math.floor(this.battle.time / 60);
    const secs = String(Math.floor(this.battle.time % 60)).padStart(2, "0");
    if (victory) {
      const mult = DIFFICULTIES[this.save.difficulty ?? 1]?.rewardMult ?? 1;
      const xp = this.rewardOverride?.xp ?? Math.round((this.battle.xpEarned + this.battle.stage.xpReward) * mult);
      const gold = this.rewardOverride?.gold ?? Math.round((this.battle.goldEarned + Math.round(this.battle.stage.xpReward * 0.8)) * mult);
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
      drawReward(rowY + 24, `+${shownGold}`, "gold", "coin");
      // battle summary
      ctx.font = "600 12px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = "#a89fc0";
      ctx.fillText(
        this.rewardOverride?.note ?? `Cleared in ${mins}:${secs} · ${this.battle.heroDeaths === 0 ? "no heroes fell" : `${this.battle.heroDeaths} hero${this.battle.heroDeaths === 1 ? "" : "es"} fell`}`,
        this.width / 2,
        rowY + 44,
      );
      // the recap: what each hero actually did, with a crown for the battle's finest
      const band = this.battle.heroes();
      if (band.length) {
        const recapY = rowY + 58;
        const cw = (frame.w - 52) / band.length;
        let mvp = -1;
        let mvpScore = 0;
        band.forEach((h, i) => {
          const t = this.battle.tallies[h.heroIndex] ?? { dealt: 0, taken: 0, healed: 0 };
          const score = t.dealt + t.healed * 1.1;
          if (score > mvpScore) {
            mvpScore = score;
            mvp = i;
          }
        });
        band.forEach((h, i) => {
          const t = this.battle.tallies[h.heroIndex] ?? { dealt: 0, taken: 0, healed: 0 };
          const cx = frame.x + 26 + cw * i + cw / 2;
          const isMvp = i === mvp && mvpScore > 0;
          if (isMvp) {
            // a small crown over the name
            ctx.fillStyle = "#ffd76b";
            ctx.beginPath();
            ctx.moveTo(cx - 7, recapY - 1);
            ctx.lineTo(cx - 7, recapY - 7);
            ctx.lineTo(cx - 3.2, recapY - 3.6);
            ctx.lineTo(cx, recapY - 8.5);
            ctx.lineTo(cx + 3.2, recapY - 3.6);
            ctx.lineTo(cx + 7, recapY - 7);
            ctx.lineTo(cx + 7, recapY - 1);
            ctx.closePath();
            ctx.fill();
          }
          ctx.font = "800 11px 'Trebuchet MS', Verdana, sans-serif";
          ctx.fillStyle = isMvp ? "#ffd76b" : "#e8e2f2";
          ctx.fillText(HEROES[h.heroIndex].name, cx, recapY + 11);
          ctx.font = "700 10px 'Trebuchet MS', Verdana, sans-serif";
          ctx.fillStyle = "#ffcf8e";
          ctx.fillText(`dmg ${Math.round(t.dealt)}`, cx, recapY + 25);
          ctx.fillStyle = "#8ee88b";
          ctx.fillText(`heal ${Math.round(t.healed)}`, cx, recapY + 38);
          ctx.fillStyle = "#c98f9a";
          ctx.fillText(`took ${Math.round(t.taken)}`, cx, recapY + 51);
          if (i > 0) {
            ctx.strokeStyle = "rgba(255,245,225,0.1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(frame.x + 26 + cw * i, recapY + 2);
            ctx.lineTo(frame.x + 26 + cw * i, recapY + 48);
            ctx.stroke();
          }
        });
      }
      // loot reveal: card flips in after a beat
      if (this.pendingLoot) {
        const flip = Math.min(1, Math.max(0, (this.overlayAge - 0.5) / 0.45));
        const scaleX = flip < 0.5 ? 1 - flip * 2 : flip * 2 - 1;
        const showFace = flip >= 0.5;
        const cw = 216;
        const ch = 34;
        const cxm = this.width / 2;
        const cy = frame.y + 216;
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
      const enemies = this.battle.units.filter((unit) => unit.team === "enemy");
      const casts = Object.values(this.battle.castCounts).reduce((sum, count) => sum + count, 0);
      const tip = enemies.some((unit) => unit.enemyKind === "shaman" || unit.enemyKind === "snowhag")
        ? "Next try: focus the enemy healer before the front line"
        : enemies.some((unit) => ["alpha", "warlord", "rimeheart", "wyrm"].includes(unit.enemyKind ?? ""))
          ? "Next try: preserve movement for marked ground and boss windups"
          : casts < 2
            ? "Next try: use ready abilities early instead of saving every cooldown"
            : this.battle.ordersIssued < 3
              ? "Next try: reposition often and pull wounded heroes out of focus fire"
              : this.save.heroes.some((hero, index) => hero.recruited && this.save.unspent[index] > 0)
                ? "Next try: spend the waiting attribute points in Party"
                : "Next try: inspect the scout report or lower difficulty for this road";
      ctx.fillText(
        `The road claimed them · ${mins}:${secs}`,
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
      this.addOverlayButton(ctx, "continue", "Continue", bx, frame.y + 268, bw, "#8ee88b");
      this.addOverlayButton(ctx, "retry", "Replay", bx, frame.y + 316, (bw - 10) / 2);
      this.addOverlayButton(ctx, "share", "Share", bx + (bw - 10) / 2 + 10, frame.y + 316, (bw - 10) / 2, "#ffe9a3");
    } else {
      this.addOverlayButton(ctx, "retry", "Try Again", bx, frame.y + 126, bw, "#ff8a70");
      this.addOverlayButton(ctx, "map", "Back to Map", bx, frame.y + 174, bw);
    }
  }
}
