import assert from "node:assert/strict";
import {
  DISCIPLINE_IDS,
  HEROES,
  HERO_STARTER_PATHS,
  SPECIALIZATION_PROFILES,
  STAGES,
  pathAbilities,
  pathId,
  specializationKey,
} from "../src/data";
import { runBattleSimulation } from "../src/simulation";
import type { AttrKey, DisciplineId } from "../src/types";
import { referenceSave } from "./campaign-model";

const FIELD = { left: 26, right: 1798, top: 170, bottom: 470 };
const STAGE_INDEX = 40;
const SEEDS = [7103, 7207, 7309];
const ROLE_ATTRIBUTE: Record<DisciplineId, AttrKey> = {
  knight: "str",
  warrior: "str",
  rogue: "dex",
  archer: "dex",
  priest: "spi",
  mage: "int",
  necromancer: "int",
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

console.log("# Wayband master-specialization matrix\n");
console.log(`Normal AUTO benchmark on stage ${STAGE_INDEX + 1}, ${STAGES[STAGE_INDEX].name}; three deterministic seeds per branch.\n`);
console.log("| Discipline | Master spec | Rhythm | Wins | Median | Avg deaths | Avg casts |");
console.log("| --- | --- | --- | ---: | ---: | ---: | ---: |");

let timeouts = 0;
let failedBranches = 0;
for (const discipline of DISCIPLINE_IDS) {
  const starter = HERO_STARTER_PATHS.find((entry) => entry.discipline === discipline)!;
  for (const branch of ["ascendant", "paragon"] as const) {
    const save = referenceSave(STAGE_INDEX, 1);
    const hero = save.heroes[0];
    const calling = pathId(discipline, starter.element);
    hero.level = 30;
    hero.attrs = { ...HEROES[0].baseAttrs };
    hero.attrs[ROLE_ATTRIBUTE[discipline]] += 58;
    hero.calling = calling;
    hero.discipline = discipline;
    hero.element = starter.element;
    hero.equipped = pathAbilities(discipline, starter.element).map((ability) => ability.id);
    hero.callingLevels = { [calling]: 25 };
    hero.masteredCallings = [calling];
    hero.advCalling = `${calling}-${branch}`;
    hero.advancedCallings = { [calling]: hero.advCalling };
    hero.specializationLevels = { [specializationKey(discipline, branch)]: 10 };
    hero.masteredSpecializations = [specializationKey(discipline, branch)];

    const results = SEEDS.map((seed) => runBattleSimulation(STAGES[STAGE_INDEX], structuredClone(save), FIELD, { seed, maxSeconds: 180 }));
    const wins = results.filter((result) => result.result === "victory");
    timeouts += results.filter((result) => result.result === "timeout").length;
    if (!wins.length) failedBranches++;
    const times = wins.map((result) => result.time);
    const deaths = results.reduce((sum, result) => sum + result.deaths, 0) / results.length;
    const casts = results.reduce((sum, result) => sum + result.casts, 0) / results.length;
    const profile = SPECIALIZATION_PROFILES[discipline][branch];
    console.log(`| ${discipline} | ${branch} | ${profile.rhythm} | ${wins.length}/${results.length} | ${times.length ? `${median(times).toFixed(1)}s` : "—"} | ${deaths.toFixed(1)} | ${casts.toFixed(1)} |`);
  }
}

assert.equal(timeouts, 0, "master-specialization matrix must not time out");
assert.equal(failedBranches, 0, "every master specialization must produce a seeded Normal victory");
console.log("\n- PASS: All 14 master specializations completed the benchmark without a timeout or dead branch.");
