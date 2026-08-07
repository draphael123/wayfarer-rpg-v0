import assert from "node:assert/strict";
import {
  DISCIPLINE_IDS,
  ELEMENT_IDS,
  HEROES,
  STAGES,
  pathAbilities,
  pathId,
} from "../src/data";
import { runBattleSimulation } from "../src/simulation";
import type { AttrKey, DisciplineId, ElementId, SaveData } from "../src/types";
import { referenceSave } from "./campaign-model";

const FIELD = { left: 26, right: 1798, top: 170, bottom: 470 };
const BENCHMARKS = [40, 58] as const;
const SEEDS = [8101, 8209, 8317, 8423];
const ROLE_ATTRIBUTE: Record<DisciplineId, AttrKey> = {
  knight: "vit",
  warrior: "str",
  rogue: "dex",
  archer: "dex",
  priest: "spi",
  mage: "int",
  necromancer: "int",
};

interface PathResult {
  discipline: DisciplineId;
  element: ElementId;
  wins: number;
  runs: number;
  times: number[];
  deaths: number;
  casts: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Replace one member of a stable reference band. This measures the marginal
 * value of every Path without creating unreasonable four-healer or four-tank
 * parties. Gear and advanced specializations are removed from the candidate so
 * the report isolates the foundational discipline + element kit. */
function candidateSave(stageIndex: number, discipline: DisciplineId, element: ElementId): SaveData {
  const save = referenceSave(stageIndex, 1);
  const hero = save.heroes[0];
  const calling = pathId(discipline, element);
  hero.attrs = { ...HEROES[0].baseAttrs };
  hero.attrs[ROLE_ATTRIBUTE[discipline]] += (hero.level - 1) * 2;
  hero.discipline = discipline;
  hero.element = element;
  hero.calling = calling;
  hero.equipped = pathAbilities(discipline, element).map((ability) => ability.id);
  hero.callingLevels = { [calling]: Math.max(0, hero.level - 5) };
  hero.elementLevels = { [element]: Math.max(0, hero.level - 5) };
  hero.masteredCallings = [];
  hero.masteredElements = [];
  hero.advCalling = null;
  hero.advancedCallings = {};
  hero.specializationLevels = {};
  hero.masteredSpecializations = [];
  hero.armor = null;
  hero.helm = null;
  hero.boots = null;
  hero.trinket = null;
  return save;
}

const results: PathResult[] = [];
for (const discipline of DISCIPLINE_IDS) {
  for (const element of ELEMENT_IDS) {
    const summary: PathResult = { discipline, element, wins: 0, runs: 0, times: [], deaths: 0, casts: 0 };
    for (const stageIndex of BENCHMARKS) {
      const save = candidateSave(stageIndex, discipline, element);
      for (const seed of SEEDS) {
        const result = runBattleSimulation(STAGES[stageIndex], structuredClone(save), FIELD, { seed, maxSeconds: 180 });
        summary.runs++;
        if (result.result === "victory") {
          summary.wins++;
          summary.times.push(result.time);
        }
        summary.deaths += result.deaths;
        summary.casts += result.casts;
      }
    }
    results.push(summary);
  }
}

console.log("# Wayband foundational Path balance matrix\n");
console.log(`One candidate Path rotates through a stable Normal reference party on stages ${BENCHMARKS.map((index) => index + 1).join(" and ")}; ${SEEDS.length} seeds per stage.\n`);
console.log("| Discipline | Element | Wins | Median | Avg deaths | Avg casts |");
console.log("| --- | --- | ---: | ---: | ---: | ---: |");
for (const result of results) {
  console.log(`| ${result.discipline} | ${result.element} | ${result.wins}/${result.runs} | ${result.times.length ? `${median(result.times).toFixed(1)}s` : "—"} | ${(result.deaths / result.runs).toFixed(2)} | ${(result.casts / result.runs).toFixed(1)} |`);
}

console.log("\n## Discipline and element rollups\n");
console.log("| Axis | Name | Win rate | Median victory | Avg deaths |");
console.log("| --- | --- | ---: | ---: | ---: |");
const axes: readonly [string, readonly string[], (result: PathResult) => string][] = [
  ["Discipline", DISCIPLINE_IDS, (result) => result.discipline],
  ["Element", ELEMENT_IDS, (result) => result.element],
];
for (const [axis, ids, select] of axes) {
  for (const id of ids) {
    const group = results.filter((result) => select(result) === id);
    const wins = group.reduce((sum, result) => sum + result.wins, 0);
    const runs = group.reduce((sum, result) => sum + result.runs, 0);
    const times = group.flatMap((result) => result.times);
    const deaths = group.reduce((sum, result) => sum + result.deaths, 0);
    console.log(`| ${axis} | ${id} | ${((wins / runs) * 100).toFixed(1)}% | ${times.length ? `${median(times).toFixed(1)}s` : "—"} | ${(deaths / runs).toFixed(2)} |`);
  }
}

const deadPaths = results.filter((result) => result.wins < result.runs / 2);
const medians = results.filter((result) => result.times.length).map((result) => median(result.times));
const fastest = Math.min(...medians);
const slowest = Math.max(...medians);
assert.equal(deadPaths.length, 0, `found low-viability Paths: ${deadPaths.map((result) => `${result.discipline}-${result.element}`).join(", ")}`);
assert.ok(slowest / fastest <= 1.75, `Path victory-time spread is too wide: ${fastest.toFixed(1)}s to ${slowest.toFixed(1)}s`);
console.log(`\n- PASS: All ${results.length} foundational Paths won at least half their seeded Normal benchmarks.`);
console.log(`- PASS: Median Path clear-time spread stayed within 1.75× (${fastest.toFixed(1)}s–${slowest.toFixed(1)}s).`);
