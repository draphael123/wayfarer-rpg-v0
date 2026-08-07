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
    } else if (kind === "roles") {
      this.steps = this.roleSteps(mid);
    } else if (kind === "elements") {
      this.steps = this.elementSteps(mid);
    } else if (kind === "bosses") {
      this.steps = this.bossSteps(mid);
    } else if (kind === "fieldcraft") {
      this.steps = this.fieldcraftSteps(mid);
    } else {
      this.steps = this.basicSteps(mid);
    }
    this.advance();
  }

  private basicSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    let ordersBefore = 0;
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
        text: "There is a second command style: tap Bram's portrait, then tap the field.",
        sub: "Use whichever feels natural — drag orders and tap orders do the same work.",
        onEnter: () => { ordersBefore = battle.ordersIssued; },
        target: () => this.hud.heroPortraitCenter(0),
        check: () => battle.ordersIssued > ordersBefore,
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
        text: "Sol also mends on his own — tap the ✚ on his portrait now.",
        sub: "The stance chip switches him from mending to fighting.",
        target: () => this.hud.stanceChipCenter(),
        check: () => battle.heroes()[1]?.stance === "attack",
      },
      {
        text: "Tap the stance again to return Sol to mending.",
        sub: "You can change a healer's job at any moment.",
        target: () => this.hud.stanceChipCenter(),
        check: () => battle.heroes()[1]?.stance === "heal",
      },
      {
        text: "You're ready. The road awaits!",
        sub: "At level 5, combine a Discipline and Attunement to forge an elemental Path.",
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
        text: "Aimed techniques are drawn, not tapped.",
        sub: "Press a technique button, drag onto the field, release to cast.",
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
        sub: "Every aimed technique works this way.",
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

  private fieldcraftSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    let dangerAt: Vec | null = null;
    let focus: Unit | null = null;
    let moveCommandsAt = 0;
    return [
      {
        text: "Read the field before chasing damage.",
        sub: "Bright marked ground is a promise: something dangerous will land there.",
        check: () => this.stepTime > 2.6,
      },
      {
        text: "Bram is marked. Move him outside the warning ring.",
        sub: "Warning time can be lengthened in Settings without changing rewards.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          dangerAt = { x: bram.x, y: bram.y };
          moveCommandsAt = this.hud.moveCommandSerial;
          const m = mid();
          battle.spawnEnemy("brute", { x: m.x + 150, y: m.y, scale: 0.32 });
          focus = battle.livingEnemies()[0] ?? null;
          if (focus) {
            focus.stats.maxHp = Math.max(focus.stats.maxHp, 5000);
            focus.hp = focus.stats.maxHp;
            focus.effects.push({ kind: "stun", time: 999, power: 1, source: null });
            battle.telegraphs.push({ x: dangerAt.x, y: dangerAt.y, radius: 62, time: 0, duration: 60, owner: focus, kind: "sweep", label: "MOVE" });
          }
        },
        target: () => dangerAt,
        check: () => {
          const bram = battle.heroes()[0];
          return !!dangerAt && this.hud.moveCommandSerial > moveCommandsAt && Math.hypot(bram.x - dangerAt.x, bram.y - dangerAt.y) > 82;
        },
      },
      {
        text: "Now double-tap the Brute to focus the whole band.",
        sub: "A bright ring confirms that every available fighter is converging.",
        onEnter: () => {
          battle.telegraphs = battle.telegraphs.filter((mark) => mark.label !== "MOVE");
          if (focus) focus.effects = focus.effects.filter((effect) => effect.kind !== "stun");
        },
        target: () => focus?.alive ? { x: focus.x, y: focus.y - 18 } : null,
        check: () => !!focus && this.hud.lastBandFocusId === focus.id,
      },
      {
        text: "Waymarks reveal an enemy's elemental weakness and resistance.",
        sub: "A normal weakness adds 25% damage; a resistance trims 20%. Boss matchups are gentler.",
        check: () => this.stepTime > 4,
      },
      {
        text: "Against bosses: marked ground means move; the amber bar is poise.",
        sub: "Break poise to stagger the boss. Phase diamonds show when its tactics will change.",
        onEnter: () => {
          for (const enemy of battle.livingEnemies()) battle.damage(enemy, 99999, null);
        },
        check: () => this.stepTime > 4,
      },
    ];
  }

  private roleSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    let support: Unit | null = null;
    let tank: Unit | null = null;
    return [
      {
        text: "Enemy roles tell you what must be solved first.",
        sub: "Gold role marks identify the one or two priority enemies in a fight.",
        check: () => this.stepTime > 2.8,
      },
      {
        text: "The Shaman is SUPPORT. Double-tap it to focus the whole band.",
        sub: "Do not waste the opening on the Shieldbearer while healing remains behind it.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("shieldbearer", { x: m.x + 5, y: m.y - 35, scale: 0.5 });
          battle.spawnEnemy("shaman", { x: m.x + 92, y: m.y + 26, scale: 0.48 });
          tank = battle.livingEnemies().find((enemy) => enemy.enemyKind === "shieldbearer") ?? null;
          support = battle.livingEnemies().find((enemy) => enemy.enemyKind === "shaman") ?? null;
          if (tank) {
            tank.stats.maxHp = Math.max(tank.stats.maxHp, 900);
            tank.hp = tank.stats.maxHp;
          }
        },
        target: () => support?.alive ? { x: support.x, y: support.y - 18 } : null,
        check: () => !!support && this.hud.lastBandFocusId === support.id,
      },
      {
        text: "Hold the focus until the support falls.",
        sub: "Removing its healing makes every remaining target easier to finish.",
        target: () => support?.alive ? { x: support.x, y: support.y - 18 } : null,
        check: () => !!support && !support.alive,
      },
      {
        text: "Now turn the Tank or go around its shield.",
        sub: "Tanks delay you; they are dangerous when they protect something more important.",
        target: () => tank?.alive ? { x: tank.x, y: tank.y - 18 } : null,
        check: () => !!tank && !tank.alive,
      },
      {
        text: "Read the role, choose the priority, then commit.",
        sub: "Assassins hunt the weak; Disruptors interrupt; Artillery controls distant ground.",
        check: () => this.stepTime > 3.4,
      },
    ];
  }

  private elementSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    let subject: Unit | null = null;
    return [
      {
        text: "Elements change how a target should be approached.",
        sub: "Waymarks show one weakness and one resistance. No enemy is completely immune.",
        check: () => this.stepTime > 2.8,
      },
      {
        text: "This Ice Wisp is weak to Flame. Cast Fireball on it.",
        sub: "A weakness produces a bright WEAK callout and deals 25% more damage to normal foes.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("icewisp", { x: m.x + 54, y: m.y, scale: 1.6 });
          subject = battle.livingEnemies()[0] ?? null;
          if (subject) {
            subject.stats.maxHp = Math.max(subject.stats.maxHp, 1400);
            subject.hp = subject.stats.maxHp;
            subject.effects.push({ kind: "stun", time: 999, power: 1, source: null });
          }
        },
        target: () => this.hud.abilityButtonCenter("fireball"),
        check: () => this.abilityUsed("fireball"),
      },
      {
        text: "Prepare a condition: draw Frostwake through the target.",
        sub: "Elemental hits fill the thin condition bar beneath its health.",
        onEnter: () => {
          const frostwake = battle.heroes().flatMap((hero) => hero.abilities).find((ability) => ability.def.id === "frostwake");
          if (frostwake) frostwake.timer = 0;
        },
        target: () => this.hud.abilityButtonCenter("frostwake"),
        check: () => this.abilityUsed("frostwake"),
      },
      {
        text: "Counter the prepared Frost with Flame.",
        sub: "Cast Fireball again. Counter-hits consume conditions for a louder reaction payoff.",
        onEnter: () => {
          const fireball = battle.heroes().flatMap((hero) => hero.abilities).find((ability) => ability.def.id === "fireball");
          if (fireball) fireball.timer = 0;
        },
        target: () => this.hud.abilityButtonCenter("fireball"),
        check: () => this.abilityUsed("fireball"),
      },
      {
        text: "Weakness helps; reactions reward sequencing.",
        sub: "Every reasonable party still works. Reading the matchup gives it an advantage.",
        onEnter: () => {
          if (subject?.alive) battle.damage(subject, 99999, null);
        },
        check: () => this.stepTime > 3.4,
      },
    ];
  }

  private bossSteps(mid: () => { x: number; y: number }): TutStep[] {
    const battle = this.battle;
    let boss: Unit | null = null;
    let dangerAt: Vec | null = null;
    let moveCommandsAt = 0;
    return [
      {
        text: "Great foes speak through poise, phases, and marked ground.",
        sub: "The large health display gives the boss's exact health and phase thresholds.",
        check: () => this.stepTime > 2.8,
      },
      {
        text: "Attack the Alpha and break its amber poise bar.",
        sub: "A stagger interrupts the boss and opens a short damage window.",
        onEnter: () => {
          const m = mid();
          battle.spawnEnemy("alpha", { x: m.x + 55, y: m.y, scale: 0.55 });
          boss = battle.bossRef;
          if (boss) {
            boss.stats.maxHp = Math.max(boss.stats.maxHp, 5000);
            boss.hp = boss.stats.maxHp;
            battle.bossStagger = Math.max(0, battle.bossStaggerMax - 4);
          }
        },
        target: () => boss?.alive ? { x: boss.x, y: boss.y - 24 } : null,
        check: () => !!boss && boss.effects.some((effect) => effect.kind === "stun"),
      },
      {
        text: "Marked ground is a promise. Move Bram outside the ring.",
        sub: "Do not finish a cast inside danger merely because its cooldown is ready.",
        onEnter: () => {
          const bram = battle.heroes()[0];
          dangerAt = { x: bram.x, y: bram.y };
          moveCommandsAt = this.hud.moveCommandSerial;
          if (boss) battle.telegraphs.push({ x: bram.x, y: bram.y, radius: 66, time: 0, duration: 60, owner: boss, kind: "pounce", label: "MOVE" });
        },
        target: () => dangerAt,
        check: () => {
          const bram = battle.heroes()[0];
          return !!dangerAt && this.hud.moveCommandSerial > moveCommandsAt && Math.hypot(bram.x - dangerAt.x, bram.y - dangerAt.y) > 86;
        },
      },
      {
        text: "Phase diamonds mark when the boss changes its rules.",
        sub: "Expect a new pattern at each threshold; the final phase is usually faster, not merely tougher.",
        onEnter: () => {
          battle.telegraphs = battle.telegraphs.filter((mark) => mark.label !== "MOVE");
          if (boss) boss.hp = Math.round(boss.stats.maxHp * 0.31);
        },
        check: () => this.stepTime > 4,
      },
      {
        text: "Read the pattern, earn the opening, then spend your strongest techniques.",
        sub: "Bosses can break regional rules, but their warning language remains consistent.",
        onEnter: () => {
          if (boss?.alive) battle.damage(boss, 99999, null);
        },
        check: () => this.stepTime > 3.4,
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
