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
  DISCIPLINES,
  DISCIPLINE_IDS,
  ENEMIES,
  ELEMENTS,
  ELEMENT_IDS,
  HEROES,
  HERO_GATE_STAGE,
  PARTY_CAP,
  pathAbilities,
  pathId,
  STAGES,
  TALENTS,
  TRINKETS,
} from "../src/data";
import { defaultSave, grantHeroXp, loadSave, persist, recoveryKey, rejectedSaveKey, slotKey } from "../src/save";
import { LATE_FOE_KINDS } from "../src/late-content";
import { LATE_ROAD_BOSS_INTENTS, LATE_ROAD_ELITE_STAGES, LATE_ROAD_REGIONS, LATE_ROAD_STAGES } from "../src/late-road";
import { Battle } from "../src/battle";
import { FxSystem } from "../src/fx";
import { runBattleSimulation } from "../src/simulation";
import type { HeroSave, SaveData } from "../src/types";

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
for (const [kind, enemy] of Object.entries(ENEMIES)) {
  assert.ok(enemy.weakTo && ELEMENT_IDS.includes(enemy.weakTo), `${kind} needs one valid elemental weakness`);
  assert.ok(enemy.resists && ELEMENT_IDS.includes(enemy.resists), `${kind} needs one valid elemental resistance`);
  assert.notEqual(enemy.weakTo, enemy.resists, `${kind} cannot resist its own weakness`);
}
assert.ok(STAGES.length > 0, "the campaign needs at least one stage");
assert.equal(STAGES.length, 60, "the Long Road must contain the planned sixty stages");
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
assert.equal(LATE_ROAD_STAGES.length, 42, "Acts IV-X must add seven complete six-stage regions");
assert.equal(LATE_ROAD_REGIONS.length, 7, "the late road needs seven distinct regions");
unique(LATE_ROAD_REGIONS.map((region) => region.id), "late-road region ids");
unique(LATE_ROAD_REGIONS.map((region) => region.name), "late-road region names");
unique(LATE_ROAD_STAGES.map((stage) => stage.name), "late-road stage names");
assert.deepEqual(LATE_ROAD_REGIONS.flatMap((region) => [...region.signatureFoes]), [...LATE_FOE_KINDS], "each late region must own three signature foes");
assert.deepEqual(LATE_ROAD_STAGES.map((stage) => stage.id), Array.from({ length: 42 }, (_, index) => index + 18), "late-road stage ids must continue the opening road");
assert.deepEqual(LATE_ROAD_ELITE_STAGES, LATE_ROAD_REGIONS.map((region) => region.start + 3), "each late region needs a fourth-stage named elite");
assert.deepEqual(LATE_ROAD_BOSS_INTENTS.map((boss) => boss.stage), LATE_ROAD_REGIONS.map((region) => region.start + 5), "each late region needs a sixth-stage boss");
for (const region of LATE_ROAD_REGIONS) {
  assert.equal(region.bossStage, region.start + 5, `${region.name} finale must close its six-stage stretch`);
  assert.equal(region.eliteStage, region.start + 3, `${region.name} named elite must break up the middle of the act`);
  const finale = STAGES[region.bossStage];
  const finalWave = finale.waves.at(-1)!;
  assert.deepEqual(finalWave, [{ kind: region.bossKind, count: 1 }], `${region.name} must end with its planned unique boss`);
  assert.deepEqual(STAGES[region.eliteStage].waves, [[{ kind: region.eliteKind, count: 1 }]], `${region.name} must have a standalone named elite encounter`);
  assert.ok(region.promise.trim(), `${region.name} boss needs a mechanic promise for later integration`);
  const approach = STAGES.slice(region.start, region.bossStage);
  const roadStages = approach.filter((stage) => stage.id !== region.eliteStage);
  for (const foe of region.signatureFoes) {
    const deployments = roadStages.filter((stage) => stage.waves.some((wave) => wave.some((entry) => entry.kind === foe)));
    assert.ok(deployments.length >= 3, `${region.name} must develop ${foe} across at least three road stages`);
  }
  assert.ok(roadStages.every((stage) => region.signatureFoes.filter((foe) => stage.waves.some((wave) => wave.some((entry) => entry.kind === foe))).length >= 2), `${region.name} road stages must use at least two local enemy roles`);
  assert.ok(roadStages.every((stage) => !!stage.terrain), `${region.name} road stages need an active regional battlefield rule`);
  for (const stage of approach) {
    for (const wave of stage.waves) {
      const headcount = wave.reduce((total, entry) => total + entry.count, 0);
      assert.ok(headcount <= 6, `${stage.name} wave count ${headcount} is too crowded for late-road telegraphs`);
    }
  }
}
const coastKinds = new Set(STAGES.slice(12, 18).flatMap((stage) => stage.waves.flatMap((wave) => wave.map((entry) => entry.kind))));
for (const kind of ["wreckgunner", "stormeel", "conchseer"]) {
  assert.ok(coastKinds.has(kind), `Stormbreak must deploy its new ${kind} role`);
}
assert.ok(coastKinds.size >= 12, "Stormbreak needs at least twelve distinct enemy silhouettes including bosses");

unique(BOSS_STAGES.map(String), "boss stage indexes");
for (const stageIndex of BOSS_STAGES) assert.ok(STAGES[stageIndex], `boss stage ${stageIndex} does not exist`);
for (const [kind, marks] of Object.entries(BOSS_PHASES)) {
  assert.ok(enemyKinds.has(kind), `boss phases reference missing enemy ${kind}`);
  assert.ok(marks?.length, `${kind} needs at least one phase marker`);
  assert.ok(marks!.every((mark) => mark > 0 && mark < 1), `${kind} has an invalid phase threshold`);
  assert.ok(marks!.every((mark, index) => index === 0 || marks![index - 1] > mark), `${kind} phase thresholds must descend with health`);
}

// Explicit encounter/presentation audit. The renderer labels document the
// bespoke draw path (or, for Alpha, the substantial dedicated wolf branch),
// while mechanic signatures prevent two bosses from collapsing into one role.
const BOSS_AUDIT = [
  { kind: "ogre", stage: 1, main: false, renderer: "drawMosstooth", mechanic: "cart-sweeps+hero-grab+belly-flop" },
  { kind: "alpha", stage: 4, main: true, renderer: "drawWolf:alpha-branch", mechanic: "pack-summon+pounce+moonlight-hunt+devour" },
  { kind: "warlord", stage: 5, main: true, renderer: "drawGorehulk", mechanic: "shieldwall+warbanner+axe-throw+execution-sweep" },
  { kind: "wyrm", stage: 11, main: true, renderer: "drawWyrm", mechanic: "coil+frost-breath+submerged-hunt+bare-heart" },
  { kind: "bellwidow", stage: 15, main: true, renderer: "drawBellWidow", mechanic: "bell-toll+safe-lane+drowned-reinforcements" },
  { kind: "stormjaw", stage: 17, main: true, renderer: "drawStormjaw", mechanic: "conductive-lightning+breach+surfaced-heart" },
  { kind: "kilntyrant", stage: 21, main: true, renderer: "drawLateEnemy:kilntyrant", mechanic: "elite-eruption+iron-shell+ashen-attendant" },
  { kind: "cindermaw", stage: 23, main: true, renderer: "drawLateEnemy:cindermaw", mechanic: "sequenced-eruptions+furnace-vent+plate-break" },
  { kind: "rootboundmatriarch", stage: 27, main: true, renderer: "drawLateEnemy:rootboundmatriarch", mechanic: "elite-root-cage+heartroot+vine-attendant" },
  { kind: "verdantcolossus", stage: 29, main: true, renderer: "drawLateEnemy:verdantcolossus", mechanic: "root-cages+heartwood-opening+briar-attendants" },
  { kind: "dunerevenant", stage: 33, main: true, renderer: "drawLateEnemy:dunerevenant", mechanic: "elite-eclipse+mirage-break+jackal-attendant" },
  { kind: "nightmother", stage: 35, main: true, renderer: "drawLateEnemy:nightmother", mechanic: "safe-center-eclipse+false-moon+silence" },
  { kind: "gildedinquisitor", stage: 39, main: true, renderer: "drawLateEnemy:gildedinquisitor", mechanic: "elite-verdict+judgment-reversal+censer-attendant" },
  { kind: "reliquaryseraph", stage: 41, main: true, renderer: "drawLateEnemy:reliquaryseraph", mechanic: "crossing-verdict-beams+silence+seraphic-guard" },
  { kind: "tempestroc", stage: 45, main: true, renderer: "drawLateEnemy:tempestroc", mechanic: "elite-shatter+storm-overlap+roc-attendant" },
  { kind: "skybreaker", stage: 47, main: true, renderer: "drawLateEnemy:skybreaker", mechanic: "cross-shaped-shatter+aftershock+crystal-stun" },
  { kind: "redhuntsman", stage: 51, main: true, renderer: "drawLateEnemy:redhuntsman", mechanic: "elite-marked-hunt+starvation+moonfang-attendant" },
  { kind: "bloodmoonstag", stage: 53, main: true, renderer: "drawLateEnemy:bloodmoonstag", mechanic: "marked-charge+miss-stagger+blood-drain" },
  { kind: "lastpilgrim", stage: 57, main: true, renderer: "drawLateEnemy:lastpilgrim", mechanic: "elite-void+vulnerability+rift-attendant" },
  { kind: "wayeater", stage: 59, main: true, renderer: "drawLateEnemy:wayeater", mechanic: "remembered-omens+four-phases+void-unmaking" },
  // Fully implemented legacy boss, currently absent from campaign waves.
  { kind: "rimeheart", stage: null, main: false, renderer: "drawRimeheartBoss", mechanic: "hail+cracking-ice+long-breath+armor-shatter" },
] as const;
unique(BOSS_AUDIT.map((boss) => boss.kind), "audited boss kinds");
unique(BOSS_AUDIT.map((boss) => boss.renderer), "boss renderer paths");
unique(BOSS_AUDIT.map((boss) => boss.mechanic), "boss mechanic signatures");
unique(BOSS_AUDIT.map((boss) => ENEMIES[boss.kind].habit), "boss combat descriptions");
assert.deepEqual(
  BOSS_AUDIT.map((boss) => boss.kind).sort(),
  Object.keys(BOSS_PHASES).sort(),
  "every phased boss must be explicitly covered by the boss audit",
);
assert.deepEqual(
  [...BOSS_STAGES].sort((a, b) => a - b),
  BOSS_AUDIT.filter((boss) => boss.main).map((boss) => boss.stage as number).sort((a, b) => a - b),
  "main boss stages must match the explicit encounter audit",
);
for (const boss of BOSS_AUDIT) {
  assert.ok(ENEMIES[boss.kind], `boss audit references missing enemy ${boss.kind}`);
  const appearances = STAGES.reduce(
    (total, stage) => total + stage.waves.reduce((waveTotal, wave) => waveTotal + wave.reduce((count, entry) => count + (entry.kind === boss.kind ? entry.count : 0), 0), 0),
    0,
  );
  const staged = appearances > 0;
  assert.equal(staged, boss.stage !== null, `${boss.kind} staged/legacy status drifted from the boss audit`);
  if (boss.stage !== null) {
    assert.equal(appearances, 1, `${boss.kind} must remain a unique one-off campaign encounter`);
    const encounter = STAGES[boss.stage];
    assert.ok(encounter.waves.some((wave) => wave.some((entry) => entry.kind === boss.kind)), `${boss.kind} is missing from audited stage ${boss.stage}`);
    assert.equal(BOSS_STAGES.includes(boss.stage), boss.main, `${boss.kind} main/mini-boss classification drifted`);
  }
}
for (const stageIndex of BOSS_STAGES) {
  const finalWave = STAGES[stageIndex].waves.at(-1)!;
  const bosses = finalWave.filter((entry) => entry.kind in BOSS_PHASES);
  assert.equal(bosses.length, 1, `main boss stage ${stageIndex} must end with exactly one phased boss kind`);
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
assert.equal(DISCIPLINE_IDS.length, 5, "the path system needs five readable combat disciplines");
assert.equal(ELEMENT_IDS.length, 8, "the path system needs eight elemental attunements");
assert.equal(DISCIPLINES.length, DISCIPLINE_IDS.length, "every discipline id needs presentation data");
assert.equal(ELEMENTS.length, ELEMENT_IDS.length, "every element id needs presentation data");
assert.equal(CALLINGS.length, DISCIPLINE_IDS.length * ELEMENT_IDS.length, "every discipline and element must form a playable path");
unique(CALLINGS.map((calling) => calling.name), "path names");
const authoredTechniqueNames: string[] = [];
const authoredTechniqueBlurbs: string[] = [];
for (const discipline of DISCIPLINE_IDS) {
  for (const element of ELEMENT_IDS) {
    const id = pathId(discipline, element);
    const path = CALLINGS.find((item) => item.id === id);
    assert.ok(path, `missing ${discipline} + ${element} path`);
    assert.equal(path.discipline, discipline, `${id} discipline drifted`);
    assert.equal(path.element, element, `${id} element drifted`);
    assert.equal(path.advanced?.length, 2, `${id} needs exactly two level-20 promotions`);
    assert.equal(path.signature.pathSkill, "ultimate", `${id} needs a path ultimate`);
    assert.equal(path.signature.element, element, `${id} ultimate needs its element`);
    assert.ok(path.signature.blurb.length >= 70, `${id} ultimate needs an authored combat description`);
    const techniques = pathAbilities(discipline, element);
    assert.equal(techniques.length, 2, `${id} needs exactly two normal techniques`);
    assert.deepEqual(path.abilityIds, techniques.map((ability) => ability.id), `${id} battle bar must match its registered techniques`);
    for (const technique of techniques) {
      assert.equal(technique.discipline, discipline, `${technique.id} needs its discipline`);
      assert.equal(technique.element, element, `${technique.id} needs its element`);
      assert.ok(!technique.retired, `${technique.id} must remain playable`);
      assert.ok(technique.blurb.length >= 65, `${technique.id} needs an authored mechanical description`);
      authoredTechniqueNames.push(technique.name);
      authoredTechniqueBlurbs.push(technique.blurb);
    }
  }
}
unique(authoredTechniqueNames, "authored Path technique names");
unique(authoredTechniqueBlurbs, "authored Path technique descriptions");
unique(CALLINGS.map((calling) => calling.signature.name), "authored Path ultimate names");

for (const [family, ability] of Object.entries(ARMOR_ACTIVES)) {
  assert.ok(ability.id && ability.name, `${family} armor active is incomplete`);
}

const simulationSave = defaultSave();
const simulationField = { left: 26, right: 1798, top: 170, bottom: 470 };
const firstRun = runBattleSimulation(STAGES[0], structuredClone(simulationSave), simulationField, { seed: 4242, maxSeconds: 240 });
const repeatedRun = runBattleSimulation(STAGES[0], structuredClone(simulationSave), simulationField, { seed: 4242, maxSeconds: 240 });
assert.deepEqual(repeatedRun, firstRun, "seeded battle simulations must be reproducible");
assert.notEqual(firstRun.result, "timeout", "the opening-stage baseline must reach a result");
const isolatedLateRun = runBattleSimulation(STAGES[59], structuredClone(simulationSave), simulationField, { seed: 6060, maxSeconds: 90 });
runBattleSimulation(STAGES[18], structuredClone(simulationSave), simulationField, { seed: 1919, maxSeconds: 90 });
const lateRunAfterOtherBattle = runBattleSimulation(STAGES[59], structuredClone(simulationSave), simulationField, { seed: 6060, maxSeconds: 90 });
assert.deepEqual(lateRunAfterOtherBattle, isolatedLateRun, "seeded simulations must not depend on battles run before them");

// Result cards are not extra combat time: waiting on Victory must never spoil a
// best time/contract or let a projectile change the final death count.
const settledSave = defaultSave();
const settledBattle = new Battle(STAGES[0], settledSave, simulationField, new FxSystem());
const settledHero = settledBattle.heroes()[0];
settledBattle.spawnEnemy("archer", { x: settledHero.x + 2, y: settledHero.y, scale: 1 });
const settledEnemy = settledBattle.livingEnemies()[0];
settledBattle.projectiles.push({
  x: settledHero.x,
  y: settledHero.y,
  target: settledHero,
  aim: { x: -1, y: 0 },
  speed: 999,
  damage: settledHero.stats.maxHp * 2,
  from: settledEnemy,
  kind: "arrow",
  color: "#fff",
  heals: false,
  life: 2,
});
settledBattle.state = "victory";
settledBattle.time = 42.5;
settledBattle.resultDelay = 1;
const settledHp = settledHero.hp;
settledBattle.update(1, settledSave);
assert.equal(settledBattle.time, 42.5, "victory waiting must not inflate encounter time");
assert.equal(settledHero.hp, settledHp, "hostile projectiles must not deal damage after victory");
assert.equal(settledBattle.heroDeaths, 0, "post-victory effects must not spoil a flawless result");

// The boss entrance is a presentation hold, not free damage for the player or
// AUTO. Direct casts must be rejected until the cinematic has finished.
const introAbility = settledHero.abilities[0];
settledBattle.state = "fighting";
settledBattle.cinematic = 2;
const introTimer = introAbility.timer;
assert.equal(
  settledBattle.castAbility(settledHero, introAbility, settledSave, null, null),
  false,
  "hero techniques must not fire during a boss introduction",
);
assert.equal(introAbility.timer, introTimer, "a blocked cinematic cast must not spend its cooldown");

// A burst that crosses two late-boss thresholds must trigger both transition
// reinforcements, while keeping a single upgraded permanent haste effect.
const phaseBattle = new Battle(STAGES[0], defaultSave(), simulationField, new FxSystem());
phaseBattle.spawnEnemy("nightmother", { x: 900, y: 300, scale: 1 });
const phaseBoss = phaseBattle.livingEnemies().find((unit) => unit.enemyKind === "nightmother");
assert.ok(phaseBoss, "late-boss phase regression needs its boss fixture");
phaseBoss.phase = 1;
phaseBoss.hp = phaseBoss.stats.maxHp * 0.1;
const phaseEnemyCount = phaseBattle.livingEnemies().length;
(
  phaseBattle as unknown as {
    updateLateBoss: (boss: typeof phaseBoss, dt: number) => boolean;
  }
).updateLateBoss(phaseBoss, 0);
assert.equal(phaseBoss.phase, 3, "burst damage must advance to the correct late-boss phase");
assert.equal(phaseBattle.livingEnemies().length, phaseEnemyCount + 2, "every crossed boss threshold must summon its attendant");
const phaseHastes = phaseBoss.effects.filter((effect) => effect.kind === "haste" && effect.time >= 900);
assert.equal(phaseHastes.length, 1, "late-boss phase haste must upgrade instead of stacking stale effects");
assert.ok(phaseHastes[0].power >= 1.23, "late-boss phase haste must reach the newest phase strength");

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
saveRoundTrip.inventory = [TRINKETS[0].id, TRINKETS[0].id];
saveRoundTrip.armory = [ALL_GEAR[0].id, ALL_GEAR[0].id];
saveRoundTrip.heroes[0].boons = [BOONS[0].id, BOONS[0].id];
persist(saveRoundTrip);
assert.equal(loadSave().gold, 137, "saved progress must round-trip");
assert.equal(loadSave().formation, "wedge", "formation must persist");
assert.equal(loadSave().pinnedGoal, "Recruit Wren", "pinned goals must persist");
assert.equal(loadSave().journal[0]?.time, 42.5, "Chronicle entries must persist");
assert.equal(loadSave().inventory.length, 2, "duplicate trinkets must remain available for tinkering");
assert.equal(loadSave().armory.length, 2, "duplicate armor copies must remain independently equippable");
assert.equal(loadSave().heroes[0].boons.length, 2, "stacked boon choices must remain stacked");
const masterySave = defaultSave();
const firstPath = pathId("knight", "earth");
masterySave.heroes[0].calling = firstPath;
masterySave.heroes[0].discipline = "knight";
masterySave.heroes[0].element = "earth";
masterySave.heroes[0].equipped = pathAbilities("knight", "earth").map((ability) => ability.id);
for (let i = 0; i < CALLING_MASTERY_LEVELS; i++) grantHeroXp(masterySave, 0, 99999);
assert.ok(masterySave.heroes[0].masteredCallings.includes(firstPath), "ten active path levels must unlock Path Mastery");
assert.ok(masterySave.heroes[0].masteredElements.includes("earth"), "ten active elemental levels must unlock an Elemental Legacy");
masterySave.heroes[0].calling = pathId("mage", "earth");
masterySave.heroes[0].discipline = "mage";
assert.ok(masterySave.heroes[0].masteredCallings.includes(firstPath), "switching paths must preserve prior Path Mastery");
assert.ok(masterySave.heroes[0].masteredElements.includes("earth"), "switching disciplines must preserve the mastered element");
storage.set(slotKey(), "{broken json");
assert.equal(loadSave().unlockedStage, 0, "corrupt saves must recover to a new campaign");
assert.equal(storage.get(rejectedSaveKey()), "{broken json", "unreadable save text must be retained for manual recovery");

const oldCallingSave = defaultSave();
oldCallingSave.heroes[0].calling = "vanguard";
oldCallingSave.heroes[0].advCalling = "bulwarkSaint";
oldCallingSave.heroes[0].callingLevels = { vanguard: CALLING_MASTERY_LEVELS };
oldCallingSave.heroes[0].masteredCallings = ["vanguard"];
oldCallingSave.heroes[0].advancedCallings = { vanguard: "bulwarkSaint" };
storage.set(slotKey(), JSON.stringify(oldCallingSave));
const migratedCalling = loadSave();
assert.equal(migratedCalling.heroes[0].calling, pathId("knight", "earth"), "Vanguard saves must migrate to the Earth Knight path");
assert.equal(migratedCalling.heroes[0].discipline, "knight", "legacy callings must recover a discipline");
assert.equal(migratedCalling.heroes[0].element, "earth", "legacy callings must recover an attunement");
assert.ok(migratedCalling.heroes[0].masteredElements.includes("earth"), "legacy mastery must become an Elemental Legacy");
assert.equal(migratedCalling.heroes[0].advCalling, `${pathId("knight", "earth")}-ascendant`, "legacy promotions must retain their branch intent");
assert.deepEqual(
  migratedCalling.heroes[0].equipped,
  pathAbilities("knight", "earth").map((ability) => ability.id),
  "legacy loadouts must be replaced by the migrated path techniques",
);

const legacy = defaultSave() as SaveData & { reducedMotion?: boolean; keybinds?: Record<string, string> };
legacy.heroes = legacy.heroes.slice(0, 4);
legacy.gold = 777;
legacy.unlockedStage = 9;
legacy.heroes[0].equipped = ["cleave", "bellow", "mend"];
const legacyHero = legacy.heroes[0] as Partial<HeroSave> & { armorTier?: number; armorVariant?: string | null };
legacyHero.armorTier = 2;
delete legacyHero.armor;
delete legacyHero.helm;
delete legacyHero.boots;
delete legacyHero.callingLevels;
delete legacyHero.masteredCallings;
delete legacyHero.advancedCallings;
delete legacyHero.discipline;
delete legacyHero.element;
delete legacyHero.elementLevels;
delete legacyHero.masteredElements;
legacy.keybinds = { hero1: "1", hero2: "2", hero3: "3", hero4: "4", ability1: "q", ability2: "w", ability3: "e", ability4: "r", ability5: "f" };
delete legacy.reducedMotion;
delete legacy.keybinds;
delete (legacy as Partial<SaveData>).unlockedSpells;
delete (legacy as Partial<SaveData>).inventory;
delete (legacy as Partial<SaveData>).armory;
delete (legacy as Partial<SaveData>).arenaRecords;
delete (legacy as Partial<SaveData>).contractRecords;
delete (legacy as Partial<SaveData>).arenaMarks;
delete (legacy as Partial<SaveData>).contractRenown;
delete (legacy as Partial<SaveData>).challengeMilestones;
delete (legacy as Partial<SaveData>).pendingBoons;
delete (legacy as Partial<SaveData>).formation;
delete (legacy as Partial<SaveData>).journal;
delete (legacy as Partial<SaveData>).pinnedGoal;
storage.set(slotKey(), JSON.stringify(legacy));
const migrated = loadSave();
assert.equal(migrated.heroes.length, HEROES.length, "older rosters must gain new hero records");
assert.equal(migrated.gold, 777, "legacy migration must preserve campaign wealth");
assert.equal(migrated.unlockedStage, 9, "legacy migration must preserve campaign progress");
assert.equal(migrated.reducedMotion, false, "older saves must gain comfort defaults");
assert.ok(migrated.keybinds.ability1, "older saves must gain default keybinds");
assert.deepEqual(migrated.heroes[0].equipped, ["cleave", "bellow"], "older three-spell loadouts must trim safely to two choices");
assert.ok(migrated.unlockedSpells.includes("mend"), "pre-shop saves must retain spells already equipped before loadout trimming");
assert.equal(migrated.heroes[0].armor, "footmanMail", "legacy armor tiers must become named gear");
assert.ok(migrated.armory.includes("footmanMail"), "migrated armor must also be owned in the armory");
assert.equal(migrated.heroes[0].helm, null, "pre-slot saves must gain an empty helm slot");
assert.deepEqual(migrated.heroes[0].callingLevels, {}, "pre-mastery heroes must gain calling progress");
assert.deepEqual(migrated.heroes[0].masteredCallings, [], "pre-mastery heroes must gain an empty mastery list");
assert.deepEqual(migrated.heroes[0].advancedCallings, {}, "pre-promotion heroes must gain promotion memory");
assert.equal(migrated.heroes[0].discipline, null, "pre-path heroes must remain free to choose a discipline");
assert.equal(migrated.heroes[0].element, null, "pre-path heroes must remain free to choose an attunement");
assert.deepEqual(migrated.heroes[0].elementLevels, {}, "pre-path heroes must gain elemental progress");
assert.deepEqual(migrated.heroes[0].masteredElements, [], "pre-path heroes must gain an empty Elemental Legacy list");
assert.equal(migrated.arenaMarks, 0, "pre-arena saves must gain zero marks");
assert.equal(migrated.contractRenown, 0, "pre-contract saves must gain zero renown");
assert.deepEqual(migrated.challengeMilestones, [], "pre-challenge saves must gain an empty milestone list");
assert.equal(migrated.keybinds.ability3, "r", "the former default ultimate key must migrate to slot three");
assert.equal(migrated.formation, "line", "older saves must gain the default formation");
assert.deepEqual(migrated.journal, [], "older saves must gain an empty Chronicle");

const stormbreakVeteran = defaultSave();
stormbreakVeteran.unlockedStage = 17;
stormbreakVeteran.stageStats[17] = { clears: 1, bestTime: 73.2 };
storage.set(slotKey(), JSON.stringify(stormbreakVeteran));
assert.equal(loadSave().unlockedStage, 18, "a proven clear of the former final stage must unlock the Cinderwild");
stormbreakVeteran.stageStats = {};
storage.set(slotKey(), JSON.stringify(stormbreakVeteran));
assert.equal(loadSave().unlockedStage, 17, "an uncleared Stormjaw stage must remain the current destination");

const damaged = defaultSave();
damaged.gold = 432;
damaged.unlockedStage = 6;
(damaged.unlockedSpells as string[]).push("invented-spell");
damaged.inventory.push("invented-trinket");
damaged.armory.push("invented-armor");
damaged.heroes[0].equipped = ["invented-spell", "cleave"];
damaged.heroes[0].trinket = "invented-trinket";
damaged.heroes[0].helm = "invented-armor";
(damaged.heroes as unknown[])[1] = null;
(damaged.heroes[0].attrs as unknown as Record<string, unknown>).int = "not a number";
(damaged as unknown as Record<string, unknown>).journal = [{ stage: 2, party: "not an array" }];
damaged.pinnedGoal = "<img src=x onerror=alert(1)>";
storage.set(slotKey(), JSON.stringify(damaged));
const repaired = loadSave();
assert.equal(repaired.gold, 432, "one damaged hero must not erase the wider campaign");
assert.equal(repaired.unlockedStage, 6, "repairable field damage must preserve stage progress");
assert.equal(repaired.heroes[0].attrs.int, HEROES[0].baseAttrs.int, "invalid attributes must fall back per field");
assert.deepEqual(repaired.heroes[1].attrs, HEROES[1].baseAttrs, "an invalid hero record must be rebuilt in place");
assert.deepEqual(repaired.heroes[0].equipped, ["cleave"], "unknown imported abilities must not reach battle construction");
assert.ok(!repaired.unlockedSpells.includes("invented-spell"), "unknown imported spell ids must be discarded");
assert.ok(!repaired.inventory.includes("invented-trinket"), "unknown imported trinkets must be discarded before menus render");
assert.ok(!repaired.armory.includes("invented-armor"), "unknown imported gear must be discarded before menus render");
assert.equal(repaired.heroes[0].trinket, null, "unknown equipped trinkets must be unequipped safely");
assert.equal(repaired.heroes[0].helm, null, "unknown equipped armor must be unequipped safely");
assert.deepEqual(repaired.journal[0]?.party, [], "malformed Chronicle parties must be made safe to render");
assert.equal(repaired.pinnedGoal, null, "imported goal text must not permit markup");

storage.clear();
const recoveryA = defaultSave();
recoveryA.gold = 111;
persist(recoveryA);
const recoveryB = defaultSave();
recoveryB.gold = 222;
persist(recoveryB);
assert.equal(JSON.parse(storage.get(recoveryKey())!).gold, 111, "persistence must retain the previous valid snapshot");
storage.set(slotKey(), "{broken import");
const recovered = loadSave();
assert.equal(recovered.gold, 111, "a corrupt primary save must restore its last-known-good snapshot");
assert.equal(storage.get(rejectedSaveKey()), "{broken import", "the rejected primary must remain available after recovery");

console.log(
  `Validated ${STAGES.length} stages, ${enemyKinds.size} enemies, ${HEROES.length} heroes, ` +
    `${CALLINGS.length} elemental paths, ${ABILITIES.filter((ability) => !ability.retired).length} active techniques, ` +
    `${ALL_GEAR.length + TRINKETS.length} items, and a deterministic opening battle.`,
);
