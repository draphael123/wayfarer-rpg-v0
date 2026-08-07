import {
  CALLING_MASTERY_LEVELS,
  CALLING_UNLOCK_LEVEL,
  DIFFICULTIES,
  ENEMIES,
  HEROES,
  HERO_GATE_STAGE,
  MAX_LEVEL,
  pathAbilities,
  pathId,
  ROAD_TUTELAGE_STAGE,
  STAGES,
  xpForLevel,
} from "../src/data";
import { defaultSave } from "../src/save";
import type { AttrKey, DisciplineId, ElementId, HeroSave, SaveData, StageDef } from "../src/types";

/**
 * Authored reference identities for deterministic reports.  These deliberately
 * cover all five disciplines and all eight elements instead of giving every
 * hero whichever legacy spell happens to pass an attribute gate first.
 */
export const REFERENCE_PATHS: readonly { discipline: DisciplineId; element: ElementId }[] = [
  { discipline: "knight", element: "earth" },
  { discipline: "archer", element: "storm" },
  { discipline: "mage", element: "flame" },
  { discipline: "priest", element: "radiant" },
  { discipline: "priest", element: "frost" },
  { discipline: "knight", element: "blood" },
  { discipline: "knight", element: "frost" },
  { discipline: "rogue", element: "shadow" },
] as const;

const ROLE_ATTRIBUTE: Record<DisciplineId, AttrKey> = {
  knight: "str",
  rogue: "dex",
  archer: "dex",
  priest: "spi",
  mage: "int",
};

interface ReferenceKit {
  body: string;
  helm: string;
  boots: string;
}

const REFERENCE_KITS: Record<DisciplineId, ReferenceKit> = {
  knight: { body: "ironholdPlate", helm: "greathelm", boots: "bulwarkGreaves" },
  rogue: { body: "skirmisherHarness", helm: "trackersCap", boots: "springheels" },
  archer: { body: "huntsmanHarness", helm: "huntersHood", boots: "roadstriders" },
  priest: { body: "pilgrimRobe", helm: "pilgrimCowl", boots: "driftSandals" },
  mage: { body: "emberweave", helm: "sageCirclet", boots: "quietSlippers" },
};

export interface ScheduledStageReward {
  enemies: number;
  combatXp: number;
  clearXp: number;
  combatGold: number;
  clearGold: number;
}

/**
 * A conservative, deterministic reward floor for one clear.  It counts every
 * enemy authored in the wave data and intentionally excludes random caches,
 * boss summons, contracts, arenas, talent bonuses and repeat clears.
 */
export function scheduledStageReward(stage: StageDef, difficulty = 1): ScheduledStageReward {
  let enemies = 0;
  let combatXp = 0;
  let combatGold = 0;
  for (const wave of stage.waves) {
    for (const entry of wave) {
      const enemy = ENEMIES[entry.kind];
      if (!enemy) throw new Error(`stage ${stage.id + 1} (${stage.name}) references unregistered enemy ${entry.kind}`);
      enemies += entry.count;
      combatXp += Math.round(enemy.xp * stage.scale) * entry.count;
      combatGold += Math.round(enemy.xp * 0.7 * stage.scale) * entry.count;
    }
  }
  const rewardMult = DIFFICULTIES[difficulty]?.rewardMult ?? 1;
  return {
    enemies,
    combatXp,
    clearXp: Math.round((combatXp + stage.xpReward) * rewardMult),
    combatGold,
    clearGold: Math.round((combatGold + Math.round(stage.xpReward * 0.8)) * rewardMult),
  };
}

export interface LevelProgress {
  level: number;
  xp: number;
}

export function addProgress(progress: LevelProgress, amount: number): void {
  if (progress.level >= MAX_LEVEL) {
    progress.xp = 0;
    return;
  }
  progress.xp += Math.round(amount);
  while (progress.level < MAX_LEVEL && progress.xp >= xpForLevel(progress.level)) {
    progress.xp -= xpForLevel(progress.level);
    progress.level += 1;
  }
  if (progress.level >= MAX_LEVEL) progress.xp = 0;
}

/** Mirrors the Tavern's production eligibility without mutating a save. */
export function canReceiveRoadTutelage(
  progress: LevelProgress,
  recruited: boolean,
  active: boolean,
  veteranLevel: number,
  clearedStages: number,
): boolean {
  return clearedStages >= ROAD_TUTELAGE_STAGE && recruited && !active && progress.level < veteranLevel && progress.level < MAX_LEVEL;
}

/** Grant exactly one modeled level, preserving any XP already in the bar. */
export function addRoadTutelageLevel(progress: LevelProgress): number {
  if (progress.level >= MAX_LEVEL) return 0;
  const before = progress.level;
  const needed = Math.max(1, xpForLevel(progress.level) - progress.xp);
  addProgress(progress, needed);
  if (progress.level !== before + 1) throw new Error(`Road Tutelage must grant exactly one level, not ${progress.level - before}`);
  return needed;
}

/** The original campaign's intended core-party recruitment cadence. */
export function coreRosterForStage(stageIndex: number): number[] {
  if (stageIndex <= 0) return [0, 3];
  if (stageIndex === 1) return [0, 1, 3];
  return [0, 1, 2, 3];
}

function progressBeforeStage(stageIndex: number, heroIndex: number): LevelProgress {
  const progress = { level: 1, xp: 0 };
  for (let cleared = 0; cleared < stageIndex; cleared++) {
    if (!coreRosterForStage(cleared).includes(heroIndex)) continue;
    addProgress(progress, scheduledStageReward(STAGES[cleared], 1).clearXp);
  }
  return progress;
}

function gearForRoadPosition(save: SaveData, hero: HeroSave, discipline: DisciplineId, stageIndex: number): void {
  // These thresholds mirror the conservative recruit-first purchase plan in
  // economy-report.ts: an item bought after stage N is available for stage N+1.
  hero.weaponTier = stageIndex >= 24 ? 3 : stageIndex >= 13 ? 2 : stageIndex >= 7 ? 1 : 0;
  const kit = REFERENCE_KITS[discipline];
  if (stageIndex >= 11) hero.armor = kit.body;
  if (stageIndex >= 16) hero.helm = kit.helm;
  if (stageIndex >= 16) hero.boots = kit.boots;
  for (const piece of [hero.armor, hero.helm, hero.boots]) {
    if (piece && !save.armory.includes(piece)) save.armory.push(piece);
  }
  const forgeLevel = stageIndex >= 54 ? 3 : stageIndex >= 42 ? 2 : stageIndex >= 30 ? 1 : 0;
  if (forgeLevel > 0 && hero.armor) save.forge[hero.armor] = forgeLevel;
}

function applyReferenceHero(save: SaveData, heroIndex: number, stageIndex: number, active: boolean): void {
  const hero = save.heroes[heroIndex];
  const path = REFERENCE_PATHS[heroIndex % REFERENCE_PATHS.length];
  const progress = progressBeforeStage(stageIndex, heroIndex);
  hero.recruited = active;
  hero.active = active;
  if (!active) return;

  hero.level = progress.level;
  hero.xp = progress.xp;
  const roleAttribute = ROLE_ATTRIBUTE[path.discipline];
  hero.attrs = { ...HEROES[heroIndex].baseAttrs };
  hero.attrs[roleAttribute] += (hero.level - 1) * 2;

  if (hero.level >= CALLING_UNLOCK_LEVEL) {
    const calling = pathId(path.discipline, path.element);
    const practicedLevels = Math.max(0, hero.level - CALLING_UNLOCK_LEVEL);
    hero.calling = calling;
    hero.discipline = path.discipline;
    hero.element = path.element;
    hero.equipped = pathAbilities(path.discipline, path.element).map((ability) => ability.id);
    hero.callingLevels = { [calling]: practicedLevels };
    hero.elementLevels = { [path.element]: practicedLevels };
    if (practicedLevels >= CALLING_MASTERY_LEVELS) {
      hero.masteredCallings = [calling];
      hero.masteredElements = [path.element];
    }
    if (hero.level >= 20 && practicedLevels >= CALLING_MASTERY_LEVELS) {
      hero.advCalling = `${calling}-${heroIndex % 2 === 0 ? "ascendant" : "paragon"}`;
      hero.advancedCallings = { [calling]: hero.advCalling };
    }
  }
  gearForRoadPosition(save, hero, path.discipline, stageIndex);
}

/**
 * Expected campaign state immediately before attempting a stage on first-clear
 * progression.  It is intentionally deterministic and spends every earned
 * attribute point in the hero's discipline-defining stat.
 */
export function referenceSave(stageIndex: number, difficulty: number): SaveData {
  const save = defaultSave();
  save.unlockedStage = stageIndex;
  save.difficulty = difficulty;
  const active = coreRosterForStage(stageIndex);
  save.heroes.forEach((_, heroIndex) => applyReferenceHero(save, heroIndex, stageIndex, active.includes(heroIndex)));
  save.level = Math.max(...save.heroes.filter((hero) => hero.recruited).map((hero) => hero.level));
  return save;
}

/** Arrival stage expressed as a one-based campaign stage for reports. */
export function heroArrivalStage(heroIndex: number): number {
  return (HERO_GATE_STAGE[heroIndex] ?? 0) + 1;
}
