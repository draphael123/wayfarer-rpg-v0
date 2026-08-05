import type {
  AbilityDef,
  Attributes,
  AttrKey,
  DerivedStats,
  EnemyKind,
  StageDef,
  WeaponKind,
} from "./types";

export const ATTR_KEYS: AttrKey[] = ["str", "dex", "int", "vit", "spi"];

export const ATTR_NAMES: Record<AttrKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  int: "Intellect",
  vit: "Vitality",
  spi: "Spirit",
};

export const ATTR_BLURBS: Record<AttrKey, string> = {
  str: "Melee damage, a little armor and health",
  dex: "Attack speed, bow damage, move speed",
  int: "Arcane bolt damage and spell power",
  vit: "Health and armor",
  spi: "Healing channel and holy magic",
};

export interface HeroDef {
  name: string;
  title: string;
  skin: string;
  hair: string;
  accent: string;
  baseAttrs: Attributes;
}

// Starting biases are suggestions only — every point can be reallocated freely.
export const HEROES: HeroDef[] = [
  {
    name: "Bram",
    title: "the Oathbound",
    skin: "#e8b58c",
    hair: "#6b3f22",
    accent: "#b0413e",
    baseAttrs: { str: 6, dex: 2, int: 1, vit: 5, spi: 1 },
  },
  {
    name: "Wren",
    title: "the Fletcher",
    skin: "#d9a06b",
    hair: "#2e2a35",
    accent: "#3e7c4f",
    baseAttrs: { str: 2, dex: 7, int: 2, vit: 3, spi: 1 },
  },
  {
    name: "Ezri",
    title: "the Emberwise",
    skin: "#f0c9a0",
    hair: "#a8552f",
    accent: "#7b4fa6",
    baseAttrs: { str: 1, dex: 2, int: 7, vit: 3, spi: 2 },
  },
  {
    name: "Sol",
    title: "the Lantern",
    skin: "#c98d5e",
    hair: "#e8e2d0",
    accent: "#d9a441",
    baseAttrs: { str: 2, dex: 1, int: 2, vit: 4, spi: 6 },
  },
];

export const ABILITIES: AbilityDef[] = [
  {
    id: "cleave",
    name: "Cleave",
    gate: { attr: "str", value: 6 },
    targeting: "instant",
    cooldown: 8,
    color: "#e05c4b",
    icon: "cleave",
    blurb: "Sweep nearby foes for heavy weapon damage.",
  },
  {
    id: "warcry",
    name: "Warcry",
    gate: { attr: "str", value: 12 },
    targeting: "instant",
    cooldown: 16,
    color: "#e0904b",
    icon: "warcry",
    blurb: "Taunt nearby foes and harden against their blows.",
  },
  {
    id: "pierce",
    name: "Piercing Shot",
    gate: { attr: "dex", value: 6 },
    targeting: "ray",
    cooldown: 10,
    color: "#58b368",
    icon: "pierce",
    blurb: "Drag to aim a shot that skewers everything in a line.",
  },
  {
    id: "flurry",
    name: "Flurry",
    gate: { attr: "dex", value: 12 },
    targeting: "instant",
    cooldown: 18,
    color: "#8ed081",
    icon: "flurry",
    blurb: "Attack far faster for a few seconds.",
  },
  {
    id: "fireball",
    name: "Fireball",
    gate: { attr: "int", value: 6 },
    targeting: "point",
    cooldown: 12,
    color: "#e77728",
    icon: "fireball",
    blurb: "Drag to hurl a blast that burns an area.",
  },
  {
    id: "frostwake",
    name: "Frostwake",
    gate: { attr: "int", value: 12 },
    targeting: "ray",
    cooldown: 14,
    color: "#5fa8d3",
    icon: "frostwake",
    blurb: "Drag to lay a freezing trail that chills foes crossing it.",
  },
  {
    id: "mend",
    name: "Mend",
    gate: { attr: "spi", value: 6 },
    targeting: "ally",
    cooldown: 9,
    color: "#f2d16b",
    icon: "mend",
    blurb: "Drag onto an ally for a strong burst of healing.",
  },
  {
    id: "radiance",
    name: "Radiance",
    gate: { attr: "spi", value: 12 },
    targeting: "instant",
    cooldown: 20,
    color: "#f7e8a4",
    icon: "radiance",
    blurb: "Mend every ally near you in a flash of light.",
  },
  {
    id: "bulwark",
    name: "Bulwark",
    gate: { attr: "vit", value: 10 },
    targeting: "instant",
    cooldown: 15,
    color: "#9aa7b8",
    icon: "bulwark",
    blurb: "Raise a shield that absorbs a burst of damage.",
  },
];

export function abilityById(id: string): AbilityDef | undefined {
  return ABILITIES.find((a) => a.id === id);
}

export function unlockedAbilities(attrs: Attributes): AbilityDef[] {
  return ABILITIES.filter((a) => attrs[a.gate.attr] >= a.gate.value);
}

export function dominantWeapon(attrs: Attributes): WeaponKind {
  if (attrs.int > attrs.str && attrs.int >= attrs.dex) return "staff";
  if (attrs.dex > attrs.str) return "bow";
  return "sword";
}

export function deriveStats(attrs: Attributes): DerivedStats {
  const weapon = dominantWeapon(attrs);
  const maxHp = Math.round(60 + attrs.vit * 14 + attrs.str * 4);
  const armor = Math.min(0.6, attrs.vit * 0.02 + attrs.str * 0.01);
  const speed = 95 + Math.min(45, attrs.dex * 3);
  const healPower = 2 + attrs.spi * 1.6;
  const spellPower = 1 + attrs.int * 0.055;
  let damage: number;
  let range: number;
  let attackCooldown: number;
  if (weapon === "sword") {
    damage = 8 + attrs.str * 2.3;
    range = 34;
    attackCooldown = 1.15;
  } else if (weapon === "bow") {
    damage = 6 + attrs.dex * 1.7;
    range = 210;
    attackCooldown = 1.0;
  } else {
    damage = 7 + attrs.int * 2.0;
    range = 190;
    attackCooldown = 1.35;
  }
  attackCooldown *= 1 - Math.min(0.45, attrs.dex * 0.018);
  return { maxHp, damage, range, attackCooldown, speed, armor, healPower, spellPower, weapon };
}

export interface EnemyDef {
  name: string;
  maxHp: number;
  damage: number;
  range: number;
  attackCooldown: number;
  speed: number;
  armor: number;
  radius: number;
  xp: number;
  body: string;
  trim: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  goblin: {
    name: "Goblin",
    maxHp: 55,
    damage: 8,
    range: 30,
    attackCooldown: 1.2,
    speed: 105,
    armor: 0,
    radius: 13,
    xp: 6,
    body: "#5e8c3a",
    trim: "#8c5a2e",
  },
  wolf: {
    name: "Dusk Wolf",
    maxHp: 42,
    damage: 7,
    range: 28,
    attackCooldown: 0.85,
    speed: 150,
    armor: 0,
    radius: 13,
    xp: 6,
    body: "#5a5666",
    trim: "#8d8798",
  },
  archer: {
    name: "Sniper",
    maxHp: 44,
    damage: 9,
    range: 195,
    attackCooldown: 1.7,
    speed: 92,
    armor: 0,
    radius: 12,
    xp: 8,
    body: "#7a6a3c",
    trim: "#4b431f",
  },
  brute: {
    name: "Brute",
    maxHp: 190,
    damage: 22,
    range: 40,
    attackCooldown: 2.2,
    speed: 62,
    armor: 0.2,
    radius: 22,
    xp: 16,
    body: "#7d5a44",
    trim: "#3f2b1e",
  },
  shaman: {
    name: "Shaman",
    maxHp: 60,
    damage: 7,
    range: 170,
    attackCooldown: 2.0,
    speed: 85,
    armor: 0,
    radius: 13,
    xp: 12,
    body: "#4f7d7a",
    trim: "#2c4a48",
  },
  warlord: {
    name: "Gorehulk",
    maxHp: 900,
    damage: 30,
    range: 46,
    attackCooldown: 2.4,
    speed: 55,
    armor: 0.25,
    radius: 30,
    xp: 80,
    body: "#8a4a3a",
    trim: "#2f1a12",
  },
};

export const STAGES: StageDef[] = [
  {
    id: 0,
    name: "Millbrook Fields",
    subtitle: "Goblins in the barley",
    palette: {
      skyTop: "#8fc7e8",
      skyBottom: "#dcecc8",
      hills: "#93b877",
      ground: "#a8c37a",
      groundDark: "#8aa863",
      prop: "#6d8a4e",
    },
    scale: 1,
    xpReward: 20,
    waves: [
      [{ kind: "goblin", count: 3 }],
      [{ kind: "goblin", count: 4 }, { kind: "wolf", count: 1 }],
      [{ kind: "goblin", count: 4 }, { kind: "archer", count: 2 }],
    ],
  },
  {
    id: 1,
    name: "Thornwood Edge",
    subtitle: "Wolves hunt in pairs",
    palette: {
      skyTop: "#7fb6d6",
      skyBottom: "#cfe3b8",
      hills: "#6f9a5c",
      ground: "#87a95f",
      groundDark: "#6c8c4b",
      prop: "#4c6b3a",
    },
    scale: 1.15,
    xpReward: 28,
    waves: [
      [{ kind: "wolf", count: 3 }, { kind: "goblin", count: 2 }],
      [{ kind: "archer", count: 3 }, { kind: "wolf", count: 2 }],
      [{ kind: "brute", count: 1 }, { kind: "goblin", count: 4 }],
    ],
  },
  {
    id: 2,
    name: "Sunken Crossing",
    subtitle: "Something stirs the reeds",
    palette: {
      skyTop: "#7aa8c9",
      skyBottom: "#c5d6b0",
      hills: "#5f8a6e",
      ground: "#7c9c74",
      groundDark: "#61805c",
      prop: "#3f6050",
    },
    scale: 1.3,
    xpReward: 36,
    waves: [
      [{ kind: "goblin", count: 5 }, { kind: "shaman", count: 1 }],
      [{ kind: "brute", count: 1 }, { kind: "archer", count: 3 }],
      [{ kind: "brute", count: 1 }, { kind: "shaman", count: 2 }, { kind: "wolf", count: 3 }],
    ],
  },
  {
    id: 3,
    name: "Ashvale Ruin",
    subtitle: "The war camp wakes",
    palette: {
      skyTop: "#c9976a",
      skyBottom: "#e8cf9e",
      hills: "#a07648",
      ground: "#bd9a62",
      groundDark: "#9d7e4e",
      prop: "#7a5c38",
    },
    scale: 1.45,
    xpReward: 46,
    waves: [
      [{ kind: "archer", count: 4 }, { kind: "wolf", count: 3 }],
      [{ kind: "brute", count: 2 }, { kind: "shaman", count: 1 }],
      [{ kind: "goblin", count: 6 }, { kind: "archer", count: 3 }],
      [{ kind: "brute", count: 2 }, { kind: "shaman", count: 2 }],
    ],
  },
  {
    id: 4,
    name: "Gloaming Pass",
    subtitle: "Night falls fast here",
    palette: {
      skyTop: "#4a5a8c",
      skyBottom: "#8d7ba8",
      hills: "#55496e",
      ground: "#6e6288",
      groundDark: "#584e70",
      prop: "#3d3554",
    },
    scale: 1.6,
    xpReward: 58,
    waves: [
      [{ kind: "wolf", count: 6 }],
      [{ kind: "shaman", count: 2 }, { kind: "brute", count: 2 }],
      [{ kind: "archer", count: 4 }, { kind: "wolf", count: 4 }],
      [{ kind: "brute", count: 3 }, { kind: "shaman", count: 2 }],
    ],
  },
  {
    id: 5,
    name: "Gorehulk's Hollow",
    subtitle: "The warlord himself",
    palette: {
      skyTop: "#8c4a4a",
      skyBottom: "#d9a878",
      hills: "#6e3a3a",
      ground: "#8a6a52",
      groundDark: "#6e5440",
      prop: "#4a3226",
    },
    scale: 1.7,
    xpReward: 90,
    waves: [
      [{ kind: "goblin", count: 5 }, { kind: "shaman", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "archer", count: 3 }],
      [{ kind: "warlord", count: 1 }, { kind: "shaman", count: 2 }],
    ],
  },
];

export function xpForLevel(level: number): number {
  return Math.round(40 * level * (1 + level * 0.35));
}

export const POINTS_PER_LEVEL = 2;
export const MAX_EQUIPPED = 3;
