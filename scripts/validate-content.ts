import assert from "node:assert/strict";
import {
  ABILITIES,
  ALL_GEAR,
  arenaPurse,
  ARMOR_ACTIVES,
  BOONS,
  BOSS_PHASES,
  BOSS_STAGES,
  CALLING_MASTERY_LEVELS,
  CALLINGS,
  CONTRACTS,
  contractFulfilled,
  contractPurse,
  ENEMIES,
  HEROES,
  HERO_GATE_STAGE,
  FOUNDATIONAL_CALLING_IDS,
  PARTY_CAP,
  STAGES,
  TALENTS,
  TRINKETS,
} from "../src/data";
import { defaultSave, grantHeroXp, loadSave, persist, slotKey } from "../src/save";
import { runBattleSimulation } from "../src/simulation";
import type { SaveData } from "../src/types";

function unique(values: string[], label: string): void {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

assert.ok(HEROES.length >= PARTY_CAP, "the roster must fill a party");
unique(HEROES.map((hero) => hero.name), "hero names");

for (const [rawIndex, gate] of Object.entries(HERO_GATE_STAGE)) {
  const heroIndex = Number(rawIndex);
  assert.ok(HEROES[heroIndex], `hero gate references missing hero ${heroIndex}`);
  assert.ok(Number.isInteger(gate) && gate >= 0 && gate <= STAGES.length, `invalid gate for hero ${heroIndex}`);
}

unique(ABILITIES.map((ability) => ability.id), "ability ids");
for (const ability of ABILITIES) {
  assert.ok(ability.name.trim(), `${ability.id} needs a name`);
  assert.ok(ability.cooldown > 0, `${ability.id} needs a positive cooldown`);
  assert.ok(ability.gate.value >= 0, `${ability.id} has an invalid attribute gate`);
}

const enemyKinds = new Set(Object.keys(ENEMIES));
assert.ok(STAGES.length > 0, "the campaign needs at least one stage");
assert.equal(STAGES.length % 6, 0, "the continuous map requires complete six-stage regions");
unique(STAGES.map((stage) => String(stage.id)), "stage ids");
STAGES.forEach((stage, index) => {
  assert.equal(stage.id, index, `stage ${index} must keep a sequential id`);
  assert.ok(stage.name.trim() && stage.subtitle.trim(), `stage ${index} needs presentation text`);
  assert.ok(stage.scale > 0 && stage.xpReward > 0, `stage ${index} needs positive tuning values`);
  assert.ok(stage.waves.length > 0, `stage ${index} needs at least one wave`);
  stage.waves.forEach((wave, waveIndex) => {
    assert.ok(wave.length > 0, `stage ${index} wave ${waveIndex} is empty`);
    for (const entry of wave) {
      assert.ok(enemyKinds.has(entry.kind), `stage ${index} references missing enemy ${entry.kind}`);
      assert.ok(Number.isInteger(entry.count) && entry.count > 0, `stage ${index} has an invalid ${entry.kind} count`);
    }
  });
});

unique(BOSS_STAGES.map(String), "boss stage indexes");
for (const stageIndex of BOSS_STAGES) assert.ok(STAGES[stageIndex], `boss stage ${stageIndex} does not exist`);
for (const [kind, marks] of Object.entries(BOSS_PHASES)) {
  assert.ok(enemyKinds.has(kind), `boss phases reference missing enemy ${kind}`);
  assert.ok(marks?.length, `${kind} needs at least one phase marker`);
  assert.ok(marks!.every((mark) => mark > 0 && mark < 1), `${kind} has an invalid phase threshold`);
}
unique(CONTRACTS.map((contract) => contract.id), "contract ids");
for (const contract of CONTRACTS) {
  assert.ok(STAGES[contract.stage], `${contract.id} references missing stage ${contract.stage}`);
  assert.ok(contract.unlockStage >= contract.stage, `${contract.id} cannot unlock before its stage is reachable`);
  assert.ok(contract.reward > 0, `${contract.id} needs a positive reward`);
}
const flawless = CONTRACTS.find((contract) => contract.condition === "flawless")!;
assert.ok(contractFulfilled(flawless, { heroDeaths: 0, activeHeroes: 4, time: 999, difficulty: 0 }), "flawless contract should accept a clean victory");
assert.ok(!contractFulfilled(flawless, { heroDeaths: 1, activeHeroes: 4, time: 1, difficulty: 3 }), "flawless contract must reject a fallen hero");
assert.ok(arenaPurse(4, true) > arenaPurse(4, false), "first arena clears need a larger purse");
assert.ok(contractPurse(flawless, true, true) > contractPurse(flawless, false, true), "first contract clears need a bonus");
assert.ok(contractPurse(flawless, false, false) < contractPurse(flawless, false, true), "missed terms must only pay consolation gold");

unique(ALL_GEAR.map((piece) => piece.id), "gear ids");
unique(TRINKETS.map((trinket) => trinket.id), "trinket ids");
unique(BOONS.map((boon) => boon.id), "boon ids");
unique(TALENTS.map((talent) => talent.id), "talent ids");
unique(CALLINGS.map((calling) => calling.id), "calling ids");
assert.equal(FOUNDATIONAL_CALLING_IDS.length, 6, "the foundation must remain six readable choices");
for (const id of FOUNDATIONAL_CALLING_IDS) {
  const calling = CALLINGS.find((item) => item.id === id);
  assert.ok(calling, `missing foundational calling ${id}`);
  assert.equal(calling.advanced?.length, 2, `${id} needs exactly two level-20 promotions`);
}

for (const [family, ability] of Object.entries(ARMOR_ACTIVES)) {
  assert.ok(ability.id && ability.name, `${family} armor active is incomplete`);
}

const simulationSave = defaultSave();
const simulationField = { left: 26, right: 1798, top: 170, bottom: 470 };
const firstRun = runBattleSimulation(STAGES[0], structuredClone(simulationSave), simulationField, { seed: 4242, maxSeconds: 240 });
const repeatedRun = runBattleSimulation(STAGES[0], structuredClone(simulationSave), simulationField, { seed: 4242, maxSeconds: 240 });
assert.deepEqual(repeatedRun, firstRun, "seeded battle simulations must be reproducible");
assert.notEqual(firstRun.result, "timeout", "the opening-stage baseline must reach a result");

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
});
const saveRoundTrip = defaultSave();
saveRoundTrip.gold = 137;
saveRoundTrip.unlockedStage = 3;
saveRoundTrip.formation = "wedge";
saveRoundTrip.pinnedGoal = "Recruit Wren";
saveRoundTrip.journal = [{ stage: 0, time: 42.5, difficulty: 1, deaths: 0, party: [0, 3], at: 1 }];
persist(saveRoundTrip);
assert.equal(loadSave().gold, 137, "saved progress must round-trip");
assert.equal(loadSave().formation, "wedge", "formation must persist");
assert.equal(loadSave().pinnedGoal, "Recruit Wren", "pinned goals must persist");
assert.equal(loadSave().journal[0]?.time, 42.5, "Chronicle entries must persist");
const masterySave = defaultSave();
masterySave.heroes[0].calling = "vanguard";
for (let i = 0; i < CALLING_MASTERY_LEVELS; i++) grantHeroXp(masterySave, 0, 99999);
assert.ok(masterySave.heroes[0].masteredCallings.includes("vanguard"), "ten active calling levels must unlock permanent mastery");
masterySave.heroes[0].calling = "reaver";
assert.ok(masterySave.heroes[0].masteredCallings.includes("vanguard"), "switching callings must preserve prior mastery");
storage.set(slotKey(), "{broken json");
assert.equal(loadSave().unlockedStage, 0, "corrupt saves must recover to a new campaign");

const legacy = defaultSave() as SaveData & { reducedMotion?: boolean; keybinds?: Record<string, string> };
legacy.heroes = legacy.heroes.slice(0, 4);
legacy.heroes[0].equipped = ["cleave", "bellow", "mend"];
legacy.keybinds = { hero1: "1", hero2: "2", hero3: "3", hero4: "4", ability1: "q", ability2: "w", ability3: "e", ability4: "r", ability5: "f" };
delete legacy.reducedMotion;
delete legacy.keybinds;
delete (legacy as Partial<SaveData>).formation;
delete (legacy as Partial<SaveData>).journal;
delete (legacy as Partial<SaveData>).pinnedGoal;
storage.set(slotKey(), JSON.stringify(legacy));
const migrated = loadSave();
assert.equal(migrated.heroes.length, HEROES.length, "older rosters must gain new hero records");
assert.equal(migrated.reducedMotion, false, "older saves must gain comfort defaults");
assert.ok(migrated.keybinds.ability1, "older saves must gain default keybinds");
assert.deepEqual(migrated.heroes[0].equipped, ["cleave", "bellow"], "older three-spell loadouts must trim safely to two choices");
assert.equal(migrated.keybinds.ability3, "r", "the former default ultimate key must migrate to slot three");
assert.equal(migrated.formation, "line", "older saves must gain the default formation");
assert.deepEqual(migrated.journal, [], "older saves must gain an empty Chronicle");

console.log(
  `Validated ${STAGES.length} stages, ${enemyKinds.size} enemies, ${HEROES.length} heroes, ` +
    `${ABILITIES.length} abilities, ${ALL_GEAR.length + TRINKETS.length} items, and a deterministic opening battle.`,
);
