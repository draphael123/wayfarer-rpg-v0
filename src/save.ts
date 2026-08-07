import {
  abilityById,
  advCallingById,
  armorById,
  ATTR_KEYS,
  callingById,
  CALLING_MASTERY_LEVELS,
  disciplineById,
  elementById,
  HERO_STARTER_ABILITIES,
  HEROES,
  LEGACY_ADVANCED_BRANCH,
  LEGACY_CALLING_PATHS,
  MAX_EQUIPPED,
  MAX_LEVEL,
  pathId,
  POINTS_PER_LEVEL,
  rollBoonPair,
  resolvedPathAbilities,
  STAGES,
  trinketById,
  xpForLevel,
} from "./data";
import type { Attributes, DisciplineId, ElementId, HeroSave, SaveData } from "./types";

const KEY = "wayband-save-v1";
const SLOT_POINTER = "wayband-active-slot";

/** Six fully independent bands. Slot 0 keeps the legacy key so existing saves just work. */
export const SLOT_NAMES = [
  "Band of the Oak",
  "Band of the River",
  "Band of the Ash",
  "Band of the Lantern",
  "Band of the Thorn",
  "Band of the Star",
];

export function activeSlot(): number {
  try {
    const n = Number(localStorage.getItem(SLOT_POINTER) ?? "0");
    return Number.isInteger(n) && n >= 0 && n < SLOT_NAMES.length ? n : 0;
  } catch {
    return 0;
  }
}

export function setActiveSlot(n: number): void {
  try {
    localStorage.setItem(SLOT_POINTER, String(n));
  } catch {
    // storage unavailable — the game stays on the in-memory save
  }
}

export function slotKey(n: number = activeSlot()): string {
  return n === 0 ? KEY : `${KEY}-s${n + 1}`;
}

export interface SlotPeek {
  empty: boolean;
  level: number;
  stage: number;
  gold: number;
  victories: number;
  recruits: number;
}

/** A cheap look inside a slot for the picker — no migration, no validation. */
export function peekSlot(n: number): SlotPeek {
  const none: SlotPeek = { empty: true, level: 1, stage: 0, gold: 0, victories: 0, recruits: 2 };
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return none;
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (!p || !Array.isArray(p.heroes)) return none;
    return {
      empty: false,
      level: p.level ?? 1,
      stage: p.unlockedStage ?? 0,
      gold: p.gold ?? 0,
      victories: p.lifetime?.victories ?? 0,
      recruits: p.heroes.filter((h) => h?.recruited).length,
    };
  } catch {
    return none;
  }
}

/** Spells the band owns from the start — enough for the founding duo to function. */
const STARTING_SPELLS = [...new Set(HERO_STARTER_ABILITIES.flat())];

function defaultHero(index: number): HeroSave {
  const base = HEROES[index].baseAttrs;
  const attrs: Attributes = { ...base };
  const founder = index === 0 || index === 3;
  const equipped = (HERO_STARTER_ABILITIES[index] ?? [])
    .map((id) => abilityById(id))
    .filter((ability): ability is NonNullable<typeof ability> => !!ability)
    .slice(0, MAX_EQUIPPED)
    .map((ability) => ability.id);
  return { attrs, level: 1, xp: 0, boons: [], equipped, recruited: founder, active: founder, weaponTier: 0, armor: null, helm: null, boots: null, talents: {}, trinket: null, calling: null, advCalling: null, discipline: null, element: null, callingLevels: {}, masteredCallings: [], advancedCallings: {}, elementLevels: {}, masteredElements: [] };
}

/** Out of the box: 1-4 picks a hero, Q/W cast chosen abilities, R casts the ultimate. */
export const DEFAULT_KEYBINDS: Record<string, string> = {
  hero1: "1",
  hero2: "2",
  hero3: "3",
  hero4: "4",
  ability1: "q",
  ability2: "w",
  ability3: "r",
  ability4: "f", // reserved for a future legendary armor exception
};

function emptyLifetime() {
  return { battles: 0, victories: 0, kills: 0, casts: 0, gold: 0, deaths: 0, fuses: 0, flawless: 0, brutalClears: 0 };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlockedStage: 0,
    level: 1,
    xp: 0,
    unspent: HEROES.map(() => 0),
    heroes: HEROES.map((_, i) => defaultHero(i)),
    sound: true,
    music: true,
    soundVol: 1,
    musicVol: 1,
    speed: 0.5,
    aimMode: "slow",
    telegraphAssist: "standard",
    bestiary: {},
    gold: 0,
    unlockedSpells: [...STARTING_SPELLS],
    inventory: [],
    armory: [],
    difficulty: 1,
    seenIntro: false,
    stageStats: {},
    arenaRecords: {},
    contractRecords: {},
    arenaMarks: 0,
    contractRenown: 0,
    challengeMilestones: [],
    lifetime: emptyLifetime(),
    presets: [null, null],
    reducedMotion: false,
    screenShake: true,
    damageNumbers: true,
    pauseOnBlur: true,
    colorSafe: false,
    bigText: false,
    enemyHealthBars: true,
    autoBattle: false,
    tutorialHints: true,
    completedTutorials: [],
    keybinds: { ...DEFAULT_KEYBINDS },
    pinnedGoal: null,
    formation: "line",
    journal: [],
    forge: {},
    pendingBoons: [],
  };
}

export const SPEED_OPTIONS = [0.35, 0.5, 0.75, 1];

export function nextSpeed(current: number): number {
  const at = SPEED_OPTIONS.findIndex((s) => Math.abs(s - current) < 0.01);
  return SPEED_OPTIONS[(at + 1) % SPEED_OPTIONS.length];
}

export function speedLabel(speed: number): string {
  const shown = speed / 0.5; // the classic pace reads as ×1
  return `×${shown % 1 === 0 ? shown : shown.toFixed(1)}`;
}

export function recoveryKey(n: number = activeSlot()): string {
  return `${slotKey(n)}-recovery`;
}

export function rejectedSaveKey(n: number = activeSlot()): string {
  return `${slotKey(n)}-rejected`;
}

function structurallyValidSave(raw: string): boolean {
  try {
    const value = JSON.parse(raw) as Partial<SaveData> | null;
    return !!value && value.version === 1 && Array.isArray(value.heroes) && value.heroes.length >= 4 && value.heroes.length <= HEROES.length;
  } catch {
    return false;
  }
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(finiteNumber(value, fallback, min, max));
}

function cleanStrings(value: unknown, limit = 256, unique = true): string[] {
  if (!Array.isArray(value)) return [];
  const clean = value.slice(0, limit * 4).filter((item): item is string => typeof item === "string" && item.length <= 64);
  return (unique ? [...new Set(clean)] : clean).slice(0, limit);
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanNumberRecord(value: unknown, max = 1_000_000): Record<string, number> {
  const source = plainRecord(value);
  if (!source) return {};
  const clean: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source).slice(0, 512)) {
    if (key.length <= 64 && typeof raw === "number" && Number.isFinite(raw)) clean[key] = Math.floor(Math.min(max, Math.max(0, raw)));
  }
  return clean;
}

function validDiscipline(value: unknown): DisciplineId | null {
  return typeof value === "string" ? disciplineById(value)?.id ?? null : null;
}

function validElement(value: unknown): ElementId | null {
  return typeof value === "string" ? elementById(value)?.id ?? null : null;
}

/** Returns a current path id for either a current or pre-path calling id. */
function migrateCallingId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const current = callingById(value);
  if (current) return current.id;
  const legacy = LEGACY_CALLING_PATHS[value];
  return legacy ? pathId(legacy.discipline, legacy.element) : null;
}

function migrateAdvancedId(path: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const current = advCallingById(value);
  if (current?.parent.id === path) return value;
  const branch = LEGACY_ADVANCED_BRANCH[value];
  return branch ? `${path}-${branch}` : null;
}

function mergePathLevels(value: unknown): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const [rawId, progress] of Object.entries(cleanNumberRecord(value, MAX_LEVEL))) {
    const id = migrateCallingId(rawId);
    if (id) levels[id] = Math.max(levels[id] ?? 0, progress);
  }
  return levels;
}

function cleanElementLevels(value: unknown): Partial<Record<ElementId, number>> {
  const levels: Partial<Record<ElementId, number>> = {};
  for (const [rawId, progress] of Object.entries(cleanNumberRecord(value, MAX_LEVEL))) {
    const element = validElement(rawId);
    if (element) levels[element] = Math.max(levels[element] ?? 0, progress);
  }
  return levels;
}

function cleanBattleRecords(value: unknown): Record<string, { clears: number; bestTime: number }> {
  const source = plainRecord(value);
  if (!source) return {};
  const clean: Record<string, { clears: number; bestTime: number }> = {};
  for (const [key, raw] of Object.entries(source).slice(0, 256)) {
    const entry = plainRecord(raw);
    if (!entry || key.length > 64) continue;
    clean[key] = {
      clears: finiteInteger(entry.clears, 0, 0, 1_000_000),
      bestTime: finiteNumber(entry.bestTime, 0, 0, 100_000),
    };
  }
  return clean;
}

function recoverSave(raw: string | null, key: string): SaveData {
  if (raw) {
    try {
      localStorage.setItem(rejectedSaveKey(), raw);
    } catch {
      // Keep trying the last-known-good snapshot when storage is read-only.
    }
  }
  try {
    const backup = localStorage.getItem(recoveryKey());
    if (backup && backup !== raw && structurallyValidSave(backup)) {
      localStorage.setItem(key, backup);
      return loadSave();
    }
  } catch {
    // A default in-memory band is still safer than throwing during startup.
  }
  return defaultSave();
}

export function loadSave(): SaveData {
  let raw: string | null = null;
  const key = slotKey();
  try {
    raw = localStorage.getItem(key);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.heroes) || parsed.heroes.length < 4 || parsed.heroes.length > HEROES.length) {
      return recoverSave(raw, key);
    }
    parsed.unlockedStage = finiteInteger(parsed.unlockedStage, 0, 0, Math.max(0, STAGES.length - 1));
    parsed.level = finiteInteger(parsed.level, 1, 1, MAX_LEVEL);
    parsed.xp = finiteInteger(parsed.xp, 0, 0, 1_000_000_000);
    parsed.gold = finiteInteger(parsed.gold, parsed.unlockedStage * 60, 0, 1_000_000_000);
    // Initialize account-wide collections before per-hero armor migration uses
    // them. Older saves predate both fields, but already earned equipped spells.
    if (!Array.isArray(parsed.unlockedSpells)) {
      const owned = new Set(STARTING_SPELLS);
      for (const hero of parsed.heroes) {
        if (!hero || !Array.isArray(hero.equipped)) continue;
        for (const id of hero.equipped) if (typeof id === "string") owned.add(id);
      }
      parsed.unlockedSpells = [...owned];
    }
    parsed.unlockedSpells = cleanStrings(parsed.unlockedSpells).filter((id) => !!abilityById(id));
    if (!parsed.unlockedSpells.includes("bellow")) parsed.unlockedSpells.push("bellow");
    parsed.inventory = cleanStrings(parsed.inventory, 512, false).filter((id) => !!trinketById(id));
    parsed.armory = cleanStrings(parsed.armory, 512, false).filter((id) => !!armorById(id));
    // roster growth: older saves gain the late-arrival heroes, benched, with
    // catch-up attribute points for the levels the band already earned
    if (!Array.isArray(parsed.unspent)) parsed.unspent = parsed.heroes.map(() => 0);
    while (parsed.heroes.length < HEROES.length) {
      parsed.heroes.push(defaultHero(parsed.heroes.length));
    }
    while (parsed.unspent.length < HEROES.length) {
      parsed.unspent.push(Math.max(0, ((parsed.level ?? 1) - 1) * POINTS_PER_LEVEL));
    }
    parsed.unspent = parsed.unspent.slice(0, HEROES.length).map((points) => finiteInteger(points, 0, 0, 1_000_000));
    parsed.heroes.forEach((rawHero, i) => {
      const hero = rawHero && typeof rawHero === "object" ? rawHero : defaultHero(i);
      if (hero !== rawHero) parsed.heroes[i] = hero;
      if (!plainRecord(hero.attrs)) hero.attrs = { ...HEROES[i].baseAttrs };
      for (const key of ATTR_KEYS) {
        const value = hero.attrs[key];
        if (typeof value !== "number" || !Number.isFinite(value)) hero.attrs[key] = HEROES[i].baseAttrs[key];
        else hero.attrs[key] = Math.max(0, Math.min(999, value));
      }
      hero.equipped = Array.isArray(hero.equipped)
        ? [...new Set(hero.equipped.filter((id): id is string => typeof id === "string" && !!abilityById(id)))].slice(0, MAX_EQUIPPED)
        : [];
      // migrate pre-shop saves: roster used to grow with cleared stages
      if (typeof hero.recruited !== "boolean") {
        hero.recruited = i === 0 || i === 3 || (i === 1 && parsed.unlockedStage >= 1) || (i === 2 && parsed.unlockedStage >= 2);
      }
      if (typeof hero.active !== "boolean") hero.active = hero.recruited;
      if (!hero.recruited) hero.active = false;
      hero.weaponTier = finiteInteger(hero.weaponTier, 0, 0, 3);
      // armor became named pieces: old tiers map to equivalents, granted to the armory
      if (hero.armor === undefined) {
        const legacy = hero as unknown as { armorTier?: number; armorVariant?: string | null };
        const tier = finiteInteger(legacy.armorTier, 0, 0, 3);
        hero.armor =
          tier >= 3
            ? legacy.armorVariant === "skirmisher"
              ? "skirmisherHarness"
              : legacy.armorVariant === "runeweave"
                ? "runeweaveVestment"
                : "juggernautPlate"
            : tier === 2
              ? "footmanMail"
              : tier === 1
                ? "scoutJerkin"
                : null;
        if (hero.armor) parsed.armory.push(hero.armor);
      }
      // Original body pieces predate explicit slots; an omitted slot means body.
      if (!armorById(hero.armor) || (armorById(hero.armor)?.slot ?? "body") !== "body") hero.armor = null;
      if (!armorById(hero.helm) || armorById(hero.helm)?.slot !== "helm") hero.helm = null;
      if (!armorById(hero.boots) || armorById(hero.boots)?.slot !== "boots") hero.boots = null;
      // heroes level individually now — veterans inherit the old band level
      hero.level = finiteInteger(hero.level, parsed.level, 1, MAX_LEVEL);
      hero.xp = finiteInteger(hero.xp, 0, 0, 1_000_000_000);
      hero.boons = cleanStrings(hero.boons, MAX_LEVEL, false);
      hero.talents = cleanNumberRecord(hero.talents, 10);
      if (!trinketById(hero.trinket)) hero.trinket = null;
      const rawCalling: unknown = hero.calling;
      const rawAdvanced: unknown = hero.advCalling;
      const storedDiscipline = validDiscipline(hero.discipline);
      const storedElement = validElement(hero.element);
      const inferredId = storedDiscipline && storedElement ? pathId(storedDiscipline, storedElement) : null;
      const migratedId = migrateCallingId(rawCalling) ?? (inferredId && callingById(inferredId) ? inferredId : null);
      const path = callingById(migratedId);
      hero.calling = path?.id ?? null;
      hero.discipline = path?.discipline ?? null;
      hero.element = path?.element ?? null;

      hero.callingLevels = mergePathLevels(hero.callingLevels);
      hero.masteredCallings = [...new Set(cleanStrings(hero.masteredCallings, 64).map(migrateCallingId).filter((id): id is string => !!id))];
      hero.elementLevels = cleanElementLevels(hero.elementLevels);
      for (const [id, progress] of Object.entries(hero.callingLevels)) {
        const element = callingById(id)?.element;
        if (element) hero.elementLevels[element] = Math.max(hero.elementLevels[element] ?? 0, progress);
        if (progress >= CALLING_MASTERY_LEVELS && !hero.masteredCallings.includes(id)) hero.masteredCallings.push(id);
      }
      const masteredElements = new Set<ElementId>(cleanStrings(hero.masteredElements, 16).map(validElement).filter((id): id is ElementId => !!id));
      for (const id of hero.masteredCallings) {
        const element = callingById(id)?.element;
        if (element) masteredElements.add(element);
      }
      for (const element of Object.keys(hero.elementLevels) as ElementId[]) {
        if ((hero.elementLevels[element] ?? 0) >= CALLING_MASTERY_LEVELS) masteredElements.add(element);
      }
      hero.masteredElements = [...masteredElements];

      const oldChoices = plainRecord(hero.advancedCallings);
      const migratedChoices: Record<string, string> = {};
      if (oldChoices) {
        for (const [oldPath, oldChoice] of Object.entries(oldChoices).slice(0, 64)) {
          const nextPath = migrateCallingId(oldPath);
          if (!nextPath) continue;
          const nextChoice = migrateAdvancedId(nextPath, oldChoice);
          if (nextChoice) migratedChoices[nextPath] = nextChoice;
        }
      }
      if (hero.calling) {
        const directChoice = migrateAdvancedId(hero.calling, rawAdvanced);
        if (directChoice) migratedChoices[hero.calling] = directChoice;
        hero.advCalling = migratedChoices[hero.calling] ?? null;
        const required = resolvedPathAbilities(hero.discipline!, hero.element!, hero.equipped);
        hero.equipped = required.map((ability) => ability.id);
        for (const ability of required) if (!parsed.unlockedSpells.includes(ability.id)) parsed.unlockedSpells.push(ability.id);
      } else {
        hero.advCalling = null;
        if (!hero.equipped.length) {
          hero.equipped = (HERO_STARTER_ABILITIES[i] ?? []).filter((id) => !!abilityById(id)).slice(0, MAX_EQUIPPED);
        }
        for (const id of hero.equipped) if (!parsed.unlockedSpells.includes(id)) parsed.unlockedSpells.push(id);
      }
      hero.advancedCallings = migratedChoices;
      // pre-variant saves at plate tier default to the classic juggernaut look
    });
    parsed.armory = cleanStrings(parsed.armory, 512, false);
    let activeHeroes = 0;
    for (const hero of parsed.heroes) if (hero.active && ++activeHeroes > 4) hero.active = false;
    if (activeHeroes === 0) {
      const first = parsed.heroes.find((hero) => hero.recruited);
      if (first) first.active = true;
    }
    parsed.speed = finiteNumber(parsed.speed, 0.5, 0.25, 1);
    if (!( ["freeze", "slow", "realtime"] as const).includes(parsed.aimMode)) parsed.aimMode = "slow";
    if (!( ["standard", "long", "extra"] as const).includes(parsed.telegraphAssist)) parsed.telegraphAssist = "standard";
    parsed.bestiary = cleanNumberRecord(parsed.bestiary) as SaveData["bestiary"];
    parsed.forge = cleanNumberRecord(parsed.forge, 3);
    if (!Array.isArray(parsed.pendingBoons)) parsed.pendingBoons = [];
    parsed.pendingBoons = parsed.pendingBoons.slice(0, 128).filter((entry) =>
      !!entry && Number.isInteger(entry.hero) && entry.hero >= 0 && entry.hero < HEROES.length && typeof entry.a === "string" && typeof entry.b === "string",
    );
    parsed.difficulty = finiteInteger(parsed.difficulty, 1, 0, 3);
    if (typeof parsed.seenIntro !== "boolean") parsed.seenIntro = parsed.unlockedStage > 0;
    parsed.soundVol = finiteNumber(parsed.soundVol, 1, 0, 1);
    parsed.musicVol = finiteNumber(parsed.musicVol, 1, 0, 1);
    parsed.stageStats = cleanBattleRecords(parsed.stageStats) as SaveData["stageStats"];
    // In the original 18-stage campaign Stormjaw was the final node, so a
    // victory could be recorded without advancing `unlockedStage` beyond 17.
    // Carry those proven clears onto the first new stretch of the Long Road.
    if (STAGES.length > 18 && parsed.unlockedStage === 17 && (parsed.stageStats[17]?.clears ?? 0) > 0) {
      parsed.unlockedStage = 18;
    }
    parsed.arenaRecords = cleanBattleRecords(parsed.arenaRecords) as SaveData["arenaRecords"];
    parsed.contractRecords = cleanBattleRecords(parsed.contractRecords) as SaveData["contractRecords"];
    parsed.arenaMarks = finiteInteger(parsed.arenaMarks, 0, 0, 1_000_000);
    parsed.contractRenown = finiteInteger(parsed.contractRenown, 0, 0, 1_000_000);
    parsed.challengeMilestones = cleanStrings(parsed.challengeMilestones, 128);
    if (!plainRecord(parsed.lifetime)) {
      // veterans keep credit for what the save already proves
      parsed.lifetime = emptyLifetime();
      parsed.lifetime.kills = Object.values(parsed.bestiary).reduce((a: number, b) => a + (b ?? 0), 0);
      parsed.lifetime.victories = Object.values(parsed.stageStats).reduce((a: number, r) => a + (r?.clears ?? 0), 0);
      parsed.lifetime.battles = parsed.lifetime.victories;
    }
    for (const key of Object.keys(emptyLifetime()) as (keyof typeof parsed.lifetime)[]) {
      parsed.lifetime[key] = finiteInteger(parsed.lifetime[key], 0, 0, 1_000_000_000);
    }
    const rawPresets: unknown[] = Array.isArray(parsed.presets) ? parsed.presets : [];
    parsed.presets = [0, 1].map((index) => {
      const preset = plainRecord(rawPresets[index]);
      if (!preset || !Array.isArray(preset.loadout)) return null;
      return {
        name: typeof preset.name === "string" && preset.name.length <= 64 ? preset.name : `Preset ${index + 1}`,
        loadout: preset.loadout.slice(0, HEROES.length).map((raw) => {
          const item = plainRecord(raw);
          return {
            equipped: cleanStrings(item?.equipped, MAX_EQUIPPED),
            trinket: typeof item?.trinket === "string" && trinketById(item.trinket) ? item.trinket : null,
            active: item?.active === true,
          };
        }),
      };
    });
    if (typeof parsed.sound !== "boolean") parsed.sound = true;
    if (typeof parsed.music !== "boolean") parsed.music = true;
    if (typeof parsed.reducedMotion !== "boolean") parsed.reducedMotion = false;
    if (typeof parsed.screenShake !== "boolean") parsed.screenShake = true;
    if (typeof parsed.damageNumbers !== "boolean") parsed.damageNumbers = true;
    if (typeof parsed.pauseOnBlur !== "boolean") parsed.pauseOnBlur = true;
    if (typeof parsed.colorSafe !== "boolean") parsed.colorSafe = false;
    if (typeof parsed.bigText !== "boolean") parsed.bigText = false;
    if (typeof parsed.enemyHealthBars !== "boolean") parsed.enemyHealthBars = true;
    if (typeof parsed.autoBattle !== "boolean") parsed.autoBattle = false;
    if (typeof parsed.tutorialHints !== "boolean") parsed.tutorialHints = true;
    parsed.completedTutorials = cleanStrings(parsed.completedTutorials, 32);
    if (!plainRecord(parsed.keybinds)) parsed.keybinds = { ...DEFAULT_KEYBINDS };
    // Migrate the exact former default (E = third spell, R = ultimate).
    // Custom key layouts remain untouched.
    if (parsed.keybinds.ability3 === "e" && parsed.keybinds.ability4 === "r" && parsed.keybinds.ability5 === "f") {
      parsed.keybinds.ability3 = "r";
      parsed.keybinds.ability4 = "f";
    }
    for (const k of Object.keys(DEFAULT_KEYBINDS)) {
      if (typeof parsed.keybinds[k] !== "string" || parsed.keybinds[k].length > 24 || /[<>]/.test(parsed.keybinds[k])) parsed.keybinds[k] = DEFAULT_KEYBINDS[k];
    }
    if (typeof parsed.pinnedGoal !== "string" || parsed.pinnedGoal.length > 160 || /[<>]/.test(parsed.pinnedGoal)) parsed.pinnedGoal = null;
    if (!(["line", "wedge", "guard"] as const).includes(parsed.formation)) parsed.formation = "line";
    const rawJournal: unknown[] = Array.isArray(parsed.journal) ? parsed.journal : [];
    parsed.journal = rawJournal.slice(0, 24).flatMap((raw) => {
      const entry = plainRecord(raw);
      if (!entry) return [];
      return [{
        stage: finiteInteger(entry.stage, 0, 0, Math.max(0, STAGES.length - 1)),
        time: finiteNumber(entry.time, 0, 0, 100_000),
        difficulty: finiteInteger(entry.difficulty, 1, 0, 3),
        deaths: finiteInteger(entry.deaths, 0, 0, HEROES.length),
        party: Array.isArray(entry.party)
          ? entry.party.map((hero) => finiteInteger(hero, -1, -1, HEROES.length - 1)).filter((hero) => hero >= 0).slice(0, 4)
          : [],
        at: finiteInteger(entry.at, 0, 0, Number.MAX_SAFE_INTEGER),
      }];
    });
    return parsed;
  } catch {
    return recoverSave(raw, key);
  }
}

export function persist(save: SaveData): void {
  try {
    const key = slotKey();
    const next = JSON.stringify(save);
    const current = localStorage.getItem(key);
    if (current && current !== next && structurallyValidSave(current)) localStorage.setItem(recoveryKey(), current);
    localStorage.setItem(key, next);
  } catch {
    // Private browsing or storage quota — play on without persistence.
  }
}

/** Grants personal XP to one hero, applying level-ups: each level yields
 *  attribute points AND a boon pair awaiting the player's pick. */
export function grantHeroXp(save: SaveData, index: number, amount: number): number {
  const hero = save.heroes[index];
  if (!hero || hero.level >= MAX_LEVEL) {
    if (hero) hero.xp = 0;
    return 0;
  }
  hero.xp += Math.round(amount);
  let gained = 0;
  while (hero.level < MAX_LEVEL && hero.xp >= xpForLevel(hero.level)) {
    hero.xp -= xpForLevel(hero.level);
    hero.level += 1;
    gained += 1;
    const path = callingById(hero.calling);
    if (path) {
      hero.callingLevels ??= {};
      hero.elementLevels ??= {};
      hero.masteredCallings ??= [];
      hero.masteredElements ??= [];
      hero.callingLevels[path.id] = (hero.callingLevels[path.id] ?? 0) + 1;
      hero.elementLevels[path.element] = (hero.elementLevels[path.element] ?? 0) + 1;
      if (hero.callingLevels[path.id] >= CALLING_MASTERY_LEVELS && !hero.masteredCallings.includes(path.id)) {
        hero.masteredCallings.push(path.id);
      }
      if (hero.elementLevels[path.element]! >= CALLING_MASTERY_LEVELS && !hero.masteredElements.includes(path.element)) {
        hero.masteredElements.push(path.element);
      }
    }
    save.unspent[index] += POINTS_PER_LEVEL;
    save.pendingBoons.push({ hero: index, ...rollBoonPair() });
  }
  // legacy mirror: the band wears its most seasoned member's number
  save.level = Math.max(save.level, hero.level);
  return gained;
}

/** Resets a hero's attributes to base and refunds every spent point. */
export function respecHero(save: SaveData, index: number): void {
  const base = HEROES[index].baseAttrs;
  const current = save.heroes[index].attrs;
  let spent = 0;
  for (const key of ATTR_KEYS) {
    spent += current[key] - base[key];
  }
  save.unspent[index] += spent;
  save.heroes[index].attrs = { ...base };
  const hero = save.heroes[index];
  const path = callingById(hero.calling);
  if (path) {
    hero.equipped = resolvedPathAbilities(path.discipline, path.element, hero.equipped).map((ability) => ability.id);
  } else {
    hero.equipped = hero.equipped.filter((id) => {
      const ability = abilityById(id);
      return !!ability && hero.attrs[ability.gate.attr] >= ability.gate.value;
    }).slice(0, MAX_EQUIPPED);
  }
  persist(save);
}
