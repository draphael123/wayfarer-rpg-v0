import assert from "node:assert/strict";
import {
  ABILITIES,
  ALL_GEAR,
  ARMOR_ACTIVES,
  BOONS,
  BOSS_STAGES,
  CALLINGS,
  ENEMIES,
  HEROES,
  HERO_GATE_STAGE,
  PARTY_CAP,
  STAGES,
  TALENTS,
  TRINKETS,
} from "../src/data";
import { defaultSave, loadSave, persist, slotKey } from "../src/save";
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

unique(ALL_GEAR.map((piece) => piece.id), "gear ids");
unique(TRINKETS.map((trinket) => trinket.id), "trinket ids");
unique(BOONS.map((boon) => boon.id), "boon ids");
unique(TALENTS.map((talent) => talent.id), "talent ids");
unique(CALLINGS.map((calling) => calling.id), "calling ids");

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
storage.set(slotKey(), "{broken json");
assert.equal(loadSave().unlockedStage, 0, "corrupt saves must recover to a new campaign");

const legacy = defaultSave() as SaveData & { reducedMotion?: boolean; keybinds?: Record<string, string> };
legacy.heroes = legacy.heroes.slice(0, 4);
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
assert.equal(migrated.formation, "line", "older saves must gain the default formation");
assert.deepEqual(migrated.journal, [], "older saves must gain an empty Chronicle");

console.log(
  `Validated ${STAGES.length} stages, ${enemyKinds.size} enemies, ${HEROES.length} heroes, ` +
    `${ABILITIES.length} abilities, ${ALL_GEAR.length + TRINKETS.length} items, and a deterministic opening battle.`,
);
