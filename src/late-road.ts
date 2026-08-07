import type { EnemyKind, StageDef, WaveEntry } from "./types";
import type { LateFoeKind } from "./late-content";

export type LateRoadRegionId =
  | "cinderwild"
  | "verdant-maw"
  | "nightglass"
  | "reliquary"
  | "skygrave"
  | "bloodwood"
  | "last-meridian";

export type LateRoadBossKind =
  | "cindermaw"
  | "verdantcolossus"
  | "nightmother"
  | "reliquaryseraph"
  | "skybreaker"
  | "bloodmoonstag"
  | "wayeater";

type LateRoadAtmosphere = "embers" | "spores" | "glasswind" | "gold-dust" | "high-storm" | "red-leaves" | "road-ash";

interface MapPalette {
  skyTop: string;
  skyBottom: string;
  land: string;
  landDark: string;
  road: string;
  accent: string;
  ink: string;
  glow: string;
}

export interface LateRoadRegion {
  id: LateRoadRegionId;
  act: number;
  name: string;
  range: string;
  start: number;
  eliteStage: number;
  bossStage: number;
  bossKind: LateRoadBossKind;
  signatureFoe: LateFoeKind;
  bossName: string;
  promise: string;
  atmosphere: LateRoadAtmosphere;
  route: readonly number[];
  night: boolean;
  darkness: number;
  grade: string;
  map: MapPalette;
}

export interface LateRoadBossIntent {
  stage: number;
  region: LateRoadRegionId;
  kind: LateRoadBossKind;
  name: string;
  encounterPromise: string;
}

const w = (...entries: Array<[EnemyKind, number]>): WaveEntry[] => entries.map(([kind, count]) => ({ kind, count }));
const foe = (kind: LateFoeKind): EnemyKind => kind as EnemyKind;
const bossWave = (kind: LateRoadBossKind): WaveEntry[] => [{ kind: kind as EnemyKind, count: 1 }];

export const LATE_ROAD_REGIONS: readonly LateRoadRegion[] = [
  {
    id: "cinderwild", act: 4, name: "The Cinderwild", range: "XIX–XXIV", start: 18, eliteStage: 21, bossStage: 23,
    bossKind: "cindermaw", signatureFoe: "cinderkin", bossName: "Cindermaw", promise: "Break the furnace-heart before the crater becomes its weapon.",
    atmosphere: "embers", route: [246, 184, 232, 155, 208, 104], night: false, darkness: 0.12,
    grade: "rgba(255, 104, 46, 0.22)",
    map: { skyTop: "#2a1c2a", skyBottom: "#a84e36", land: "#5d332c", landDark: "#281d24", road: "#dc9b65", accent: "#ffb15f", ink: "#1d161b", glow: "#ff643f" },
  },
  {
    id: "verdant-maw", act: 5, name: "The Verdant Maw", range: "XXV–XXX", start: 24, eliteStage: 27, bossStage: 29,
    bossKind: "verdantcolossus", signatureFoe: "briarback", bossName: "The Verdant Colossus", promise: "Sever the walking grove's root-anchors before it closes the arena.",
    atmosphere: "spores", route: [226, 166, 232, 142, 194, 92], night: false, darkness: 0.2,
    grade: "rgba(74, 190, 108, 0.19)",
    map: { skyTop: "#183d3b", skyBottom: "#86aa68", land: "#315d43", landDark: "#173a30", road: "#d2b873", accent: "#b9e275", ink: "#112a25", glow: "#81e89a" },
  },
  {
    id: "nightglass", act: 6, name: "The Nightglass Waste", range: "XXXI–XXXVI", start: 30, eliteStage: 33, bossStage: 35,
    bossKind: "nightmother", signatureFoe: "gloomwing", bossName: "The Night Mother", promise: "Read the true shadow among her reflections, then strike while the moons align.",
    atmosphere: "glasswind", route: [238, 198, 228, 160, 184, 112], night: true, darkness: 0.48,
    grade: "rgba(112, 82, 212, 0.25)",
    map: { skyTop: "#11152d", skyBottom: "#514b83", land: "#403c61", landDark: "#19182c", road: "#bcb1d8", accent: "#d9c8ff", ink: "#10101d", glow: "#a18aff" },
  },
  {
    id: "reliquary", act: 7, name: "The Shattered Reliquary", range: "XXXVII–XLII", start: 36, eliteStage: 39, bossStage: 41,
    bossKind: "reliquaryseraph", signatureFoe: "reliquaryguard", bossName: "The Reliquary Seraph", promise: "Shatter the saint-vessels that renew its borrowed wings.",
    atmosphere: "gold-dust", route: [242, 178, 222, 148, 194, 96], night: false, darkness: 0.14,
    grade: "rgba(235, 196, 110, 0.17)",
    map: { skyTop: "#50475b", skyBottom: "#d2b878", land: "#8b7654", landDark: "#3f3542", road: "#ead9a9", accent: "#ffe6a1", ink: "#2a2430", glow: "#ffd477" },
  },
  {
    id: "skygrave", act: 8, name: "Skygrave Heights", range: "XLIII–XLVIII", start: 42, eliteStage: 45, bossStage: 47,
    bossKind: "skybreaker", signatureFoe: "shardling", bossName: "The Skybreaker", promise: "Ground the tempest titan by turning its lightning into the summit rods.",
    atmosphere: "high-storm", route: [254, 206, 214, 150, 170, 82], night: false, darkness: 0.18,
    grade: "rgba(76, 170, 220, 0.2)",
    map: { skyTop: "#1d3550", skyBottom: "#8bb8c9", land: "#526f7e", landDark: "#243b4a", road: "#d2d8cb", accent: "#a9f2ff", ink: "#162936", glow: "#73dcff" },
  },
  {
    id: "bloodwood", act: 9, name: "The Bloodwood", range: "XLIX–LIV", start: 48, eliteStage: 51, bossStage: 53,
    bossKind: "bloodmoonstag", signatureFoe: "bloodreaver", bossName: "The Blood-Moon Stag", promise: "Survive the marked hunt, then follow the heart-trail back to its crown.",
    atmosphere: "red-leaves", route: [232, 178, 226, 146, 196, 100], night: true, darkness: 0.42,
    grade: "rgba(185, 45, 72, 0.22)",
    map: { skyTop: "#24192d", skyBottom: "#8a384b", land: "#59323d", landDark: "#231923", road: "#c79b79", accent: "#ef9b8c", ink: "#190f18", glow: "#e34c62" },
  },
  {
    id: "last-meridian", act: 10, name: "The Last Meridian", range: "LV–LX", start: 54, eliteStage: 57, bossStage: 59,
    bossKind: "wayeater", signatureFoe: "nullwalker", bossName: "The Way-Eater", promise: "Anchor the company to the last waystone while the battlefield is erased around them.",
    atmosphere: "road-ash", route: [246, 204, 222, 170, 190, 118], night: true, darkness: 0.55,
    grade: "rgba(118, 86, 170, 0.26)",
    map: { skyTop: "#11101c", skyBottom: "#50465f", land: "#47404e", landDark: "#17141e", road: "#c8b7a0", accent: "#eee1c7", ink: "#0d0b12", glow: "#bf9cf0" },
  },
] as const;

export const LATE_ROAD_BOSS_INTENTS: readonly LateRoadBossIntent[] = LATE_ROAD_REGIONS.map((region) => ({
  stage: region.bossStage,
  region: region.id,
  kind: region.bossKind,
  name: region.bossName,
  encounterPromise: region.promise,
}));

export const LATE_ROAD_ELITE_STAGES: readonly number[] = LATE_ROAD_REGIONS.map((region) => region.eliteStage);

export const LATE_ROAD_STAGES: StageDef[] = [
  {
    id: 18, name: "Emberfall Verge", subtitle: "Ash drifts where rain once fell",
    palette: { skyTop: "#47313b", skyBottom: "#c46b48", hills: "#663d35", ground: "#775044", groundDark: "#432f31", prop: "#2b2227" },
    scale: 3.7, xpReward: 350,
    waves: [w([foe("cinderkin"), 1], ["brute", 2]), w(["warbanner", 1], ["archer", 2], [foe("cinderkin"), 1]), w(["shieldbearer", 2], ["stormcaller", 1])],
  },
  {
    id: 19, name: "Obsidian Steps", subtitle: "Every foothold keeps the heat",
    palette: { skyTop: "#372735", skyBottom: "#aa563e", hills: "#513136", ground: "#62423d", groundDark: "#33262c", prop: "#211b22" },
    scale: 3.82, xpReward: 370,
    waves: [w(["stalker", 2], [foe("cinderkin"), 1]), w(["rimetroll", 1], ["harrier", 2], ["drummer", 1]), w(["brute", 2], ["warbanner", 1], [foe("cinderkin"), 1])],
  },
  {
    id: 20, name: "Furnace Orchard", subtitle: "Iron trees bear glass fruit",
    palette: { skyTop: "#503139", skyBottom: "#d27b45", hills: "#713d30", ground: "#82503c", groundDark: "#472a28", prop: "#2f2020" },
    scale: 3.94, xpReward: 390,
    waves: [w(["galeharrier", 2], [foe("cinderkin"), 1], ["brute", 1]), w(["bonecaller", 1], ["shambler", 3], ["drummer", 1]), w(["rimetroll", 1], ["shieldbearer", 2], [foe("cinderkin"), 1])],
  },
  {
    id: 21, name: "Smokevein Cut", subtitle: "The road disappears between breaths",
    palette: { skyTop: "#28252f", skyBottom: "#80605a", hills: "#41363b", ground: "#574647", groundDark: "#2d272e", prop: "#201d23" },
    scale: 4.12, xpReward: 425,
    waves: [w(["stalker", 2], [foe("cinderkin"), 2]), w(["shieldbearer", 2], ["warbanner", 1], [foe("cinderkin"), 1]), w(["rimetroll", 2], ["stormcaller", 1])],
  },
  {
    id: 22, name: "Pyrewatch Caldera", subtitle: "The sentries wake beneath the crust",
    palette: { skyTop: "#3b2228", skyBottom: "#ba4c32", hills: "#5a2928", ground: "#6b392e", groundDark: "#321f25", prop: "#20171d" },
    scale: 4.18, xpReward: 445,
    waves: [w(["warbanner", 1], ["shieldbearer", 2], [foe("cinderkin"), 1]), w(["bonecaller", 1], ["shambler", 3], [foe("cinderkin"), 1]), w(["rimetroll", 2], ["galeharrier", 2], [foe("cinderkin"), 1])],
  },
  {
    id: 23, name: "Cindermaw Crater", subtitle: "The mountain has learned to hunger",
    palette: { skyTop: "#21151d", skyBottom: "#8f2f2b", hills: "#3c2024", ground: "#4e2827", groundDark: "#21171d", prop: "#171117" },
    scale: 3.98, xpReward: 510, waves: [bossWave("cindermaw")],
  },

  {
    id: 24, name: "Greenwater Gate", subtitle: "Vines close behind the living",
    palette: { skyTop: "#2a5b54", skyBottom: "#a0b975", hills: "#497c55", ground: "#628359", groundDark: "#36583f", prop: "#234831" },
    scale: 4.16, xpReward: 455,
    waves: [w([foe("briarback"), 1], ["reefhound", 2]), w(["shaman", 1], ["wolf", 3], ["harrier", 1]), w(["brinecrawler", 1], [foe("briarback"), 1], ["saltwitch", 1])],
  },
  {
    id: 25, name: "Cathedral of Boughs", subtitle: "Noon never touches the floor",
    palette: { skyTop: "#1f4946", skyBottom: "#759c6a", hills: "#37694a", ground: "#4d7150", groundDark: "#294d37", prop: "#173a2a" },
    scale: 4.3, xpReward: 480,
    waves: [w([foe("briarback"), 1], ["wolf", 2]), w(["conchseer", 1], [foe("briarback"), 1], ["harrier", 2]), w(["brute", 2], ["shaman", 1], ["reefhound", 2])],
  },
  {
    id: 26, name: "Sporelight Basin", subtitle: "Each footprint blooms twice",
    palette: { skyTop: "#254d55", skyBottom: "#8cae83", hills: "#416f5b", ground: "#547967", groundDark: "#315348", prop: "#24503e" },
    scale: 4.44, xpReward: 505,
    waves: [w([foe("briarback"), 1], ["icewisp", 2]), w(["snowhag", 1], [foe("briarback"), 1], ["stalker", 2]), w(["conchseer", 1], ["brinecrawler", 2], ["saltwitch", 1])],
  },
  {
    id: 27, name: "The Rootbound City", subtitle: "Stone remembers the canopy",
    palette: { skyTop: "#183d3a", skyBottom: "#668c62", hills: "#315a43", ground: "#456148", groundDark: "#253f32", prop: "#173025" },
    scale: 4.62, xpReward: 540,
    waves: [w([foe("briarback"), 2], ["stalker", 2]), w(["bonecaller", 1], ["shambler", 3], ["conchseer", 1]), w(["rimetroll", 1], [foe("briarback"), 1], ["reefhound", 2])],
  },
  {
    id: 28, name: "Heartvine Stair", subtitle: "The forest climbs to meet you",
    palette: { skyTop: "#21443a", skyBottom: "#91a95f", hills: "#406b43", ground: "#557548", groundDark: "#2f4b32", prop: "#1d3b25" },
    scale: 4.7, xpReward: 565,
    waves: [w(["galeharrier", 2], ["saltwitch", 1], [foe("briarback"), 1]), w(["shaman", 1], [foe("briarback"), 2], ["drummer", 1]), w(["conchseer", 1], ["rimetroll", 2], ["stalker", 2])],
  },
  {
    id: 29, name: "Colossus Grove", subtitle: "The oldest tree stands up",
    palette: { skyTop: "#102f2c", skyBottom: "#57784f", hills: "#274b36", ground: "#38533b", groundDark: "#1d3528", prop: "#11261b" },
    scale: 4.42, xpReward: 630, waves: [bossWave("verdantcolossus")],
  },

  {
    id: 30, name: "Moonshard Flats", subtitle: "Starlight cuts the dunes",
    palette: { skyTop: "#151a38", skyBottom: "#68618e", hills: "#514b70", ground: "#625d78", groundDark: "#37344e", prop: "#292640" },
    scale: 4.66, xpReward: 575,
    waves: [w([foe("gloomwing"), 1], ["icewisp", 2]), w(["stalker", 2], ["saltwitch", 1], [foe("gloomwing"), 1]), w(["stormeel", 2], ["conchseer", 1], ["harrier", 2])],
  },
  {
    id: 31, name: "Whispering Erg", subtitle: "The sand repeats your last word",
    palette: { skyTop: "#11162f", skyBottom: "#574f79", hills: "#443f61", ground: "#585269", groundDark: "#302d45", prop: "#222038" },
    scale: 4.82, xpReward: 600,
    waves: [w(["stalker", 2], [foe("gloomwing"), 1]), w(["snowhag", 1], ["icewisp", 2], [foe("gloomwing"), 2]), w(["bonecaller", 1], ["shambler", 3], ["stormcaller", 1])],
  },
  {
    id: 32, name: "Mirror Wells", subtitle: "Reflections arrive before travelers",
    palette: { skyTop: "#171735", skyBottom: "#766a94", hills: "#554e73", ground: "#67607b", groundDark: "#39334d", prop: "#2a2540" },
    scale: 4.98, xpReward: 625,
    waves: [w(["icewisp", 2], [foe("gloomwing"), 2], ["conchseer", 1]), w(["stalker", 2], ["shieldbearer", 2], ["saltwitch", 1]), w([foe("gloomwing"), 2], ["stormeel", 2], ["snowhag", 1])],
  },
  {
    id: 33, name: "Black Lantern Caravan", subtitle: "No flame survives the crossing",
    palette: { skyTop: "#0d1127", skyBottom: "#443d62", hills: "#37334e", ground: "#484354", groundDark: "#292638", prop: "#1b1929" },
    scale: 5.18, xpReward: 665,
    waves: [w(["stalker", 2], [foe("gloomwing"), 2]), w(["shieldbearer", 2], [foe("gloomwing"), 2], ["drummer", 1]), w(["rimetroll", 2], ["icewisp", 3])],
  },
  {
    id: 34, name: "Observatory of Knives", subtitle: "The heavens look back",
    palette: { skyTop: "#14122c", skyBottom: "#594976", hills: "#403755", ground: "#51455e", groundDark: "#2d263d", prop: "#211b32" },
    scale: 5.26, xpReward: 690,
    waves: [w(["stormcaller", 1], [foe("gloomwing"), 2]), w(["conchseer", 1], ["stalker", 2], [foe("gloomwing"), 2]), w(["snowhag", 2], ["rimetroll", 1], ["icewisp", 3])],
  },
  {
    id: 35, name: "Cradle of Night", subtitle: "The dark remembers its mother",
    palette: { skyTop: "#080b1d", skyBottom: "#332849", hills: "#27223b", ground: "#362e43", groundDark: "#1c1829", prop: "#13101d" },
    scale: 4.88, xpReward: 760, waves: [bossWave("nightmother")],
  },

  {
    id: 36, name: "Pilgrim's Causeway", subtitle: "Bells ring beneath the dust",
    palette: { skyTop: "#655c6f", skyBottom: "#d5bd84", hills: "#998262", ground: "#a28c69", groundDark: "#675849", prop: "#514550" },
    scale: 5.2, xpReward: 700,
    waves: [w([foe("reliquaryguard"), 1], ["bellkeeper", 1]), w(["bonecaller", 1], ["archer", 2], [foe("reliquaryguard"), 1]), w(["warbanner", 1], ["conchseer", 1], ["brute", 2])],
  },
  {
    id: 37, name: "Reliquary Fields", subtitle: "Saints lie open to the weather",
    palette: { skyTop: "#554d62", skyBottom: "#c9af78", hills: "#897358", ground: "#927e62", groundDark: "#5b4d43", prop: "#483d47" },
    scale: 5.36, xpReward: 730,
    waves: [w(["shambler", 3], [foe("reliquaryguard"), 1]), w([foe("reliquaryguard"), 1], ["warbanner", 1], ["galeharrier", 2]), w(["conchseer", 1], ["rimetroll", 1], ["harrier", 2])],
  },
  {
    id: 38, name: "Choirless Cloister", subtitle: "Every arch keeps one last note",
    palette: { skyTop: "#4c4559", skyBottom: "#bca873", hills: "#7b6a52", ground: "#867357", groundDark: "#51463e", prop: "#413843" },
    scale: 5.52, xpReward: 760,
    waves: [w(["bellkeeper", 1], ["saltwitch", 1], [foe("reliquaryguard"), 1]), w(["drummer", 1], [foe("reliquaryguard"), 2], ["archer", 2]), w(["bonecaller", 2], ["stalker", 2], ["harrier", 1])],
  },
  {
    id: 39, name: "The Golden Ossuary", subtitle: "Mercy was buried in armor",
    palette: { skyTop: "#3f394a", skyBottom: "#aa925f", hills: "#705f49", ground: "#796649", groundDark: "#483b35", prop: "#38303a" },
    scale: 5.72, xpReward: 805,
    waves: [w([foe("reliquaryguard"), 2], ["bellkeeper", 1]), w(["bonecaller", 2], ["shambler", 3]), w(["warbanner", 1], ["rimetroll", 2], [foe("reliquaryguard"), 1])],
  },
  {
    id: 40, name: "Ascendant Stair", subtitle: "Kneel, or be measured",
    palette: { skyTop: "#5b4f5f", skyBottom: "#dfc77f", hills: "#9e8558", ground: "#a18a5f", groundDark: "#645044", prop: "#4b3d47" },
    scale: 5.82, xpReward: 835,
    waves: [w(["galeharrier", 2], [foe("reliquaryguard"), 1]), w([foe("reliquaryguard"), 2], ["conchseer", 1], ["wreckgunner", 1]), w(["bonecaller", 1], ["rimetroll", 2], ["warbanner", 1])],
  },
  {
    id: 41, name: "Heaven's Broken Door", subtitle: "The last angel guards an empty throne",
    palette: { skyTop: "#332e3d", skyBottom: "#9f8358", hills: "#675744", ground: "#705f49", groundDark: "#403638", prop: "#302a32" },
    scale: 5.34, xpReward: 910, waves: [bossWave("reliquaryseraph")],
  },

  {
    id: 42, name: "Thunderhead Trail", subtitle: "The road climbs into the storm",
    palette: { skyTop: "#29455d", skyBottom: "#9fc2c8", hills: "#668392", ground: "#70878b", groundDark: "#425e69", prop: "#36505e" },
    scale: 5.7, xpReward: 845,
    waves: [w([foe("shardling"), 1], ["galeharrier", 2]), w(["stormcaller", 1], ["reefhound", 2], [foe("shardling"), 1]), w(["wreckgunner", 2], ["shieldbearer", 2])],
  },
  {
    id: 43, name: "Hanging Monastery", subtitle: "Ropes pray in the crosswind",
    palette: { skyTop: "#223b53", skyBottom: "#8db3c0", hills: "#587585", ground: "#657d82", groundDark: "#3a5562", prop: "#304957" },
    scale: 5.86, xpReward: 875,
    waves: [w(["galeharrier", 2], [foe("shardling"), 1]), w(["stormcaller", 1], ["harrier", 2], [foe("shardling"), 1]), w(["shieldbearer", 2], ["wreckgunner", 2], ["drummer", 1])],
  },
  {
    id: 44, name: "Cloudscar Bridge", subtitle: "One railing. No ground.", terrain: "storm",
    palette: { skyTop: "#1c354e", skyBottom: "#789fac", hills: "#4e6978", ground: "#5c7177", groundDark: "#344d5a", prop: "#2b4350" },
    scale: 6.02, xpReward: 905,
    waves: [w(["galeharrier", 2], [foe("shardling"), 2]), w(["wreckgunner", 1], ["reefhound", 2], [foe("shardling"), 1]), w(["stormeel", 3], ["conchseer", 1], ["harrier", 1])],
  },
  {
    id: 45, name: "The Kite Graveyard", subtitle: "Broken wings still hunt", terrain: "storm",
    palette: { skyTop: "#172e45", skyBottom: "#6f929d", hills: "#465f6b", ground: "#53676d", groundDark: "#2d4652", prop: "#253b47" },
    scale: 6.22, xpReward: 955,
    waves: [w(["galeharrier", 2], [foe("shardling"), 2]), w(["wreckgunner", 2], ["shieldbearer", 1], [foe("shardling"), 1]), w(["stormeel", 3], ["conchseer", 1], ["reefhound", 2])],
  },
  {
    id: 46, name: "Crown of Tempests", subtitle: "Lightning chooses its champion", terrain: "storm",
    palette: { skyTop: "#14283d", skyBottom: "#5f7f8c", hills: "#3c5361", ground: "#495d64", groundDark: "#283e49", prop: "#213542" },
    scale: 6.32, xpReward: 985,
    waves: [w(["stormcaller", 1], ["galeharrier", 2], [foe("shardling"), 2]), w(["wreckgunner", 2], ["stormeel", 2], [foe("shardling"), 1]), w(["rimetroll", 2], ["conchseer", 1], ["harrier", 2])],
  },
  {
    id: 47, name: "Skybreak Summit", subtitle: "The peak refuses the horizon", terrain: "storm",
    palette: { skyTop: "#0d2034", skyBottom: "#4f6d7a", hills: "#304755", ground: "#3e5058", groundDark: "#213541", prop: "#192c38" },
    scale: 5.76, xpReward: 1070, waves: [bossWave("skybreaker")],
  },

  {
    id: 48, name: "Redleaf Border", subtitle: "Autumn arrives ahead of you",
    palette: { skyTop: "#38263b", skyBottom: "#a84d55", hills: "#673944", ground: "#71454a", groundDark: "#402b35", prop: "#2d2130" },
    scale: 6.16, xpReward: 995,
    waves: [w([foe("bloodreaver"), 1], ["wolf", 2]), w(["bonecaller", 1], ["shambler", 3], [foe("bloodreaver"), 1]), w(["reefhound", 2], ["saltwitch", 1], ["galeharrier", 2])],
  },
  {
    id: 49, name: "Hunter's Lanterns", subtitle: "The lights move between the trunks",
    palette: { skyTop: "#2d2034", skyBottom: "#93434f", hills: "#58313d", ground: "#653c43", groundDark: "#382632", prop: "#281d2b" },
    scale: 6.32, xpReward: 1025,
    waves: [w(["stalker", 2], [foe("bloodreaver"), 1]), w(["snowhag", 1], ["icewisp", 2], [foe("bloodreaver"), 1]), w(["harrier", 2], ["shieldbearer", 2], ["drummer", 1])],
  },
  {
    id: 50, name: "Antlerfen", subtitle: "Hoofprints fill with moonlight",
    palette: { skyTop: "#30233a", skyBottom: "#87505d", hills: "#55404d", ground: "#5d474c", groundDark: "#342a35", prop: "#25202b" },
    scale: 6.48, xpReward: 1055,
    waves: [w(["kelpbound", 2], [foe("bloodreaver"), 1]), w(["saltwitch", 1], ["stalker", 2], [foe("bloodreaver"), 2]), w(["reefhound", 3], ["bonecaller", 1], ["harrier", 1])],
  },
  {
    id: 51, name: "Scarlet Orchard", subtitle: "Every fallen fruit beats once",
    palette: { skyTop: "#261b2f", skyBottom: "#7c3444", hills: "#4b2a37", ground: "#59343d", groundDark: "#30222d", prop: "#211923" },
    scale: 6.68, xpReward: 1110,
    waves: [w(["stalker", 2], ["bonecaller", 1], [foe("bloodreaver"), 2]), w(["shieldbearer", 2], ["warbanner", 1], [foe("bloodreaver"), 1]), w(["rimetroll", 2], ["snowhag", 1], ["harrier", 2])],
  },
  {
    id: 52, name: "The Hartless Court", subtitle: "The hunt names its quarry",
    palette: { skyTop: "#2b1b2e", skyBottom: "#963846", hills: "#562735", ground: "#63323a", groundDark: "#341f29", prop: "#241720" },
    scale: 6.78, xpReward: 1145,
    waves: [w(["wolf", 2], [foe("bloodreaver"), 2]), w(["bonecaller", 2], ["shambler", 3], [foe("bloodreaver"), 1]), w(["reefhound", 3], ["saltwitch", 1], ["galeharrier", 2])],
  },
  {
    id: 53, name: "Bloodmoon Glade", subtitle: "The forest raises its crown",
    palette: { skyTop: "#190f20", skyBottom: "#6b2637", hills: "#3a1e2a", ground: "#48262e", groundDark: "#251720", prop: "#190f17" },
    scale: 6.16, xpReward: 1230, waves: [bossWave("bloodmoonstag")],
  },

  {
    id: 54, name: "Mile Zero", subtitle: "All roads cast the same shadow",
    palette: { skyTop: "#171421", skyBottom: "#655a6e", hills: "#4f4855", ground: "#5b535c", groundDark: "#39323e", prop: "#2a2530" },
    scale: 6.66, xpReward: 1150,
    waves: [w([foe("nullwalker"), 1], ["shieldbearer", 2]), w(["bonecaller", 1], ["stormcaller", 1], [foe("nullwalker"), 1]), w(["rimetroll", 2], ["conchseer", 1], ["drummer", 1])],
  },
  {
    id: 55, name: "The Unwritten Mile", subtitle: "Footprints vanish before they land",
    palette: { skyTop: "#13111d", skyBottom: "#574d61", hills: "#443e4b", ground: "#504851", groundDark: "#312c36", prop: "#24202a" },
    scale: 6.84, xpReward: 1185,
    waves: [w(["stalker", 2], [foe("nullwalker"), 1]), w(["icewisp", 2], ["saltwitch", 1], [foe("nullwalker"), 1]), w(["shieldbearer", 2], ["wreckgunner", 2], ["bonecaller", 1])],
  },
  {
    id: 56, name: "Compass Grave", subtitle: "North has been eaten",
    palette: { skyTop: "#100e19", skyBottom: "#494152", hills: "#393440", ground: "#453f47", groundDark: "#2a2630", prop: "#1e1b24" },
    scale: 7.02, xpReward: 1220,
    waves: [w(["stormcaller", 1], ["galeharrier", 2], [foe("nullwalker"), 1]), w(["bonecaller", 2], ["shambler", 3], [foe("nullwalker"), 1]), w(["rimetroll", 2], ["conchseer", 1], ["harrier", 2])],
  },
  {
    id: 57, name: "Pilgrim's End", subtitle: "The road walks without you",
    palette: { skyTop: "#0c0b13", skyBottom: "#3d3547", hills: "#302c37", ground: "#3b353d", groundDark: "#242029", prop: "#191720" },
    scale: 7.24, xpReward: 1280,
    waves: [w(["stalker", 2], ["shieldbearer", 1], [foe("nullwalker"), 2]), w(["bonecaller", 2], ["icewisp", 2], [foe("nullwalker"), 1]), w(["rimetroll", 2], ["stormcaller", 2], ["conchseer", 1])],
  },
  {
    id: 58, name: "The Last Waystone", subtitle: "Every journey leaves one witness",
    palette: { skyTop: "#0a0910", skyBottom: "#332d3c", hills: "#292531", ground: "#332e35", groundDark: "#1e1b23", prop: "#15131a" },
    scale: 7.36, xpReward: 1320,
    waves: [w(["galeharrier", 2], ["stormcaller", 1], [foe("nullwalker"), 1]), w(["shieldbearer", 2], ["warbanner", 1], [foe("nullwalker"), 2]), w(["bonecaller", 2], ["rimetroll", 2], ["stalker", 2])],
  },
  {
    id: 59, name: "Mouth of the Road", subtitle: "The horizon opens",
    palette: { skyTop: "#06050a", skyBottom: "#24202d", hills: "#1e1a24", ground: "#29242b", groundDark: "#17141a", prop: "#0f0d12" },
    scale: 6.58, xpReward: 1450, waves: [bossWave("wayeater")],
  },
];

export function lateRoadRegionForStage(stage: number): LateRoadRegion | undefined {
  if (stage < 18 || stage > 59) return undefined;
  return LATE_ROAD_REGIONS[Math.floor((stage - 18) / 6)];
}

function landmarkMarkup(region: LateRoadRegion): string {
  switch (region.id) {
    case "cinderwild":
      return `<g transform="translate(500 57)"><path d="M-92 105 L-48 38 L-19 82 L14 20 L82 105Z" fill="${region.map.landDark}"/><path d="M2 35 Q14 19 27 36" fill="none" stroke="${region.map.glow}" stroke-width="6"/><path d="M14 17 C-3 -8 35 -14 19 -39 C49 -21 44 8 31 21" fill="none" stroke="${region.map.glow}" stroke-width="10" opacity=".3"/></g>`;
    case "verdant-maw":
      return `<g transform="translate(511 35)" fill="${region.map.landDark}"><path d="M-16 126 Q-31 76 -18 34 Q-48 50 -71 25 Q-29 27 -10 3 Q2 35 5 55 Q29 29 61 42 Q31 53 13 82 L19 126Z"/><ellipse cx="-5" cy="37" rx="79" ry="25"/><ellipse cx="33" cy="57" rx="55" ry="20"/></g>`;
    case "nightglass":
      return `<g transform="translate(498 47)"><circle cx="38" cy="9" r="28" fill="${region.map.accent}" opacity=".72"/><circle cx="49" cy="1" r="26" fill="${region.map.skyTop}"/><g fill="${region.map.landDark}"><path d="M-80 112 L-54 25 L-30 112Z"/><path d="M-28 112 L2 7 L22 112Z"/><path d="M28 112 L53 39 L77 112Z"/></g><g stroke="${region.map.glow}" opacity=".46"><path d="M-54 25 L-48 93"/><path d="M2 7 L7 94"/><path d="M53 39 L58 91"/></g></g>`;
    case "reliquary":
      return `<g transform="translate(493 65)" stroke="${region.map.landDark}" stroke-width="12" fill="none"><path d="M-74 93 V28 Q-74 -17 -27 -17 Q20 -17 20 28 V93"/><path d="M20 93 V45 Q20 12 55 12 Q88 12 88 45 V93"/><path d="M-27 -17 V-43 M-42 -31 H-12"/><path d="M-84 93 H98"/></g>`;
    case "skygrave":
      return `<g transform="translate(492 67)" fill="${region.map.landDark}"><path d="M-106 25 Q-64 5 -23 23 L-37 57 L-73 69Z"/><path d="M5 5 Q46 -16 91 8 L72 52 L27 62Z"/><path d="M-27 86 Q15 65 58 85 L45 111 L-8 117Z"/><path d="M-25 31 Q-7 25 9 20" fill="none" stroke="${region.map.accent}" stroke-width="3" stroke-dasharray="5 5"/></g>`;
    case "bloodwood":
      return `<g transform="translate(510 49)"><circle cx="18" cy="15" r="37" fill="${region.map.glow}" opacity=".7"/><path d="M-2 122 Q-13 79 2 52 L-29 18 M2 56 L33 18 M-18 35 L-46 2 M-18 34 L-9 0 M26 35 L55 5 M26 36 L23 -4" stroke="${region.map.landDark}" stroke-width="12" fill="none" stroke-linecap="round"/></g>`;
    case "last-meridian":
      return `<g transform="translate(504 44)"><ellipse cx="16" cy="48" rx="51" ry="72" fill="${region.map.ink}"/><ellipse cx="16" cy="48" rx="32" ry="52" fill="none" stroke="${region.map.glow}" stroke-width="2" opacity=".52"/><path d="M-92 125 L-44 55 L-24 125 M56 125 L78 54 L112 125" fill="${region.map.landDark}"/><path d="M16 125 L16 74" stroke="${region.map.road}" stroke-width="12" opacity=".6"/></g>`;
  }
}

function contourMarkup(region: LateRoadRegion): string {
  return Array.from({ length: 5 }, (_, i) => {
    const y = 128 + i * 35;
    return `<path d="M-20 ${y} Q100 ${y - 35 + i * 3} 218 ${y + 2} T452 ${y - 6} T680 ${y - 20}" fill="none" stroke="${region.map.accent}" stroke-width="1" opacity="${0.08 + i * 0.025}"/>`;
  }).join("");
}

/** A shared survey-plate treatment for Acts IV-X. The palette, route, skyline,
 * landmark and atmosphere all come from region data, so new panels remain part
 * of one atlas without pretending to be seven more bespoke opening paintings. */
export function lateRoadMapMarkup(
  region: LateRoadRegion,
  unlockedStage: number,
  selectedStage: number | null,
  travelFrom: number | null = null,
  campaignComplete = false,
  reducedMotion = false,
): string {
  const stages = LATE_ROAD_STAGES.slice(region.start - 18, region.start - 12);
  const nodes = region.route.map((y, index) => ({ x: 62 + index * 104, y }));
  const road = nodes.map((node, index) => index === 0
    ? `M ${node.x} ${node.y}`
    : `Q ${(nodes[index - 1].x + node.x) / 2} ${(nodes[index - 1].y + node.y) / 2 + (index % 2 ? 20 : -16)} ${node.x} ${node.y}`).join(" ");
  const rid = region.id.replace(/[^a-z]/g, "");
  const markers = nodes.map((node, index) => {
    const stage = stages[index];
    const sid = region.start + index;
    const finaleDone = campaignComplete && region.id === "last-meridian" && sid === region.bossStage;
    const done = sid < unlockedStage || finaleDone;
    const current = sid === unlockedStage && !finaleDone;
    const open = sid <= unlockedStage;
    const selected = sid === selectedStage;
    const labelWidth = Math.min(154, Math.max(58, stage.name.length * 6.1 + 16));
    const cadence = sid === region.bossStage ? "boss" : sid === region.eliteStage ? "elite" : "road";
    return `<g class="map-node survey-node ${current ? "current" : ""} ${open ? "open" : "locked"} ${selected ? "sel" : ""} ${cadence}" data-stage="${sid}">
      <circle cx="${node.x}" cy="${node.y}" r="31" fill="transparent"/>
      <circle class="sel-ring" cx="${node.x}" cy="${node.y}" r="24" fill="none" stroke="${region.map.accent}" stroke-width="2" stroke-dasharray="5 6"/>
      ${current ? `<circle class="node-pulse" cx="${node.x}" cy="${node.y}" r="21" fill="none" stroke="${region.map.accent}" stroke-width="2.5"/>` : ""}
      ${cadence === "boss" ? `<path d="M ${node.x} ${node.y - 27} l 7 7 l -7 7 l -7 -7 z" fill="${region.map.glow}" stroke="${region.map.ink}" stroke-width="2"/>` : cadence === "elite" ? `<path d="M ${node.x - 8} ${node.y - 23} h16" stroke="${region.map.accent}" stroke-width="3"/>` : ""}
      <circle cx="${node.x}" cy="${node.y}" r="17" fill="${done ? `url(#${rid}Done)` : current ? `url(#${rid}Now)` : region.map.landDark}" stroke="${region.map.ink}" stroke-width="4"/>
      <circle cx="${node.x}" cy="${node.y}" r="17" fill="none" stroke="${done ? region.map.accent : current ? "#fff0ba" : region.map.land}" stroke-width="2.5"/>
      ${open ? `<text x="${node.x}" y="${node.y + 5.5}" text-anchor="middle" font-size="15" font-weight="900" fill="#fff8e5">${done ? "✓" : sid + 1}</text>` : `<circle cx="${node.x}" cy="${node.y}" r="3" fill="${region.map.accent}" opacity=".42"/>`}
      ${open ? `<rect x="${node.x - labelWidth / 2}" y="${node.y + 24}" width="${labelWidth}" height="15" rx="2" fill="${region.map.ink}" opacity=".9"/><text x="${node.x}" y="${node.y + 35}" text-anchor="middle" font-size="9.3" font-weight="700" fill="#f4ead7">${stage.name}</text>` : `<text x="${node.x}" y="${node.y + 35}" text-anchor="middle" font-size="9" fill="${region.map.accent}" opacity=".48">UNCHARTED</text>`}
    </g>`;
  }).join("");
  const atmosphere = Array.from({ length: 14 }, (_, i) => {
    const x = 19 + ((i * 83 + region.act * 31) % 610);
    const y = 26 + ((i * 47 + region.act * 13) % 172);
    return `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 2 : 1.2}" fill="${region.map.glow}" opacity="${0.18 + (i % 4) * 0.08}"/>`;
  }).join("");
  let travel = "";
  if (travelFrom !== null && travelFrom >= region.start && travelFrom < region.bossStage) {
    const from = nodes[travelFrom - region.start];
    const to = nodes[travelFrom - region.start + 1];
    travel = reducedMotion
      ? `<circle cx="${to.x}" cy="${to.y}" r="7" fill="#fff0ba" stroke="${region.map.ink}" stroke-width="2"/>`
      : `<circle r="7" fill="#fff0ba" stroke="${region.map.ink}" stroke-width="2"><animateMotion dur="1.6s" fill="freeze" path="M ${from.x} ${from.y} L ${to.x} ${to.y}"/></circle>`;
  }
  return `<div class="map-frame late-road-map late-road-${region.id}"><svg viewBox="0 0 640 320" role="img" aria-label="${region.name}, stages ${region.start + 1} through ${region.bossStage + 1}">
    <defs>
      <linearGradient id="${rid}Sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${region.map.skyTop}"/><stop offset="1" stop-color="${region.map.skyBottom}"/></linearGradient>
      <linearGradient id="${rid}Land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${region.map.land}"/><stop offset="1" stop-color="${region.map.landDark}"/></linearGradient>
      <radialGradient id="${rid}Now"><stop offset="0" stop-color="#fff2bd"/><stop offset="1" stop-color="${region.map.glow}"/></radialGradient>
      <radialGradient id="${rid}Done"><stop offset="0" stop-color="${region.map.accent}"/><stop offset="1" stop-color="${region.map.land}"/></radialGradient>
    </defs>
    <rect width="640" height="320" fill="url(#${rid}Sky)"/>
    <g class="survey-grid" stroke="${region.map.accent}" opacity=".08"><path d="M0 64H640 M0 128H640 M0 192H640 M0 256H640"/><path d="M80 0V320 M160 0V320 M240 0V320 M320 0V320 M400 0V320 M480 0V320 M560 0V320"/></g>
    ${contourMarkup(region)}
    <path d="M0 152 Q104 112 205 141 T402 126 T640 113 L640 320 L0 320Z" fill="url(#${rid}Land)"/>
    <g class="survey-landmark">${landmarkMarkup(region)}</g>
    <g class="survey-drift">${atmosphere}</g>
    <path d="${road}" fill="none" stroke="${region.map.ink}" stroke-width="14" stroke-linecap="round"/>
    <path d="${road}" fill="none" stroke="${region.map.road}" stroke-width="7" stroke-linecap="round"/>
    <path d="${road}" fill="none" stroke="${region.map.accent}" stroke-width="1.5" stroke-dasharray="2 9" stroke-linecap="round" opacity=".8"/>
    <g transform="translate(18 292)"><text fill="${region.map.accent}" font-size="8" font-family="ui-monospace,monospace" letter-spacing="1.4">SURVEY ${String(region.act).padStart(2, "0")} · ${region.atmosphere.toUpperCase()}</text></g>
    ${markers}${travel}
  </svg></div>`;
}

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function lateRoadIsNight(stage: number): boolean {
  return lateRoadRegionForStage(stage)?.night ?? false;
}

export function lateRoadDarkness(stage: number): number {
  return lateRoadRegionForStage(stage)?.darkness ?? 0;
}

export function lateRoadGrade(stage: number): string | undefined {
  return lateRoadRegionForStage(stage)?.grade;
}

/** Region silhouettes sit behind the shared battlefield terrain language. */
export function drawLateRoadSkyline(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  horizon: number,
  time: number,
  travel: number,
): void {
  const region = lateRoadRegionForStage(stage.id);
  if (!region) return;
  const shift = ((travel * 0.12) % (w + 180) + w + 180) % (w + 180);
  ctx.save();
  ctx.fillStyle = region.map.landDark;
  ctx.strokeStyle = region.map.accent;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.86;
  switch (region.id) {
    case "cinderwild": {
      ctx.beginPath();
      ctx.moveTo(-120 - shift * 0.15, horizon + 3);
      ctx.lineTo(w * 0.48 - shift * 0.15, horizon - 132);
      ctx.lineTo(w * 0.58 - shift * 0.15, horizon - 52);
      ctx.lineTo(w + 120, horizon + 3);
      ctx.closePath();
      ctx.fill();
      const ventX = w * 0.51 - shift * 0.15;
      const glow = ctx.createRadialGradient(ventX, horizon - 112, 2, ventX, horizon - 112, 54);
      glow.addColorStop(0, "rgba(255,112,52,.48)");
      glow.addColorStop(1, "rgba(255,112,52,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(ventX - 60, horizon - 172, 120, 120);
      break;
    }
    case "verdant-maw": {
      for (let i = -1; i < 6; i++) {
        const x = ((i * 164 - shift * 0.28) % (w + 240)) - 80;
        const crown = horizon - 88 - noise(i + 21) * 42;
        ctx.fillStyle = region.map.landDark;
        ctx.fillRect(x - 10, crown, 20, horizon - crown + 8);
        ctx.beginPath();
        ctx.ellipse(x, crown, 78, 28, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 42, crown + 18, 66, 23, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "nightglass": {
      for (let i = 0; i < 8; i++) {
        const x = ((i * 117 - shift * 0.24) % (w + 160)) - 60;
        const height = 30 + noise(i + stage.id) * 86;
        ctx.beginPath();
        ctx.moveTo(x - 18, horizon);
        ctx.lineTo(x, horizon - height);
        ctx.lineTo(x + 16, horizon);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(206,190,255,${0.15 + noise(i) * 0.25})`;
        ctx.beginPath();
        ctx.moveTo(x, horizon - height + 6);
        ctx.lineTo(x + 4, horizon - 8);
        ctx.stroke();
      }
      break;
    }
    case "reliquary": {
      ctx.lineWidth = 10;
      for (let i = 0; i < 4; i++) {
        const x = i * (w / 3) - shift * 0.17 - 30;
        ctx.beginPath();
        ctx.moveTo(x - 38, horizon);
        ctx.lineTo(x - 38, horizon - 68);
        ctx.quadraticCurveTo(x, horizon - 112, x + 38, horizon - 68);
        ctx.lineTo(x + 38, horizon);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      break;
    }
    case "skygrave": {
      for (let i = 0; i < 5; i++) {
        const x = ((i * 180 - shift * 0.35) % (w + 260)) - 90;
        const y = horizon - 62 - (i % 2) * 45;
        ctx.beginPath();
        ctx.moveTo(x - 70, y);
        ctx.quadraticCurveTo(x, y - 24, x + 70, y);
        ctx.lineTo(x + 31, y + 30);
        ctx.lineTo(x - 22, y + 44);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "bloodwood": {
      for (let i = 0; i < 7; i++) {
        const x = ((i * 134 - shift * 0.26) % (w + 180)) - 70;
        const top = horizon - 68 - noise(i + 61) * 58;
        ctx.lineWidth = 9 + noise(i) * 5;
        ctx.beginPath();
        ctx.moveTo(x, horizon + 3);
        ctx.lineTo(x, top + 24);
        ctx.lineTo(x - 29, top);
        ctx.moveTo(x, top + 33);
        ctx.lineTo(x + 34, top + 2);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      break;
    }
    case "last-meridian": {
      const vanishing = w * 0.62;
      for (let i = 0; i < 7; i++) {
        const depth = i / 6;
        const x = vanishing + (i % 2 ? 1 : -1) * (44 + depth * 280) - shift * 0.04;
        const height = 18 + depth * 50;
        ctx.fillRect(x - 4 - depth * 4, horizon - height, 8 + depth * 8, height);
      }
      const aperture = ctx.createRadialGradient(vanishing, horizon - 54, 4, vanishing, horizon - 54, 72);
      aperture.addColorStop(0, "rgba(5,4,8,.92)");
      aperture.addColorStop(0.6, "rgba(22,14,30,.66)");
      aperture.addColorStop(1, "rgba(22,14,30,0)");
      ctx.fillStyle = aperture;
      ctx.beginPath();
      ctx.arc(vanishing, horizon - 54, 72, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Lightweight regional weather. It deliberately uses one strong material per
 * act instead of layering the same generic particles over every battlefield. */
export function drawLateRoadAtmosphere(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
): void {
  const region = lateRoadRegionForStage(stage.id);
  if (!region) return;
  ctx.save();
  if (region.atmosphere === "high-storm") {
    ctx.strokeStyle = "rgba(215,242,255,.32)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 34; i++) {
      const x = ((noise(i * 9) * w - time * 190) % (w + 60) + w + 60) % (w + 60) - 30;
      const y = (noise(i * 13) * h + time * 220) % h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 12, y + 5);
    }
    ctx.stroke();
  } else {
    const colors: Record<Exclude<LateRoadAtmosphere, "high-storm">, string> = {
      embers: "rgba(255,126,62,.74)", spores: "rgba(153,238,158,.6)", glasswind: "rgba(215,202,255,.48)",
      "gold-dust": "rgba(255,222,143,.58)", "red-leaves": "rgba(225,73,82,.62)", "road-ash": "rgba(206,190,220,.42)",
    };
    ctx.fillStyle = colors[region.atmosphere];
    for (let i = 0; i < 22; i++) {
      const drift = region.atmosphere === "glasswind" ? time * 85 : time * (10 + noise(i) * 18);
      const x = ((noise(i * 19 + stage.id) * w + drift) % (w + 30)) - 15;
      const rising = region.atmosphere === "embers" ? time * 20 : 0;
      const y = ((noise(i * 37) * h + time * 22 - rising) % h + h) % h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.7 + i);
      if (region.atmosphere === "glasswind" || region.atmosphere === "red-leaves") ctx.fillRect(-3, -1, 7, 2);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, 1.2 + noise(i) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  if (region.id === "last-meridian") {
    ctx.strokeStyle = "rgba(222,205,235,.16)";
    for (let i = 0; i < 9; i++) {
      const y = horizon + 10 + i * ((h - horizon) / 9);
      const pull = (Math.sin(time * 0.5 + i) + 1) * 18;
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.quadraticCurveTo(w * 0.55 - pull, y - 12, w * 0.62, horizon - 18);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawLateRoadSetDressing(
  ctx: CanvasRenderingContext2D,
  stage: StageDef,
  w: number,
  h: number,
  horizon: number,
  time: number,
  seed: number,
): void {
  const region = lateRoadRegionForStage(stage.id);
  if (!region) return;
  const groundY = (n: number) => horizon + 32 + noise(seed * 71 + n * 23 + stage.id) * (h - horizon - 52);
  ctx.save();
  ctx.strokeStyle = region.map.ink;
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const x = noise(seed * 97 + i * 31 + stage.id) * w;
    const y = groundY(i);
    if (region.id === "cinderwild") {
      ctx.fillStyle = i % 2 ? "#211a20" : "#3b2426";
      ctx.beginPath();
      ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y - 22 - noise(i) * 18); ctx.lineTo(x + 13, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgba(255,94,43,${0.22 + Math.abs(Math.sin(time + i)) * 0.22})`;
      ctx.fillRect(x - 2, y - 17, 3, 12);
    } else if (region.id === "verdant-maw") {
      ctx.strokeStyle = "#244b32"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.quadraticCurveTo(x, y - 28, x + 34, y - 4); ctx.stroke();
      ctx.fillStyle = "#8edc79"; ctx.beginPath(); ctx.arc(x + 2, y - 17, 3 + i % 2, 0, Math.PI * 2); ctx.fill();
    } else if (region.id === "nightglass") {
      ctx.fillStyle = i % 2 ? "#64598a" : "#3b3659";
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y - 30 - i * 4); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (region.id === "reliquary") {
      ctx.fillStyle = "#8d795d"; ctx.fillRect(x - 8, y - 32, 16, 32); ctx.strokeRect(x - 8, y - 32, 16, 32);
      ctx.strokeStyle = "rgba(255,222,150,.48)"; ctx.beginPath(); ctx.arc(x, y - 19, 4, 0, Math.PI * 2); ctx.stroke();
    } else if (region.id === "skygrave") {
      ctx.fillStyle = "#465d68"; ctx.beginPath(); ctx.moveTo(x - 17, y); ctx.lineTo(x, y - 18); ctx.lineTo(x + 17, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#c9e2e5"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 18, y - 31 + Math.sin(time * 3 + i) * 2); ctx.stroke();
    } else if (region.id === "bloodwood") {
      ctx.strokeStyle = "#3a1f2b"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 27); ctx.lineTo(x - 10, y - 40); ctx.moveTo(x, y - 27); ctx.lineTo(x + 12, y - 42); ctx.stroke();
      ctx.fillStyle = "rgba(190,42,62,.3)"; ctx.beginPath(); ctx.ellipse(x, y + 1, 24, 6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#302b36"; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 6, y - 38); ctx.lineTo(x + 7, y - 42); ctx.lineTo(x + 10, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(210,192,225,.45)"; ctx.beginPath(); ctx.moveTo(x - 2, y - 31); ctx.lineTo(x + 2, y - 14); ctx.stroke();
    }
  }
  ctx.restore();
}
