import type {
  AbilityDef,
  Attributes,
  AttrKey,
  DerivedStats,
  EnemyKind,
  HeroSave,
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
  // late arrivals — word of the band spreads once the Thornwood ogre falls
  {
    name: "Maren",
    title: "the Tidecaller",
    skin: "#d8a87e",
    hair: "#7ba8b8",
    accent: "#4a7a8c",
    baseAttrs: { str: 1, dex: 2, int: 5, vit: 2, spi: 5 },
  },
  {
    name: "Kellan",
    title: "the Unbroken",
    skin: "#b98a62",
    hair: "#3a3632",
    accent: "#5a5f6e",
    baseAttrs: { str: 4, dex: 1, int: 1, vit: 7, spi: 2 },
  },
];

/** Hero indexes gated behind campaign progress: index → first unlockedStage that frees them. */
export const HERO_GATE_STAGE: Record<number, number> = { 4: 2, 5: 2 };

export function heroArrived(save: { unlockedStage: number }, index: number): boolean {
  const gate = HERO_GATE_STAGE[index];
  return gate === undefined || save.unlockedStage >= gate;
}

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
export const RECRUIT_COST: Record<number, number> = { 1: 120, 2: 300, 4: 420, 5: 420 };

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

// ------------------------------------------------------------------ callings
//
// Callings are a prestige layer ON TOP of the classless build: entry is gated
// by the stats you chose, nothing about stats/spells/respec ever locks.

export interface CallingDef {
  id: string;
  name: string;
  epithet: string; // shown under the hero's name once sworn
  crest: string; // ico() name for menu chrome
  color: string;
  entry: { attr: AttrKey; value: number }[];
  passive: string; // menu description of the always-on perk
  signature: AbilityDef; // charge-based ultimate, exclusive to the calling
  chargeHint: string; // how the ultimate meter fills
}

export const CALLING_UNLOCK_LEVEL = 5;
export const CALLING_SWITCH_COST = 150;

const sig = (id: string, name: string, targeting: AbilityDef["targeting"], cooldown: number, color: string, blurb: string): AbilityDef => ({
  id,
  name,
  gate: { attr: "str", value: 0 }, // callings gate by oath, not stats
  targeting,
  cooldown,
  color,
  icon: id,
  blurb,
});

export const CALLINGS: CallingDef[] = [
  {
    id: "vanguard",
    name: "Vanguard",
    epithet: "Shield of the Band",
    crest: "shield",
    color: "#e0a34b",
    entry: [{ attr: "vit", value: 8 }],
    passive: "+5% armor, and +10% more while an enemy is at arm's reach.",
    chargeHint: "Charges from damage you take",
    signature: sig("challenge", "Challenge", "instant", 14, "#e0a34b", "Ultimate: every nearby foe must attack you while you brace behind a holy shield."),
  },
  {
    id: "reaver",
    name: "Reaver",
    epithet: "Red-Handed",
    crest: "sword",
    color: "#d1543f",
    entry: [{ attr: "str", value: 8 }],
    passive: "+8% melee damage, +20% more against foes below 40% health.",
    chargeHint: "Charges from damage you deal",
    signature: sig("whirlwind", "Whirlwind", "instant", 12, "#d1543f", "Ultimate: a devastating spin that staggers and shoves everything around you."),
  },
  {
    id: "ranger",
    name: "Ranger",
    epithet: "of the Long Watch",
    crest: "bow",
    color: "#7ba05a",
    entry: [{ attr: "dex", value: 8 }],
    passive: "+8% move, +6% ranged damage, attack faster while nothing is in your face.",
    chargeHint: "Charges from damage you deal",
    signature: sig("volley", "Volley", "point", 14, "#a8d080", "Ultimate: a storm of arrows that wounds and slows everything under it."),
  },
  {
    id: "arcanist",
    name: "Arcanist",
    epithet: "Ember-Eyed",
    crest: "spark",
    color: "#9a7bd8",
    entry: [{ attr: "int", value: 8 }],
    passive: "Spells recharge 10% faster and hit 8% harder.",
    chargeHint: "Charges from damage you deal",
    signature: sig("barrage", "Arcane Barrage", "instant", 13, "#b79aee", "Ultimate: hurl five seeking bolts at the nearest enemies."),
  },
  {
    id: "chaplain",
    name: "Chaplain",
    epithet: "Lantern-Bearer",
    crest: "plus",
    color: "#e8d9a0",
    entry: [{ attr: "spi", value: 8 }],
    passive: "+10% healing; your channel spills 30% onto another wounded ally nearby.",
    chargeHint: "Charges from healing you give",
    signature: sig("sanctuary", "Sanctuary", "point", 16, "#f2e7a0", "Ultimate: consecrate ground that swiftly mends every ally standing on it."),
  },
  {
    id: "trickster",
    name: "Trickster",
    epithet: "Twice-Shadowed",
    crest: "moon",
    color: "#7bc8d8",
    entry: [
      { attr: "dex", value: 6 },
      { attr: "int", value: 6 },
    ],
    passive: "+6% move and abilities recharge 6% faster.",
    chargeHint: "Charges fast from kills",
    signature: sig("blink", "Blink", "ray", 11, "#9adeee", "Ultimate: vanish and reappear in a burst of speed, shedding every foe hunting you."),
  },
];

export function callingById(id: string | null | undefined): CallingDef | null {
  return CALLINGS.find((c) => c.id === id) ?? null;
}

export function callingEligible(calling: CallingDef, attrs: Attributes): boolean {
  return calling.entry.every((e) => attrs[e.attr] >= e.value);
}

function callingStatMods(calling?: string | null) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  switch (calling) {
    case "vanguard":
      m.armorFlat = 0.05;
      break;
    case "reaver":
      m.meleeDmg = 0.08;
      break;
    case "ranger":
      m.moveSpeed = 0.08;
      m.rangedDmg = 0.06;
      break;
    case "arcanist":
      m.cdr = 0.1;
      m.spellPower = 0.08;
      break;
    case "chaplain":
      m.healPower = 0.1;
      break;
    case "trickster":
      m.moveSpeed = 0.06;
      m.cdr = 0.06;
      break;
  }
  return m;
}

/** Total ability-cooldown reduction from talents, trinket, and calling. */
export function cooldownReduction(hero: HeroSave): number {
  return Math.min(0.5, talentMods(hero.talents).cdr + trinketMods(hero.trinket).cdr + callingStatMods(hero.calling).cdr);
}

export function deriveStats(
  attrs: Attributes,
  weaponTier = 0,
  armorTier = 0,
  talents?: Record<string, number>,
  trinket?: string | null,
  calling?: string | null,
): DerivedStats {
  const t = talentMods(talents);
  const k = trinketMods(trinket);
  const c = callingStatMods(calling);
  const mods = {
    meleeDmg: t.meleeDmg + k.meleeDmg + c.meleeDmg,
    rangedDmg: t.rangedDmg + k.rangedDmg + c.rangedDmg,
    hpPct: t.hpPct + k.hpPct + c.hpPct,
    armorFlat: t.armorFlat + k.armorFlat + c.armorFlat,
    cdr: Math.min(0.5, t.cdr + k.cdr + c.cdr),
    atkSpeed: t.atkSpeed + k.atkSpeed + c.atkSpeed,
    moveSpeed: t.moveSpeed + k.moveSpeed + c.moveSpeed,
    crit: t.crit + k.crit + c.crit,
    spellPower: t.spellPower + k.spellPower + c.spellPower,
    healPower: t.healPower + k.healPower + c.healPower,
    startShield: t.startShield + k.startShield + c.startShield,
  };
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
  damage *= 1 + (weapon === "sword" ? mods.meleeDmg : mods.rangedDmg);
  return {
    maxHp: Math.round(maxHp * (1 + mods.hpPct)) + trinketFlatHp(trinket),
    damage,
    range,
    attackCooldown: attackCooldown / (1 + mods.atkSpeed),
    speed: speed * (1 + mods.moveSpeed),
    armor: Math.min(0.7, armor + mods.armorFlat),
    healPower: healPower * (1 + mods.healPower),
    spellPower: spellPower * (1 + mods.spellPower),
    weapon,
  };
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
  ogre: {
    name: "Mosstooth Ogre",
    maxHp: 330,
    damage: 26,
    range: 44,
    attackCooldown: 2.4,
    speed: 58,
    armor: 0.25,
    radius: 27,
    xp: 45,
    body: "#6a7a4a",
    trim: "#39442a",
    lore: "It sleeps under the deadfall and wakes for the smell of iron. The pines grow crooked around it.",
    habit: "Huge, slow, and crushing. Keep moving and never take two swings in a row.",
  },
  alpha: {
    name: "Alpha of Thornwood",
    maxHp: 380,
    damage: 15,
    range: 34,
    attackCooldown: 1.1,
    speed: 135,
    armor: 0.1,
    radius: 24,
    xp: 60,
    body: "#3f3a4d",
    trim: "#6e6680",
    lore: "The pack answers one voice. It has never known a hunt to fail.",
    habit: "Dodge the pounce circle! When exhausted after leaping, strike hard.",
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
      [{ kind: "ogre", count: 1 }],
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
      [{ kind: "alpha", count: 1 }],
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

// ------------------------------------------------------------------ talents

export const MAX_LEVEL = 100;

export type TalentTree = "str" | "dex" | "mag";

export interface TalentDef {
  id: string;
  tree: TalentTree;
  name: string;
  blurb: string; // per-rank effect, human readable
  maxRank: number;
  tier: 1 | 2 | 3; // deeper tiers unlock with points spent in the tree
  keystone?: boolean; // one-rank talents that change how you fight
}

export const TALENT_TREES: Record<TalentTree, { name: string; color: string; icon: string }> = {
  str: { name: "Strength", color: "#e05c4b", icon: "🛡" },
  dex: { name: "Dexterity", color: "#58b368", icon: "🏹" },
  mag: { name: "Magic", color: "#8a6fd1", icon: "✨" },
};

/** Points that must be spent inside a tree before each tier opens. */
export const TIER_UNLOCK = [0, 5, 12];

export const TALENTS: TalentDef[] = [
  // --------------- Strength: hit harder, stand longer
  { id: "ironGrip", tree: "str", tier: 1, name: "Iron Grip", blurb: "+3% melee damage", maxRank: 5 },
  { id: "oxBlood", tree: "str", tier: 1, name: "Ox Blood", blurb: "+3% max health", maxRank: 5 },
  { id: "stoneSkin", tree: "str", tier: 2, name: "Stone Skin", blurb: "+1.5% armor", maxRank: 5 },
  { id: "warEcho", tree: "str", tier: 2, name: "War Echo", blurb: "-3% ability cooldowns", maxRank: 5 },
  { id: "battleRoar", tree: "str", tier: 2, name: "Battle Roar", blurb: "Kills whip you into a fury: +35% attack speed for 2.5s", maxRank: 1, keystone: true },
  { id: "cleavingBlows", tree: "str", tier: 3, name: "Cleaving Blows", blurb: "Melee strikes splash 30% damage to other nearby foes", maxRank: 1, keystone: true },
  { id: "juggernaut", tree: "str", tier: 3, name: "Juggernaut", blurb: "Cannot be stunned while above two-thirds health", maxRank: 1, keystone: true },
  { id: "lastStand", tree: "str", tier: 3, name: "Last Stand", blurb: "+8% damage while below 30% health", maxRank: 3 },
  // --------------- Dexterity: speed, precision, evasion
  { id: "keenEye", tree: "dex", tier: 1, name: "Keen Eye", blurb: "+3% ranged damage", maxRank: 5 },
  { id: "quickHands", tree: "dex", tier: 1, name: "Quick Hands", blurb: "+3% attack speed", maxRank: 5 },
  { id: "fleetFoot", tree: "dex", tier: 2, name: "Fleet Foot", blurb: "+3% move speed", maxRank: 5 },
  { id: "deadEye", tree: "dex", tier: 2, name: "Dead Eye", blurb: "+3% chance to crit for 60% extra", maxRank: 5 },
  { id: "twinArrows", tree: "dex", tier: 2, name: "Twin Arrows", blurb: "Every 4th ranged attack looses two missiles", maxRank: 1, keystone: true },
  { id: "executioner", tree: "dex", tier: 3, name: "Executioner", blurb: "Foes below a quarter health take double damage from you", maxRank: 1, keystone: true },
  { id: "windStep", tree: "dex", tier: 3, name: "Wind Step", blurb: "Shrug off the first hit of every wave", maxRank: 1, keystone: true },
  { id: "huntersRhythm", tree: "dex", tier: 3, name: "Hunter's Rhythm", blurb: "+2% attack speed and move speed", maxRank: 3 },
  // --------------- Magic: spellcraft and mending
  { id: "focus", tree: "mag", tier: 1, name: "Focus", blurb: "+4% spell power", maxRank: 5 },
  { id: "springs", tree: "mag", tier: 1, name: "Vital Springs", blurb: "+4% healing power", maxRank: 5 },
  { id: "attune", tree: "mag", tier: 2, name: "Attunement", blurb: "-3% ability cooldowns", maxRank: 5 },
  { id: "aegis", tree: "mag", tier: 2, name: "Lesser Aegis", blurb: "Start battles with an 8 hp ward", maxRank: 5 },
  { id: "kindledMind", tree: "mag", tier: 2, name: "Kindled Mind", blurb: "Your damaging spells scorch foes for 8 over 3s", maxRank: 1, keystone: true },
  { id: "overflow", tree: "mag", tier: 3, name: "Overflow", blurb: "Overhealing spills onto the most wounded other ally", maxRank: 1, keystone: true },
  { id: "mendersWard", tree: "mag", tier: 3, name: "Mender's Ward", blurb: "Topping off an ally leaves a 10 hp ward on them", maxRank: 1, keystone: true },
  { id: "archon", tree: "mag", tier: 3, name: "Archon", blurb: "+3% spell power and healing power", maxRank: 3 },
];

export interface TalentRanks {
  [id: string]: number;
}

export interface TalentMods {
  meleeDmg: number;
  rangedDmg: number;
  hpPct: number;
  armorFlat: number;
  cdr: number;
  atkSpeed: number;
  moveSpeed: number;
  crit: number;
  spellPower: number;
  healPower: number;
  startShield: number;
}

export function talentMods(ranks: TalentRanks | undefined): TalentMods {
  const r = (id: string) => ranks?.[id] ?? 0;
  return {
    meleeDmg: r("ironGrip") * 0.03,
    rangedDmg: r("keenEye") * 0.03,
    hpPct: r("oxBlood") * 0.03,
    armorFlat: r("stoneSkin") * 0.015,
    cdr: Math.min(0.45, r("warEcho") * 0.03 + r("attune") * 0.03),
    atkSpeed: r("quickHands") * 0.03 + r("huntersRhythm") * 0.02,
    moveSpeed: r("fleetFoot") * 0.03 + r("huntersRhythm") * 0.02,
    crit: r("deadEye") * 0.03,
    spellPower: r("focus") * 0.04 + r("archon") * 0.03,
    healPower: r("springs") * 0.04 + r("archon") * 0.03,
    startShield: r("aegis") * 8,
  };
}

/** Talent points each hero can spend at a given band level (1 every 2 levels). */
export function talentPointBudget(level: number): number {
  return Math.floor(Math.min(level, MAX_LEVEL) / 2);
}

export function talentPointsSpent(ranks: TalentRanks | undefined): number {
  if (!ranks) return 0;
  return Object.values(ranks).reduce((a, b) => a + b, 0);
}

/** Points spent inside one tree — gates the deeper tiers. */
export function talentPointsInTree(ranks: TalentRanks | undefined, tree: TalentTree): number {
  if (!ranks) return 0;
  return TALENTS.filter((t) => t.tree === tree).reduce((sum, t) => sum + (ranks[t.id] ?? 0), 0);
}


// ------------------------------------------------------------------ difficulty

export const DIFFICULTIES = [
  // Difficulty changes how enemies BEHAVE, not just their numbers:
  // telegraph = boss warning time, haste = enemy attack-rate multiplier,
  // extraSpawn = bonus enemies added to each wave's first group.
  { name: "Easy", enemyMult: 0.8, rewardMult: 0.6, color: "#8ee88b", telegraph: 2.1, haste: 0.85, extraSpawn: 0 },
  { name: "Normal", enemyMult: 1, rewardMult: 1, color: "#ffe9a3", telegraph: 1.5, haste: 1, extraSpawn: 0 },
  { name: "Hard", enemyMult: 1.25, rewardMult: 1.4, color: "#e0904b", telegraph: 1.2, haste: 1.15, extraSpawn: 0 },
  { name: "Brutal", enemyMult: 1.5, rewardMult: 1.85, color: "#ff8a70", telegraph: 0.95, haste: 1.25, extraSpawn: 1 },
];

// ------------------------------------------------------------------ trinkets

export interface TrinketDef {
  id: string;
  name: string;
  blurb: string;
  rarity: "common" | "rare";
  icon: string;
}

export const TRINKETS: TrinketDef[] = [
  { id: "wolfTooth", name: "Wolf Tooth", blurb: "+5% attack speed", rarity: "common", icon: "🦷" },
  { id: "oakCharm", name: "Oak Charm", blurb: "+22 max health", rarity: "common", icon: "🌰" },
  { id: "riverStone", name: "River Stone", blurb: "+3% armor", rarity: "common", icon: "🪨" },
  { id: "hawkFeather", name: "Hawk Feather", blurb: "+6% ranged damage", rarity: "common", icon: "🪶" },
  { id: "emberBead", name: "Ember Bead", blurb: "+7% spell power", rarity: "common", icon: "🔥" },
  { id: "vervain", name: "Sprig of Vervain", blurb: "+7% healing power", rarity: "common", icon: "🌿" },
  { id: "alphaFang", name: "Alpha's Fang", blurb: "+8% attack speed, +6% melee damage", rarity: "rare", icon: "🐺" },
  { id: "gorehornShard", name: "Gorehulk Horn Shard", blurb: "+10% melee damage, +30 health", rarity: "rare", icon: "🐮" },
  { id: "witchLocket", name: "Witchlight Locket", blurb: "+10% spell power, -5% cooldowns", rarity: "rare", icon: "🔮" },
  { id: "saintRelic", name: "Saint's Relic", blurb: "+10% healing, battles start with a 20 hp ward", rarity: "rare", icon: "✨" },
];

export function trinketById(id: string | null | undefined): TrinketDef | undefined {
  return TRINKETS.find((t) => t.id === id);
}

export function trinketMods(id: string | null | undefined): TalentMods {
  const none: TalentMods = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  switch (id) {
    case "wolfTooth": return { ...none, atkSpeed: 0.05 };
    case "oakCharm": return { ...none, hpPct: 0, startShield: 0, armorFlat: 0, meleeDmg: 0, rangedDmg: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0 };
    case "riverStone": return { ...none, armorFlat: 0.03 };
    case "hawkFeather": return { ...none, rangedDmg: 0.06 };
    case "emberBead": return { ...none, spellPower: 0.07 };
    case "vervain": return { ...none, healPower: 0.07 };
    case "alphaFang": return { ...none, atkSpeed: 0.08, meleeDmg: 0.06 };
    case "gorehornShard": return { ...none, meleeDmg: 0.1 };
    case "witchLocket": return { ...none, spellPower: 0.1, cdr: 0.05 };
    case "saintRelic": return { ...none, healPower: 0.1, startShield: 20 };
    default: return none;
  }
}

/** Flat bonuses trinkets grant outside the multiplier system. */
export function trinketFlatHp(id: string | null | undefined): number {
  if (id === "oakCharm") return 22;
  if (id === "gorehornShard") return 30;
  return 0;
}

/** Stages whose final wave is a boss — these drop rare trinkets. */
export const BOSS_STAGES = [4, 5];
