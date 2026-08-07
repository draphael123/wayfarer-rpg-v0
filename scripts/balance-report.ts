import { BOSS_STAGES, callingById, DIFFICULTIES, pathAbilities, STAGES, WEAPON_TIERS } from "../src/data";
import { runBattleSimulation } from "../src/simulation";
import type { SaveData } from "../src/types";
import { referenceSave } from "./campaign-model";

const FIELD = { left: 26, right: 1798, top: 170, bottom: 470 };
const requestedSeeds = Number.parseInt(process.env.BALANCE_SEEDS ?? "6", 10);
const seedCount = Number.isFinite(requestedSeeds) ? Math.max(1, Math.min(24, requestedSeeds)) : 6;
const SEEDS = Array.from({ length: seedCount }, (_, index) => 1000 + index * 97);

function assertReferenceLoadout(save: SaveData, stageIndex: number): void {
  for (const hero of save.heroes.filter((candidate) => candidate.recruited && candidate.active)) {
    if (hero.level < 5) continue;
    const path = callingById(hero.calling);
    if (!path || hero.discipline !== path.discipline || hero.element !== path.element) {
      throw new Error(`stage ${stageIndex + 1}: level-${hero.level} reference hero has no valid elemental Path`);
    }
    const expected = pathAbilities(path.discipline, path.element).map((ability) => ability.id);
    if (hero.equipped.length !== 2 || expected.some((id, index) => hero.equipped[index] !== id)) {
      throw new Error(`stage ${stageIndex + 1}: ${path.name} must carry its fixed two-technique loadout`);
    }
    if (!path.signature || path.signature.pathSkill !== "ultimate") {
      throw new Error(`stage ${stageIndex + 1}: ${path.name} is missing its signature ultimate`);
    }
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const tuningFlags: string[] = [];
const normalMedians = new Map<number, number>();
let difficultyFloorFailures = 0;
const aggregates = DIFFICULTIES.map(() => ({
  wins: 0,
  runs: 0,
  deaths: 0,
  casts: 0,
  winTimes: [] as number[],
  lossTimes: [] as number[],
  timeouts: 0,
}));

console.log("# Wayband deterministic balance report\n");
console.log(
  `Reference parties now earn their levels from prior first clears, spend every attribute point in their Discipline stat, equip real two-technique + ultimate Paths, and buy gear at economy-backed milestones. Talent optimization stays excluded, keeping this a conservative AUTO guardrail. ${seedCount} seeds per stage/difficulty.\n`,
);
console.log("| Stage | Ref. party | Gear | Difficulty | Wins | Win median | Loss median | Timeouts | Avg deaths | Avg casts |");
console.log("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");

for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
  for (let difficulty = 0; difficulty < DIFFICULTIES.length; difficulty++) {
    const reference = referenceSave(stageIndex, difficulty);
    assertReferenceLoadout(reference, stageIndex);
    const party = reference.heroes.filter((hero) => hero.recruited && hero.active);
    const levels = party.map((hero) => hero.level);
    const lowLevel = Math.min(...levels);
    const highLevel = Math.max(...levels);
    const levelLabel = lowLevel === highLevel ? `Lv ${lowLevel}` : `Lv ${lowLevel}–${highLevel}`;
    const weaponTier = Math.min(...party.map((hero) => hero.weaponTier));
    const forged = Math.max(0, ...party.map((hero) => hero.armor ? reference.forge[hero.armor] ?? 0 : 0));
    const gearLabel = `${WEAPON_TIERS[weaponTier].name}${forged ? ` · forge +${forged}` : ""}`;
    const results = SEEDS.map((seed) =>
      runBattleSimulation(STAGES[stageIndex], structuredClone(reference), FIELD, { seed, maxSeconds: 300 }),
    );
    const winTimes = results.filter((result) => result.result === "victory").map((result) => result.time);
    const lossTimes = results.filter((result) => result.result === "defeat").map((result) => result.time);
    const timeouts = results.filter((result) => result.result === "timeout").length;
    const wins = winTimes.length;
    const deaths = results.reduce((sum, result) => sum + result.deaths, 0) / results.length;
    const casts = results.reduce((sum, result) => sum + result.casts, 0) / results.length;
    const medianWin = winTimes.length ? median(winTimes) : null;
    const medianLoss = lossTimes.length ? median(lossTimes) : null;
    const aggregate = aggregates[difficulty];
    aggregate.wins += wins;
    aggregate.runs += results.length;
    aggregate.deaths += results.reduce((sum, result) => sum + result.deaths, 0);
    aggregate.casts += results.reduce((sum, result) => sum + result.casts, 0);
    aggregate.winTimes.push(...winTimes);
    aggregate.lossTimes.push(...lossTimes);
    aggregate.timeouts += timeouts;
    console.log(
      `| ${stageIndex + 1}. ${STAGES[stageIndex].name} | ${party.length} heroes · ${levelLabel} | ${gearLabel} | ${DIFFICULTIES[difficulty].name} | ${wins}/${results.length} | ${medianWin === null ? "—" : `${medianWin.toFixed(1)}s`} | ${medianLoss === null ? "—" : `${medianLoss.toFixed(1)}s`} | ${timeouts} | ${deaths.toFixed(1)} | ${casts.toFixed(1)} |`,
    );

    if (difficulty === 1 && wins <= Math.floor(results.length * 0.25)) {
      difficultyFloorFailures += 1;
      tuningFlags.push(`Stage ${stageIndex + 1} ${STAGES[stageIndex].name}: Normal won only ${wins}/${results.length}.`);
    } else if (difficulty === 1 && wins < results.length) {
      tuningFlags.push(`Stage ${stageIndex + 1} ${STAGES[stageIndex].name}: Normal varied at ${wins}/${results.length}; inspect the losing seeds before changing global difficulty.`);
    }
    if (difficulty === 1 && medianWin !== null) normalMedians.set(stageIndex, medianWin);
    if (difficulty === 0 && wins === 0) {
      difficultyFloorFailures += 1;
      tuningFlags.push(`Stage ${stageIndex + 1} ${STAGES[stageIndex].name}: Easy had no wins.`);
    }
  }
}

console.log("\n## Campaign-wide sample\n");
console.log("| Difficulty | Wins | Win rate | Win median | Loss median | Timeouts | Avg deaths | Avg casts |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
aggregates.forEach((aggregate, difficulty) => {
  const winMedian = aggregate.winTimes.length ? `${median(aggregate.winTimes).toFixed(1)}s` : "—";
  const lossMedian = aggregate.lossTimes.length ? `${median(aggregate.lossTimes).toFixed(1)}s` : "—";
  console.log(`| ${DIFFICULTIES[difficulty].name} | ${aggregate.wins}/${aggregate.runs} | ${((aggregate.wins / aggregate.runs) * 100).toFixed(1)}% | ${winMedian} | ${lossMedian} | ${aggregate.timeouts} | ${(aggregate.deaths / aggregate.runs).toFixed(2)} | ${(aggregate.casts / aggregate.runs).toFixed(1)} |`);
});
const hardRate = aggregates[2].wins / aggregates[2].runs;
const brutalRate = aggregates[3].wins / aggregates[3].runs;
if (hardRate > 0.9) tuningFlags.push(`Campaign-wide Hard AUTO win rate is ${(hardRate * 100).toFixed(1)}%; the difficulty may need more behavioral pressure rather than another flat stat multiplier.`);
if (brutalRate > 0.65) tuningFlags.push(`Campaign-wide Brutal AUTO win rate is ${(brutalRate * 100).toFixed(1)}%; prepared players may exhaust the difficulty ceiling too early.`);

console.log("\n## Normal boss pacing\n");
console.log("| Boss stage | Boss median | Approach median | Relative duration |");
console.log("| --- | ---: | ---: | ---: |");
for (const stageIndex of BOSS_STAGES) {
  const bossTime = normalMedians.get(stageIndex);
  const approachTime = normalMedians.get(stageIndex - 1);
  if (bossTime === undefined) continue;
  console.log(`| ${stageIndex + 1}. ${STAGES[stageIndex].name} | ${bossTime.toFixed(1)}s | ${approachTime === undefined ? "—" : `${approachTime.toFixed(1)}s`} | ${approachTime === undefined ? "—" : `${Math.round((bossTime / approachTime) * 100)}%`} |`);
}

for (const stageIndex of BOSS_STAGES) {
  const bossTime = normalMedians.get(stageIndex);
  const approachTime = normalMedians.get(stageIndex - 1);
  if (bossTime !== undefined && approachTime !== undefined && bossTime < 22 && bossTime < approachTime * 0.65) {
    const rawMultiplier = (approachTime * 0.7) / bossTime;
    const hpMultiplier = Math.min(1.5, Math.max(1.05, Math.round(rawMultiplier * 20) / 20));
    tuningFlags.push(`Stage ${stageIndex + 1} ${STAGES[stageIndex].name}: Normal boss ${bossTime.toFixed(1)}s vs approach ${approachTime.toFixed(1)}s (${Math.round((bossTime / approachTime) * 100)}%); test HP ×${hpMultiplier.toFixed(2)} to target roughly 70% of approach duration.`);
  }
}

console.log("\n## Actionable guardrails\n");
if (tuningFlags.length) {
  for (const flag of tuningFlags) console.log(`- REVIEW: ${flag}`);
}
if (difficultyFloorFailures === 0) {
  console.log("- PASS: Every Easy encounter produced a win and every Normal encounter cleared the minimum 25% seeded-win floor.");
}
console.log(`- PASS: All ${STAGES.length} stage snapshots used valid elemental Paths with exactly two normal techniques and one ultimate.`);
