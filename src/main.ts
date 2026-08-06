import { audio } from "./audio";
import { Battle, type FieldRect } from "./battle";
import { BOSS_STAGES, DIFFICULTIES, HEROES, STAGES, TRINKETS } from "./data";
import { FxSystem } from "./fx";
import { HUD_H, Hud } from "./hud";
import { drawHeroPortrait, Menus } from "./menus";
import {
  drawBackground,
  drawColorGrade,
  drawDecals,
  drawForeground,
  drawLighting,
  drawProjectiles,
  drawReflections,
  drawTelegraphs,
  drawTitleDiorama,
  drawUnits,
  drawVignette,
  drawZones,
  setColorSafe,
} from "./render";
import { defaultSave, grantXp, loadSave, nextSpeed, persist } from "./save";
import { logEvent } from "./telemetry";
import { Tutorial } from "./tutorial";
import type { SaveData, StageDef } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let save: SaveData = loadSave();
audio.setSound(save.sound);
audio.setMusic(save.music);
audio.setSoundVolume(save.soundVol);
audio.setMusicVolume(save.musicVol);

/** Comfort settings ride on body classes (menus) and flags the loop reads (battle). */
function applyComfort(s: SaveData): void {
  document.body.classList.toggle("reduced-motion", s.reducedMotion);
  document.body.classList.toggle("big-text", s.bigText);
  setColorSafe(s.colorSafe);
}
applyComfort(save);

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
    audio.setSoundVolume(save.soundVol);
    audio.setMusicVolume(save.musicVol);
    menus.save = save;
    menus.renderTitle();
  },
});

function startBattle(stageIndex: number): void {
  rolledLoot = null;
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
  audio.setMood("battle", stageIndex);
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
  // lessons keep the calm campfire theme
  audio.setMood("menu");
  menus.hide();
}

function mergeBestiary(): void {
  if (!battle || battle.tutorialMode) return;
  let kills = 0;
  for (const [kind, count] of Object.entries(battle.killCounts)) {
    if (!count) continue;
    save.bestiary[kind as keyof typeof save.bestiary] = (save.bestiary[kind as keyof typeof save.bestiary] ?? 0) + count;
    kills += count;
  }
  battle.killCounts = {};
  // the chronicle's ledger: every real battle leaves a mark
  save.lifetime.battles += 1;
  save.lifetime.kills += kills;
  save.lifetime.deaths += battle.heroDeaths;
  save.lifetime.casts += Object.values(battle.castCounts).reduce((a, b) => a + b, 0);
  persist(save);
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

let rolledLoot: { id: string; icon: string; name: string; rare: boolean } | null = null;

function rollLoot(): void {
  if (rolledLoot) return;
  const rare = BOSS_STAGES.includes(currentStage);
  const pool = TRINKETS.filter((t) => t.rarity === (rare ? "rare" : "common"));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  rolledLoot = { id: pick.id, icon: pick.icon, name: pick.name, rare };
  if (hud) hud.pendingLoot = rolledLoot;
}

function settleVictory(): void {
  if (!battle || xpGranted) return;
  xpGranted = true;
  const rewardMult = DIFFICULTIES[save.difficulty ?? 1].rewardMult;
  const xp = Math.round((battle.xpEarned + battle.stage.xpReward) * rewardMult);
  const gold = Math.round((battle.goldEarned + Math.round(battle.stage.xpReward * 0.8)) * rewardMult);
  const levels = grantXp(save, xp);
  save.gold += gold;
  // stage record book: clears + fastest time feed the map's scout report
  const rec = save.stageStats[currentStage];
  const t = Math.round(battle.time * 10) / 10;
  save.stageStats[currentStage] = { clears: (rec?.clears ?? 0) + 1, bestTime: rec ? Math.min(rec.bestTime, t) : t };
  save.lifetime.victories += 1;
  save.lifetime.gold += gold;
  if (battle.heroDeaths === 0) save.lifetime.flawless += 1;
  if (save.difficulty === 3) save.lifetime.brutalClears += 1;
  // loot was revealed on the victory card; bank it now
  rollLoot();
  const drop = rolledLoot!;
  const rare = drop.rare;
  save.inventory.push(drop.id);
  if (currentStage === save.unlockedStage && currentStage < STAGES.length - 1) {
    save.unlockedStage++;
    menus.travelFrom = currentStage;
  }
  persist(save);
  if (levels > 0) {
    audio.play("levelup");
    menus.pendingLevelUp = { level: save.level, gained: levels };
  }
  setTimeout(() => menus.showToast(`+${gold} gold · loot: ${drop.icon} ${drop.name}${rare ? " (RARE)" : ""}`), 150);
}

/** Compose a 1200x630 victory card and hand it to the OS share sheet (or download). */
function shareVictory(): void {
  if (!battle) return;
  const b = battle;
  const card = document.createElement("canvas");
  card.width = 1200;
  card.height = 630;
  const c = card.getContext("2d")!;
  const grad = c.createLinearGradient(0, 0, 0, 630);
  grad.addColorStop(0, "#2c2342");
  grad.addColorStop(1, "#151020");
  c.fillStyle = grad;
  c.fillRect(0, 0, 1200, 630);
  c.strokeStyle = "#8ee88b";
  c.lineWidth = 5;
  c.strokeRect(24, 24, 1152, 582);
  c.strokeStyle = "rgba(255,245,225,0.15)";
  c.lineWidth = 2;
  c.strokeRect(38, 38, 1124, 554);
  c.textAlign = "center";
  c.fillStyle = "#ffe9a3";
  c.font = "700 68px Cinzel, Palatino, Georgia, serif";
  c.fillText("WAYBAND", 600, 128);
  c.fillStyle = "#8ee88b";
  c.font = "700 40px Cinzel, Palatino, Georgia, serif";
  c.fillText(`Victory — ${b.stage.name}`, 600, 196);
  // the band, portrait by portrait
  const roster = save.heroes.map((h, i) => ({ h, i })).filter(({ h }) => h.recruited && h.active);
  const ps = 150;
  const gap = 40;
  const x0 = 600 - (roster.length * ps + (roster.length - 1) * gap) / 2;
  roster.forEach(({ i }, at) => {
    const px = x0 + at * (ps + gap);
    const temp = document.createElement("canvas");
    temp.width = temp.height = 128;
    drawHeroPortrait(temp, i, save);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.roundRect(px, 240, ps, ps, 18);
    c.fill();
    c.drawImage(temp, px + 11, 240 + 5, ps - 22, ps - 22);
    c.strokeStyle = HEROES[i].accent;
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(px, 240, ps, ps, 18);
    c.stroke();
    c.fillStyle = "#f2ecd8";
    c.font = "700 24px 'Segoe UI', system-ui, sans-serif";
    c.fillText(HEROES[i].name, px + ps / 2, 240 + ps + 34);
  });
  const mult = DIFFICULTIES[save.difficulty ?? 1]?.rewardMult ?? 1;
  const xp = Math.round((b.xpEarned + b.stage.xpReward) * mult);
  const gold = Math.round((b.goldEarned + Math.round(b.stage.xpReward * 0.8)) * mult);
  const mins = Math.floor(b.time / 60);
  const secs = String(Math.floor(b.time % 60)).padStart(2, "0");
  c.fillStyle = "#cfc7de";
  c.font = "600 30px 'Segoe UI', system-ui, sans-serif";
  c.fillText(
    `Cleared in ${mins}:${secs} · ${b.heroDeaths === 0 ? "no heroes fell" : `${b.heroDeaths} fell`} · +${xp} xp · +${gold} gold`,
    600,
    508,
  );
  c.fillStyle = "#8d84a3";
  c.font = "600 24px 'Segoe UI', system-ui, sans-serif";
  c.fillText(`play at ${location.host}${location.pathname.replace(/\/$/, "")}`, 600, 566);
  card.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], "wayband-victory.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      void navigator.share({ files: [file], title: "Wayband", text: `We cleared ${b.stage.name}!` }).catch(() => undefined);
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wayband-victory.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
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
    case "share":
      audio.play("click");
      shareVictory();
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
    if (hud) {
      hud.drag = null;
      hud.hold = null;
    }
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

const cam = { x: 0, y: 0, zoom: 1, punch: 0 };

let lastTime = performance.now();
let rafId = 0;

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
      let simDt = dt * save.speed;
      if (battle.slowmo > 0) {
        battle.slowmo = Math.max(0, battle.slowmo - dt);
        simDt *= 0.3;
      }
      // bullet time while aiming a gesture — lining up the shot is the fun part
      if (hud.drag && hud.drag.mode === "ability") simDt *= 0.22;
      // AUTO: the band runs on the sim's judgment until the player takes over
      if (hud.autopilot && battle.state === "fighting" && !tutorial) autopilotTick(battle, battleSave);
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
    if (battle.state === "victory") rollLoot();
    audio.setBossMusic(!battle.tutorialMode && !!battle.bossRef?.alive && battle.state === "fighting");

    // camera: ease toward the action (or the boss during their intro)
    const living = battle.units.filter((u) => u.alive);
    let targetX = cam.x;
    let targetY = cam.y;
    if (battle.cinematic > 0 && battle.bossRef?.alive) {
      targetX = Math.max(-40, Math.min(40, (battle.bossRef.x - logicalW / 2) * 0.35));
      targetY = Math.max(-24, Math.min(24, (battle.bossRef.y - (logicalH - HUD_H) * 0.55) * 0.3));
    } else if (living.length) {
      let cx = 0;
      let cy = 0;
      for (const u of living) {
        cx += u.x;
        cy += u.y;
      }
      cx /= living.length;
      cy /= living.length;
      targetX = Math.max(-14, Math.min(14, (cx - logicalW / 2) * 0.12));
      targetY = Math.max(-8, Math.min(8, (cy - (logicalH - HUD_H) * 0.55) * 0.1));
    }
    cam.x += (targetX - cam.x) * Math.min(1, dt * (battle.cinematic > 0 ? 4 : 2.2));
    cam.y += (targetY - cam.y) * Math.min(1, dt * (battle.cinematic > 0 ? 4 : 2.2));
    cam.punch = Math.max(0, cam.punch - dt * 3.2);
    if (battle.zoomPunch > 0) {
      cam.punch = Math.max(cam.punch, battle.zoomPunch);
      battle.zoomPunch = 0;
    }
    // directional hit-kick decays fast
    battle.kickX *= Math.max(0, 1 - dt * 10);
    battle.kickY *= Math.max(0, 1 - dt * 10);
    const cineZoom = battle.cinematic > 0 ? 0.1 : 0;
    cam.zoom = 1 + cam.punch * 0.045 + cineZoom;
    hud.cam = cam;

    const calm = save.reducedMotion;
    if (calm) cam.punch = 0;
    const shakeX = !calm && fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;
    const shakeY = !calm && fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;

    const CY = (logicalH - HUD_H) * 0.5;
    const worldH = logicalH - HUD_H + 20;
    const dusk = battle.stage.waves.length > 1 ? Math.max(0, battle.waveIndex) / (battle.stage.waves.length - 1) : 0;
    ctx.save();
    ctx.translate(shakeX + battle.kickX, shakeY + battle.kickY);
    ctx.translate(logicalW / 2, CY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-logicalW / 2 - cam.x, -CY - cam.y);
    const horizon = (logicalH - HUD_H) * 0.34;
    drawBackground(ctx, battle.stage, logicalW, worldH, horizon, battle.time, {
      camX: cam.x,
      camY: cam.y,
      dusk: battle.tutorialMode ? 0 : dusk * 0.8,
      units: battle.units,
    });
    drawDecals(ctx, battle);
    drawReflections(ctx, battle, battleSave, logicalW, worldH, horizon, battle.time);
    drawZones(ctx, battle);
    drawTelegraphs(ctx, battle);
    drawUnits(ctx, battle, battleSave, hud.selected);
    drawProjectiles(ctx, battle);
    fx.draw(ctx);
    hud.drawWorld(ctx);
    drawForeground(ctx, battle.stage, logicalW, worldH, battle.time, { camX: cam.x, camY: cam.y, units: battle.units });
    ctx.restore();
    drawLighting(ctx, battle, logicalW, worldH);
    drawColorGrade(ctx, battle.stage, logicalW, worldH);
    drawVignette(ctx, logicalW, worldH);
    // ultimate ceremony: the screen edges flare in the oath's color
    if (battle.ultFlash) {
      const uf = battle.ultFlash;
      const a = Math.min(1, uf.time / 0.55);
      const fl = ctx.createRadialGradient(logicalW / 2, worldH * 0.45, Math.min(logicalW, worldH) * 0.32, logicalW / 2, worldH / 2, Math.max(logicalW, worldH) * 0.7);
      fl.addColorStop(0, "rgba(0,0,0,0)");
      const rgb = uf.color;
      fl.addColorStop(1, rgb);
      ctx.save();
      ctx.globalAlpha = a * 0.34;
      ctx.fillStyle = fl;
      ctx.fillRect(0, 0, logicalW, worldH);
      ctx.restore();
    }
    // danger pulse: red edges close in when a hero is nearly down
    if (battle.state === "fighting") {
      let frailest = 1;
      for (const u of battle.units) {
        if (u.team === "hero" && u.alive) frailest = Math.min(frailest, u.hp / u.stats.maxHp);
      }
      audio.setDanger(frailest < 0.28);
      if (frailest < 0.28) {
        const danger = (0.28 - frailest) / 0.28;
        const pulse = 0.55 + Math.abs(Math.sin(battle.time * 4)) * 0.45;
        const dv = ctx.createRadialGradient(logicalW / 2, worldH * 0.45, Math.min(logicalW, worldH) * 0.45, logicalW / 2, worldH / 2, Math.max(logicalW, worldH) * 0.72);
        dv.addColorStop(0, "rgba(200, 40, 30, 0)");
        dv.addColorStop(1, `rgba(200, 40, 30, ${(0.24 + danger * 0.26) * pulse})`);
        ctx.fillStyle = dv;
        ctx.fillRect(0, 0, logicalW, worldH);
      }
    } else {
      audio.setDanger(false);
    }
    hud.draw(ctx);
  } else {
    // the band camps behind the menus
    drawTitleDiorama(ctx, save, logicalW, logicalH, now / 1000);
  }

  rafId = requestAnimationFrame(frame);
}

menus.renderTitle();
rafId = requestAnimationFrame(frame);

/** One tick of the band's own judgment: healers triage, fighters take the
 *  nearest foe, spells fire the moment they're ready. Shared by the headless
 *  sim and the in-battle AUTO toggle. */
function autopilotTick(b: Battle, simSave: SaveData): number {
  let casts = 0;
  const enemies = b.units.filter((u) => u.team === "enemy" && u.alive);
  for (const heroU of b.units) {
    if (heroU.team !== "hero" || !heroU.alive) continue;
    if (heroU.stats.healPower >= 8) {
      const wounded = b.units
        .filter((u) => u.team === "hero" && u.alive && u !== heroU && u.hp < u.stats.maxHp * 0.7)
        .sort((a, c) => a.hp / a.stats.maxHp - c.hp / c.stats.maxHp)[0];
      heroU.healTarget = wounded ?? null;
      if (wounded) heroU.attackTarget = null;
    }
    if (!heroU.healTarget && (!heroU.attackTarget || !heroU.attackTarget.alive) && enemies.length) {
      let best = enemies[0];
      let bd = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - heroU.x, e.y - heroU.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      heroU.attackTarget = best;
    }
    for (const ab of heroU.abilities) {
      if (ab.timer > 0) continue;
      const target = heroU.attackTarget && heroU.attackTarget.alive ? heroU.attackTarget : enemies[0];
      const aim = target ? { x: target.x, y: target.y } : null;
      if (b.castAbility(heroU, ab, simSave, aim, null)) casts++;
    }
  }
  return casts;
}

/**
 * Headless battle for balance work: auto-orders every hero (nearest-enemy
 * aggro, healers channel the wounded, abilities fire on cooldown) and runs the
 * sim without rendering. Returns the outcome; run 21+ per config before
 * trusting any comparison.
 */
function runSim(
  stageIndex: number,
  opts: { maxSeconds?: number; saveOverride?: SaveData } = {},
): { result: string; time: number; deaths: number; casts: number } {
  const simSave: SaveData = opts.saveOverride ?? (JSON.parse(JSON.stringify(save)) as SaveData);
  const fxSys = new FxSystem();
  const b = new Battle(STAGES[stageIndex], simSave, fieldRect(), fxSys);
  const maxT = opts.maxSeconds ?? 240;
  let casts = 0;
  const dt = 1 / 30;
  while (b.state !== "victory" && b.state !== "defeat" && b.time < maxT) {
    casts += autopilotTick(b, simSave);
    b.update(dt, simSave);
    fxSys.update(dt);
    if (fxSys.particles.length > 300) fxSys.particles.length = 0;
    if (fxSys.floaters.length > 150) fxSys.floaters.length = 0;
  }
  return {
    result: b.state === "victory" ? "victory" : b.state === "defeat" ? "defeat" : "timeout",
    time: Math.round(b.time * 10) / 10,
    deaths: b.heroDeaths,
    casts,
  };
}

// debug/testing hook
Object.defineProperty(window, "__wayband", {
  value: {
    // drive one frame manually (rAF is paused in hidden tabs/panes)
    step(dt = 1 / 60) {
      cancelAnimationFrame(rafId);
      frame(lastTime + dt * 1000);
    },
    startBattle,
    shareVictory,
    sim: runSim,
    shot(q = 0.72) {
      return canvas.toDataURL("image/jpeg", q);
    },
    get battle() {
      return battle;
    },
    get save() {
      return save;
    },
    get hud() {
      return hud;
    },
    get audio() {
      return audio;
    },
  },
});
