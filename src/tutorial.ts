import type { Battle } from "./battle";
import type { Hud } from "./hud";
import type { Unit, Vec } from "./types";

interface TutStep {
  text: string;
  sub: string;
  onEnter?: () => void;
  /** Returns true when the step's goal is met. */
  check: () => boolean;
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
        text: "This is your band of four.",
        sub: "Each hero is shaped by the attributes you give them.",
        check: () => this.stepTime > 2.6,
      },
      {
        text: "Drag a hero onto open ground to move.",
        sub: "Touch a hero, drag anywhere, release.",
        check: () =>
          battle
            .heroes()
            .some((h, i) => Math.hypot(h.x - this.startPositions[i].x, h.y - this.startPositions[i].y) > 40),
      },
      {
        text: "A goblin! Drag a hero onto it to attack.",
        sub: "They'll chase it down and fight on their own.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("goblin", { x: m.x + 40, y: m.y, scale: 0.55 });
        },
        check: () => battle.livingEnemies().length === 0 && this.stepTime > 1,
      },
      {
        text: "Tap Bram's Cleave button below.",
        sub: "Instant abilities fire the moment you tap them.",
        check: () => this.abilityUsed("cleave"),
      },
      {
        text: "Press Ezri's Fireball, drag onto the goblins, release.",
        sub: "Aimed abilities are drawn onto the battlefield.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("goblin", { x: m.x + 30, y: m.y - 25, scale: 0.55 });
          battle.spawnEnemy("goblin", { x: m.x + 55, y: m.y + 25, scale: 0.55 });
        },
        check: () => this.abilityUsed("fireball"),
      },
      {
        text: "Bram is hurt! Drag Sol onto him to heal.",
        sub: "Sol keeps mending until you give a new order.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          bram.hp = Math.round(bram.stats.maxHp * 0.4);
        },
        check: () => {
          const bram = battle.heroes()[0];
          return bram.hp > bram.stats.maxHp * 0.75;
        },
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
    if (this.steps[this.index].check()) this.advance();
  }
}
