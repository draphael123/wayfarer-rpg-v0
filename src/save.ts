import { ATTR_KEYS, HEROES, MAX_EQUIPPED, POINTS_PER_LEVEL, unlockedAbilities, xpForLevel } from "./data";
import type { Attributes, HeroSave, SaveData } from "./types";

const KEY = "wayband-save-v1";

function defaultHero(index: number): HeroSave {
  const base = HEROES[index].baseAttrs;
  const attrs: Attributes = { ...base };
  const equipped = unlockedAbilities(attrs)
    .slice(0, MAX_EQUIPPED)
    .map((a) => a.id);
  return { attrs, equipped };
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
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.heroes) || parsed.heroes.length !== 4) {
      return defaultSave();
    }
    for (const hero of parsed.heroes) {
      for (const key of ATTR_KEYS) {
        if (typeof hero.attrs[key] !== "number") return defaultSave();
      }
      hero.equipped = hero.equipped.slice(0, MAX_EQUIPPED);
    }
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
  let gained = 0;
  while (save.xp >= xpForLevel(save.level)) {
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
