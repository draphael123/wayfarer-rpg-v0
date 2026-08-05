import { audio } from "./audio";
import { Battle, type FieldRect } from "./battle";
import { STAGES } from "./data";
import { FxSystem } from "./fx";
import { HUD_H, Hud } from "./hud";
import { Menus } from "./menus";
import { drawBackground, drawProjectiles, drawUnits, drawVignette, drawZones } from "./render";
import { defaultSave, grantXp, loadSave, persist } from "./save";
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
  startTutorial() {
    startTutorial();
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
  currentStage = stageIndex;
  xpGranted = false;
  tutorial = null;
  battleSave = save;
  fx = new FxSystem();
  battle = new Battle(STAGES[stageIndex], save, fieldRect(), fx);
  hud = new Hud(battle, save, logicalW, logicalH);
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

function startTutorial(): void {
  xpGranted = true; // tutorials pay no xp
  const temp = defaultSave();
  temp.sound = save.sound;
  temp.music = save.music;
  battleSave = temp;
  fx = new FxSystem();
  battle = new Battle(TUTORIAL_STAGE, temp, fieldRect(), fx, true);
  hud = new Hud(battle, temp, logicalW, logicalH);
  tutorial = new Tutorial(battle, hud);
  menus.hide();
}

function endBattleToMap(): void {
  battle = null;
  hud = null;
  fx = null;
  tutorial = null;
  battleSave = save;
  menus.renderMap();
}

function settleVictory(): void {
  if (!battle || xpGranted) return;
  xpGranted = true;
  const xp = battle.xpEarned + battle.stage.xpReward;
  const levels = grantXp(save, xp);
  if (currentStage === save.unlockedStage && currentStage < STAGES.length - 1) {
    save.unlockedStage++;
    persist(save);
  }
  if (levels > 0) {
    audio.play("levelup");
    setTimeout(() => menus.showToast(`Level up! Each hero gains ${levels * 2} attribute points — visit the Party screen`), 150);
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
      battle.update(dt, battleSave);
      fx.update(dt);
      if (tutorial) {
        tutorial.update(dt);
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
    drawUnits(ctx, battle, battleSave, hud.selected);
    drawProjectiles(ctx, battle);
    fx.draw(ctx);
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
