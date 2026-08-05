import { ATTR_KEYS, HEROES, MAX_EQUIPPED, MAX_LEVEL, POINTS_PER_LEVEL, unlockedAbilities, xpForLevel } from "./data";
import type { Attributes, HeroSave, SaveData } from "./types";

const KEY = "wayband-save-v1";

/** Spells the band owns from the start — enough for the founding duo to function. */
const STARTING_SPELLS = ["cleave", "mend"];

function defaultHero(index: number): HeroSave {
  const base = HEROES[index].baseAttrs;
  const attrs: Attributes = { ...base };
  const founder = index === 0 || index === 3;
  const equipped = unlockedAbilities(attrs)
    .filter((a) => STARTING_SPELLS.includes(a.id))
    .slice(0, MAX_EQUIPPED)
    .map((a) => a.id);
  return { attrs, equipped, recruited: founder, active: founder, weaponTier: 0, armorTier: 0, talents: {}, trinket: null };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlockedStage: 0,
    level: 1,
    xp: 0,
    unspent: [0, 0, 0, 0],
    heroes: [0, 1, 2, 3].map(defaultHero),
    sound: true,
    music: true,
    speed: 0.5,
    bestiary: {},
    gold: 0,
    unlockedSpells: [...STARTING_SPELLS],
    inventory: [],
    difficulty: 1,
  };
}

export const SPEED_OPTIONS = [0.35, 0.5, 0.75, 1, 1.5, 2];

export function nextSpeed(current: number): number {
  const at = SPEED_OPTIONS.findIndex((s) => Math.abs(s - current) < 0.01);
  return SPEED_OPTIONS[(at + 1) % SPEED_OPTIONS.length];
}

export function speedLabel(speed: number): string {
  return `×${speed}`;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.heroes) || parsed.heroes.length !== 4) {
      return defaultSave();
    }
    parsed.heroes.forEach((hero, i) => {
      for (const key of ATTR_KEYS) {
        if (typeof hero.attrs[key] !== "number") throw new Error("bad attrs");
      }
      hero.equipped = hero.equipped.slice(0, MAX_EQUIPPED);
      // migrate pre-shop saves: roster used to grow with cleared stages
      if (typeof hero.recruited !== "boolean") {
        hero.recruited = i === 0 || i === 3 || (i === 1 && parsed.unlockedStage >= 1) || (i === 2 && parsed.unlockedStage >= 2);
      }
      if (typeof hero.active !== "boolean") hero.active = hero.recruited;
      if (typeof hero.weaponTier !== "number") hero.weaponTier = 0;
      if (typeof hero.armorTier !== "number") hero.armorTier = 0;
      if (!hero.talents || typeof hero.talents !== "object") hero.talents = {};
      if (hero.trinket === undefined) hero.trinket = null;
    });
    if (typeof parsed.speed !== "number" || parsed.speed < 0.25 || parsed.speed > 2) parsed.speed = 0.5;
    if (!parsed.bestiary || typeof parsed.bestiary !== "object") parsed.bestiary = {};
    if (typeof parsed.gold !== "number") parsed.gold = parsed.unlockedStage * 60;
    if (!Array.isArray(parsed.unlockedSpells)) {
      // pre-shop saves already earned their equipped spells
      const owned = new Set(STARTING_SPELLS);
      for (const hero of parsed.heroes) for (const id of hero.equipped) owned.add(id);
      parsed.unlockedSpells = [...owned];
    }
    if (!Array.isArray(parsed.inventory)) parsed.inventory = [];
    if (typeof parsed.difficulty !== "number" || parsed.difficulty < 0 || parsed.difficulty > 3) parsed.difficulty = 1;
    return parsed;
  } catch {
    return defaultSave();
  }
}

export function persist(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Private browsing or storage quota — play on without persistence.
  }
}

/** Grants XP, applying any level-ups. Returns number of levels gained. */
export function grantXp(save: SaveData, amount: number): number {
  save.xp += amount;
  if (save.level >= MAX_LEVEL) {
    save.xp = 0;
    persist(save);
    return 0;
  }
  let gained = 0;
  while (save.level < MAX_LEVEL && save.xp >= xpForLevel(save.level)) {
    save.xp -= xpForLevel(save.level);
    save.level += 1;
    gained += 1;
    for (let i = 0; i < save.unspent.length; i++) {
      save.unspent[i] += POINTS_PER_LEVEL;
    }
  }
  persist(save);
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
  const stillUnlocked = unlockedAbilities(save.heroes[index].attrs).map((a) => a.id);
  save.heroes[index].equipped = save.heroes[index].equipped.filter((id) => stillUnlocked.includes(id));
  persist(save);
}
