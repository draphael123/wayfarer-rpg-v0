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
    accent: "#8a6a58",
    baseAttrs: { str: 6, dex: 2, int: 1, vit: 5, spi: 1 },
  },
  {
    name: "Wren",
    title: "the Fletcher",
    skin: "#d9a06b",
    hair: "#2e2a35",
    accent: "#6d7a64",
    baseAttrs: { str: 2, dex: 7, int: 2, vit: 3, spi: 1 },
  },
  {
    name: "Ezri",
    title: "the Emberwise",
    skin: "#f0c9a0",
    hair: "#a8552f",
    accent: "#6c6880",
    baseAttrs: { str: 1, dex: 2, int: 7, vit: 3, spi: 2 },
  },
  {
    name: "Sol",
    title: "the Lantern",
    skin: "#c98d5e",
    hair: "#e8e2d0",
    accent: "#8f8672",
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

/** Gold cost to recruit each hero at the tavern (by hero index). Bram and Sol are free founders. */
export const RECRUIT_COST: Record<number, number> = { 1: 120, 2: 300 };

export const PARTY_CAP = 4;

/** Hero indices fighting in battles: recruited AND marked active, capped at PARTY_CAP. */
export function partyRoster(save: { heroes: { recruited: boolean; active: boolean }[] }): number[] {
  return save.heroes
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.recruited && h.active)
    .map(({ i }) => i)
    .slice(0, PARTY_CAP);
}

// --- gear sold at the armory ---
export interface GearTier {
  name: string;
  cost: number; // 0 = starting gear
}

export const WEAPON_TIERS: GearTier[] = [
  { name: "Worn", cost: 0 },
  { name: "Iron", cost: 100 },
  { name: "Steel", cost: 300 },
  { name: "Mythril", cost: 800 },
];
export const WEAPON_DAMAGE_BONUS = [0, 4, 9, 16];

export const ARMOR_TIERS: GearTier[] = [
  { name: "Cloth", cost: 0 },
  { name: "Leather", cost: 100 },
  { name: "Chain", cost: 300 },
  { name: "Plate", cost: 800 },
];
export const ARMOR_BONUS = [0, 0.04, 0.08, 0.14];
export const ARMOR_HP_BONUS = [0, 15, 35, 65];

/** Gold cost of each ability in the spell shop. */
export const SPELL_COSTS: Record<string, number> = {
  cleave: 80,
  pierce: 80,
  fireball: 80,
  mend: 80,
  bulwark: 150,
  warcry: 220,
  flurry: 220,
  frostwake: 220,
  radiance: 220,
};

export function unlockedAbilities(attrs: Attributes): AbilityDef[] {
  return ABILITIES.filter((a) => attrs[a.gate.attr] >= a.gate.value);
}

export function dominantWeapon(attrs: Attributes): WeaponKind {
  if (attrs.spi > attrs.str && attrs.spi > attrs.dex && attrs.spi > attrs.int) return "stave";
  if (attrs.int > attrs.str && attrs.int >= attrs.dex) return "staff";
  if (attrs.dex > attrs.str) return "bow";
  return "sword";
}

export function deriveStats(attrs: Attributes, weaponTier = 0, armorTier = 0): DerivedStats {
  const weapon = dominantWeapon(attrs);
  const maxHp = Math.round(60 + attrs.vit * 14 + attrs.str * 4 + ARMOR_HP_BONUS[armorTier]);
  const armor = Math.min(0.65, attrs.vit * 0.02 + attrs.str * 0.01 + ARMOR_BONUS[armorTier]);
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
  } else if (weapon === "stave") {
    // a healer's holy spark — modest, but keeps them useful at range
    damage = 5 + attrs.spi * 1.1 + attrs.int * 0.5;
    range = 175;
    attackCooldown = 1.4;
  } else {
    damage = 7 + attrs.int * 2.0;
    range = 190;
    attackCooldown = 1.35;
  }
  attackCooldown *= 1 - Math.min(0.45, attrs.dex * 0.018);
  damage += WEAPON_DAMAGE_BONUS[weaponTier];
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
  lore: string;
  habit: string; // one-line tactical note shown in the bestiary
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
    xp: 9,
    body: "#5e8c3a",
    trim: "#8c5a2e",
    lore: "Scrappy raiders of the barley fields. One is a nuisance; a dozen is a harvest lost.",
    habit: "Rushes the nearest hero. Easily cleaved in groups.",
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
    xp: 9,
    body: "#5a5666",
    trim: "#8d8798",
    lore: "Dusk wolves hunt in silence between the pines, eyes like lantern-light.",
    habit: "Very fast. Will slip past your line to reach soft targets.",
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
    xp: 12,
    body: "#7a6a3c",
    trim: "#4b431f",
    lore: "Goblin snipers with stolen longbows and no sense of honor.",
    habit: "Keeps its distance and backpedals. Send someone to close the gap.",
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
    xp: 24,
    body: "#7d5a44",
    trim: "#3f2b1e",
    lore: "A wall of muscle and grievance. The horns are not decorative.",
    habit: "Slow but crushing. Kite it, or tank it with Warcry and armor.",
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
    xp: 17,
    body: "#4f7d7a",
    trim: "#2c4a48",
    lore: "Masked menders of the war-bands, muttering green fire.",
    habit: "Heals its allies from the back. Kill it first.",
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
    xp: 110,
    body: "#8a4a3a",
    trim: "#2f1a12",
    lore: "Gorehulk, warlord of the hollow. The forest itself seems to flinch.",
    habit: "His slam wounds everyone near it. Never clump up.",
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
    scale: 1.65,
    xpReward: 20,
    waves: [
      [{ kind: "goblin", count: 2 }],
      [{ kind: "goblin", count: 2 }, { kind: "wolf", count: 1 }],
      [{ kind: "goblin", count: 3 }, { kind: "archer", count: 1 }],
    ],
  },
  {
    id: 1,
    name: "Thornwood Deep",
    subtitle: "The pines have eyes",
    palette: {
      skyTop: "#54799c",
      skyBottom: "#9fc2a4",
      hills: "#3d6549",
      ground: "#547a4e",
      groundDark: "#40603c",
      prop: "#2b4832",
    },
    scale: 1.5,
    xpReward: 28,
    waves: [
      [{ kind: "wolf", count: 2 }, { kind: "goblin", count: 1 }],
      [{ kind: "archer", count: 1 }, { kind: "wolf", count: 2 }],
      [{ kind: "wolf", count: 3 }, { kind: "brute", count: 1 }],
    ],
  },
  {
    id: 2,
    name: "Mirebrook Hollow",
    subtitle: "Witchlights in the mist",
    palette: {
      skyTop: "#6b8b85",
      skyBottom: "#b3c29c",
      hills: "#48685a",
      ground: "#5c7a5c",
      groundDark: "#465e48",
      prop: "#34503e",
    },
    scale: 1.3,
    xpReward: 36,
    waves: [
      [{ kind: "goblin", count: 3 }, { kind: "shaman", count: 1 }],
      [{ kind: "shaman", count: 1 }, { kind: "archer", count: 2 }],
      [{ kind: "brute", count: 1 }, { kind: "shaman", count: 1 }, { kind: "wolf", count: 2 }],
    ],
  },
  {
    id: 3,
    name: "The Charwood",
    subtitle: "Still smoldering",
    palette: {
      skyTop: "#8a5744",
      skyBottom: "#d9b48a",
      hills: "#4a3832",
      ground: "#6e5a48",
      groundDark: "#52443a",
      prop: "#332820",
    },
    scale: 1.8,
    xpReward: 46,
    waves: [
      [{ kind: "archer", count: 2 }, { kind: "wolf", count: 2 }],
      [{ kind: "brute", count: 2 }, { kind: "shaman", count: 1 }],
      [{ kind: "goblin", count: 4 }, { kind: "archer", count: 2 }],
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
    scale: 1.95,
    xpReward: 58,
    waves: [
      [{ kind: "wolf", count: 4 }],
      [{ kind: "shaman", count: 1 }, { kind: "brute", count: 2 }],
      [{ kind: "archer", count: 2 }, { kind: "wolf", count: 3 }],
      [{ kind: "brute", count: 2 }, { kind: "shaman", count: 2 }],
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
    scale: 2.1,
    xpReward: 90,
    waves: [
      [{ kind: "goblin", count: 3 }, { kind: "shaman", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "archer", count: 2 }],
      [{ kind: "warlord", count: 1 }, { kind: "shaman", count: 2 }],
    ],
  },
];

export function xpForLevel(level: number): number {
  return Math.round(40 * level * (1 + level * 0.35));
}

export const POINTS_PER_LEVEL = 2;
export const MAX_EQUIPPED = 3;
