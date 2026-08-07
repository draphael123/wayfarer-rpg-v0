import { ABILITIES, HEROES, STAGES } from "../src/data";
import { defaultSave } from "../src/save";
import { runBattleSimulation } from "../src/simulation";
import type { AttrKey, SaveData } from "../src/types";

const FIELD = { left: 26, right: 1798, top: 170, bottom: 470 };
const SEEDS = Array.from({ length: 12 }, (_, index) => 1000 + index * 97);

function referenceSave(stageIndex: number, difficulty: number): SaveData {
  const save = defaultSave();
  save.unlockedStage = stageIndex;
  save.difficulty = difficulty;
  const active = stageIndex === 0 ? [0, 3] : stageIndex === 1 ? [0, 1, 3] : [0, 1, 2, 3];
  save.heroes.forEach((hero, index) => {
    hero.recruited = active.includes(index);
    hero.active = active.includes(index);
    if (!hero.active) return;
    hero.level = Math.min(24, 2 + stageIndex * 2);
    hero.weaponTier = Math.min(3, Math.floor(stageIndex / 3));
    const main = (Object.entries(HEROES[index].baseAttrs) as [AttrKey, number][]).sort((a, b) => b[1] - a[1])[0][0];
    hero.attrs[main] += stageIndex * 2;
    hero.equipped = ABILITIES.filter((ability) => hero.attrs[ability.gate.attr] >= ability.gate.value)
      .slice(0, 3)
      .map((ability) => ability.id);
  });
  return save;
}

console.log("# Wayband deterministic balance report\n");
console.log("Reference parties approximate expected campaign progression; results are guardrails, not final tuning targets.\n");
console.log("| Stage | Difficulty | Wins | Median time | Avg deaths | Avg casts |");
console.log("| --- | --- | ---: | ---: | ---: | ---: |");

for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex++) {
  for (const difficulty of [0, 1, 2, 3]) {
    const results = SEEDS.map((seed) =>
      runBattleSimulation(STAGES[stageIndex], referenceSave(stageIndex, difficulty), FIELD, { seed, maxSeconds: 300 }),
    );
    const times = results.map((result) => result.time).sort((a, b) => a - b);
    const wins = results.filter((result) => result.result === "victory").length;
    const deaths = results.reduce((sum, result) => sum + result.deaths, 0) / results.length;
    const casts = results.reduce((sum, result) => sum + result.casts, 0) / results.length;
    console.log(
      `| ${stageIndex + 1}. ${STAGES[stageIndex].name} | ${["Easy", "Normal", "Hard", "Brutal"][difficulty]} | ${wins}/${results.length} | ${times[Math.floor(times.length / 2)].toFixed(1)}s | ${deaths.toFixed(1)} | ${casts.toFixed(1)} |`,
    );
  }
}
