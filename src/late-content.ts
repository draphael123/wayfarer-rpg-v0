import type { ElementId } from "./types";

/**
 * The back half of the road introduces one readable field role and one bespoke
 * boss per region. Keeping these blueprints together makes the campaign's
 * elemental vocabulary inspectable instead of scattering it through AI code.
 */
export const LATE_FOE_KINDS = [
  "cinderkin",
  "briarback",
  "gloomwing",
  "reliquaryguard",
  "shardling",
  "bloodreaver",
  "nullwalker",
] as const;

export const LATE_BOSS_KINDS = [
  "cindermaw",
  "verdantcolossus",
  "nightmother",
  "reliquaryseraph",
  "skybreaker",
  "bloodmoonstag",
  "wayeater",
] as const;

export type LateFoeKind = (typeof LATE_FOE_KINDS)[number];
export type LateBossKind = (typeof LATE_BOSS_KINDS)[number];
export type LateEnemyKind = LateFoeKind | LateBossKind;

export interface LateEnemyBlueprint {
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
  habit: string;
  weakTo: ElementId;
  resists: ElementId;
}

export const LATE_ENEMIES: Record<LateEnemyKind, LateEnemyBlueprint> = {
  cinderkin: {
    name: "Cinderkin",
    maxHp: 92,
    damage: 13,
    range: 185,
    attackCooldown: 2.05,
    speed: 68,
    armor: 0.05,
    radius: 15,
    xp: 44,
    body: "#823f2e",
    trim: "#ffb052",
    lore: "A pilgrim baked hollow beside the furnaces, still carrying one coal where a heart belonged.",
    habit: "Seeds a small eruption beneath a clustered hero. The orange core marks the final blast.",
    weakTo: "frost",
    resists: "flame",
  },
  briarback: {
    name: "Briarback",
    maxHp: 176,
    damage: 15,
    range: 36,
    attackCooldown: 1.9,
    speed: 62,
    armor: 0.3,
    radius: 21,
    xp: 52,
    body: "#45613d",
    trim: "#a8cb6b",
    lore: "A boar-shaped knot of old roots, moss, and the bones of hunters who mistook stillness for safety.",
    habit: "Pins a hero with roots before lumbering into melee. Fire cuts through its living armor.",
    weakTo: "flame",
    resists: "earth",
  },
  gloomwing: {
    name: "Gloomwing",
    maxHp: 78,
    damage: 16,
    range: 160,
    attackCooldown: 1.75,
    speed: 112,
    armor: 0.02,
    radius: 14,
    xp: 49,
    body: "#3d354f",
    trim: "#ba9ee0",
    lore: "A moth broad enough to eclipse a lantern, dusted in the silence between one thought and the next.",
    habit: "Drops a hush over its target, briefly silencing anyone caught in the violet edge.",
    weakTo: "radiant",
    resists: "shadow",
  },
  reliquaryguard: {
    name: "Reliquary Guard",
    maxHp: 205,
    damage: 17,
    range: 42,
    attackCooldown: 2.1,
    speed: 48,
    armor: 0.38,
    radius: 22,
    xp: 58,
    body: "#817962",
    trim: "#f2d78a",
    lore: "Empty ceremonial armor walking on the strength of a vow whose speaker has been dust for centuries.",
    habit: "Draws a narrow sun-line across the field. Step out of the gold lane before it fires.",
    weakTo: "shadow",
    resists: "radiant",
  },
  shardling: {
    name: "Shardling",
    maxHp: 86,
    damage: 18,
    range: 205,
    attackCooldown: 2.15,
    speed: 74,
    armor: 0.12,
    radius: 16,
    xp: 54,
    body: "#587790",
    trim: "#c7f1ff",
    lore: "A splinter knocked from the peak by thunder, furious that the mountain did not notice.",
    habit: "Cracks the ground in a cross. Do not dodge one arm by stepping into another.",
    weakTo: "earth",
    resists: "storm",
  },
  bloodreaver: {
    name: "Blood Reaver",
    maxHp: 112,
    damage: 21,
    range: 34,
    attackCooldown: 1.35,
    speed: 122,
    armor: 0.08,
    radius: 16,
    xp: 61,
    body: "#6b2835",
    trim: "#ef7b73",
    lore: "A hunter who traded every name but its quarry's for one more night beneath the red moon.",
    habit: "Marks the weakest hero, then strikes hard enough to heal itself if the warning is ignored.",
    weakTo: "frost",
    resists: "blood",
  },
  nullwalker: {
    name: "Nullwalker",
    maxHp: 124,
    damage: 19,
    range: 175,
    attackCooldown: 2.3,
    speed: 76,
    armor: 0.14,
    radius: 18,
    xp: 68,
    body: "#29263a",
    trim: "#8d80bd",
    lore: "A traveler erased from every road but this one. Looking directly at it makes the horizon feel closer.",
    habit: "Opens a small void that leaves survivors vulnerable. Its dark center is not a safe zone.",
    weakTo: "radiant",
    resists: "shadow",
  },
  cindermaw: {
    name: "Cindermaw, Furnace Below",
    maxHp: 1960,
    damage: 24,
    range: 64,
    attackCooldown: 1.8,
    speed: 58,
    armor: 0.22,
    radius: 37,
    xp: 360,
    body: "#713326",
    trim: "#ff9b42",
    lore: "The first forge was built over its sleeping throat. Every sword made there was only another tooth.",
    habit: "Eruptions bloom from orange cores to red rims. Empty blasts crack its furnace plates and poise.",
    weakTo: "frost",
    resists: "flame",
  },
  verdantcolossus: {
    name: "The Verdant Colossus",
    maxHp: 2180,
    damage: 26,
    range: 52,
    attackCooldown: 2.15,
    speed: 43,
    armor: 0.34,
    radius: 42,
    xp: 410,
    body: "#38563b",
    trim: "#a5cf72",
    lore: "A shrine tree uprooted itself when the prayers stopped. It has been walking toward an answer ever since.",
    habit: "Root cages punish a scattered company. Burn clean gaps, regroup, and strike while its heartwood opens.",
    weakTo: "flame",
    resists: "earth",
  },
  nightmother: {
    name: "Nightmother of the Veil",
    maxHp: 2685,
    damage: 25,
    range: 190,
    attackCooldown: 1.9,
    speed: 72,
    armor: 0.18,
    radius: 36,
    xp: 455,
    body: "#302744",
    trim: "#c2a4e8",
    lore: "Every moth in Gloamfen is a thought she shed. Every missing traveler is a thought she kept.",
    habit: "Her eclipses silence the rim and expose the center. Read which half of the omen is safe this time.",
    weakTo: "radiant",
    resists: "shadow",
  },
  reliquaryseraph: {
    name: "The Reliquary Seraph",
    maxHp: 2310,
    damage: 28,
    range: 210,
    attackCooldown: 2.2,
    speed: 50,
    armor: 0.3,
    radius: 40,
    xp: 510,
    body: "#77715f",
    trim: "#ffe6a0",
    lore: "A guardian assembled from seven saints' empty armor, still defending a faith that fled the flood.",
    habit: "Golden verdict-lines divide the arena. Crossing beams leave brief dark seams where the company can stand.",
    weakTo: "shadow",
    resists: "radiant",
  },
  skybreaker: {
    name: "Skybreaker",
    maxHp: 2420,
    damage: 29,
    range: 76,
    attackCooldown: 1.75,
    speed: 78,
    armor: 0.24,
    radius: 39,
    xp: 575,
    body: "#46657d",
    trim: "#bdefff",
    lore: "A storm giant crystallized at the instant lightning taught stone how to fly.",
    habit: "Shatter-lines cross at the marked point. Dodge diagonally, then punish the cracked crystal core.",
    weakTo: "earth",
    resists: "storm",
  },
  bloodmoonstag: {
    name: "The Bloodmoon Stag",
    maxHp: 3275,
    damage: 32,
    range: 48,
    attackCooldown: 1.45,
    speed: 112,
    armor: 0.16,
    radius: 38,
    xp: 640,
    body: "#572632",
    trim: "#f06d68",
    lore: "The oldest hunter in the weald. Its antlers carry every moon under which a promise was broken.",
    habit: "It names one hero for the hunt. A missed charge starves it; a hit lets it drink back strength.",
    weakTo: "frost",
    resists: "blood",
  },
  wayeater: {
    name: "The Way-Eater",
    maxHp: 2680,
    damage: 29,
    range: 180,
    attackCooldown: 1.8,
    speed: 68,
    armor: 0.22,
    radius: 44,
    xp: 800,
    body: "#252238",
    trim: "#a99ce0",
    lore: "Not the end of the road, but the hunger that waits wherever a road gives up.",
    habit: "It remembers every omen learned before it. Break each returning pattern to keep the final road open.",
    weakTo: "radiant",
    resists: "shadow",
  },
};

export const LATE_BOSS_PHASES: Record<LateBossKind, number[]> = {
  cindermaw: [0.68, 0.34],
  verdantcolossus: [0.68, 0.34],
  nightmother: [0.66, 0.33],
  reliquaryseraph: [0.7, 0.36],
  skybreaker: [0.65, 0.3],
  bloodmoonstag: [0.67, 0.33],
  wayeater: [0.75, 0.5, 0.25],
};

export function isLateFoeKind(kind: string | null): kind is LateFoeKind {
  return kind !== null && (LATE_FOE_KINDS as readonly string[]).includes(kind);
}

export function isLateBossKind(kind: string | null): kind is LateBossKind {
  return kind !== null && (LATE_BOSS_KINDS as readonly string[]).includes(kind);
}
