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
    id: "groundbreaker",
    name: "Groundbreaker",
    gate: { attr: "str", value: 10 },
    targeting: "instant",
    cooldown: 14,
    color: "#a8683f",
    icon: "groundbreaker",
    blurb: "Slam the earth: everything around you is hurt and slowed.",
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
    id: "sunder",
    name: "Sunder",
    gate: { attr: "str", value: 7 },
    targeting: "instant",
    cooldown: 12,
    color: "#c25a3a",
    icon: "sunder",
    blurb: "Crack the nearest foe's guard — they take 25% more damage for a while.",
  },
  {
    id: "overpower",
    name: "Overpower",
    gate: { attr: "str", value: 9 },
    targeting: "instant",
    cooldown: 9,
    color: "#e0714b",
    icon: "overpower",
    blurb: "A single crushing blow against the nearest foe.",
  },
  {
    id: "rush",
    name: "Executioner's Rush",
    gate: { attr: "str", value: 14 },
    targeting: "instant",
    cooldown: 13,
    color: "#e0494b",
    icon: "rush",
    blurb: "Dash to the most wounded foe in sight and cut them down.",
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
    id: "smokebomb",
    name: "Smoke Bomb",
    gate: { attr: "dex", value: 10 },
    targeting: "point",
    cooldown: 15,
    color: "#8a93a3",
    icon: "smokebomb",
    blurb: "Drag to drop a smoke cloud — allies inside shrug off a third of all harm.",
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
    id: "twinshot",
    name: "Twin Shot",
    gate: { attr: "dex", value: 7 },
    targeting: "ray",
    cooldown: 11,
    color: "#79b368",
    icon: "twinshot",
    blurb: "Drag to loose two arrows in a tight fan.",
  },
  {
    id: "caltrops",
    name: "Caltrops",
    gate: { attr: "dex", value: 9 },
    targeting: "point",
    cooldown: 13,
    color: "#9db36b",
    icon: "caltrops",
    blurb: "Drag to scatter spikes that slow and nick foes crossing them.",
  },
  {
    id: "deadeye",
    name: "Deadeye",
    gate: { attr: "dex", value: 14 },
    targeting: "ray",
    cooldown: 15,
    color: "#c9e86b",
    icon: "deadeye",
    blurb: "Drag to line up one perfect shot — massive damage, and the wound stays open.",
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
    id: "gravity",
    name: "Gravity Well",
    gate: { attr: "int", value: 10 },
    targeting: "point",
    cooldown: 15,
    color: "#7a6ae8",
    icon: "gravity",
    blurb: "Drag to open a well that drags foes toward its heart.",
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
    id: "missiles",
    name: "Magic Missiles",
    gate: { attr: "int", value: 7 },
    targeting: "instant",
    cooldown: 9,
    color: "#b48ae8",
    icon: "missiles",
    blurb: "Three unerring bolts pelt the nearest foe.",
  },
  {
    id: "chainspark",
    name: "Chain Spark",
    gate: { attr: "int", value: 9 },
    targeting: "instant",
    cooldown: 11,
    color: "#8fc7e8",
    icon: "chainspark",
    blurb: "Lightning leaps to the three nearest foes.",
  },
  {
    id: "meteor",
    name: "Meteor",
    gate: { attr: "int", value: 14 },
    targeting: "point",
    cooldown: 18,
    color: "#ff7a3a",
    icon: "meteor",
    blurb: "Drag to call a falling star — it lands a breath later, and lands hard.",
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
    id: "blessing",
    name: "Blessing",
    gate: { attr: "spi", value: 7 },
    targeting: "ally",
    cooldown: 12,
    color: "#e8d98a",
    icon: "blessing",
    blurb: "Drag onto an ally: mend them, quicken them, burn away chills and flame.",
  },
  {
    id: "sunlance",
    name: "Sunlance",
    gate: { attr: "spi", value: 9 },
    targeting: "point",
    cooldown: 12,
    color: "#ffd76b",
    icon: "sunlance",
    blurb: "Drag to call down a pillar of light: sears foes, soothes allies.",
  },
  {
    id: "ward",
    name: "Ward of Light",
    gate: { attr: "spi", value: 10 },
    targeting: "ally",
    cooldown: 13,
    color: "#f2e0b0",
    icon: "ward",
    blurb: "Drag onto an ally to wrap them in a glowing shield.",
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
    id: "judgement",
    name: "Judgement",
    gate: { attr: "spi", value: 14 },
    targeting: "instant",
    cooldown: 16,
    color: "#fff0b4",
    icon: "judgement",
    blurb: "Light falls on every badly wounded foe on the field at once.",
  },
  {
    id: "shieldslam",
    name: "Shield Slam",
    gate: { attr: "vit", value: 6 },
    targeting: "instant",
    cooldown: 10,
    color: "#c9b38a",
    icon: "shieldslam",
    blurb: "Bash the nearest foe senseless and shove them back.",
  },
  {
    id: "secondwind",
    name: "Second Wind",
    gate: { attr: "vit", value: 7 },
    targeting: "instant",
    cooldown: 14,
    color: "#b8c9a0",
    icon: "secondwind",
    blurb: "Catch your breath: heal yourself and shake off burning wounds.",
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
  {
    id: "ramwall",
    name: "Ramwall",
    gate: { attr: "vit", value: 12 },
    targeting: "ray",
    cooldown: 13,
    color: "#c9a06b",
    icon: "ramwall",
    blurb: "Drag to charge through the line, battering everything aside.",
  },
  {
    id: "stoneskin",
    name: "Stoneskin",
    gate: { attr: "vit", value: 14 },
    targeting: "ally",
    cooldown: 14,
    color: "#a8a29a",
    icon: "stoneskin",
    blurb: "Drag onto an ally to harden their skin against harm.",
  },
  {
    id: "bastion",
    name: "Last Bastion",
    gate: { attr: "vit", value: 16 },
    targeting: "instant",
    cooldown: 20,
    color: "#d8ccb0",
    icon: "bastion",
    blurb: "Shield the whole band and dare every nearby foe to come to you.",
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

// --- plate-tier variants: the top of the armor ladder becomes a choice ---

export interface ArmorVariantDef {
  id: string;
  name: string;
  blurb: string;
  icon: string; // ico() name
  tint: string; // plate metal color on the sprite
}

export const ARMOR_VARIANTS: ArmorVariantDef[] = [
  {
    id: "juggernaut",
    name: "Juggernaut Plate",
    blurb: "+5% armor and +10% health, but 10% slower.",
    icon: "shield",
    tint: "#aab4c2",
  },
  {
    id: "skirmisher",
    name: "Skirmisher Harness",
    blurb: "+10% move and +8% attack speed — thinner plating (−3% armor).",
    icon: "arrow",
    tint: "#c9a06b",
  },
  {
    id: "runeweave",
    name: "Runeweave Vestment",
    blurb: "+10% spell power and +10% healing — soft weave (−5% armor).",
    icon: "spark",
    tint: "#9a8ac9",
  },
];

export const ARMOR_VARIANT_SWITCH_COST = 250;

export function armorVariantById(id: string | null | undefined): ArmorVariantDef | null {
  return ARMOR_VARIANTS.find((v) => v.id === id) ?? null;
}

function armorVariantMods(variant: string | null | undefined) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  switch (variant) {
    case "juggernaut":
      m.armorFlat = 0.05;
      m.hpPct = 0.1;
      m.moveSpeed = -0.1;
      break;
    case "skirmisher":
      m.moveSpeed = 0.1;
      m.atkSpeed = 0.08;
      m.armorFlat = -0.03;
      break;
    case "runeweave":
      m.spellPower = 0.1;
      m.healPower = 0.1;
      m.armorFlat = -0.05;
      break;
  }
  return m;
}

/** Gold cost of each ability in the spell shop. */
export const SPELL_COSTS: Record<string, number> = {
  cleave: 80,
  pierce: 80,
  fireball: 80,
  mend: 80,
  shieldslam: 80,
  sunder: 100,
  twinshot: 100,
  missiles: 100,
  blessing: 100,
  secondwind: 100,
  overpower: 150,
  caltrops: 150,
  chainspark: 150,
  sunlance: 150,
  bulwark: 150,
  groundbreaker: 180,
  smokebomb: 180,
  gravity: 180,
  ward: 180,
  warcry: 220,
  flurry: 220,
  frostwake: 220,
  radiance: 220,
  ramwall: 220,
  stoneskin: 220,
  rush: 260,
  deadeye: 260,
  meteor: 260,
  judgement: 260,
  bastion: 280,
};

export function unlockedAbilities(attrs: Attributes): AbilityDef[] {
  return ABILITIES.filter((a) => attrs[a.gate.attr] >= a.gate.value);
}

/** Each calling favors an art; swearing its oath steadies the hand that way. */
const CALLING_WEAPON_AFFINITY: Record<string, AttrKey> = {
  vanguard: "str",
  reaver: "str",
  ranger: "dex",
  arcanist: "int",
  chaplain: "spi",
  trickster: "dex",
};

/**
 * The weapon morphs with the dominant stat — but an active oath adds a +2
 * thumb on the scale toward its favored art (weapon choice only, never the
 * stats themselves), so a sworn Reaver at STR 8 / INT 9 still draws a blade.
 */
export function dominantWeapon(attrs: Attributes, calling?: string | null): WeaponKind {
  const a: Attributes = { ...attrs };
  const fav = calling ? CALLING_WEAPON_AFFINITY[calling] : undefined;
  if (fav) a[fav] += 2;
  if (a.spi > a.str && a.spi > a.dex && a.spi > a.int) return "stave";
  if (a.int > a.str && a.int >= a.dex) return "staff";
  if (a.dex > a.str) return "bow";
  return "sword";
}

// ------------------------------------------------------------------ callings
//
// Callings are a prestige layer ON TOP of the classless build: entry is gated
// by the stats you chose, nothing about stats/spells/respec ever locks.

export interface AdvCallingDef {
  id: string;
  name: string;
  epithet: string;
  passive: string; // what the advancement adds on top of the base calling
  ultNote: string; // how it upgrades the ultimate
}

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
  advanced: [AdvCallingDef, AdvCallingDef]; // level-20 branch choice
}

export const CALLING_UNLOCK_LEVEL = 5;
export const CALLING_SWITCH_COST = 150;
export const ADV_CALLING_LEVEL = 20;
export const ADV_SWITCH_COST = 300;

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
    advanced: [
      {
        id: "bulwarkSaint",
        name: "Bulwark Saint",
        epithet: "the Living Wall",
        passive: "Allies near you take 8% less damage.",
        ultNote: "Challenge also shields every ally for 15% of their health.",
      },
      {
        id: "warbreaker",
        name: "Warbreaker",
        epithet: "the Answer in Iron",
        passive: "Melee attackers take 25% of their blow back as retaliation.",
        ultNote: "Challenge whips you into a fury: +35% attack speed while it holds.",
      },
    ],
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
    advanced: [
      {
        id: "berserker",
        name: "Berserker",
        epithet: "the Red Mist",
        passive: "Once bloodied (below 65% health) you attack 25% faster.",
        ultNote: "Whirlwind drinks deep: heals you for 40% of the damage it deals.",
      },
      {
        id: "blademaster",
        name: "Blademaster",
        epithet: "the Edge Incarnate",
        passive: "Your execute bonus deepens: +30% against foes below half health.",
        ultNote: "Whirlwind sweeps wider and leaves everything it touches bleeding.",
      },
    ],
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
    advanced: [
      {
        id: "hawkeye",
        name: "Hawkeye",
        epithet: "the Far-Death",
        passive: "Your shots reach 15% further.",
        ultNote: "Volley blankets a far wider stretch of ground.",
      },
      {
        id: "strider",
        name: "Strider",
        epithet: "the Wind That Walks",
        passive: "Another +8% move speed — nothing catches you.",
        ultNote: "Volley leaves a chilling field that keeps slowing foes who cross it.",
      },
    ],
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
    advanced: [
      {
        id: "stormcaller",
        name: "Stormcaller",
        epithet: "the Sky's Wrath",
        passive: "Another +8% spell power.",
        ultNote: "Barrage bolts arc onward, splashing 40% of their bite to a nearby foe.",
      },
      {
        id: "runebinder",
        name: "Runebinder",
        epithet: "the Patient Sigil",
        passive: "Abilities recharge another 8% faster.",
        ultNote: "Barrage brands its victims, burning them for several seconds.",
      },
    ],
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
    advanced: [
      {
        id: "lightwarden",
        name: "Lightwarden",
        epithet: "the Burning Grace",
        passive: "Another +8% healing power.",
        ultNote: "Sanctuary scorches enemies who dare stand in it.",
      },
      {
        id: "oracle",
        name: "Oracle",
        epithet: "the Threefold Voice",
        passive: "Your channel spills onto two allies instead of one.",
        ultNote: "Sanctuary lingers two seconds longer.",
      },
    ],
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
    advanced: [
      {
        id: "shadowdancer",
        name: "Shadowdancer",
        epithet: "the Second Shadow",
        passive: "Another +6% move speed.",
        ultNote: "Blink stuns the foes you abandon, frozen mid-lunge at empty air.",
      },
      {
        id: "spellthief",
        name: "Spellthief",
        epithet: "the Borrowed Hour",
        passive: "Kills shave a second off all your spell cooldowns.",
        ultNote: "Kills feed your ultimate even faster.",
      },
    ],
  },
];

export function advCallingById(id: string | null | undefined): { adv: AdvCallingDef; parent: CallingDef } | null {
  if (!id) return null;
  for (const c of CALLINGS) {
    for (const adv of c.advanced) {
      if (adv.id === id) return { adv, parent: c };
    }
  }
  return null;
}

export function callingById(id: string | null | undefined): CallingDef | null {
  return CALLINGS.find((c) => c.id === id) ?? null;
}

export function callingEligible(calling: CallingDef, attrs: Attributes): boolean {
  return calling.entry.every((e) => attrs[e.attr] >= e.value);
}

function callingStatMods(calling?: string | null, advCalling?: string | null) {
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
  switch (advCalling) {
    case "stormcaller":
      m.spellPower += 0.08;
      break;
    case "runebinder":
      m.cdr += 0.08;
      break;
    case "lightwarden":
      m.healPower += 0.08;
      break;
    case "strider":
      m.moveSpeed += 0.08;
      break;
    case "shadowdancer":
      m.moveSpeed += 0.06;
      break;
  }
  return m;
}

/** Total ability-cooldown reduction from talents, trinket, and calling(s). */
export function cooldownReduction(hero: HeroSave): number {
  return Math.min(
    0.5,
    talentMods(hero.talents).cdr + trinketMods(hero.trinket).cdr + callingStatMods(hero.calling, hero.advCalling).cdr,
  );
}

export function deriveStats(
  attrs: Attributes,
  weaponTier = 0,
  armorTier = 0,
  talents?: Record<string, number>,
  trinket?: string | null,
  calling?: string | null,
  advCalling?: string | null,
  armorVariant?: string | null,
): DerivedStats {
  const t = talentMods(talents);
  const k = trinketMods(trinket);
  const c = callingStatMods(calling, advCalling);
  const v = armorVariantMods(armorTier >= 3 ? armorVariant : null);
  const mods = {
    meleeDmg: t.meleeDmg + k.meleeDmg + c.meleeDmg + v.meleeDmg,
    rangedDmg: t.rangedDmg + k.rangedDmg + c.rangedDmg + v.rangedDmg,
    hpPct: t.hpPct + k.hpPct + c.hpPct + v.hpPct,
    armorFlat: t.armorFlat + k.armorFlat + c.armorFlat + v.armorFlat,
    cdr: Math.min(0.5, t.cdr + k.cdr + c.cdr + v.cdr),
    atkSpeed: t.atkSpeed + k.atkSpeed + c.atkSpeed + v.atkSpeed,
    moveSpeed: t.moveSpeed + k.moveSpeed + c.moveSpeed + v.moveSpeed,
    crit: t.crit + k.crit + c.crit + v.crit,
    spellPower: t.spellPower + k.spellPower + c.spellPower + v.spellPower,
    healPower: t.healPower + k.healPower + c.healPower + v.healPower,
    startShield: t.startShield + k.startShield + c.startShield + v.startShield,
  };
  const weapon = dominantWeapon(attrs, calling);
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
  if (advCalling === "hawkeye") range *= 1.15;
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
  { id: "boarBristle", name: "Boar-Bristle Charm", blurb: "+6% melee damage", rarity: "common", icon: "🐗" },
  { id: "waxCandle", name: "Waxen Candle", blurb: "-6% ability cooldowns", rarity: "common", icon: "🕯️" },
  { id: "cloverSprig", name: "Clover Sprig", blurb: "+4% critical chance", rarity: "common", icon: "🍀" },
  { id: "wayfarerBoots", name: "Wayfarer's Boots", blurb: "+8% move speed", rarity: "common", icon: "🥾" },
  { id: "dentedBuckler", name: "Dented Buckler", blurb: "battles start with a 12 hp ward", rarity: "common", icon: "🛡️" },
  { id: "owlTalon", name: "Owl Talon", blurb: "+4% attack speed, +4% move speed", rarity: "common", icon: "🦉" },
  { id: "alphaFang", name: "Alpha's Fang", blurb: "+8% attack speed, +6% melee damage", rarity: "rare", icon: "🐺" },
  { id: "gorehornShard", name: "Gorehulk Horn Shard", blurb: "+10% melee damage, +30 health", rarity: "rare", icon: "🐮" },
  { id: "witchLocket", name: "Witchlight Locket", blurb: "+10% spell power, -5% cooldowns", rarity: "rare", icon: "🔮" },
  { id: "saintRelic", name: "Saint's Relic", blurb: "+10% healing, battles start with a 20 hp ward", rarity: "rare", icon: "✨" },
  { id: "moonPendant", name: "Moonlit Pendant", blurb: "-8% cooldowns, +6% spell power", rarity: "rare", icon: "🌙" },
  { id: "gravewardenSeal", name: "Gravewarden's Seal", blurb: "+6% armor, battles start with a 25 hp ward", rarity: "rare", icon: "🗿" },
  { id: "marksmanEye", name: "Marksman's Eye", blurb: "+10% ranged damage, +5% critical chance", rarity: "rare", icon: "🎯" },
  { id: "harvestIdol", name: "Harvest Idol", blurb: "+12% healing, +20 health", rarity: "rare", icon: "🌾" },
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
    case "boarBristle": return { ...none, meleeDmg: 0.06 };
    case "waxCandle": return { ...none, cdr: 0.06 };
    case "cloverSprig": return { ...none, crit: 0.04 };
    case "wayfarerBoots": return { ...none, moveSpeed: 0.08 };
    case "dentedBuckler": return { ...none, startShield: 12 };
    case "owlTalon": return { ...none, atkSpeed: 0.04, moveSpeed: 0.04 };
    case "alphaFang": return { ...none, atkSpeed: 0.08, meleeDmg: 0.06 };
    case "gorehornShard": return { ...none, meleeDmg: 0.1 };
    case "witchLocket": return { ...none, spellPower: 0.1, cdr: 0.05 };
    case "saintRelic": return { ...none, healPower: 0.1, startShield: 20 };
    case "moonPendant": return { ...none, cdr: 0.08, spellPower: 0.06 };
    case "gravewardenSeal": return { ...none, armorFlat: 0.06, startShield: 25 };
    case "marksmanEye": return { ...none, rangedDmg: 0.1, crit: 0.05 };
    case "harvestIdol": return { ...none, healPower: 0.12 };
    default: return none;
  }
}

/** Flat bonuses trinkets grant outside the multiplier system. */
export function trinketFlatHp(id: string | null | undefined): number {
  if (id === "oakCharm") return 22;
  if (id === "gorehornShard") return 30;
  if (id === "harvestIdol") return 20;
  return 0;
}

/** Stages whose final wave is a boss — these drop rare trinkets. */
export const BOSS_STAGES = [4, 5];
