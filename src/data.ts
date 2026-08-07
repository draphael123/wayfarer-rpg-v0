import type {
  AbilityDef,
  Attributes,
  AttrKey,
  DerivedStats,
  DisciplineId,
  ElementId,
  EnemyKind,
  EnemyRole,
  HeroSave,
  SaveData,
  StageDef,
  WeaponKind,
} from "./types";
import { LATE_ROAD_STAGES } from "./late-road";
import { LATE_BOSS_PHASES, LATE_ENEMIES } from "./late-content";

export const ATTR_KEYS: AttrKey[] = ["str", "dex", "int", "vit", "spi"];

export const ATTR_NAMES: Record<AttrKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  int: "Intellect",
  vit: "Vitality",
  spi: "Spirit",
};

export const ATTR_BLURBS: Record<AttrKey, string> = {
  str: "Melee damage, weapon force, a little armor and health",
  dex: "Attack speed, ranged damage and move speed",
  int: "Technique power and elemental potency",
  vit: "Health, armor and frontline staying power",
  spi: "Healing strength, wards and support power",
};

export interface HeroDef {
  name: string;
  title: string;
  skin: string;
  hair: string;
  accent: string;
  baseAttrs: Attributes;
  /** Body-shape multipliers so silhouettes differ below the neck too. */
  build: { torso: number; limb: number; head: number };
}

export interface HeroStarterPath {
  discipline: DisciplineId;
  element: ElementId;
  reason: string;
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
    build: { torso: 1.04, limb: 1.05, head: 1 },
  },
  {
    name: "Wren",
    title: "the Fletcher",
    skin: "#d9a06b",
    hair: "#2e2a35",
    accent: "#6d7a64",
    baseAttrs: { str: 2, dex: 7, int: 2, vit: 3, spi: 1 },
    build: { torso: 0.88, limb: 0.85, head: 1 },
  },
  {
    name: "Ezri",
    title: "the Emberwise",
    skin: "#f0c9a0",
    hair: "#a8552f",
    accent: "#6c6880",
    baseAttrs: { str: 1, dex: 2, int: 7, vit: 3, spi: 2 },
    build: { torso: 0.92, limb: 0.88, head: 1 },
  },
  {
    name: "Sol",
    title: "the Lantern",
    skin: "#c98d5e",
    hair: "#e8e2d0",
    accent: "#8f8672",
    baseAttrs: { str: 2, dex: 1, int: 2, vit: 4, spi: 6 },
    build: { torso: 1, limb: 0.9, head: 1.02 },
  },
  // late arrivals — word of the band spreads once the Thornwood ogre falls
  {
    name: "Maren",
    title: "the Tidecaller",
    skin: "#d8a87e",
    hair: "#7ba8b8",
    accent: "#4a7a8c",
    baseAttrs: { str: 1, dex: 2, int: 5, vit: 2, spi: 5 },
    build: { torso: 0.9, limb: 0.85, head: 1 },
  },
  {
    name: "Kellan",
    title: "the Unbroken",
    skin: "#b98a62",
    hair: "#3a3632",
    accent: "#5a5f6e",
    baseAttrs: { str: 4, dex: 1, int: 1, vit: 7, spi: 2 },
    build: { torso: 1.2, limb: 1.3, head: 0.95 },
  },
  // the Winterreach's own: word of them comes when the road runs north
  {
    name: "Sigrid",
    title: "the Shieldmaiden",
    skin: "#e8c098",
    hair: "#d9b06b",
    accent: "#7a8a9c",
    baseAttrs: { str: 5, dex: 1, int: 1, vit: 8, spi: 1 },
    build: { torso: 1.16, limb: 1.12, head: 0.98 },
  },
  {
    name: "Vesna",
    title: "the Winterborn",
    skin: "#f0dcc8",
    hair: "#e8f0f5",
    accent: "#6ea8c9",
    baseAttrs: { str: 1, dex: 6, int: 6, vit: 2, spi: 1 },
    build: { torso: 0.86, limb: 0.92, head: 1.02 },
  },
];

/** Hero indexes gated behind campaign progress: index → first unlockedStage that frees them. */
export const HERO_GATE_STAGE: Record<number, number> = { 4: 2, 5: 2, 6: 6, 7: 8 };

export function heroArrived(save: { unlockedStage: number }, index: number): boolean {
  const gate = HERO_GATE_STAGE[index];
  return gate === undefined || save.unlockedStage >= gate;
}

export const ABILITIES: AbilityDef[] = [
  {
    id: "bellow",
    name: "Bellow",
    gate: { attr: "str", value: 6 },
    targeting: "instant",
    cooldown: 12,
    color: "#e0904b",
    icon: "warcry",
    blurb: "A challenge roared in every direction: nearby foes turn on YOU, and you harden to meet them.",
  },
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
  {
    id: "avalanche",
    name: "Avalanche Slam",
    gate: { attr: "str", value: 16 },
    targeting: "instant",
    cooldown: 16,
    color: "#bcd8e8",
    icon: "avalanche",
    blurb: "Bring the mountain down: everything near you is crushed and chilled.",
  },
  {
    id: "hailknives",
    name: "Hail of Knives",
    gate: { attr: "dex", value: 15 },
    targeting: "ray",
    cooldown: 13,
    color: "#9fd6e8",
    icon: "hailknives",
    blurb: "Drag to fan five frozen knives through everything in their arc.",
  },
  {
    id: "windlash",
    name: "Windlash",
    gate: { attr: "dex", value: 17 },
    targeting: "instant",
    cooldown: 14,
    color: "#c9e8e0",
    icon: "windlash",
    blurb: "A cutting gale scours every foe around you and slows their pursuit.",
  },
  {
    id: "blizzard",
    name: "Blizzard",
    gate: { attr: "int", value: 15 },
    targeting: "point",
    cooldown: 17,
    color: "#8fc7e8",
    icon: "blizzard",
    blurb: "Drag to call a whiteout that chills and rakes everything inside it.",
  },
  {
    id: "icelance",
    name: "Ice Lance",
    gate: { attr: "int", value: 17 },
    targeting: "ray",
    cooldown: 12,
    color: "#b8e0f0",
    icon: "icelance",
    blurb: "Drag to hurl a lance of ice that skewers a line and freezes the first struck.",
  },
  {
    id: "auroraveil",
    name: "Aurora Veil",
    gate: { attr: "spi", value: 15 },
    targeting: "instant",
    cooldown: 18,
    color: "#b0e8c9",
    icon: "auroraveil",
    blurb: "Northern light settles over the band — everyone endures a quarter of all harm.",
  },
  {
    id: "cleansing",
    name: "Cleansing Light",
    gate: { attr: "spi", value: 17 },
    targeting: "instant",
    cooldown: 16,
    color: "#f0f5d8",
    icon: "cleansing",
    blurb: "Mend the whole band and burn away every curse upon them.",
  },
  {
    id: "permafrost",
    name: "Permafrost",
    gate: { attr: "vit", value: 16 },
    targeting: "instant",
    cooldown: 18,
    color: "#a8c9d8",
    icon: "permafrost",
    blurb: "Ground yourself in old ice: a shield for you, frost at your feet for them.",
  },
];

// Battleheart pacing: every cast is a decision. Cooldowns stretched across the
// board — the battle side compensates by making each cast land harder.
// The original free-form spellbook remains readable by old saves, replays and
// the early road tutorial.  New path menus deliberately hide it: sworn paths
// bring their own two skills, so equipment never becomes a wall of unrelated
// actives again.
for (const a of ABILITIES) {
  a.cooldown = Math.round(a.cooldown * 2.5);
  a.retired = true;
}

/** Every companion knows two personal road techniques before choosing a Path. */
export const HERO_STARTER_ABILITIES: readonly (readonly [string, string])[] = [
  ["cleave", "bellow"],
  ["pierce", "twinshot"],
  ["fireball", "missiles"],
  ["mend", "blessing"],
  ["frostwake", "mend"],
  ["shieldslam", "secondwind"],
  ["bellow", "shieldslam"],
  ["hailknives", "frostwake"],
];

/** Each companion has a believable direction they may grow toward. These are
 * Path recommendations, not starting classes: every recruit remains unsworn
 * and has no ultimate until the player chooses a Discipline and Attunement. */
export const HERO_STARTER_PATHS: readonly HeroStarterPath[] = [
  { discipline: "knight", element: "earth", reason: "Bram's oath was forged by holding ground others had abandoned." },
  { discipline: "archer", element: "storm", reason: "Wren reads crosswinds and changes lanes before the enemy can close." },
  { discipline: "mage", element: "flame", reason: "Ezri learned to shape dangerous heat instead of merely surviving it." },
  { discipline: "priest", element: "radiant", reason: "Sol turns the last lantern toward whoever needs it most." },
  { discipline: "necromancer", element: "storm", reason: "Maren calls the drowned as swift spirit-lightning, never as permanent pets." },
  { discipline: "warrior", element: "earth", reason: "Kellan meets every impact with a heavier answer and refuses interruption." },
  { discipline: "knight", element: "frost", reason: "Sigrid makes a shieldwall as still and punishing as Winterreach ice." },
  { discipline: "rogue", element: "frost", reason: "Vesna crosses frozen openings and shatters the weakness she creates." },
] as const;

export function abilityById(id: string): AbilityDef | undefined {
  return ABILITIES.find((a) => a.id === id);
}

/** Gold cost to recruit each hero at the tavern (by hero index). Bram and Sol are free founders. */
export const RECRUIT_COST: Record<number, number> = { 1: 120, 2: 300, 4: 420, 5: 420, 6: 650, 7: 850 };

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

// --- armor: named pieces with identities, not a quality ladder ---

export type ArmorFamily = "cloth" | "leather" | "mail" | "plate";

/** Family drives the sprite (0 = bare, 1 = leather pauldrons, 2 = chain, 3 = plate). */
export const ARMOR_FAMILY_TIER: Record<ArmorFamily, number> = { cloth: 0, leather: 1, mail: 2, plate: 3 };

export type ArmorSlot = "body" | "helm" | "boots";

export interface ArmorDef {
  id: string;
  name: string;
  family: ArmorFamily;
  cost: number; // 0 = not sold (boss unique or starter)
  blurb: string;
  icon: string; // ico() name
  slot?: ArmorSlot; // omitted = body (the piece that carries family identity and passive hook)
  tint?: string; // metal/cloth accent on the sprite (mail/plate families)
  hook?: "dodgeFirstHit" | "burnOnSpell" | "allyAura" | "waveShield" | "regen" | "retaliate" | "slowProof";
  active?: AbilityDef; // reserved for exceptional legendary pieces; ordinary armor is passive-only
  boss?: EnemyKind; // first kill of this boss awards it
  mods: Partial<{ hpFlat: number; armorFlat: number; moveSpeed: number; atkSpeed: number; spellPower: number; healPower: number; rangedDmg: number; meleeDmg: number; cdr: number; crit: number }>;
}

export function slotOf(piece: ArmorDef): ArmorSlot {
  return piece.slot ?? "body";
}

export const ARMORS: ArmorDef[] = [
  // cloth — for those who trust distance
  { id: "pilgrimRobe", name: "Pilgrim's Robe", family: "cloth", cost: 140, icon: "plus", blurb: "+18% healing, +8% spell power.", mods: { healPower: 0.18, spellPower: 0.08 } },
  { id: "emberweave", name: "Emberweave Robe", family: "cloth", cost: 280, icon: "spark", blurb: "+12% spell power, and your damaging spells leave a burn.", hook: "burnOnSpell", mods: { spellPower: 0.12 } },
  { id: "windcloak", name: "Windrunner's Cloak", family: "cloth", cost: 240, icon: "arrow", blurb: "+12% move speed, −6% cooldowns.", mods: { moveSpeed: 0.12, cdr: 0.06 } },
  // leather — quick and clever
  { id: "scoutJerkin", name: "Scout's Jerkin", family: "leather", cost: 110, icon: "bow", blurb: "+18 health, +6% move speed.", mods: { hpFlat: 18, moveSpeed: 0.06 } },
  { id: "huntsmanHarness", name: "Huntsman's Harness", family: "leather", cost: 280, icon: "bow", blurb: "+12% ranged damage.", mods: { rangedDmg: 0.12, hpFlat: 10 } },
  { id: "skirmisherHarness", name: "Skirmisher Harness", family: "leather", cost: 320, icon: "arrow", blurb: "+10% move and +8% attack speed.", mods: { moveSpeed: 0.1, atkSpeed: 0.08 } },
  { id: "wolfpelt", name: "Wolfpelt Cloak", family: "leather", cost: 360, icon: "moon", blurb: "Shrug off the first hit of every wave. +5% move.", hook: "dodgeFirstHit", mods: { moveSpeed: 0.05 } },
  // mail — the middle road
  { id: "footmanMail", name: "Footman's Mail", family: "mail", cost: 190, icon: "shield", blurb: "+10% armor, +25 health.", mods: { armorFlat: 0.1, hpFlat: 25 } },
  { id: "wardenHauberk", name: "Warden's Hauberk", family: "mail", cost: 340, icon: "banner", blurb: "+8% armor, and nearby allies take 6% less harm.", hook: "allyAura", mods: { armorFlat: 0.08, hpFlat: 15 } },
  { id: "runeweaveVestment", name: "Runeweave Vestment", family: "mail", cost: 380, icon: "spark", tint: "#9a8ac9", blurb: "+10% spell power, +10% healing, +20 health.", mods: { spellPower: 0.1, healPower: 0.1, hpFlat: 20 } },
  // plate — for those who plant their feet
  { id: "ironholdPlate", name: "Ironhold Plate", family: "plate", cost: 420, icon: "shield", tint: "#aab4c2", blurb: "+16% armor, +45 health — but 8% slower.", mods: { armorFlat: 0.16, hpFlat: 45, moveSpeed: -0.08 } },
  { id: "bulwarkPlate", name: "Bulwark Plate", family: "plate", cost: 460, icon: "shield", tint: "#8a99b8", blurb: "+12% armor, +35 health, and every wave begins with a 30-point shield.", hook: "waveShield", mods: { armorFlat: 0.12, hpFlat: 35 } },
  { id: "juggernautPlate", name: "Juggernaut Plate", family: "plate", cost: 500, icon: "shield", tint: "#b8a68a", blurb: "+14% armor, +60 health — but 10% slower.", mods: { armorFlat: 0.14, hpFlat: 60, moveSpeed: -0.1 } },
  // winter stock — the north demands better dress
  { id: "frostweaveRobe", name: "Frostweave Robe", family: "cloth", cost: 380, icon: "spark", blurb: "+14% spell power, −4% cooldowns — woven on glacier looms.", mods: { spellPower: 0.14, cdr: 0.04 } },
  { id: "emberlined", name: "Ember-Lined Cloak", family: "cloth", cost: 340, icon: "moon", blurb: "+20 health, and chill cannot take hold of you.", hook: "slowProof", mods: { hpFlat: 20 } },
  { id: "aurorasMantle", name: "Aurora's Mantle", family: "cloth", cost: 420, icon: "plus", blurb: "+20% healing, and nearby allies take 6% less harm.", hook: "allyAura", mods: { healPower: 0.2 } },
  { id: "sleetrunners", name: "Sleetrunner's Leathers", family: "leather", cost: 380, icon: "arrow", blurb: "+14% move, +5% attack speed — made for running on ice.", mods: { moveSpeed: 0.14, atkSpeed: 0.05 } },
  { id: "wyrmscaleMail", name: "Wyrmscale Mail", family: "mail", cost: 440, icon: "shield", tint: "#7ba8b8", blurb: "+12% armor, +6% spell power — scales that remember cold fire.", mods: { armorFlat: 0.12, spellPower: 0.06, hpFlat: 20 } },
  { id: "glacierPlate", name: "Glacier Plate", family: "plate", cost: 560, icon: "shield", tint: "#a8ccd8", blurb: "+15% armor, +55 health, and every wave begins with a 30-point shield.", hook: "waveShield", mods: { armorFlat: 0.15, hpFlat: 55 } },
  // boss relics — a first kill yields them, and no shop ever will
  { id: "mosstoothHide", name: "Mosstooth's Hide", family: "leather", cost: 0, icon: "skull", boss: "ogre", blurb: "+50 health, and wounds slowly knit themselves closed.", hook: "regen", mods: { hpFlat: 50 } },
  { id: "alphasPelt", name: "The Alpha's Pelt", family: "leather", cost: 0, icon: "moon", boss: "alpha", blurb: "+14% move, and the first blow of every wave misses you.", hook: "dodgeFirstHit", mods: { moveSpeed: 0.14, hpFlat: 15 } },
  { id: "gorehulkWall", name: "Gorehulk's Wall", family: "plate", cost: 0, icon: "skull", tint: "#8a5a4a", boss: "warlord", blurb: "+18% armor, +40 health, and melee blows are answered in kind.", hook: "retaliate", mods: { armorFlat: 0.18, hpFlat: 40 } },
  { id: "rimeheartsCore", name: "The Wyrm's Heart", family: "plate", cost: 0, icon: "skull", tint: "#a8d8ec", boss: "wyrm", blurb: "+16% armor, +50 health, chill cannot take hold, and wounds slowly knit closed.", hook: "regen", mods: { armorFlat: 0.16, hpFlat: 50 } },
];

// --- helms & boots: smaller pieces that tune stats and complete a family set ---

export const HELMS: ArmorDef[] = [
  { id: "sageCirclet", name: "Sage's Circlet", family: "cloth", slot: "helm", cost: 120, icon: "spark", blurb: "+6% spell power, −2% cooldowns.", mods: { spellPower: 0.06, cdr: 0.02 } },
  { id: "pilgrimCowl", name: "Pilgrim's Cowl", family: "cloth", slot: "helm", cost: 110, icon: "plus", blurb: "+8% healing.", mods: { healPower: 0.08 } },
  { id: "huntersHood", name: "Hunter's Hood", family: "leather", slot: "helm", cost: 130, icon: "bow", blurb: "+6% ranged damage, +2% move.", mods: { rangedDmg: 0.06, moveSpeed: 0.02 } },
  { id: "trackersCap", name: "Tracker's Cap", family: "leather", slot: "helm", cost: 100, icon: "moon", blurb: "+10 health, +4% move.", mods: { hpFlat: 10, moveSpeed: 0.04 } },
  { id: "steelCoif", name: "Steel Coif", family: "mail", slot: "helm", cost: 150, icon: "shield", blurb: "+15 health, +3% armor.", mods: { hpFlat: 15, armorFlat: 0.03 } },
  { id: "wardensVisor", name: "Warden's Visor", family: "mail", slot: "helm", cost: 180, icon: "banner", blurb: "+5% armor.", mods: { armorFlat: 0.05 } },
  { id: "greathelm", name: "Greathelm", family: "plate", slot: "helm", cost: 220, icon: "shield", tint: "#aab4c2", blurb: "+6% armor, +15 health — but 2% slower.", mods: { armorFlat: 0.06, hpFlat: 15, moveSpeed: -0.02 } },
  { id: "wingedHelm", name: "Winged Helm", family: "plate", slot: "helm", cost: 260, icon: "sword", tint: "#b8a68a", blurb: "+4% armor, +5% melee damage.", mods: { armorFlat: 0.04, meleeDmg: 0.05 } },
];

export const BOOTS: ArmorDef[] = [
  { id: "driftSandals", name: "Drift Sandals", family: "cloth", slot: "boots", cost: 100, icon: "arrow", blurb: "+6% move, −2% cooldowns.", mods: { moveSpeed: 0.06, cdr: 0.02 } },
  { id: "quietSlippers", name: "Quiet Slippers", family: "cloth", slot: "boots", cost: 90, icon: "moon", blurb: "+4% move, +4% spell power.", mods: { moveSpeed: 0.04, spellPower: 0.04 } },
  { id: "roadstriders", name: "Roadstriders", family: "leather", slot: "boots", cost: 120, icon: "arrow", blurb: "+8% move speed.", mods: { moveSpeed: 0.08 } },
  { id: "springheels", name: "Springheel Boots", family: "leather", slot: "boots", cost: 150, icon: "bow", blurb: "+5% move, +4% attack speed.", mods: { moveSpeed: 0.05, atkSpeed: 0.04 } },
  { id: "marchGreaves", name: "March Greaves", family: "mail", slot: "boots", cost: 140, icon: "shield", blurb: "+12 health, +3% armor.", mods: { hpFlat: 12, armorFlat: 0.03 } },
  { id: "anchorSabatons", name: "Anchor Sabatons", family: "mail", slot: "boots", cost: 170, icon: "banner", blurb: "+5% armor — planted like a pier post.", mods: { armorFlat: 0.05 } },
  { id: "bulwarkGreaves", name: "Bulwark Greaves", family: "plate", slot: "boots", cost: 200, icon: "shield", tint: "#8a99b8", blurb: "+5% armor, +12 health — but 3% slower.", mods: { armorFlat: 0.05, hpFlat: 12, moveSpeed: -0.03 } },
  { id: "earthshakers", name: "Earthshaker Greaves", family: "plate", slot: "boots", cost: 240, icon: "sword", tint: "#b8a68a", blurb: "+4% armor, +4% melee damage.", mods: { armorFlat: 0.04, meleeDmg: 0.04 } },
];

/** Every wearable piece in the realm, all three slots. */
export const ALL_GEAR: ArmorDef[] = [...ARMORS, ...HELMS, ...BOOTS];

export function armorById(id: string | null | undefined): ArmorDef | null {
  return ALL_GEAR.find((a) => a.id === id) ?? null;
}

// --- the forge: upgrades bind to a piece and scale everything it gives ---

export const FORGE_MAX = 3;

/** How much stronger a piece's mods are at this forge level. */
export function forgeScale(level: number): number {
  return 1 + 0.25 * Math.max(0, Math.min(FORGE_MAX, level));
}

/** Gold to raise a piece TO the given level (relics forge from a 420g base). */
export function forgeCost(piece: ArmorDef, toLevel: number): number {
  const base = piece.cost > 0 ? piece.cost : 420;
  return Math.round((base * [0.5, 0.8, 1.2][toLevel - 1]) / 10) * 10;
}

/** A piece's display name with its forge mark. */
export function pieceLabel(piece: ArmorDef, forge: Record<string, number> | undefined): string {
  const lvl = forge?.[piece.id] ?? 0;
  return lvl > 0 ? `${piece.name} +${lvl}` : piece.name;
}

// --- family sets: dress a hero head to toe in one family and it answers ---

export interface SetBonusDef {
  two: string; // menu text for the 2-piece bonus
  three: string; // menu text for the 3-piece bonus
  hook3?: "allyAura" | "waveShield"; // battle-side hook granted at 3 pieces
}

export const SET_BONUSES: Record<ArmorFamily, SetBonusDef> = {
  cloth: { two: "−8% cooldowns", three: "+10% spell power, +10% healing" },
  leather: { two: "+8% move speed", three: "+8% attack speed, +5% crit" },
  mail: { two: "+20 health, +4% armor", three: "nearby allies take 6% less harm", hook3: "allyAura" },
  plate: { two: "+8% armor", three: "every wave begins with a 30-point shield", hook3: "waveShield" },
};

/** What this hero is wearing, resolved for stat math. */
export interface GearWorn {
  body: string | null;
  helm: string | null;
  boots: string | null;
  forge?: Record<string, number>;
}

export function heroGearOf(hero: Pick<HeroSave, "armor" | "helm" | "boots">, forge?: Record<string, number>): GearWorn {
  return { body: hero.armor, helm: hero.helm ?? null, boots: hero.boots ?? null, forge };
}

/** The family worn 2+ times across the three slots (at most one can qualify). */
export function armorSetOf(gear: GearWorn): { family: ArmorFamily; tier: 2 | 3 } | null {
  const counts: Partial<Record<ArmorFamily, number>> = {};
  for (const id of [gear.body, gear.helm, gear.boots]) {
    const piece = armorById(id);
    if (piece) counts[piece.family] = (counts[piece.family] ?? 0) + 1;
  }
  for (const family of Object.keys(counts) as ArmorFamily[]) {
    const n = counts[family] ?? 0;
    if (n >= 2) return { family, tier: n >= 3 ? 3 : 2 };
  }
  return null;
}

function normalizeGear(gear: GearWorn | string | null | undefined): GearWorn {
  if (gear && typeof gear === "object") return gear;
  return { body: gear ?? null, helm: null, boots: null };
}

function gearMods(input: GearWorn | string | null | undefined) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, hpFlat: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  const gear = normalizeGear(input);
  for (const id of [gear.body, gear.helm, gear.boots]) {
    const piece = armorById(id);
    if (!piece) continue;
    const s = forgeScale(gear.forge?.[piece.id] ?? 0);
    m.meleeDmg += (piece.mods.meleeDmg ?? 0) * s;
    m.rangedDmg += (piece.mods.rangedDmg ?? 0) * s;
    m.hpFlat += (piece.mods.hpFlat ?? 0) * s;
    m.armorFlat += (piece.mods.armorFlat ?? 0) * s;
    m.cdr += (piece.mods.cdr ?? 0) * s;
    m.atkSpeed += (piece.mods.atkSpeed ?? 0) * s;
    m.moveSpeed += (piece.mods.moveSpeed ?? 0) * s;
    m.crit += (piece.mods.crit ?? 0) * s;
    m.spellPower += (piece.mods.spellPower ?? 0) * s;
    m.healPower += (piece.mods.healPower ?? 0) * s;
  }
  const set = armorSetOf(gear);
  if (set) {
    if (set.family === "cloth") m.cdr += 0.08;
    if (set.family === "leather") m.moveSpeed += 0.08;
    if (set.family === "mail") {
      m.hpFlat += 20;
      m.armorFlat += 0.04;
    }
    if (set.family === "plate") m.armorFlat += 0.08;
    if (set.tier >= 3) {
      if (set.family === "cloth") {
        m.spellPower += 0.1;
        m.healPower += 0.1;
      }
      if (set.family === "leather") {
        m.atkSpeed += 0.08;
        m.crit += 0.05;
      }
    }
  }
  return m;
}

// --- retired family actives, kept only for compatibility with older content ids ---

export const ARMOR_ACTIVES: Record<ArmorFamily, AbilityDef> = {
  cloth: {
    id: "armorSurge",
    name: "Surge",
    gate: { attr: "int", value: 0 },
    targeting: "instant",
    cooldown: 30,
    color: "#b48ae8",
    icon: "chainspark",
    blurb: "Cloth skill: a rush of focus shaves seconds off this hero's cooldowns.",
  },
  leather: {
    id: "armorTumble",
    name: "Tumble",
    gate: { attr: "dex", value: 0 },
    targeting: "instant",
    cooldown: 24,
    color: "#8ed081",
    icon: "rush",
    blurb: "Leather skill: roll clear — shed the foes' attention and sprint briefly.",
  },
  mail: {
    id: "armorRally",
    name: "Rally",
    gate: { attr: "vit", value: 0 },
    targeting: "instant",
    cooldown: 32,
    color: "#9fd4e8",
    icon: "secondwind",
    blurb: "Mail skill: a steadying shout mends this hero and allies close by.",
  },
  plate: {
    id: "armorBrace",
    name: "Brace",
    gate: { attr: "vit", value: 0 },
    targeting: "instant",
    cooldown: 28,
    color: "#c9d2dd",
    icon: "stoneskin",
    blurb: "Plate skill: plant your feet — take greatly reduced harm for a few seconds.",
  },
};

/** Gold cost of each ability in the spell shop. */
export const SPELL_COSTS: Record<string, number> = {
  bellow: 60,
  avalanche: 340,
  hailknives: 300,
  windlash: 340,
  blizzard: 320,
  icelance: 340,
  auroraveil: 320,
  cleansing: 360,
  permafrost: 320,
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

export function unlockedAbilities(
  attrs: Attributes,
  discipline?: DisciplineId | null,
  element?: ElementId | null,
): AbilityDef[] {
  const general = ABILITIES.filter((ability) => !ability.retired && !ability.pathSkill && attrs[ability.gate.attr] >= ability.gate.value);
  return discipline && element ? [...general, ...pathAbilities(discipline, element)] : general;
}

/**
 * Before a path is chosen, the weapon follows the hero's strongest aptitude.
 * Once sworn, the discipline owns the silhouette regardless of later respecs.
 */
export function dominantWeapon(attrs: Attributes, calling?: string | null): WeaponKind {
  const discipline = callingById(calling)?.discipline;
  if (discipline === "knight" || discipline === "rogue") return "sword";
  if (discipline === "warrior") return "greatsword";
  if (discipline === "archer") return "bow";
  if (discipline === "priest") return "stave";
  if (discipline === "necromancer") return "tome";
  if (discipline === "mage") return "staff";
  if (attrs.spi > attrs.str && attrs.spi > attrs.dex && attrs.spi > attrs.int) return "stave";
  if (attrs.int > attrs.str && attrs.int >= attrs.dex) return "staff";
  if (attrs.dex > attrs.str) return "bow";
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
  rhythm?: string; // the repeated decision this branch asks the player to make
  payoff?: string; // what clean execution earns
  tradeoff?: string; // what the sibling branch does better
}

export interface CallingDef {
  id: string;
  discipline: DisciplineId;
  element: ElementId;
  name: string;
  epithet: string; // shown under the hero's name once sworn
  crest: string; // ico() name for menu chrome
  color: string;
  entry: { attr: AttrKey; value: number }[];
  passive: string; // menu description of the always-on perk
  abilityIds: readonly [string, string]; // default Discipline technique + first elemental choice
  signature: AbilityDef; // charge-based ultimate, exclusive to the calling
  chargeHint: string; // how the ultimate meter fills
  family: string; // picker grouping (Iron, Blade, Hunt, Elemental, Faith & Shadow, Song & Craft)
  advanced?: [AdvCallingDef, AdvCallingDef]; // level-20 branch choice (the founding ten)
}

export interface DisciplineDef {
  id: DisciplineId;
  name: string;
  epithet: string;
  weapon: WeaponKind;
  crest: string;
  color: string;
  passive: string;
  chargeHint: string;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  adjective: string;
  color: string;
  icon: string;
  passive: string;
}

export const DISCIPLINE_IDS: readonly DisciplineId[] = ["knight", "warrior", "rogue", "archer", "priest", "mage", "necromancer"];
export const ELEMENT_IDS: readonly ElementId[] = ["flame", "frost", "storm", "earth", "venom", "radiant", "blood", "shadow"];

export const DISCIPLINES: readonly DisciplineDef[] = [
  { id: "knight", name: "Knight", epithet: "Hold the line", weapon: "sword", crest: "shield", color: "#d59a4b", passive: "+10% health and +4% armor.", chargeHint: "Charges by taking damage and guarding allies" },
  { id: "warrior", name: "Warrior", epithet: "Commit to the blow", weapon: "greatsword", crest: "sword", color: "#c56f46", passive: "+12% melee damage and heavy attacks build Fury for Path techniques.", chargeHint: "Charges through heavy hits, stagger, and finishing enemies" },
  { id: "rogue", name: "Rogue", epithet: "Choose the opening", weapon: "sword", crest: "sword", color: "#b86a8f", passive: "+8% move speed and +5% critical chance.", chargeHint: "Charges by dealing damage and striking vulnerable foes" },
  { id: "archer", name: "Archer", epithet: "Own the distance", weapon: "bow", crest: "bow", color: "#7fa65b", passive: "+8% ranged damage and +6% move speed.", chargeHint: "Charges by dealing ranged damage" },
  { id: "priest", name: "Priest", epithet: "Keep the band standing", weapon: "stave", crest: "sun", color: "#d7c77a", passive: "+10% healing and a small starting shield.", chargeHint: "Charges by healing and protecting allies" },
  { id: "mage", name: "Mage", epithet: "Rewrite the field", weapon: "staff", crest: "spark", color: "#8f78cf", passive: "+10% spell power and 5% faster cooldowns.", chargeHint: "Charges by dealing spell damage" },
  { id: "necromancer", name: "Necromancer", epithet: "Make death answer", weapon: "tome", crest: "ghost", color: "#8773a6", passive: "Enemy deaths leave Remains that strengthen summons and curses.", chargeHint: "Charges when enemies die or spectral servants deal damage" },
];

export const ELEMENTS: readonly ElementDef[] = [
  { id: "flame", name: "Flame", adjective: "Ember", color: "#e6653f", icon: "flame", passive: "Hits scorch: +5% damage against wounded foes." },
  { id: "frost", name: "Frost", adjective: "Rime", color: "#78b9db", icon: "snow", passive: "Cold resolve grants +3% armor and steadier cooldowns." },
  { id: "storm", name: "Storm", adjective: "Gale", color: "#72cddd", icon: "bolt", passive: "Momentum grants +5% attack speed and quicker cooldowns." },
  { id: "earth", name: "Earth", adjective: "Stone", color: "#a58a5a", icon: "mountain", passive: "Stonecraft grants +8% health and +2% armor." },
  { id: "venom", name: "Venom", adjective: "Viper", color: "#79b84e", icon: "flask", passive: "Patient strikes gain +4% critical chance." },
  { id: "radiant", name: "Radiant", adjective: "Dawn", color: "#edcf69", icon: "sun", passive: "Light grants +6% healing and an opening ward." },
  { id: "blood", name: "Blood", adjective: "Crimson", color: "#c94a4a", icon: "drop", passive: "Blood price grants +6% melee damage and +4% health." },
  { id: "shadow", name: "Shadow", adjective: "Gloam", color: "#7669a9", icon: "ghost", passive: "Gloam grants +6% move speed and faster cooldowns." },
];

export function disciplineById(id: string | null | undefined): DisciplineDef | undefined {
  return DISCIPLINES.find((discipline) => discipline.id === id);
}

export function elementById(id: string | null | undefined): ElementDef | undefined {
  return ELEMENTS.find((element) => element.id === id);
}

export function pathId(discipline: DisciplineId, element: ElementId): string {
  return `${discipline}-${element}`;
}

/** The band's public face: its most seasoned member. */
export function bandLevel(save: { heroes: { recruited: boolean; level: number }[] }): number {
  return Math.max(1, ...save.heroes.filter((h) => h.recruited).map((h) => h.level));
}

export const CALLING_UNLOCK_LEVEL = 5;
export const CALLING_SWITCH_COST = 150;
export const ADV_CALLING_LEVEL = 20;
export const ADV_SWITCH_COST = 300;
export const CALLING_MASTERY_LEVELS = 10;

type LegacyCallingDef = Omit<CallingDef, "discipline" | "element" | "abilityIds">;

const sig = (id: string, name: string, targeting: AbilityDef["targeting"], cooldown: number, color: string, blurb: string): AbilityDef => ({
  id,
  name,
  gate: { attr: "str", value: 0 }, // callings gate by oath, not stats
  targeting,
  cooldown,
  color,
  icon: id,
  blurb,
  retired: true,
});

export const LEGACY_CALLINGS: LegacyCallingDef[] = [
  {
    id: "vanguard",
    family: "Iron",
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
    family: "Blade",
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
    family: "Hunt",
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
    family: "Elemental",
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
    family: "Faith & Shadow",
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
    family: "Hunt",
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
  {
    id: "duelist",
    family: "Blade",
    name: "Duelist",
    epithet: "the Measured Blade",
    crest: "sword",
    color: "#e8b45a",
    entry: [
      { attr: "str", value: 6 },
      { attr: "dex", value: 6 },
    ],
    passive: "+8% attack speed, and melee blows against you are answered with a riposte.",
    chargeHint: "Charges from damage dealt",
    signature: sig("duel", "Perfect Duel", "instant", 12, "#ffd27d", "Ultimate: dash to the nearest foe and deliver six blinding strikes."),
    advanced: [
      {
        id: "swordsaint",
        name: "Swordsaint",
        epithet: "the Drawn Line",
        passive: "+10% critical chance.",
        ultNote: "The Perfect Duel strikes eight times instead of six.",
      },
      {
        id: "corsair",
        name: "Corsair",
        epithet: "the Laughing Edge",
        passive: "+8% move and another +6% attack speed.",
        ultNote: "Your riposte bites twice as hard.",
      },
    ],
  },
  {
    id: "warden",
    family: "Iron",
    name: "Warden",
    epithet: "the Standing Stone",
    crest: "banner",
    color: "#8fd0a8",
    entry: [
      { attr: "vit", value: 7 },
      { attr: "spi", value: 5 },
    ],
    passive: "+12% health, and allies beside you take 8% less harm.",
    chargeHint: "Charges from damage taken and healing done",
    signature: sig("aegis", "Aegis of the Wall", "instant", 13, "#bff0cf", "Ultimate: shield the whole band and dare every foe to test you instead."),
    advanced: [
      {
        id: "oathkeeper",
        name: "Oathkeeper",
        epithet: "the Unbroken Ring",
        passive: "Your shelter reaches further and shields another 4%.",
        ultNote: "The Aegis shields are half again as strong.",
      },
      {
        id: "thornwarden",
        name: "Thornwarden",
        epithet: "the Answering Wall",
        passive: "Melee blows against you are answered with thorns.",
        ultNote: "Foes taunted by the Aegis bleed while they swing at you.",
      },
    ],
  },
  {
    id: "spellblade",
    family: "Elemental",
    name: "Spellblade",
    epithet: "the Lit Edge",
    crest: "spark",
    color: "#c98fe8",
    entry: [
      { attr: "int", value: 6 },
      { attr: "str", value: 6 },
    ],
    passive: "+8% spell power, and every melee hit hastens your cooldowns.",
    chargeHint: "Charges from damage dealt",
    signature: sig("nova", "Runedge Nova", "instant", 12, "#dcb0f5", "Ultimate: detonate the rune-charge in your blade, scorching everything around you."),
    advanced: [
      {
        id: "runeknight",
        name: "Runeknight",
        epithet: "the Written Steel",
        passive: "+8% more spell power and +10% health.",
        ultNote: "The Nova leaves a burn on everything it touches.",
      },
      {
        id: "stormedge",
        name: "Stormedge",
        epithet: "the Sky's Temper",
        passive: "+8% attack speed.",
        ultNote: "The Nova hurls lightning to the three nearest foes beyond its ring.",
      },
    ],
  },
  {
    id: "nightblade",
    family: "Blade",
    name: "Nightblade",
    epithet: "the Unseen Hour",
    crest: "moon",
    color: "#8a7fd8",
    entry: [
      { attr: "dex", value: 7 },
      { attr: "int", value: 5 },
    ],
    passive: "+8% move, and every kill grants a burst of speed and shakes pursuers.",
    chargeHint: "Charges fast from kills",
    signature: sig("shadows", "Thousand Shadows", "instant", 14, "#b0a5f0", "Ultimate: step through the dark and cut every foe on the field once."),
    advanced: [
      {
        id: "phantom",
        name: "Phantom",
        epithet: "the Cold Breath",
        passive: "Another +8% move, and the first blow of every wave misses you.",
        ultNote: "Foes cut by the Shadows are slowed, bleeding dark.",
      },
      {
        id: "reaper",
        name: "Reaper",
        epithet: "the Kept Promise",
        passive: "Your blows execute foes below a fifth of their strength.",
        ultNote: "The Shadows strike twice against wounded foes.",
      },
    ],
  },
  // ---- the widened pool: families of the level-5 choice ----
  {
    id: "pyromancer", name: "Pyromancer", epithet: "the Burning Hand", crest: "flame", color: "#ff7a45",
    family: "Elemental", entry: [{ attr: "int", value: 8 }],
    passive: "+10% spell power, and your damaging spells set foes ablaze.",
    chargeHint: "Charges from spell damage",
    signature: sig("cataclysm", "Cataclysm", "point", 14, "#ff7a45", "Ultimate: a rain of embers hammers the ground, burning everything it touches."),
  },
  {
    id: "cryomancer", name: "Cryomancer", epithet: "the Still Air", crest: "snow", color: "#7cc7e8",
    family: "Elemental", entry: [{ attr: "int", value: 8 }],
    passive: "+6% spell power, and your damaging spells chill.",
    chargeHint: "Charges from spell damage",
    signature: sig("deepfreeze", "Deep Freeze", "instant", 14, "#7cc7e8", "Ultimate: the air snaps still — every nearby foe freezes solid."),
  },
  {
    id: "tempest", name: "Stormweaver", epithet: "the Sky's Temper", crest: "bolt", color: "#8fb8ff",
    family: "Elemental", entry: [{ attr: "int", value: 6 }, { attr: "dex", value: 6 }],
    passive: "Every 4th attack forks lightning to a second foe.",
    chargeHint: "Charges from damage you deal",
    signature: sig("stormburst", "Stormburst", "instant", 14, "#8fb8ff", "Ultimate: chain lightning leaps through up to six foes and rattles them senseless."),
  },
  {
    id: "geomancer", name: "Geomancer", epithet: "the Standing Stone", crest: "mountain", color: "#c0a878",
    family: "Elemental", entry: [{ attr: "int", value: 6 }, { attr: "vit", value: 6 }],
    passive: "+4% armor, and allies at your side share the stone's patience.",
    chargeHint: "Charges from damage you take",
    signature: sig("stoneward", "Stoneward", "instant", 14, "#c0a878", "Ultimate: stone rises to ward the whole band and slow everything that presses in."),
  },
  {
    id: "exorcist", name: "Exorcist", epithet: "the Lantern at Dusk", crest: "sun", color: "#f2d16b",
    family: "Faith & Shadow", entry: [{ attr: "spi", value: 6 }, { attr: "int", value: 6 }],
    passive: "+15% damage against beasts and the risen dead.",
    chargeHint: "Charges from damage you deal",
    signature: sig("banishment", "Banishment", "instant", 14, "#f2d16b", "Ultimate: a burst of consecrated light scours everything near you."),
  },
  {
    id: "bloodknight", name: "Blood Knight", epithet: "the Red Chalice", crest: "drop", color: "#c04858",
    family: "Iron", entry: [{ attr: "str", value: 6 }, { attr: "vit", value: 6 }],
    passive: "Melee blows feed you: heal 8% of the damage you deal.",
    chargeHint: "Charges from damage you deal",
    signature: sig("crimsonpact", "Crimson Pact", "instant", 14, "#c04858", "Ultimate: drink the life of every foe around you."),
  },
  {
    id: "seer", name: "Seer", epithet: "Who Sees the Thread", crest: "moon", color: "#b8a8e8",
    family: "Faith & Shadow", entry: [{ attr: "spi", value: 8 }],
    passive: "Once each wave, foresight halves the first heavy blow an ally would take.",
    chargeHint: "Charges from healing you give",
    signature: sig("fateweave", "Fateweave", "instant", 14, "#b8a8e8", "Ultimate: the band steps outside fate — each hero shrugs off the next hit and quickens."),
  },
  {
    id: "lancer", name: "Lancer", epithet: "the First Blood", crest: "spear", color: "#d8a048",
    family: "Blade", entry: [{ attr: "str", value: 6 }, { attr: "dex", value: 6 }],
    passive: "First blood: +30% damage the first time you strike each foe.",
    chargeHint: "Charges from damage you deal",
    signature: sig("impale", "Impale", "ray", 14, "#d8a048", "Ultimate: a thunderous charge down the line, skewering everything in your path."),
  },
  {
    id: "monk", name: "Monk", epithet: "the Open Palm", crest: "fist", color: "#e8b878",
    family: "Blade", entry: [{ attr: "dex", value: 6 }, { attr: "vit", value: 6 }],
    passive: "Every 3rd strike staggers — small foes reel, bosses feel it in the stagger bar.",
    chargeHint: "Charges from damage you deal",
    signature: sig("hundredfists", "Hundred Fists", "instant", 14, "#e8b878", "Ultimate: a blur of fists — five blows land in a single breath."),
  },
  {
    id: "necromancer", name: "Necromancer", epithet: "the Quiet Shepherd", crest: "ghost", color: "#9a88b8",
    family: "Faith & Shadow", entry: [{ attr: "int", value: 6 }, { attr: "spi", value: 6 }],
    passive: "Death feeds you: every fall on the field charges your ultimate.",
    chargeHint: "Charges from any death nearby",
    signature: sig("gravecall", "Gravecall", "instant", 14, "#9a88b8", "Ultimate: every corpse on the field bursts with pale fire."),
  },
  {
    id: "bard", name: "Bard", epithet: "of the Long Song", crest: "harp", color: "#e8c8a0",
    family: "Song & Craft", entry: [{ attr: "spi", value: 6 }, { attr: "dex", value: 6 }],
    passive: "Your song quickens allies near you: +6% attack speed.",
    chargeHint: "Charges from healing and from allies' kills",
    signature: sig("battlehymn", "Battle Hymn", "instant", 14, "#e8c8a0", "Ultimate: a soaring hymn — the whole band surges with speed and heart."),
  },
  {
    id: "alchemist", name: "Alchemist", epithet: "the Bitter Cure", crest: "flask", color: "#9ad06a",
    family: "Song & Craft", entry: [{ attr: "int", value: 6 }, { attr: "dex", value: 6 }],
    passive: "Your damaging spells splash caustic reagents that keep eating.",
    chargeHint: "Charges from spell damage",
    signature: sig("elixirbomb", "Elixir Bomb", "point", 14, "#9ad06a", "Ultimate: a hurled elixir that scalds foes and mends heroes in the same breath."),
  },
  {
    id: "trapper", name: "Trapper", epithet: "of the Quiet Snare", crest: "net", color: "#a8925a",
    family: "Hunt", entry: [{ attr: "dex", value: 8 }],
    passive: "Each fight opens with a hidden snare beneath the foes' line.",
    chargeHint: "Charges from damage you deal",
    signature: sig("snarefield", "Snarefield", "point", 14, "#a8925a", "Ultimate: the ground sprouts iron teeth — a wide field of dragging snares."),
  },
  {
    id: "warcrier", name: "Warcrier", epithet: "the Rolling Thunder", crest: "horn", color: "#e09858",
    family: "Song & Craft", entry: [{ attr: "str", value: 6 }, { attr: "spi", value: 6 }],
    passive: "Your kills rally the band: everyone strikes faster for a moment.",
    chargeHint: "Charges from damage you deal and take",
    signature: sig("greatshout", "Great Shout", "instant", 14, "#e09858", "Ultimate: a shout that buckles knees — foes reel, the band roars."),
  },
];

export function advCallingById(id: string | null | undefined): { adv: AdvCallingDef; parent: CallingDef } | null {
  if (!id) return null;
  for (const c of CALLINGS) {
    for (const adv of c.advanced ?? []) {
      if (adv.id === id) return { adv, parent: c };
    }
  }
  return null;
}

export function callingById(id: string | null | undefined): CallingDef | null {
  return CALLINGS.find((c) => c.id === id) ?? null;
}

export function callingEligible(calling: CallingDef, attrs: Attributes): boolean {
  void attrs;
  return !!disciplineById(calling.discipline) && !!elementById(calling.element) && calling.id === pathId(calling.discipline, calling.element);
}

function callingStatMods(calling?: string | null, advCalling?: string | null, masteries: string[] = []) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  const path = callingById(calling);
  switch (path?.discipline) {
    case "knight": m.hpPct += 0.1; m.armorFlat += 0.04; break;
    case "warrior": m.meleeDmg += 0.12; m.hpPct += 0.04; break;
    case "rogue": m.moveSpeed += 0.08; m.crit += 0.05; break;
    case "archer": m.rangedDmg += 0.08; m.moveSpeed += 0.06; break;
    case "priest": m.healPower += 0.1; m.startShield += 10; break;
    case "mage": m.spellPower += 0.1; m.cdr += 0.05; break;
    case "necromancer": m.spellPower += 0.08; m.startShield += 6; m.cdr += 0.03; break;
  }
  switch (path?.element) {
    case "flame": m.meleeDmg += 0.025; m.rangedDmg += 0.025; m.spellPower += 0.04; break;
    case "frost": m.armorFlat += 0.03; m.cdr += 0.02; break;
    case "storm": m.atkSpeed += 0.05; m.cdr += 0.02; break;
    case "earth": m.hpPct += 0.08; m.armorFlat += 0.02; break;
    case "venom": m.crit += 0.04; break;
    case "radiant": m.healPower += 0.06; m.startShield += 8; break;
    case "blood": m.meleeDmg += 0.03; m.rangedDmg += 0.03; m.spellPower += 0.03; m.hpPct += 0.04; break;
    case "shadow": m.moveSpeed += 0.06; m.cdr += 0.03; break;
  }
  if (advCalling === `${path?.id}-ascendant`) {
    m.hpPct += 0.05;
    m.armorFlat += 0.02;
    m.healPower += 0.03;
  } else if (advCalling === `${path?.id}-paragon`) {
    m.meleeDmg += 0.05;
    m.rangedDmg += 0.05;
    m.spellPower += 0.05;
    m.atkSpeed += 0.03;
  }
  const masteredElements = new Set<ElementId>();
  for (const mastered of masteries) {
    const direct = elementById(mastered)?.id;
    const fromPath = callingById(mastered)?.element;
    const legacy = LEGACY_CALLING_PATHS[mastered]?.element;
    const element = direct ?? fromPath ?? legacy;
    if (element) masteredElements.add(element);
  }
  for (const mastered of masteredElements) {
    if (mastered === "flame") { m.meleeDmg += 0.02; m.rangedDmg += 0.02; m.spellPower += 0.02; }
    else if (mastered === "frost") m.armorFlat += 0.01;
    else if (mastered === "storm") m.atkSpeed += 0.02;
    else if (mastered === "earth") m.hpPct += 0.03;
    else if (mastered === "venom") m.crit += 0.015;
    else if (mastered === "radiant") m.healPower += 0.025;
    else if (mastered === "blood") { m.meleeDmg += 0.015; m.rangedDmg += 0.015; m.spellPower += 0.015; }
    else if (mastered === "shadow") m.cdr += 0.015;
  }
  return m;
}

/** Total ability-cooldown reduction from authored progression systems. */
export function cooldownReduction(hero: HeroSave): number {
  return Math.min(
    0.5,
    talentMods(hero.talents).cdr + trinketMods(hero.trinket).cdr + callingStatMods(hero.calling, hero.advCalling, hero.masteredElements).cdr,
  );
}

export function deriveStats(
  attrs: Attributes,
  weaponTier = 0,
  armor: GearWorn | string | null = null,
  talents?: Record<string, number>,
  trinket?: string | null,
  calling?: string | null,
  advCalling?: string | null,
  masteries?: string[],
): DerivedStats {
  const t = talentMods(talents);
  const k = trinketMods(trinket);
  const c = callingStatMods(calling, advCalling, masteries);
  const v = gearMods(armor);
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
  const maxHp = Math.round(60 + attrs.vit * 14 + attrs.str * 4 + v.hpFlat);
  const armorFrac = Math.min(0.65, attrs.vit * 0.02 + attrs.str * 0.01);
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
  } else if (weapon === "greatsword") {
    damage = 11 + attrs.str * 2.75 + attrs.vit * 0.35;
    range = 56;
    attackCooldown = 1.55;
  } else if (weapon === "bow") {
    damage = 6 + attrs.dex * 1.7;
    range = 300;
    attackCooldown = 1.0;
  } else if (weapon === "stave") {
    // a healer's holy spark — modest, but keeps them useful at range
    damage = 5 + attrs.spi * 1.1 + attrs.int * 0.5;
    range = 260;
    attackCooldown = 1.4;
  } else if (weapon === "tome") {
    damage = 6 + attrs.int * 1.65 + attrs.spi * 0.55;
    range = 275;
    attackCooldown = 1.55;
  } else {
    damage = 7 + attrs.int * 2.0;
    range = 280;
    attackCooldown = 1.35;
  }
  attackCooldown *= 1 - Math.min(0.45, attrs.dex * 0.018);
  if (advCalling === "hawkeye") range *= 1.15;
  damage += WEAPON_DAMAGE_BONUS[weaponTier];
  damage *= 1 + (weapon === "sword" || weapon === "greatsword" ? mods.meleeDmg : mods.rangedDmg);
  return {
    maxHp: Math.round(maxHp * (1 + mods.hpPct)) + trinketFlatHp(trinket),
    damage,
    range,
    attackCooldown: attackCooldown / (1 + mods.atkSpeed),
    speed: speed * (1 + mods.moveSpeed),
    armor: Math.min(0.7, armorFrac + mods.armorFlat),
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
  role?: EnemyRole;
  secondaryRoles?: EnemyRole[];
  affinity?: ElementId;
  /** Only these units consume a wave's one-or-two attention slots. */
  priority?: boolean;
  weakTo?: ElementId;
  resists?: ElementId;
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
  },  bonecaller: {
    name: "Bone-Caller",
    maxHp: 70,
    damage: 9,
    range: 180,
    attackCooldown: 2.2,
    speed: 80,
    armor: 0,
    radius: 13,
    xp: 22,
    body: "#b8b29a",
    trim: "#4a4438",
    lore: "A grave-priest of the war-bands. The dead do not rest where it walks.",
    habit: "Raises fallen enemies as shamblers. Kill it before the bodies stack.",
  },
  shambler: {
    name: "Shambler",
    maxHp: 40,
    damage: 7,
    range: 28,
    attackCooldown: 1.5,
    speed: 62,
    armor: 0,
    radius: 12,
    xp: 4,
    body: "#6a7a5a",
    trim: "#3a4434",
    lore: "What the Bone-Caller leaves standing. Slow, cold, and uncomplaining.",
    habit: "Slow but relentless. They pile up while the caller lives.",
  },

  stalker: {
    name: "Fen Stalker",
    maxHp: 70,
    damage: 15,
    range: 32,
    attackCooldown: 1.3,
    speed: 135,
    armor: 0,
    radius: 13,
    xp: 26,
    body: "#4a5a44",
    trim: "#2c3830",
    lore: "It does not fight lines. It waits at the edge of the lamplight and picks the one who mends the others.",
    habit: "Skirts the fight, then leaps on your backline. Exposed and fragile after it lands — punish it.",
  },

  shieldbearer: {
    name: "Pavise Bearer",
    maxHp: 150,
    damage: 9,
    range: 30,
    attackCooldown: 1.5,
    speed: 62,
    armor: 0.1,
    xp: 24,
    radius: 16,
    body: "#7a6a4a",
    trim: "#aab4c2",
    lore: "A door taken off its hinges and taught to walk. The goblins queue up behind it like it's payday.",
    habit: "Blows from the front glance off its pavise, and foes crouch behind it. Flank it, or answer with spells.",
  },

  harrier: {
    name: "Moor Harrier",
    maxHp: 60,
    damage: 12,
    range: 34,
    attackCooldown: 1.1,
    speed: 150,
    armor: 0,
    radius: 12,
    xp: 26,
    body: "#8a7a9c",
    trim: "#d8cfc0",
    lore: "All wing and grudge. It circles until it likes someone's shadow, then falls on them like weather.",
    habit: "Aloft, only arrows and spells can touch it. After a dive it's grounded a moment — that's your window.",
  },

  drummer: {
    name: "War-Drummer",
    maxHp: 110,
    damage: 8,
    range: 34,
    attackCooldown: 1.6,
    speed: 80,
    armor: 0.05,
    radius: 15,
    xp: 28,
    body: "#a05c3c",
    trim: "#e8a05a",
    lore: "It carries no blade. It doesn't need one — every beat of the hide drum puts murder in its neighbors' hands.",
    habit: "Each drumbeat quickens every foe near it. Silence the drum first.",
  },

  wyrm: {
    name: "The Winter Wyrm",
    maxHp: 1510,
    damage: 19,
    range: 64,
    attackCooldown: 1.45,
    speed: 108,
    armor: 0.32,
    radius: 26,
    xp: 280,
    body: "#8fb8cc",
    trim: "#dcedf5",
    lore: "The crown was never the king. Under the Hollow Crown's ice something older coils — the heart of winter itself, wearing the mountain like a shell.",
    habit: "It circles, breathes, and hunts beneath the ice. In its last stand frostfire turns to Flame: answer with Frost while its heart lies bare.",
  },

  warbanner: {
    name: "War Banner",
    maxHp: 240,
    damage: 0,
    range: 0,
    attackCooldown: 99,
    speed: 0,
    armor: 0,
    radius: 14,
    xp: 20,
    body: "#9a2f28",
    trim: "#5a4a52",
    lore: "Gorehulk's standard, driven into the dirt. While it stands, every wretch under it fights like two.",
    habit: "Planted at a third of the warlord's strength. It pulses rage into every foe near it — smash it fast.",
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
    habit: "Break its grip before it carries a hero away. Dodge the cart and belly-flop to leave it stunned and open.",
  },
  alpha: {
    name: "Alpha of Thornwood",
    maxHp: 3260,
    damage: 19,
    range: 34,
    attackCooldown: 1.1,
    speed: 135,
    armor: 0.1,
    radius: 24,
    xp: 95,
    body: "#3f3a4d",
    trim: "#6e6680",
    lore: "The pack answers one voice. It has never known a hunt to fail.",
    habit: "It chooses prey, calls a pack, and devours fallen wolves. Empty pounce circles break the hunt and its poise.",
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
    habit: "Spread against axe volleys, hold burst through Shieldwall, then destroy the war banner before No Quarter overwhelms you.",
  },
  frostwolf: {
    name: "Frostbite Wolf",
    maxHp: 46,
    damage: 9,
    range: 30,
    attackCooldown: 1.0,
    speed: 130,
    armor: 0,
    radius: 15,
    xp: 16,
    body: "#b8c9d8",
    trim: "#8fa8b8",
    lore: "White as the drifts it sleeps beneath. You hear it only when the snow creaks.",
    habit: "Its bite carries the cold — struck heroes slow. Keep moving, keep warm.",
  },
  icewisp: {
    name: "Ice Wisp",
    maxHp: 30,
    damage: 8,
    range: 210,
    attackCooldown: 1.7,
    speed: 70,
    armor: 0,
    radius: 11,
    xp: 14,
    body: "#9fd6e8",
    trim: "#d8f0f8",
    lore: "A splinter of living winter, humming with old cold.",
    habit: "Chill-bolts from afar. Fragile — one good blow shatters it.",
  },
  rimetroll: {
    name: "Rimeclad Troll",
    maxHp: 130,
    damage: 16,
    range: 40,
    attackCooldown: 2.2,
    speed: 55,
    armor: 0.5,
    radius: 22,
    xp: 34,
    body: "#7ba0b8",
    trim: "#4a6a80",
    lore: "It wears the glacier like a second hide.",
    habit: "Near-unhurtable until its ice casing SHATTERS — then it is soft. Commit your burst late.",
  },
  snowhag: {
    name: "Snow Hag",
    maxHp: 55,
    damage: 7,
    range: 190,
    attackCooldown: 1.9,
    speed: 62,
    armor: 0,
    radius: 14,
    xp: 26,
    body: "#a8b8c9",
    trim: "#e8f0f5",
    lore: "She sings the pack warm and sings the ground to ice.",
    habit: "Mends her kin and freezes the ground under YOUR feet. Silence her first.",
  },
  rimeheart: {
    name: "Rimeheart",
    maxHp: 2200,
    damage: 24,
    range: 50,
    attackCooldown: 2.6,
    speed: 48,
    armor: 0.35,
    radius: 34,
    xp: 160,
    body: "#8fb8cc",
    trim: "#dcedf5",
    lore: "The Winterreach has one king, older than the snow that crowns it.",
    habit: "Keep moving so the ice cannot crack beneath you. Cross the long breath, then punish the heart after its armor shatters.",
  },
  brinecrawler: {
    name: "Brinecrawler", maxHp: 150, damage: 15, range: 34, attackCooldown: 2.1, speed: 48, armor: 0.48, radius: 21, xp: 35,
    body: "#587f78", trim: "#a9c6ac", lore: "A reef given legs and a temper.", habit: "Its shell turns frontal blows. Circle behind it or answer with spells.",
  },
  kelpbound: {
    name: "Kelpbound", maxHp: 92, damage: 12, range: 48, attackCooldown: 1.7, speed: 70, armor: 0.12, radius: 16, xp: 29,
    body: "#496e59", trim: "#8ea36f", lore: "Drowned mail held upright by roots that never learned to die.", habit: "Its kelp tether drags isolated heroes toward deep water. Stay within rescuing distance.",
  },
  saltwitch: {
    name: "Salt Witch", maxHp: 72, damage: 9, range: 200, attackCooldown: 2, speed: 60, armor: 0.04, radius: 15, xp: 34,
    body: "#7ca1a0", trim: "#e2d6a5", lore: "She reads tomorrow in the salt left by yesterday's tide.", habit: "Heals allies standing in water and curses the ground. Silence her first.",
  },
  galeharrier: {
    name: "Gale Harrier", maxHp: 68, damage: 14, range: 34, attackCooldown: 1.55, speed: 122, armor: 0, radius: 14, xp: 31,
    body: "#70899a", trim: "#d6e4df", lore: "A knife-wing that rides the storm front.", habit: "Only arrows and spells reach it aloft. Its dive leaves it grounded briefly.",
  },
  bellkeeper: {
    name: "Drowned Bellkeeper", maxHp: 105, damage: 8, range: 120, attackCooldown: 2.4, speed: 54, armor: 0.18, radius: 18, xp: 38,
    body: "#526b70", trim: "#b59458", lore: "The bell stopped calling the faithful. It calls the drowned instead.", habit: "Each toll hastens nearby foes. Interrupt it or kill the keeper before the second toll.",
  },
  reefhound: {
    name: "Reef Hound", maxHp: 76, damage: 15, range: 32, attackCooldown: 1.15, speed: 132, armor: 0.06, radius: 14, xp: 28,
    body: "#467b82", trim: "#b2d2c7", lore: "It hunts by blood-scent through water too shallow for boats.", habit: "Fastest in the flooded half of the field. Pull it onto dry ground.",
  },
  stormcaller: {
    name: "Stormcaller", maxHp: 84, damage: 12, range: 220, attackCooldown: 2.2, speed: 58, armor: 0.05, radius: 15, xp: 41,
    body: "#506a8b", trim: "#b7e5df", lore: "A living rod for a sky that wants the earth.", habit: "Charges lightning conductors. Break the channel—or use the strike against its allies.",
  },
  wreckgunner: {
    name: "Wreck Gunner", maxHp: 82, damage: 14, range: 230, attackCooldown: 2.65, speed: 50, armor: 0.08, radius: 17, xp: 42,
    body: "#5e6868", trim: "#c68d55", lore: "A drowned deckhand chained to the last cannon of a ship with no name.", habit: "Lobs a clearly marked blast into the back line. Leave the circle before the shot lands.",
  },
  stormeel: {
    name: "Storm Eel", maxHp: 68, damage: 11, range: 38, attackCooldown: 1.45, speed: 118, armor: 0.04, radius: 14, xp: 34,
    body: "#397884", trim: "#a9f2ff", lore: "It learned lightning from the clouds and patience from the drowned.", habit: "Its bite arcs between nearby heroes, and high tide makes the second shock briefly stun. Spread out in water.",
  },
  conchseer: {
    name: "Conch Seer", maxHp: 78, damage: 8, range: 190, attackCooldown: 2.35, speed: 56, armor: 0.1, radius: 16, xp: 40,
    body: "#735f79", trim: "#e0c79d", lore: "It listens to tomorrow through a shell grown around yesterday's dead.", habit: "Raises pearlescent wards around nearby allies. Break the seer before the shields bury the field.",
  },
  bellwidow: {
    name: "The Bell Widow", maxHp: 2720, damage: 22, range: 180, attackCooldown: 2.45, speed: 48, armor: 0.22, radius: 32, xp: 190,
    body: "#526e75", trim: "#d2ae67", lore: "Abbess, lighthouse keeper, and last voice of a drowned abbey.", habit: "Each toll floods two lanes and silences stragglers. Gather the whole band in the named quiet lane to stop the clapper and expose her.",
  },
  stormjaw: {
    name: "Stormjaw", maxHp: 4120, damage: 25, range: 62, attackCooldown: 2.7, speed: 55, armor: 0.26, radius: 40, xp: 260,
    body: "#315f69", trim: "#9ed2c7", lore: "The coast was never land. It was only sleeping.", habit: "Bait marked lightning onto its reef plates, run against the undertow, then dodge the breach for a long exposed-heart window.",
  },
  ...LATE_ENEMIES,
};

/** One readable strength and weakness per foe; combat may consume these directly. */
const LATE_ENEMY_AFFINITIES = Object.fromEntries(
  Object.entries(LATE_ENEMIES).map(([kind, enemy]) => [kind, { weakTo: enemy.weakTo, resists: enemy.resists }]),
) as Record<keyof typeof LATE_ENEMIES, { weakTo: ElementId; resists: ElementId }>;

const ENEMY_AFFINITIES: Record<EnemyKind, { weakTo: ElementId; resists: ElementId }> = {
  goblin: { weakTo: "radiant", resists: "venom" },
  wolf: { weakTo: "flame", resists: "shadow" },
  archer: { weakTo: "storm", resists: "venom" },
  brute: { weakTo: "venom", resists: "earth" },
  ogre: { weakTo: "venom", resists: "earth" },
  shaman: { weakTo: "shadow", resists: "radiant" },
  alpha: { weakTo: "flame", resists: "shadow" },
  warlord: { weakTo: "storm", resists: "earth" },
  frostwolf: { weakTo: "flame", resists: "frost" },
  icewisp: { weakTo: "flame", resists: "frost" },
  rimetroll: { weakTo: "flame", resists: "frost" },
  snowhag: { weakTo: "flame", resists: "frost" },
  rimeheart: { weakTo: "flame", resists: "frost" },
  bonecaller: { weakTo: "radiant", resists: "shadow" },
  shambler: { weakTo: "radiant", resists: "venom" },
  stalker: { weakTo: "radiant", resists: "shadow" },
  shieldbearer: { weakTo: "storm", resists: "earth" },
  harrier: { weakTo: "frost", resists: "storm" },
  drummer: { weakTo: "shadow", resists: "blood" },
  warbanner: { weakTo: "flame", resists: "blood" },
  wyrm: { weakTo: "flame", resists: "frost" },
  brinecrawler: { weakTo: "storm", resists: "earth" },
  kelpbound: { weakTo: "flame", resists: "venom" },
  saltwitch: { weakTo: "venom", resists: "frost" },
  galeharrier: { weakTo: "frost", resists: "storm" },
  bellkeeper: { weakTo: "storm", resists: "shadow" },
  reefhound: { weakTo: "earth", resists: "storm" },
  stormcaller: { weakTo: "earth", resists: "storm" },
  wreckgunner: { weakTo: "storm", resists: "earth" },
  stormeel: { weakTo: "earth", resists: "storm" },
  conchseer: { weakTo: "venom", resists: "radiant" },
  bellwidow: { weakTo: "radiant", resists: "shadow" },
  stormjaw: { weakTo: "earth", resists: "storm" },
  ...LATE_ENEMY_AFFINITIES,
};

export const ENEMY_ROLES: Record<EnemyKind, EnemyRole> = {
  goblin: "vanguard", wolf: "hunter", archer: "artillery", brute: "tank", ogre: "tank", shaman: "support",
  bonecaller: "summoner", shambler: "vanguard", stalker: "assassin", shieldbearer: "tank", harrier: "assassin",
  drummer: "support", warbanner: "support", alpha: "assassin", warlord: "tank",
  frostwolf: "hunter", icewisp: "artillery", rimetroll: "tank", snowhag: "support", rimeheart: "controller", wyrm: "controller",
  brinecrawler: "tank", kelpbound: "controller", saltwitch: "support", galeharrier: "assassin", bellkeeper: "support",
  reefhound: "hunter", stormcaller: "disruptor", wreckgunner: "artillery", stormeel: "controller", conchseer: "support",
  bellwidow: "controller", stormjaw: "tank",
  cinderkin: "vanguard", ashenhound: "hunter", furnacecantor: "support", kilntyrant: "tank", cindermaw: "controller",
  briarback: "tank", sporeseer: "support", vinelurker: "controller", rootboundmatriarch: "summoner", verdantcolossus: "tank",
  gloomwing: "assassin", glassjackal: "hunter", mirageseer: "artillery", dunerevenant: "controller", nightmother: "summoner",
  reliquaryguard: "tank", censerwraith: "controller", oathbreaker: "disruptor", gildedinquisitor: "disruptor", reliquaryseraph: "artillery",
  shardling: "vanguard", galeroc: "hunter", thundermonk: "disruptor", tempestroc: "assassin", skybreaker: "controller",
  bloodreaver: "vanguard", briarwitch: "support", moonfang: "assassin", redhuntsman: "hunter", bloodmoonstag: "controller",
  nullwalker: "tank", waylostarcher: "artillery", rifthound: "hunter", lastpilgrim: "summoner", wayeater: "controller",
};

const ENEMY_SECONDARY_ROLES: Partial<Record<EnemyKind, EnemyRole[]>> = {
  ogre: ["controller"], alpha: ["summoner"], warlord: ["artillery"], rimeheart: ["tank"], wyrm: ["tank"],
  bellwidow: ["summoner"], stormjaw: ["controller"], kilntyrant: ["artillery"], cindermaw: ["tank"],
  rootboundmatriarch: ["controller"], verdantcolossus: ["controller"], dunerevenant: ["assassin"], nightmother: ["artillery"],
  gildedinquisitor: ["controller"], reliquaryseraph: ["summoner"], tempestroc: ["artillery"], skybreaker: ["tank"],
  redhuntsman: ["assassin"], bloodmoonstag: ["summoner"], lastpilgrim: ["controller"], wayeater: ["summoner"],
};

/** Priority is authored rather than inferred from role: an ordinary archer is
 * artillery pressure, while a Wreck Gunner is a must-answer artillery piece. */
export const PRIORITY_ENEMIES = new Set<EnemyKind>([
  "shaman", "bonecaller", "stalker", "snowhag", "saltwitch", "stormcaller", "wreckgunner",
  "furnacecantor", "sporeseer", "mirageseer", "oathbreaker", "thundermonk", "briarwitch", "waylostarcher",
]);

for (const kind of Object.keys(ENEMY_AFFINITIES) as EnemyKind[]) {
  const affinity = ENEMY_AFFINITIES[kind];
  Object.assign(ENEMIES[kind], affinity, {
    role: ENEMY_ROLES[kind],
    secondaryRoles: ENEMY_SECONDARY_ROLES[kind],
    affinity: affinity.resists,
    priority: PRIORITY_ENEMIES.has(kind),
  });
}

const CAMPAIGN_STAGES: StageDef[] = [
  {
    id: 0,
    name: "Millbrook Fields",
    subtitle: "Goblins in the barley",
    fieldNote: "The mill wheel still turns. Nothing else in the fields dares move.",
    objective: "Break the rush, then close on the sniper.",
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
    fieldNote: "Claw marks circle every trail marker. The pack is steering travelers inward.",
    objective: "Protect the back line and punish the ogre after its slam.",
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
    fieldNote: "Green lanterns drift against the wind. Somewhere in the reeds, a healer is chanting.",
    objective: "Reach the shaman before the shield line closes.",
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
      [{ kind: "shieldbearer", count: 1 }, { kind: "shaman", count: 1 }, { kind: "archer", count: 2 }],
      [{ kind: "brute", count: 1 }, { kind: "shaman", count: 1 }, { kind: "wolf", count: 2 }],
    ],
  },
  {
    id: 3,
    name: "The Charwood",
    subtitle: "Still smoldering",
    fieldNote: "The fire is weeks old, but fresh footprints cross the ash without leaving toes.",
    objective: "Identify the caller and assassin; only one can be answered first.",
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
      [{ kind: "archer", count: 2 }, { kind: "wolf", count: 2 }, { kind: "stalker", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "bonecaller", count: 1 }, { kind: "harrier", count: 1 }],
      [{ kind: "goblin", count: 4 }, { kind: "archer", count: 2 }, { kind: "bonecaller", count: 1 }, { kind: "wolf", count: 1 }],
    ],
  },
  {
    id: 4,
    name: "Gloaming Pass",
    subtitle: "The pack answers one voice",
    fieldNote: "Every lesser track ends here. One set of prints continues beneath the moon.",
    objective: "Dodge the pounce. Strike during exhaustion. Survive the hunt.",
    palette: {
      skyTop: "#4a5a8c",
      skyBottom: "#8d7ba8",
      hills: "#55496e",
      ground: "#6e6288",
      groundDark: "#584e70",
      prop: "#3d3554",
    },
    scale: 1.33,
    xpReward: 72,
    // a true boss level: the Alpha from the first breath, its pack arriving
    // as the fight itself summons them (howl at 60%, frenzy at 30%)
    waves: [[{ kind: "alpha", count: 1 }]],
  },
  {
    id: 5,
    name: "Gorehulk's Hollow",
    subtitle: "The warlord himself",
    fieldNote: "Broken banners face the road like warning stakes. The hollow is already an arena.",
    objective: "Break his support, spread for the sweep, then take the banner.",
    palette: {
      skyTop: "#8c4a4a",
      skyBottom: "#d9a878",
      hills: "#6e3a3a",
      ground: "#8a6a52",
      groundDark: "#6e5440",
      prop: "#4a3226",
    },
    scale: 1.48,
    xpReward: 90,
    waves: [
      [{ kind: "goblin", count: 3 }, { kind: "shaman", count: 1 }, { kind: "drummer", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "archer", count: 2 }, { kind: "shieldbearer", count: 1 }],
      [{ kind: "warlord", count: 1 }, { kind: "shaman", count: 1 }],
    ],
  },
  // ---- ACT II: THE WINTERREACH (band levels ~12-20) ----
  {
    id: 6,
    name: "The White Road",
    subtitle: "Winter takes the land",
    palette: { skyTop: "#a8c8e0", skyBottom: "#e8f0f5", hills: "#c9d8e4", ground: "#e0e8ee", groundDark: "#c4d2dc", prop: "#8fa8b8" },
    scale: 2.7,
    xpReward: 88,
    waves: [
      [{ kind: "frostwolf", count: 3 }],
      [{ kind: "goblin", count: 3 }, { kind: "frostwolf", count: 2 }],
      [{ kind: "icewisp", count: 2 }, { kind: "frostwolf", count: 3 }],
    ],
  },
  {
    id: 7,
    name: "Hoarfrost Forest",
    subtitle: "The pines wear glass",
    palette: { skyTop: "#8fb0cc", skyBottom: "#d0e0ea", hills: "#a8c0d0", ground: "#d4e0e8", groundDark: "#b8c8d4", prop: "#5a7a8c" },
    scale: 3.0,
    xpReward: 100,
    waves: [
      [{ kind: "frostwolf", count: 3 }, { kind: "icewisp", count: 1 }],
      [{ kind: "snowhag", count: 1 }, { kind: "archer", count: 2 }, { kind: "harrier", count: 1 }],
      [{ kind: "rimetroll", count: 1 }, { kind: "icewisp", count: 2 }, { kind: "stalker", count: 1 }],
    ],
  },
  {
    id: 8,
    name: "The Frozen Lake",
    subtitle: "Black ice, thin as promises",
    palette: { skyTop: "#7aa0c0", skyBottom: "#c8dce8", hills: "#98b4c8", ground: "#b8d4e0", groundDark: "#9cc0d0", prop: "#68889c" },
    scale: 3.3,
    xpReward: 112,
    waves: [
      [{ kind: "icewisp", count: 3 }, { kind: "goblin", count: 2 }, { kind: "shieldbearer", count: 1 }],
      [{ kind: "snowhag", count: 1 }, { kind: "frostwolf", count: 3 }],
      [{ kind: "rimetroll", count: 1 }, { kind: "bonecaller", count: 1 }, { kind: "icewisp", count: 2 }, { kind: "drummer", count: 1 }],
    ],
  },
  {
    id: 9,
    name: "Glimmerdeep",
    subtitle: "The mountain's cold blue heart",
    palette: { skyTop: "#1c2438", skyBottom: "#2c3a54", hills: "#242e46", ground: "#38465e", groundDark: "#2a3850", prop: "#4a6a8c" },
    scale: 3.6,
    xpReward: 126,
    waves: [
      [{ kind: "icewisp", count: 4 }, { kind: "stalker", count: 1 }],
      [{ kind: "rimetroll", count: 1 }, { kind: "icewisp", count: 2 }, { kind: "snowhag", count: 1 }],
      [{ kind: "rimetroll", count: 2 }, { kind: "icewisp", count: 2 }, { kind: "harrier", count: 1 }],
    ],
  },
  {
    id: 10,
    name: "Avalanche Pass",
    subtitle: "The wind has teeth here",
    palette: { skyTop: "#8898a8", skyBottom: "#b8c4cc", hills: "#a0b0bc", ground: "#ccd8de", groundDark: "#b0c0c8", prop: "#68808f" },
    scale: 3.9,
    xpReward: 140,
    waves: [
      [{ kind: "frostwolf", count: 4 }, { kind: "snowhag", count: 1 }],
      [{ kind: "rimetroll", count: 1 }, { kind: "archer", count: 2 }, { kind: "shieldbearer", count: 1 }, { kind: "drummer", count: 1 }],
      [{ kind: "rimetroll", count: 2 }, { kind: "snowhag", count: 1 }, { kind: "stalker", count: 1 }, { kind: "harrier", count: 1 }],
    ],
  },
  {
    id: 11,
    name: "The Hollow Crown",
    subtitle: "The heart of winter stirs",
    palette: { skyTop: "#101a30", skyBottom: "#243450", hills: "#1a2640", ground: "#303f58", groundDark: "#243248", prop: "#3d5570" },
    scale: 2.98,
    xpReward: 170,
    waves: [[{ kind: "wyrm", count: 1 }]],
  },
  // ---- ACT III: THE STORMBREAK COAST (band levels ~22-32) ----
  {
    id: 12, name: "Saltroad Causeway", subtitle: "The sea has crossed the road", terrain: "tide",
    palette: { skyTop: "#5f8492", skyBottom: "#c5c6a5", hills: "#55756d", ground: "#748b70", groundDark: "#47666a", prop: "#b6905a" },
    scale: 3.15, xpReward: 185,
    waves: [[{ kind: "brinecrawler", count: 2 }, { kind: "reefhound", count: 2 }], [{ kind: "kelpbound", count: 2 }, { kind: "saltwitch", count: 1 }], [{ kind: "brinecrawler", count: 1 }, { kind: "galeharrier", count: 2 }, { kind: "stormeel", count: 2 }]],
  },
  {
    id: 13, name: "The Weeping Reeds", subtitle: "Something pulls beneath", terrain: "tide",
    palette: { skyTop: "#526f76", skyBottom: "#aebd9e", hills: "#45645b", ground: "#61775f", groundDark: "#3c5960", prop: "#8a784f" },
    scale: 3.3, xpReward: 200,
    waves: [[{ kind: "kelpbound", count: 2 }, { kind: "reefhound", count: 2 }, { kind: "conchseer", count: 1 }], [{ kind: "saltwitch", count: 1 }, { kind: "brinecrawler", count: 1 }, { kind: "stormeel", count: 2 }], [{ kind: "bellkeeper", count: 1 }, { kind: "kelpbound", count: 2 }, { kind: "wreckgunner", count: 1 }]],
  },
  {
    id: 14, name: "Lanternwreck Bay", subtitle: "Masts call down the sky", terrain: "storm",
    palette: { skyTop: "#324b63", skyBottom: "#9aaea9", hills: "#3f5d61", ground: "#65776e", groundDark: "#38515b", prop: "#c39b5b" },
    scale: 3.35, xpReward: 220,
    waves: [[{ kind: "galeharrier", count: 2 }, { kind: "stormcaller", count: 1 }, { kind: "wreckgunner", count: 1 }], [{ kind: "bellkeeper", count: 1 }, { kind: "reefhound", count: 2 }, { kind: "stormeel", count: 2 }], [{ kind: "stormcaller", count: 1 }, { kind: "brinecrawler", count: 1 }, { kind: "conchseer", count: 1 }, { kind: "wreckgunner", count: 1 }]],
  },
  {
    id: 15, name: "The Drowned Belfry", subtitle: "One bell still answers", terrain: "tide-storm",
    palette: { skyTop: "#273b53", skyBottom: "#859b98", hills: "#344f56", ground: "#586d69", groundDark: "#304a56", prop: "#c3a05f" },
    scale: 3.3, xpReward: 265, waves: [[{ kind: "bellwidow", count: 1 }]],
  },
  {
    id: 16, name: "The Eye Road", subtitle: "Walk where the storm looks away", terrain: "tide-storm",
    palette: { skyTop: "#23364f", skyBottom: "#78969a", hills: "#31525b", ground: "#506d69", groundDark: "#294754", prop: "#a88452" },
    scale: 3.55, xpReward: 250,
    waves: [[{ kind: "stormcaller", count: 1 }, { kind: "galeharrier", count: 2 }, { kind: "stormeel", count: 2 }], [{ kind: "brinecrawler", count: 1 }, { kind: "saltwitch", count: 1 }, { kind: "bellkeeper", count: 1 }, { kind: "wreckgunner", count: 1 }], [{ kind: "kelpbound", count: 2 }, { kind: "reefhound", count: 2 }, { kind: "stormcaller", count: 1 }, { kind: "conchseer", count: 1 }]],
  },
  {
    id: 17, name: "The Sleeping Coast", subtitle: "The shoreline opens its eye", terrain: "tide-storm",
    palette: { skyTop: "#142a43", skyBottom: "#668b91", hills: "#244955", ground: "#42676a", groundDark: "#203f4e", prop: "#d1aa64" },
    scale: 3.45, xpReward: 330, waves: [[{ kind: "stormjaw", count: 1 }]],
  },
  ...LATE_ROAD_STAGES,
];

// Room counts are an authored rhythm, not a universal three-beat template.
// Reflowing expands entries into individuals and packs them back in order, so
// the enemy roster, XP economy and regional ecology stay exactly the same.
const SHORT_ROUTE_STAGES = new Set([6, 12, 18, 24, 30, 36, 42, 48, 54]);
const LONG_ROUTE_STAGES = new Set([2, 8, 14, 20, 26, 32, 38, 44, 50, 56]);
const DESCENT_STAGES = new Set([2, 9, 13, 19, 25, 32, 38, 43, 50, 55]);

function reflowRooms(stage: StageDef, roomCount: number): StageDef["waves"] {
  const foes = stage.waves.flatMap((wave) => wave.flatMap((entry) => Array.from({ length: entry.count }, () => entry.kind)));
  const rooms: StageDef["waves"] = [];
  let cursor = 0;
  for (let room = 0; room < roomCount; room++) {
    const remainingRooms = roomCount - room;
    const take = Math.ceil((foes.length - cursor) / remainingRooms);
    const kinds = foes.slice(cursor, cursor + take);
    cursor += take;
    const packed: StageDef["waves"][number] = [];
    for (const kind of kinds) {
      const prior = packed[packed.length - 1];
      if (prior?.kind === kind) prior.count++;
      else packed.push({ kind, count: 1 });
    }
    rooms.push(packed);
  }
  return rooms;
}

function splitLargestRoom(stage: StageDef): StageDef["waves"] {
  let splitAt = 0;
  let largest = 0;
  stage.waves.forEach((wave, index) => {
    const size = wave.reduce((total, entry) => total + entry.count, 0);
    if (size > largest) { largest = size; splitAt = index; }
  });
  const source = stage.waves[splitAt].flatMap((entry) => Array.from({ length: entry.count }, () => entry.kind));
  const halves = [source.slice(0, Math.ceil(source.length / 2)), source.slice(Math.ceil(source.length / 2))];
  const split = halves.map((kinds) => {
    const packed: StageDef["waves"][number] = [];
    for (const kind of kinds) {
      const prior = packed[packed.length - 1];
      if (prior?.kind === kind) prior.count++;
      else packed.push({ kind, count: 1 });
    }
    return packed;
  });
  return [...stage.waves.slice(0, splitAt), ...split, ...stage.waves.slice(splitAt + 1)];
}

export const STAGES: StageDef[] = CAMPAIGN_STAGES.map((stage) => {
  const roomCount = SHORT_ROUTE_STAGES.has(stage.id) ? 2 : LONG_ROUTE_STAGES.has(stage.id) ? 4 : stage.waves.length;
  return {
    ...stage,
    travelDirection: DESCENT_STAGES.has(stage.id) ? "south" : "east",
    waves: LONG_ROUTE_STAGES.has(stage.id)
      ? splitLargestRoom(stage)
      : roomCount === stage.waves.length ? stage.waves : reflowRooms(stage, roomCount),
  };
});

interface PathLore {
  name: string;
  epithet: string;
  passive: string;
  ultimate: string;
  ultimateBlurb: string;
  techniques: readonly [
    { name: string; blurb: string },
    { name: string; blurb: string },
  ];
}

/** The two added Disciplines do not inherit Mage or Knight copy. Their eight
 * Attunements change the resource loop itself: Warriors spend Fury through
 * different finishers; Necromancers spend Remains on different servants and
 * death rites. */
const ADDED_PATH_LORE: Record<"warrior" | "necromancer", Record<ElementId, PathLore>> = {
  warrior: {
    flame: { name: "Cindermaul", epithet: "the Furnace Unchained", passive: "Fury finishers consume existing burns in a wide detonation.", ultimate: "Furnace Wheel", ultimateBlurb: "Spend every spark of Fury on a sweeping furnace blow that detonates burning enemies.", techniques: [{ name: "Kindling Blow", blurb: "A committed cleave that builds Fury and brands everything at the blade's edge." }, { name: "Furnace Swing", blurb: "Spend Fury on a broad sweep; burning enemies erupt into nearby ranks." }] },
    frost: { name: "Glacier Reaver", epithet: "the Falling Shelf", passive: "Heavy blows bank Frost; Fury finishers shatter chilled enemies instead of merely slowing them.", ultimate: "Calving Edge", ultimateBlurb: "Break the frozen line like a falling glacier, shattering prepared enemies and boss poise.", techniques: [{ name: "Rime Hew", blurb: "Plant a cold heavy strike that builds Fury and brittle pressure." }, { name: "Glacier Splitter", blurb: "Spend Fury to shatter chilled targets and stagger great foes." }] },
    storm: { name: "Thunderbrand", epithet: "Weight Behind Lightning", passive: "Fury removes the greatsword's recovery, turning committed swings into a gathering storm.", ultimate: "Skywheel", ultimateBlurb: "Release a chain of accelerating sweeps whose final impact throws lightning through the field.", techniques: [{ name: "Storm Hew", blurb: "A heavy strike that stores momentum as Fury and conductive pressure." }, { name: "Thunderwheel", blurb: "Spend Fury to swing without recovery and arc lightning beyond the blade." }] },
    earth: { name: "Worldbreaker", epithet: "the Walking Fault", passive: "Fury finishers create faults that break armor and hold your footing.", ultimate: "Continental Divide", ultimateBlurb: "Drive the greatsword through the road, splitting a fault that crushes armor and boss poise.", techniques: [{ name: "Bedrock Blow", blurb: "A planted hit that cannot be interrupted and builds Fury from impact." }, { name: "Fault Cleaver", blurb: "Spend Fury to open a slowing fault and expose armored enemies." }] },
    venom: { name: "Blight Cleaver", epithet: "the Rusted Harvest", passive: "Every broad hit spreads corrosion; Fury harvests all accumulated poison at once.", ultimate: "Green Reaping", ultimateBlurb: "Reap the poisoned formation, multiplying corrosion before a final execution sweep.", techniques: [{ name: "Venom Hew", blurb: "Coat a wide blade arc in poison and build Fury for every enemy marked." }, { name: "Blight Harvest", blurb: "Spend Fury to deepen and spread vulnerability through clustered enemies." }] },
    radiant: { name: "Sunforged", epithet: "the Great Bell of Noon", passive: "Heavy impacts shed protective sparks toward the weakest ally.", ultimate: "Noonday Sundering", ultimateBlurb: "Ring the battlefield with a radiant blow that judges enemies and wards the band.", techniques: [{ name: "Dawn Hammer", blurb: "Build Fury with a bright impact that sends a ward to the weakest ally." }, { name: "Sunwheel", blurb: "Spend Fury on a judgment sweep whose damage returns as party wards." }] },
    blood: { name: "Red Berserker", epithet: "No Measure Left", passive: "Missing health increases Fury gain; finishers restore life from wounded prey.", ultimate: "Last Red Hour", ultimateBlurb: "Spend health and all Fury on a relentless chain that refuses death while it connects.", techniques: [{ name: "Blood Price", blurb: "Pay health for a brutal blow and gain Fury according to the wound." }, { name: "Red Feast", blurb: "Spend Fury to execute wounded enemies and drink back part of the damage." }] },
    shadow: { name: "Dreadblade", epithet: "the Swing You Never Saw", passive: "Heavy attacks leave delayed shadow echoes; Fury calls every echo home.", ultimate: "Afterimage Massacre", ultimateBlurb: "Cut once through the field, then let a host of delayed black blades repeat the blow.", techniques: [{ name: "Gloam Hew", blurb: "Build Fury and leave a delayed echo at the end of the swing." }, { name: "Night Reprise", blurb: "Spend Fury to repeat recent heavy strikes from their shadow positions." }] },
  },
  necromancer: {
    flame: { name: "Ashcaller", epithet: "Shepherd of Cinders", passive: "Remains become burning revenants that rush a target and explode.", ultimate: "March of Ash", ultimateBlurb: "Spend every Remain on a procession of revenants that detonate through the enemy line.", techniques: [{ name: "Cinder Servant", blurb: "Raise a brief burning spirit; without Remains, cast a smaller ash curse." }, { name: "Funeral Pyre", blurb: "Spend Remains to ignite corpses and burning enemies in chained explosions." }] },
    frost: { name: "Pale Shepherd", epithet: "Keeper of the Quiet Host", passive: "Remains become guarding shades whose attacks accumulate brittle frost.", ultimate: "White Procession", ultimateBlurb: "Call a pale host that freezes pursuit and stands between the band and death.", techniques: [{ name: "Rime Servant", blurb: "Raise a frost shade that slows its quarry and intercepts pressure." }, { name: "Ossuary Winter", blurb: "Spend Remains to freeze prepared enemies and raise a brief party guard." }] },
    storm: { name: "Spirit Binder", epithet: "Conductor of the Dead", passive: "Spectral attacks chain between conductive enemies and quicken their master.", ultimate: "Thousand-Volt Séance", ultimateBlurb: "Open the storm veil and let every stored spirit arc through the enemy formation.", techniques: [{ name: "Spark Wraith", blurb: "Raise a fast wraith whose attacks chain lightning and build Remains pressure." }, { name: "Séance Circuit", blurb: "Spend Remains to chain spirit lightning and accelerate allied techniques." }] },
    earth: { name: "Ossuary Sage", epithet: "Architect of Bone", passive: "Remains become durable bone-and-stone sentinels that shelter nearby allies.", ultimate: "Cathedral of Ribs", ultimateBlurb: "Spend the grave's full store to raise a sheltering ossuary around the band.", techniques: [{ name: "Grave Sentinel", blurb: "Raise a sturdy servant that guards the nearest wounded ally." }, { name: "Bone Rampart", blurb: "Spend Remains on a warding fault that blocks pressure and breaks boss poise." }] },
    venom: { name: "Plaguecaller", epithet: "Gardener of the Last Breath", passive: "Deaths seed plague clouds; servants spread vulnerability instead of raw damage.", ultimate: "Garden of Corpses", ultimateBlurb: "Spend every Remain to bloom a contagious grave garden across the battlefield.", techniques: [{ name: "Carrion Familiar", blurb: "Raise a plague spirit that marks targets for the party." }, { name: "Mortal Bloom", blurb: "Spend Remains to spread poison from corpses and vulnerable enemies." }] },
    radiant: { name: "Ancestor", epithet: "Speaker for the Honored", passive: "Remains call ancestral guardians whose attacks heal the weakest ally.", ultimate: "The Honored Return", ultimateBlurb: "Invite the full ancestral host to fight, heal, and ward beside the living band.", techniques: [{ name: "Ancestral Guide", blurb: "Call a bright ancestor that attacks threats and tends the wounded." }, { name: "Memory Rite", blurb: "Spend Remains to turn damage dealt into healing and excess healing into wards." }] },
    blood: { name: "Hemomancer", epithet: "Maker of Red Thralls", passive: "Health can replace missing Remains, creating stronger but costly thralls.", ultimate: "Crimson Host", ultimateBlurb: "Pay blood and Remains to call a ravenous host whose damage returns as life.", techniques: [{ name: "Red Thrall", blurb: "Spend a Remain—or your own health—to raise a life-draining spirit." }, { name: "Sanguine Command", blurb: "Sacrifice health to empower every active spirit and harvest wounded prey." }] },
    shadow: { name: "Necromancer", epithet: "Keeper of Empty Names", passive: "Remains become numerous skeleton shades while curses erase hostile attention.", ultimate: "Night Without End", ultimateBlurb: "Spend every Remain to loose the nameless dead and hide the band beneath their passing.", techniques: [{ name: "Raise Shade", blurb: "Raise a classic skeletal shade that hunts the nearest priority enemy." }, { name: "Open Graves", blurb: "Spend Remains to call several shades and pull exposed enemies together." }] },
  },
};

/** Authored identities keep each combination feeling like a class, not a color swap. */
const PATH_LORE: Record<DisciplineId, Record<ElementId, PathLore>> = {
  knight: {
    flame: {
      name: "Cinder Knight", epithet: "the Last Hearth", passive: "Foes caught by your Path techniques kindle wards for wounded allies.", ultimate: "Furnace Rampart",
      ultimateBlurb: "Raise a burning bastion that taunts the field, shields the band, and builds a great hearth ward from every foe caught.",
      techniques: [
        { name: "Hearthguard", blurb: "Brace and taunt nearby foes. Each foe caught strengthens a ward on the most wounded ally." },
        { name: "Furnace Charge", blurb: "Drive into the line, scorch every foe around you, and share your guard with nearby allies." },
      ],
    },
    frost: {
      name: "Rimeguard", epithet: "Keeper of Still Gates", passive: "Your Path techniques turn a planted stance into an enduring ice ward.", ultimate: "Glacier Oath",
      ultimateBlurb: "Become the still gate: lock down nearby foes beneath deep frost while a glacier ward seals your armor.",
      techniques: [
        { name: "Stillgate", blurb: "Brace, taunt, and wrap yourself in an ice ward while nearby foes lose their footing." },
        { name: "Glacier Ram", blurb: "Crash forward through the line; already chilled foes remain trapped in the cold longer." },
      ],
    },
    storm: {
      name: "Thunder Warden", epithet: "the Walking Stormwall", passive: "Your guarded surges carry battle-tempo to allies fighting beside you.", ultimate: "Skybreak Bastion",
      ultimateBlurb: "Call the stormwall down around the whole band, taunting foes while every nearby ally surges with lightning speed.",
      techniques: [
        { name: "Thunderbrace", blurb: "Catch nearby foes on your guard and turn their impact into a burst of speed for close allies." },
        { name: "Skybreaker", blurb: "Surge into the front line, chaining storm force through enemies and quickening the band behind you." },
      ],
    },
    earth: {
      name: "Stonewarden", epithet: "Who Does Not Yield", passive: "Your Path techniques lend a share of your guard to nearby allies.", ultimate: "The Mountain Stands",
      ultimateBlurb: "Plant an unbreakable mountain-oath that shields the band, taunts the field, and crushes a boss's poise.",
      techniques: [
        { name: "Bedrock Oath", blurb: "Brace and taunt, lending a layer of stone guard to allies who hold near you." },
        { name: "Faultline Charge", blurb: "Drive a fault through the enemy line, heavily staggering great foes while sheltering nearby allies." },
      ],
    },
    venom: {
      name: "Mireguard", epithet: "the Serpent Rampart", passive: "Corrosion spreads outward from foes caught against your shield.", ultimate: "Coils of the Fen",
      ultimateBlurb: "Draw the field into the serpent rampart, taunting foes as a wave of corrosion exposes the entire enemy line.",
      techniques: [
        { name: "Mire Ward", blurb: "Brace and taunt while venom eats through the defenses of every foe pressed against you." },
        { name: "Serpent Breach", blurb: "Charge the line and spread corrosion from each struck foe to enemies clustered beside it." },
      ],
    },
    radiant: {
      name: "Dawn Paladin", epithet: "Shield at First Light", passive: "Every successful Path technique sends healing light through the nearby band.", ultimate: "Daybreak Aegis",
      ultimateBlurb: "Raise the sun behind your shield, restoring and warding allies while the whole battlefield turns to face you.",
      techniques: [
        { name: "Dawn Guard", blurb: "Brace and taunt; the impact releases a healing pulse and a ward for the weakest ally." },
        { name: "Sunlance", blurb: "Drive a line of judgment through the enemy and bathe nearby allies in restorative light." },
      ],
    },
    blood: {
      name: "Crimson Bulwark", epithet: "the Debt in Iron", passive: "Missing health deepens both the force of your Path techniques and the guard they grant.", ultimate: "Red Citadel",
      ultimateBlurb: "Pay the crimson price to become a red citadel, striking wounded foes harder and refusing to yield while blood remains.",
      techniques: [
        { name: "Red Bastion", blurb: "Pay a little blood to brace and taunt. The more wounded you are, the stronger your counter and guard." },
        { name: "Debt Collector", blurb: "Charge wounded enemies with execution force, reclaiming blood as their defenses break." },
      ],
    },
    shadow: {
      name: "Dusk Knight", epithet: "Warden of the Last Lamp", passive: "Your guard erases hostile attention and leaves pursuers struggling through gloom.", ultimate: "Nightwall",
      ultimateBlurb: "Raise a wall of night that swallows enemy attention, shields allies, and leaves every attacker stumbling in darkness.",
      techniques: [
        { name: "Dusk Ward", blurb: "Brace and taunt before dimming the enemy's sight, slowing pursuit and slipping from hostile attention." },
        { name: "Eclipse Charge", blurb: "Rush through the line under cover of gloom, leaving struck foes exposed and disoriented." },
      ],
    },
  },
  warrior: ADDED_PATH_LORE.warrior,
  rogue: {
    flame: {
      name: "Ashknife", epithet: "Smoke Between Sparks", passive: "Every Path dash leaves a burning trail at the place you abandoned.", ultimate: "Kindling Coup",
      ultimateBlurb: "Flash between marked foes, turning every departure and arrival into a chain of burning ambushes.",
      techniques: [
        { name: "Cinderstep", blurb: "Dash through your prey and leave an ember trail that burns enemies chasing through your old position." },
        { name: "Smoke Knife", blurb: "Vanish into smoke and reappear at the weakest opening, striking with a hotter finishing cut." },
      ],
    },
    frost: {
      name: "Glassblade", epithet: "the Cold Reflection", passive: "Striking an already chilled foe shatters the frost for heavy bonus damage.", ultimate: "Mirror Shatter",
      ultimateBlurb: "Move through a hall of frozen reflections, shattering every chilled target and vanishing before the shards settle.",
      techniques: [
        { name: "Mirrorstep", blurb: "Slip through a target in a flash of frost; a chilled victim shatters for bonus damage." },
        { name: "Shatterpoint", blurb: "Find the cold fault in the weakest foe, break it open, and escape behind a veil of ice." },
      ],
    },
    storm: {
      name: "Flashknife", epithet: "Ahead of Thunder", passive: "Your Path strikes interrupt prey and leave you moving faster than retaliation.", ultimate: "Stormstep",
      ultimateBlurb: "Become the interval before thunder, cutting through five foes and interrupting each before the sound arrives.",
      techniques: [
        { name: "Flashstep", blurb: "Cross the gap in a lightning flash, interrupting your target and stealing the tempo." },
        { name: "Thunder Feint", blurb: "Disappear from hostile attention, then return with an interrupting cut and a burst of speed." },
      ],
    },
    earth: {
      name: "Faultstep", epithet: "Beneath Notice", passive: "Your departures split the ground, slowing anyone who tries to follow.", ultimate: "Riven Floor",
      ultimateBlurb: "Carve fault after fault beneath the enemy line until the whole field breaks and pursuit becomes impossible.",
      techniques: [
        { name: "Seismic Slip", blurb: "Dash through a foe and leave a jagged, slowing fault where your pursuit began." },
        { name: "Rift Knife", blurb: "Break from attention and strike a weak point while the ground behind you hinders pursuit." },
      ],
    },
    venom: {
      name: "Viper", epithet: "the Patient Fang", passive: "Already corroded prey take increasingly vicious damage from your Path techniques.", ultimate: "Seven Venoms",
      ultimateBlurb: "Deliver a perfected dose to every exposed foe, deepening corrosion before the final venom finds the weakest heart.",
      techniques: [
        { name: "First Fang", blurb: "Dash through prey and begin the dose; already vulnerable targets suffer a deeper bite." },
        { name: "Mortal Dose", blurb: "Return to the weakest exposed foe with execution damage and a stronger corrosive mark." },
      ],
    },
    radiant: {
      name: "Sunblade", epithet: "No Shadow's Friend", passive: "Every clean Path strike flashes a protective ward onto the weakest ally.", ultimate: "Noonday Cut",
      ultimateBlurb: "Cross the field as a line of noon-bright steel, exposing foes while wards bloom across the band.",
      techniques: [
        { name: "Sunflash", blurb: "Dash through a foe in a burst of light, healing and warding the ally most in danger." },
        { name: "Noonday Feint", blurb: "Vanish in glare, strike the weakest opening, and leave protective light behind." },
      ],
    },
    blood: {
      name: "Redhand", epithet: "Collector of Debts", passive: "Wounded targets take greater execution damage, and a killing Path strike restores momentum.", ultimate: "Blood Ledger",
      ultimateBlurb: "Open the ledger across five wounded foes, collecting each debt in a chain of life-stealing executions.",
      techniques: [
        { name: "Red Advance", blurb: "Spend blood to cross the gap; the closer your prey is to death, the harder the cut lands." },
        { name: "Final Debt", blurb: "Collect from the weakest foe with execution force, reclaiming health and speed if it falls." },
      ],
    },
    shadow: {
      name: "Nightblade", epithet: "Where Lamps Fail", passive: "Path techniques erase hostile attention and wrap your new position in protective gloom.", ultimate: "Blackout",
      ultimateBlurb: "Extinguish the battlefield, cutting through marked foes while every enemy loses track of where you went.",
      techniques: [
        { name: "Gloamstep", blurb: "Pass through a target, shed hostile attention, and veil your arrival." },
        { name: "Blackout Cut", blurb: "Strike from nowhere, expose the weakest foe, and leave a smoke veil around your escape." },
      ],
    },
  },
  archer: {
    flame: {
      name: "Emberbow", epithet: "Fire on the Fletching", passive: "Path arrows fan their burn from each struck target into nearby ranks.", ultimate: "Ashen Rain",
      ultimateBlurb: "Loose a horizon of fire that ignites the full line and carries burning fragments into every clustered foe.",
      techniques: [
        { name: "Kindle Arrow", blurb: "Loose a piercing ember shaft whose fire spreads to enemies clustered around its target." },
        { name: "Cinderfall", blurb: "Drive a broad line of burning arrows through the formation, scattering flame from every hit." },
      ],
    },
    frost: {
      name: "Rimebow", epithet: "Winter's Measure", passive: "Long-range Path shots gain damage and hold their victims in deeper cold.", ultimate: "Whiteout Volley",
      ultimateBlurb: "Measure the entire field in one white line, rewarding distance with crushing impact and a lingering freeze.",
      techniques: [
        { name: "Winter Measure", blurb: "A patient shot that strikes harder and chills longer when loosed from true range." },
        { name: "Whitewind", blurb: "Send a wide frost line through the enemy, with distant targets taking the cruelest edge." },
      ],
    },
    storm: {
      name: "Galebow", epithet: "Rider of Crosswinds", passive: "Your lightning volleys quicken the nearest ally while their arcs seek clustered prey.", ultimate: "Tempest Quiver",
      ultimateBlurb: "Empty a quiver into the crosswind, chaining lightning through the enemy while the band races beneath the storm.",
      techniques: [
        { name: "Crosswind Arrow", blurb: "Loose a storm shaft that arcs to nearby prey and lends its momentum to an ally." },
        { name: "Tempest Line", blurb: "Draw a wide lightning line through the formation and quicken the band at your shoulder." },
      ],
    },
    earth: {
      name: "Flintshot", epithet: "the Patient Range", passive: "Distance gives Path arrows armor-breaking weight and exceptional stagger against bosses.", ultimate: "Stonefall",
      ultimateBlurb: "Drop the weight of a mountainside through the enemy line, crushing armor and breaking a great foe's poise.",
      techniques: [
        { name: "Flint Arrow", blurb: "A dense long shot that gains force with distance and cracks open the target's defense." },
        { name: "Stonepiercer", blurb: "Drive a broad fault-line arrow through the formation, heavily staggering great foes." },
      ],
    },
    venom: {
      name: "Thornshot", epithet: "Green Death", passive: "Every Path arrow marks prey with corrosion that the whole band can exploit.", ultimate: "Briar Tempest",
      ultimateBlurb: "Sew the battlefield with briars, spreading deep corrosion along the entire shot line and into clustered ranks.",
      techniques: [
        { name: "Thornmark", blurb: "Pin one target with a corrosive marker that rewards the band's focused attacks." },
        { name: "Briarfall", blurb: "Rake a wide line with poisoned thorns, spreading each mark into nearby enemies." },
      ],
    },
    radiant: {
      name: "Dawnshot", epithet: "the First Ray", passive: "Path shots seek the weakest ally with a healing spark and protective afterglow.", ultimate: "Sunrise Salvo",
      ultimateBlurb: "Draw sunrise across the battlefield, exposing the enemy line while healing light and wards find the whole band.",
      techniques: [
        { name: "First Ray", blurb: "Mark a foe with dawnlight while a healing spark seeks the ally most in danger." },
        { name: "Daybreak Volley", blurb: "Draw a line of judgment through several foes and leave a ward on the weakest ally." },
      ],
    },
    blood: {
      name: "Heartseeker", epithet: "the Pulse Between Ribs", passive: "Path arrows strike harder as either archer or quarry approaches death.", ultimate: "Crimson Constellation",
      ultimateBlurb: "Join wounded hearts in a single crimson line, gaining lethal force from every life balanced on the edge.",
      techniques: [
        { name: "Pulse Arrow", blurb: "Spend blood on a shot that gains force from your wounds and the target's missing health." },
        { name: "Heartline", blurb: "Thread the wounded enemy line with execution arrows and reclaim part of the price on impact." },
      ],
    },
    shadow: {
      name: "Gloamstalker", epithet: "Beyond the Firelight", passive: "After a Path volley you fade backward, break hostile attention, and sharpen your escape.", ultimate: "Moonless Hunt",
      ultimateBlurb: "Fire from a moonless horizon, then recede beyond pursuit while the enemy line searches the dark for you.",
      techniques: [
        { name: "Gloamshot", blurb: "Loose an exposing arrow and briefly veil yourself from retaliation." },
        { name: "Moonfall", blurb: "Cut a shadow line through the enemy, then slip backward under cover of protective gloom." },
      ],
    },
  },
  priest: {
    flame: {
      name: "Hearthkeeper", epithet: "Keeper of Embers", passive: "Allies touched by your Path healing kindle a damaging aura against nearby foes.", ultimate: "The Last Hearth",
      ultimateBlurb: "Gather the entire band at the last hearth, restoring them while every protected hero burns the enemies at their feet.",
      techniques: [
        { name: "Kindle", blurb: "Mend one ally and kindle an ember aura that burns foes fighting close to them." },
        { name: "Hearth Circle", blurb: "Consecrate a gathering place that restores nearby allies and sets surrounding enemies alight." },
      ],
    },
    frost: {
      name: "Winter Saint", epithet: "Mercy in Stillness", passive: "Your healing hardens allies while cold radiates outward to slow nearby foes.", ultimate: "Quietus Bell",
      ultimateBlurb: "Ring the still bell over the whole band, wrapping allies in winter guard and arresting every nearby enemy advance.",
      techniques: [
        { name: "Still Mercy", blurb: "Mend an ally, strip away slowing cold, and turn that frost outward against nearby foes." },
        { name: "Winter Chapel", blurb: "Raise a guarded refuge whose cold slows enemies pressing into its reach." },
      ],
    },
    storm: {
      name: "Tempest Cantor", epithet: "Voice of the Squall", passive: "Path healing carries haste to allies and an answering lightning note to nearby foes.", ultimate: "Choir of Thunder",
      ultimateBlurb: "Lead the full band in a thunder chorus, flooding allies with speed while lightning answers across the enemy ranks.",
      techniques: [
        { name: "Quickening Verse", blurb: "Mend an ally and quicken their hands while a lightning answer seeks the nearest foe." },
        { name: "Squall Chorus", blurb: "Raise a refuge of speed and send storm notes arcing through enemies beside it." },
      ],
    },
    earth: {
      name: "Stone Chaplain", epithet: "of the Deep Foundation", passive: "Every Path blessing adds both a ward and a layer of enduring guard.", ultimate: "Sanctuary Unbroken",
      ultimateBlurb: "Set the band's feet on an unbroken foundation, restoring everyone beneath great wards and mountain guard.",
      techniques: [
        { name: "Foundation", blurb: "Mend one ally and set stone beneath them, granting both guard and a protective ward." },
        { name: "Stone Sanctuary", blurb: "Consecrate firm ground that restores and armors every ally gathered there." },
      ],
    },
    venom: {
      name: "Plague Doctor", epithet: "Mercy with Teeth", passive: "Your Path blessings purge harmful effects and transfer their weakness into nearby enemies.", ultimate: "Bitter Communion",
      ultimateBlurb: "Draw every poison and weakness from the band, then return the gathered affliction to the enemy as a bitter communion.",
      techniques: [
        { name: "Bitter Tonic", blurb: "Mend one ally, purge burning and vulnerability, and turn the removed affliction against a nearby foe." },
        { name: "Cleansing Miasma", blurb: "Cleanse allies in a wide refuge, then spread the stolen corruption across nearby enemies." },
      ],
    },
    radiant: {
      name: "Lightwarden", epithet: "Bearer of Morning", passive: "Healing beyond full health becomes a lasting radiant ward instead of being lost.", ultimate: "Great Aurora",
      ultimateBlurb: "Pour an aurora over the whole band, converting every measure of excess healing into brilliant shields.",
      techniques: [
        { name: "Morning Grace", blurb: "Mend one ally; any healing beyond full health remains as a radiant ward." },
        { name: "Aurora Sanctuary", blurb: "Flood a refuge with healing light and turn every excess spark into protection." },
      ],
    },
    blood: {
      name: "Red Chalice", epithet: "Keeper of the Price", passive: "Your own blood empowers healing on near-death allies and spills mercy toward a second wounded hero.", ultimate: "Covenant of Blood",
      ultimateBlurb: "Bind the band's wounds into one covenant, paying your blood to restore those nearest death and sharing every surplus drop.",
      techniques: [
        { name: "Life Tithe", blurb: "Pay blood to mend one ally, with far greater power when their life hangs below half." },
        { name: "Scarlet Communion", blurb: "Share a blood-bought restoration through a gathered group, then spill mercy to the weakest ally." },
      ],
    },
    shadow: {
      name: "Gravekeeper", epithet: "Friend of the Last Road", passive: "Path blessings erase hostile attention and shelter wounded allies beneath smoke.", ultimate: "Lanterns Below",
      ultimateBlurb: "Light the lamps below for the entire band, restoring allies while smoke and forgotten names hide them from death.",
      techniques: [
        { name: "Last Lantern", blurb: "Mend one ally, soften the next blows against them, and dim hostile attention." },
        { name: "Graveside Vigil", blurb: "Raise a smoke-shrouded refuge that restores allies and makes the wounded difficult to pursue." },
      ],
    },
  },
  mage: {
    flame: {
      name: "Pyromancer", epithet: "the Unbound Spark", passive: "Focus and ultimate Path spells detonate an existing burn for bonus damage.", ultimate: "Crownfire",
      ultimateBlurb: "Crown the chosen ground in living fire, detonating every existing burn before kindling the survivors anew.",
      techniques: [
        { name: "Cinder Lance", blurb: "Hurl a compact burst that scorches every foe caught around the point of impact." },
        { name: "Furnace Sigil", blurb: "Inscribe a wide furnace; already burning targets erupt for bonus damage." },
      ],
    },
    frost: {
      name: "Cryomancer", epithet: "the Perfect Silence", passive: "Focus and ultimate Path spells freeze foes that were already chilled.", ultimate: "Absolute Winter",
      ultimateBlurb: "Impose absolute winter on a wide field, freezing every pre-chilled foe beneath a second, deeper silence.",
      techniques: [
        { name: "Rime Lance", blurb: "Burst frost around the point of impact, slowing every foe caught within." },
        { name: "Zero Sigil", blurb: "Inscribe a killing cold that briefly freezes enemies already carrying frost." },
      ],
    },
    storm: {
      name: "Stormweaver", epithet: "Hand on the Horizon", passive: "Your Path fields draw enemies inward while lightning chains outward and haste gathers on you.", ultimate: "Heaven's Engine",
      ultimateBlurb: "Set heaven's engine turning, drawing the enemy formation inward as lightning races across every foe caught.",
      techniques: [
        { name: "Arc Lance", blurb: "Burst lightning around the target point; the first strike chains outward and quickens your casting." },
        { name: "Tempest Sigil", blurb: "Inscribe a storm field that draws clustered enemies inward while arcs leap between them." },
      ],
    },
    earth: {
      name: "Geomancer", epithet: "Speaker for the Deep", passive: "Path sigils lend mountain guard to allies standing near their center and heavily stagger bosses.", ultimate: "Worldspine",
      ultimateBlurb: "Raise the worldspine through the chosen field, breaking enemy poise while stone guard closes around nearby allies.",
      techniques: [
        { name: "Stone Spear", blurb: "Break the ground beneath a target point, staggering foes and briefly armoring nearby allies." },
        { name: "Fault Sigil", blurb: "Inscribe a broad fault that crushes boss poise and shelters allies near its center." },
      ],
    },
    venom: {
      name: "Blightweaver", epithet: "Gardener of Ruin", passive: "Path spells bite harder into already vulnerable foes and deepen the corrosion they leave.", ultimate: "Verdant Doom",
      ultimateBlurb: "Cultivate a final garden of ruin, multiplying every existing weakness before poison flowers across the field.",
      techniques: [
        { name: "Blight Dart", blurb: "Burst venom at a target point, leaving every foe exposed to focused attacks." },
        { name: "Ruin Garden", blurb: "Inscribe a broad blight that deals bonus damage to already vulnerable enemies and deepens their corrosion." },
      ],
    },
    radiant: {
      name: "Luminary", epithet: "the Living Star", passive: "Every Path cast sheds healing sparks and turns stronger hits into wards for the weakest ally.", ultimate: "Second Sunrise",
      ultimateBlurb: "Ignite a second sunrise over the battlefield, exposing every foe while healing sparks and wards race back to the band.",
      techniques: [
        { name: "Starbolt", blurb: "Burst starlight around a target point and send a healing spark toward the weakest ally." },
        { name: "Dawn Sigil", blurb: "Inscribe a field of judgment whose light both exposes foes and wards the ally most in danger." },
      ],
    },
    blood: {
      name: "Sanguinist", epithet: "the Scarlet Equation", passive: "Missing health multiplies the damage of your Path spells, while each hit returns a measured share.", ultimate: "Heartstorm",
      ultimateBlurb: "Solve the scarlet equation across a wide field, spending life to unleash power proportional to every wound you carry.",
      techniques: [
        { name: "Sanguine Spear", blurb: "Pay blood to burst a target point; your missing health increases the spell's force." },
        { name: "Heart Sigil", blurb: "Inscribe a blood field whose damage rises with your wounds and feeds a portion back to you." },
      ],
    },
    shadow: {
      name: "Voidmancer", epithet: "Keeper of the Last Horizon", passive: "Path fields pull exposed enemies inward and hide your position beneath protective gloom.", ultimate: "Event Horizon",
      ultimateBlurb: "Collapse the last horizon, drawing the enemy formation into one exposed center while your own name vanishes from pursuit.",
      techniques: [
        { name: "Gloam Bolt", blurb: "Burst shadow at a target point, exposing foes while their formation is drawn inward." },
        { name: "Void Sigil", blurb: "Inscribe a wide void that pulls enemies together and erases hostile attention from you." },
      ],
    },
  },
  necromancer: ADDED_PATH_LORE.necromancer,
};

const DISCIPLINE_LOADOUT: Record<DisciplineId, {
  coreTarget: AbilityDef["targeting"];
  focusTarget: AbilityDef["targeting"];
  coreIcon: string;
  focusIcon: string;
}> = {
  knight: { coreTarget: "instant", focusTarget: "ray", coreIcon: "shieldslam", focusIcon: "groundbreaker" },
  warrior: { coreTarget: "instant", focusTarget: "ray", coreIcon: "cleave", focusIcon: "groundbreaker" },
  rogue: { coreTarget: "ray", focusTarget: "instant", coreIcon: "rush", focusIcon: "smokebomb" },
  archer: { coreTarget: "ray", focusTarget: "point", coreIcon: "pierce", focusIcon: "volley" },
  priest: { coreTarget: "ally", focusTarget: "point", coreIcon: "mend", focusIcon: "sanctuary" },
  mage: { coreTarget: "ray", focusTarget: "point", coreIcon: "missiles", focusIcon: "gravity" },
  necromancer: { coreTarget: "point", focusTarget: "point", coreIcon: "gravecall", focusIcon: "shadows" },
};

const PROMOTION_ROLES: Record<DisciplineId, readonly [string, string]> = {
  knight: ["Bastion", "Avenger"],
  warrior: ["Weaponmaster", "Berserker"],
  rogue: ["Phantom", "Saboteur"],
  archer: ["Deadeye", "Wayfinder"],
  priest: ["Hierophant", "Oracle"],
  mage: ["Archon", "Runebinder"],
  necromancer: ["Grave Shepherd", "Lich"],
};

const PROMOTION_PROMISES: Record<DisciplineId, readonly [string, string]> = {
  knight: ["Intercepts danger aimed at nearby allies; core techniques spread guard and Path ultimates fortify the whole formation.", "Turns damage endured into retaliation; focus techniques charge farther and Path ultimates punish every taunted foe."],
  warrior: ["Measured heavy blows cannot be interrupted and convert Fury into boss stagger and controlled cleaves.", "Missing health accelerates Fury; finishers steal life and Path ultimates become relentless execution chains."],
  rogue: ["The first hostile blow misses; movement techniques erase pursuit and leave a protective elemental decoy.", "Elemental conditions become traps and kill zones; striking exposed priority foes refreshes techniques."],
  archer: ["Holding position builds Focus, increasing range, boss stagger, and damage against a marked quarry.", "Movement builds Momentum; techniques reposition, ricochet, and leave elemental control behind."],
  priest: ["Overhealing becomes wards and the first fatal blow against a protected ally is prevented.", "Damage dealt by Path techniques heals the weakest ally; priority enemies receive harsher judgment."],
  mage: ["Elemental conditions combine into stronger reactions and Path fields grow into reliable control zones.", "Spells may overchannel for larger radius and force at the cost of health and longer recovery."],
  necromancer: ["Remains call durable guardians that intercept pressure and return elemental answers.", "Remains feed curses and spectral volleys; kills refund cooldown and empower the next death rite."],
};

export interface SpecializationProfile {
  rhythm: string;
  payoff: string;
  tradeoff: string;
  legacyCooldown: number;
}

/** The fourteen master specs are deliberately asymmetric. These profiles are
 * both player-facing doctrine and a single tuning ledger for portable skills. */
export const SPECIALIZATION_PROFILES: Record<DisciplineId, Record<SpecializationBranch, SpecializationProfile>> = {
  knight: {
    ascendant: { rhythm: "Stay close to the ally carrying the most pressure.", payoff: "Shared guard and emergency interception turn formation into armor.", tradeoff: "Lower personal finishing power than the Avenger.", legacyCooldown: 17 },
    paragon: { rhythm: "Taunt first, then answer every marked attacker.", payoff: "Retaliation converts endured pressure into a damaging charge loop.", tradeoff: "Protects distant allies less reliably than the Bastion.", legacyCooldown: 19 },
  },
  warrior: {
    ascendant: { rhythm: "Build Fury with deliberate arcs; spend only into armor or poise.", payoff: "Uninterruptible finishers deliver the strongest boss stagger.", tradeoff: "Less explosive while wounded than the Berserker.", legacyCooldown: 18 },
    paragon: { rhythm: "Fight near the red line and keep Fury moving.", payoff: "Speed, life-steal, and execution chains reward controlled risk.", tradeoff: "Sacrifices safety and stagger control.", legacyCooldown: 21 },
  },
  rogue: {
    ascendant: { rhythm: "Break pursuit after every commitment and attack from a new angle.", payoff: "Shroud and decoys erase mistakes while preserving assassination tempo.", tradeoff: "Creates fewer persistent kill zones than the Saboteur.", legacyCooldown: 16 },
    paragon: { rhythm: "Prepare ground, expose the priority target, then cash in the trap.", payoff: "Priority hits and kills accelerate the entire technique cycle.", tradeoff: "Needs setup and offers no emergency vanish.", legacyCooldown: 19 },
  },
  archer: {
    ascendant: { rhythm: "Hold a clean lane and commit to one quarry.", payoff: "Distance becomes damage, vulnerability, and boss stagger.", tradeoff: "Loses output when forced to reposition repeatedly.", legacyCooldown: 18 },
    paragon: { rhythm: "Move after every volley and fire into the space you opened.", payoff: "Momentum produces haste, ricochets, and safer firing lanes.", tradeoff: "Lower single-target pressure than the Deadeye.", legacyCooldown: 17 },
  },
  priest: {
    ascendant: { rhythm: "Read the next crisis before the health bar collapses.", payoff: "Overhealing becomes wards and critical allies receive a second chance.", tradeoff: "Contributes less pressure than the Oracle.", legacyCooldown: 18 },
    paragon: { rhythm: "Judge the priority enemy while tracking the weakest ally.", payoff: "Offense returns as focused healing and harsher priority punishment.", tradeoff: "Cannot prevent sudden damage as safely as the Hierophant.", legacyCooldown: 20 },
  },
  mage: {
    ascendant: { rhythm: "Layer conditions, then rewrite the field where they overlap.", payoff: "Reliable control zones force stronger elemental reactions.", tradeoff: "Lower burst ceiling than the Runebinder.", legacyCooldown: 19 },
    paragon: { rhythm: "Spend health only when a large cast can decide the exchange.", payoff: "Overchannel dramatically enlarges force and coverage.", tradeoff: "Long recovery and blood cost punish careless casting.", legacyCooldown: 22 },
  },
  necromancer: {
    ascendant: { rhythm: "Spend Remains near the ally currently absorbing pressure.", payoff: "Durable shades intercept attacks and return elemental answers.", tradeoff: "Fewer curse resets and less execution damage than the Lich.", legacyCooldown: 18 },
    paragon: { rhythm: "Seed a curse, claim a death, and reinvest the refunded tempo.", payoff: "Kills compound into larger death rites and spectral volleys.", tradeoff: "Guardians are brief and the loop weakens without corpses.", legacyCooldown: 21 },
  },
};

const ELEMENT_ABILITY_ICONS: Record<ElementId, string> = {
  flame: "fireball",
  frost: "frostwake",
  storm: "chainspark",
  earth: "stoneskin",
  venom: "caltrops",
  radiant: "radiance",
  blood: "warcry",
  shadow: "smokebomb",
};

const DISCIPLINE_TECHNIQUE_COPY: Record<DisciplineId, { name: string; blurb: string }> = {
  knight: { name: "Hold the Line", blurb: "Challenge nearby foes, batter their formation, and brace against the answer." },
  warrior: { name: "Committed Swing", blurb: "Carve a heavy arc, build Fury for every enemy struck, and punish clustered armor." },
  rogue: { name: "Opening Cut", blurb: "Cross the gap to a vulnerable foe, strike, and disappear from its attention." },
  archer: { name: "Pinning Shot", blurb: "Drive a precise shot downrange and punish the first enemy caught in its path." },
  priest: { name: "Guiding Light", blurb: "Mend one ally while judging the nearest threat beneath the same light." },
  mage: { name: "Arcane Pulse", blurb: "Collapse raw force at a chosen point and slow everything caught inside." },
  necromancer: { name: "Gravebind", blurb: "Curse one foe to rise as a servant when slain. A nearby corpse rises immediately; enemy deaths leave Remains for greater rites." },
};

const DISCIPLINE_TECHNIQUES = new Map<DisciplineId, AbilityDef>();
for (const discipline of DISCIPLINES) {
  const loadout = DISCIPLINE_LOADOUT[discipline.id];
  const copy = DISCIPLINE_TECHNIQUE_COPY[discipline.id];
  const gate: AbilityDef["gate"] = { attr: discipline.id === "knight" ? "vit" : discipline.id === "warrior" ? "str" : discipline.id === "rogue" || discipline.id === "archer" ? "dex" : discipline.id === "priest" ? "spi" : "int", value: 0 };
  const ability: AbilityDef = {
    id: `discipline-${discipline.id}`,
    name: copy.name,
    gate,
    targeting: loadout.coreTarget,
    cooldown: 12,
    color: discipline.color,
    icon: loadout.coreIcon,
    blurb: copy.blurb,
    discipline: discipline.id,
    pathSkill: "core",
  };
  DISCIPLINE_TECHNIQUES.set(discipline.id, ability);
  ABILITIES.push(ability);
}

export type SpecializationBranch = "ascendant" | "paragon";
export const SPECIALIZATION_MASTERY_LEVELS = 10;

const SPECIALIZATION_TECHNIQUE_COPY: Record<DisciplineId, Record<SpecializationBranch, { name: string; targeting: AbilityDef["targeting"]; icon: string; blurb: string }>> = {
  knight: {
    ascendant: { name: "Intercession", targeting: "ally", icon: "shieldslam", blurb: "Legacy: rush protection to an ally, intercept pressure, and express your current element as a warding reaction." },
    paragon: { name: "Answering Charge", targeting: "ray", icon: "rush", blurb: "Legacy: charge through a threat and turn your current element into retaliation." },
  },
  warrior: {
    ascendant: { name: "Masterstroke", targeting: "ray", icon: "cleave", blurb: "Legacy: a measured two-handed arc that heavily staggers and carries your current element." },
    paragon: { name: "Unbound Fury", targeting: "instant", icon: "warcry", blurb: "Legacy: trade safety for speed, then release your current element around you." },
  },
  rogue: {
    ascendant: { name: "Ghostwalk", targeting: "ray", icon: "smokebomb", blurb: "Legacy: slip to a chosen point, erase hostile attention, and leave an elemental decoy." },
    paragon: { name: "Prepared Ruin", targeting: "point", icon: "caltrops", blurb: "Legacy: plant an elemental trap that exposes the first enemies entering it." },
  },
  archer: {
    ascendant: { name: "Patient Mark", targeting: "ray", icon: "pierce", blurb: "Legacy: mark a priority target; the farther the shot travels, the harder the band can punish it." },
    paragon: { name: "Rolling Volley", targeting: "point", icon: "volley", blurb: "Legacy: reposition and loose an elemental volley into the space you just opened." },
  },
  priest: {
    ascendant: { name: "Saving Grace", targeting: "ally", icon: "mend", blurb: "Legacy: prevent the next crisis on one ally and shape the ward through your current element." },
    paragon: { name: "Condemnation", targeting: "point", icon: "radiance", blurb: "Legacy: judge enemies at a target point; damage dealt returns as healing to the weakest ally." },
  },
  mage: {
    ascendant: { name: "Elemental Rewrite", targeting: "point", icon: "gravity", blurb: "Legacy: intensify conditions at a point and trigger the reaction belonging to your current element." },
    paragon: { name: "Overchannel", targeting: "point", icon: "missiles", blurb: "Legacy: accept a longer recovery for a greatly enlarged elemental cast." },
  },
  necromancer: {
    ascendant: { name: "Grave Escort", targeting: "ally", icon: "gravecall", blurb: "Legacy: call an ancestral shade to guard an ally and answer attackers with your current element." },
    paragon: { name: "Death's Dividend", targeting: "point", icon: "shadows", blurb: "Legacy: consume deathly momentum in an elemental curse; kills partially refresh it." },
  },
};

export function specializationKey(discipline: DisciplineId, branch: SpecializationBranch): string {
  return `${discipline}-${branch}`;
}

export const SPECIALIZATION_TECHNIQUES: readonly AbilityDef[] = DISCIPLINES.flatMap((discipline) =>
  (["ascendant", "paragon"] as const).map((branch) => {
    const copy = SPECIALIZATION_TECHNIQUE_COPY[discipline.id][branch];
    return {
      id: `legacy-${discipline.id}-${branch}`,
      name: copy.name,
      gate: { attr: "str", value: 0 },
      targeting: copy.targeting,
      cooldown: SPECIALIZATION_PROFILES[discipline.id][branch].legacyCooldown,
      color: discipline.color,
      icon: copy.icon,
      blurb: copy.blurb,
      legacySpec: specializationKey(discipline.id, branch),
    } satisfies AbilityDef;
  }),
);
ABILITIES.push(...SPECIALIZATION_TECHNIQUES);

export function specializationTechnique(id: string | null | undefined): AbilityDef | null {
  if (!id) return null;
  return SPECIALIZATION_TECHNIQUES.find((ability) => ability.legacySpec === id || ability.id === id) ?? null;
}

const ELEMENT_TECHNIQUE_COPY: Record<ElementId, readonly [
  { name: string; blurb: string },
  { name: string; blurb: string },
  { name: string; blurb: string },
]> = {
  flame: [
    { name: "Emberbrand", blurb: "Power: concentrate flame into a punishing strike that feeds on existing burns." },
    { name: "Cinder Ring", blurb: "Control: spread fire through a formation and leave wounded enemies burning." },
    { name: "Phoenix Step", blurb: "Utility: answer with quick flame, then gain a brief ward and burst of momentum." },
  ],
  frost: [
    { name: "Ice Lance", blurb: "Power: focus winter into a piercing blow that rewards a prepared chill." },
    { name: "Permafrost Seal", blurb: "Control: deepen frost across a group and arrest its advance." },
    { name: "Rimeguard", blurb: "Utility: cast quickly, harden your footing, and raise a protective rim of ice." },
  ],
  storm: [
    { name: "Thunderbolt", blurb: "Power: discharge stored storm into one decisive impact." },
    { name: "Static Field", blurb: "Control: spread conductive pressure through clustered enemies." },
    { name: "Gale Step", blurb: "Utility: ride the current into faster movement and a shorter recovery." },
  ],
  earth: [
    { name: "Stonebreaker", blurb: "Power: bring concentrated weight down on armor and brittle ground." },
    { name: "Grasping Fault", blurb: "Control: split the field and slow enemies crossing the broken earth." },
    { name: "Earthen Aegis", blurb: "Utility: shape a quick defense from the ground beneath your feet." },
  ],
  venom: [
    { name: "Viper Strike", blurb: "Power: drive a precise dose into an already exposed target." },
    { name: "Miasma Cloud", blurb: "Control: poison a formation and make its recovery unreliable." },
    { name: "Antidote Draft", blurb: "Utility: move quickly through your own toxins behind a temporary ward." },
  ],
  radiant: [
    { name: "Sunlance", blurb: "Power: focus daylight into a searing line of judgment." },
    { name: "Hallowed Ground", blurb: "Control: consecrate a contested space and expose what remains inside." },
    { name: "Dawn Ward", blurb: "Utility: raise a fast shield and steady your next action." },
  ],
  blood: [
    { name: "Crimson Rend", blurb: "Power: pay blood to deliver a heavier strike against the wounded." },
    { name: "Hemorrhage Rite", blurb: "Control: open several wounds and turn a formation's pain against it." },
    { name: "Blood Pact", blurb: "Utility: trade a small price for speed, protection, and a quick recovery." },
  ],
  shadow: [
    { name: "Gloam Bolt", blurb: "Power: collapse shadow onto an exposed enemy." },
    { name: "Void Sigil", blurb: "Control: draw enemies toward a dark center and disrupt their pursuit." },
    { name: "Veilstep", blurb: "Utility: slip from attention behind a brief veil of protection." },
  ],
};

const ELEMENT_TECHNIQUES = new Map<ElementId, readonly [AbilityDef, AbilityDef, AbilityDef]>();
for (const element of ELEMENTS) {
  const variants = (["power", "control", "utility"] as const).map((variant, index) => {
    const copy = ELEMENT_TECHNIQUE_COPY[element.id][index];
    return {
      id: `element-${element.id}-${variant}`,
      name: copy.name,
      gate: { attr: "int", value: 0 },
      targeting: variant === "power" ? "ray" : variant === "control" ? "point" : "instant",
      cooldown: variant === "power" ? 20 : variant === "control" ? 18 : 14,
      color: element.color,
      icon: ELEMENT_ABILITY_ICONS[element.id],
      blurb: copy.blurb,
      element: element.id,
      pathSkill: "focus",
      pathVariant: variant,
    } satisfies AbilityDef;
  }) as [AbilityDef, AbilityDef, AbilityDef];
  ELEMENT_TECHNIQUES.set(element.id, variants);
  ABILITIES.push(...variants);
}

export function disciplineTechnique(discipline: DisciplineId): AbilityDef {
  return DISCIPLINE_TECHNIQUES.get(discipline)!;
}

export function elementTechniqueOptions(element: ElementId): readonly [AbilityDef, AbilityDef, AbilityDef] {
  return ELEMENT_TECHNIQUES.get(element)!;
}

/** Give the shared three mechanical variants the vocabulary and tactical promise
 * of the current Path. IDs remain stable for saves, while the battle bar reads as
 * Cindermaul, Ashcaller, or Dawn Paladin rather than three color-swapped spells. */
export function roleElementTechniqueOptions(
  discipline: DisciplineId,
  element: ElementId,
): readonly [AbilityDef, AbilityDef, AbilityDef] {
  const base = elementTechniqueOptions(element);
  const lore = PATH_LORE[discipline][element];
  const elementName = elementById(element)?.name ?? element;
  const disciplineName = DISCIPLINES.find((entry) => entry.id === discipline)?.name ?? discipline;
  const utilityPromises: Record<DisciplineId, string> = {
    knight: `Plant ${elementName} guard that draws pressure away from the band and shares protection with nearby allies.`,
    warrior: `Temper the greatsword with ${elementName}, converting momentum into Fury, guard, and a faster next commitment.`,
    rogue: `Use ${elementName} to break pursuit, change angles, and prepare the next execution without becoming a stationary caster.`,
    archer: `Claim the ${elementName} firing lane, sharpening focus while repositioning beyond the enemy front.`,
    priest: `Invoke ${elementName} as battlefield support: reshape danger and empower the ally best suited to answer it.`,
    mage: `Stabilize the ${elementName} field that changes spacing, tempo, and the shape of the next spell.`,
    necromancer: `Bind ${elementName} into stored Remains, strengthening the next servant or death rite instead of casting a simple heal.`,
  };
  return [
    { ...base[0], name: lore.techniques[0].name, blurb: lore.techniques[0].blurb },
    { ...base[1], name: lore.techniques[1].name, blurb: lore.techniques[1].blurb },
    { ...base[2], name: `${elementName} ${disciplineName} Rite`, blurb: utilityPromises[discipline] },
  ];
}

export function pathAbilities(discipline: DisciplineId, element: ElementId): readonly [AbilityDef, AbilityDef] {
  return [disciplineTechnique(discipline), roleElementTechniqueOptions(discipline, element)[0]];
}

export function resolvedPathAbilities(
  discipline: DisciplineId,
  element: ElementId,
  equipped: readonly string[] | undefined,
  masteredSpecializations: readonly string[] = [],
): readonly [AbilityDef, AbilityDef] {
  const core = disciplineTechnique(discipline);
  const choices = roleElementTechniqueOptions(discipline, element);
  const portable = SPECIALIZATION_TECHNIQUES.find((ability) =>
    equipped?.includes(ability.id) && !!ability.legacySpec && masteredSpecializations.includes(ability.legacySpec),
  );
  const chosen = portable ?? choices.find((ability) => equipped?.includes(ability.id)) ?? choices[0];
  return [core, chosen];
}

export const CALLINGS: CallingDef[] = DISCIPLINES.flatMap((discipline) =>
  ELEMENTS.map((element) => {
    const id = pathId(discipline.id, element.id);
    const lore = PATH_LORE[discipline.id][element.id];
    const [firstPromotion, secondPromotion] = PROMOTION_ROLES[discipline.id];
    const [firstPromise, secondPromise] = PROMOTION_PROMISES[discipline.id];
    const [coreSkill, focusSkill] = pathAbilities(discipline.id, element.id);
    return {
      id,
      discipline: discipline.id,
      element: element.id,
      name: lore.name,
      epithet: lore.epithet,
      crest: discipline.crest,
      color: element.color,
      entry: [],
      passive: `${discipline.passive} ${element.passive} ${lore.passive}`,
      abilityIds: [coreSkill.id, focusSkill.id],
      chargeHint: discipline.chargeHint,
      family: discipline.name,
      signature: {
        id: `${id}-ultimate`,
        name: lore.ultimate,
        gate: { attr: "str", value: 0 },
        targeting: discipline.id === "archer" || discipline.id === "mage" || discipline.id === "necromancer" ? "point" : discipline.id === "priest" ? "ally" : "instant",
        cooldown: 1,
        color: element.color,
        icon: ELEMENT_ABILITY_ICONS[element.id],
        blurb: `Ultimate: ${lore.ultimateBlurb}`,
        element: element.id,
        discipline: discipline.id,
        pathSkill: "ultimate",
      },
      advanced: [
        { id: `${id}-ascendant`, name: `${element.adjective} ${firstPromotion}`, epithet: "the Exalted Path", passive: firstPromise, ultNote: `${lore.ultimate} gains the ${firstPromotion}'s defining rule. Master this specialization over ${SPECIALIZATION_MASTERY_LEVELS} levels to carry ${SPECIALIZATION_TECHNIQUE_COPY[discipline.id].ascendant.name} to another Path.`, ...SPECIALIZATION_PROFILES[discipline.id].ascendant },
        { id: `${id}-paragon`, name: `${element.adjective} ${secondPromotion}`, epithet: "the Unbound Path", passive: secondPromise, ultNote: `${lore.ultimate} gains the ${secondPromotion}'s defining rule. Master this specialization over ${SPECIALIZATION_MASTERY_LEVELS} levels to carry ${SPECIALIZATION_TECHNIQUE_COPY[discipline.id].paragon.name} to another Path.`, ...SPECIALIZATION_PROFILES[discipline.id].paragon },
      ],
    } satisfies CallingDef;
  }),
);

export interface PathDoctrineNode {
  id: string;
  name: string;
  kind: "technique" | "ultimate" | "passive" | "craft" | "capstone";
  blurb: string;
  icon: string;
  pathLevel: number;
  attr: AttrKey | null;
  attrValue: number;
}

const DISCIPLINE_DOCTRINE_ATTR: Record<DisciplineId, AttrKey> = {
  knight: "vit",
  warrior: "str",
  rogue: "dex",
  archer: "dex",
  priest: "spi",
  mage: "int",
  necromancer: "int",
};

const ELEMENT_DOCTRINE_PROMISE: Record<ElementId, string> = {
  flame: "Burns deepen and feed harder finishers instead of merely adding red damage.",
  frost: "Chill grows into stronger control and more rewarding shatters.",
  storm: "Conductive hits carry farther while haste shortens the answer between casts.",
  earth: "Every impact adds guard, interruption, and extra pressure against boss poise.",
  venom: "Corrosion lasts longer and exposes the prey to the whole band.",
  radiant: "Offense returns as healing light, wards, and judgment against exposed foes.",
  blood: "The health price buys stronger execution, recovery, and wounded-target pressure.",
  shadow: "Gloom breaks pursuit, displaces prey, and sharpens vulnerability from safety.",
};

const DISCIPLINE_DOCTRINE_PROMISE: Record<DisciplineId, string> = {
  knight: "Guarded contact improves interception, taunts, and formation protection.",
  warrior: "Fury commits more force to cleaves, stagger, and the next finishing arc.",
  rogue: "Changing angles increases execution pressure and clears hostile attention.",
  archer: "A clean lane turns distance into focus, control, and boss pressure.",
  priest: "Every invocation carries its Attunement into protection as well as judgment.",
  mage: "Overlapping fields intensify conditions and make elemental reactions deliberate.",
  necromancer: "Remains strengthen servants, curses, and the death rite that follows.",
};

/** Ten authored milestones form a Path's compact Diablo-like road without
 * expanding the battle bar beyond two normal techniques and one ultimate. */
export function pathDoctrineNodes(path: CallingDef): readonly PathDoctrineNode[] {
  const discipline = disciplineById(path.discipline)!;
  const element = elementById(path.element)!;
  const choices = roleElementTechniqueOptions(path.discipline, path.element);
  const attr = DISCIPLINE_DOCTRINE_ATTR[path.discipline];
  return [
    { id: `${path.id}-core`, name: disciplineTechnique(path.discipline).name, kind: "technique", blurb: `Discipline: ${disciplineTechnique(path.discipline).blurb}`, icon: disciplineTechnique(path.discipline).icon, pathLevel: 0, attr: null, attrValue: 0 },
    { id: `${path.id}-power`, name: choices[0].name, kind: "technique", blurb: choices[0].blurb, icon: choices[0].icon, pathLevel: 0, attr: null, attrValue: 0 },
    { id: `${path.id}-control`, name: choices[1].name, kind: "technique", blurb: choices[1].blurb, icon: choices[1].icon, pathLevel: 0, attr: null, attrValue: 0 },
    { id: `${path.id}-utility`, name: choices[2].name, kind: "technique", blurb: choices[2].blurb, icon: choices[2].icon, pathLevel: 0, attr: null, attrValue: 0 },
    { id: `${path.id}-ultimate`, name: path.signature.name, kind: "ultimate", blurb: path.signature.blurb, icon: path.signature.icon, pathLevel: 0, attr: null, attrValue: 0 },
    { id: `${path.id}-oath`, name: `${path.name} Oath`, kind: "passive", blurb: path.passive, icon: path.crest, pathLevel: 1, attr: null, attrValue: 0 },
    { id: `${path.id}-temper`, name: `${element.adjective} Temper`, kind: "craft", blurb: ELEMENT_DOCTRINE_PROMISE[path.element], icon: element.icon, pathLevel: 3, attr, attrValue: 8 },
    { id: `${path.id}-cadence`, name: `${discipline.name} Cadence`, kind: "craft", blurb: DISCIPLINE_DOCTRINE_PROMISE[path.discipline], icon: discipline.crest, pathLevel: 5, attr, attrValue: 12 },
    { id: `${path.id}-echo`, name: `${path.signature.name} Echo`, kind: "craft", blurb: `The ${element.name} consequence of every Path technique gains force, duration, or reach.`, icon: path.signature.icon, pathLevel: 7, attr, attrValue: 16 },
    { id: `${path.id}-confluence`, name: `${path.name} Confluence`, kind: "capstone", blurb: `Discipline and ${element.name} answer as one: Path damage and support deepen by 12.5%.`, icon: element.icon, pathLevel: 10, attr, attrValue: 20 },
  ];
}

/** Number of earned doctrine passives (0-5). The five ability nodes are
 * available on swearing the Path; the remaining road is earned by practice
 * while automatic growth reaches the Discipline's defining thresholds. */
export function pathDoctrineRank(hero: HeroSave): number {
  const path = callingById(hero.calling);
  if (!path) return 0;
  const practice = Math.min(CALLING_MASTERY_LEVELS, hero.callingLevels[path.id] ?? 0);
  const attr = DISCIPLINE_DOCTRINE_ATTR[path.discipline];
  const value = hero.attrs[attr];
  return Number(practice >= 1)
    + Number(practice >= 3 && value >= 8)
    + Number(practice >= 5 && value >= 12)
    + Number(practice >= 7 && value >= 16)
    + Number(practice >= 10 && value >= 20);
}

/** Compatibility alias used by the older calling picker; every path is foundational now. */
export const FOUNDATIONAL_CALLING_IDS: readonly string[] = CALLINGS.map((calling) => calling.id);

export const LEGACY_CALLING_PATHS: Readonly<Record<string, { discipline: DisciplineId; element: ElementId }>> = {
  vanguard: { discipline: "knight", element: "earth" },
  reaver: { discipline: "rogue", element: "blood" },
  ranger: { discipline: "archer", element: "earth" },
  arcanist: { discipline: "mage", element: "storm" },
  chaplain: { discipline: "priest", element: "radiant" },
  trickster: { discipline: "rogue", element: "shadow" },
  duelist: { discipline: "rogue", element: "radiant" },
  warden: { discipline: "knight", element: "earth" },
  spellblade: { discipline: "knight", element: "storm" },
  nightblade: { discipline: "rogue", element: "shadow" },
  pyromancer: { discipline: "mage", element: "flame" },
  cryomancer: { discipline: "mage", element: "frost" },
  tempest: { discipline: "mage", element: "storm" },
  geomancer: { discipline: "mage", element: "earth" },
  exorcist: { discipline: "priest", element: "radiant" },
  bloodknight: { discipline: "knight", element: "blood" },
  seer: { discipline: "priest", element: "storm" },
  lancer: { discipline: "knight", element: "storm" },
  monk: { discipline: "rogue", element: "earth" },
  necromancer: { discipline: "mage", element: "shadow" },
  bard: { discipline: "priest", element: "storm" },
  alchemist: { discipline: "rogue", element: "venom" },
  trapper: { discipline: "archer", element: "venom" },
  warcrier: { discipline: "knight", element: "flame" },
};

/** Former level-20 choices retain their intent when their parent calling migrates. */
export const LEGACY_ADVANCED_BRANCH: Readonly<Record<string, "ascendant" | "paragon">> = {
  bulwarkSaint: "ascendant", warbreaker: "paragon", berserker: "ascendant", blademaster: "paragon",
  hawkeye: "ascendant", strider: "paragon", stormcaller: "ascendant", runebinder: "paragon",
  lightwarden: "ascendant", oracle: "paragon", shadowdancer: "ascendant", spellthief: "paragon",
  swordsaint: "ascendant", corsair: "paragon", oathkeeper: "ascendant", thornwarden: "paragon",
  runeknight: "ascendant", stormedge: "paragon", phantom: "ascendant", reaper: "paragon",
};

export function xpForLevel(level: number): number {
  return Math.round(40 * level * (1 + level * 0.35));
}

/** Once the road leaves Stormbreak, inactive companions can pay for one level
 * of catch-up training. The price scales hard enough to remain a meaningful
 * late-game sink without raising the active party's power ceiling. */
export const ROAD_TUTELAGE_STAGE = 18;
export function roadTutelageCost(level: number): number {
  return 250 + Math.max(1, level) * 60;
}

/** Kept as a named budget for save migration and balance tooling. These two
 * points are applied automatically; players no longer allocate attributes. */
export const POINTS_PER_LEVEL = 2;
export const MAX_EQUIPPED = 2;

// ------------------------------------------------------------------ talents

export const MAX_LEVEL = 100;

export type TalentTree =
  | "might" | "precision" | "sorcery" | "faith" | "bulwark" | "swiftness" | "fortune"
  | "command" | "elemental" | "blood" | "shadow" | "grave";

export interface TalentDef {
  id: string;
  tree: TalentTree;
  name: string;
  blurb: string; // per-rank effect, human readable
  maxRank: number;
  tier: 1 | 2 | 3 | 4 | 5; // deeper rows unlock at hero-level milestones
  keystone?: boolean; // one-rank talents that change how you fight
  requires?: string; // direct prerequisite, Diablo-style
}

export const TALENT_TREES: Record<TalentTree, { name: string; color: string; icon: string }> = {
  might: { name: "Might", color: "#e05c4b", icon: "⚔" },
  precision: { name: "Precision", color: "#58b368", icon: "🎯" },
  sorcery: { name: "Sorcery", color: "#b48ae8", icon: "✦" },
  faith: { name: "Faith", color: "#f2d16b", icon: "✚" },
  bulwark: { name: "Bulwark", color: "#8fd0a8", icon: "🛡" },
  swiftness: { name: "Swiftness", color: "#7bc8d8", icon: "»" },
  fortune: { name: "Gambit", color: "#e8b85a", icon: "◈" },
  command: { name: "Command", color: "#d6a85f", icon: "⚑" },
  elemental: { name: "Confluence", color: "#68b9d8", icon: "✦" },
  blood: { name: "Bloodcraft", color: "#c45564", icon: "◆" },
  shadow: { name: "Gloam", color: "#8e78bd", icon: "☾" },
  grave: { name: "Gravecraft", color: "#9eaa82", icon: "☠" },
};

/** Hero levels that open each row. Direct prerequisites still have to be learned. */
export const TALENT_TIER_LEVELS = [2, 8, 14, 22, 30] as const;
/** Commitment gates keep deep doctrines meaningful even when a hero branches. */
export const TALENT_TIER_POINTS = [0, 3, 7, 12, 18] as const;

export const TALENTS: TalentDef[] = [
  // MIGHT — hit harder
  { id: "ironGrip", tree: "might", tier: 1, name: "Iron Grip", blurb: "+3% melee damage", maxRank: 5 },
  { id: "slayer", tree: "might", tier: 1, name: "Slayer's Eye", blurb: "+2% melee damage and +2% crit", maxRank: 3 },
  { id: "battleRoar", tree: "might", tier: 2, name: "Battle Roar", blurb: "Kills whip you into a fury: +35% attack speed for 2.5s", maxRank: 1, keystone: true, requires: "ironGrip" },
  { id: "lastStand", tree: "might", tier: 2, name: "Last Stand", blurb: "+8% damage while below 30% health", maxRank: 3, requires: "slayer" },
  { id: "cleavingBlows", tree: "might", tier: 3, name: "Cleaving Blows", blurb: "Melee strikes splash 30% damage to other nearby foes", maxRank: 1, keystone: true, requires: "battleRoar" },
  { id: "relentless", tree: "might", tier: 4, name: "Relentless", blurb: "+3% melee damage and +2% attack speed", maxRank: 5, requires: "cleavingBlows" },
  { id: "warFeast", tree: "might", tier: 4, name: "War Feast", blurb: "Kills restore 2% maximum health", maxRank: 3, requires: "lastStand" },
  { id: "avatarOfWar", tree: "might", tier: 5, name: "Avatar of War", blurb: "+15% melee damage, +10% health; kills recover 2s of your Discipline technique", maxRank: 1, keystone: true, requires: "relentless" },
  { id: "redHarvest", tree: "might", tier: 5, name: "Red Harvest", blurb: "Kills restore another 8% maximum health", maxRank: 1, keystone: true, requires: "warFeast" },
  // PRECISION — the perfect shot
  { id: "keenEye", tree: "precision", tier: 1, name: "Keen Eye", blurb: "+3% ranged damage", maxRank: 5 },
  { id: "deadEye", tree: "precision", tier: 2, name: "Dead Eye", blurb: "+3% chance to crit for 60% extra", maxRank: 5, requires: "keenEye" },
  { id: "huntersMark", tree: "precision", tier: 2, name: "Hunter's Mark", blurb: "+25% damage to foes still at full health", maxRank: 1, keystone: true, requires: "keenEye" },
  { id: "twinArrows", tree: "precision", tier: 2, name: "Twin Arrows", blurb: "Every 4th ranged attack looses two missiles", maxRank: 1, keystone: true, requires: "keenEye" },
  { id: "executioner", tree: "precision", tier: 3, name: "Executioner", blurb: "Foes below a quarter health take double damage from you", maxRank: 1, keystone: true, requires: "deadEye" },
  { id: "huntersRhythm", tree: "precision", tier: 3, name: "Hunter's Rhythm", blurb: "+2% attack speed and move speed", maxRank: 3, requires: "twinArrows" },
  { id: "puncture", tree: "precision", tier: 4, name: "Puncture", blurb: "+3% ranged damage", maxRank: 5, requires: "executioner" },
  { id: "patientKiller", tree: "precision", tier: 4, name: "Patient Killer", blurb: "+2% critical chance and +2% ranged damage", maxRank: 3, requires: "huntersRhythm" },
  { id: "perfectVolley", tree: "precision", tier: 5, name: "Perfect Volley", blurb: "Twin Arrows now fires on every third ranged attack", maxRank: 1, keystone: true, requires: "puncture" },
  { id: "eagleSoul", tree: "precision", tier: 5, name: "Eagle Soul", blurb: "+12% ranged damage, +6% crit; critical attacks recover 0.75s of your elemental technique", maxRank: 1, keystone: true, requires: "patientKiller" },
  // SORCERY — the burning mind
  { id: "focus", tree: "sorcery", tier: 1, name: "Focus", blurb: "+4% spell power", maxRank: 5 },
  { id: "runeMemory", tree: "sorcery", tier: 1, name: "Rune Memory", blurb: "+2% spell power, -1% cooldowns", maxRank: 5 },
  { id: "attune", tree: "sorcery", tier: 2, name: "Attunement", blurb: "-3% ability cooldowns", maxRank: 5, requires: "focus" },
  { id: "kindledMind", tree: "sorcery", tier: 2, name: "Kindled Mind", blurb: "Your damaging spells scorch foes for 8 over 3s", maxRank: 1, keystone: true, requires: "runeMemory" },
  { id: "elementalConduit", tree: "sorcery", tier: 3, name: "Elemental Conduit", blurb: "Triggering an elemental reaction shaves 1.5 seconds from every technique", maxRank: 1, keystone: true, requires: "kindledMind" },
  { id: "archon", tree: "sorcery", tier: 3, name: "Archon", blurb: "+3% spell power and healing power", maxRank: 3, requires: "attune" },
  { id: "deepReservoir", tree: "sorcery", tier: 4, name: "Deep Reservoir", blurb: "+3% spell power and -1% cooldowns", maxRank: 5, requires: "archon" },
  { id: "arcanePulse", tree: "sorcery", tier: 4, name: "Arcane Pulse", blurb: "+4% spell power", maxRank: 3, requires: "kindledMind" },
  { id: "spellstorm", tree: "sorcery", tier: 5, name: "Spellstorm", blurb: "Kills reduce all technique cooldowns by 1 second", maxRank: 1, keystone: true, requires: "deepReservoir" },
  { id: "highArcanum", tree: "sorcery", tier: 5, name: "High Arcanum", blurb: "+15% spell power, −5% cooldowns; Power techniques crush triple boss poise", maxRank: 1, keystone: true, requires: "arcanePulse" },
  // FAITH — the mender's road
  { id: "springs", tree: "faith", tier: 1, name: "Vital Springs", blurb: "+4% healing power", maxRank: 5 },
  { id: "devotion", tree: "faith", tier: 1, name: "Devotion", blurb: "+2% healing, +1% armor", maxRank: 5 },
  { id: "aegis", tree: "faith", tier: 2, name: "Lesser Aegis", blurb: "Start battles with an 8 hp ward", maxRank: 5, requires: "devotion" },
  { id: "overflow", tree: "faith", tier: 3, name: "Overflow", blurb: "Overhealing spills onto the most wounded other ally", maxRank: 1, keystone: true, requires: "springs" },
  { id: "mendersWard", tree: "faith", tier: 3, name: "Mender's Ward", blurb: "Topping off an ally leaves a 10 hp ward on them", maxRank: 1, keystone: true, requires: "aegis" },
  { id: "sanctified", tree: "faith", tier: 4, name: "Sanctified", blurb: "+3% healing power and an opening 4 hp ward", maxRank: 5, requires: "mendersWard" },
  { id: "graceUnderFire", tree: "faith", tier: 4, name: "Grace Under Fire", blurb: "+4% healing power and +0.5% armor", maxRank: 3, requires: "overflow" },
  { id: "miracle", tree: "faith", tier: 5, name: "Miracle", blurb: "Once per battle, survive a fatal blow at 25% health", maxRank: 1, keystone: true, requires: "sanctified" },
  { id: "hierophant", tree: "faith", tier: 5, name: "Hierophant", blurb: "+15% healing power and an opening 15 hp ward", maxRank: 1, keystone: true, requires: "graceUnderFire" },
  // BULWARK — stand and be struck
  { id: "oxBlood", tree: "bulwark", tier: 1, name: "Ox Blood", blurb: "+3% max health", maxRank: 5 },
  { id: "thickHide", tree: "bulwark", tier: 1, name: "Thick Hide", blurb: "+1% armor", maxRank: 5 },
  { id: "stoneSkin", tree: "bulwark", tier: 2, name: "Stone Skin", blurb: "+1.5% armor", maxRank: 5, requires: "thickHide" },
  { id: "secondBreath", tree: "bulwark", tier: 2, name: "Second Breath", blurb: "Recover 6% health as each new fight begins", maxRank: 1, keystone: true, requires: "oxBlood" },
  { id: "holdFast", tree: "bulwark", tier: 3, name: "Hold Fast", blurb: "Once per battle below 35% health, gain a ward worth 18% of maximum health", maxRank: 1, keystone: true, requires: "secondBreath" },
  { id: "juggernaut", tree: "bulwark", tier: 3, name: "Juggernaut", blurb: "Cannot be stunned while above two-thirds health", maxRank: 1, keystone: true, requires: "stoneSkin" },
  { id: "fortress", tree: "bulwark", tier: 3, name: "Fortress", blurb: "+2% health and +0.5% armor", maxRank: 3, requires: "secondBreath" },
  { id: "ironHeart", tree: "bulwark", tier: 4, name: "Iron Heart", blurb: "+3% maximum health and +0.5% armor", maxRank: 5, requires: "juggernaut" },
  { id: "retaliation", tree: "bulwark", tier: 4, name: "Retaliation", blurb: "Return 5% of melee damage to the attacker", maxRank: 3, requires: "fortress" },
  { id: "undying", tree: "bulwark", tier: 5, name: "Undying", blurb: "Once per battle, survive a fatal blow at 15% health", maxRank: 1, keystone: true, requires: "ironHeart" },
  { id: "livingCitadel", tree: "bulwark", tier: 5, name: "Living Citadel", blurb: "+12% health, +5% armor; nearby allies take 10% less damage", maxRank: 1, keystone: true, requires: "retaliation" },
  // SWIFTNESS — never where the blow lands
  { id: "fleetFoot", tree: "swiftness", tier: 1, name: "Fleet Foot", blurb: "+3% move speed", maxRank: 5 },
  { id: "quickHands", tree: "swiftness", tier: 1, name: "Quick Hands", blurb: "+3% attack speed", maxRank: 5 },
  { id: "surefoot", tree: "swiftness", tier: 2, name: "Surefoot", blurb: "+2% move speed, -1% cooldowns", maxRank: 5, requires: "fleetFoot" },
  { id: "warEcho", tree: "swiftness", tier: 2, name: "War Echo", blurb: "-3% ability cooldowns", maxRank: 5, requires: "quickHands" },
  { id: "windStep", tree: "swiftness", tier: 3, name: "Wind Step", blurb: "Shrug off the first hit of every wave", maxRank: 1, keystone: true, requires: "surefoot" },
  { id: "momentum", tree: "swiftness", tier: 3, name: "Momentum", blurb: "+2% attack speed and +2% move", maxRank: 3, requires: "warEcho" },
  { id: "tempo", tree: "swiftness", tier: 4, name: "Tempo", blurb: "+2% attack speed and +2% move speed", maxRank: 5, requires: "momentum" },
  { id: "evasiveFootwork", tree: "swiftness", tier: 4, name: "Evasive Footwork", blurb: "+3% move speed and +0.5% armor", maxRank: 3, requires: "windStep" },
  { id: "afterimage", tree: "swiftness", tier: 5, name: "Afterimage", blurb: "Wind Step avoids the first two hits of every wave", maxRank: 1, keystone: true, requires: "tempo" },
  { id: "stormDancer", tree: "swiftness", tier: 5, name: "Storm Dancer", blurb: "+10% attack and move speed; Utility techniques grant a stronger haste", maxRank: 1, keystone: true, requires: "evasiveFootwork" },
  // GAMBIT — read the field, seize the opening
  { id: "luckyCharm", tree: "fortune", tier: 1, name: "Opening Gambit", blurb: "+2% critical chance", maxRank: 5 },
  { id: "providence", tree: "fortune", tier: 1, name: "Road Guard", blurb: "Start battles behind a 10 hp ward", maxRank: 5 },
  { id: "deepPockets", tree: "fortune", tier: 2, name: "Prepared Ambush", blurb: "Begin every wave with 20 ultimate charge", maxRank: 1, keystone: true, requires: "providence" },
  { id: "windfall", tree: "fortune", tier: 2, name: "Marked Quarry", blurb: "Kills grant ultimate charge; priority enemies grant three times as much", maxRank: 1, keystone: true, requires: "luckyCharm" },
  { id: "gamblersEdge", tree: "fortune", tier: 3, name: "Gambler's Edge", blurb: "+3% critical chance", maxRank: 3, requires: "windfall" },
  { id: "loadedDice", tree: "fortune", tier: 4, name: "Exploit Opening", blurb: "+2% critical chance", maxRank: 5, requires: "gamblersEdge" },
  { id: "scavenger", tree: "fortune", tier: 4, name: "Fieldcraft", blurb: "+2% move speed and −2% technique cooldowns", maxRank: 3, requires: "deepPockets" },
  { id: "fateweaver", tree: "fortune", tier: 5, name: "Fateweaver", blurb: "+5% critical chance and an opening 40 hp ward", maxRank: 1, keystone: true, requires: "loadedDice" },
  { id: "kingsRansom", tree: "fortune", tier: 5, name: "Against the Crown", blurb: "+20% damage against bosses and priority enemies", maxRank: 1, keystone: true, requires: "scavenger" },
  // COMMAND — make four heroes fight like one company
  { id: "fieldDrill", tree: "command", tier: 1, name: "Field Drill", blurb: "+2% attack speed and +1% move speed", maxRank: 5 },
  { id: "wardStandard", tree: "command", tier: 1, name: "Ward Standard", blurb: "Begin battle behind a 5 hp ward", maxRank: 5 },
  { id: "priorityOrders", tree: "command", tier: 2, name: "Priority Orders", blurb: "+15% damage to priority enemies", maxRank: 1, keystone: true, requires: "fieldDrill" },
  { id: "rallyPoint", tree: "command", tier: 2, name: "Rally Point", blurb: "At each wave, grant every ally an 8 hp ward", maxRank: 1, keystone: true, requires: "wardStandard" },
  { id: "formationCraft", tree: "command", tier: 3, name: "Formation Craft", blurb: "+2% health and +0.5% armor", maxRank: 3, requires: "rallyPoint" },
  { id: "decisiveCall", tree: "command", tier: 3, name: "Decisive Call", blurb: "A priority kill grants the whole company 8 ultimate charge", maxRank: 1, keystone: true, requires: "priorityOrders" },
  { id: "veteranCadence", tree: "command", tier: 4, name: "Veteran Cadence", blurb: "+2% attack speed and −1% technique cooldowns", maxRank: 5, requires: "decisiveCall" },
  { id: "shieldwallLesson", tree: "command", tier: 4, name: "Shieldwall Lesson", blurb: "+1% armor; nearby allies take 2% less damage", maxRank: 3, requires: "formationCraft" },
  { id: "grandMarshal", tree: "command", tier: 5, name: "Grand Marshal", blurb: "Priority kills also reset the killer's Discipline technique", maxRank: 1, keystone: true, requires: "veteranCadence" },
  { id: "oathStandard", tree: "command", tier: 5, name: "The Oath Standard", blurb: "Rally Point wards are doubled and nearby allies take 8% less damage", maxRank: 1, keystone: true, requires: "shieldwallLesson" },
  // CONFLUENCE — read weaknesses and turn conditions into reactions
  { id: "primalStudy", tree: "elemental", tier: 1, name: "Primal Study", blurb: "+3% spell power", maxRank: 5 },
  { id: "weakpointLore", tree: "elemental", tier: 1, name: "Weakpoint Lore", blurb: "+2% damage when striking an elemental weakness", maxRank: 5 },
  { id: "lingeringSigil", tree: "elemental", tier: 2, name: "Lingering Sigil", blurb: "+2% spell power and −1% technique cooldowns", maxRank: 5, requires: "primalStudy" },
  { id: "countercurrent", tree: "elemental", tier: 2, name: "Countercurrent", blurb: "Elemental weaknesses take another 10% damage", maxRank: 1, keystone: true, requires: "weakpointLore" },
  { id: "reactionWard", tree: "elemental", tier: 3, name: "Reaction Ward", blurb: "Triggering a reaction grants a ward worth 10% of maximum health", maxRank: 1, keystone: true, requires: "lingeringSigil" },
  { id: "volatileFormula", tree: "elemental", tier: 3, name: "Volatile Formula", blurb: "+4% spell power", maxRank: 3, requires: "countercurrent" },
  { id: "resonance", tree: "elemental", tier: 4, name: "Resonance", blurb: "+3% spell power and −1% technique cooldowns", maxRank: 5, requires: "reactionWard" },
  { id: "resistBreaker", tree: "elemental", tier: 4, name: "Break the Pattern", blurb: "Enemy elemental resistance is reduced by half", maxRank: 1, keystone: true, requires: "volatileFormula" },
  { id: "worldshaper", tree: "elemental", tier: 5, name: "Worldshaper", blurb: "Reactions deal 15% more damage and recover another second of techniques", maxRank: 1, keystone: true, requires: "resonance" },
  { id: "perfectAnswer", tree: "elemental", tier: 5, name: "Perfect Answer", blurb: "Weakness hits gain another 20% damage and build ultimate twice as fast", maxRank: 1, keystone: true, requires: "resistBreaker" },
  // BLOODCRAFT — trade safety for sustain and finishing pressure
  { id: "ironPulse", tree: "blood", tier: 1, name: "Iron Pulse", blurb: "+3% maximum health", maxRank: 5 },
  { id: "redEdge", tree: "blood", tier: 1, name: "Red Edge", blurb: "+2% melee, ranged, and spell damage", maxRank: 5 },
  { id: "hunger", tree: "blood", tier: 2, name: "Hunger", blurb: "Damage heals you for 1.5% of the amount dealt", maxRank: 3, requires: "ironPulse" },
  { id: "openVein", tree: "blood", tier: 2, name: "Open Vein", blurb: "+15% damage while below half health", maxRank: 1, keystone: true, requires: "redEdge" },
  { id: "bloodRush", tree: "blood", tier: 3, name: "Blood Rush", blurb: "Below half health, attack 20% faster", maxRank: 1, keystone: true, requires: "openVein" },
  { id: "crimsonRecovery", tree: "blood", tier: 3, name: "Crimson Recovery", blurb: "+2% health and +0.5% armor", maxRank: 3, requires: "hunger" },
  { id: "redDoctrine", tree: "blood", tier: 4, name: "Red Doctrine", blurb: "+3% damage and +1% critical chance", maxRank: 5, requires: "bloodRush" },
  { id: "deathDefied", tree: "blood", tier: 4, name: "Death Defied", blurb: "Once per battle, survive a fatal blow at 10% health", maxRank: 1, keystone: true, requires: "crimsonRecovery" },
  { id: "sanguineLord", tree: "blood", tier: 5, name: "Sanguine Lord", blurb: "Below half health, Hunger and Blood Rush are twice as strong", maxRank: 1, keystone: true, requires: "redDoctrine" },
  { id: "feastEternal", tree: "blood", tier: 5, name: "The Feast Eternal", blurb: "Kills heal 12% health and refresh Death Defied once", maxRank: 1, keystone: true, requires: "deathDefied" },
  // GLOAM — openings, flanks, and disappearing after the right kill
  { id: "duskStep", tree: "shadow", tier: 1, name: "Dusk Step", blurb: "+2% move speed and −1% technique cooldowns", maxRank: 5 },
  { id: "cruelOpening", tree: "shadow", tier: 1, name: "Cruel Opening", blurb: "+3% damage to uninjured enemies", maxRank: 5 },
  { id: "smokeMemory", tree: "shadow", tier: 2, name: "Smoke Memory", blurb: "Begin each wave behind a 6 hp ward", maxRank: 5, requires: "duskStep" },
  { id: "backstabber", tree: "shadow", tier: 2, name: "Turn the Knife", blurb: "Flanking damage rises from 25% to 45%", maxRank: 1, keystone: true, requires: "cruelOpening" },
  { id: "vanishingAct", tree: "shadow", tier: 3, name: "Vanishing Act", blurb: "A priority kill clears enemy attention from you", maxRank: 1, keystone: true, requires: "backstabber" },
  { id: "hush", tree: "shadow", tier: 3, name: "Hush", blurb: "+2% critical chance and +2% move speed", maxRank: 3, requires: "smokeMemory" },
  { id: "nightTempo", tree: "shadow", tier: 4, name: "Night Tempo", blurb: "+2% attack speed, move speed, and critical chance", maxRank: 5, requires: "vanishingAct" },
  { id: "umbralGuard", tree: "shadow", tier: 4, name: "Umbral Guard", blurb: "+4% move speed and begin battle behind a 10 hp ward", maxRank: 3, requires: "hush" },
  { id: "shadowMaster", tree: "shadow", tier: 5, name: "Shadow Master", blurb: "Vanishing Act also hastes you and resets your Utility technique", maxRank: 1, keystone: true, requires: "nightTempo" },
  { id: "noWitnesses", tree: "shadow", tier: 5, name: "No Witnesses", blurb: "+20% damage to isolated priority enemies and bosses", maxRank: 1, keystone: true, requires: "umbralGuard" },
  // GRAVECRAFT — curses, remains, and servants that keep fighting
  { id: "graveLore", tree: "grave", tier: 1, name: "Grave Lore", blurb: "+3% spell power", maxRank: 5 },
  { id: "boneTalisman", tree: "grave", tier: 1, name: "Bone Talisman", blurb: "Begin battle behind a 6 hp ward", maxRank: 5 },
  { id: "soulTithe", tree: "grave", tier: 2, name: "Soul Tithe", blurb: "Kills recover 0.5 seconds from every technique", maxRank: 3, requires: "graveLore" },
  { id: "corpseBloom", tree: "grave", tier: 2, name: "Corpse Bloom", blurb: "Slain cursed foes burst for 35% weapon damage", maxRank: 1, keystone: true, requires: "boneTalisman" },
  { id: "servantBond", tree: "grave", tier: 3, name: "Servant Bond", blurb: "Raised servants deal 15% more damage", maxRank: 3, requires: "soulTithe" },
  { id: "wastingTouch", tree: "grave", tier: 3, name: "Wasting Touch", blurb: "+15% damage to cursed enemies", maxRank: 1, keystone: true, requires: "corpseBloom" },
  { id: "deathCurrent", tree: "grave", tier: 4, name: "Death Current", blurb: "+3% spell power and −1% technique cooldowns", maxRank: 5, requires: "servantBond" },
  { id: "boneLegion", tree: "grave", tier: 4, name: "Bone Legion", blurb: "Focus and ultimate summons raise one additional servant", maxRank: 1, keystone: true, requires: "wastingTouch" },
  { id: "graveSovereign", tree: "grave", tier: 5, name: "Grave Sovereign", blurb: "Servants last 50% longer and strike 30% faster", maxRank: 1, keystone: true, requires: "deathCurrent" },
  { id: "paleCompact", tree: "grave", tier: 5, name: "The Pale Compact", blurb: "Curses spread on death and cursed foes take another 20% damage", maxRank: 1, keystone: true, requires: "boneLegion" },
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
    meleeDmg: r("ironGrip") * 0.03 + r("slayer") * 0.02 + r("relentless") * 0.03 + r("avatarOfWar") * 0.15 + r("redEdge") * 0.02 + r("redDoctrine") * 0.03,
    rangedDmg: r("keenEye") * 0.03 + r("puncture") * 0.03 + r("patientKiller") * 0.02 + r("eagleSoul") * 0.12 + r("redEdge") * 0.02 + r("redDoctrine") * 0.03,
    hpPct: r("oxBlood") * 0.03 + r("fortress") * 0.02 + r("ironHeart") * 0.03 + r("avatarOfWar") * 0.1 + r("livingCitadel") * 0.12 + r("formationCraft") * 0.02 + r("ironPulse") * 0.03 + r("crimsonRecovery") * 0.02,
    armorFlat: r("stoneSkin") * 0.015 + r("thickHide") * 0.01 + r("devotion") * 0.01 + r("fortress") * 0.005 + r("graceUnderFire") * 0.005 + r("ironHeart") * 0.005 + r("evasiveFootwork") * 0.005 + r("livingCitadel") * 0.05 + r("formationCraft") * 0.005 + r("shieldwallLesson") * 0.01 + r("crimsonRecovery") * 0.005,
    cdr: Math.min(0.45, r("warEcho") * 0.03 + r("attune") * 0.03 + r("runeMemory") * 0.01 + r("surefoot") * 0.01 + r("deepReservoir") * 0.01 + r("scavenger") * 0.02 + r("highArcanum") * 0.05 + r("veteranCadence") * 0.01 + r("lingeringSigil") * 0.01 + r("resonance") * 0.01 + r("duskStep") * 0.01 + r("deathCurrent") * 0.01),
    atkSpeed: r("quickHands") * 0.03 + r("huntersRhythm") * 0.02 + r("momentum") * 0.02 + r("relentless") * 0.02 + r("tempo") * 0.02 + r("stormDancer") * 0.1 + r("fieldDrill") * 0.02 + r("veteranCadence") * 0.02 + r("nightTempo") * 0.02,
    moveSpeed: r("fleetFoot") * 0.03 + r("huntersRhythm") * 0.02 + r("surefoot") * 0.02 + r("momentum") * 0.02 + r("tempo") * 0.02 + r("evasiveFootwork") * 0.03 + r("scavenger") * 0.02 + r("stormDancer") * 0.1 + r("fieldDrill") * 0.01 + r("duskStep") * 0.02 + r("hush") * 0.02 + r("nightTempo") * 0.02 + r("umbralGuard") * 0.04,
    crit: r("deadEye") * 0.03 + r("slayer") * 0.02 + r("luckyCharm") * 0.02 + r("gamblersEdge") * 0.03 + r("patientKiller") * 0.02 + r("eagleSoul") * 0.06 + r("loadedDice") * 0.02 + r("fateweaver") * 0.05 + r("redDoctrine") * 0.01 + r("hush") * 0.02 + r("nightTempo") * 0.02,
    spellPower: r("focus") * 0.04 + r("archon") * 0.03 + r("runeMemory") * 0.02 + r("deepReservoir") * 0.03 + r("arcanePulse") * 0.04 + r("highArcanum") * 0.15 + r("redEdge") * 0.02 + r("redDoctrine") * 0.03 + r("primalStudy") * 0.03 + r("lingeringSigil") * 0.02 + r("volatileFormula") * 0.04 + r("resonance") * 0.03 + r("graveLore") * 0.03 + r("deathCurrent") * 0.03,
    healPower: r("springs") * 0.04 + r("archon") * 0.03 + r("devotion") * 0.02 + r("sanctified") * 0.03 + r("graceUnderFire") * 0.04 + r("hierophant") * 0.15,
    startShield: r("aegis") * 8 + r("providence") * 10 + r("sanctified") * 4 + r("hierophant") * 15 + r("fateweaver") * 40 + r("wardStandard") * 5 + r("smokeMemory") * 6 + r("umbralGuard") * 10 + r("boneTalisman") * 6,
  };
}

/** One talent point per hero level after level 1, in the Diablo tradition. */
export function talentPointBudget(level: number): number {
  return Math.max(0, Math.min(level, MAX_LEVEL) - 1);
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
  { name: "Brutal", enemyMult: 1.75, rewardMult: 2.15, color: "#ff8a70", telegraph: 0.8, haste: 1.35, extraSpawn: 2 },
];

// ------------------------------------------------------------------ trinkets

export interface TrinketDef {
  id: string;
  name: string;
  blurb: string;
  rarity: "common" | "rare";
  icon: string;
  hook?: "packbreaker" | "reactionEcho" | "lastLight" | "priorityMark" | "graveWard";
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
  { id: "alphaFang", name: "Alpha's Fang", blurb: "+8% attack speed, +6% melee damage. Kills trigger Packbreaker haste.", rarity: "rare", icon: "🐺", hook: "packbreaker" },
  { id: "gorehornShard", name: "Gorehulk Horn Shard", blurb: "+10% melee damage, +30 health", rarity: "rare", icon: "🐮" },
  { id: "witchLocket", name: "Witchlight Locket", blurb: "+10% spell power, -5% cooldowns. Reactions echo 2 seconds into every technique.", rarity: "rare", icon: "🔮", hook: "reactionEcho" },
  { id: "saintRelic", name: "Saint's Relic", blurb: "+10% healing, battles start with a 20 hp ward. Once per battle, Last Light rallies a wounded band.", rarity: "rare", icon: "✨", hook: "lastLight" },
  { id: "moonPendant", name: "Moonlit Pendant", blurb: "-8% cooldowns, +6% spell power", rarity: "rare", icon: "🌙" },
  { id: "gravewardenSeal", name: "Gravewarden's Seal", blurb: "+6% armor, battles start with a 25 hp ward. The first fatal blow leaves you standing.", rarity: "rare", icon: "🗿", hook: "graveWard" },
  { id: "marksmanEye", name: "Marksman's Eye", blurb: "+10% ranged damage, +5% critical chance. Your first hit exposes each priority foe.", rarity: "rare", icon: "🎯", hook: "priorityMark" },
  { id: "harvestIdol", name: "Harvest Idol", blurb: "+12% healing, +20 health", rarity: "rare", icon: "🌾" },
  { id: "frostBead", name: "Frost Bead", blurb: "+8% spell power", rarity: "common", icon: "❄️" },
  { id: "wolfclawCharm", name: "Wolfclaw Charm", blurb: "+7% melee damage, +3% move", rarity: "common", icon: "🐾" },
  { id: "icemirror", name: "Ice Mirror", blurb: "-7% cooldowns", rarity: "common", icon: "🧊" },
  { id: "northstar", name: "Northstar Sliver", blurb: "+7% ranged damage, +3% crit", rarity: "common", icon: "⭐" },
  { id: "heartOfWinter", name: "Heart of Winter", blurb: "+12% health, +8% armor", rarity: "rare", icon: "💙" },
  { id: "aurorasTear", name: "Aurora's Tear", blurb: "-9% cooldowns, +8% healing", rarity: "rare", icon: "💧" },
  { id: "saltglass", name: "Saltglass Lens", blurb: "+5% spell power, +3% armor", rarity: "common", icon: "🔹" },
  { id: "tideknot", name: "Tide-Knot Cord", blurb: "+8% max health, +3% move speed", rarity: "common", icon: "🪢" },
  { id: "stormcoil", name: "Stormcoil", blurb: "-6% cooldowns, +5% ranged damage", rarity: "common", icon: "⚡" },
  { id: "reeftalon", name: "Reef Talon", blurb: "+7% melee damage, +3% critical chance", rarity: "common", icon: "🪸" },
  { id: "widowsChime", name: "The Widow's Chime", blurb: "+12% healing, -8% cooldowns, battles start with a 20 hp ward", rarity: "rare", icon: "🔔" },
  { id: "stormjawHeart", name: "Stormjaw's Heart", blurb: "+14% max health, +8% melee damage, +5% attack speed", rarity: "rare", icon: "🌊" },
  { id: "kilnmasterSigil", name: "Kilnmaster Sigil", blurb: "+8% spell power, +4% attack speed", rarity: "rare", icon: "♨" },
  { id: "cindermawCoal", name: "Cindermaw Coal", blurb: "+12% spell power, +4% armor", rarity: "rare", icon: "◆" },
  { id: "matriarchKnot", name: "Matriarch's Knot", blurb: "+10% max health, +6% healing", rarity: "rare", icon: "⌇" },
  { id: "colossusSeed", name: "Colossus Seed", blurb: "+15% max health, +10% healing", rarity: "rare", icon: "♣" },
  { id: "revenantGlass", name: "Revenant Glass", blurb: "+6% critical chance, +6% move speed", rarity: "rare", icon: "◐" },
  { id: "nightmotherSilk", name: "Nightmother Silk", blurb: "-10% cooldowns, +6% critical chance", rarity: "rare", icon: "☾" },
  { id: "inquisitorSeal", name: "Inquisitor's Seal", blurb: "+5% armor, battles start with a 20 hp ward", rarity: "rare", icon: "✥" },
  { id: "seraphicPinion", name: "Seraphic Pinion", blurb: "+12% healing, battles start with a 30 hp ward", rarity: "rare", icon: "✦" },
  { id: "rocPinion", name: "Tempest Pinion", blurb: "+7% ranged damage, +6% attack speed", rarity: "rare", icon: "ϟ" },
  { id: "skybreakerPrism", name: "Skybreaker Prism", blurb: "+10% ranged damage, +8% attack speed", rarity: "rare", icon: "◇" },
  { id: "huntsmanHorn", name: "Red Huntsman's Horn", blurb: "+8% melee damage, +5% critical chance", rarity: "rare", icon: "♞" },
  { id: "bloodmoonTine", name: "Bloodmoon Tine", blurb: "+12% melee damage, +6% critical chance", rarity: "rare", icon: "♜" },
  { id: "pilgrimCompass", name: "Broken Pilgrim Compass", blurb: "-7% cooldowns, +5% move speed", rarity: "rare", icon: "⌖" },
  { id: "lastWaystone", name: "The Last Waystone", blurb: "+10% max health, -8% cooldowns, +6% move speed", rarity: "rare", icon: "◈" },
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
    case "frostBead": return { ...none, spellPower: 0.08 };
    case "wolfclawCharm": return { ...none, meleeDmg: 0.07, moveSpeed: 0.03 };
    case "icemirror": return { ...none, cdr: 0.07 };
    case "northstar": return { ...none, rangedDmg: 0.07, crit: 0.03 };
    case "heartOfWinter": return { ...none, hpPct: 0.12, armorFlat: 0.08 };
    case "aurorasTear": return { ...none, cdr: 0.09, healPower: 0.08 };
    case "saltglass": return { ...none, spellPower: 0.05, armorFlat: 0.03 };
    case "tideknot": return { ...none, hpPct: 0.08, moveSpeed: 0.03 };
    case "stormcoil": return { ...none, cdr: 0.06, rangedDmg: 0.05 };
    case "reeftalon": return { ...none, meleeDmg: 0.07, crit: 0.03 };
    case "widowsChime": return { ...none, healPower: 0.12, cdr: 0.08, startShield: 20 };
    case "stormjawHeart": return { ...none, hpPct: 0.14, meleeDmg: 0.08, atkSpeed: 0.05 };
    case "kilnmasterSigil": return { ...none, spellPower: 0.08, atkSpeed: 0.04 };
    case "cindermawCoal": return { ...none, spellPower: 0.12, armorFlat: 0.04 };
    case "matriarchKnot": return { ...none, hpPct: 0.1, healPower: 0.06 };
    case "colossusSeed": return { ...none, hpPct: 0.15, healPower: 0.1 };
    case "revenantGlass": return { ...none, crit: 0.06, moveSpeed: 0.06 };
    case "nightmotherSilk": return { ...none, cdr: 0.1, crit: 0.06 };
    case "inquisitorSeal": return { ...none, armorFlat: 0.05, startShield: 20 };
    case "seraphicPinion": return { ...none, healPower: 0.12, startShield: 30 };
    case "rocPinion": return { ...none, rangedDmg: 0.07, atkSpeed: 0.06 };
    case "skybreakerPrism": return { ...none, rangedDmg: 0.1, atkSpeed: 0.08 };
    case "huntsmanHorn": return { ...none, meleeDmg: 0.08, crit: 0.05 };
    case "bloodmoonTine": return { ...none, meleeDmg: 0.12, crit: 0.06 };
    case "pilgrimCompass": return { ...none, cdr: 0.07, moveSpeed: 0.05 };
    case "lastWaystone": return { ...none, hpPct: 0.1, cdr: 0.08, moveSpeed: 0.06 };
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
export const BOSS_STAGES = [4, 5, 11, 15, 17, 21, 23, 27, 29, 33, 35, 39, 41, 45, 47, 51, 53, 57, 59];

/** Health thresholds belong to the boss definition, not the HUD. */
export const BOSS_PHASES: Partial<Record<EnemyKind, number[]>> = {
  alpha: [0.6, 0.3], ogre: [0.66, 0.33], warlord: [0.66, 0.33], rimeheart: [0.66, 0.33],
  wyrm: [0.66, 0.33], bellwidow: [0.66, 0.33], stormjaw: [0.68, 0.34],
  ...LATE_BOSS_PHASES,
};

/** Phased bosses that can actually be encountered in the current campaign. */
export const STAGED_BOSS_KINDS = (Object.keys(BOSS_PHASES) as EnemyKind[]).filter((kind) =>
  STAGES.some((stage) => stage.waves.some((wave) => wave.some((entry) => entry.kind === kind))),
);

/** One-off bosses reveal a useful record after one victory; common foes reward repeated study. */
export function bestiaryThresholds(kind: EnemyKind): { study: number; mastery: number } {
  return STAGED_BOSS_KINDS.includes(kind)
    ? { study: 1, mastery: 1 }
    : { study: 10, mastery: 25 };
}

export interface ContractDef {
  id: string;
  name: string;
  issuer: string;
  stage: number;
  unlockStage: number;
  brief: string;
  condition: "flawless" | "threeHeroes" | "swift" | "hard";
  target?: number;
  reward: number;
}

/** Tavern work reuses campaign ground but changes what counts as a successful job. */
export const CONTRACTS: ContractDef[] = [
  { id: "cleanSweep", name: "No Graves Tonight", issuer: "Millbrook reeve", stage: 2, unlockStage: 2, brief: "Clear Mirebrook Hollow without losing a hero.", condition: "flawless", reward: 130 },
  { id: "leanCompany", name: "Three Shares", issuer: "South-road factor", stage: 3, unlockStage: 3, brief: "Clear the Charwood with no more than three active heroes.", condition: "threeHeroes", reward: 165 },
  { id: "bellBeforeDark", name: "Before the Bell", issuer: "Winterreach courier", stage: 8, unlockStage: 8, brief: "Cross the Frozen Lake in under 55 seconds.", condition: "swift", target: 55, reward: 230 },
  { id: "hardTerms", name: "Salt in the Wound", issuer: "Stormbreak quartermaster", stage: 13, unlockStage: 13, brief: "Clear the Weeping Reeds on Hard or Brutal.", condition: "hard", reward: 320 },
];

export interface ContractResult {
  heroDeaths: number;
  activeHeroes: number;
  time: number;
  difficulty: number;
}

export function contractFulfilled(contract: ContractDef, result: ContractResult): boolean {
  if (contract.condition === "flawless") return result.heroDeaths === 0;
  if (contract.condition === "threeHeroes") return result.activeHeroes <= 3;
  if (contract.condition === "swift") return result.time <= (contract.target ?? Infinity);
  return result.difficulty >= 2;
}

export function arenaPurse(stage: number, firstClear: boolean): number {
  return 70 + stage * 9 + (firstClear ? 120 : 0);
}

export interface ArenaTrialDef {
  id: string;
  name: string;
  subtitle: string;
  bossStages: readonly [number, number, number];
  marks: number;
  purse: number;
  scale: number;
}

/** Curated boss gauntlets. The party carries health and cooldowns from one
 * contender to the next; the later foe sets the arena's baseline strength. */
export const ARENA_TRIALS: readonly ArenaTrialDef[] = [
  { id: "fang-horn-crown", name: "Trial of Fang, Horn & Crown", subtitle: "The first three names cut into the Ring.", bossStages: [4, 5, 11], marks: 5, purse: 420, scale: 0.92 },
  { id: "bell-jaw-maw", name: "Trial of Bell, Jaw & Maw", subtitle: "Tidewater gives way to the furnace mouth.", bossStages: [15, 17, 23], marks: 6, purse: 620, scale: 0.96 },
  { id: "root-grove-night", name: "Trial of Root, Grove & Night", subtitle: "The living wood walks beneath a false moon.", bossStages: [27, 29, 35], marks: 7, purse: 840, scale: 1 },
  { id: "gold-wing-storm", name: "Trial of Gold, Wing & Storm", subtitle: "Judgment climbs until the sky breaks.", bossStages: [39, 41, 47], marks: 8, purse: 1080, scale: 1.04 },
  { id: "horn-stag-road", name: "Trial of Horn, Stag & Road", subtitle: "The last hunt ends where every journey opens.", bossStages: [51, 53, 59], marks: 10, purse: 1400, scale: 1.08 },
] as const;

export function arenaTrialById(id: string | null | undefined): ArenaTrialDef | null {
  return ARENA_TRIALS.find((trial) => trial.id === id) ?? null;
}

export function arenaTrialPurse(trial: ArenaTrialDef, firstClear: boolean): number {
  return trial.purse + (firstClear ? Math.round(trial.purse * 0.5) : 0);
}

export function contractPurse(contract: ContractDef, firstClear: boolean, fulfilled: boolean): number {
  if (!fulfilled) return Math.round(contract.reward * 0.2);
  return contract.reward + (firstClear ? Math.round(contract.reward * 0.5) : 0);
}

// ------------------------------------------------------------------ deeds

export interface DeedDef {
  id: string;
  name: string;
  blurb: string;
  done: (save: SaveData) => boolean;
  progress?: (save: SaveData) => string;
}

/** The chronicle's deeds — every one is provable from the save itself. */
export const DEEDS: DeedDef[] = [
  {
    id: "firstBlood",
    name: "First Blood",
    blurb: "Slay your first foe.",
    done: (s) => s.lifetime.kills >= 1,
  },
  {
    id: "centurion",
    name: "Centurion",
    blurb: "A hundred foes put down.",
    done: (s) => s.lifetime.kills >= 100,
    progress: (s) => `${Math.min(100, s.lifetime.kills)}/100`,
  },
  {
    id: "ogrefall",
    name: "Ogrefall",
    blurb: "Fell Mosstooth, the Thornwood ogre.",
    done: (s) => (s.bestiary.ogre ?? 0) >= 1,
  },
  {
    id: "wolfsbane",
    name: "Wolfsbane",
    blurb: "Bring down the Night Alpha.",
    done: (s) => (s.bestiary.alpha ?? 0) >= 1,
  },
  {
    id: "warbreaker",
    name: "Warbreaker",
    blurb: "Break the Goblin Warlord.",
    done: (s) => (s.bestiary.warlord ?? 0) >= 1,
  },
  {
    id: "untouched",
    name: "Untouched",
    blurb: "Win a battle without a single hero falling.",
    done: (s) => s.lifetime.flawless >= 1,
  },
  {
    id: "fullHouse",
    name: "Full House",
    blurb: "Every seat at the campfire filled — six heroes hired.",
    done: (s) => s.heroes.every((h) => h.recruited),
    progress: (s) => `${s.heroes.filter((h) => h.recruited).length}/${s.heroes.length}`,
  },
  {
    id: "oathbound",
    name: "Oathbound",
    blurb: "A hero begins their first elemental Path.",
    done: (s) => s.heroes.some((h) => h.calling),
  },
  {
    id: "ascendant",
    name: "Ascendant",
    blurb: "A seasoned hero earns their first Path Promotion.",
    done: (s) => s.heroes.some((h) => h.advCalling),
  },
  {
    id: "scholar",
    name: "Scholar of the Band",
    blurb: "Fifteen techniques recorded in the band's archive.",
    done: (s) => s.unlockedSpells.length >= 15,
    progress: (s) => `${Math.min(15, s.unlockedSpells.length)}/15`,
  },
  {
    id: "tinker",
    name: "Tinker's Friend",
    blurb: "Fuse two trinkets into something rare.",
    done: (s) => s.lifetime.fuses >= 1,
  },
  {
    id: "brutalist",
    name: "No Quarter",
    blurb: "Clear any stage on Brutal.",
    done: (s) => s.lifetime.brutalClears >= 1,
  },
  {
    id: "roadsEnd",
    name: "The Road's End",
    blurb: "Clear the final stage of the Long Road.",
    done: (s) => (s.stageStats[STAGES.length - 1]?.clears ?? 0) >= 1,
  },
];
