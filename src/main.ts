import { audio } from "./audio";
import { Battle, type FieldRect } from "./battle";
import { ADV_CALLING_LEVEL, ALL_GEAR, ARMORS, arenaPurse, arenaTrialById, arenaTrialPurse, BOSS_STAGES, CALLING_UNLOCK_LEVEL, contractFulfilled, contractPurse, CONTRACTS, DIFFICULTIES, elementById, HEROES, STAGES, TRINKETS } from "./data";
import { FxSystem } from "./fx";
import { HUD_H, Hud } from "./hud";
import { drawHeroPortrait, Menus } from "./menus";
import { RecoveryPanel } from "./recovery";
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
import { defaultSave, grantHeroXp, loadSave, nextSpeed, persist, personalBattleXp } from "./save";
import { autopilotTick, runBattleSimulation } from "./simulation";
import { exportTelemetry, logEvent, logRuntimeError } from "./telemetry";
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
let tutorialKind = "basics";
let tutorialReturnTo: "map" | "handbook" = "map";
let battleSave: SaveData = save; // the save the running battle reads (tutorial uses a throwaway)
let currentStage = 0;
let xpGranted = false;
let activeChallenge: { kind: "arena" | "contract"; id: string; stage: number } | null = null;
let autoDecisionTimer = 0;

/** Battle fields run nearly two screens wide — the fight itself travels the land. */
const FIELD_SCREENS = 1.9;

function fieldRect(stage?: StageDef): FieldRect {
  const horizon = (logicalH - HUD_H) * 0.34;
  const descending = stage?.travelDirection === "south";
  return {
    left: 26,
    right: logicalW * (descending ? 1 : FIELD_SCREENS) - 26,
    top: horizon + 16,
    bottom: logicalH - HUD_H - 10,
  };
}

function resize(): void {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  // Keep high-DPI edges without letting a 4K/retina display allocate a
  // 50-million-pixel canvas. Twelve million pixels is already crisp at play
  // distance and avoids a large memory spike on mobile and integrated GPUs.
  const pixelBudgetDpr = Math.sqrt(12_000_000 / Math.max(1, cssW * cssH));
  const dpr = Math.max(0.5, Math.min(2, window.devicePixelRatio || 1, pixelBudgetDpr));
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
    battle.field = fieldRect(battle.stage);
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

const ROAD_REGIONS = [
  "The South Road", "The Winterreach", "Stormbreak Coast", "The Cinderwild", "The Verdant Maw",
  "The Nightglass Waste", "The Shattered Reliquary", "Skygrave Heights", "The Bloodwood", "The Last Meridian",
];
const ROAD_CAMP_NOTES = [
  ["Mill smoke thins beyond the hedgerows.", "Fresh tracks cross the old king's road.", "A westward bell counts the empty miles."],
  ["Snow gathers in the band's footprints.", "Blue fire keeps the bitter dark at bay.", "Something vast moves beneath the white horizon."],
  ["Salt dries white on every cloak.", "Far thunder rolls beneath a clear sky.", "The tide leaves black glass among the stones."],
  ["Ash settles softly on the bedrolls.", "The kiln-glow turns midnight copper.", "Hot wind worries the camp's iron stakes."],
  ["Roots shift beneath the sleeping earth.", "Green light pulses through the canopy.", "Rain finds the leaves but never the ground."],
  ["Mirages keep walking after sunset.", "The stars look close enough to cut.", "Black sand whispers against the cookpot."],
  ["Broken saints watch from the roadside.", "Relic bells ring without wind.", "Gold dust clings to every boot and buckle."],
  ["Clouds drift below the camp tonight.", "Rime feathers the climbing ropes.", "Lightning walks the distant peaks."],
  ["The trees drink every scrap of firelight.", "Red leaves fall though there is no wind.", "Old hunt-marks circle the clearing."],
  ["The road ends beneath an unfamiliar sky.", "Every waymark burns toward the same horizon.", "The dark ahead has begun to remember names."],
] as const;
let sceneTransition = false;

function roman(value: number): string {
  const pairs: [number, string][] = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let left = value;
  let out = "";
  for (const [amount, glyph] of pairs) while (left >= amount) { out += glyph; left -= amount; }
  return out;
}

/** A waymark-sized bridge makes embarking and returning feel spatially connected. */
function roadPassage(stage: StageDef, direction: "depart" | "return"): HTMLElement {
  document.querySelector(".road-passage")?.remove();
  const regionIndex = Math.max(0, Math.min(ROAD_REGIONS.length - 1, Math.floor(stage.id / 6)));
  const region = ROAD_REGIONS[regionIndex];
  const progress = Math.max(2, Math.round(((stage.id + 1) / STAGES.length) * 100));
  const note = ROAD_CAMP_NOTES[regionIndex][(stage.id + (direction === "return" ? 1 : 0)) % 3];
  const survivors = battle?.heroes().filter((hero) => hero.alive).length ?? save.heroes.filter((hero) => hero.recruited && hero.active).length;
  const partySize = battle?.heroes().length ?? save.heroes.filter((hero) => hero.recruited && hero.active).length;
  const returnState = battle?.state === "victory" ? "The field is won" : battle?.state === "defeat" ? "The band regroups" : "The road keeps its price";
  const watch = direction === "depart"
    ? ["Straps checked", "Waymark sighted", "Steel made ready"][stage.id % 3]
    : survivors === partySize ? "Every bedroll filled" : `${survivors} of ${partySize} return standing`;
  const overlay = document.createElement("div");
  overlay.className = `road-passage ${direction} region-${regionIndex}`;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.tabIndex = 0;
  overlay.innerHTML = `
    <div class="road-passage-rule"></div>
    <div class="road-camp" aria-hidden="true">
      <i class="camp-moon"></i><i class="camp-ridge far"></i><i class="camp-ridge near"></i>
      <div class="camp-fire"><i></i><b></b><span></span></div>
      <i class="camp-spark s1"></i><i class="camp-spark s2"></i><i class="camp-spark s3"></i>
    </div>
    <div class="road-ledger">
      <div class="road-waymark">${roman(stage.id + 1)}</div>
      <div class="road-copy">
        <em>${direction === "depart" ? "BREAKING CAMP" : "NIGHT CAMP"} &middot; ${region}</em>
        <strong>${stage.name}</strong>
        <span>${direction === "depart" ? stage.subtitle : note}</span>
      </div>
    </div>
    <div class="camp-record"><span><em>${direction === "depart" ? "ROAD" : "RECORD"}</em><b>${direction === "depart" ? `Waymark ${roman(stage.id + 1)}` : returnState}</b></span><span><em>${direction === "depart" ? "OMEN" : "WATCH"}</em><b>${watch}</b></span></div>
    <div class="road-progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
    <button class="road-continue" type="button">Continue <span aria-hidden="true">&rsaquo;</span></button>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));
  audio.travel(direction);
  const reduced = document.body.classList.contains("reduced-motion");
  let leaving = false;
  const leave = () => {
    if (leaving || !overlay.classList.contains("ready")) return;
    leaving = true;
    overlay.classList.add("passing");
    window.setTimeout(() => overlay.remove(), reduced ? 30 : 360);
  };
  overlay.addEventListener("click", leave);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") leave();
  });
  window.setTimeout(() => overlay.classList.add("ready"), reduced ? 420 : 1250);
  window.setTimeout(leave, reduced ? 1900 : 2850);
  return overlay;
}

window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
resize();

const menus = new Menus("ui", save, {
  startStage(stageIndex: number) {
    activeChallenge = null;
    departForBattle(stageIndex);
  },
  startChallenge(kind, stageIndex, id) {
    activeChallenge = { kind, stage: stageIndex, id };
    departForBattle(stageIndex, true);
  },
  startTutorial(kind: string, returnTo: "map" | "handbook") {
    startTutorial(kind, returnTo);
  },
  battleActive() {
    return battle !== null;
  },
  pauseBattle() {
    if (hud) hud.paused = true;
  },
  resetProgress() {
    save = defaultSave();
    persist(save);
    audio.setSound(save.sound);
    audio.setMusic(save.music);
    audio.setSoundVolume(save.soundVol);
    audio.setMusicVolume(save.musicVol);
    applyComfort(save);
    menus.save = save;
    menus.renderTitle();
  },
});

function departForBattle(stageIndex: number, keepChallenge = false): void {
  if (sceneTransition) return;
  sceneTransition = true;
  menus.hide();
  roadPassage(STAGES[stageIndex], "depart");
  const reduced = document.body.classList.contains("reduced-motion");
  window.setTimeout(() => startBattle(stageIndex, keepChallenge), reduced ? 420 : 1250);
  window.setTimeout(() => { sceneTransition = false; }, reduced ? 1940 : 2890);
}

function startBattle(stageIndex: number, keepChallenge = false): void {
  if (!keepChallenge) activeChallenge = null;
  rolledLoot = null;
  logEvent("battle_start", {
    stage: stageIndex,
    difficulty: save.difficulty,
    level: save.level,
    party: save.heroes.filter((h) => h.recruited && h.active).length,
  });
  currentStage = stageIndex;
  autoDecisionTimer = 0;
  xpGranted = false;
  tutorial = null;
  battleSave = save;
  fx = new FxSystem();
  const baseStage = STAGES[stageIndex];
  const trial = activeChallenge?.kind === "arena" ? arenaTrialById(activeChallenge.id) : null;
  const arenaStage: StageDef | null = activeChallenge?.kind !== "arena"
    ? null
    : trial
      ? {
          ...baseStage,
          name: trial.name,
          subtitle: trial.subtitle,
          fieldNote: "Three gates close behind the band. The Ring permits no rest between names.",
          objective: "Carry health and cooldowns through all three contenders.",
          waves: trial.bossStages.map((bossStage) => STAGES[bossStage].waves[STAGES[bossStage].waves.length - 1]),
          scale: baseStage.scale * trial.scale,
          xpReward: Math.round(trial.bossStages.reduce((sum, bossStage) => sum + STAGES[bossStage].xpReward, 0) * 0.28),
          terrain: undefined,
          travelDirection: "east",
        }
      : { ...baseStage, name: `${baseStage.name} · Arena`, subtitle: "The crowd calls for the great foe", waves: [baseStage.waves[baseStage.waves.length - 1]], xpReward: Math.round(baseStage.xpReward * 0.55) };
  const encounterStage = arenaStage ?? baseStage;
  battle = new Battle(encounterStage, save, fieldRect(encounterStage), fx);
  // Every encounter starts from a neutral camera. Without this, a late-stage
  // zoom or shake could leak into retries and make the next battlefield jump.
  cam.x = 0;
  cam.y = 0;
  cam.zoom = 1;
  cam.punch = 0;
  hud = new Hud(battle, save, logicalW, logicalH);
  hud.autopilot = save.autoBattle;
  // Coaching follows the player through the opening trio rather than vanishing
  // after one encounter, where priority roles and danger marks have barely appeared.
  hud.freshPlayer = save.tutorialHints && save.unlockedStage <= 2 && save.level < 5;
  audio.setMood("battle", stageIndex);
  menus.beginBattleHistory();
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

function startTutorial(kind = "basics", returnTo: "map" | "handbook" = "map"): void {
  tutorialKind = kind;
  tutorialReturnTo = returnTo;
  xpGranted = true; // tutorials pay no xp
  autoDecisionTimer = 0;
  const temp = defaultSave();
  temp.sound = save.sound;
  temp.music = save.music;
  temp.soundVol = save.soundVol;
  temp.musicVol = save.musicVol;
  temp.speed = save.speed;
  temp.aimMode = save.aimMode;
  temp.telegraphAssist = save.telegraphAssist;
  temp.reducedMotion = save.reducedMotion;
  temp.screenShake = save.screenShake;
  temp.damageNumbers = save.damageNumbers;
  temp.colorSafe = save.colorSafe;
  temp.bigText = save.bigText;
  temp.enemyHealthBars = save.enemyHealthBars;
  temp.keybinds = { ...save.keybinds };
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
  battle = new Battle(TUTORIAL_STAGE, temp, fieldRect(TUTORIAL_STAGE), fx, true);
  hud = new Hud(battle, temp, logicalW, logicalH);
  tutorial = new Tutorial(battle, hud, kind);
  // lessons keep the calm campfire theme
  audio.setMood("menu");
  menus.beginBattleHistory(returnTo);
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

/** Retreat and defeat preserve half the coin already earned in the encounter.
 *  Replays use the same settlement rule as returning to the map. */
function bankRetreatSalvage(): void {
  if (!battle || battle.tutorialMode || activeChallenge || xpGranted || battle.goldEarned <= 0) return;
  save.gold += Math.round(battle.goldEarned / 2);
  xpGranted = true;
  persist(save);
}

function endBattleToMap(after?: () => void): void {
  const showFinale = menus.pendingFinale;
  if (battle && !battle.tutorialMode) roadPassage(STAGES[currentStage], "return");
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
  bankRetreatSalvage();
  mergeBestiary();
  battle = null;
  hud = null;
  fx = null;
  tutorial = null;
  battleSave = save;
  activeChallenge = null;
  audio.setMood("menu");
  menus.returnFromBattle(() => {
    if (showFinale) menus.renderFinale();
    after?.();
  });
}

let rolledLoot: { id: string; icon: string; name: string; rare: boolean; kind: "trinket" | "armor" | "gold"; amount?: number } | null = null;

function rollLoot(): void {
  if (rolledLoot) return;
  const rare = BOSS_STAGES.includes(currentStage);
  const bossReward = new Map<number, string>([
    [4, "alphaFang"],
    [5, "gorehornShard"],
    [11, "heartOfWinter"],
    [15, "widowsChime"],
    [17, "stormjawHeart"],
    [21, "kilnmasterSigil"],
    [23, "cindermawCoal"],
    [27, "matriarchKnot"],
    [29, "colossusSeed"],
    [33, "revenantGlass"],
    [35, "nightmotherSilk"],
    [39, "inquisitorSeal"],
    [41, "seraphicPinion"],
    [45, "rocPinion"],
    [47, "skybreakerPrism"],
    [51, "huntsmanHorn"],
    [53, "bloodmoonTine"],
    [57, "pilgrimCompass"],
    [59, "lastWaystone"],
  ]).get(currentStage) ?? null;
  const roll = Math.random();
  // real spoils: armor off the fallen, caches of coin — not only charms
  const unownedArmor = ALL_GEAR.filter((a) => a.cost > 0 && !save.armory.includes(a.id) && a.cost <= 220 + currentStage * 60);
  if (!rare && roll < 0.28 && unownedArmor.length) {
    const pick = unownedArmor[Math.floor(Math.random() * unownedArmor.length)];
    rolledLoot = { id: pick.id, icon: "🛡️", name: pick.name, rare: false, kind: "armor" };
  } else if (!rare && roll < 0.42) {
    const amount = 40 + Math.round(Math.random() * (30 + currentStage * 18));
    rolledLoot = { id: "gold", icon: "💰", name: `a cache of ${amount} gold`, rare: false, kind: "gold", amount };
  } else {
    const coastCommons = new Set(["saltglass", "tideknot", "stormcoil", "reeftalon"]);
    const pool = TRINKETS.filter((t) => bossReward ? t.id === bossReward : t.rarity === (rare ? "rare" : "common") && (currentStage < 12 || currentStage >= 18 || coastCommons.has(t.id)));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    rolledLoot = { id: pick.id, icon: pick.icon, name: pick.name, rare, kind: "trinket" };
  }
  if (hud) hud.pendingLoot = rolledLoot;
}

function settleVictory(): void {
  if (!battle || xpGranted) return;
  xpGranted = true;
  if (activeChallenge) {
    settleChallengeVictory(activeChallenge);
    return;
  }
  const rewardMult = DIFFICULTIES[save.difficulty ?? 1].rewardMult;
  const xp = Math.round((battle.xpEarned + battle.stage.xpReward) * rewardMult);
  const gold = Math.round((battle.goldEarned + Math.round(battle.stage.xpReward * 0.8)) * rewardMult);
  // XP belongs to the hero who took the field. Survivors earn the full award;
  // anyone still fallen at victory earns half. Revived heroes count as alive,
  // while the bench advances through Road Tutelage rather than free battle XP.
  let levels = 0;
  const milestones: string[] = [];
  const outcomes = new Map(battle.heroes().map((unit) => [unit.heroIndex, unit.alive]));
  save.heroes.forEach((h, i) => {
    if (!h.recruited) return;
    const earnedXp = personalBattleXp(xp, outcomes.has(i), outcomes.get(i) === true);
    if (earnedXp <= 0) return;
    const before = h.level;
    const beforeMasteries = new Set(h.masteredElements);
    levels += grantHeroXp(save, i, earnedXp);
    if (before < CALLING_UNLOCK_LEVEL && h.level >= CALLING_UNLOCK_LEVEL) milestones.push(`${HEROES[i].name} may choose a PATH`);
    if (before < ADV_CALLING_LEVEL && h.level >= ADV_CALLING_LEVEL) milestones.push(`${HEROES[i].name}'s path can be PROMOTED`);
    for (const mastery of h.masteredElements) {
      if (!beforeMasteries.has(mastery)) {
        const elementName = elementById(mastery)?.name ?? mastery;
        milestones.push(`${HEROES[i].name} mastered ${elementName} — its Legacy now travels between disciplines`);
      }
    }
  });
  persist(save);
  for (const m of milestones) setTimeout(() => menus.showToast(m), 1200);
  save.gold += Math.round(gold);
  // stage record book: clears + fastest time feed the map's scout report
  const rec = save.stageStats[currentStage];
  const t = Math.round(battle.time * 10) / 10;
  save.stageStats[currentStage] = { clears: (rec?.clears ?? 0) + 1, bestTime: rec ? Math.min(rec.bestTime, t) : t };
  save.journal.unshift({
    stage: currentStage,
    time: t,
    difficulty: save.difficulty,
    deaths: battle.heroDeaths,
    party: save.heroes.map((hero, index) => ({ hero, index })).filter(({ hero }) => hero.recruited && hero.active).map(({ index }) => index),
    at: Date.now(),
  });
  save.journal = save.journal.slice(0, 24);
  save.lifetime.victories += 1;
  save.lifetime.gold += gold;
  if (battle.heroDeaths === 0) save.lifetime.flawless += 1;
  if (save.difficulty === 3) save.lifetime.brutalClears += 1;
  if (currentStage === STAGES.length - 1) menus.pendingFinale = true;
  // a great foe's first fall yields its relic armor
  for (const relic of ARMORS) {
    if (relic.boss && (battle.killCounts[relic.boss] ?? 0) > 0 && !save.armory.includes(relic.id)) {
      save.armory.push(relic.id);
      setTimeout(() => {
        audio.play("relic");
        menus.showToast(`RELIC CLAIMED: ${relic.name} — dress a hero on their Equip screen`);
      }, 900);
    }
  }
  // loot was revealed on the victory card; bank it now
  rollLoot();
  const drop = rolledLoot!;
  const rare = drop.rare;
  if (drop.kind === "armor") save.armory.push(drop.id);
  else if (drop.kind === "gold") save.gold += drop.amount ?? 0;
  else save.inventory.push(drop.id);
  if (currentStage === save.unlockedStage && currentStage < STAGES.length - 1) {
    save.unlockedStage++;
    menus.travelFrom = currentStage;
  }
  persist(save);
  if (levels > 0) audio.play("levelup");
  setTimeout(() => menus.showToast(`+${gold} gold · loot: ${drop.icon} ${drop.name}${rare ? " (RARE)" : ""}`), 150);
}

function settleChallengeVictory(challenge: NonNullable<typeof activeChallenge>): void {
  if (!battle) return;
  const t = Math.round(battle.time * 10) / 10;
  const xp = Math.round((battle.xpEarned + battle.stage.xpReward) * 0.55);
  const outcomes = new Map(battle.heroes().map((unit) => [unit.heroIndex, unit.alive]));
  save.heroes.forEach((hero, index) => {
    if (!hero.recruited) return;
    const earnedXp = personalBattleXp(xp, outcomes.has(index), outcomes.get(index) === true);
    if (earnedXp > 0) grantHeroXp(save, index, earnedXp);
  });
  if (challenge.kind === "arena") {
    const trial = arenaTrialById(challenge.id);
    const old = trial ? save.arenaTrialRecords[trial.id] : save.arenaRecords[challenge.stage];
    const first = !old?.clears;
    const gold = trial ? arenaTrialPurse(trial, first) : arenaPurse(challenge.stage, first);
    const marks = trial ? trial.marks + (first ? 2 : 0) : first ? 3 : 1;
    save.gold += gold;
    save.arenaMarks += marks;
    const record = { clears: (old?.clears ?? 0) + 1, bestTime: old ? Math.min(old.bestTime, t) : t };
    if (trial) save.arenaTrialRecords[trial.id] = record;
    else save.arenaRecords[challenge.stage] = record;
    const milestone = claimChallengeMilestones("arena");
    setTimeout(() => menus.showToast(`${first ? "FIRST ARENA VICTORY" : "ARENA CLEARED"} · +${gold} gold · +${marks} marks${milestone}`), 120);
  } else {
    const contract = CONTRACTS.find((item) => item.id === challenge.id);
    if (!contract) return;
    const activeHeroes = save.heroes.filter((hero) => hero.recruited && hero.active).length;
    const fulfilled = contractFulfilled(contract, { heroDeaths: battle.heroDeaths, activeHeroes, time: t, difficulty: save.difficulty });
    if (!fulfilled) {
      const consolation = contractPurse(contract, false, false);
      save.gold += consolation;
      setTimeout(() => menus.showToast(`CONTRACT MISSED · the fight is won, but the terms were not · +${consolation} gold`), 120);
    } else {
      const old = save.contractRecords[contract.id];
      const first = !old?.clears;
      const gold = contractPurse(contract, first, true);
      save.gold += gold;
      save.contractRenown += first ? 2 : 1;
      save.contractRecords[contract.id] = { clears: (old?.clears ?? 0) + 1, bestTime: old ? Math.min(old.bestTime, t) : t };
      let prize = "";
      if (first) {
        const unowned = ALL_GEAR.filter((piece) => piece.cost > 0 && piece.cost <= 600 && !save.armory.includes(piece.id));
        const piece = unowned[Math.min(unowned.length - 1, Math.max(0, Math.floor(challenge.stage / 3)))] ?? null;
        if (piece) {
          save.armory.push(piece.id);
          prize = ` · ${piece.name}`;
        }
      }
      const milestone = claimChallengeMilestones("contract");
      setTimeout(() => menus.showToast(`CONTRACT FULFILLED · +${gold} gold · +${first ? 2 : 1} renown${prize}${milestone}`), 120);
    }
  }
  persist(save);
}

function claimChallengeMilestones(kind: "arena" | "contract"): string {
  const value = kind === "arena" ? save.arenaMarks : save.contractRenown;
  const milestones = kind === "arena" ? [5, 12, 20, 35, 55] : [4, 8, 14];
  const notes: string[] = [];
  for (const threshold of milestones) {
    const key = `${kind}-${threshold}`;
    if (value < threshold || save.challengeMilestones.includes(key)) continue;
    save.challengeMilestones.push(key);
    if (threshold === milestones[1]) {
      if (kind === "arena") {
        const rare = TRINKETS.find((item) => item.rarity === "rare" && !save.inventory.includes(item.id));
        if (rare) { save.inventory.push(rare.id); notes.push(rare.name); }
        else { save.gold += 300; notes.push("+300 milestone gold"); }
      } else {
        const gear = ALL_GEAR.find((piece) => piece.cost >= 350 && !save.armory.includes(piece.id));
        if (gear) { save.armory.push(gear.id); notes.push(gear.name); }
        else { save.gold += 300; notes.push("+300 milestone gold"); }
      }
    } else if (kind === "arena" && threshold === 35) {
      const gear = ALL_GEAR.find((piece) => piece.cost >= 600 && !save.armory.includes(piece.id));
      if (gear) { save.armory.push(gear.id); notes.push(gear.name); }
      else { save.gold += 700; notes.push("+700 milestone gold"); }
    } else {
      const bonus = threshold === milestones[0] ? 200 : threshold === 55 ? 1000 : 500;
      save.gold += bonus;
      notes.push(`+${bonus} milestone gold`);
    }
  }
  return notes.length ? ` · MILESTONE: ${notes.join(" + ")}` : "";
}

function syncChallengeReward(): void {
  if (!activeChallenge || !battle || !hud || battle.state !== "victory" || hud.rewardOverride) return;
  const xp = Math.round((battle.xpEarned + battle.stage.xpReward) * 0.55);
  if (activeChallenge.kind === "arena") {
    const trial = arenaTrialById(activeChallenge.id);
    const first = trial ? !(save.arenaTrialRecords[trial.id]?.clears ?? 0) : !(save.arenaRecords[activeChallenge.stage]?.clears ?? 0);
    hud.rewardOverride = {
      xp,
      gold: trial ? arenaTrialPurse(trial, first) : arenaPurse(activeChallenge.stage, first),
      note: trial ? `${trial.name} conquered · ${trial.marks + (first ? 2 : 0)} marks` : first ? "First-clear purse secured" : "Arena rematch complete",
    };
    return;
  }
  const contract = CONTRACTS.find((item) => item.id === activeChallenge?.id);
  if (!contract) return;
  const activeHeroes = save.heroes.filter((hero) => hero.recruited && hero.active).length;
  const fulfilled = contractFulfilled(contract, { heroDeaths: battle.heroDeaths, activeHeroes, time: battle.time, difficulty: save.difficulty });
  const first = !(save.contractRecords[contract.id]?.clears ?? 0);
  hud.rewardOverride = {
    xp,
    gold: contractPurse(contract, first, fulfilled),
    note: fulfilled ? "Contract terms fulfilled" : "Battle won · contract terms missed",
  };
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
      if (battle.tutorialMode) {
        startTutorial(tutorialKind, tutorialReturnTo);
        break;
      }
      if (battle.state === "victory") settleVictory();
      else if (battle.state === "defeat") bankRetreatSalvage();
      if (battle) {
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
      startBattle(currentStage, activeChallenge !== null);
      break;
    case "map":
      // Defensive settlement: a result card must never be able to route around
      // the full victory payout (including if a future overlay exposes Map).
      if (battle.state === "victory") settleVictory();
      endBattleToMap();
      break;
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
  if (!hud) return;
  const { x, y } = toLogical(event);
  hud.trackMouse(x, y); // keyboard aim follows the pointer even unbuttoned
  if (event.pointerId !== activePointer) return;
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
  if (!hud || !battle) return;
  if (event.key === "Escape") {
    if (hud.cancelKeyAim()) return; // Esc first disarms an aimed hotkey
    if (battle.state === "victory" || battle.state === "defeat") return;
    hud.paused = !hud.paused;
    return;
  }
  if (event.key === "p") {
    if (battle.state === "victory" || battle.state === "defeat") return;
    hud.paused = !hud.paused;
    return;
  }
  if (hud.paused || battle.state !== "fighting") return;
  const key = event.key.toLowerCase();
  const binds = battleSave.keybinds ?? save.keybinds;
  for (let i = 0; i < 4; i++) {
    if (key === binds[`hero${i + 1}`]) {
      hud.selectHeroByIndex(i);
      return;
    }
    if (i < 2 && key === binds[`ability${i + 1}`]) {
      hud.hotkeyAbility(i);
      return;
    }
  }
  if (key === binds.ability3) hud.hotkeyAbility(2); // Calling ultimate
  if (key === binds.ability4) hud.hotkeyAbility(3); // reserved legendary armor active
});

// When a victory/defeat overlay appears, settling XP waits for the button —
// but if the player backgrounds the tab on victory, still bank it.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && battle?.state === "victory") settleVictory();
  if (document.hidden && save.pauseOnBlur && hud && battle?.state === "fighting") hud.paused = true;
});

// ------------------------------------------------------------------ loop

const cam = { x: 0, y: 0, zoom: 1, punch: 0 };

let lastTime = performance.now();
let rafId = 0;
let lastDraw = 0;
let recoveryActive = false;
let recoveryIncident = "";
let recoverySource = "";

function runtimeContext(): Record<string, unknown> {
  const livingHeroes = battle?.units.filter((unit) => unit.team === "hero" && unit.alive).length ?? 0;
  const livingEnemies = battle?.units.filter((unit) => unit.team === "enemy" && unit.alive).length ?? 0;
  return {
    stage: battle ? currentStage : null,
    stageName: battle?.stage.name ?? null,
    battleState: battle?.state ?? null,
    battleTime: battle ? Math.round(battle.time * 10) / 10 : null,
    wave: battle?.waveIndex ?? null,
    livingHeroes,
    livingEnemies,
    difficulty: save.difficulty,
    bandLevel: save.level,
    challenge: activeChallenge?.kind ?? null,
  };
}

function resumeFrameLoop(): void {
  cancelAnimationFrame(rafId);
  lastTime = performance.now();
  rafId = requestAnimationFrame(frame);
}

function completeRecovery(action: "retry" | "leave"): void {
  try {
    if (action === "retry") {
      if (battle?.tutorialMode) startTutorial(tutorialKind, tutorialReturnTo);
      else if (battle) startBattle(currentStage, activeChallenge !== null);
    } else if (battle) {
      endBattleToMap();
    } else {
      location.reload();
      return;
    }
    logEvent("runtime_recovery", { incident: recoveryIncident, action });
    recoveryActive = false;
    recoveryPanel.hide();
    resumeFrameLoop();
  } catch (error) {
    const followup = logRuntimeError("recovery_action", error, { action, ...runtimeContext() });
    recoveryPanel.setStatus(`That recovery step also failed (report ${followup}). Download the report or reload the page.`);
  }
}

const recoveryPanel = new RecoveryPanel({
  retry: () => completeRecovery("retry"),
  leave: () => completeRecovery("leave"),
  export: () => {
    logEvent("diagnostics_exported", { incident: recoveryIncident });
    return exportTelemetry({ incident: recoveryIncident, source: recoverySource, ...runtimeContext() });
  },
});

function enterRuntimeRecovery(
  source: string,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  const inBattle = !!battle;
  const incident = logRuntimeError(source, error, { ...runtimeContext(), ...extra });
  if (recoveryActive) return;
  recoveryActive = true;
  recoveryIncident = incident;
  recoverySource = source;
  cancelAnimationFrame(rafId);
  if (hud) hud.paused = true;
  try {
    audio.setDanger(false);
    audio.setMarching(false);
  } catch {
    // The DOM recovery controls do not depend on the audio subsystem.
  }
  recoveryPanel.show({ id: incident, inBattle });
}

window.addEventListener("error", (event) => {
  enterRuntimeRecovery("window_error", event.error ?? new Error(event.message || "Unknown window error"), {
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  enterRuntimeRecovery("unhandled_rejection", event.reason);
});

function runFrame(now: number): void {
  // clamped both ways: a clock hiccup must never run time backwards
  let dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
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
      if (hud.drag && hud.drag.mode === "ability") {
        simDt *= battleSave.aimMode === "freeze" ? 0 : battleSave.aimMode === "realtime" ? 1 : 0.22;
      }
      // AUTO: the band runs on the sim's judgment until the player takes over
      autoDecisionTimer -= simDt;
      if (hud.autopilot && battle.state === "fighting" && battle.cinematic <= 0 && !tutorial && autoDecisionTimer <= 0) {
        autopilotTick(battle, battleSave);
        // Tactical choices do not need a fresh allocation-heavy search on
        // every display frame; ten decisions a second remains responsive.
        autoDecisionTimer = 0.1;
      }
      battle.update(simDt, battleSave);
      syncChallengeReward();
      fx.update(simDt);
      if (tutorial) {
        tutorial.update(simDt);
        if (tutorial.done) {
          if (!save.completedTutorials.includes(tutorialKind)) save.completedTutorials.push(tutorialKind);
          persist(save);
          endBattleToMap(() => menus.showToast("Field lesson complete — your next waymark is ready"));
          return;
        }
      }
    }
    hud.update(dt);
    if (battle.state === "victory" && !activeChallenge) rollLoot();
    audio.setBossMusic(!battle.tutorialMode && !!battle.bossRef?.alive && battle.state === "fighting");
    audio.setMarching(!hud.paused && battle.marching);

    // camera: ease toward the action (or the boss during their intro)
    const living = battle.units.filter((u) => u.alive);
    let targetX = cam.x;
    let targetY = cam.y;
    const calm = save.reducedMotion;
    if (!calm && battle.cinematic > 0 && battle.bossRef?.alive) {
      // the camera crosses the whole field now — it follows the story
      const maxCam = battle.stage.travelDirection === "south" ? 0 : Math.max(0, logicalW * FIELD_SCREENS - logicalW);
      targetX = Math.max(0, Math.min(maxCam, battle.bossRef.x - logicalW / 2));
      targetY = Math.max(-24, Math.min(24, (battle.bossRef.y - (logicalH - HUD_H) * 0.55) * 0.3));
    } else if (living.length) {
      // follow the band first; fall back to whatever still stands
      const maxCam = battle.stage.travelDirection === "south" ? 0 : Math.max(0, logicalW * FIELD_SCREENS - logicalW);
      const bandUnits = living.filter((u) => u.team === "hero");
      const focus = bandUnits.length ? bandUnits : living;
      let cx = 0;
      let cy = 0;
      for (const u of focus) {
        cx += u.x;
        cy += u.y;
      }
      cx /= focus.length;
      cy /= focus.length;
      // lean the frame toward the nearest fight so foes stay in view
      const foes = living.filter((u) => u.team === "enemy");
      if (foes.length && bandUnits.length) {
        let nearest = foes[0];
        let nd = Infinity;
        for (const e of foes) {
          const d = Math.abs(e.x - cx);
          if (d < nd) {
            nd = d;
            nearest = e;
          }
        }
        cx = cx * 0.65 + nearest.x * 0.35;
      }
      targetX = Math.max(0, Math.min(maxCam, cx - logicalW / 2));
      targetY = Math.max(-8, Math.min(8, (cy - (logicalH - HUD_H) * 0.55) * 0.1));
    }
    cam.x += (targetX - cam.x) * Math.min(1, dt * (battle.cinematic > 0 ? 4 : 2.2));
    cam.y += (targetY - cam.y) * Math.min(1, dt * (battle.cinematic > 0 ? 4 : 2.2));
    if (calm || !save.screenShake) {
      cam.punch = 0;
      battle.zoomPunch = 0;
      battle.kickX = 0;
      battle.kickY = 0;
    } else {
      cam.punch = Math.max(0, cam.punch - dt * 3.2);
      if (battle.zoomPunch > 0) {
        cam.punch = Math.max(cam.punch, battle.zoomPunch);
        battle.zoomPunch = 0;
      }
      // directional hit-kick decays fast
      battle.kickX *= Math.max(0, 1 - dt * 10);
      battle.kickY *= Math.max(0, 1 - dt * 10);
    }
    const cineZoom = !calm && battle.cinematic > 0 ? 0.1 : 0;
    cam.zoom = 1 + cam.punch * 0.045 + cineZoom;
    hud.cam = cam;

    const shakeX = !calm && save.screenShake && fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;
    const shakeY = !calm && save.screenShake && fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;

    const CY = (logicalH - HUD_H) * 0.5;
    const worldH = logicalH - HUD_H + 20;
    const dusk = battle.stage.waves.length > 1 ? Math.max(0, battle.waveIndex) / (battle.stage.waves.length - 1) : 0;
    ctx.save();
    ctx.translate(shakeX + battle.kickX, shakeY + battle.kickY);
    ctx.translate(logicalW / 2, CY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-logicalW / 2 - cam.x, -CY - cam.y);
    const horizon = (logicalH - HUD_H) * 0.34;
    try {
      drawBackground(ctx, battle.stage, logicalW, worldH, horizon, battle.time, {
        camX: cam.x,
        camY: cam.y,
        travel: battle.travel,
        dusk: battle.tutorialMode ? 0 : dusk * 0.8,
        units: battle.units,
      });
      drawDecals(ctx, battle);
      drawReflections(ctx, battle, battleSave, logicalW, worldH, horizon, battle.time);
      drawZones(ctx, battle);
      drawTelegraphs(ctx, battle, battleSave.colorSafe);
      drawUnits(ctx, battle, battleSave, hud.selected);
      drawProjectiles(ctx, battle);
      fx.draw(ctx);
      hud.drawWorld(ctx);
      drawForeground(ctx, battle.stage, logicalW, worldH, battle.time, { camX: cam.x, camY: cam.y, travel: battle.travel, units: battle.units });
    } finally {
      // a bad frame must not leak the camera transform into every frame after it
      ctx.restore();
    }
    drawLighting(ctx, battle, logicalW, worldH);
    drawColorGrade(ctx, battle.stage, logicalW, worldH);
    drawVignette(ctx, logicalW, worldH);
    // ultimate ceremony: the screen edges flare in the path's color
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
        const pulse = calm ? 0.82 : 0.55 + Math.abs(Math.sin(battle.time * 4)) * 0.45;
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
    drawTitleDiorama(ctx, save, logicalW, logicalH, save.reducedMotion ? 0 : now / 1000);
  }

}

function frame(now: number): void {
  if (recoveryActive) return;
  // Menus, paused battles and calm-motion scenes do not need a 60 Hz redraw.
  // Keeping them at 30 Hz halves idle canvas work while remaining responsive.
  if ((!battle || hud?.paused || save.reducedMotion) && now - lastDraw < 1000 / 30) {
    rafId = requestAnimationFrame(frame);
    return;
  }
  lastDraw = now;
  try {
    runFrame(now);
  } catch (error) {
    enterRuntimeRecovery("animation_frame", error);
    return;
  }
  rafId = requestAnimationFrame(frame);
}

menus.renderTitle();
rafId = requestAnimationFrame(frame);

/**
 * Headless battle for balance work: auto-orders every hero (nearest-enemy
 * aggro, healers channel the wounded, abilities fire on cooldown) and runs the
 * sim without rendering. Returns the outcome; run 21+ per config before
 * trusting any comparison.
 */
function runSim(
  stageIndex: number,
  opts: { maxSeconds?: number; saveOverride?: SaveData; seed?: number } = {},
): { result: string; time: number; deaths: number; casts: number } {
  const simSave: SaveData = opts.saveOverride ?? (JSON.parse(JSON.stringify(save)) as SaveData);
  return runBattleSimulation(STAGES[stageIndex], simSave, fieldRect(STAGES[stageIndex]), opts);
}

// debug/testing hook
Object.defineProperty(window, "__wayband", {
  value: {
    // drive one frame manually (rAF is paused in hidden tabs/panes)
    step(dt = 1 / 60) {
      cancelAnimationFrame(rafId);
      frame(lastTime + dt * 1000);
      // hand the clock back to reality so a following real rAF gets a sane dt
      lastTime = performance.now();
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
