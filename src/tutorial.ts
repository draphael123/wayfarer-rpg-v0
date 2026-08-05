import type { Battle } from "./battle";
import type { Hud } from "./hud";
import type { Unit, Vec } from "./types";

interface TutStep {
  text: string;
  sub: string;
  onEnter?: () => void;
  /** Returns true when the step's goal is met. */
  check: () => boolean;
  /** Where the animated pointer should aim this frame. */
  target?: () => { x: number; y: number } | null;
}

/**
 * Scripted teaching arena. Runs on a battle created with tutorialMode = true —
 * waves never auto-spawn, heroes can't die, and this controller spawns weak
 * enemies and advances instructions as the player performs each action.
 */
export class Tutorial {
  private steps: TutStep[];
  private index = -1;
  private stepTime = 0;
  private startPositions: Vec[];
  done = false;

  constructor(
    private battle: Battle,
    private hud: Hud,
  ) {
    this.startPositions = battle.heroes().map((h) => ({ x: h.x, y: h.y }));
    const mid = () => ({
      x: (battle.field.left + battle.field.right) / 2 + 60,
      y: (battle.field.top + battle.field.bottom) / 2,
    });
    this.steps = [
      {
        text: "Meet Bram and Sol — your band begins here.",
        sub: "More companions join as your legend grows.",
        check: () => this.stepTime > 2.6,
      },
      {
        text: "Drag a hero onto open ground to move.",
        sub: "Touch a hero, drag anywhere, release.",
        target: () => {
          const bram = battle.heroes()[0];
          return bram.alive ? { x: bram.x, y: bram.y - 18 } : null;
        },
        check: () =>
          battle
            .heroes()
            .some((h, i) => Math.hypot(h.x - this.startPositions[i].x, h.y - this.startPositions[i].y) > 40),
      },
      {
        text: "A goblin! Drag Bram onto it to attack.",
        sub: "He'll chase it down and fight on his own.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("goblin", { x: m.x + 40, y: m.y, scale: 0.55 });
        },
        target: () => {
          const enemy = battle.livingEnemies()[0];
          return enemy ? { x: enemy.x, y: enemy.y - 16 } : null;
        },
        check: () => battle.livingEnemies().length === 0 && this.stepTime > 1,
      },
      {
        text: "Tap Bram's Cleave button below.",
        sub: "Instant abilities fire the moment you tap them.",
        target: () => this.hud.abilityButtonCenter("cleave"),
        check: () => this.abilityUsed("cleave"),
      },
      {
        text: "Bram is hurt! Press Sol's Mend, drag onto Bram, release.",
        sub: "Hold the button, drag the beam onto Bram, let go.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          bram.hp = Math.round(bram.stats.maxHp * 0.35);
        },
        target: () => this.hud.abilityButtonCenter("mend"),
        check: () => this.abilityUsed("mend"),
      },
      {
        text: "Sol also mends on his own — see the ✚ on his portrait.",
        sub: "Tap it anytime to switch him between mending and fighting.",
        target: () => this.hud.stanceChipCenter(),
        check: () => this.stepTime > 4,
      },
      {
        text: "You're ready. The road awaits!",
        sub: "Train attributes between battles to unlock new abilities.",
        onEnter: () => {
          for (const enemy of this.battle.livingEnemies()) this.battle.damage(enemy, 99999, null);
        },
        check: () => this.stepTime > 3,
      },
    ];
    this.advance();
  }

  private abilityUsed(id: string): boolean {
    return this.battle.heroes().some((h: Unit) => h.abilities.some((a) => a.def.id === id && a.timer > 0));
  }

  private advance(): void {
    this.index++;
    this.stepTime = 0;
    if (this.index >= this.steps.length) {
      this.done = true;
      this.hud.tutorial = null;
      return;
    }
    this.steps[this.index].onEnter?.();
    const step = this.steps[this.index];
    this.hud.tutorial = { text: step.text, sub: step.sub, step: this.index, total: this.steps.length };
  }

  update(dt: number): void {
    if (this.done) return;
    this.stepTime += dt;
    const step = this.steps[this.index];
    if (this.hud.tutorial) this.hud.tutorial.highlight = step.target?.() ?? null;
    if (step.check()) this.advance();
  }
}
