import type {
  AbilityDef,
  Attributes,
  AttrKey,
  DerivedStats,
  EnemyKind,
  HeroSave,
  SaveData,
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
  /** Body-shape multipliers so silhouettes differ below the neck too. */
  build: { torso: number; limb: number; head: number };
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
for (const a of ABILITIES) a.cooldown = Math.round(a.cooldown * 2.5);

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
  slot?: ArmorSlot; // omitted = body (the piece that carries family identity, hook, and skill)
  tint?: string; // metal/cloth accent on the sprite (mail/plate families)
  hook?: "dodgeFirstHit" | "burnOnSpell" | "allyAura" | "waveShield" | "regen" | "retaliate" | "slowProof";
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

// --- armor skills: the worn body piece's family grants a fifth battle button ---

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

export function unlockedAbilities(attrs: Attributes): AbilityDef[] {
  return ABILITIES.filter((a) => attrs[a.gate.attr] >= a.gate.value);
}

/** Each calling favors an art; swearing its oath steadies the hand that way. */
const CALLING_WEAPON_AFFINITY: Record<string, AttrKey> = {
  duelist: "str",
  warden: "str",
  spellblade: "str",
  nightblade: "dex",
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
  family: string; // picker grouping (Iron, Blade, Hunt, Elemental, Faith & Shadow, Song & Craft)
  advanced?: [AdvCallingDef, AdvCallingDef]; // level-20 branch choice (the founding ten)
}

// --- boons: level-up gifts, one chosen of two offered — a hero's personal story ---

export interface BoonDef {
  id: string;
  name: string;
  blurb: string;
  rarity: "common" | "rare";
  mods: Partial<{ hpFlat: number; armorFlat: number; moveSpeed: number; atkSpeed: number; spellPower: number; healPower: number; rangedDmg: number; meleeDmg: number; cdr: number; crit: number; ultRate: number }>;
}

export const BOONS: BoonDef[] = [
  { id: "oakheart", name: "Oakheart", blurb: "+14 health", rarity: "common", mods: { hpFlat: 14 } },
  { id: "keenEdge", name: "Keen Edge", blurb: "+4% melee damage", rarity: "common", mods: { meleeDmg: 0.04 } },
  { id: "trueFlight", name: "True Flight", blurb: "+4% ranged damage", rarity: "common", mods: { rangedDmg: 0.04 } },
  { id: "quickHands", name: "Quick Hands", blurb: "+3% attack speed", rarity: "common", mods: { atkSpeed: 0.03 } },
  { id: "lightStep", name: "Light Step", blurb: "+3% move speed", rarity: "common", mods: { moveSpeed: 0.03 } },
  { id: "ironSkin", name: "Iron Skin", blurb: "+2% armor", rarity: "common", mods: { armorFlat: 0.02 } },
  { id: "clearMind", name: "Clear Mind", blurb: "+3% spell power", rarity: "common", mods: { spellPower: 0.03 } },
  { id: "kindSoul", name: "Kind Soul", blurb: "+4% healing", rarity: "common", mods: { healPower: 0.04 } },
  { id: "steadyBreath", name: "Steady Breath", blurb: "−2% cooldowns", rarity: "common", mods: { cdr: 0.02 } },
  { id: "luckyCoin", name: "Lucky Coin", blurb: "+2% critical chance", rarity: "common", mods: { crit: 0.02 } },
  { id: "giantsBlood", name: "Giant's Blood", blurb: "+30 health", rarity: "rare", mods: { hpFlat: 30 } },
  { id: "secondSkin", name: "Second Skin", blurb: "+4% armor", rarity: "rare", mods: { armorFlat: 0.04 } },
  { id: "huntersEye", name: "Hunter's Eye", blurb: "+5% critical chance", rarity: "rare", mods: { crit: 0.05 } },
  { id: "wolfsHeart", name: "Wolf's Heart", blurb: "Ultimate charges 12% faster", rarity: "rare", mods: { ultRate: 0.12 } },
];

export function boonById(id: string): BoonDef | undefined {
  return BOONS.find((b) => b.id === id);
}

/** Two distinct boons offered at a level-up; rares turn up now and then. */
export function rollBoonPair(): { a: string; b: string } {
  const commons = BOONS.filter((b) => b.rarity === "common");
  const rares = BOONS.filter((b) => b.rarity === "rare");
  const pick = () => (Math.random() < 0.16 ? rares[Math.floor(Math.random() * rares.length)] : commons[Math.floor(Math.random() * commons.length)]);
  const a = pick();
  let b = pick();
  let guard = 0;
  while (b.id === a.id && guard++ < 10) b = pick();
  return { a: a.id, b: b.id };
}

export function boonMods(boons: string[] | undefined) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpFlat: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, ultRate: 0 };
  if (!boons) return m;
  for (const id of boons) {
    const b = boonById(id);
    if (!b) continue;
    m.meleeDmg += b.mods.meleeDmg ?? 0;
    m.rangedDmg += b.mods.rangedDmg ?? 0;
    m.hpFlat += b.mods.hpFlat ?? 0;
    m.armorFlat += b.mods.armorFlat ?? 0;
    m.cdr += b.mods.cdr ?? 0;
    m.atkSpeed += b.mods.atkSpeed ?? 0;
    m.moveSpeed += b.mods.moveSpeed ?? 0;
    m.crit += b.mods.crit ?? 0;
    m.spellPower += b.mods.spellPower ?? 0;
    m.healPower += b.mods.healPower ?? 0;
    m.ultRate += b.mods.ultRate ?? 0;
  }
  return m;
}

/** The band's public face: its most seasoned member. */
export function bandLevel(save: { heroes: { recruited: boolean; level: number }[] }): number {
  return Math.max(1, ...save.heroes.filter((h) => h.recruited).map((h) => h.level));
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
  return calling.entry.every((e) => attrs[e.attr] >= e.value);
}

function callingStatMods(calling?: string | null, advCalling?: string | null) {
  const m = { meleeDmg: 0, rangedDmg: 0, hpPct: 0, armorFlat: 0, cdr: 0, atkSpeed: 0, moveSpeed: 0, crit: 0, spellPower: 0, healPower: 0, startShield: 0 };
  switch (calling) {
    case "duelist":
      m.atkSpeed += 0.08;
      break;
    case "warden":
      m.hpPct += 0.12;
      break;
    case "spellblade":
      m.spellPower += 0.08;
      break;
    case "nightblade":
      m.moveSpeed += 0.08;
      break;
  }
  switch (advCalling) {
    case "swordsaint":
      m.crit += 0.1;
      break;
    case "corsair":
      m.moveSpeed += 0.08;
      m.atkSpeed += 0.06;
      break;
    case "oathkeeper":
      break;
    case "thornwarden":
      break;
    case "runeknight":
      m.spellPower += 0.08;
      m.hpPct += 0.1;
      break;
    case "stormedge":
      m.atkSpeed += 0.08;
      break;
    case "phantom":
      m.moveSpeed += 0.08;
      break;
    case "reaper":
      break;
  }
  switch (calling) {
    case "pyromancer": m.spellPower += 0.10; break;
    case "cryomancer": m.spellPower += 0.06; m.cdr += 0.04; break;
    case "tempest": m.spellPower += 0.05; m.atkSpeed += 0.05; break;
    case "geomancer": m.armorFlat += 0.04; m.spellPower += 0.05; break;
    case "exorcist": m.spellPower += 0.06; m.healPower += 0.06; break;
    case "bloodknight": m.meleeDmg += 0.05; m.hpPct += 0.06; break;
    case "seer": m.healPower += 0.08; break;
    case "lancer": m.meleeDmg += 0.05; m.moveSpeed += 0.06; break;
    case "monk": m.atkSpeed += 0.06; m.armorFlat += 0.02; break;
    case "necromancer": m.spellPower += 0.08; break;
    case "bard": m.cdr += 0.06; m.healPower += 0.04; break;
    case "alchemist": m.cdr += 0.08; break;
    case "trapper": m.rangedDmg += 0.05; m.cdr += 0.04; break;
    case "warcrier": m.hpPct += 0.05; m.healPower += 0.04; break;
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

/** Total ability-cooldown reduction from talents, trinket, calling(s), and boons. */
export function cooldownReduction(hero: HeroSave): number {
  return Math.min(
    0.5,
    talentMods(hero.talents).cdr + trinketMods(hero.trinket).cdr + callingStatMods(hero.calling, hero.advCalling).cdr + boonMods(hero.boons).cdr,
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
  boons?: string[],
): DerivedStats {
  const t = talentMods(talents);
  const k = trinketMods(trinket);
  const c = callingStatMods(calling, advCalling);
  const v = gearMods(armor);
  const bn = boonMods(boons);
  const mods = {
    meleeDmg: t.meleeDmg + k.meleeDmg + c.meleeDmg + v.meleeDmg + bn.meleeDmg,
    rangedDmg: t.rangedDmg + k.rangedDmg + c.rangedDmg + v.rangedDmg + bn.rangedDmg,
    hpPct: t.hpPct + k.hpPct + c.hpPct + v.hpPct,
    armorFlat: t.armorFlat + k.armorFlat + c.armorFlat + v.armorFlat + bn.armorFlat,
    cdr: Math.min(0.5, t.cdr + k.cdr + c.cdr + v.cdr + bn.cdr),
    atkSpeed: t.atkSpeed + k.atkSpeed + c.atkSpeed + v.atkSpeed + bn.atkSpeed,
    moveSpeed: t.moveSpeed + k.moveSpeed + c.moveSpeed + v.moveSpeed + bn.moveSpeed,
    crit: t.crit + k.crit + c.crit + v.crit + bn.crit,
    spellPower: t.spellPower + k.spellPower + c.spellPower + v.spellPower + bn.spellPower,
    healPower: t.healPower + k.healPower + c.healPower + v.healPower + bn.healPower,
    startShield: t.startShield + k.startShield + c.startShield + v.startShield,
  };
  const weapon = dominantWeapon(attrs, calling);
  const maxHp = Math.round(60 + attrs.vit * 14 + attrs.str * 4 + v.hpFlat + bn.hpFlat);
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
  } else if (weapon === "bow") {
    damage = 6 + attrs.dex * 1.7;
    range = 300;
    attackCooldown = 1.0;
  } else if (weapon === "stave") {
    // a healer's holy spark — modest, but keeps them useful at range
    damage = 5 + attrs.spi * 1.1 + attrs.int * 0.5;
    range = 260;
    attackCooldown = 1.4;
  } else {
    damage = 7 + attrs.int * 2.0;
    range = 280;
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
    maxHp: 1080,
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
    habit: "It circles, it breathes, it hunts beneath the ice. When it breaches, its heart lies bare — that is the whole fight.",
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
    habit: "Huge, slow, and crushing. Keep moving and never take two swings in a row.",
  },
  alpha: {
    name: "Alpha of Thornwood",
    maxHp: 1450,
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
    habit: "Hail from above, breath that freezes the ground, and a heart that SHATTERS its own armor when cornered.",
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
      [{ kind: "shieldbearer", count: 1 }, { kind: "shaman", count: 1 }, { kind: "archer", count: 2 }],
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
      [{ kind: "archer", count: 2 }, { kind: "wolf", count: 2 }, { kind: "stalker", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "bonecaller", count: 1 }, { kind: "harrier", count: 1 }],
      [{ kind: "goblin", count: 4 }, { kind: "archer", count: 2 }, { kind: "bonecaller", count: 1 }, { kind: "stalker", count: 1 }],
    ],
  },
  {
    id: 4,
    name: "Gloaming Pass",
    subtitle: "The pack answers one voice",
    palette: {
      skyTop: "#4a5a8c",
      skyBottom: "#8d7ba8",
      hills: "#55496e",
      ground: "#6e6288",
      groundDark: "#584e70",
      prop: "#3d3554",
    },
    scale: 1.95,
    xpReward: 72,
    // a true boss level: the Alpha from the first breath, its pack arriving
    // as the fight itself summons them (howl at 60%, frenzy at 30%)
    waves: [[{ kind: "alpha", count: 1 }]],
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
      [{ kind: "goblin", count: 3 }, { kind: "shaman", count: 1 }, { kind: "drummer", count: 1 }],
      [{ kind: "brute", count: 2 }, { kind: "archer", count: 2 }, { kind: "shieldbearer", count: 1 }],
      [{ kind: "warlord", count: 1 }, { kind: "shaman", count: 2 }],
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
    scale: 3.4,
    xpReward: 170,
    waves: [[{ kind: "wyrm", count: 1 }]],
  },
];

export function xpForLevel(level: number): number {
  return Math.round(40 * level * (1 + level * 0.35));
}

export const POINTS_PER_LEVEL = 2;
export const MAX_EQUIPPED = 3;

// ------------------------------------------------------------------ talents

export const MAX_LEVEL = 100;

export type TalentTree = "might" | "precision" | "sorcery" | "faith" | "bulwark" | "swiftness" | "fortune";

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
  might: { name: "Might", color: "#e05c4b", icon: "⚔" },
  precision: { name: "Precision", color: "#58b368", icon: "🎯" },
  sorcery: { name: "Sorcery", color: "#b48ae8", icon: "✦" },
  faith: { name: "Faith", color: "#f2d16b", icon: "✚" },
  bulwark: { name: "Bulwark", color: "#8fd0a8", icon: "🛡" },
  swiftness: { name: "Swiftness", color: "#7bc8d8", icon: "»" },
  fortune: { name: "Fortune", color: "#e8c25a", icon: "◈" },
};

/** Points that must be spent inside a tree before each tier opens. */
export const TIER_UNLOCK = [0, 5, 12];

export const TALENTS: TalentDef[] = [
  // MIGHT — hit harder
  { id: "ironGrip", tree: "might", tier: 1, name: "Iron Grip", blurb: "+3% melee damage", maxRank: 5 },
  { id: "slayer", tree: "might", tier: 1, name: "Slayer's Eye", blurb: "+2% melee damage and +2% crit", maxRank: 3 },
  { id: "battleRoar", tree: "might", tier: 2, name: "Battle Roar", blurb: "Kills whip you into a fury: +35% attack speed for 2.5s", maxRank: 1, keystone: true },
  { id: "lastStand", tree: "might", tier: 2, name: "Last Stand", blurb: "+8% damage while below 30% health", maxRank: 3 },
  { id: "cleavingBlows", tree: "might", tier: 3, name: "Cleaving Blows", blurb: "Melee strikes splash 30% damage to other nearby foes", maxRank: 1, keystone: true },
  // PRECISION — the perfect shot
  { id: "keenEye", tree: "precision", tier: 1, name: "Keen Eye", blurb: "+3% ranged damage", maxRank: 5 },
  { id: "deadEye", tree: "precision", tier: 2, name: "Dead Eye", blurb: "+3% chance to crit for 60% extra", maxRank: 5 },
  { id: "huntersMark", tree: "precision", tier: 2, name: "Hunter's Mark", blurb: "+25% damage to foes still at full health", maxRank: 1, keystone: true },
  { id: "twinArrows", tree: "precision", tier: 2, name: "Twin Arrows", blurb: "Every 4th ranged attack looses two missiles", maxRank: 1, keystone: true },
  { id: "executioner", tree: "precision", tier: 3, name: "Executioner", blurb: "Foes below a quarter health take double damage from you", maxRank: 1, keystone: true },
  { id: "huntersRhythm", tree: "precision", tier: 3, name: "Hunter's Rhythm", blurb: "+2% attack speed and move speed", maxRank: 3 },
  // SORCERY — the burning mind
  { id: "focus", tree: "sorcery", tier: 1, name: "Focus", blurb: "+4% spell power", maxRank: 5 },
  { id: "runeMemory", tree: "sorcery", tier: 1, name: "Rune Memory", blurb: "+2% spell power, -1% cooldowns", maxRank: 5 },
  { id: "attune", tree: "sorcery", tier: 2, name: "Attunement", blurb: "-3% ability cooldowns", maxRank: 5 },
  { id: "kindledMind", tree: "sorcery", tier: 2, name: "Kindled Mind", blurb: "Your damaging spells scorch foes for 8 over 3s", maxRank: 1, keystone: true },
  { id: "archon", tree: "sorcery", tier: 3, name: "Archon", blurb: "+3% spell power and healing power", maxRank: 3 },
  // FAITH — the mender's road
  { id: "springs", tree: "faith", tier: 1, name: "Vital Springs", blurb: "+4% healing power", maxRank: 5 },
  { id: "devotion", tree: "faith", tier: 1, name: "Devotion", blurb: "+2% healing, +1% armor", maxRank: 5 },
  { id: "aegis", tree: "faith", tier: 2, name: "Lesser Aegis", blurb: "Start battles with an 8 hp ward", maxRank: 5 },
  { id: "overflow", tree: "faith", tier: 3, name: "Overflow", blurb: "Overhealing spills onto the most wounded other ally", maxRank: 1, keystone: true },
  { id: "mendersWard", tree: "faith", tier: 3, name: "Mender's Ward", blurb: "Topping off an ally leaves a 10 hp ward on them", maxRank: 1, keystone: true },
  // BULWARK — stand and be struck
  { id: "oxBlood", tree: "bulwark", tier: 1, name: "Ox Blood", blurb: "+3% max health", maxRank: 5 },
  { id: "thickHide", tree: "bulwark", tier: 1, name: "Thick Hide", blurb: "+1% armor", maxRank: 5 },
  { id: "stoneSkin", tree: "bulwark", tier: 2, name: "Stone Skin", blurb: "+1.5% armor", maxRank: 5 },
  { id: "secondBreath", tree: "bulwark", tier: 2, name: "Second Breath", blurb: "Recover 6% health as each new fight begins", maxRank: 1, keystone: true },
  { id: "juggernaut", tree: "bulwark", tier: 3, name: "Juggernaut", blurb: "Cannot be stunned while above two-thirds health", maxRank: 1, keystone: true },
  { id: "fortress", tree: "bulwark", tier: 3, name: "Fortress", blurb: "+2% health and +0.5% armor", maxRank: 3 },
  // SWIFTNESS — never where the blow lands
  { id: "fleetFoot", tree: "swiftness", tier: 1, name: "Fleet Foot", blurb: "+3% move speed", maxRank: 5 },
  { id: "quickHands", tree: "swiftness", tier: 1, name: "Quick Hands", blurb: "+3% attack speed", maxRank: 5 },
  { id: "surefoot", tree: "swiftness", tier: 2, name: "Surefoot", blurb: "+2% move speed, -1% cooldowns", maxRank: 5 },
  { id: "warEcho", tree: "swiftness", tier: 2, name: "War Echo", blurb: "-3% ability cooldowns", maxRank: 5 },
  { id: "windStep", tree: "swiftness", tier: 3, name: "Wind Step", blurb: "Shrug off the first hit of every wave", maxRank: 1, keystone: true },
  { id: "momentum", tree: "swiftness", tier: 3, name: "Momentum", blurb: "+2% attack speed and +2% move", maxRank: 3 },
  // FORTUNE — the road provides
  { id: "luckyCharm", tree: "fortune", tier: 1, name: "Lucky Charm", blurb: "+2% crit", maxRank: 5 },
  { id: "providence", tree: "fortune", tier: 1, name: "Providence", blurb: "Start battles with a 10 hp ward", maxRank: 5 },
  { id: "deepPockets", tree: "fortune", tier: 2, name: "Deep Pockets", blurb: "+20% gold from every battle", maxRank: 1, keystone: true },
  { id: "windfall", tree: "fortune", tier: 2, name: "Windfall", blurb: "Your kills shake 3 extra gold loose", maxRank: 1, keystone: true },
  { id: "gamblersEdge", tree: "fortune", tier: 3, name: "Gambler's Edge", blurb: "+3% crit", maxRank: 3 },
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
    meleeDmg: r("ironGrip") * 0.03 + r("slayer") * 0.02,
    rangedDmg: r("keenEye") * 0.03,
    hpPct: r("oxBlood") * 0.03 + r("fortress") * 0.02,
    armorFlat: r("stoneSkin") * 0.015 + r("thickHide") * 0.01 + r("devotion") * 0.01 + r("fortress") * 0.005,
    cdr: Math.min(0.45, r("warEcho") * 0.03 + r("attune") * 0.03 + r("runeMemory") * 0.01 + r("surefoot") * 0.01),
    atkSpeed: r("quickHands") * 0.03 + r("huntersRhythm") * 0.02 + r("momentum") * 0.02,
    moveSpeed: r("fleetFoot") * 0.03 + r("huntersRhythm") * 0.02 + r("surefoot") * 0.02 + r("momentum") * 0.02,
    crit: r("deadEye") * 0.03 + r("slayer") * 0.02 + r("luckyCharm") * 0.02 + r("gamblersEdge") * 0.03,
    spellPower: r("focus") * 0.04 + r("archon") * 0.03 + r("runeMemory") * 0.02,
    healPower: r("springs") * 0.04 + r("archon") * 0.03 + r("devotion") * 0.02,
    startShield: r("aegis") * 8 + r("providence") * 10,
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
  { id: "frostBead", name: "Frost Bead", blurb: "+8% spell power", rarity: "common", icon: "❄️" },
  { id: "wolfclawCharm", name: "Wolfclaw Charm", blurb: "+7% melee damage, +3% move", rarity: "common", icon: "🐾" },
  { id: "icemirror", name: "Ice Mirror", blurb: "-7% cooldowns", rarity: "common", icon: "🧊" },
  { id: "northstar", name: "Northstar Sliver", blurb: "+7% ranged damage, +3% crit", rarity: "common", icon: "⭐" },
  { id: "heartOfWinter", name: "Heart of Winter", blurb: "+12% health, +8% armor", rarity: "rare", icon: "💙" },
  { id: "aurorasTear", name: "Aurora's Tear", blurb: "-9% cooldowns, +8% healing", rarity: "rare", icon: "💧" },
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
export const BOSS_STAGES = [4, 5, 11];

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
    blurb: "A hero swears their first calling.",
    done: (s) => s.heroes.some((h) => h.calling),
  },
  {
    id: "ascendant",
    name: "Ascendant",
    blurb: "An oath deepened — any advanced calling taken.",
    done: (s) => s.heroes.some((h) => h.advCalling),
  },
  {
    id: "scholar",
    name: "Scholar of the Band",
    blurb: "Fifteen spells in the band's library.",
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
