import {
  ALL_GEAR,
  CALLING_SWITCH_COST,
  HEROES,
  RECRUIT_COST,
  ROAD_TUTELAGE_STAGE,
  STAGES,
  WEAPON_TIERS,
  forgeCost,
  roadTutelageCost,
} from "../src/data";
import {
  addProgress,
  addRoadTutelageLevel,
  canReceiveRoadTutelage,
  heroArrivalStage,
  scheduledStageReward,
  type LevelProgress,
} from "./campaign-model";

interface HeroTrack extends LevelProgress {
  recruited: boolean;
  hiredAfterStage: number | null;
  pathAtStage: number | null;
  masteryAtStage: number | null;
  promotionAtStage: number | null;
  lessons: number;
}

interface PurchaseGoal {
  name: string;
  dueStage: number;
  cost: number;
  boughtAfterStage: number | null;
}

interface Check {
  pass: boolean;
  label: string;
  detail: string;
}

const gearCost = (...ids: string[]): number => ids.reduce((sum, id) => {
  const piece = ALL_GEAR.find((candidate) => candidate.id === id);
  if (!piece) throw new Error(`economy model references missing gear: ${id}`);
  return sum + piece.cost;
}, 0);

const coreBodies = ["ironholdPlate", "huntsmanHarness", "emberweave", "pilgrimRobe"];
const coreAccessories = [
  "greathelm", "bulwarkGreaves",
  "huntersHood", "roadstriders",
  "sageCirclet", "quietSlippers",
  "pilgrimCowl", "driftSandals",
];
const ironWeapons = WEAPON_TIERS[1].cost * 4;
const steelWeapons = WEAPON_TIERS[2].cost * 4;
const mythrilWeapons = WEAPON_TIERS[3].cost * 4;
const forgePassCost = (toLevel: number): number => coreBodies.reduce((sum, id) => {
  const piece = ALL_GEAR.find((candidate) => candidate.id === id);
  if (!piece) throw new Error(`economy model references missing gear: ${id}`);
  return sum + forgeCost(piece, toLevel);
}, 0);

const goals: PurchaseGoal[] = [
  { name: "Iron weapons for the active four", dueStage: 4, cost: ironWeapons, boughtAfterStage: null },
  { name: "Role-defining body gear for the active four", dueStage: 7, cost: gearCost(...coreBodies), boughtAfterStage: null },
  { name: "Two experimental Path changes", dueStage: 10, cost: CALLING_SWITCH_COST * 2, boughtAfterStage: null },
  { name: "Steel weapons for the active four", dueStage: 12, cost: steelWeapons, boughtAfterStage: null },
  { name: "Complete three-piece role kits", dueStage: 16, cost: gearCost(...coreAccessories), boughtAfterStage: null },
  { name: "Mythril weapons for the active four", dueStage: 24, cost: mythrilWeapons, boughtAfterStage: null },
  { name: "First forge rank on four body pieces", dueStage: 30, cost: forgePassCost(1), boughtAfterStage: null },
  { name: "Second forge rank on four body pieces", dueStage: 42, cost: forgePassCost(2), boughtAfterStage: null },
  { name: "Final forge rank on four body pieces", dueStage: 54, cost: forgePassCost(3), boughtAfterStage: null },
];

const heroes: HeroTrack[] = HEROES.map((_, index) => ({
  level: 1,
  xp: 0,
  recruited: index === 0 || index === 3,
  hiredAfterStage: index === 0 || index === 3 ? 0 : null,
  pathAtStage: null,
  masteryAtStage: null,
  promotionAtStage: null,
  lessons: 0,
}));
const untutoredProgress: LevelProgress[] = HEROES.map(() => ({ level: 1, xp: 0 }));

let purse = 0;
let grossGold = 0;
let recruitSpend = 0;
let progressionSpend = 0;
let tutelageSpend = 0;
let tutelageLessons = 0;
let firstTutelageStage: number | null = null;
let activeTutelageViolations = 0;
let leadTutelageViolations = 0;
let affordabilityViolations = 0;
let minimumPurse = Number.POSITIVE_INFINITY;
const checkpoints: { stage: number; gross: number; spent: number; purse: number; lessons: number; roster: number; activeLevels: string; benchLevels: string }[] = [];

function activeRoster(): number[] {
  // Keep the founding quartet stable once assembled; new arrivals receive the
  // game's real 50% bench catch-up rather than fictitious full XP.
  return [0, 3, 1, 2, 4, 5, 6, 7].filter((index) => heroes[index].recruited).slice(0, 4);
}

function levelRange(indexes: number[]): string {
  if (!indexes.length) return "—";
  const levels = indexes.map((index) => heroes[index].level);
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  return low === high ? `${low}` : `${low}–${high}`;
}

function recordProgressionMilestones(hero: HeroTrack, stage: number, before: number): void {
  if (before < 5 && hero.level >= 5 && hero.pathAtStage === null) hero.pathAtStage = stage;
  if (before < 15 && hero.level >= 15 && hero.masteryAtStage === null) hero.masteryAtStage = stage;
  if (before < 20 && hero.level >= 20 && hero.promotionAtStage === null) hero.promotionAtStage = stage;
}

function hireArrivals(stage: number): void {
  const available = HEROES
    .map((_, index) => index)
    .filter((index) => !heroes[index].recruited && heroArrivalStage(index) <= stage + 1)
    .sort((a, b) => (RECRUIT_COST[a] ?? Number.POSITIVE_INFINITY) - (RECRUIT_COST[b] ?? Number.POSITIVE_INFINITY));
  for (const index of available) {
    const cost = RECRUIT_COST[index] ?? Number.POSITIVE_INFINITY;
    if (cost > purse) continue;
    purse -= cost;
    recruitSpend += cost;
    heroes[index].recruited = true;
    heroes[index].hiredAfterStage = stage;
  }
}

function buyDueGoals(stage: number): void {
  for (const goal of goals) {
    if (goal.boughtAfterStage !== null || goal.dueStage > stage || goal.cost > purse) continue;
    purse -= goal.cost;
    progressionSpend += goal.cost;
    goal.boughtAfterStage = stage;
  }
}

/** Protect the next region's already-authored gear goal plus one Path change. */
function tutelageReserve(stage: number): number {
  return CALLING_SWITCH_COST + goals
    .filter((goal) => goal.boughtAfterStage === null && goal.dueStage <= stage + 6)
    .reduce((sum, goal) => sum + goal.cost, 0);
}

/**
 * Model a diligent Tavern visit after every first clear. The lowest companion
 * studies first, but lessons stop before consuming the next region's gear fund
 * or the standing Path-change reserve.
 */
function tutorBench(stage: number): void {
  const activeIndexes = activeRoster();
  const active = new Set(activeIndexes);
  const veteranLevel = Math.max(1, ...activeIndexes.map((index) => heroes[index].level));
  const reserve = tutelageReserve(stage);
  while (true) {
    const pupilIndex = heroes
      .map((hero, index) => ({ hero, index }))
      .filter(({ hero, index }) => canReceiveRoadTutelage(hero, hero.recruited, active.has(index), veteranLevel, stage))
      .sort((a, b) => a.hero.level - b.hero.level || a.index - b.index)[0]?.index;
    if (pupilIndex === undefined) return;
    const hero = heroes[pupilIndex];
    const cost = roadTutelageCost(hero.level);
    if (cost > purse - reserve) return;

    if (active.has(pupilIndex)) activeTutelageViolations += 1;
    if (cost > purse) affordabilityViolations += 1;
    const before = hero.level;
    purse -= cost;
    minimumPurse = Math.min(minimumPurse, purse);
    tutelageSpend += cost;
    tutelageLessons += 1;
    hero.lessons += 1;
    firstTutelageStage ??= stage;
    addRoadTutelageLevel(hero);
    recordProgressionMilestones(hero, stage, before);
    if (hero.level > veteranLevel) leadTutelageViolations += 1;
  }
}

for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
  const stage = stageIndex + 1;
  const reward = scheduledStageReward(STAGES[stageIndex], 1);
  const active = new Set(activeRoster());
  heroes.forEach((hero, index) => {
    if (!hero.recruited) return;
    const before = hero.level;
    const earnedXp = active.has(index) ? reward.clearXp : reward.clearXp * 0.5;
    addProgress(hero, earnedXp);
    addProgress(untutoredProgress[index], earnedXp);
    recordProgressionMilestones(hero, stage, before);
  });
  grossGold += reward.clearGold;
  purse += reward.clearGold;
  hireArrivals(stage);
  buyDueGoals(stage);
  tutorBench(stage);

  if (stage % 6 === 0 || stage === STAGES.length) {
    const activeIndexes = activeRoster();
    const benchIndexes = heroes.map((hero, index) => ({ hero, index })).filter(({ hero, index }) => hero.recruited && !activeIndexes.includes(index)).map(({ index }) => index);
    checkpoints.push({
      stage,
      gross: grossGold,
      spent: recruitSpend + progressionSpend + tutelageSpend,
      purse,
      lessons: tutelageLessons,
      roster: heroes.filter((hero) => hero.recruited).length,
      activeLevels: levelRange(activeIndexes),
      benchLevels: levelRange(benchIndexes),
    });
  }
}

const checks: Check[] = [];
const check = (pass: boolean, label: string, detail: string): void => checks.push({ pass, label, detail });
const corePartyHired = Math.max(heroes[1].hiredAfterStage ?? Number.POSITIVE_INFINITY, heroes[2].hiredAfterStage ?? Number.POSITIVE_INFINITY);
const allHired = Math.max(...heroes.map((hero) => hero.hiredAfterStage ?? Number.POSITIVE_INFINITY));
const lead = heroes[0];
const reachedGoal = (name: string): PurchaseGoal => goals.find((goal) => goal.name === name)!;
const finalDueGoals = goals.filter((goal) => goal.dueStage <= STAGES.length);
const pathWindowStart = Math.max(0, (lead.pathAtStage ?? 5) - 1);
const pathWindowRewards = STAGES.slice(pathWindowStart, pathWindowStart + 6).map((stage) => scheduledStageReward(stage, 1).clearGold).sort((a, b) => a - b);
const pathWindowMedian = pathWindowRewards[Math.floor(pathWindowRewards.length / 2)] ?? 0;
const maxRecruitDelay = Math.max(...heroes.map((hero, index) => {
  if (hero.hiredAfterStage === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, hero.hiredAfterStage - Math.max(0, heroArrivalStage(index) - 1));
}));
const finalActive = activeRoster();
const finalBench = heroes.map((hero, index) => ({ hero, index })).filter(({ hero, index }) => hero.recruited && !finalActive.includes(index)).map(({ index }) => index);
const levelGap = finalBench.length
  ? Math.max(...finalActive.map((index) => heroes[index].level)) - Math.min(...finalBench.map((index) => heroes[index].level))
  : 0;
const untutoredGap = finalBench.length
  ? Math.max(...finalActive.map((index) => untutoredProgress[index].level)) - Math.min(...finalBench.map((index) => untutoredProgress[index].level))
  : 0;

check(STAGES.length % 6 === 0, "Complete regions", `${STAGES.length} stages form ${STAGES.length / 6} six-stage regions.`);
check(STAGES.every((stage) => scheduledStageReward(stage, 1).clearGold > 0 && scheduledStageReward(stage, 1).clearXp > 0), "Positive first-clear rewards", "Every authored encounter advances both gold and XP.");
check(Number.isFinite(corePartyHired) && corePartyHired <= 4, "Four-hero party timing", Number.isFinite(corePartyHired) ? `The founding combat quartet is assembled after stage ${corePartyHired}.` : "The campaign floor never funds the founding quartet.");
check(Number.isFinite(allHired), "Full roster affordability", Number.isFinite(allHired) ? `All ${HEROES.length} heroes are recruited after stage ${allHired}.` : "At least one arrived hero is still unaffordable at the finale.");
check(maxRecruitDelay <= 6, "Recruit wait ceiling", Number.isFinite(maxRecruitDelay) ? `Longest arrival-to-hire wait is ${maxRecruitDelay} stage${maxRecruitDelay === 1 ? "" : "s"}.` : "At least one recruit never joins.");
check(lead.pathAtStage !== null && lead.pathAtStage <= 6, "Path unlock pacing", lead.pathAtStage ? `The lead hero reaches level 5 after stage ${lead.pathAtStage}.` : "The lead hero never reaches level 5.");
if (STAGES.length >= 24) {
  check(lead.masteryAtStage !== null && lead.masteryAtStage <= 24, "First Elemental Legacy", lead.masteryAtStage ? `The lead hero masters a Path after stage ${lead.masteryAtStage}.` : "The campaign XP floor never reaches Path Mastery.");
} else {
  check(lead.level >= 14, "Elemental Legacy runway", `The lead hero finishes the current road at level ${lead.level}; one more level completes the first ten-level Path practice.`);
}
if (STAGES.length >= 36) check(lead.promotionAtStage !== null && lead.promotionAtStage <= 36, "Level-20 Promotion", lead.promotionAtStage ? `The lead hero reaches Promotion after stage ${lead.promotionAtStage}.` : "The lead hero never reaches level 20.");
check(finalDueGoals.every((goal) => goal.boughtAfterStage !== null), "Due progression purchases", finalDueGoals.every((goal) => goal.boughtAfterStage !== null) ? "Recruit-first spending still funds every gear goal due in the current campaign." : `Unfunded: ${finalDueGoals.filter((goal) => goal.boughtAfterStage === null).map((goal) => goal.name).join(", ")}.`);
check(finalDueGoals.every((goal) => goal.boughtAfterStage !== null && goal.boughtAfterStage - goal.dueStage <= 6), "Purchase delay ceiling", "Every due recruit-first gear goal is funded within one six-stage region of its target.");
check(purse >= CALLING_SWITCH_COST, "Final experimentation reserve", `Final conservative purse is ${purse}g versus a ${CALLING_SWITCH_COST}g Path change.`);
check(CALLING_SWITCH_COST <= pathWindowMedian, "Path switch affordability", `A ${CALLING_SWITCH_COST}g change is at most the ${pathWindowMedian}g median first-clear purse in the six-stage Path-unlock window.`);
check(firstTutelageStage === null || firstTutelageStage >= ROAD_TUTELAGE_STAGE, "Tutelage unlock gate", firstTutelageStage === null ? "No lesson was affordable." : `The first lesson occurs after stage ${firstTutelageStage}, never before the stage-${ROAD_TUTELAGE_STAGE} unlock.`);
check(activeTutelageViolations === 0, "Inactive pupils only", `${tutelageLessons} modeled lessons were granted without training an active hero.`);
check(leadTutelageViolations === 0, "Tutelage level ceiling", "No lesson raised a companion above the active-band veteran level.");
check(affordabilityViolations === 0 && minimumPurse >= 0, "Tutelage affordability", `No lesson overspent the purse; the lowest post-lesson balance was ${Number.isFinite(minimumPurse) ? minimumPurse : purse}g.`);
check(levelGap <= untutoredGap, "Bench catch-up", `Tutelage changes the least-used recruit's final gap from ${untutoredGap} to ${levelGap} levels.`);
if (STAGES.length >= 30) {
  const mythril = reachedGoal("Mythril weapons for the active four");
  check(mythril.boughtAfterStage !== null && mythril.boughtAfterStage <= 30, "Endgame weapon timing", mythril.boughtAfterStage ? `Four Mythril weapons are funded after stage ${mythril.boughtAfterStage}.` : "The four-weapon Mythril goal remains unfunded.");
}

console.log("# Wayband deterministic economy & progression report\n");
console.log("Normal first clears only. This is a conservative floor: scheduled enemies count, while random loot, summoned adds, repeat clears, contracts, arenas and combat talents do not. Recruits and due gear come first; Road Tutelage then spends only above the next region's goal plus one Path-change reserve.\n");
console.log("## Campaign checkpoints\n");
console.log("| After stage | Gross gold | Planned spend | Purse | Lessons | Roster | Active levels | Bench levels |");
console.log("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const row of checkpoints) {
  console.log(`| ${row.stage} | ${row.gross}g | ${row.spent}g | ${row.purse}g | ${row.lessons} | ${row.roster}/${HEROES.length} | ${row.activeLevels} | ${row.benchLevels} |`);
}

console.log("\n## Recruit timing\n");
console.log("| Hero | Available for | Cost | Hired after | Lessons | Path | Mastery | Promotion |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
heroes.forEach((hero, index) => {
  console.log(`| ${HEROES[index].name} | stage ${heroArrivalStage(index)} | ${RECRUIT_COST[index] ?? 0}g | ${hero.hiredAfterStage === 0 ? "founder" : hero.hiredAfterStage ?? "not hired"} | ${hero.lessons} | ${hero.pathAtStage ?? "—"} | ${hero.masteryAtStage ?? "—"} | ${hero.promotionAtStage ?? "—"} |`);
});

console.log("\n## Planned affordability\n");
console.log("| Goal | Target | Cost | Funded after | Delay |");
console.log("| --- | ---: | ---: | ---: | ---: |");
for (const goal of goals) {
  const delay = goal.boughtAfterStage === null ? "—" : Math.max(0, goal.boughtAfterStage - goal.dueStage);
  console.log(`| ${goal.name} | ${goal.dueStage} | ${goal.cost}g | ${goal.boughtAfterStage ?? "not yet"} | ${delay} |`);
}

console.log("\n## Road Tutelage\n");
console.log(`- Unlock: after stage ${ROAD_TUTELAGE_STAGE}`);
console.log(`- Lessons purchased: ${tutelageLessons} for ${tutelageSpend}g`);
console.log(`- First lesson: after stage ${firstTutelageStage ?? "none"}`);
console.log(`- Final active/bench levels: ${levelRange(finalActive)} / ${levelRange(finalBench)} (gap ${levelGap}, versus ${untutoredGap} without lessons)`);
console.log(`- Protected reserve: the next six-stage gear goal plus ${CALLING_SWITCH_COST}g for a Path change`);

console.log("\n## Invariant checks\n");
for (const result of checks) console.log(`- ${result.pass ? "PASS" : "FAIL"}: ${result.label} — ${result.detail}`);

const modeledSpend = recruitSpend + progressionSpend + tutelageSpend;
if (purse > modeledSpend * 3) {
  console.log(`- REVIEW: Late-game gold sinks — the final ${purse}g purse is ${(purse / modeledSpend).toFixed(1)}× all modeled spending. Add late gear tiers, deeper forging, crafting or other deliberate sinks before reducing road rewards.`);
}
if (levelGap > 2) {
  console.log(`- REVIEW: Bench catch-up — the least-used recruit finishes ${levelGap} levels behind the lead. Consider a late-road catch-up purchase or rotation incentive.`);
}

const failures = checks.filter((result) => !result.pass);
if (failures.length) {
  console.error(`\n${failures.length} economy/progression invariant${failures.length === 1 ? "" : "s"} failed. Treat the failed rows above as tuning actions.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${checks.length} economy/progression invariants passed.`);
}
