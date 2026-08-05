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
    kind: string = "basics",
  ) {
    this.startPositions = battle.heroes().map((h) => ({ x: h.x, y: h.y }));
    const mid = () => ({
      x: (battle.field.left + battle.field.right) / 2 + 60,
      y: (battle.field.top + battle.field.bottom) / 2,
    });
    if (kind === "gestures") {
      this.steps = this.gestureSteps(mid);
    } else if (kind === "healing") {
      this.steps = this.healingSteps();
    } else {
      this.steps = this.basicSteps(mid);
    }
    this.advance();
  }

  private basicSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    return [
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
  }

  private gestureSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    const line = (n: number) => {
      const m = mid();
      for (let i = 0; i < n; i++) battle.spawnEnemy("goblin", { x: m.x + 20 + i * 46, y: m.y - 30 + i * 30, scale: 0.5 });
    };
    return [
      {
        text: "Aimed spells are drawn, not tapped.",
        sub: "Press a spell button, drag onto the field, release to cast.",
        check: () => this.stepTime > 2.6,
      },
      {
        text: "Piercing Shot: drag Wren's button through the goblin line.",
        sub: "The ray skewers everything along it.",
        onEnter: () => line(3),
        target: () => this.hud.abilityButtonCenter("pierce"),
        check: () => this.abilityUsed("pierce"),
      },
      {
        text: "Fireball: drag Ezri's button onto the cluster, release to drop it.",
        sub: "The circle shows the blast before you let go.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("goblin", { x: m.x + 40, y: m.y - 20, scale: 0.5 });
          battle.spawnEnemy("goblin", { x: m.x + 66, y: m.y + 18, scale: 0.5 });
        },
        target: () => this.hud.abilityButtonCenter("fireball"),
        check: () => this.abilityUsed("fireball"),
      },
      {
        text: "Frostwake: drag to lay a freezing trail across their path.",
        sub: "Foes crossing it are chilled and slowed.",
        target: () => this.hud.abilityButtonCenter("frostwake"),
        check: () => this.abilityUsed("frostwake"),
      },
      {
        text: "Sharp shooting. You're a natural.",
        sub: "Every aimed spell works this way.",
        onEnter: () => {
          for (const enemy of battle.livingEnemies()) battle.damage(enemy, 99999, null);
        },
        check: () => this.stepTime > 3,
      },
    ];
  }

  private healingSteps(): TutStep[] {
    const battle = this.battle;
    return [
      {
        text: "A healer keeps the band on its feet.",
        sub: "Sol's Spirit powers every mend.",
        check: () => this.stepTime > 2.6,
      },
      {
        text: "Bram is wounded! Drag Sol onto him to channel healing.",
        sub: "He'll keep mending until you give a new order.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          bram.hp = Math.round(bram.stats.maxHp * 0.3);
        },
        target: () => {
          const sol = battle.heroes()[1];
          return sol?.alive ? { x: sol.x, y: sol.y - 18 } : null;
        },
        check: () => {
          const bram = battle.heroes()[0];
          return bram.hp > bram.stats.maxHp * 0.6;
        },
      },
      {
        text: "Mend is a burst: press the button, release on Bram.",
        sub: "Big instant healing on one ally.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          bram.hp = Math.round(bram.stats.maxHp * 0.4);
        },
        target: () => this.hud.abilityButtonCenter("mend"),
        check: () => this.abilityUsed("mend"),
      },
      {
        text: "The ✚ chip on Sol's portrait is his stance.",
        sub: "Tap it: mend mode heals allies on his own; fight mode attacks.",
        target: () => this.hud.stanceChipCenter(),
        check: () => battle.heroes()[1]?.stance === "attack",
      },
      {
        text: "Tap it again to put him back to mending.",
        sub: "Rotate stances freely mid-battle.",
        target: () => this.hud.stanceChipCenter(),
        check: () => battle.heroes()[1]?.stance === "heal",
      },
      {
        text: "The band is in good hands.",
        sub: "High Spirit heroes make the best menders.",
        check: () => this.stepTime > 3,
      },
    ];
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
