import { audio } from "./audio";
import { Battle, type FieldRect } from "./battle";
import { BOSS_STAGES, DIFFICULTIES, STAGES, TRINKETS } from "./data";
import { FxSystem } from "./fx";
import { HUD_H, Hud } from "./hud";
import { Menus } from "./menus";
import { drawBackground, drawForeground, drawProjectiles, drawTelegraphs, drawUnits, drawVignette, drawZones } from "./render";
import { defaultSave, grantXp, loadSave, nextSpeed, persist } from "./save";
import { logEvent } from "./telemetry";
import { Tutorial } from "./tutorial";
import type { SaveData, StageDef } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let save: SaveData = loadSave();
audio.setSound(save.sound);
audio.setMusic(save.music);

let logicalW = 960;
let logicalH = 560;
let viewScale = 1;

let battle: Battle | null = null;
let hud: Hud | null = null;
let fx: FxSystem | null = null;
let tutorial: Tutorial | null = null;
let battleSave: SaveData = save; // the save the running battle reads (tutorial uses a throwaway)
let currentStage = 0;
let xpGranted = false;

function fieldRect(): FieldRect {
  const horizon = (logicalH - HUD_H) * 0.34;
  return {
    left: 26,
    right: logicalW - 26,
    top: horizon + 16,
    bottom: logicalH - HUD_H - 10,
  };
}

function resize(): void {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const targetH = 430;
  viewScale = cssH / targetH;
  logicalW = cssW / viewScale;
  if (logicalW < 760) {
    viewScale = cssW / 760;
    logicalW = 760;
  }
  logicalH = cssH / viewScale;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
  if (battle && hud) {
    battle.field = fieldRect();
    hud.width = logicalW;
    hud.height = logicalH;
    for (const unit of battle.units) {
      if (!unit.alive) continue;
      const clamped = battle.clampToField(unit, unit.radius);
      if (unit.team === "hero") {
        unit.x = clamped.x;
        unit.y = clamped.y;
      } else {
        unit.y = clamped.y;
      }
    }
  }
}

window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();

const menus = new Menus("ui", save, {
  startStage(stageIndex: number) {
    startBattle(stageIndex);
  },
  startTutorial(kind: string) {
    startTutorial(kind);
  },
  resetProgress() {
    save = defaultSave();
    persist(save);
    audio.setSound(save.sound);
    audio.setMusic(save.music);
    menus.save = save;
    menus.renderTitle();
  },
});

function startBattle(stageIndex: number): void {
  logEvent("battle_start", {
    stage: stageIndex,
    difficulty: save.difficulty,
    level: save.level,
    party: save.heroes.filter((h) => h.recruited && h.active).length,
  });
  currentStage = stageIndex;
  xpGranted = false;
  tutorial = null;
  battleSave = save;
  fx = new FxSystem();
  battle = new Battle(STAGES[stageIndex], save, fieldRect(), fx);
  hud = new Hud(battle, save, logicalW, logicalH);
  hud.freshPlayer = save.unlockedStage === 0 && save.level < 3;
  audio.setMood("battle");
  menus.hide();
}

const TUTORIAL_STAGE: StageDef = {
  ...STAGES[0],
  name: "Training Grounds",
  subtitle: "Learn the ropes",
  waves: [],
  scale: 0.55,
  xpReward: 0,
};

function startTutorial(kind = "basics"): void {
  xpGranted = true; // tutorials pay no xp
  const temp = defaultSave();
  temp.sound = save.sound;
  temp.music = save.music;
  if (kind === "gestures") {
    // Wren + Ezri practice squad with every aimed spell ready
    temp.heroes[0].active = false;
    temp.heroes[3].active = false;
    temp.heroes[1].recruited = true;
    temp.heroes[1].active = true;
    temp.heroes[2].recruited = true;
    temp.heroes[2].active = true;
    temp.heroes[2].attrs.int = 12;
    temp.unlockedSpells = ["pierce", "fireball", "frostwake"];
    temp.heroes[1].equipped = ["pierce"];
    temp.heroes[2].equipped = ["fireball", "frostwake"];
  } else if (kind === "healing") {
    temp.heroes[3].attrs.spi = 8;
  }
  battleSave = temp;
  fx = new FxSystem();
  battle = new Battle(TUTORIAL_STAGE, temp, fieldRect(), fx, true);
  hud = new Hud(battle, temp, logicalW, logicalH);
  tutorial = new Tutorial(battle, hud, kind);
  audio.setMood("battle");
  menus.hide();
}

function mergeBestiary(): void {
  if (!battle || battle.tutorialMode) return;
  let changed = false;
  for (const [kind, count] of Object.entries(battle.killCounts)) {
    if (!count) continue;
    save.bestiary[kind as keyof typeof save.bestiary] = (save.bestiary[kind as keyof typeof save.bestiary] ?? 0) + count;
    changed = true;
  }
  battle.killCounts = {};
  if (changed) persist(save);
}

function endBattleToMap(): void {
  if (battle && !battle.tutorialMode) {
    logEvent("battle_end", {
      stage: currentStage,
      difficulty: save.difficulty,
      result: battle.state === "victory" ? "victory" : battle.state === "defeat" ? "defeat" : "retreat",
      durationSec: Math.round(battle.time),
      wave: battle.waveIndex,
      heroDeaths: battle.heroDeaths,
      casts: battle.castCounts,
    });
  }
  if (battle && !battle.tutorialMode && !xpGranted && battle.goldEarned > 0) {
    save.gold += Math.round(battle.goldEarned / 2);
    persist(save);
  }
  mergeBestiary();
  battle = null;
  hud = null;
  fx = null;
  tutorial = null;
  battleSave = save;
  audio.setMood("menu");
  menus.renderMap();
}

function settleVictory(): void {
  if (!battle || xpGranted) return;
  xpGranted = true;
  const rewardMult = DIFFICULTIES[save.difficulty ?? 1].rewardMult;
  const xp = Math.round((battle.xpEarned + battle.stage.xpReward) * rewardMult);
  const gold = Math.round((battle.goldEarned + Math.round(battle.stage.xpReward * 0.8)) * rewardMult);
  const levels = grantXp(save, xp);
  save.gold += gold;
  // one piece of loot per clear; boss stages yield rares
  const rare = BOSS_STAGES.includes(currentStage);
  const pool = TRINKETS.filter((t) => t.rarity === (rare ? "rare" : "common"));
  const drop = pool[Math.floor(Math.random() * pool.length)];
  save.inventory.push(drop.id);
  if (currentStage === save.unlockedStage && currentStage < STAGES.length - 1) {
    save.unlockedStage++;
  }
  persist(save);
  if (levels > 0) {
    audio.play("levelup");
    setTimeout(() => menus.showToast(`Level up! +${gold} gold · loot: ${drop.icon} ${drop.name}${rare ? " (RARE)" : ""}`), 150);
  } else {
    setTimeout(() => menus.showToast(`+${gold} gold · loot: ${drop.icon} ${drop.name}${rare ? " (RARE)" : ""}`), 150);
  }
}

function handleHudAction(action: string): void {
  if (!hud || !battle) return;
  switch (action) {
    case "pause":
      hud.paused = true;
      break;
    case "resume":
      hud.paused = false;
      break;
    case "retry":
      if (battle && !battle.tutorialMode) {
        logEvent("battle_end", {
          stage: currentStage,
          difficulty: save.difficulty,
          result: "retry",
          durationSec: Math.round(battle.time),
          wave: battle.waveIndex,
          heroDeaths: battle.heroDeaths,
          casts: battle.castCounts,
        });
      }
      mergeBestiary();
      startBattle(currentStage);
      break;
    case "map":
    case "skip-tutorial":
      endBattleToMap();
      break;
    case "continue":
      settleVictory();
      endBattleToMap();
      break;
    case "sound":
      save.sound = !save.sound;
      battleSave.sound = save.sound;
      audio.setSound(save.sound);
      persist(save);
      break;
    case "music":
      save.music = !save.music;
      battleSave.music = save.music;
      audio.setMusic(save.music);
      persist(save);
      break;
    case "speed":
      save.speed = nextSpeed(save.speed);
      battleSave.speed = save.speed;
      persist(save);
      break;
  }
}

// ------------------------------------------------------------------ input

let activePointer: number | null = null;

function toLogical(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / viewScale,
    y: (event.clientY - rect.top) / viewScale,
  };
}

canvas.addEventListener("pointerdown", (event) => {
  audio.unlock();
  if (!hud) return;
  if (activePointer !== null) return;
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  const { x, y } = toLogical(event);
  const action = hud.pointerDown(x, y);
  if (action) handleHudAction(action);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!hud || event.pointerId !== activePointer) return;
  const { x, y } = toLogical(event);
  hud.pointerMove(x, y);
  event.preventDefault();
});

function releasePointer(event: PointerEvent): void {
  if (event.pointerId !== activePointer) return;
  activePointer = null;
  if (!hud) return;
  const { x, y } = toLogical(event);
  hud.pointerUp(x, y);
  event.preventDefault();
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointer) {
    activePointer = null;
    if (hud) hud.drag = null;
  }
});

// Block the synthesized mouse events browsers fire after a touch — without
// this, tapping an overlay button "ghost clicks" whatever DOM menu appears
// underneath the same spot (e.g. Continue -> instantly starts a stage).
canvas.addEventListener("touchend", (event) => event.preventDefault(), { passive: false });

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("pointerdown", () => audio.unlock(), { once: true });

window.addEventListener("keydown", (event) => {
  if (!hud) return;
  if (event.key === "Escape" || event.key === "p") {
    hud.paused = !hud.paused;
  }
});

// When a victory/defeat overlay appears, settling XP waits for the button —
// but if the player backgrounds the tab on victory, still bank it.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && battle?.state === "victory") settleVictory();
});

// ------------------------------------------------------------------ loop

let lastTime = performance.now();

function frame(now: number): void {
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (battle && hud && fx) {
    if (!hud.paused) {
      // hit-stop: big impacts freeze the world for a few frames
      if (battle.hitstop > 0) {
        battle.hitstop = Math.max(0, battle.hitstop - dt);
        dt *= 0.12;
      }
      const simDt = dt * save.speed;
      battle.update(simDt, battleSave);
      fx.update(simDt);
      if (tutorial) {
        tutorial.update(simDt);
        if (tutorial.done) {
          endBattleToMap();
          requestAnimationFrame(frame);
          return;
        }
      }
    }
    hud.update(dt);

    const shakeX = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;
    const shakeY = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    const horizon = (logicalH - HUD_H) * 0.34;
    drawBackground(ctx, battle.stage, logicalW, logicalH - HUD_H + 20, horizon, battle.time);
    drawZones(ctx, battle);
    drawTelegraphs(ctx, battle);
    drawUnits(ctx, battle, battleSave, hud.selected);
    drawProjectiles(ctx, battle);
    fx.draw(ctx);
    drawForeground(ctx, battle.stage, logicalW, logicalH - HUD_H + 20, battle.time);
    drawVignette(ctx, logicalW, logicalH - HUD_H + 20);
    ctx.restore();
    hud.draw(ctx);
  } else {
    // simple backdrop behind DOM menus
    const grad = ctx.createLinearGradient(0, 0, 0, logicalH);
    grad.addColorStop(0, "#221b33");
    grad.addColorStop(1, "#151020");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, logicalW, logicalH);
  }

  requestAnimationFrame(frame);
}

menus.renderTitle();
requestAnimationFrame(frame);

// debug/testing hook
Object.defineProperty(window, "__wayband", {
  value: {
    get battle() {
      return battle;
    },
    get save() {
      return save;
    },
    get hud() {
      return hud;
    },
  },
});
