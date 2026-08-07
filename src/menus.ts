import { audio } from "./audio";
import {
  ABILITIES,
  arenaPurse,
  ALL_GEAR,
  ARMORS,
  ARMOR_FAMILY_TIER,
  type ArmorDef,
  armorById,
  armorSetOf,
  BOOTS,
  FORGE_MAX,
  forgeCost,
  HELMS,
  heroGearOf,
  pieceLabel,
  SET_BONUSES,
  slotOf,
  ADV_CALLING_LEVEL,
  ADV_SWITCH_COST,
  advCallingById,
  DISCIPLINES,
  ELEMENTS,
  elementTechniqueOptions,
  HERO_STARTER_ABILITIES,
  pathId,
  pathAbilities,
  resolvedPathAbilities,
  elementById,
  CALLING_SWITCH_COST,
  CALLING_MASTERY_LEVELS,
  CALLING_UNLOCK_LEVEL,
  callingById,
  callingEligible,
  CONTRACTS,
  contractPurse,
  DIFFICULTIES,
  heroArrived,
  TRINKETS,
  trinketById,
  MAX_LEVEL,
  TALENTS,
  TALENT_TREES,
  type TalentTree,
  TALENT_TIER_LEVELS,
  talentPointBudget,
  talentPointsInTree,
  talentPointsSpent,
  BOSS_STAGES,
  ATTR_BLURBS,
  ATTR_KEYS,
  ATTR_NAMES,
  bandLevel,
  DEEDS,
  ENEMIES,
  HEROES,
  MAX_EQUIPPED,
  PARTY_CAP,
  RECRUIT_COST,
  ROAD_TUTELAGE_STAGE,
  roadTutelageCost,
  SPELL_COSTS,
  STAGES,
  WEAPON_DAMAGE_BONUS,
  WEAPON_TIERS,
  deriveStats,
  dominantWeapon,
  partyRoster,
  unlockedAbilities,
  xpForLevel,
} from "./data";
import type { AttrKey, DisciplineId, ElementId, EnemyKind } from "./types";

function bestAttr(index: number): AttrKey {
  const attrs = HEROES[index].baseAttrs;
  return ATTR_KEYS.reduce((best, k) => (attrs[k] > attrs[best] ? k : best), ATTR_KEYS[0]);
}
import { drawAbilityGlyph, ico } from "./icons";
import { lateRoadMapMarkup, LATE_ROAD_REGIONS, type LateRoadRegion } from "./late-road";
import { drawLateEnemyIcon } from "./late-sprites";
import { drawHeroFigure, setColorSafe } from "./render";
import { activeSlot, defaultSave, DEFAULT_KEYBINDS, grantHeroXp, nextSpeed, peekSlot, persist, respecHero, setActiveSlot, SLOT_NAMES, slotKey, speedLabel } from "./save";
import { exportTelemetry, telemetrySummary } from "./telemetry";
import type { SaveData } from "./types";

export interface MenuCallbacks {
  startStage: (stageIndex: number) => void;
  startChallenge: (kind: "arena" | "contract", stageIndex: number, id: string) => void;
  startTutorial: (kind: string, returnTo: "map" | "handbook") => void;
  battleActive: () => boolean;
  pauseBattle: () => void;
  resetProgress: () => void;
}

/** Each discipline receives three focused trees, mirroring Diablo's class identity. */
const DISCIPLINE_TALENT_TREES: Record<DisciplineId, readonly TalentTree[]> = {
  knight: ["might", "bulwark", "faith"],
  rogue: ["precision", "swiftness", "fortune"],
  archer: ["precision", "sorcery", "fortune"],
  priest: ["faith", "bulwark", "sorcery"],
  mage: ["sorcery", "swiftness", "faith"],
};

const TALENT_TREE_PROMISES: Record<TalentTree, string> = {
  might: "Turn kills into tempo, healing, and sweeping melee pressure.",
  precision: "Open fights cleanly, finish wounded targets, and chain perfect shots.",
  sorcery: "Accelerate elemental reactions and reshape technique recovery.",
  faith: "Convert healing into wards, rescues, and second chances.",
  bulwark: "Absorb the first crisis, punish attackers, and shelter nearby allies.",
  swiftness: "Avoid opening blows and keep moving between dangerous lanes.",
  fortune: "Read priority targets, begin prepared, and charge ultimates through correct focus.",
};

const NATURAL_DISCIPLINE: Record<AttrKey, DisciplineId> = {
  str: "knight",
  dex: "archer",
  int: "mage",
  vit: "knight",
  spi: "priest",
};

const WEAPON_LABEL: Record<string, string> = {
  sword: "Blade",
  bow: "Bow",
  staff: "Staff",
  stave: "Stave",
};

function abilityById(id: string) {
  return ABILITIES.find((a) => a.id === id)!;
}

function heroPathAbilities(hero: SaveData["heroes"][number]) {
  return hero.discipline && hero.element ? [...resolvedPathAbilities(hero.discipline, hero.element, hero.equipped)] : [];
}

function enemyWaymark(kind: EnemyKind, compact = false): string {
  const enemy = ENEMIES[kind];
  const weak = elementById(enemy.weakTo)?.name;
  const resists = elementById(enemy.resists)?.name;
  if (!weak && !resists) return "";
  const copy = [weak ? `weak to ${weak}` : "", resists ? `resists ${resists}` : ""].filter(Boolean).join(" · ");
  return compact
    ? `<span class="enemy-waymark compact"><b>Waymark</b> ${copy}</span>`
    : `<div class="enemy-waymark"><b>Waymark</b><span>${copy}</span></div>`;
}

const BESTIARY_REGIONS = [
  { name: "The South Road", range: "I–VI" },
  { name: "The Winterreach", range: "VII–XII" },
  { name: "Stormbreak Coast", range: "XIII–XVIII" },
  ...LATE_ROAD_REGIONS.map((region) => ({ name: region.name, range: region.range })),
];

function enemyFirstStage(kind: EnemyKind): number {
  return Math.max(0, STAGES.findIndex((stage) => stage.waves.some((wave) => wave.some((entry) => entry.kind === kind))));
}

function enemyRegionIndex(kind: EnemyKind): number {
  return Math.min(BESTIARY_REGIONS.length - 1, Math.floor(enemyFirstStage(kind) / 6));
}

function enemyRoleLabel(kind: EnemyKind): string {
  const role = ENEMIES[kind].role ?? "vanguard";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function buildIdentity(save: SaveData, index: number): string {
  const hero = save.heroes[index];
  const calling = callingById(hero.calling);
  if (calling && callingEligible(calling, hero.attrs)) return calling.name;
  return hero.level >= CALLING_UNLOCK_LEVEL ? "Path unchosen" : "Roadbound";
}

type Derived = ReturnType<typeof deriveStats>;

/** After spending a point, flash the stat cells that actually moved (green up,
 *  red down — a weapon morph can trade damage away) so cause→effect is visible. */
function flashStatDeltas(card: HTMLElement, before: Derived, after: Derived): void {
  const reads: [string, (s: Derived) => number, (d: number) => string][] = [
    ["Health", (s) => s.maxHp, (d) => `${Math.round(d)}`],
    ["Damage", (s) => s.damage, (d) => `${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`],
    ["Atk speed", (s) => 1 / s.attackCooldown, (d) => `${d.toFixed(2)}/s`],
    ["Armor", (s) => s.armor * 100, (d) => `${Math.round(d)}%`],
    ["Move", (s) => s.speed, (d) => `${Math.round(d)}`],
    ["Healing", (s) => s.healPower, (d) => `${d.toFixed(1)}/s`],
    ["Technique power", (s) => s.spellPower, (d) => `${d.toFixed(2)}`],
  ];
  const show = (key: string, text: string, up: boolean) => {
    const cell = card.querySelector(`[data-stat="${key}"]`);
    if (!cell) return;
    cell.classList.add(up ? "stat-up" : "stat-down");
    const chip = el(`<span class="stat-delta ${up ? "" : "down"}">${text}</span>`);
    cell.appendChild(chip);
    setTimeout(() => {
      chip.remove();
      cell.classList.remove("stat-up", "stat-down");
    }, 1700);
  };
  for (const [key, get, fmt] of reads) {
    const d = get(after) - get(before);
    if (Math.abs(d) < 0.005) continue;
    show(key, `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`, d > 0);
  }
  const wasRanged = before.range > 90;
  const isRanged = after.range > 90;
  if (wasRanged !== isRanged) show("Range", isRanged ? "now ranged" : "now melee", true);
}

/** Small canvas chip with an ability's glyph (or a dashed empty slot). */
function spellSlotEl(id: string | null, size = 24): HTMLElement {
  const span = el(`<span class="mini-slot ${id ? "filled" : ""}"></span>`);
  if (id) {
    const ability = abilityById(id);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size * 2;
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    drawAbilityGlyph(ctx, ability.icon, size / 2, size / 2, size * 0.3, ability.color);
    span.style.setProperty("--chip", ability.color);
    span.appendChild(canvas);
  }
  return span;
}

const STAT_BLURBS: Record<string, string> = {
  Health: "How much punishment a hero takes before falling.",
  Damage: "Damage dealt by each basic attack.",
  "Atk speed": "How many attacks land per second.",
  Armor: "The share of incoming damage shrugged off.",
  Range: "Melee fights up close — ranged strikes from a distance.",
  Move: "How quickly the hero crosses the battlefield.",
  Healing: "Health restored per second while channeling a heal.",
  "Technique power": "Multiplies the strength of every elemental technique they use.",
};

/** Front-facing hero bust for menu cards; drawn in 64-unit space and scaled to the canvas. */
export function drawHeroPortrait(canvas: HTMLCanvasElement, index: number, save: SaveData): void {
  const ctx = canvas.getContext("2d")!;
  const def = HEROES[index];
  const hero = save.heroes[index];
  const portraitOath = callingById(hero.calling);
  const portraitHolds = portraitOath ? callingEligible(portraitOath, hero.attrs) : false;
  const robed = dominantWeapon(hero.attrs, portraitHolds ? hero.calling : null) === "stave";
  const bustPiece = armorById(hero.armor);
  const plateTint = bustPiece?.tint ?? "#aab4c2";
  const aTier = bustPiece ? ARMOR_FAMILY_TIER[bustPiece.family] : 0;
  const outline = "#221a30";
  const line = (w: number) => {
    ctx.strokeStyle = outline;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / 64, canvas.height / 64);
  // a sworn oath glows faintly behind the bust
  if (portraitOath && portraitHolds) {
    const halo = ctx.createRadialGradient(32, 30, 6, 32, 30, 30);
    halo.addColorStop(0, portraitOath.color + "55");
    halo.addColorStop(1, portraitOath.color + "00");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 64, 64);
  }
  // the armor family frames the portrait's corners
  if (bustPiece) {
    const famColor = { cloth: "#c9b896", leather: "#a8845a", mail: "#9aa3ad", plate: "#e0c896" }[bustPiece.family];
    ctx.strokeStyle = famColor;
    ctx.lineWidth = 2.4;
    for (const [gx, gy, dx, dy] of [[3, 3, 1, 1], [61, 3, -1, 1], [3, 61, 1, -1], [61, 61, -1, -1]] as number[][]) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + dy * 9);
      ctx.lineTo(gx, gy);
      ctx.lineTo(gx + dx * 9, gy);
      ctx.stroke();
    }
  }
  // bust
  ctx.beginPath();
  ctx.moveTo(9, 66);
  ctx.quadraticCurveTo(11, 45, 24, 42);
  ctx.lineTo(40, 42);
  ctx.quadraticCurveTo(53, 45, 55, 66);
  ctx.closePath();
  ctx.fillStyle = robed ? "#efe6d0" : def.accent;
  ctx.fill();
  line(3);
  if (robed) {
    // accent stole down the robe
    ctx.fillStyle = def.accent;
    ctx.fillRect(28, 44, 8, 20);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 44, 8, 20);
  }
  if (!robed && aTier >= 1) {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(32 + dir * 15, 46, 8, 5.5, dir * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = aTier >= 3 ? plateTint : "#7a5a3a";
      ctx.fill();
      line(2.4);
    }
  }
  if (!robed && aTier >= 2) {
    ctx.strokeStyle = aTier >= 3 ? plateTint : "#9aa3ad";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(21, 47);
    ctx.lineTo(43, 59);
    ctx.stroke();
  }
  // head
  ctx.beginPath();
  ctx.arc(32, 27, 14, 0, Math.PI * 2);
  ctx.fillStyle = def.skin;
  ctx.fill();
  line(3);
  if (robed) {
    // deep hood framing the face
    ctx.beginPath();
    ctx.arc(32, 27, 16, Math.PI * 0.82, Math.PI * 2.18);
    ctx.closePath();
    ctx.fillStyle = "#efe6d0";
    ctx.fill();
    line(2.6);
  } else if (aTier >= 3) {
    // plate helm with nose guard and plume
    ctx.beginPath();
    ctx.arc(32, 25.5, 14.6, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fillStyle = plateTint;
    ctx.fill();
    line(2.6);
    ctx.fillStyle = plateTint;
    ctx.fillRect(30.4, 22, 3.2, 10);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(30.4, 22, 3.2, 10);
    ctx.beginPath();
    ctx.moveTo(26, 13);
    ctx.quadraticCurveTo(18, 4, 12, 10);
    ctx.quadraticCurveTo(20, 13, 25, 17);
    ctx.closePath();
    ctx.fillStyle = def.accent;
    ctx.fill();
    line(2);
  } else {
    // hair cap
    ctx.beginPath();
    ctx.arc(32, 25, 14, Math.PI * 0.98, Math.PI * 2.02);
    ctx.closePath();
    ctx.fillStyle = def.hair;
    ctx.fill();
    line(2.4);
  }
  // face
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.arc(26.6, 28.5, 2, 0, Math.PI * 2);
  ctx.arc(37.4, 28.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(23.6, 24.4);
  ctx.lineTo(29.4, 23.6);
  ctx.moveTo(34.6, 23.6);
  ctx.lineTo(40.4, 24.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(29.5, 34.6);
  ctx.quadraticCurveTo(32, 36, 34.5, 34.6);
  ctx.stroke();
  // crest badge for a sworn (and honored) oath
  const oath = callingById(hero.calling);
  if (oath && callingEligible(oath, hero.attrs)) {
    ctx.beginPath();
    ctx.arc(51, 53, 9, 0, Math.PI * 2);
    ctx.fillStyle = oath.color;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    drawAbilityGlyph(ctx, oath.signature.icon, 51, 53, 4.6, "#17111f");
  }
  ctx.restore();
}

/** Simplified enemy bust for bestiary cards. */
function drawBeastIcon(canvas: HTMLCanvasElement, kind: EnemyKind): void {
  const ctx = canvas.getContext("2d")!;
  const def = ENEMIES[kind];
  const c = 32;
  const outline = "#1a1424";
  const stroke = () => {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.stroke();
  };
  ctx.clearRect(0, 0, 64, 64);
  if (drawLateEnemyIcon(ctx, kind)) return;
  if (kind === "wolf" || kind === "alpha" || kind === "frostwolf" || kind === "reefhound") {
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.ellipse(c, 38, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke();
    ctx.beginPath();
    ctx.moveTo(c + 10, 34);
    ctx.lineTo(c + 26, 40);
    ctx.lineTo(c + 8, 44);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.beginPath();
    ctx.moveTo(c - 6, 27);
    ctx.lineTo(c - 2, 12);
    ctx.lineTo(c + 6, 25);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.fillStyle = "#ffd76b";
    ctx.beginPath();
    ctx.arc(c + 6, 34, 2.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "wyrm" || kind === "stormeel" || kind === "stormjaw") {
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.moveTo(8, 46);
    ctx.bezierCurveTo(17, 24, 31, 52, 43, 31);
    ctx.bezierCurveTo(49, 20, 57, 25, 57, 35);
    ctx.bezierCurveTo(49, 28, 47, 46, 34, 51);
    ctx.bezierCurveTo(22, 56, 18, 43, 8, 46);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.fillStyle = def.trim;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(21 + i * 7, 42 - i * 2);
      ctx.lineTo(25 + i * 7, 31 - i * 2);
      ctx.lineTo(29 + i * 7, 40 - i * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#f6df76";
    ctx.beginPath();
    ctx.arc(51, 32, 2.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "harrier" || kind === "galeharrier") {
    ctx.fillStyle = def.trim;
    ctx.beginPath();
    ctx.moveTo(c, 35);
    ctx.quadraticCurveTo(13, 12, 5, 23);
    ctx.quadraticCurveTo(15, 23, 22, 45);
    ctx.lineTo(c, 50);
    ctx.lineTo(42, 45);
    ctx.quadraticCurveTo(49, 23, 59, 23);
    ctx.quadraticCurveTo(51, 12, c, 35);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.ellipse(c, 38, 9, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke();
    ctx.beginPath();
    ctx.moveTo(c + 5, 27);
    ctx.lineTo(c + 18, 31);
    ctx.lineTo(c + 6, 35);
    ctx.closePath();
    ctx.fillStyle = "#d8c68f";
    ctx.fill();
    stroke();
    ctx.fillStyle = "#f6df76";
    ctx.beginPath();
    ctx.arc(c + 4, 30, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "brinecrawler") {
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.ellipse(c, 38, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke();
    ctx.fillStyle = def.trim;
    ctx.beginPath();
    ctx.arc(c, 37, 12, Math.PI, Math.PI * 2);
    ctx.lineTo(c + 12, 41);
    ctx.lineTo(c - 12, 41);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(c + side * (9 + i * 3), 40 + i * 3);
        ctx.lineTo(c + side * (21 + i * 3), 50 + i * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#f1de8d";
    ctx.beginPath();
    ctx.arc(c - 6, 33, 2, 0, Math.PI * 2);
    ctx.arc(c + 6, 33, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "bellwidow") {
    ctx.fillStyle = def.trim;
    ctx.beginPath();
    ctx.moveTo(c, 7);
    ctx.quadraticCurveTo(14, 18, 13, 54);
    ctx.quadraticCurveTo(c, 61, 51, 54);
    ctx.quadraticCurveTo(50, 18, c, 7);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.arc(c, 28, 10, 0, Math.PI * 2);
    ctx.fill();
    stroke();
    ctx.strokeStyle = "#e5c06b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c, 8);
    ctx.lineTo(c, 18);
    ctx.stroke();
    ctx.fillStyle = "#e5c06b";
    ctx.beginPath();
    ctx.arc(c, 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0dc8e";
    ctx.beginPath();
    ctx.arc(c - 4, 28, 2, 0, Math.PI * 2);
    ctx.arc(c + 4, 28, 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "icewisp") {
    ctx.shadowColor = "#9fd6e8";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#9fd6e8";
    ctx.beginPath();
    ctx.moveTo(c, 12);
    ctx.lineTo(c + 12, 34);
    ctx.lineTo(c, 54);
    ctx.lineTo(c - 12, 34);
    ctx.closePath();
    ctx.fill();
    stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e8f8fc";
    ctx.beginPath();
    ctx.moveTo(c, 24);
    ctx.lineTo(c + 5, 34);
    ctx.lineTo(c, 44);
    ctx.lineTo(c - 5, 34);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const big = kind === "brute" || kind === "warlord" || kind === "ogre" || kind === "rimetroll" || kind === "rimeheart";
  // shoulders
  ctx.fillStyle = def.trim;
  ctx.beginPath();
  ctx.ellipse(c, 58, big ? 24 : 19, 12, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  stroke();
  // head
  ctx.fillStyle = def.body;
  ctx.beginPath();
  ctx.arc(c, big ? 34 : 32, big ? 15 : 16, 0, Math.PI * 2);
  ctx.fill();
  stroke();
  if (kind === "goblin" || kind === "archer" || kind === "shaman" || kind === "snowhag") {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + s * 12, 28);
      ctx.lineTo(c + s * 27, 24);
      ctx.lineTo(c + s * 11, 35);
      ctx.closePath();
      ctx.fillStyle = def.body;
      ctx.fill();
      stroke();
    }
  }
  if (big) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(c + s * 8, 24);
      ctx.quadraticCurveTo(c + s * 20, 12, c + s * 13, 6);
      ctx.lineTo(c + s * 5, 20);
      ctx.closePath();
      ctx.fillStyle = "#e8ddc8";
      ctx.fill();
      stroke();
    }
    ctx.fillStyle = "#efe8d4";
    ctx.fillRect(c - 6, 42, 4, 6);
    ctx.fillRect(c + 3, 42, 4, 6);
  }
  if (kind === "shaman" || kind === "snowhag") {
    ctx.beginPath();
    ctx.arc(c, 30, 17, Math.PI * 0.85, Math.PI * 2.15);
    ctx.closePath();
    ctx.fillStyle = def.trim;
    ctx.fill();
    stroke();
    ctx.fillStyle = "#7de8c9";
    ctx.beginPath();
    ctx.arc(c - 5, 34, 2.6, 0, Math.PI * 2);
    ctx.arc(c + 5, 34, 2.6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "archer") {
    ctx.beginPath();
    ctx.arc(c, 28, 16.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fillStyle = def.trim;
    ctx.fill();
    stroke();
  }
  ctx.fillStyle = kind === "warlord" ? "#ffd76b" : outline;
  ctx.beginPath();
  ctx.arc(c - 5, big ? 33 : 32, kind === "warlord" ? 3 : 2.4, 0, Math.PI * 2);
  ctx.arc(c + 5, big ? 33 : 32, kind === "warlord" ? 3 : 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function el(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

export class Menus {
  root: HTMLElement;
  toast: HTMLElement | null = null;
  travelFrom: number | null = null; // cleared stage to animate the road-march from
  private gearFocus: "weapon" | "body" | "helm" | "boots" | "trinket" = "body";
  private figureTimer: number | null = null; // idle animation for the hero-sheet figure
  private justDonned = false; // flash the figure preview on the next sheet render
  private selectedStage: number | null = null; // map node the scout report is showing
  pendingFinale = false; // set when the Way-Eater falls at the road's end
  private shopAttr: AttrKey | "all" = "all"; // spell-shop filter
  private shopHideOwned = false;
  private partySel = 0;
  private lastGold: number | null = null; // for the counting-up gold chip
  private settingsTab: "audio" | "battle" | "access" | "campaign" = "battle";
  private settingsReturn: "title" | "map" | "party" | "shop" | "tavern" | "records" = "title";
  private handbookReturn: "title" | "map" | "settings" = "title";
  private bestiaryRegion = 0;
  private bestiaryKnownOnly = false;
  private bestiarySearch = "";

  /** Animate the header gold chip counting from its last shown value. */
  private tickGold(page: HTMLElement): void {
    const target = this.save.gold;
    const from = this.lastGold;
    this.lastGold = target;
    if (from === null || from === target) return;
    const num = page.querySelector(".gold-num");
    if (!num) return;
    const t0 = performance.now();
    const dur = 550;
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - f, 3);
      num.textContent = String(Math.round(from + (target - from) * eased));
      if (f < 1 && document.body.contains(num)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  constructor(
    rootId: string,
    public save: SaveData,
    public callbacks: MenuCallbacks,
  ) {
    this.root = document.getElementById(rootId)!;
  }

  hide(): void {
    this.root.innerHTML = "";
    this.root.classList.remove("visible");
    document.body.classList.remove("menu-open");
  }

  /** Wire the hardware/browser back button: each screen registers itself. */
  private navReady = false;
  private navigating = false;
  private currentRoute = "";
  private navDepth = 0;
  private replaceNextNavigation = false;
  private pendingAfterNavigation: (() => void) | null = null;
  private battleReturn: { p: string; a?: number; d: number } = { p: "map", d: 1 };
  private hotkeyCaptureCleanup: (() => void) | null = null;

  private renderRoute(st: { p?: string; a?: number }, fromHistory = true): void {
    if (st.p !== "hotkeys") {
      this.hotkeyCaptureCleanup?.();
      this.hotkeyCaptureCleanup = null;
    }
    const wasNavigating = this.navigating;
    if (fromHistory) this.navigating = true;
    try {
      switch (st.p) {
        case "map": this.renderMap(); break;
        case "party": this.renderParty(); break;
        case "shop": this.renderShop("armory"); break;
        case "tavern": this.renderShop("tavern"); break;
        case "settings": this.renderSettings(); break;
        case "handbook": this.renderTutorials(); break;
        case "reference": this.renderVillageGuide(); break;
        case "first-run": this.renderFirstRun(); break;
        case "hotkeys": this.renderHotkeys(); break;
        case "profiles": this.renderProfiles(); break;
        case "finale": this.renderFinale(); break;
        case "bestiary": this.renderBestiary(); break;
        case "chronicle": this.renderChronicle(); break;
        case "arena": this.renderArena(); break;
        case "contracts": this.renderContracts(); break;
        case "hero": this.renderHeroOverview(st.a ?? 0); break;
        case "equip": this.renderEquipment(st.a ?? 0); break;
        case "spells": this.renderSpells(st.a ?? 0); break;
        case "smithy": this.renderShop("smithy"); break;
        case "talents": this.renderTalents(st.a ?? 0); break;
        case "calling": this.renderCalling(st.a ?? 0); break;
        case "battle": break;
        default: this.renderTitle();
      }
    } finally {
      this.navigating = wasNavigating;
    }
  }

  private pushNav(name: string, arg?: number): void {
    if (!this.navReady) {
      this.navReady = true;
      window.addEventListener("popstate", (ev) => {
        const st = (ev.state ?? {}) as { p?: string; a?: number; d?: number };
        const targetDepth = Math.max(1, st.d ?? this.navDepth - 1);
        if (this.callbacks.battleActive() && st.p !== "battle") {
          this.callbacks.pauseBattle();
          this.navDepth = targetDepth + 1;
          this.currentRoute = "battle:";
          history.pushState({ p: "battle", d: this.navDepth }, "", "");
          return;
        }
        // A finished or abandoned encounter can leave a forward/back entry for
        // its canvas route. There is no battle to render at that point, so skip
        // the stale entry instead of leaving the current menu looking stuck.
        if (!this.callbacks.battleActive() && st.p === "battle") {
          this.navDepth = targetDepth;
          if (targetDepth > 1) history.back();
          else {
            const fallback = { ...this.battleReturn, d: 1 };
            this.currentRoute = `${fallback.p}:${fallback.a ?? ""}`;
            history.replaceState(fallback, "", "");
            this.renderRoute(fallback);
            const after = this.pendingAfterNavigation;
            this.pendingAfterNavigation = null;
            after?.();
          }
          return;
        }
        this.navDepth = targetDepth;
        this.currentRoute = `${st.p ?? "title"}:${st.a ?? ""}`;
        this.renderRoute(st);
        const after = this.pendingAfterNavigation;
        this.pendingAfterNavigation = null;
        after?.();
      });
    }
    const route = `${name}:${arg ?? ""}`;
    if (this.navigating) return;
    if (this.navDepth === 0 || this.replaceNextNavigation) {
      this.navDepth = Math.max(1, this.navDepth);
      this.currentRoute = route;
      history.replaceState({ p: name, a: arg, d: this.navDepth }, "", "");
      this.replaceNextNavigation = false;
    } else if (route !== this.currentRoute) {
      this.currentRoute = route;
      this.navDepth += 1;
      history.pushState({ p: name, a: arg, d: this.navDepth }, "", "");
    }
  }

  private goBack(fallback: () => void): void {
    if (this.navDepth > 1) {
      const routeBeforeBack = this.currentRoute;
      const depthBeforeBack = this.navDepth;
      let settled = false;
      const recoverDuplicateRoute = () => {
        if (settled) return;
        settled = true;
        if (this.currentRoute !== routeBeforeBack) return;
        this.navDepth = Math.max(1, Math.min(this.navDepth, depthBeforeBack - 1));
        this.replaceNextNavigation = true;
        fallback();
      };
      // Run immediately after popstate as well as from the timeout below. That
      // catches a real history move whose preceding entry is a duplicate route.
      this.pendingAfterNavigation = recoverDuplicateRoute;
      history.back();
      // Embedded browsers can occasionally coalesce two closely spaced
      // programmatic Back operations (notably after leaving a replayed lesson).
      // If the route never changes, use the screen's explicit fallback so the
      // Back control cannot become a dead end.
      window.setTimeout(() => {
        if (this.pendingAfterNavigation === recoverDuplicateRoute) this.pendingAfterNavigation = null;
        recoverDuplicateRoute();
      }, 180);
    } else {
      this.replaceNextNavigation = true;
      fallback();
    }
  }

  /** Give an active canvas battle its own guarded history entry. Hardware Back
   *  pauses instead of revealing a live fight underneath a menu. */
  beginBattleHistory(returnTo?: "map" | "handbook"): void {
    if (this.currentRoute === "battle:") return;
    if (returnTo) {
      this.navDepth = Math.max(1, this.navDepth);
      this.currentRoute = `${returnTo}:`;
      history.replaceState({ p: returnTo, d: this.navDepth }, "", "");
    }
    const current = (history.state ?? {}) as { p?: string; a?: number; d?: number };
    this.battleReturn = { p: current.p ?? returnTo ?? "map", a: current.a, d: Math.max(1, current.d ?? this.navDepth) };
    this.pushNav("battle");
  }

  /** Restore the exact menu that launched a battle or lesson, then run any
   *  completion feedback after that menu is visible. */
  returnFromBattle(after?: () => void): void {
    if (this.currentRoute === "battle:" && this.navDepth > 1) {
      this.pendingAfterNavigation = after ?? null;
      history.back();
      // Some embedded browsers coalesce a programmatic Back immediately after
      // a guarded hardware-Back gesture. Never leave a cleared canvas exposed:
      // restore the known launch screen if no popstate arrives promptly.
      window.setTimeout(() => {
        if (this.currentRoute !== "battle:") return;
        const fallback = this.battleReturn;
        this.navDepth = fallback.d;
        this.currentRoute = `${fallback.p}:${fallback.a ?? ""}`;
        history.replaceState(fallback, "", "");
        this.renderRoute(fallback);
        const pending = this.pendingAfterNavigation;
        this.pendingAfterNavigation = null;
        pending?.();
      }, 120);
      return;
    }
    this.replaceNextNavigation = true;
    this.renderRoute(this.battleReturn, false);
    after?.();
  }

  private show(): void {
    this.root.classList.add("visible");
    document.body.classList.add("menu-open");
    this.root.scrollTop = 0;
  }

  showToast(text: string): void {
    this.toast?.remove();
    const toast = el(`<div class="toast" role="status" aria-live="polite" aria-atomic="true">${text}</div>`);
    this.root.appendChild(toast);
    this.toast = toast;
    setTimeout(() => toast.classList.add("fade"), 2600);
    setTimeout(() => toast.remove(), 3300);
  }

  private showImportPanel(): void {
    const pop = el(`
      <div class="levelup-pop save-code-pop">
        <div class="levelup-card save-code-card" role="dialog" aria-modal="true" aria-labelledby="save-import-title">
          <span class="save-code-kicker">Campaign transfer</span>
          <div class="levelup-title" id="save-import-title">BRING IN A BAND</div>
          <div class="levelup-line">Paste a Wayband save code below. Nothing changes until you confirm.</div>
          <label class="save-code-label" for="save-code-input">Save code</label>
          <textarea class="save-code-input" id="save-code-input" spellcheck="false" autocomplete="off" placeholder="Paste the long save code here"></textarea>
          <div class="save-code-status" aria-live="polite">Your current band will be replaced on this save slot.</div>
          <div class="levelup-actions">
            <button class="big-btn primary" data-save-code="import">Import band</button>
            <button class="big-btn" data-save-code="cancel">Cancel</button>
          </div>
        </div>
      </div>
    `);
    const input = pop.querySelector(".save-code-input") as HTMLTextAreaElement;
    const status = pop.querySelector(".save-code-status")!;
    pop.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest("[data-save-code]")?.getAttribute("data-save-code");
      if (action === "cancel" || event.target === pop) {
        audio.play("click");
        pop.remove();
        return;
      }
      if (action !== "import") return;
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(input.value.trim()))));
        if (!data || data.version !== 1 || !Array.isArray(data.heroes)) throw new Error("bad");
        localStorage.setItem(slotKey(), JSON.stringify(data));
        audio.play("page");
        location.reload();
      } catch {
        input.classList.add("invalid");
        status.textContent = "That code is not a valid Wayband save. Check that the whole code was pasted.";
        status.classList.add("error");
        input.focus();
      }
    });
    input.addEventListener("input", () => {
      input.classList.remove("invalid");
      status.classList.remove("error");
      status.textContent = "Your current band will be replaced on this save slot.";
    });
    this.root.appendChild(pop);
    setTimeout(() => input.focus(), 0);
  }

  private showCopyPanel(title: string, note: string, value: string): void {
    const pop = el(`
      <div class="levelup-pop save-code-pop">
        <div class="levelup-card save-code-card" role="dialog" aria-modal="true" aria-labelledby="save-copy-title">
          <span class="save-code-kicker">Campaign transfer</span>
          <div class="levelup-title" id="save-copy-title">${title}</div>
          <div class="levelup-line">${note}</div>
          <label class="save-code-label" for="save-code-output">Code</label>
          <textarea class="save-code-input" id="save-code-output" readonly spellcheck="false"></textarea>
          <div class="save-code-status">Select the code, then copy it with your device's copy command.</div>
          <div class="levelup-actions">
            <button class="big-btn primary" data-copy-code="select">Select code</button>
            <button class="big-btn" data-copy-code="close">Done</button>
          </div>
        </div>
      </div>
    `);
    const output = pop.querySelector(".save-code-input") as HTMLTextAreaElement;
    output.value = value;
    pop.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest("[data-copy-code]")?.getAttribute("data-copy-code");
      if (action === "select") {
        output.focus();
        output.select();
        return;
      }
      if (action === "close" || event.target === pop) {
        audio.play("click");
        pop.remove();
      }
    });
    this.root.appendChild(pop);
    setTimeout(() => {
      output.focus();
      output.select();
    }, 0);
  }

  /** Battleheart-style bottom tab bar: five doors, every screen one tap apart. */
  private sectionBar(current: "battle" | "party" | "shop" | "tavern" | "records"): HTMLElement {
    const save = this.save;
    const unspent = save.heroes.reduce((sum, h, i) => sum + (h.recruited ? save.unspent[i] : 0), 0);
    const shopDeal =
      save.heroes.some((h) => h.recruited && h.weaponTier + 1 < WEAPON_TIERS.length && WEAPON_TIERS[h.weaponTier + 1].cost <= save.gold) ||
      ALL_GEAR.some((a) => a.cost > 0 && !save.armory.includes(a.id) && a.cost <= save.gold) ||
      ABILITIES.some((a) => !a.retired && !a.pathSkill && !save.unlockedSpells.includes(a.id) && (SPELL_COSTS[a.id] ?? 100) <= save.gold);
    const recruitReady = save.heroes.some((h, i) => !h.recruited && heroArrived(save, i) && (RECRUIT_COST[i] ?? Infinity) <= save.gold);
    const btn = (id: string, icon: string, label: string, extra = "") =>
      `<button class="nav-btn ${current === id ? "on" : ""}" data-nav="${id}" ${current === id ? 'aria-current="page"' : ""}>${ico(icon)}<span>${label}</span>${extra}</button>`;
    const bar = el(`
      <nav class="nav-bar">
        ${btn("battle", "sword", "Battle")}
        ${btn("party", "shield", "Party", unspent > 0 ? `<span class="badge">${unspent}</span>` : "")}
        ${btn("shop", "bag", "Shop", shopDeal ? '<span class="shop-dot"></span>' : "")}
        ${btn("tavern", "home", "Tavern", recruitReady ? '<span class="shop-dot"></span>' : "")}
        ${btn("records", "book", "Records")}
        <button class="nav-settings" data-nav="settings" aria-label="Settings">⚙</button>
        <span class="nav-gold">${ico("coin")} ${save.gold}</span>
      </nav>
    `);
    bar.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest("[data-nav]");
      if (!target) return;
      const to = target.getAttribute("data-nav");
      if (to === current) return;
      audio.play("page");
      if (to === "settings") {
        this.settingsReturn = current === "battle" ? "map" : current;
        this.renderSettings();
      }
      else if (to === "battle") this.renderMap();
      else if (to === "party") this.renderParty();
      else if (to === "shop") this.renderShop("armory");
      else if (to === "tavern") this.renderShop("tavern");
      else this.renderChronicle();
    });
    return bar;
  }

  /** Append the page with the tab bar riding along. */
  private mount(page: HTMLElement, section: "battle" | "party" | "shop" | "tavern" | "records" | null): void {
    if (section) page.appendChild(this.sectionBar(section));
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ title

  renderTitle(): void {
    this.pushNav("title");
    this.root.innerHTML = "";
    this.show();
    const campaignComplete = (this.save.stageStats[STAGES.length - 1]?.clears ?? 0) > 0;
    const page = el(`
      <div class="page title-page elemental-title">
        <div class="title-block">
          <div class="title-kicker">REAL-TIME ELEMENTAL PARTY TACTICS</div>
          <div class="game-logo">WAYBAND</div>
          <div class="game-sub">Choose a Discipline. Bind the element that answers. Master its legacy down the Long Road.</div>
          <div class="title-waymarks" aria-label="Eight elemental Attunements: ${ELEMENTS.map((element) => element.name).join(", ")}">
            ${ELEMENTS.map((element) => `<span class="title-waymark" style="--element:${element.color}" title="${element.name}">${ico(element.icon)}<em>${element.name}</em></span>`).join("")}
          </div>
          <div class="title-path-equation" aria-label="Five Disciplines multiplied by eight Attunements create forty Paths">
            <b>5 Disciplines</b><i>×</i><b>8 Attunements</b><i>→</i><strong>40 Paths</strong>
          </div>
        </div>
        <div class="campfire-scene" aria-hidden="true">
          <svg viewBox="0 0 360 120">
            <ellipse cx="180" cy="112" rx="150" ry="10" fill="rgba(240,180,90,0.12)"/>
            <ellipse cx="180" cy="110" rx="90" ry="7" fill="rgba(240,180,90,0.16)"/>
            <!-- the band, silhouetted: everyone you've actually recruited -->
            ${(() => {
              const seats = [
                [96, 84, 9], [140, 78, 10], [224, 80, 10], [266, 86, 9], [62, 88, 8.5], [304, 84, 8.5],
              ];
              return this.save.heroes
                .map((h, i) => ({ h, i }))
                .filter(({ h }) => h.recruited)
                .map(({ i }, at) => {
                  const [sx, sy, sr] = seats[at % seats.length];
                  const tint = HEROES[i].accent;
                  return `<g fill="#141a10"><circle cx="${sx}" cy="${sy}" r="${sr}"/><rect x="${sx - sr + 1}" y="${sy + 6}" width="${sr * 2 - 2}" height="${sr * 2.4}" rx="6"/><rect x="${sx - sr + 1}" y="${sy + 8}" width="${sr * 2 - 2}" height="4" rx="2" fill="${tint}" opacity="0.5"/></g>`;
                })
                .join("");
            })()}
            <g fill="#141a10"><rect x="272" y="58" width="3" height="36" rx="1.5"/></g>
            <circle cx="273.5" cy="55" r="5" fill="#f2d16b" opacity="0.9" class="cf-orb"/>
            <!-- logs -->
            <rect x="164" y="102" width="34" height="6" rx="3" fill="#241a10" transform="rotate(14 181 105)"/>
            <rect x="164" y="102" width="34" height="6" rx="3" fill="#2c2013" transform="rotate(-14 181 105)"/>
            <!-- flames -->
            <g class="cf-flame">
              <path d="M 181 104 C 172 92 176 82 181 72 C 186 82 190 92 181 104 Z" fill="#e8863c"/>
              <path d="M 181 102 C 176 94 178 86 181 80 C 184 86 186 94 181 102 Z" fill="#f2c16b"/>
            </g>
            <circle class="cf-ember e1" cx="178" cy="70" r="2" fill="#f2b16b"/>
            <circle class="cf-ember e2" cx="185" cy="74" r="1.6" fill="#e8863c"/>
            <circle class="cf-ember e3" cx="181" cy="66" r="1.4" fill="#f2d16b"/>
          </svg>
        </div>
        <div class="title-company" aria-label="Current Wayband">
          ${this.save.heroes.map((hero, index) => ({ hero, index })).filter(({ hero }) => hero.recruited).map(({ index }) => `<span style="--company:${HEROES[index].accent}"><i></i>${HEROES[index].name}</span>`).join("")}
        </div>
        <div class="title-road-status">
          <span>${campaignComplete ? "The Way-Eater has fallen. All sixty waymarks burn." : this.save.unlockedStage > 0 ? `The road remembers ${this.save.lifetime.victories} victor${this.save.lifetime.victories === 1 ? "y" : "ies"}.` : "Millbrook's west bell has stopped ringing."}</span>
          <strong>${campaignComplete ? "The Last Meridian stands open." : this.save.unlockedStage > 0 ? `${STAGES[Math.min(this.save.unlockedStage, STAGES.length - 1)].name} waits.` : "Someone has to take the south road."}</strong>
        </div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="start">${this.save.seenIntro ? "Continue the Journey" : "Begin Your Journey"}</button>
          <div class="title-utility-row">
            <button class="big-btn" data-act="bands"><span aria-hidden="true">◆</span> Bands</button>
            <button class="big-btn" data-act="tutorial"><span aria-hidden="true">⌁</span> Field Handbook</button>
            <button class="big-btn" data-act="settings"><span aria-hidden="true">⚙</span> Settings</button>
          </div>
        </div>
        <div class="credit">drag your heroes · wield the elements · shape your band</div>
        <div class="version-tag">WAYBAND · Long Road build</div>
      </div>
    `);
    const syncToggles = () => {
      const setSwitch = (act: string, label: string, on: boolean) => {
        const button = page.querySelector(`[data-act="${act}"]`) as HTMLElement;
        if (!button) return;
        button.classList.toggle("on", on);
        button.innerHTML = `<span>${label}</span><b>${on ? "On" : "Off"}</b>`;
        button.setAttribute("aria-pressed", String(on));
      };
      setSwitch("sound", "Effects", this.save.sound);
      setSwitch("music", "Music", this.save.music);
      const speed = page.querySelector('[data-act="speed"]') as HTMLElement;
      if (speed) speed.innerHTML = `<span>Combat pace</span><b>${speedLabel(this.save.speed)}</b>`;
      setSwitch("numbers", "Combat numbers", this.save.damageNumbers);
      setSwitch("shake", "Screen shake", this.save.screenShake);
      setSwitch("pauseblur", "Pause when away", this.save.pauseOnBlur);
      setSwitch("motion", "Calm motion", this.save.reducedMotion);
      setSwitch("colorsafe", "Blue health bars", this.save.colorSafe);
      setSwitch("bigtext", "Larger type", this.save.bigText);
    };
    syncToggles();
    // volume sliders live-update the mixer, persisting on release
    for (const kind of ["sound", "music"] as const) {
      const slider = page.querySelector(`[data-vol="${kind}"]`) as HTMLInputElement;
      if (!slider) continue;
      slider.value = String(Math.round((kind === "sound" ? this.save.soundVol : this.save.musicVol) * 100));
      const output = page.querySelector(`[data-vol-out="${kind}"]`) as HTMLOutputElement;
      output.value = `${slider.value}%`;
      slider.addEventListener("input", () => {
        const v = Number(slider.value) / 100;
        output.value = `${slider.value}%`;
        if (kind === "sound") {
          this.save.soundVol = v;
          audio.setSoundVolume(v);
        } else {
          this.save.musicVol = v;
          audio.setMusicVolume(v);
        }
      });
      slider.addEventListener("change", () => {
        persist(this.save);
        if (kind === "sound") audio.play("click"); // a little proof of loudness
      });
    }
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      audio.unlock();
      audio.play("click");
      if (act === "start") {
        if (!this.save.seenIntro) {
          this.renderFirstRun();
        } else {
          this.renderMap();
        }
      }
      if (act === "tutorial") { this.handbookReturn = "title"; this.renderTutorials(); }
      if (act === "settings") { this.settingsReturn = "title"; this.renderSettings(); }
      if (act === "bands") this.renderProfiles();
      if (act === "hotkeys") this.renderHotkeys();
      if (act === "sound") {
        this.save.sound = !this.save.sound;
        audio.setSound(this.save.sound);
        persist(this.save);
        syncToggles();
      }
      if (act === "music") {
        this.save.music = !this.save.music;
        audio.setMusic(this.save.music);
        persist(this.save);
        syncToggles();
      }
      if (act === "speed") {
        this.save.speed = nextSpeed(this.save.speed);
        persist(this.save);
        syncToggles();
      }
      if (act === "numbers") {
        this.save.damageNumbers = !this.save.damageNumbers;
        persist(this.save);
        syncToggles();
      }
      if (act === "shake") {
        this.save.screenShake = !this.save.screenShake;
        persist(this.save);
        syncToggles();
      }
      if (act === "pauseblur") {
        this.save.pauseOnBlur = !this.save.pauseOnBlur;
        persist(this.save);
        syncToggles();
      }
      if (act === "motion") {
        this.save.reducedMotion = !this.save.reducedMotion;
        document.body.classList.toggle("reduced-motion", this.save.reducedMotion);
        persist(this.save);
        syncToggles();
      }
      if (act === "colorsafe") {
        this.save.colorSafe = !this.save.colorSafe;
        setColorSafe(this.save.colorSafe);
        persist(this.save);
        syncToggles();
      }
      if (act === "bigtext") {
        this.save.bigText = !this.save.bigText;
        document.body.classList.toggle("big-text", this.save.bigText);
        persist(this.save);
        syncToggles();
      }
      if (act === "install") {
        const holder = window as unknown as { __installPrompt?: { prompt: () => void } | null };
        holder.__installPrompt?.prompt();
        holder.__installPrompt = null;
        audio.play("click");
        this.renderTitle();
      }
      if (act === "export-save") {
        const code = btoa(unescape(encodeURIComponent(JSON.stringify(this.save))));
        const finish = () => this.showToast("Save code copied — paste it anywhere safe");
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(code).then(finish, () => this.showCopyPanel("YOUR BAND'S SAVE CODE", "Keep this code somewhere safe, or move the band to another device.", code));
        } else {
          this.showCopyPanel("YOUR BAND'S SAVE CODE", "Keep this code somewhere safe, or move the band to another device.", code);
        }
      }
      if (act === "import-save") {
        this.showImportPanel();
      }
      if (act === "export-data") {
        const json = exportTelemetry();
        const finish = () => this.showToast(`Playtest data copied (${telemetrySummary()})`);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(json).then(finish, () => this.showCopyPanel("PLAYTEST REPORT", "This report contains battle results and recovery diagnostics, not your save.", json));
        } else {
          this.showCopyPanel("PLAYTEST REPORT", "This report contains battle results and recovery diagnostics, not your save.", json);
        }
      }
      if (act === "reset") {
        const pop = el(`
          <div class="levelup-pop">
            <div class="levelup-card reset-card">
              <div class="levelup-title" style="color:#ff8a70">ERASE EVERYTHING?</div>
              <div class="levelup-line">The whole road — levels, gold, heroes, deeds — gone for good.</div>
              <div class="levelup-actions">
                <button class="big-btn danger-btn" data-reset="yes">Erase it all</button>
                <button class="big-btn primary" data-reset="no">Keep playing</button>
              </div>
            </div>
          </div>
        `);
        pop.addEventListener("click", (ev) => {
          const choice = (ev.target as HTMLElement).closest("[data-reset]")?.getAttribute("data-reset");
          if (choice === "yes") {
            audio.play("click");
            pop.remove();
            this.callbacks.resetProgress();
          } else if (choice === "no" || ev.target === pop) {
            audio.play("click");
            pop.remove();
          }
        });
        this.root.appendChild(pop);
      }
    });
    this.root.appendChild(page);
  }

  /** A dedicated field ledger keeps preferences discoverable and gives each
   *  choice enough room to explain what it changes. */
  renderSettings(): void {
    this.pushNav("settings");
    this.root.innerHTML = "";
    this.show();
    const tabLabel = { audio: "Sound", battle: "Battle", access: "Readability", campaign: "Campaign" } as const;
    const tabMark = { audio: "♪", battle: "⚔", access: "◉", campaign: "⌁" } as const;
    const page = el(`
      <div class="page settings-page">
        <header class="ledger-mast">
          <button class="back-rune" data-act="back" aria-label="Back">‹</button>
          <div><span>WAYFINDER'S KIT</span><h1>Set the road to your hand.</h1><p>Every change saves immediately. Battle aids never reduce rewards.</p></div>
          <div class="ledger-saved">saved locally</div>
        </header>
        <nav class="settings-chapters" role="tablist" aria-label="Settings chapters">
          ${(["audio", "battle", "access", "campaign"] as const).map((id) => `<button id="settings-tab-${id}" role="tab" aria-controls="settings-panel-${id}" aria-selected="${this.settingsTab === id}" tabindex="${this.settingsTab === id ? 0 : -1}" class="${this.settingsTab === id ? "on" : ""}" data-settings-tab="${id}"><i>${tabMark[id]}</i><span>${tabLabel[id]}</span></button>`).join("")}
        </nav>
        <div class="settings-ledger">
          <section id="settings-panel-audio" role="tabpanel" aria-labelledby="settings-tab-audio" class="settings-panel ${this.settingsTab === "audio" ? "on" : ""}" data-settings-panel="audio" ${this.settingsTab === "audio" ? "" : "hidden"}>
            <div class="panel-heading"><span>I</span><div><strong>Sound on the road</strong><em>Keep music and effects separate.</em></div></div>
            <div class="setting-pair"><button class="setting-switch" data-act="sound"></button><button class="setting-switch" data-act="music"></button></div>
            <label class="ledger-slider"><span><strong>Effects volume</strong><em>Weapons, techniques, warnings</em></span><input aria-label="Effects volume" type="range" min="0" max="100" data-vol="sound"><output data-vol-out="sound"></output></label>
            <label class="ledger-slider"><span><strong>Music volume</strong><em>Regions and boss themes</em></span><input aria-label="Music volume" type="range" min="0" max="100" data-vol="music"><output data-vol-out="music"></output></label>
          </section>

          <section id="settings-panel-battle" role="tabpanel" aria-labelledby="settings-tab-battle" class="settings-panel ${this.settingsTab === "battle" ? "on" : ""}" data-settings-panel="battle" ${this.settingsTab === "battle" ? "" : "hidden"}>
            <div class="panel-heading"><span>II</span><div><strong>Command &amp; timing</strong><em>Tune pace without touching difficulty or rewards.</em></div></div>
            <div class="setting-pair"><button class="setting-switch" data-act="speed"></button><button class="setting-switch" data-act="autobattle"></button></div>
            <div class="setting-line"><span><strong>Aiming time</strong><em>What battle does while you hold an aimed technique.</em></span><div class="setting-segments" data-segments="aim"><button data-aim="freeze">Pause</button><button data-aim="slow">Slow</button><button data-aim="realtime">Live</button></div></div>
            <div class="setting-line"><span><strong>Warning time</strong><em>Longer enemy telegraphs, independent of difficulty.</em></span><div class="setting-segments" data-segments="warning"><button data-warning="standard">Standard</button><button data-warning="long">Long</button><button data-warning="extra">Extra</button></div></div>
            <div class="setting-pair"><button class="setting-switch" data-act="numbers"></button><button class="setting-switch" data-act="enemybars"></button></div>
            <div class="setting-pair"><button class="setting-switch" data-act="shake"></button><button class="setting-switch" data-act="pauseblur"></button></div>
            <button class="setting-link ledger-link" data-act="hotkeys"><span>Key bindings</span><em>Heroes, techniques, and ultimate</em><b>›</b></button>
          </section>

          <section id="settings-panel-access" role="tabpanel" aria-labelledby="settings-tab-access" class="settings-panel ${this.settingsTab === "access" ? "on" : ""}" data-settings-panel="access" ${this.settingsTab === "access" ? "" : "hidden"}>
            <div class="panel-heading"><span>III</span><div><strong>Read the field</strong><em>Steady motion, larger words, clearer danger.</em></div></div>
            <div class="setting-pair"><button class="setting-switch" data-act="motion"></button><button class="setting-switch" data-act="colorsafe"></button></div>
            <div class="setting-pair"><button class="setting-switch" data-act="bigtext"></button><button class="setting-switch" data-act="coach"></button></div>
            <div class="field-note"><b>Color-independent cues</b><span>Adds blue ally health and a bright double boundary to danger marks, so color is never the only warning.</span></div>
            <button class="setting-link ledger-link" data-act="fullscreen"><span>Full screen</span><em>Use the whole display when your browser allows it</em><b>›</b></button>
            <button class="setting-link ledger-link" data-act="handbook"><span>Open the Field Handbook</span><em>Controls, systems, and replayable practice</em><b>›</b></button>
            <button class="setting-link quiet" data-act="reset-prefs"><span>Restore preference defaults</span><em>Your campaign is untouched</em><b>↺</b></button>
          </section>

          <section id="settings-panel-campaign" role="tabpanel" aria-labelledby="settings-tab-campaign" class="settings-panel ${this.settingsTab === "campaign" ? "on" : ""}" data-settings-panel="campaign" ${this.settingsTab === "campaign" ? "" : "hidden"}>
            <div class="panel-heading"><span>IV</span><div><strong>Campaign &amp; device</strong><em>Move, protect, or retire this band.</em></div></div>
            <button class="setting-link ledger-link" data-act="bands"><span>Band saves</span><em>Six separate campaigns</em><b>›</b></button>
            <div class="setting-pair compact-actions"><button class="toggle-btn" data-act="export-save">Copy save</button><button class="toggle-btn" data-act="import-save">Import save</button></div>
            <button class="setting-link quiet" data-act="export-data"><span>Copy playtest report</span><em>Battle results only — no save data</em><b>›</b></button>
            ${(window as unknown as { __installPrompt?: unknown }).__installPrompt ? `<button class="setting-link quiet" data-act="install"><span>Install Wayband</span><em>Play from your home screen</em><b>›</b></button>` : ""}
            <div class="danger-rule"></div>
            <button class="setting-link danger" data-act="reset"><span>Erase this band</span><em>Levels, heroes, gear, and records</em><b>›</b></button>
          </section>
        </div>
      </div>
    `);

    const setSwitch = (act: string, label: string, on: boolean) => {
      const button = page.querySelector(`[data-act="${act}"]`) as HTMLButtonElement | null;
      if (!button) return;
      button.classList.toggle("on", on);
      button.innerHTML = `<span>${label}</span><b>${on ? "On" : "Off"}</b>`;
      button.setAttribute("aria-pressed", String(on));
    };
    const sync = () => {
      setSwitch("sound", "Effects", this.save.sound);
      setSwitch("music", "Music", this.save.music);
      setSwitch("numbers", "Combat numbers", this.save.damageNumbers);
      setSwitch("enemybars", "Enemy health bars", this.save.enemyHealthBars);
      setSwitch("shake", "Impact motion", this.save.screenShake);
      setSwitch("pauseblur", "Pause when away", this.save.pauseOnBlur);
      setSwitch("motion", "Calm motion", this.save.reducedMotion);
      setSwitch("colorsafe", "Color-independent cues", this.save.colorSafe);
      setSwitch("bigtext", "Larger type", this.save.bigText);
      setSwitch("coach", "Opening battle hints", this.save.tutorialHints);
      setSwitch("autobattle", "Begin in Auto", this.save.autoBattle);
      const shake = page.querySelector('[data-act="shake"]') as HTMLButtonElement;
      shake.disabled = this.save.reducedMotion;
      shake.setAttribute("aria-disabled", String(this.save.reducedMotion));
      if (this.save.reducedMotion) {
        shake.innerHTML = `<span>Impact motion</span><b>Calm</b>`;
        shake.title = "Calm motion currently suppresses impact shake";
      } else {
        shake.removeAttribute("title");
      }
      const speed = page.querySelector('[data-act="speed"]') as HTMLButtonElement;
      speed.innerHTML = `<span>Combat pace</span><b>${speedLabel(this.save.speed)}</b>`;
      page.querySelectorAll("[data-aim]").forEach((button) => {
        const selected = button.getAttribute("data-aim") === this.save.aimMode;
        button.classList.toggle("on", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      page.querySelectorAll("[data-warning]").forEach((button) => {
        const selected = button.getAttribute("data-warning") === this.save.telegraphAssist;
        button.classList.toggle("on", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    };
    sync();

    for (const kind of ["sound", "music"] as const) {
      const slider = page.querySelector(`[data-vol="${kind}"]`) as HTMLInputElement;
      const output = page.querySelector(`[data-vol-out="${kind}"]`) as HTMLOutputElement;
      slider.value = String(Math.round((kind === "sound" ? this.save.soundVol : this.save.musicVol) * 100));
      output.value = `${slider.value}%`;
      slider.addEventListener("input", () => {
        const value = Number(slider.value) / 100;
        output.value = `${slider.value}%`;
        if (kind === "sound") { this.save.soundVol = value; audio.setSoundVolume(value); }
        else { this.save.musicVol = value; audio.setMusicVolume(value); }
      });
      slider.addEventListener("change", () => { persist(this.save); if (kind === "sound") audio.play("click"); });
    }

    const resetPreferences = () => {
      const fresh = defaultSave();
      this.save.sound = fresh.sound;
      this.save.music = fresh.music;
      this.save.soundVol = fresh.soundVol;
      this.save.musicVol = fresh.musicVol;
      this.save.speed = fresh.speed;
      this.save.aimMode = fresh.aimMode;
      this.save.telegraphAssist = fresh.telegraphAssist;
      this.save.reducedMotion = fresh.reducedMotion;
      this.save.screenShake = fresh.screenShake;
      this.save.damageNumbers = fresh.damageNumbers;
      this.save.pauseOnBlur = fresh.pauseOnBlur;
      this.save.colorSafe = fresh.colorSafe;
      this.save.bigText = fresh.bigText;
      this.save.enemyHealthBars = fresh.enemyHealthBars;
      this.save.autoBattle = fresh.autoBattle;
      this.save.tutorialHints = fresh.tutorialHints;
      audio.setSound(this.save.sound);
      audio.setMusic(this.save.music);
      audio.setSoundVolume(this.save.soundVol);
      audio.setMusicVolume(this.save.musicVol);
      document.body.classList.toggle("reduced-motion", this.save.reducedMotion);
      document.body.classList.toggle("big-text", this.save.bigText);
      setColorSafe(this.save.colorSafe);
      persist(this.save);
      this.renderSettings();
      this.showToast("Preferences restored — your band is unchanged");
    };

    const confirmErase = () => {
      const pop = el(`
        <div class="levelup-pop"><div class="levelup-card reset-card" role="dialog" aria-modal="true" aria-labelledby="erase-title">
          <div class="levelup-title" id="erase-title" style="color:#ff8a70">ERASE THIS BAND?</div>
          <div class="levelup-line">The whole road — levels, gold, heroes, gear, and records — will be gone for good.</div>
          <div class="levelup-actions"><button class="big-btn danger-btn" data-reset="yes">Erase it all</button><button class="big-btn primary" data-reset="no">Keep playing</button></div>
        </div></div>`);
      pop.addEventListener("click", (event) => {
        const choice = (event.target as HTMLElement).closest("[data-reset]")?.getAttribute("data-reset");
        if (choice === "yes") { audio.play("click"); pop.remove(); this.callbacks.resetProgress(); }
        else if (choice === "no" || event.target === pop) { audio.play("click"); pop.remove(); }
      });
      this.root.appendChild(pop);
    };

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest("[data-settings-tab]")?.getAttribute("data-settings-tab") as typeof this.settingsTab | undefined;
      if (tab) {
        this.settingsTab = tab;
        page.querySelectorAll("[data-settings-tab]").forEach((button) => {
          const selected = button.getAttribute("data-settings-tab") === tab;
          button.classList.toggle("on", selected);
          button.setAttribute("aria-selected", String(selected));
          button.setAttribute("tabindex", selected ? "0" : "-1");
        });
        page.querySelectorAll<HTMLElement>("[data-settings-panel]").forEach((panel) => {
          const selected = panel.getAttribute("data-settings-panel") === tab;
          panel.classList.toggle("on", selected);
          panel.hidden = !selected;
        });
        audio.play("page");
        return;
      }
      const aim = target.closest("[data-aim]")?.getAttribute("data-aim") as SaveData["aimMode"] | undefined;
      if (aim) { this.save.aimMode = aim; persist(this.save); audio.play("click"); sync(); return; }
      const warning = target.closest("[data-warning]")?.getAttribute("data-warning") as SaveData["telegraphAssist"] | undefined;
      if (warning) { this.save.telegraphAssist = warning; persist(this.save); audio.play("click"); sync(); return; }
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      audio.unlock();
      audio.play("click");
      if (act === "back") {
        this.goBack(() => {
          if (this.settingsReturn === "map") this.renderMap();
          else if (this.settingsReturn === "party") this.renderParty();
          else if (this.settingsReturn === "shop") this.renderShop("armory");
          else if (this.settingsReturn === "tavern") this.renderShop("tavern");
          else if (this.settingsReturn === "records") this.renderChronicle();
          else this.renderTitle();
        });
      }
      else if (act === "sound") { this.save.sound = !this.save.sound; audio.setSound(this.save.sound); persist(this.save); sync(); }
      else if (act === "music") { this.save.music = !this.save.music; audio.setMusic(this.save.music); persist(this.save); sync(); }
      else if (act === "speed") { this.save.speed = nextSpeed(this.save.speed); persist(this.save); sync(); }
      else if (act === "autobattle") { this.save.autoBattle = !this.save.autoBattle; persist(this.save); sync(); }
      else if (act === "numbers") { this.save.damageNumbers = !this.save.damageNumbers; persist(this.save); sync(); }
      else if (act === "enemybars") { this.save.enemyHealthBars = !this.save.enemyHealthBars; persist(this.save); sync(); }
      else if (act === "shake") { this.save.screenShake = !this.save.screenShake; persist(this.save); sync(); }
      else if (act === "pauseblur") { this.save.pauseOnBlur = !this.save.pauseOnBlur; persist(this.save); sync(); }
      else if (act === "motion") { this.save.reducedMotion = !this.save.reducedMotion; document.body.classList.toggle("reduced-motion", this.save.reducedMotion); persist(this.save); sync(); }
      else if (act === "colorsafe") { this.save.colorSafe = !this.save.colorSafe; setColorSafe(this.save.colorSafe); persist(this.save); sync(); }
      else if (act === "bigtext") { this.save.bigText = !this.save.bigText; document.body.classList.toggle("big-text", this.save.bigText); persist(this.save); sync(); }
      else if (act === "coach") { this.save.tutorialHints = !this.save.tutorialHints; persist(this.save); sync(); }
      else if (act === "hotkeys") this.renderHotkeys();
      else if (act === "handbook") { this.handbookReturn = "settings"; this.renderTutorials(); }
      else if (act === "bands") this.renderProfiles();
      else if (act === "export-save") {
        const code = btoa(unescape(encodeURIComponent(JSON.stringify(this.save))));
        const finish = () => this.showToast("Save code copied — paste it anywhere safe");
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(finish, () => this.showCopyPanel("YOUR BAND'S SAVE CODE", "Keep this code somewhere safe, or move the band to another device.", code));
        else this.showCopyPanel("YOUR BAND'S SAVE CODE", "Keep this code somewhere safe, or move the band to another device.", code);
      } else if (act === "import-save") this.showImportPanel();
      else if (act === "export-data") {
        const json = exportTelemetry();
        const finish = () => this.showToast(`Playtest data copied (${telemetrySummary()})`);
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(finish, () => this.showCopyPanel("PLAYTEST REPORT", "This report contains battle results and recovery diagnostics, not your save.", json));
        else this.showCopyPanel("PLAYTEST REPORT", "This report contains battle results and recovery diagnostics, not your save.", json);
      } else if (act === "fullscreen") {
        const toggle = document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
        if (!toggle) this.showToast("Full screen is not available in this browser");
        else void toggle.catch(() => this.showToast("Full screen is not available in this browser"));
      } else if (act === "install") {
        const holder = window as unknown as { __installPrompt?: { prompt: () => void } | null };
        holder.__installPrompt?.prompt(); holder.__installPrompt = null; this.renderSettings();
      } else if (act === "reset-prefs") resetPreferences();
      else if (act === "reset") confirmErase();
    });
    const chapters = page.querySelector(".settings-chapters")!;
    chapters.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
      const tabs = [...chapters.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const current = tabs.indexOf(event.target as HTMLButtonElement);
      if (current < 0) return;
      event.preventDefault();
      const next = key === "Home"
        ? 0
        : key === "End"
          ? tabs.length - 1
          : (current + (key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ map

  renderMap(): void {
    this.pushNav("map");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const campaignComplete = (save.stageStats[STAGES.length - 1]?.clears ?? 0) > 0;
    const focusStage = Math.min(save.unlockedStage, this.selectedStage ?? save.unlockedStage, STAGES.length - 1);
    const lateJourneyRegion = LATE_ROAD_REGIONS.find((region) => focusStage >= region.start && focusStage <= region.bossStage);
    const journeyTheme = lateJourneyRegion
      ? `late-journey late-journey-${lateJourneyRegion.id}`
      : focusStage >= 12
        ? "coast-journey"
        : focusStage >= 6
          ? "winter-journey"
          : "woodland-journey";
    const journeyChapter = lateJourneyRegion
      ? `${lateJourneyRegion.name} · stages ${lateJourneyRegion.range}`
      : focusStage >= 12
        ? "Stormbreak Coast · stages XIII–XVIII"
        : focusStage >= 6
          ? "The Winterreach · stages VII–XII"
          : "The South Road · stages I–VI";
    const journeyStyle = lateJourneyRegion
      ? ` style="--journey-accent:${lateJourneyRegion.map.accent};--journey-glow:${lateJourneyRegion.map.glow};--journey-ink:${lateJourneyRegion.map.ink}"`
      : "";
    const seasoned = bandLevel(save);
    const pendingPoints = save.heroes.reduce((sum, hero, index) => sum + (hero.recruited ? save.unspent[index] : 0), 0);
    const recruitReady = save.heroes.some((hero, index) => !hero.recruited && heroArrived(save, index) && (RECRUIT_COST[index] ?? Infinity) <= save.gold);
    const suggestedJourneyNote = campaignComplete
      ? "Walk onward, revisit a Path, or answer a contract"
      : pendingPoints > 0
      ? `${pendingPoints} attribute point${pendingPoints === 1 ? "" : "s"} waiting in Party`
      : recruitReady
        ? "A new companion can be hired in the Tavern"
        : `Scout ${STAGES[Math.min(save.unlockedStage, STAGES.length - 1)].name} and set out`;
    const journeyNote = save.pinnedGoal ?? suggestedJourneyNote;
    const regionCount = Math.ceil(STAGES.length / 6);
    const currentRegion = Math.floor(focusStage / 6);
    const page = el(`
      <div class="page journey-page ${journeyTheme}"${journeyStyle}>
        <div class="map-header">
          <div>
            <div class="map-title">The Long Road</div>
            <div class="map-level">A band of ${save.heroes.filter((h) => h.recruited).length} · finest at level ${seasoned} · <span class="gold-chip">${ico("coin")} <span class="gold-num">${save.gold}</span></span></div>
          </div>
        </div>
        <aside class="journey-ribbon" aria-label="Journey progress">
          <div class="journey-chapter"><span>${journeyChapter}</span><b>Stage ${focusStage + 1} / ${STAGES.length}</b></div>
          <div class="journey-track" aria-hidden="true">
            ${Array.from({ length: regionCount }, (_, index) => `<i class="${index < currentRegion ? "done" : index === currentRegion ? "current" : ""}"></i>`).join("")}
          </div>
          <div class="journey-next"><span>Next move</span><strong>${journeyNote}</strong><button class="journey-pin" data-act="goal">${save.pinnedGoal ? "Change" : "Pin a goal"}</button></div>
        </aside>
        <div class="world-map"></div>
        <div class="stage-caption"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="difficulty" style="border-color:${DIFFICULTIES[save.difficulty].color};color:${DIFFICULTIES[save.difficulty].color}">${ico("skull")} ${DIFFICULTIES[save.difficulty].name}</button>
          <button class="toggle-btn" data-act="handbook">⌁ Handbook</button>
          <button class="toggle-btn" data-act="settings">⚙ Settings</button>
          <button class="toggle-btn" data-act="home">Title</button>
        </div>
      </div>
    `);
    const maxIdx = Math.min(save.unlockedStage, STAGES.length - 1);
    this.selectedStage = Math.min(this.selectedStage ?? maxIdx, maxIdx);
    page.querySelector(".world-map")!.appendChild(this.buildWorldMap());
    page.querySelector(".world-map")!.appendChild(el(`
      <div class="road-sites">
        <button class="road-site arena-site" data-act="arena">
          <span class="site-sigil">♜</span><span><em>Off the old king's road</em><strong>The Ruined Ring</strong><small>Face any great foe you have already defeated.</small></span><b>Enter ›</b>
        </button>
      </div>
    `));
    const caption = page.querySelector(".stage-caption")!;
    caption.appendChild(this.buildScoutCard(this.selectedStage));
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "embark") {
        audio.unlock();
        audio.play("click");
        this.showEmbarkBriefing(this.selectedStage ?? maxIdx);
      }
      if (act === "goal") this.showGoalPicker(suggestedJourneyNote);
      if (act === "arena") {
        audio.play("page");
        this.renderArena();
      }
      if (act === "party") {
        audio.play("click");
        this.renderParty();
      }
      if (act === "bestiary") {
        audio.play("click");
        this.renderBestiary();
      }
      if (act === "chronicle") {
        audio.play("click");
        this.renderChronicle();
      }
      if (act === "shop") {
        audio.play("click");
        this.renderShop("tavern");
      }
      if (act === "difficulty") {
        this.save.difficulty = (this.save.difficulty + 1) % DIFFICULTIES.length;
        persist(this.save);
        audio.play("click");
        const d = DIFFICULTIES[this.save.difficulty];
        this.showToast(`${d.name}: enemies ×${d.enemyMult}, rewards ×${d.rewardMult}`);
        this.renderMap();
      }
      if (act === "handbook") {
        audio.play("page");
        this.handbookReturn = "map";
        this.renderTutorials();
      }
      if (act === "settings") {
        audio.play("page");
        this.settingsReturn = "map";
        this.renderSettings();
      }
      if (act === "home") {
        audio.play("click");
        this.renderTitle();
      }
    });
    this.mount(page, "battle");
    this.tickGold(page);
  }

  renderArena(): void {
    this.pushNav("arena");
    this.root.innerHTML = "";
    this.show();
    const defeated = BOSS_STAGES.filter((stage) => (this.save.stageStats[stage]?.clears ?? 0) > 0);
    const page = el(`
      <div class="page challenge-page arena-page">
        <div class="challenge-mast arena-mast">
          <button class="back-rune" data-act="back" aria-label="Back to map">‹</button>
          <span><em>The Ruined Ring</em><strong>Old victories do not stay buried.</strong></span>
          <div class="challenge-count">${this.save.arenaMarks} arena marks</div>
        </div>
        <div class="arena-rule"><span>THE TERMS</span><p>Choose a defeated boss. Arena victories grant experience and gold; the first clear of each rematch pays an additional purse.</p></div>
        <div class="reward-road">${[5, 12, 20].map((mark) => `<span class="${this.save.arenaMarks >= mark ? "earned" : ""}"><b>${mark}</b><em>${mark === 5 ? "200 gold" : mark === 12 ? "rare curio" : "500 gold"}</em></span>`).join("")}</div>
        <div class="challenge-list"></div>
      </div>
    `);
    const list = page.querySelector(".challenge-list")!;
    if (!defeated.length) {
      list.appendChild(el(`<div class="challenge-empty"><strong>The gates remain barred.</strong><span>Defeat the Gloaming Alpha on the Long Road to draw the arena keeper's attention.</span></div>`));
    }
    for (const stageIndex of BOSS_STAGES) {
      const stage = STAGES[stageIndex];
      const unlocked = defeated.includes(stageIndex);
      const rec = this.save.arenaRecords[stageIndex];
      const purse = arenaPurse(stageIndex, !rec?.clears);
      const finalWave = stage.waves[stage.waves.length - 1];
      const bossKind = finalWave?.[finalWave.length - 1]?.kind;
      const card = el(`
        <article class="challenge-card boss-contract ${unlocked ? "" : "sealed"}">
          <div class="challenge-portrait">${unlocked && bossKind ? `<canvas width="72" height="72"></canvas>` : "?"}</div>
          <div class="challenge-copy"><em>${unlocked ? `Rematch · stage ${stageIndex + 1}` : "Unknown contender"}</em><strong>${unlocked ? stage.name : "A name not yet earned"}</strong><p>${unlocked ? stage.subtitle : "Defeat this foe on the Long Road first."}</p><small>${rec ? `Best ${rec.bestTime.toFixed(1)}s · ${rec.clears} clear${rec.clears === 1 ? "" : "s"}` : unlocked ? "First-clear purse available" : "Locked"}</small></div>
          <div class="challenge-pay"><span>${ico("coin")} ${purse}</span><button class="big-btn primary" data-arena="${stageIndex}" ${unlocked ? "" : "disabled"}>Fight</button></div>
        </article>
      `);
      if (unlocked && bossKind) drawBeastIcon(card.querySelector("canvas")!, bossKind);
      list.appendChild(card);
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-act="back"]')) return void this.goBack(() => this.renderMap());
      const fight = target.closest("[data-arena]");
      if (!fight) return;
      const stage = Number(fight.getAttribute("data-arena"));
      audio.play("warcry");
      this.callbacks.startChallenge("arena", stage, `boss-${stage}`);
    });
    this.mount(page, "battle");
  }

  renderContracts(): void {
    this.pushNav("contracts");
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page challenge-page contracts-page">
        <div class="challenge-mast contract-mast">
          <button class="back-rune" data-act="back" aria-label="Back to tavern">‹</button>
          <span><em>The Nail &amp; Notice</em><strong>Work that cannot wait for heroes.</strong></span>
          <div class="challenge-count">${this.save.contractRenown} renown</div>
        </div>
        <div class="arena-rule"><span>PAYMENT</span><p>Every fulfilled contract pays gold and experience. Its first completion also includes a useful piece of unowned gear.</p></div>
        <div class="reward-road contract-road">${[4, 8, 14].map((mark) => `<span class="${this.save.contractRenown >= mark ? "earned" : ""}"><b>${mark}</b><em>${mark === 4 ? "200 gold" : mark === 8 ? "veteran gear" : "500 gold"}</em></span>`).join("")}</div>
        <div class="contract-ledger"></div>
      </div>
    `);
    const ledger = page.querySelector(".contract-ledger")!;
    for (const contract of CONTRACTS) {
      const available = this.save.unlockedStage >= contract.unlockStage;
      const rec = this.save.contractRecords[contract.id];
      const firstPay = contractPurse(contract, true, true);
      const term = contract.condition === "flawless" ? "No hero may fall"
        : contract.condition === "threeHeroes" ? "Three active heroes maximum"
          : contract.condition === "swift" ? `Finish within ${contract.target} seconds`
            : "Hard or Brutal difficulty";
      ledger.appendChild(el(`
        <article class="contract-sheet ${available ? "" : "sealed"}">
          <div class="contract-pin"></div>
          <div class="contract-issuer">${available ? contract.issuer : "Notice obscured"}</div>
          <h3>${available ? contract.name : "Work farther up the road"}</h3>
          <p>${available ? contract.brief : `Reach stage ${contract.unlockStage + 1} to read this notice.`}</p>
          <div class="contract-term"><span>Condition</span><strong>${available ? term : "Locked"}</strong></div>
          <div class="contract-bottom"><span>${ico("coin")} ${rec ? contract.reward : firstPay}${!rec && available ? " + gear" : ""}</span><em>${rec ? `${rec.clears} clear${rec.clears === 1 ? "" : "s"} · best ${rec.bestTime.toFixed(1)}s` : "Unclaimed"}</em><button class="big-btn primary" data-contract="${contract.id}" ${available ? "" : "disabled"}>Take contract</button></div>
        </article>
      `));
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-act="back"]')) return void this.goBack(() => this.renderShop("tavern"));
      const button = target.closest("[data-contract]");
      if (!button) return;
      const contract = CONTRACTS.find((item) => item.id === button.getAttribute("data-contract"));
      if (!contract) return;
      const active = this.save.heroes.filter((hero) => hero.recruited && hero.active).length;
      if (contract.condition === "threeHeroes" && active > 3) {
        this.showToast("Bench one hero in Party before taking this contract.");
        return;
      }
      if (contract.condition === "hard" && this.save.difficulty < 2) {
        this.showToast("Set the road to Hard or Brutal before taking this contract.");
        return;
      }
      audio.play("page");
      this.callbacks.startChallenge("contract", contract.stage, contract.id);
    });
    this.mount(page, "tavern");
  }

  /** Make painted SVG waymarks behave like real controls for keyboard and
   * assistive-technology users, while sharing one selection path across acts. */
  private wireMapNodes(host: HTMLElement): void {
    host.querySelector("svg")?.setAttribute("role", "group");
    const nodes = [...host.querySelectorAll<SVGGElement>(".map-node.open")];
    for (const node of nodes) {
      const idx = Number(node.getAttribute("data-stage"));
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-pressed", String(idx === this.selectedStage));
      node.setAttribute("aria-label", `Stage ${idx + 1}: ${STAGES[idx].name}${idx === this.selectedStage ? ", selected" : ""}`);
    }
    const activate = (node: Element) => {
      const idx = Number(node.getAttribute("data-stage"));
      audio.unlock();
      audio.play("click");
      if (this.selectedStage === idx) {
        this.showEmbarkBriefing(idx);
        return;
      }
      this.selectedStage = idx;
      host.querySelectorAll(".map-node.sel").forEach((item) => item.classList.remove("sel"));
      for (const item of nodes) {
        const selected = item === node;
        item.setAttribute("aria-pressed", String(selected));
        const stageIdx = Number(item.getAttribute("data-stage"));
        item.setAttribute("aria-label", `Stage ${stageIdx + 1}: ${STAGES[stageIdx].name}${selected ? ", selected" : ""}`);
      }
      node.classList.add("sel");
      const caption = this.root.querySelector(".stage-caption");
      if (caption) {
        caption.innerHTML = "";
        caption.appendChild(this.buildScoutCard(idx));
      }
    };
    const handle = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node = target.closest(".map-node.open");
      if (!node || !host.contains(node)) return;
      if (event instanceof KeyboardEvent) event.preventDefault();
      activate(node);
    };
    host.addEventListener("click", handle);
    host.addEventListener("keydown", handle);
  }

  /** Stormbreak Coast: a flooded road beneath a living storm. */
  private buildCoastMap(): HTMLElement {
    const save = this.save;
    const nodes = [
      { x: 64, y: 236 }, { x: 170, y: 180 }, { x: 280, y: 236 },
      { x: 384, y: 146 }, { x: 494, y: 206 }, { x: 582, y: 92 },
    ];
    const road = nodes.map((n, i) => i === 0 ? `M ${n.x} ${n.y}` : `Q ${(nodes[i - 1].x + n.x) / 2} ${(nodes[i - 1].y + n.y) / 2 + (i % 2 ? 22 : -18)} ${n.x} ${n.y}`).join(" ");
    let travel = "";
    if (this.travelFrom !== null && this.travelFrom >= 12 && this.travelFrom < 17) {
      const a = nodes[this.travelFrom - 12];
      const b = nodes[this.travelFrom - 11];
      travel = this.save.reducedMotion
        ? `<circle cx="${b.x}" cy="${b.y}" r="7" fill="#ffe9a3" stroke="#112d36" stroke-width="2"/>`
        : `<circle r="7" fill="#ffe9a3" stroke="#112d36" stroke-width="2"><animateMotion dur="1.6s" fill="freeze" path="M ${a.x} ${a.y} L ${b.x} ${b.y}"/></circle>`;
      this.travelFrom = null;
    }
    let markers = "";
    for (let i = 0; i < nodes.length; i++) {
      const sid = 12 + i;
      const stage = STAGES[sid];
      const n = nodes[i];
      const done = sid < save.unlockedStage;
      const current = sid === save.unlockedStage;
      const unlocked = sid <= save.unlockedStage;
      const labelWidth = stage.name.length * 6.4 + 16;
      markers += `<g class="map-node ${current ? "current" : ""} ${unlocked ? "open" : "locked"} ${sid === this.selectedStage ? "sel" : ""}" data-stage="${sid}">
        <circle cx="${n.x}" cy="${n.y}" r="31" fill="transparent"/>
        <circle class="sel-ring" cx="${n.x}" cy="${n.y}" r="24" fill="none" stroke="#ffe9a3" stroke-width="2" stroke-dasharray="5 6"/>
        ${current ? `<circle class="node-pulse" cx="${n.x}" cy="${n.y}" r="21" fill="none" stroke="#8ce6ef" stroke-width="2.5"/>` : ""}
        <circle cx="${n.x}" cy="${n.y}" r="17" fill="${done ? "url(#coastDone)" : current ? "url(#coastNow)" : "#29434d"}" stroke="#102831" stroke-width="4"/>
        <circle cx="${n.x}" cy="${n.y}" r="17" fill="none" stroke="${done ? "#92e3b0" : current ? "#ffe9a3" : "#53737c"}" stroke-width="2.5"/>
        ${unlocked ? `<text x="${n.x}" y="${n.y + 5.5}" text-anchor="middle" font-size="16" font-weight="900" fill="#fff8dc">${done ? "✓" : sid + 1}</text>` : `<text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="15" fill="#78919a">◆</text>`}
        ${unlocked ? `<rect x="${n.x - labelWidth / 2}" y="${n.y + 24}" width="${labelWidth}" height="15" rx="7" fill="rgba(8,28,35,.84)" stroke="${current ? "#8ce6ef" : "rgba(255,255,255,.14)"}"/><text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#eef7e8">${stage.name}</text>` : `<text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="10" fill="#66818a">UNCHARTED</text>`}
        ${done ? `<path d="M ${n.x + 19} ${n.y + 8} l 5 -10 l 5 10 z M ${n.x + 24} ${n.y - 2} v -8" fill="#f2c96f" stroke="#14323a" stroke-width="1.5"/>` : ""}
      </g>`;
    }
    const svg = el(`<div class="map-frame coast-map"><svg viewBox="0 0 640 320" role="img" aria-label="Stormbreak Coast">
      <defs>
        <linearGradient id="coastSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172b3b"/><stop offset=".6" stop-color="#527b82"/><stop offset="1" stop-color="#a0bab0"/></linearGradient>
        <linearGradient id="coastSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#477e83"/><stop offset="1" stop-color="#173f4a"/></linearGradient>
        <radialGradient id="coastNow"><stop offset="0" stop-color="#ffe6a0"/><stop offset="1" stop-color="#c77f32"/></radialGradient>
        <radialGradient id="coastDone"><stop offset="0" stop-color="#68ae7d"/><stop offset="1" stop-color="#2e6c57"/></radialGradient>
      </defs>
      <rect width="640" height="320" rx="18" fill="url(#coastSky)"/>
      <path d="M0 86 Q95 46 190 77 T375 70 T640 58 L640 0 L0 0Z" fill="#101d2b" opacity=".78"/>
      <path d="M390 42 l10 20 -12 5 20 33" fill="none" stroke="#d7f5ff" stroke-width="2.5" opacity=".75"/>
      <path d="M0 135 Q100 110 205 132 T418 120 T640 126 L640 320 L0 320Z" fill="url(#coastSea)"/>
      <path d="M0 210 Q88 176 164 211 T320 195 T470 188 T640 169 L640 320 L0 320Z" fill="#607762"/>
      <path d="M0 238 Q115 205 220 238 T425 218 T640 202" fill="none" stroke="#a9d1c5" stroke-width="3" opacity=".7"/>
      <g transform="translate(548 34)"><path d="M-22 92 L18 92 L11 25 L-12 25Z" fill="#d8d3bd" stroke="#1b3035" stroke-width="3"/><path d="M-17 25 L-9 8 L8 8 L15 25Z" fill="#8c493c" stroke="#1b3035" stroke-width="3"/><path d="M-5 8 V-3" stroke="#ffe9a3" stroke-width="5"/><path d="M-5 -3 L-46 12 M-5 -3 L34 14" stroke="#ffe9a3" stroke-width="4" opacity=".35"/></g>
      <path d="${road}" fill="none" stroke="#203c42" stroke-width="13" stroke-linecap="round"/><path d="${road}" fill="none" stroke="#c6b98a" stroke-width="7" stroke-linecap="round"/><path d="${road}" fill="none" stroke="#e9ddb0" stroke-width="2" stroke-dasharray="2 9"/>
      ${markers}${travel}
    </svg></div>`);
    this.wireMapNodes(svg);
    return svg;
  }

  /** The Winterreach: act two's frost-painted panel. */
  private buildWinterMap(): HTMLElement {
    const save = this.save;
    const nodes = [
      { x: 70, y: 236 },
      { x: 186, y: 172 },
      { x: 300, y: 238 },
      { x: 402, y: 150 },
      { x: 502, y: 216 },
      { x: 584, y: 96 },
    ];
    const road = nodes
      .map((n, i) => {
        if (i === 0) return `M ${n.x} ${n.y}`;
        const prev = nodes[i - 1];
        const mx = (prev.x + n.x) / 2 + (i % 2 ? -22 : 22);
        const my = (prev.y + n.y) / 2 + (i % 2 ? 18 : -18);
        return `Q ${mx} ${my} ${n.x} ${n.y}`;
      })
      .join(" ");
    const rand = (n: number) => {
      const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    let pines = "";
    for (let i = 0; i < 40; i++) {
      const tx = 18 + rand(i * 3) * 604;
      const ty = 96 + rand(i * 7 + 1) * 200;
      if (nodes.some((n) => Math.hypot(n.x - tx, n.y - ty) < 40)) continue;
      const sc = 6 + rand(i * 11) * 9;
      pines += `<path d="M ${tx} ${ty - sc * 2} L ${tx - sc} ${ty} L ${tx + sc} ${ty} Z" fill="#5a7a8c"/>`;
      pines += `<path d="M ${tx} ${ty - sc * 2} L ${tx - sc * 0.5} ${ty - sc} L ${tx + sc * 0.5} ${ty - sc} Z" fill="#e8f0f5"/>`;
    }
    let travel = "";
    if (this.travelFrom !== null && this.travelFrom >= 6 && this.travelFrom < 11) {
      const a = nodes[this.travelFrom - 6];
      const b = nodes[this.travelFrom - 5];
      travel = this.save.reducedMotion
        ? `<circle cx="${b.x}" cy="${b.y}" r="7" fill="#ffe9a3" stroke="#1a2634" stroke-width="2"/>`
        : `<g><circle r="7" fill="#ffe9a3" stroke="#1a2634" stroke-width="2"><animateMotion dur="1.6s" fill="freeze" path="M ${a.x} ${a.y} L ${b.x} ${b.y}"/></circle></g>`;
      this.travelFrom = null;
    }
    let markers = "";
    for (let i = 0; i < 6; i++) {
      const sid = 6 + i;
      const stage = STAGES[sid];
      const n = nodes[i];
      const done = sid < save.unlockedStage;
      const isCurrent = sid === save.unlockedStage;
      const unlocked = sid <= save.unlockedStage;
      const fill = done ? "url(#nodeDoneW)" : isCurrent ? "url(#nodeNowW)" : "#3a4a5e";
      const strokeC = done ? "#8ee88b" : isCurrent ? "#ffe9a3" : "#5a6a80";
      const label = done ? "✓" : unlocked ? String(sid + 1) : "";
      const nameW = stage.name.length * 6.4 + 16;
      markers += `
        <g class="map-node ${isCurrent ? "current" : ""} ${unlocked ? "open" : "locked"} ${sid === this.selectedStage ? "sel" : ""}" data-stage="${sid}">
          <circle cx="${n.x}" cy="${n.y}" r="30" fill="transparent"/>
          <circle class="sel-ring" cx="${n.x}" cy="${n.y}" r="24" fill="none" stroke="#ffe9a3" stroke-width="2" stroke-dasharray="5 6"/>
          ${isCurrent ? `<circle class="node-pulse" cx="${n.x}" cy="${n.y}" r="20" fill="none" stroke="#ffe9a3" stroke-width="2.5"/>` : ""}
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="${fill}" stroke="#1a2634" stroke-width="4"/>
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="none" stroke="${strokeC}" stroke-width="2.5"/>
          ${
            unlocked
              ? `<text x="${n.x}" y="${n.y + 5.5}" text-anchor="middle" font-size="16" font-weight="900" fill="#fdf8e7">${label}</text>`
              : `<g transform="translate(${n.x},${n.y})"><rect x="-5" y="-3" width="10" height="9" rx="2" fill="#8d94a3"/><path d="M -3 -3 v -2.5 a 3 3 0 0 1 6 0 V -3" fill="none" stroke="#8d94a3" stroke-width="2"/></g>`
          }
          ${
            unlocked
              ? `<g><rect x="${n.x - nameW / 2}" y="${n.y + 24}" width="${nameW}" height="15" rx="7" fill="rgba(14,22,32,0.78)" stroke="${isCurrent ? "#ffe9a3" : "rgba(255,255,255,0.15)"}" stroke-width="1"/><text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#f2ecd8">${stage.name}</text></g>`
              : `<text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="10" font-weight="700" fill="#7d8a9c">???</text>`
          }
          ${done ? `<g class="restored-site" transform="translate(${n.x + 22},${n.y + 7})"><path d="M 0 6 C -5 1 -2 -4 0 -8 C 1 -4 6 0 0 6 Z" fill="#f0a458"/><path d="M -7 8 L 7 3 M -7 3 L 7 8" stroke="#65442f" stroke-width="2.4"/><circle cx="0" cy="4" r="10" fill="none" stroke="#d8eef5" stroke-width="1" opacity="0.5"/></g>` : ""}
          ${
            unlocked
              ? `<g transform="translate(${n.x - 15},${n.y - 24})" opacity="0.9">${
                  [
                    '<path d="M 0 0 V 10 M -4 2 L 4 8 M 4 2 L -4 8" stroke="#d8f0f8" stroke-width="1.5" fill="none"/>',
                    '<path d="M 0 4 L -4 10 L 4 10 Z M 0 0 L -3 6 L 3 6 Z" fill="#5a7a8c"/>',
                    '<path d="M -4 3 L 0 6 L 4 4 M 0 6 L 1 10" stroke="#7ba4b8" stroke-width="1.4" fill="none"/>',
                    '<path d="M 0 0 L 3 6 L 0 10 L -3 6 Z" fill="#8fd0f8"/>',
                    '<path d="M -4 3 Q 0 1 4 3 M -4 6 Q 0 4 4 6 M -4 9 Q 0 7 4 9" stroke="#c8dce8" stroke-width="1.3" fill="none"/>',
                    '<path d="M -4 10 L -4 4 L -2 7 L 0 2 L 2 7 L 4 4 L 4 10 Z" fill="#dcedf5"/>',
                  ][i] ?? ""
                }</g>`
              : ""
          }
        </g>`;
    }
    const svg = el(`
      <div class="map-frame">
        <svg viewBox="0 0 640 320" role="img" aria-label="The Winterreach">
          <defs>
            <linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2c3a54"/>
              <stop offset="0.55" stop-color="#7a9ab8"/>
              <stop offset="1" stop-color="#c8dae8"/>
            </linearGradient>
            <linearGradient id="wland" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#dce8f0"/>
              <stop offset="1" stop-color="#b8ccd8"/>
            </linearGradient>
            <radialGradient id="nodeNowW" cx="0.5" cy="0.35" r="0.9">
              <stop offset="0" stop-color="#ffdf8e"/>
              <stop offset="1" stop-color="#c98a2e"/>
            </radialGradient>
            <radialGradient id="nodeDoneW" cx="0.5" cy="0.35" r="0.9">
              <stop offset="0" stop-color="#5d9c62"/>
              <stop offset="1" stop-color="#33633f"/>
            </radialGradient>
          </defs>
          <rect width="640" height="320" rx="18" fill="url(#wsky)"/>
          <!-- aurora -->
          <path d="M 0 40 Q 160 10 320 44 T 640 30 L 640 0 L 0 0 Z" fill="rgba(120,232,180,0.14)"/>
          <path d="M 0 62 Q 200 30 400 60 T 640 48 L 640 20 Q 400 44 200 26 Q 100 18 0 36 Z" fill="rgba(140,180,240,0.12)"/>
          <circle cx="552" cy="46" r="16" fill="#e8ecf5" opacity="0.9"/>
          <path d="M 0 104 Q 160 72 320 94 T 640 86 L 640 320 L 0 320 Z" fill="url(#wland)"/>
          <path d="M 0 92 Q 110 62 220 84 T 430 76 T 640 70 L 640 46 Q 500 66 350 52 Q 180 40 0 62 Z" fill="#8fb0c8" opacity="0.6"/>
          ${pines}
          <path d="${road}" fill="none" stroke="#48607a" stroke-width="12" stroke-linecap="round"/>
          <path d="${road}" fill="none" stroke="#e8f0f5" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
          <path d="${road}" fill="none" stroke="#9ab8cc" stroke-width="2.5" stroke-dasharray="1 10" stroke-linecap="round"/>
          ${markers}
          ${travel}
        </svg>
      </div>
    `);
    this.wireMapNodes(svg);
    return svg;
  }

  private showGoalPicker(suggested: string): void {
    const goals = [
      suggested,
      "Save gold for the next recruit",
      "Complete a matching armor set",
      "Raise a hero to their Path",
    ];
    const pop = el(`
      <div class="levelup-pop goal-pop">
        <div class="levelup-card journal-sheet">
          <div class="levelup-title">PIN AN EXPEDITION NOTE</div>
          <div class="levelup-line">Choose the reminder shown on your journey ribbon.</div>
          <div class="goal-options">
            ${goals.map((goal, index) => `<button class="toggle-btn" data-goal="${index}">${goal}</button>`).join("")}
            ${this.save.pinnedGoal ? '<button class="toggle-btn" data-goal="clear">Use the game\'s suggestion</button>' : ""}
          </div>
          <button class="big-btn" data-goal="cancel">Cancel</button>
        </div>
      </div>
    `);
    pop.addEventListener("click", (event) => {
      const pick = (event.target as HTMLElement).closest("[data-goal]")?.getAttribute("data-goal");
      if (!pick) return;
      if (pick === "cancel") return void pop.remove();
      this.save.pinnedGoal = pick === "clear" ? null : goals[Number(pick)];
      persist(this.save);
      audio.play("page");
      pop.remove();
      this.renderMap();
    });
    this.root.appendChild(pop);
  }

  /** The preparation table: party, formation, and the one enemy lesson that matters most. */
  private showEmbarkBriefing(stageIndex: number): void {
    const returnFocus = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
      ? document.activeElement
      : null;
    const stage = STAGES[stageIndex];
    const party = partyRoster(this.save);
    const kinds: EnemyKind[] = [];
    for (const wave of stage.waves) for (const entry of wave) if (!kinds.includes(entry.kind)) kinds.push(entry.kind);
    const known = kinds.filter((kind) => (this.save.bestiary[kind] ?? 0) > 0);
    const warning = known.length
      ? { name: ENEMIES[known[0]].name, habit: ENEMIES[known[0]].habit }
      : { name: "Unknown opposition", habit: "The bestiary will record what survives your first encounter." };
    const formationCopy = {
      line: "A broad, even opening",
      wedge: "One hero leads the advance",
      guard: "A front pair shelters the backline",
    } as const;
    const pendingPoints = party.reduce((sum, index) => sum + (this.save.unspent[index] ?? 0), 0);
    const pathless = party.filter((index) => this.save.heroes[index].level >= CALLING_UNLOCK_LEVEL && !this.save.heroes[index].calling).length;
    const terrainCopy = stage.terrain === "tide-storm"
      ? "Rising water slows the lower field; lightning circles strike after their countdown."
      : stage.terrain === "tide"
        ? "Rising water slows anyone fighting in the lower field."
        : stage.terrain === "storm"
          ? "Lightning circles strike after their countdown. Leave the mark before it closes."
          : stage.terrain === "cinder" ? "Furnace vents periodically erupt beneath the band. Spread before the orange cores close."
          : stage.terrain === "overgrowth" ? "Living roots periodically seize clustered heroes. Regroup after the root rings close."
          : stage.terrain === "mirage" ? "False eclipses periodically silence their outer rim. Find the quiet center."
          : stage.terrain === "sanctified" ? "Golden verdict-lines periodically divide the field. Cross into a dark seam."
          : stage.terrain === "hunt" ? "The red hunt periodically marks the weakest hero with a charging lane. Break the line."
          : stage.terrain === "void" ? "The road periodically unmakes clustered ground and leaves survivors vulnerable."
          : "No unusual terrain. Formation and target priority decide the opening.";
    const checks = [
      { warn: party.length < PARTY_CAP, text: `${party.length}/${PARTY_CAP} heroes taking the field` },
      { warn: pendingPoints > 0, text: pendingPoints > 0 ? `${pendingPoints} unspent attribute point${pendingPoints === 1 ? "" : "s"}` : "Attributes are accounted for" },
      { warn: pathless > 0, text: pathless > 0 ? `${pathless} eligible hero${pathless === 1 ? " has" : "es have"} no Path` : "Path choices are ready" },
    ];
    const pop = el(`
      <div class="levelup-pop briefing-pop">
        <div class="levelup-card preparation-sheet" role="dialog" aria-modal="true" aria-labelledby="briefing-title-${stageIndex}">
          <div class="briefing-kicker">PREPARATION TABLE · ${DIFFICULTIES[this.save.difficulty].name.toUpperCase()}</div>
          <div class="levelup-title" id="briefing-title-${stageIndex}">${stage.name}</div>
          <div class="levelup-line">${stage.subtitle}</div>
          <div class="brief-party">
            ${party.map((index) => `<span style="--accent:${HEROES[index].accent}"><b>${HEROES[index].name}</b><em>${buildIdentity(this.save, index)}</em></span>`).join("")}
          </div>
          <div class="brief-section"><strong>Band check</strong><em>Warnings do not prevent departure</em></div>
          <div class="readiness-strip">${checks.map((check) => `<span class="${check.warn ? "warn" : "ready"}"><b>${check.warn ? "!" : "✓"}</b>${check.text}</span>`).join("")}</div>
          <div class="brief-section"><strong>Opening formation</strong><em id="formation-copy">${formationCopy[this.save.formation]}</em></div>
          <div class="formation-row">
            ${(["line", "wedge", "guard"] as const).map((formation) => `<button class="formation-btn ${this.save.formation === formation ? "on" : ""}" data-formation="${formation}"><i class="formation-glyph ${formation}"></i>${formation}</button>`).join("")}
          </div>
          <div class="intent-card"><span>${ico("skull")}</span><div><em>SCOUT'S WARNING · ${warning.name}</em><strong>${warning.habit}</strong></div></div>
          <div class="intent-card terrain-intent"><span>${stage.terrain ? "≋" : "◇"}</span><div><em>FIELD CONDITIONS${BOSS_STAGES.includes(stageIndex) ? " · GREAT FOE" : ""}</em><strong>${terrainCopy}${BOSS_STAGES.includes(stageIndex) ? " Marked ground means move; break the amber poise bar to stagger the boss." : ""}</strong></div></div>
          <div class="levelup-actions">
            <button class="big-btn primary" data-brief="embark">Embark now</button>
            <button class="big-btn" data-brief="party">Adjust the band</button>
            <button class="big-btn" data-brief="cancel">Not yet</button>
          </div>
        </div>
      </div>
    `);
    const close = (restoreFocus = true) => {
      pop.remove();
      if (restoreFocus) returnFocus?.focus();
    };
    pop.addEventListener("click", (event) => {
      const formation = (event.target as HTMLElement).closest("[data-formation]")?.getAttribute("data-formation") as SaveData["formation"] | null;
      if (formation) {
        this.save.formation = formation;
        persist(this.save);
        pop.querySelectorAll(".formation-btn").forEach((button) => button.classList.toggle("on", button.getAttribute("data-formation") === formation));
        const copy = pop.querySelector("#formation-copy");
        if (copy) copy.textContent = formationCopy[formation];
        audio.play("click");
        return;
      }
      const action = (event.target as HTMLElement).closest("[data-brief]")?.getAttribute("data-brief");
      if (action === "embark") this.callbacks.startStage(stageIndex);
      else if (action === "party") {
        close(false);
        this.renderParty();
      } else if (action === "cancel" || event.target === pop) close();
    });
    pop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...pop.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    this.root.appendChild(pop);
    requestAnimationFrame(() => pop.querySelector<HTMLElement>('[data-brief="embark"]')?.focus());
  }

  /** Scout report for a stage: what awaits, what it pays, and the band's record there. */
  private buildScoutCard(idx: number): HTMLElement {
    const save = this.save;
    const stage = STAGES[idx];
    const rec = save.stageStats[idx];
    const rare = BOSS_STAGES.includes(idx);
    const kinds: EnemyKind[] = [];
    for (const wave of stage.waves) for (const entry of wave) if (!kinds.includes(entry.kind)) kinds.push(entry.kind);
    const mult = DIFFICULTIES[save.difficulty]?.rewardMult ?? 1;
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    const terrainScout = stage.terrain ? ({ tide: "≋ shifting tide", storm: "ϟ lightning", "tide-storm": "≋ tide · ϟ lightning", cinder: "♨ furnace vents", overgrowth: "⌇ grasping roots", mirage: "◐ false eclipses", sanctified: "✦ verdict-lines", hunt: "◉ marked hunt", void: "◇ unmaking road" } as const)[stage.terrain] : "";
    const card = el(`
      <div class="embark-card scout-card">
        <div class="embark-main">
          <div class="embark-info">
            <strong>${stage.name}</strong>
            <em>${stage.subtitle}</em>
          </div>
          <button class="big-btn primary embark-btn" data-act="embark">${ico("play")} Set out</button>
        </div>
        <div class="scout-row">
          <span class="scout-chip">${ico("sword")} ${stage.waves.length <= 1 ? "a single great trial" : stage.waves.length <= 3 ? "a short road" : "a long road"}</span>
          <span class="scout-chip">${ico("star")} ≈${Math.round(stage.xpReward * mult)} xp</span>
          <span class="scout-chip">${ico("gem")} ${rare ? "RARE trinket" : "trinket drop"}</span>
          ${terrainScout ? `<span class="scout-chip">${terrainScout}</span>` : ""}
          ${
            rec
              ? `<span class="scout-chip best">✓ best ${fmt(rec.bestTime)} · ×${rec.clears}</span>`
              : `<span class="scout-chip unbeaten">unconquered</span>`
          }
        </div>
        <div class="scout-foes"><span class="scout-label">scouts report:</span></div>
      </div>
    `);
    const foes = card.querySelector(".scout-foes")!;
    for (const kind of kinds) {
      const known = (save.bestiary[kind] ?? 0) > 0;
      if (known) {
        const chip = el(`<span class="scout-foe" title="${ENEMIES[kind].name}"><canvas width="64" height="64"></canvas></span>`);
        drawBeastIcon(chip.querySelector("canvas")!, kind);
        foes.appendChild(chip);
      } else {
        foes.appendChild(el(`<span class="scout-foe unknown" title="an unknown creature">?</span>`));
      }
    }
    const knownKinds = kinds.filter((kind) => (save.bestiary[kind] ?? 0) > 0).slice(0, 2);
    if (knownKinds.length) {
      card.appendChild(
        el(`<div class="intent-strip">${knownKinds
          .map((kind) => `<div><em>${ENEMIES[kind].name}</em><span class="enemy-role-chip ${ENEMIES[kind].priority ? "priority" : ""}">${enemyRoleLabel(kind)} · ${elementById(ENEMIES[kind].affinity)?.name ?? "Neutral"}</span>${enemyWaymark(kind, true)}<strong>${ENEMIES[kind].habit}</strong></div>`)
          .join("")}</div>`),
      );
    }
    return card;
  }

  /** One continuous atlas. Each six-stage panel is a readable stretch of the same road.
   *  Adding the eventual 60 levels means adding panels here, not another world picker. */
  private buildWorldMap(): HTMLElement {
    const regions = [
      { name: "The South Road", range: "I–VI", start: 0, build: () => this.buildSouthMap() },
      { name: "The Winterreach", range: "VII–XII", start: 6, build: () => this.buildWinterMap() },
      { name: "Stormbreak Coast", range: "XIII–XVIII", start: 12, build: () => this.buildCoastMap() },
      ...LATE_ROAD_REGIONS.map((region) => ({
        name: region.name,
        range: region.range,
        start: region.start,
        build: () => this.buildLateRoadMap(region),
      })),
    ];
    const currentRegion = Math.min(regions.length - 1, Math.floor((this.selectedStage ?? this.save.unlockedStage) / 6));
    const atlas = el(`
      <div class="road-atlas" style="--regions:${regions.length}">
        <div class="atlas-heading">
          <button class="atlas-step" data-road-step="-1" aria-label="Previous stretch of road">‹</button>
          <div><span>One road · ${STAGES.length} stages charted</span><strong data-region-name>${regions[currentRegion].name}</strong></div>
          <button class="atlas-step" data-road-step="1" aria-label="Next stretch of road">›</button>
        </div>
        <div class="atlas-ruler" aria-label="Known stretches of the Long Road">
          ${regions.map((region, i) => `<button class="atlas-mark ${i === currentRegion ? "on" : ""}" data-road-region="${i}"><i></i><span>${region.range}</span><em>${region.name}</em></button>`).join("")}
        </div>
        <div class="road-viewport"><div class="road-strip"></div></div>
      </div>
    `);
    const strip = atlas.querySelector(".road-strip")!;
    for (const [index, region] of regions.entries()) {
      const panel = el(`<section class="road-region" data-road-panel="${index}" aria-label="${region.name}"><div class="region-seam"><span>${region.range}</span><strong>${region.name}</strong></div></section>`);
      panel.appendChild(region.build());
      strip.appendChild(panel);
    }
    const viewport = atlas.querySelector(".road-viewport") as HTMLElement;
    const ruler = atlas.querySelector(".atlas-ruler") as HTMLElement;
    const name = atlas.querySelector("[data-region-name]")!;
    let active = currentRegion;
    const showRegion = (next: number, smooth = true) => {
      active = Math.max(0, Math.min(regions.length - 1, next));
      viewport.scrollTo({ left: viewport.clientWidth * active, behavior: smooth && !this.save.reducedMotion ? "smooth" : "auto" });
      name.textContent = regions[active].name;
      atlas.querySelectorAll(".atlas-mark").forEach((mark, i) => mark.classList.toggle("on", i === active));
      const activeMark = atlas.querySelectorAll<HTMLElement>(".atlas-mark")[active];
      ruler.scrollTo({
        left: Math.max(0, activeMark.offsetLeft - ruler.clientWidth / 2 + activeMark.clientWidth / 2),
        behavior: smooth && !this.save.reducedMotion ? "smooth" : "auto",
      });
      (atlas.querySelector('[data-road-step="-1"]') as HTMLButtonElement).disabled = active === 0;
      (atlas.querySelector('[data-road-step="1"]') as HTMLButtonElement).disabled = active === regions.length - 1;
    };
    atlas.addEventListener("click", (event) => {
      const mark = (event.target as HTMLElement).closest("[data-road-region]");
      const step = (event.target as HTMLElement).closest("[data-road-step]");
      if (mark) showRegion(Number(mark.getAttribute("data-road-region")));
      if (step) showRegion(active + Number(step.getAttribute("data-road-step")));
    });
    let scrollTimer = 0;
    viewport.addEventListener("scroll", () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => showRegion(Math.round(viewport.scrollLeft / Math.max(1, viewport.clientWidth)), false), 90);
    }, { passive: true });
    requestAnimationFrame(() => showRegion(currentRegion, false));
    return atlas;
  }

  /** Acts IV-X share a chartmaker's survey plate while retaining distinct
   * palettes, silhouettes, weather and landmarks from late-road data. */
  private buildLateRoadMap(region: LateRoadRegion): HTMLElement {
    const travelFrom = this.travelFrom;
    const campaignComplete = (this.save.stageStats[STAGES.length - 1]?.clears ?? 0) > 0;
    const map = el(lateRoadMapMarkup(region, this.save.unlockedStage, this.selectedStage, travelFrom, campaignComplete, this.save.reducedMotion));
    if (travelFrom !== null && travelFrom >= region.start && travelFrom < region.bossStage) this.travelFrom = null;
    this.wireMapNodes(map);
    return map;
  }

  /** The first painted stretch: dawn fields, deep wood, mire, and the Gloaming. */
  private buildSouthMap(): HTMLElement {
    const save = this.save;
    const nodes = [
      { x: 80, y: 252 },
      { x: 198, y: 186 },
      { x: 318, y: 242 },
      { x: 420, y: 158 },
      { x: 514, y: 220 },
      { x: 578, y: 106 },
    ];
    const road = nodes
      .map((n, i) => {
        if (i === 0) return `M ${n.x} ${n.y}`;
        const prev = nodes[i - 1];
        const mx = (prev.x + n.x) / 2 + (i % 2 ? -24 : 24);
        const my = (prev.y + n.y) / 2 + (i % 2 ? 20 : -20);
        return `Q ${mx} ${my} ${n.x} ${n.y}`;
      })
      .join(" ");
    const rand = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    // pine clusters, denser near the deep-forest and thinner near the burn
    let trees = "";
    for (let i = 0; i < 46; i++) {
      const tx = 18 + rand(i * 3) * 604;
      const ty = 96 + rand(i * 7 + 1) * 200;
      if (nodes.some((n) => Math.hypot(n.x - tx, n.y - ty) < 42)) continue;
      const nearBurn = Math.hypot(420 - tx, 158 - ty) < 70;
      const s = 6 + rand(i * 11) * 10;
      const far = ty < 150;
      const shade = nearBurn ? "#3a2c26" : far ? "#33584040" : rand(i * 5) > 0.5 ? "#2e5038" : "#26452f";
      if (nearBurn && rand(i * 13) > 0.4) {
        // charred snag
        trees += `<path d="M ${tx} ${ty} L ${tx} ${ty - s * 1.7} M ${tx} ${ty - s} L ${tx + s * 0.5} ${ty - s * 1.3} M ${tx} ${ty - s * 0.7} L ${tx - s * 0.45} ${ty - s}" stroke="#3a2c26" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      } else {
        trees += `<path d="M ${tx} ${ty - s * 2} L ${tx - s} ${ty} L ${tx + s} ${ty} Z" fill="${shade}"/>`;
        trees += `<path d="M ${tx} ${ty - s * 2.6} L ${tx - s * 0.7} ${ty - s * 0.9} L ${tx + s * 0.7} ${ty - s * 0.9} Z" fill="${shade}"/>`;
        trees += `<rect x="${tx - 1.4}" y="${ty}" width="2.8" height="${s * 0.5}" fill="#1c3023"/>`;
      }
    }
    // victory road-march: a marker walks from the cleared node to the new one
    let travel = "";
    if (this.travelFrom !== null && this.travelFrom + 1 < nodes.length) {
      const a = nodes[this.travelFrom];
      const b = nodes[this.travelFrom + 1];
      const mx = (a.x + b.x) / 2 + ((this.travelFrom + 1) % 2 ? -24 : 24);
      const my = (a.y + b.y) / 2 + ((this.travelFrom + 1) % 2 ? 20 : -20);
      travel = this.save.reducedMotion
        ? `<circle cx="${b.x}" cy="${b.y}" r="7" fill="#ffe9a3" stroke="#1a2b20" stroke-width="2"/>`
        : `
          <g>
            <circle r="7" fill="#ffe9a3" stroke="#1a2b20" stroke-width="2">
              <animateMotion dur="1.6s" fill="freeze" path="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}"/>
            </circle>
          </g>`;
      this.travelFrom = null;
    }
    let markers = "";
    STAGES.slice(0, 6).forEach((stage, i) => {
      const n = nodes[i];
      const done = i < save.unlockedStage;
      const isCurrent = i === save.unlockedStage;
      const unlocked = i <= save.unlockedStage;
      const fill = done ? "url(#nodeDone)" : isCurrent ? "url(#nodeNow)" : "#332d42";
      const stroke = done ? "#8ee88b" : isCurrent ? "#ffe9a3" : "#514a66";
      const label = done ? "✓" : unlocked ? String(i + 1) : "";
      const nameW = stage.name.length * 6.4 + 16;
      markers += `
        <g class="map-node ${isCurrent ? "current" : ""} ${unlocked ? "open" : "locked"} ${i === this.selectedStage ? "sel" : ""}" data-stage="${i}">
          <circle cx="${n.x}" cy="${n.y}" r="30" fill="transparent"/>
          <circle class="sel-ring" cx="${n.x}" cy="${n.y}" r="24" fill="none" stroke="#ffe9a3" stroke-width="2" stroke-dasharray="5 6"/>
          <ellipse cx="${n.x}" cy="${n.y + 16}" rx="14" ry="4" fill="rgba(10,18,12,0.35)"/>
          ${isCurrent ? `<circle class="node-pulse" cx="${n.x}" cy="${n.y}" r="20" fill="none" stroke="#ffe9a3" stroke-width="2.5"/>` : ""}
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="${fill}" stroke="#1a2b20" stroke-width="4"/>
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="none" stroke="${stroke}" stroke-width="2.5"/>
          ${
            unlocked
              ? `<text x="${n.x}" y="${n.y + 5.5}" text-anchor="middle" font-size="16" font-weight="900" fill="#fdf8e7">${label}</text>`
              : `<g transform="translate(${n.x},${n.y})"><rect x="-5" y="-3" width="10" height="9" rx="2" fill="#8d84a3"/><path d="M -3 -3 v -2.5 a 3 3 0 0 1 6 0 V -3" fill="none" stroke="#8d84a3" stroke-width="2"/></g>`
          }
          ${done ? `<g transform="translate(${n.x + 12},${n.y - 26})"><line x1="0" y1="0" x2="0" y2="14" stroke="#6b4a2a" stroke-width="2"/><path d="M 0 0 L 11 3.5 L 0 7 Z" fill="#8ee88b"/></g>` : ""}
          ${done ? `<g class="restored-site" transform="translate(${n.x - 31},${n.y + 10})"><rect x="0" y="-7" width="13" height="10" rx="1.5" fill="#c89b63"/><path d="M -2 -7 L 6.5 -14 L 15 -7 Z" fill="#744b32"/><rect x="5" y="-3" width="3" height="6" fill="#ffe9a3"/><path d="M 11 -13 C 15 -18 8 -20 13 -25" fill="none" stroke="#ddd4bd" stroke-width="1.2" opacity="0.65"/></g>` : ""}
          ${
            unlocked
              ? `<g transform="translate(${n.x - 15},${n.y - 24})" opacity="0.9">${
                  [
                    '<path d="M 0 4 L -4 10 L 4 10 Z M 0 0 L -3 6 L 3 6 Z" fill="#2e5038"/>',
                    '<path d="M 0 4 L -4 10 L 4 10 Z M 0 0 L -3 6 L 3 6 Z" fill="#1f4030"/>',
                    '<path d="M 0 0 C -3 5 -3 8 0 10 C 3 8 3 5 0 0 Z" fill="#5e8a7a"/>',
                    '<path d="M 0 10 C -4 6 -2 2 0 0 C 1 3 4 5 0 10 Z" fill="#e0904b"/>',
                    '<path d="M 2 0 A 5 5 0 1 0 2 10 A 4.2 4.2 0 1 1 2 0 Z" fill="#8d7ba8"/>',
                    '<circle r="4" cy="5" fill="#c9c2b8"/><circle cx="-1.5" cy="4" r="1" fill="#40201a"/><circle cx="1.5" cy="4" r="1" fill="#40201a"/>',
                  ][i] ?? ""
                }</g>`
              : ""
          }
          ${
            unlocked
              ? `<g><rect x="${n.x - nameW / 2}" y="${n.y + 24}" width="${nameW}" height="15" rx="7" fill="rgba(16,26,18,0.75)" stroke="${isCurrent ? "#ffe9a3" : "rgba(255,255,255,0.15)"}" stroke-width="1"/><text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#f2ecd8">${stage.name}</text></g>`
              : `<text x="${n.x}" y="${n.y + 35}" text-anchor="middle" font-size="10" font-weight="700" fill="#7d7590">???</text>`
          }
        </g>`;
    });
    const svg = el(`
      <div class="map-frame">
        <svg viewBox="0 0 640 320" role="img" aria-label="World map">
          <defs>
            <linearGradient id="mapsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#f2c98a"/>
              <stop offset="0.55" stop-color="#c9d6a8"/>
              <stop offset="1" stop-color="#9dbf94"/>
            </linearGradient>
            <linearGradient id="mapland" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#4a7355"/>
              <stop offset="1" stop-color="#2f5240"/>
            </linearGradient>
            <radialGradient id="nodeNow" cx="0.5" cy="0.35" r="0.9">
              <stop offset="0" stop-color="#ffdf8e"/>
              <stop offset="1" stop-color="#c98a2e"/>
            </radialGradient>
            <radialGradient id="nodeDone" cx="0.5" cy="0.35" r="0.9">
              <stop offset="0" stop-color="#5d9c62"/>
              <stop offset="1" stop-color="#33633f"/>
            </radialGradient>
            <radialGradient id="burnGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="rgba(230,120,60,0.4)"/>
              <stop offset="1" stop-color="rgba(230,120,60,0)"/>
            </radialGradient>
            <radialGradient id="bossGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="rgba(200,60,50,0.42)"/>
              <stop offset="1" stop-color="rgba(200,60,50,0)"/>
            </radialGradient>
            <radialGradient id="mapVin" cx="0.5" cy="0.46" r="0.72">
              <stop offset="0.62" stop-color="rgba(12,16,10,0)"/>
              <stop offset="1" stop-color="rgba(12,16,10,0.34)"/>
            </radialGradient>
          </defs>
          <rect width="640" height="320" rx="18" fill="url(#mapsky)"/>
          <circle cx="560" cy="42" r="20" fill="#fff3c8" opacity="0.95"/>
          <circle cx="560" cy="42" r="30" fill="#fff3c8" opacity="0.25"/>
          <path class="map-bird" d="M 150 46 q 5 -5 10 0 q 5 -5 10 0" stroke="#5c5a4a" stroke-width="1.6" fill="none"/>
          <path class="map-bird b2" d="M 190 60 q 4 -4 8 0 q 4 -4 8 0" stroke="#5c5a4a" stroke-width="1.4" fill="none"/>
          <path d="M 0 92 Q 110 60 220 84 T 430 78 T 640 72 L 640 40 Q 500 66 350 52 Q 180 40 0 62 Z" fill="#6f9276" opacity="0.55"/>
          <path d="M 0 104 Q 160 72 320 94 T 640 86 L 640 320 L 0 320 Z" fill="url(#mapland)"/>
          <!-- themed regions -->
          <ellipse cx="86" cy="252" rx="86" ry="46" fill="#8aa860" opacity="0.5"/>
          <ellipse cx="204" cy="188" rx="80" ry="50" fill="#1f4030" opacity="0.55"/>
          <ellipse cx="322" cy="248" rx="82" ry="44" fill="#3f6b60" opacity="0.6"/>
          <ellipse cx="322" cy="252" rx="60" ry="26" fill="#5e8a7a" opacity="0.4"/>
          <ellipse cx="422" cy="158" rx="74" ry="46" fill="#4a3a30" opacity="0.6"/>
          <ellipse cx="422" cy="158" rx="90" ry="56" fill="url(#burnGlow)"/>
          <ellipse cx="516" cy="222" rx="70" ry="42" fill="#4a4468" opacity="0.5"/>
          <ellipse cx="580" cy="104" rx="66" ry="46" fill="url(#bossGlow)"/>
          <!-- river with bridge -->
          <path d="M 640 150 Q 520 176 430 240 Q 360 290 240 300 Q 140 308 60 320" fill="none" stroke="#3d6a80" stroke-width="14" stroke-linecap="round" opacity="0.75"/>
          <path d="M 640 150 Q 520 176 430 240 Q 360 290 240 300 Q 140 308 60 320" fill="none" stroke="#6fa3bd" stroke-width="7" stroke-linecap="round" opacity="0.8"/>
          ${trees}
          <path d="${road}" fill="none" stroke="#1c3023" stroke-width="12" stroke-linecap="round"/>
          <path d="${road}" fill="none" stroke="#b89a6a" stroke-width="7" stroke-linecap="round" opacity="0.9"/>
          <path d="${road}" fill="none" stroke="#e0c896" stroke-width="2.5" stroke-dasharray="1 10" stroke-linecap="round"/>
          <!-- bridge where road meets river -->
          <rect x="358" y="266" width="30" height="10" rx="3" fill="#6b4a2a" stroke="#1c3023" stroke-width="2" transform="rotate(-18 373 271)"/>
          <!-- regional weather on the overworld -->
          <g class="map-rainband">
            ${Array.from({ length: 7 }, (_, i) => `<line x1="${292 + i * 10}" y1="${212 + (i % 3) * 6}" x2="${289 + i * 10}" y2="${224 + (i % 3) * 6}" stroke="rgba(180,215,225,0.55)" stroke-width="1.2"/>`).join("")}
          </g>
          <g class="map-emberband">
            ${Array.from({ length: 5 }, (_, i) => `<circle cx="${398 + i * 12}" cy="${150 + (i % 3) * 9}" r="1.6" fill="rgba(255,150,80,0.8)"/>`).join("")}
          </g>
          <!-- boss skull rock -->
          <g transform="translate(600,72)" opacity="0.9">
            <circle r="9" fill="#c9c2b8"/>
            <circle cx="-3" cy="-1" r="2.4" fill="#40201a"/>
            <circle cx="3" cy="-1" r="2.4" fill="#40201a"/>
            <rect x="-4" y="4" width="8" height="3" fill="#c9c2b8"/>
          </g>
          <!-- drifting cloud shadows -->
          <g fill="rgba(14, 24, 14, 0.09)">
            <ellipse cx="0" cy="170" rx="70" ry="18">
              ${save.reducedMotion ? "" : `<animateTransform attributeName="transform" type="translate" values="-80 0; 720 24; -80 0" dur="52s" repeatCount="indefinite"/>`}
            </ellipse>
            <ellipse cx="0" cy="260" rx="52" ry="13">
              ${save.reducedMotion ? "" : `<animateTransform attributeName="transform" type="translate" values="700 0; -90 -18; 700 0" dur="64s" repeatCount="indefinite"/>`}
            </ellipse>
          </g>
          ${markers}
          ${travel}
          <!-- compass rose -->
          <g transform="translate(606,286)" opacity="0.85">
            <circle r="15" fill="rgba(16,26,18,0.55)" stroke="#e0c896" stroke-width="1.4"/>
            <path d="M 0 -11 L 3 0 L 0 11 L -3 0 Z" fill="#e0c896"/>
            <path d="M 0 -11 L 3 0 L -3 0 Z" fill="#f2ecd8"/>
            <text y="-18.5" text-anchor="middle" font-size="9" font-weight="700" fill="#e0c896">N</text>
          </g>
          <rect width="640" height="320" rx="18" fill="url(#mapVin)" pointer-events="none"/>
        </svg>
      </div>
    `);
    this.wireMapNodes(svg);
    return svg;
  }

  // ------------------------------------------------------------------ bestiary

  renderBestiary(): void {
    this.pushNav("bestiary");
    this.root.innerHTML = "";
    this.show();
    const kinds = Object.keys(ENEMIES) as EnemyKind[];
    const discovered = kinds.filter((k) => (this.save.bestiary[k] ?? 0) > 0).length;
    const mastered = kinds.filter((k) => (this.save.bestiary[k] ?? 0) >= 25).length;
    const totalKills = kinds.reduce((sum, kind) => sum + (this.save.bestiary[kind] ?? 0), 0);
    const page = el(`
      <div class="page bestiary-page">
        <div class="map-header">
          <div>
            <div class="map-title">Field Bestiary</div>
            <div class="map-level">Every encounter leaves a clearer mark: record, study, then master each foe.</div>
          </div>
        </div>
        <div class="shop-tabs"><button class="shop-tab" data-rec="chronicle">${ico("chart")} Chronicle</button><button class="shop-tab on" data-rec="bestiary">${ico("book")} Bestiary</button></div>
        <div class="bestiary-summary" aria-label="Bestiary progress">
          <div><span>Recorded</span><strong>${discovered}<small> / ${kinds.length}</small></strong></div>
          <div><span>Mastered</span><strong>${mastered}<small> / ${kinds.length}</small></strong></div>
          <div><span>Total slain</span><strong>${totalKills}</strong></div>
        </div>
        <div class="bestiary-tools">
          <div class="bestiary-regions" role="tablist" aria-label="Bestiary region">
            <button class="bestiary-region ${this.bestiaryRegion === -1 ? "on" : ""}" data-beast-region="-1" role="tab" aria-selected="${this.bestiaryRegion === -1}"><span>ALL</span><strong>Long Road</strong></button>
            ${BESTIARY_REGIONS.map((region, index) => `<button class="bestiary-region ${this.bestiaryRegion === index ? "on" : ""}" data-beast-region="${index}" role="tab" aria-selected="${this.bestiaryRegion === index}"><span>${region.range}</span><strong>${region.name}</strong></button>`).join("")}
          </div>
          <div class="bestiary-query">
            <label><span>Search recorded foes</span><input type="search" data-beast-search placeholder="Name or habit…" value="${this.bestiarySearch.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></label>
            <button class="toggle-btn ${this.bestiaryKnownOnly ? "on" : ""}" data-beast-known aria-pressed="${this.bestiaryKnownOnly}">${this.bestiaryKnownOnly ? "Showing recorded" : "Include rumors"}</button>
          </div>
        </div>
        <div class="bestiary-section-head"><div><span data-beast-range></span><strong data-beast-heading></strong></div><em data-beast-count></em></div>
        <div class="beast-list"></div>
      </div>
    `);
    const list = page.querySelector(".beast-list")!;
    const fillList = () => {
      const region = this.bestiaryRegion >= 0 ? BESTIARY_REGIONS[this.bestiaryRegion] : null;
      const query = this.bestiarySearch.trim().toLowerCase();
      const filtered = kinds
        .filter((kind) => this.bestiaryRegion < 0 || enemyRegionIndex(kind) === this.bestiaryRegion)
        .filter((kind) => !this.bestiaryKnownOnly || (this.save.bestiary[kind] ?? 0) > 0)
        .filter((kind) => {
          if (!query) return true;
          const kills = this.save.bestiary[kind] ?? 0;
          return kills > 0 && `${ENEMIES[kind].name} ${ENEMIES[kind].habit}`.toLowerCase().includes(query);
        })
        .sort((a, b) => enemyFirstStage(a) - enemyFirstStage(b) || (this.save.bestiary[b] ?? 0) - (this.save.bestiary[a] ?? 0));
      page.querySelector("[data-beast-range]")!.textContent = region?.range ?? "I–LX";
      page.querySelector("[data-beast-heading]")!.textContent = region?.name ?? "The Long Road";
      page.querySelector("[data-beast-count]")!.textContent = `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;
      list.innerHTML = "";
      for (const kind of filtered) {
        const def = ENEMIES[kind];
        const kills = this.save.bestiary[kind] ?? 0;
        const firstStage = enemyFirstStage(kind);
        const foeRegion = BESTIARY_REGIONS[enemyRegionIndex(kind)];
        if (kills > 0) {
          const T2 = 10;
          const T3 = 25;
          const boss = BOSS_STAGES.includes(firstStage);
          const rankName = kills >= T3 ? "Mastered" : kills >= T2 ? "Studied" : "Recorded";
          const habitLine = kills >= T2
            ? `<div class="beast-habit">${ico("sword")} ${def.habit}</div>`
            : `<div class="beast-habit beast-locked">${ico("sword")} Study ${T2 - kills} more to reveal its combat habit</div>`;
          const statLine = kills >= T3
            ? `<div class="beast-stats"><span>${def.maxHp} hp</span><span>${def.damage} damage</span><span>${def.range > 100 ? "ranged" : "melee"}</span>${def.armor ? "<span>armored</span>" : ""}</div>`
            : `<div class="beast-stats beast-locked">Full measure at ${T3} slain · ${kills}/${T3}</div>`;
          const card = el(`
            <article class="beast-card ${boss ? "boss" : ""} ${kills >= T3 ? "mastered" : ""}" style="--beast:${def.body};--beast-trim:${def.trim}">
              <div class="beast-icon"><canvas width="64" height="64"></canvas><span>${boss ? "GREAT FOE" : foeRegion.name}</span></div>
              <div class="beast-info">
                <div class="beast-heading"><div class="beast-name">${def.name}</div><span class="beast-rank">${rankName}</span></div>
                <div class="beast-kills">×${kills} slain · first seen at waymark ${firstStage + 1}</div>
                <div class="beast-taxonomy"><span class="role ${def.priority ? "priority" : ""}">${enemyRoleLabel(kind)}${def.priority ? " · priority" : ""}</span><span class="element">${elementById(def.affinity)?.name ?? "Neutral"}</span></div>
                <div class="beast-lore">${def.lore}</div>
                ${enemyWaymark(kind)}
                ${habitLine}
                ${statLine}
                ${kills < T3 ? `<div class="beast-bar" aria-label="${kills} of ${T3} mastery"><div style="width:${Math.min(100, (kills / T3) * 100)}%"></div></div>` : ""}
              </div>
            </article>
          `);
          drawBeastIcon(card.querySelector("canvas")!, kind);
          list.appendChild(card);
        } else {
          list.appendChild(el(`
            <article class="beast-card unknown">
              <div class="beast-icon"><div class="beast-mystery">?</div><span>${foeRegion.name}</span></div>
              <div class="beast-info">
                <div class="beast-heading"><div class="beast-name">Unknown creature</div><span class="beast-rank">Rumor</span></div>
                <div class="beast-kills">Scouts place something near waymark ${firstStage + 1}</div>
                <div class="beast-lore">Defeat this creature to enter its name and nature in the ledger.</div>
              </div>
            </article>
          `));
        }
      }
      if (!filtered.length) list.appendChild(el(`<div class="bestiary-empty"><strong>No field notes match.</strong><span>Try another stretch of road or clear the search.</span></div>`));
    };
    fillList();
    const search = page.querySelector("[data-beast-search]") as HTMLInputElement;
    search.addEventListener("input", () => { this.bestiarySearch = search.value; fillList(); });
    page.addEventListener("click", (event) => {
      const region = (event.target as HTMLElement).closest("[data-beast-region]")?.getAttribute("data-beast-region");
      if (region !== undefined && region !== null) {
        this.bestiaryRegion = Number(region);
        page.querySelectorAll("[data-beast-region]").forEach((button) => {
          const selected = button.getAttribute("data-beast-region") === region;
          button.classList.toggle("on", selected);
          button.setAttribute("aria-selected", String(selected));
        });
        audio.play("page");
        fillList();
        return;
      }
      const known = (event.target as HTMLElement).closest("[data-beast-known]") as HTMLButtonElement | null;
      if (known) {
        this.bestiaryKnownOnly = !this.bestiaryKnownOnly;
        known.classList.toggle("on", this.bestiaryKnownOnly);
        known.setAttribute("aria-pressed", String(this.bestiaryKnownOnly));
        known.textContent = this.bestiaryKnownOnly ? "Showing recorded" : "Include rumors";
        audio.play("click");
        fillList();
        return;
      }
      const record = (event.target as HTMLElement).closest("[data-rec]")?.getAttribute("data-rec");
      if (record === "chronicle") {
        audio.play("page");
        this.renderChronicle();
        return;
      }
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "back") {
        audio.play("click");
        this.goBack(() => this.renderMap());
      }
    });
    this.mount(page, "records");
  }

  // ------------------------------------------------------------------ hotkeys

  /** Rebind the battle keys: tap a row, press a key. */
  renderHotkeys(): void {
    this.pushNav("hotkeys");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const ROWS: [string, string][] = [
      ["hero1", "Select hero 1"],
      ["hero2", "Select hero 2"],
      ["hero3", "Select hero 3"],
      ["hero4", "Select hero 4"],
      ["ability1", "Use technique 1"],
      ["ability2", "Use technique 2"],
      ["ability3", "Use the ULTIMATE"],
    ];
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Hotkeys</div>
            <div class="map-level">Tap a row, then press the key you want · aimed techniques follow the mouse, click casts, Esc cancels</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Settings</button>
        </div>
        <div class="hotkey-list">
          ${ROWS.map(
            ([id, label]) => `
            <button class="hotkey-row" data-bind="${id}">
              <span class="hotkey-label">${label}</span>
              <span class="hotkey-key">${(save.keybinds[id] ?? "").toUpperCase() || "—"}</span>
            </button>`,
          ).join("")}
        </div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="hotkey-defaults">Restore defaults</button>
        </div>
      </div>
    `);
    let listening: HTMLElement | null = null;
    const capture = (event: KeyboardEvent) => {
      if (!listening) return;
      event.preventDefault();
      event.stopPropagation();
      const id = listening.getAttribute("data-bind")!;
      if (event.key !== "Escape") {
        const key = event.key.toLowerCase();
        if (key.length === 1) {
          const takenBy = Object.keys(save.keybinds).find((k) => k !== id && save.keybinds[k] === key);
          if (takenBy) {
            this.showToast(`"${key.toUpperCase()}" already does something — unbind it first`);
          } else {
            save.keybinds[id] = key;
            persist(save);
            audio.play("click");
          }
        } else {
          this.showToast("Single letters and digits only");
        }
      }
      window.removeEventListener("keydown", capture, true);
      this.hotkeyCaptureCleanup = null;
      listening = null;
      this.renderHotkeys();
    };
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const row = target.closest("[data-bind]") as HTMLElement | null;
      if (row) {
        audio.play("click");
        listening = row;
        row.classList.add("listening");
        (row.querySelector(".hotkey-key") as HTMLElement).textContent = "press a key…";
        window.addEventListener("keydown", capture, true);
        this.hotkeyCaptureCleanup = () => window.removeEventListener("keydown", capture, true);
        return;
      }
      if (target.closest('[data-act="hotkey-defaults"]')) {
        save.keybinds = { ...DEFAULT_KEYBINDS };
        persist(save);
        audio.play("click");
        this.renderHotkeys();
        return;
      }
      if (target.closest('[data-act="back"]')) {
        this.hotkeyCaptureCleanup?.();
        this.hotkeyCaptureCleanup = null;
        audio.play("click");
        this.goBack(() => this.renderSettings());
      }
    });
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ save slots

  /** Six bands, six tales — pick which one takes the road. */
  renderProfiles(): void {
    this.pushNav("profiles");
    this.root.innerHTML = "";
    this.show();
    const current = activeSlot();
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Bands</div>
            <div class="map-level">Six tales, kept apart — switching never loses a thing</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Settings</button>
        </div>
        <div class="slot-list"></div>
      </div>
    `);
    const list = page.querySelector(".slot-list")!;
    SLOT_NAMES.forEach((name, i) => {
      const peek = peekSlot(i);
      const isCurrent = i === current;
      list.appendChild(
        el(`
          <div class="slot-card ${isCurrent ? "current" : ""} ${peek.empty ? "empty" : ""}" data-slot="${i}">
            <div class="slot-head">
              <strong>${name}</strong>
              ${isCurrent ? '<span class="slot-now">playing now</span>' : ""}
            </div>
            ${
              peek.empty
                ? '<em class="slot-sub">An unwritten tale — begin here.</em>'
                : `<em class="slot-sub">Band level ${peek.level} · stage ${Math.min(peek.stage + 1, STAGES.length)} of ${STAGES.length} · ${peek.recruits} heroes · ${ico("coin")} ${peek.gold} · ${peek.victories} victories</em>`
            }
            ${isCurrent ? "" : `<button class="big-btn ${peek.empty ? "" : "primary"} slot-btn" data-pick="${i}">${peek.empty ? "Begin this tale" : "Take up this band"}</button>`}
          </div>
        `),
      );
    });
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const pick = target.closest("[data-pick]");
      if (pick) {
        audio.play("click");
        setActiveSlot(Number(pick.getAttribute("data-pick")));
        location.reload();
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderSettings());
      }
    });
    this.root.appendChild(page);
  }

  /** The campaign's last page: the stolen road returns beyond the Meridian. */
  renderFinale(): void {
    this.pushNav("finale");
    this.pendingFinale = false;
    this.root.innerHTML = "";
    this.show();
    const lt = this.save.lifetime;
    const done = DEEDS.filter((d) => d.done(this.save)).length;
    const page = el(`
      <div class="page title-page finale-page">
        <div class="title-block">
          <div class="game-logo" style="font-size:40px">THE ROAD REMADE</div>
          <div class="game-sub">The Way-Eater is broken. The stolen miles return, one lantern at a time. Beyond the Meridian, the Long Road belongs to the living again.</div>
        </div>
        <div class="campfire-scene" aria-hidden="true">
          <svg viewBox="0 0 360 120">
            <defs>
              <linearGradient id="meridianSky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11101c"/><stop offset="0.58" stop-color="#332b48"/><stop offset="1" stop-color="#b37a62"/></linearGradient>
              <linearGradient id="returnedRoad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#60546b"/><stop offset="0.62" stop-color="#c8b7a0"/><stop offset="1" stop-color="#ffe4a3"/></linearGradient>
            </defs>
            <rect width="360" height="120" rx="12" fill="url(#meridianSky)"/>
            <g fill="#eee1c7" opacity="0.62"><circle cx="42" cy="25" r="1.2"/><circle cx="90" cy="42" r="0.8"/><circle cx="151" cy="18" r="1"/><circle cx="223" cy="35" r="1.2"/><circle cx="316" cy="20" r="0.9"/></g>
            <circle cx="294" cy="52" r="28" fill="none" stroke="#bf9cf0" stroke-width="2" opacity="0.38"/>
            <circle cx="294" cy="52" r="18" fill="none" stroke="#ffe4a3" stroke-width="1.5" opacity="0.72"/>
            <path d="M0 101 Q72 76 143 91 T278 74 Q319 68 360 55 L360 120 L0 120Z" fill="#17141e"/>
            <path d="M0 108 Q76 87 149 98 T282 82 Q322 75 360 62" fill="none" stroke="#0d0b12" stroke-width="14" stroke-linecap="round"/>
            <path d="M0 108 Q76 87 149 98 T282 82 Q322 75 360 62" fill="none" stroke="url(#returnedRoad)" stroke-width="7" stroke-linecap="round"/>
            <path d="M18 104V80 M15 82h6 M250 86V60 M247 62h6" stroke="#eee1c7" stroke-width="2"/><circle cx="18" cy="77" r="3" fill="#ffe4a3"/><circle cx="250" cy="57" r="3" fill="#ffe4a3"/>
            ${this.save.heroes
              .map((h, i) => ({ h, i }))
              .filter(({ h }) => h.recruited)
              .slice(0, 8)
              .map(({ i }, at) => {
                const sx = 60 + at * 26;
                const sy = 96 - at * 1.35;
                return `<g fill="#0d0b12"><circle cx="${sx}" cy="${sy - 12}" r="5"/><rect x="${sx - 4.5}" y="${sy - 9}" width="9" height="14" rx="3.4"/><rect x="${sx - 4.5}" y="${sy - 7.5}" width="9" height="2.4" rx="1.2" fill="${HEROES[i].accent}" opacity="0.9"/></g>`;
              })
              .join("")}
          </svg>
        </div>
        <div class="chron-grid" style="max-width:560px">
          <div class="chron-cell"><span>Battles fought</span><strong>${lt.battles}</strong></div>
          <div class="chron-cell"><span>Foes slain</span><strong>${lt.kills}</strong></div>
          <div class="chron-cell"><span>Heroes fallen</span><strong>${lt.deaths}</strong></div>
          <div class="chron-cell"><span>Deeds done</span><strong>${done}/${DEEDS.length}</strong></div>
        </div>
        <div class="credit" style="font-size:14px;margin-top:8px">Every road ends. Every band walks on.<br/>Thank you for walking this one.</div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="finale-done">${ico("play")} The road goes on</button>
        </div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest('[data-act="finale-done"]')) {
        audio.play("levelup");
        this.goBack(() => this.renderMap());
      }
    });
    this.root.appendChild(page);
    audio.play("victory");
  }

  // ------------------------------------------------------------------ chronicle

  /** The band's whole story: lifetime numbers and the deeds they prove. */
  renderChronicle(): void {
    this.pushNav("chronicle");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const lt = save.lifetime;
    const done = DEEDS.filter((d) => d.done(save)).length;
    const found = new Set(save.inventory).size;
    const stats: [string, string][] = [
      ["Battles fought", String(lt.battles)],
      ["Victories", String(lt.victories)],
      ["Foes slain", String(lt.kills)],
      ["Techniques used", String(lt.casts)],
      ["Gold earned", String(lt.gold)],
      ["Heroes fallen", String(lt.deaths)],
      ["Flawless wins", String(lt.flawless)],
      ["Curios found", `${found}/${TRINKETS.length}`],
    ];
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Records</div>
            <div class="map-level">Deeds done: ${done}/${DEEDS.length} — the road remembers everything</div>
          </div>
        </div>
        <div class="place-banner place-records">
          <span class="place-mark">${ico("book")}</span>
          <span><em>The leather chronicle</em><strong>Every victory leaves a line; every discovery earns a page</strong></span>
        </div>
        <div class="shop-tabs"><button class="shop-tab on" data-rec="chronicle">${ico("chart")} Chronicle</button><button class="shop-tab" data-rec="bestiary">${ico("book")} Bestiary</button></div>
        <div class="chron-grid">
          ${stats.map(([k, v]) => `<div class="chron-cell"><span>${k}</span><strong>${v}</strong></div>`).join("")}
        </div>
        <div class="journal-entries">
          <div class="ability-row-title">Recent pages <span>the last ${Math.min(save.journal.length, 6)} victories</span></div>
          ${save.journal.length
            ? save.journal.slice(0, 6).map((entry) => `<article class="journal-entry">
                <span class="journal-date">${new Date(entry.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                <div><strong>${STAGES[entry.stage]?.name ?? "Unknown road"}</strong><em>${DIFFICULTIES[entry.difficulty]?.name ?? "Normal"} · ${Math.floor(entry.time / 60)}:${String(Math.floor(entry.time % 60)).padStart(2, "0")} · ${entry.deaths ? `${entry.deaths} fell` : "flawless"}</em></div>
                <span class="journal-party">${entry.party.map((index) => HEROES[index]?.name?.[0] ?? "?").join(" · ")}</span>
              </article>`).join("")
            : '<div class="empty-journal">The first victory will begin the band\'s written chronicle.</div>'}
        </div>
        <div class="deed-list">
          ${DEEDS.map((d) => {
            const is = d.done(save);
            const prog = !is && d.progress ? `<span class="deed-prog">${d.progress(save)}</span>` : "";
            return `<div class="deed-card ${is ? "done" : ""}">
              <span class="deed-mark">${is ? "✓" : "◇"}</span>
              <span class="deed-text"><strong>${d.name}</strong><em>${d.blurb}</em></span>
              ${prog}
            </div>`;
          }).join("")}
        </div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      const rec = (event.target as HTMLElement).closest("[data-rec]")?.getAttribute("data-rec");
      if (rec === "bestiary") {
        audio.play("click");
        this.renderBestiary();
        return;
      }
      if ((event.target as HTMLElement).closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderMap());
      }
    });
    this.mount(page, "records");
  }

  // ------------------------------------------------------------------ tutorials

  /** One-time fork for brand-new players: lessons first, or straight to the road. */
  renderFirstRun(): void {
    this.pushNav("first-run");
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page title-page">
        <div class="title-block first-mile-title">
          <div class="title-kicker">BEFORE THE FIRST MILE</div>
          <div class="game-logo" style="font-size:34px">THREE FIELD RULES</div>
          <div class="game-sub">Wayband is about giving a few clear orders, then reading what the battlefield says back.</div>
        </div>
        <div class="first-mile-rules">
          <article><span>01</span><i>↗</i><strong>Place the band</strong><p>Drag a hero to move or attack. Tap a portrait, then the field, for the same command.</p></article>
          <article><span>02</span><i>◇</i><strong>Read, then cast</strong><p>Tap instant techniques. Drag aimed techniques. Leave marked ground before it resolves.</p></article>
          <article><span>03</span><i>✦</i><strong>Shape a Path</strong><p>At level ${CALLING_UNLOCK_LEVEL}, a Discipline plus an Attunement becomes two techniques and one ultimate.</p></article>
        </div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="learn">Enter the practice ring <small>about two minutes</small></button>
          <button class="big-btn" data-act="skip">${ico("play")} Take me to the Long Road</button>
        </div>
        <div class="credit">Every lesson remains replayable in the Field Handbook.</div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      audio.unlock();
      audio.play("click");
      this.save.seenIntro = true;
      persist(this.save);
      if (act === "learn") this.callbacks.startTutorial("basics", "map");
      else {
        this.replaceNextNavigation = true;
        this.renderMap();
      }
    });
    this.root.appendChild(page);
  }

  renderTutorials(): void {
    this.pushNav("handbook");
    this.root.innerHTML = "";
    this.show();
    const lessons = [
      { kind: "basics", mark: "I", icon: "↗", name: "First Commands", time: "2 min", blurb: "Move, tap-order, attack, cast, heal, and change a stance." },
      { kind: "fieldcraft", mark: "II", icon: "◎", name: "Read the Field", time: "2 min", blurb: "Escape telegraphs, focus the band, read Waymarks, and break boss poise." },
      { kind: "gestures", mark: "III", icon: "⌁", name: "Aimed Techniques", time: "2 min", blurb: "Practice rays, blast circles, and trails while time bends around your aim." },
      { kind: "healing", mark: "IV", icon: "✚", name: "Healing & Stances", time: "2 min", blurb: "Channel healing, place Mend, and switch a healer between support and attack." },
    ];
    const complete = lessons.filter((lesson) => this.save.completedTutorials.includes(lesson.kind)).length;
    const page = el(`
      <div class="page handbook-page">
        <header class="handbook-mast">
          <button class="back-rune" data-act="back" aria-label="Back">‹</button>
          <div><span>THE WAYFINDER'S</span><h1>Field Handbook</h1><p>Commands, battle signs, and the systems behind the Long Road.</p></div>
          <div class="handbook-progress"><strong>${complete}/${lessons.length}</strong><em>field lessons</em></div>
        </header>
        <section class="command-ribbon" aria-label="Essential controls">
          <div><kbd>DRAG</kbd><span><b>Hero → ground</b>Move</span></div>
          <div><kbd>DRAG</kbd><span><b>Hero → foe</b>Attack</span></div>
          <div><kbd>2×</kbd><span><b>Double-tap foe</b>Focus band</span></div>
          <div><kbd>HOLD</kbd><span><b>Technique</b>Read details</span></div>
          <div><kbd>MARK</kbd><span><b>Marked ground</b>Move now</span></div>
        </section>
        <div class="handbook-section-title"><span>Practice ring</span><em>Replay any lesson · skip any time</em></div>
        <div class="lesson-list handbook-lessons"></div>
        <div class="handbook-section-title"><span>Rules of the road</span><em>Keep the important math close</em></div>
        <section class="system-primer">
          <article><i>✦</i><div><strong>Elemental Waymarks</strong><p>Normal foes take <b>+25%</b> from a weakness and <b>−15%</b> from a resistance. Boss values are +15% and −10%; nothing is immune.</p></div></article>
          <article><i>⌖</i><div><strong>Read the role</strong><p>Icons beside enemy health identify Vanguard, Tank, Hunter, Assassin, Artillery, Support, Controller, Disruptor, and Summoner roles. Gold icons mark the one or two priority foes.</p></div></article>
          <article><i>ϟ</i><div><strong>Build and react</strong><p>Elemental hits fill the thin condition bar. Flame, Frost, Storm, Earth, Venom, Radiant, Blood, and Shadow trigger readable conditions; counter-hits consume them for a bonus.</p></div></article>
          <article><i>◇</i><div><strong>One Path, three techniques</strong><p>A Discipline and Attunement grant two normal techniques plus one charge-based ultimate. Armor is passive unless a future legendary says otherwise.</p></div></article>
          <article><i>▰</i><div><strong>Boss language</strong><p>Marked ground warns of impact. The amber bar is poise: break it to stagger. Diamonds mark phase changes.</p></div></article>
          <article><i>≋</i><div><strong>Terrain matters</strong><p>Tides slow, storms strike, furnace vents erupt, roots seize, mirages silence, verdicts divide, hunts mark, and voids unmake. Scout chips name the rule before you embark.</p></div></article>
        </section>
        <button class="handbook-reference" data-lesson="village"><span>COMPANY REFERENCE</span><strong>Gear, recruits, Paths, talents &amp; keyboard</strong><b>Open ›</b></button>
      </div>
    `);
    const list = page.querySelector(".lesson-list")!;
    for (const lesson of lessons) {
      const card = el(`
        <button class="stage-card lesson-card" data-lesson="${lesson.kind}">
          <div class="lesson-mark"><span>${lesson.mark}</span><i>${lesson.icon}</i></div>
          <div class="stage-info">
            <div class="stage-name">${lesson.name}</div>
            <div class="stage-sub">${lesson.blurb}</div>
          </div>
          <div class="lesson-status ${this.save.completedTutorials.includes(lesson.kind) ? "done" : ""}"><span>${this.save.completedTutorials.includes(lesson.kind) ? "Practiced" : lesson.time}</span><b>${this.save.completedTutorials.includes(lesson.kind) ? "✓" : "▶"}</b></div>
        </button>
      `);
      list.appendChild(card);
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const lesson = target.closest("[data-lesson]");
      if (lesson) {
        audio.unlock();
        audio.play("click");
        const kind = lesson.getAttribute("data-lesson")!;
        if (kind === "village") this.renderVillageGuide();
        else this.callbacks.startTutorial(kind, "handbook");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        // Lessons briefly own a guarded battle-history entry. Navigate this
        // explicit Back control to its logical parent in one step even when an
        // embedded browser retains a duplicate lesson/handbook entry.
        this.navDepth = Math.max(1, this.navDepth - 1);
        this.replaceNextNavigation = true;
        if (this.handbookReturn === "map") this.renderMap();
        else if (this.handbookReturn === "settings") this.renderSettings();
        else this.renderTitle();
      }
    });
    this.root.appendChild(page);
  }

  renderVillageGuide(): void {
    this.pushNav("reference");
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Company Reference</div>
            <div class="map-level">Builds, battle rules, and the village</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Back</button>
        </div>
        <div class="guide-list">
          <div class="shop-note"><strong>${ico("coin")} Gold</strong> — every foe you slay and stage you clear pays gold. Even defeats salvage half the spoils.</div>
          <div class="shop-note"><strong>🍺 The Tavern</strong> — recruit new heroes to the band. Anyone hired can be rotated in or out of your fighting party of ${PARTY_CAP} on the Party screen.</div>
          <div class="shop-note"><strong>${ico("shield")} The Armory</strong> — weapons upgrade in tiers, but armor is a WARDROBE across THREE slots: body, helm, and boots. Every piece changes passive stats or combat traits; wear two or three pieces of one family and the SET answers with more. The Forge reworks any owned piece up to +3, and the great foes each guard a RELIC piece for whoever fells them first.</div>
          <div class="shop-note"><strong>${ico("spark")} The Technique Archive</strong> — a Path grants exactly two techniques and one ultimate. Retired arts no longer appear in the archive or battle bar.</div>
          <div class="shop-note"><strong>${ico("banner")} Paths</strong> — at level ${CALLING_UNLOCK_LEVEL}, pair one of five combat Disciplines with a Waymark Attunement. Practice an element for ${CALLING_MASTERY_LEVELS} levels to preserve its Elemental Legacy. At level ${ADV_CALLING_LEVEL}, a seasoned Path can take one of two Promotions.</div>
          <div class="shop-note"><strong>${ico("skull")} Bosses</strong> — the great foes hunt whoever HURTS them most. Pour damage in and a boss turns on you; your warrior holds its anger just by standing in its face, and taunts trump everything. Marked ground means MOVE.</div>
          <div class="shop-note"><strong>⌨ Keyboard</strong> — on a computer: 1–4 picks a hero, Q/W uses their two techniques, and R unleashes the ultimate. Aimed techniques follow the mouse; click casts, Esc cancels. Rebind in Settings.</div>
          <div class="shop-note"><strong>${ico("star")} Talents</strong> — every 2 band levels, each hero earns a talent point for the Strength, Dexterity, and Magic trees. Find them on the Party screen.</div>
        </div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderTutorials());
      }
    });
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ talents

  private talentTreeSel: TalentTree | null = null;

  renderTalents(index: number): void {
    this.pushNav("talents", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const budget = talentPointBudget(hero.level);
    const spent = talentPointsSpent(hero.talents);
    const free = budget - spent;
    const learnedKeystones = TALENTS.filter((talent) => talent.keystone && (hero.talents[talent.id] ?? 0) > 0);
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div class="equip-title">
            <div class="hero-avatar portrait" style="background:${def.accent}"><canvas width="64" height="64"></canvas></div>
            <div>
              <div class="map-title">${def.name}'s Talents</div>
              <div class="map-level">${free} point${free === 1 ? "" : "s"} to spend · one point each hero level after level 1</div>
            </div>
          </div>
        </div>
        <div class="shop-note talent-primer"><strong>Your build lives here.</strong> Random boons are gone. Every level now feeds a visible route toward triggers, reactions, and ◆ rule-changing capstones.</div>
        <section class="talent-loadout-strip">
          <div><span>Unspent</span><strong>${free}</strong><em>of ${budget} earned</em></div>
          <div><span>Rules learned</span><strong>${learnedKeystones.length ? learnedKeystones.map((talent) => talent.name).join(" · ") : "None yet"}</strong><em>${learnedKeystones.length ? "These effects are active in combat." : "First keystones open at level 8."}</em></div>
        </section>
        <div class="talent-trees"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="reset-talents">Reforge all points (free)</button>
        </div>
      </div>
    `);
    drawHeroPortrait(page.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, save);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "talents"));
    const trees = page.querySelector(".talent-trees")!;
    const allTreeKeys = Object.keys(TALENT_TREES) as TalentTree[];
    const discipline = hero.discipline ?? callingById(hero.calling)?.discipline ?? NATURAL_DISCIPLINE[bestAttr(index)];
    const coreTreeKeys = [...DISCIPLINE_TALENT_TREES[discipline]];
    const legacyTreeKeys = allTreeKeys.filter((key) => !coreTreeKeys.includes(key) && talentPointsInTree(hero.talents, key) > 0);
    const treeKeys = [...coreTreeKeys, ...legacyTreeKeys];
    if (!this.talentTreeSel || !treeKeys.includes(this.talentTreeSel)) this.talentTreeSel = treeKeys[0];
    const chips = el(`<div class="tree-chips"></div>`);
    for (const key of treeKeys) {
      const t = TALENT_TREES[key];
      const pts = talentPointsInTree(hero.talents, key);
      chips.appendChild(
        el(
          `<button class="tree-chip ${key === this.talentTreeSel ? "sel" : ""} ${legacyTreeKeys.includes(key) ? "legacy" : ""}" style="--tree:${t.color}" data-tree="${key}">${t.icon} ${t.name}${legacyTreeKeys.includes(key) ? " · legacy" : ""}${pts > 0 ? ` <span class="tree-spent">${pts}</span>` : ""}</button>`,
        ),
      );
    }
    trees.before(chips);
    const treeKey = this.talentTreeSel;
    {
      const tree = TALENT_TREES[treeKey];
      const inTree = talentPointsInTree(hero.talents, treeKey);
      const column = el(`
        <div class="talent-col wide" style="--tree:${tree.color}">
          <div class="talent-col-head"><span>${tree.icon} ${tree.name}</span><small>${inTree} invested</small><em>${TALENT_TREE_PROMISES[treeKey]}</em></div>
        </div>
      `);
      for (const tier of [1, 2, 3, 4, 5] as const) {
        const needLevel = TALENT_TIER_LEVELS[tier - 1];
        const levelOpen = hero.level >= needLevel;
        const row = el(`<div class="talent-tier ${levelOpen ? "open" : "level-locked"}"><div class="tier-rule ${levelOpen ? "open" : ""}"><span>ROW ${tier}</span><b>${levelOpen ? `LEVEL ${needLevel}` : `LOCKED · LEVEL ${needLevel}`}</b></div><div class="talent-tier-nodes"></div></div>`);
        const nodeLane = row.querySelector(".talent-tier-nodes")!;
        for (const talent of TALENTS.filter((t) => t.tree === treeKey && t.tier === tier)) {
          const rank = hero.talents[talent.id] ?? 0;
          const maxed = rank >= talent.maxRank;
          const prerequisite = talent.requires ? TALENTS.find((entry) => entry.id === talent.requires) : null;
          const prerequisiteMet = !talent.requires || (hero.talents[talent.requires] ?? 0) > 0;
          const open = rank > 0 || (levelOpen && prerequisiteMet);
          const pips =
            talent.maxRank > 1
              ? `<div class="talent-pips">${Array.from({ length: talent.maxRank }, (_, r) => `<i class="${r < rank ? "on" : ""}"></i>`).join("")}</div>`
              : `<div class="talent-pips key ${rank > 0 ? "on" : ""}">${rank > 0 ? "◆ learned" : "◆ keystone"}</div>`;
          nodeLane.appendChild(
            el(`
              <button class="talent-node ${talent.keystone ? "keystone" : ""} ${maxed ? "maxed" : ""} ${open && free > 0 && !maxed ? "can" : ""} ${open ? "" : "tier-locked"}" data-talent="${talent.id}" aria-label="${talent.name}, rank ${rank} of ${talent.maxRank}">
                <div class="talent-rank">${rank}/${talent.maxRank}</div>
                <div class="talent-kind">${talent.keystone ? "Rule-changer" : talent.maxRank > 1 ? "Ranked craft" : "Combat trigger"}</div>
                <div class="talent-name">${talent.keystone ? "◆ " : ""}${talent.name}</div>
                <div class="talent-blurb">${talent.blurb}${talent.maxRank > 1 ? " <em>/rank</em>" : ""}</div>
                ${prerequisite && !prerequisiteMet && rank === 0 ? `<div class="talent-requires">Requires ${prerequisite.name}</div>` : ""}
                ${pips}
              </button>
            `),
          );
        }
        column.appendChild(row);
      }
      trees.appendChild(column);
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const chip = target.closest("[data-tree]");
      if (chip) {
        this.talentTreeSel = chip.getAttribute("data-tree") as TalentTree;
        audio.play("click");
        this.renderTalents(index);
        return;
      }
      const node = target.closest("[data-talent]");
      if (node) {
        const id = node.getAttribute("data-talent")!;
        const talent = TALENTS.find((t) => t.id === id)!;
        const rank = hero.talents[id] ?? 0;
        const needLevel = TALENT_TIER_LEVELS[talent.tier - 1];
        if (rank === 0 && hero.level < needLevel) {
          this.showToast(`Locked — ${talent.name} opens at hero level ${needLevel}`);
          return;
        }
        if (rank === 0 && talent.requires && (hero.talents[talent.requires] ?? 0) === 0) {
          const prerequisite = TALENTS.find((entry) => entry.id === talent.requires)!;
          this.showToast(`Locked — learn ${prerequisite.name} first`);
          return;
        }
        if (rank >= talent.maxRank) {
          this.showToast(talent.keystone ? `${talent.name} is already learned` : `${talent.name} is already at max rank`);
          return;
        }
        if (talentPointBudget(hero.level) - talentPointsSpent(hero.talents) <= 0) {
          this.showToast("No talent points left — level up the band");
          return;
        }
        hero.talents[id] = rank + 1;
        persist(save);
        audio.play("levelup");
        this.renderTalents(index);
        return;
      }
      if (target.closest('[data-act="reset-talents"]')) {
        hero.talents = {};
        persist(save);
        audio.play("click");
        this.renderTalents(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderParty());
      }
    });
    this.mount(page, "party");
  }

  // ------------------------------------------------------------------ village shops

  renderShop(tab: "tavern" | "armory" | "smithy" | "spells" | "curios"): void {
    const tavern = tab === "tavern";
    this.pushNav(tavern ? "tavern" : "shop");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    // the Tavern is its own door on the bottom bar — the Village tab row stays wares-only
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">${tavern ? "The Tavern" : "The Village"}</div>
            <div class="map-level"><span class="gold-chip">${ico("coin")} <span class="gold-num">${save.gold}</span> gold</span></div>
          </div>
        </div>
        <div class="place-banner ${tavern ? "place-tavern" : "place-village"}">
          <span class="place-mark">${tavern ? "🍺" : ico("sword")}</span>
          <span><em>${tavern ? "Lanterns in the window" : "Hammers beyond the green"}</em><strong>${tavern ? "New hands, old stories, and a place by the fire" : "Outfit the band for the road ahead"}</strong></span>
        </div>
        ${
          tavern
            ? ""
            : `<div class="shop-tabs">
          <button class="shop-tab ${tab === "armory" ? "on" : ""}" data-tab="armory">${ico("shield")} Armory</button>
          <button class="shop-tab ${tab === "smithy" ? "on" : ""}" data-tab="smithy">${ico("sword")} Smithy</button>
          <button class="shop-tab ${tab === "curios" ? "on" : ""}" data-tab="curios">${ico("gem")} Curios</button>
        </div>`
        }
        <div class="shop-body"></div>
      </div>
    `);
    const body = page.querySelector(".shop-body")!;
    if (tab === "tavern") this.buildTavern(body);
    else if (tab === "armory") this.buildArmory(body);
    else if (tab === "smithy") this.buildSmithy(body);
    else if (tab === "curios") this.buildCabinet(body);
    else this.buildSpellShop(body);
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tabBtn = target.closest("[data-tab]");
      if (tabBtn) {
        audio.play("click");
        this.renderShop(tabBtn.getAttribute("data-tab") as "armory" | "smithy" | "curios");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderMap());
      }
    });
    this.mount(page, tavern ? "tavern" : "shop");
    this.tickGold(page);
  }

  /** One gesture from gold to dressed: pick the wearer right at the counter. */
  private askWhoWears(pieceId: string): void {
    const piece = armorById(pieceId)!;
    const slot = slotOf(piece);
    const wornOf = (h: (typeof this.save.heroes)[number]) => (slot === "body" ? h.armor : slot === "helm" ? h.helm : h.boots);
    const pop = el(`
      <div class="levelup-pop">
        <div class="levelup-card">
          <div class="levelup-title" style="font-size:20px">${piece.name}</div>
          <div class="levelup-line">Who wears it?</div>
          <div class="wear-row">
            ${this.save.heroes
              .map((h, i) => ({ h, i }))
              .filter(({ h }) => h.recruited)
              .map(({ h, i }) => `<button class="toggle-btn wear-opt" data-wear="${i}">${HEROES[i].name}${wornOf(h) ? "" : " ◇"}</button>`)
              .join("")}
          </div>
          <div class="levelup-actions"><button class="big-btn" data-wear="store">Just store it</button></div>
        </div>
      </div>
    `);
    pop.addEventListener("click", (event) => {
      const pick = (event.target as HTMLElement).closest("[data-wear]")?.getAttribute("data-wear");
      if (!pick) return;
      if (pick !== "store") {
        const h = this.save.heroes[Number(pick)];
        if (slot === "body") h.armor = pieceId;
        else if (slot === "helm") h.helm = pieceId;
        else h.boots = pieceId;
        persist(this.save);
        audio.play("clink");
        this.showToast(`${HEROES[Number(pick)].name} dons the ${piece.name}`);
      }
      pop.remove();
      this.renderShop("armory");
    });
    this.root.appendChild(pop);
  }

  /** The curio cabinet: every trinket in the realm, found or still out there. */
  private buildCabinet(body: Element): void {
    const save = this.save;
    const found = new Set(save.inventory);
    body.appendChild(
      el(`<div class="shop-note">${found.size}/${TRINKETS.length} curios found — victories drop them, bosses drop the rare ones. The Tinker's Bench fuses duplicates.</div>`),
    );
    for (const t of TRINKETS) {
      const owned = save.inventory.filter((x) => x === t.id).length;
      const wearers = HEROES.filter((_, i) => save.heroes[i].trinket === t.id).map((h) => h.name);
      const rare = t.rarity === "rare";
      body.appendChild(
        el(`
          <div class="curio-card ${owned ? "" : "unfound"} ${rare ? "rare" : ""}">
            <span class="curio-icon">${owned ? t.icon : "?"}</span>
            <span class="curio-text">
              <strong>${t.name}${rare ? ' <span class="rare-tag">RARE</span>' : ""}${owned > 1 ? ` <span class="curio-count">×${owned}</span>` : ""}</strong>
              <em>${owned ? t.blurb : "Not yet found."}</em>
              ${wearers.length ? `<em class="curio-worn">worn by ${wearers.join(" & ")}</em>` : ""}
            </span>
          </div>
        `),
      );
    }
  }

  private spend(cost: number): boolean {
    if (this.save.gold < cost) {
      audio.play("click");
      this.showToast(`Not enough gold — need ${cost}`);
      return false;
    }
    this.save.gold -= cost;
    persist(this.save);
    audio.play("coin");
    navigator.vibrate?.(12);
    return true;
  }

  private buildTavern(body: Element): void {
    const save = this.save;
    const availableContracts = CONTRACTS.filter((contract) => save.unlockedStage >= contract.unlockStage).length;
    body.appendChild(el(`
      <button class="notice-board" data-contract-board>
        <span class="notice-nail"></span>
        <span><em>THE NAIL &amp; NOTICE</em><strong>${availableContracts ? `${availableContracts} contract${availableContracts === 1 ? "" : "s"} available` : "No work posted yet"}</strong><small>Special terms · repeatable pay · first-clear gear</small></span>
        <b>Read notices ›</b>
      </button>
    `));
    if (save.unlockedStage >= ROAD_TUTELAGE_STAGE) {
      const activeLevels = partyRoster(save).map((index) => save.heroes[index].level);
      const veteranLevel = Math.max(1, ...activeLevels);
      const pupils = save.heroes
        .map((hero, index) => ({ hero, index }))
        .filter(({ hero }) => hero.recruited && !hero.active && hero.level < veteranLevel && hero.level < MAX_LEVEL);
      body.appendChild(el(`
        <div class="hero-card road-tutelage">
          <div class="hero-head">
            <div class="hero-avatar mystery-hero"><span>✦</span></div>
            <div>
              <div class="hero-name">Road Tutelage <em>Stories sharpen steel</em></div>
              <div class="hero-meta">After Stormbreak, an inactive companion can study with the veterans. Each lesson grants exactly one level and can never pass the active band.</div>
            </div>
          </div>
          <div class="tinker-rows">
            ${pupils.length
              ? pupils.map(({ hero, index }) => {
                  const cost = roadTutelageCost(hero.level);
                  return `<div class="tinker-row"><span class="tinker-item"><strong>${HEROES[index].name}</strong> · level ${hero.level} → ${hero.level + 1}</span><button class="big-btn buy-btn ${save.gold < cost ? "cant" : ""}" data-tutor="${index}">${ico("coin")} ${cost}</button></div>`;
                }).join("")
              : '<div class="shop-note">Every companion is keeping pace with the active band.</div>'}
          </div>
        </div>
      `));
    }
    for (let i = 0; i < HEROES.length; i++) {
      const def = HEROES[i];
      const hero = save.heroes[i];
      const cost = RECRUIT_COST[i];
      const arrived = heroArrived(save, i);
      const starterAbilities = (HERO_STARTER_ABILITIES[i] ?? []).map(abilityById).filter(Boolean);
      const starterNames = starterAbilities.map((ability) => ability.name).join(" and ");
      if (!arrived && !hero.recruited) {
        body.appendChild(
          el(`
            <div class="hero-card locked-hero">
              <div class="hero-head">
                <div class="hero-avatar portrait mystery-hero"><span>?</span></div>
                <div>
                  <div class="hero-name">An empty seat</div>
                  <div class="hero-meta">${i <= 5 ? "The tavern keep says a wanderer will come once the <strong>Thornwood ogre</strong> falls." : "They winter in the north — the road must reach the <strong>Winterreach</strong> first."}</div>
                </div>
              </div>
            </div>
          `),
        );
        continue;
      }
      const card = el(`
        <div class="hero-card ${hero.recruited ? "" : "locked-hero"}" style="--accent:${def.accent}">
          <div class="hero-head">
            <div class="hero-avatar portrait" style="background:${def.accent}${hero.recruited ? "" : ";opacity:.55"}">
              <canvas width="64" height="64"></canvas>
            </div>
            <div>
              <div class="hero-name">${def.name} <em>${def.title}</em></div>
              <div class="hero-meta">${hero.recruited ? "Already rides with the band." : `A wanderer for hire — ${ATTR_NAMES[bestAttr(i)]} comes naturally.`}</div>
              <div class="recruit-kit"><b>Arrives battle-ready</b><span>${starterNames}</span></div>
            </div>
            ${
              hero.recruited
                ? '<div class="hero-points">✓ hired</div>'
                : `<button class="big-btn buy-btn ${save.gold < cost ? "cant" : ""}" data-recruit="${i}">${ico("coin")} ${cost}</button>`
            }
          </div>
        </div>
      `);
      drawHeroPortrait(card.querySelector(".hero-avatar canvas") as HTMLCanvasElement, i, save);
      body.appendChild(card);
    }
    body.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-contract-board]")) {
        audio.play("page");
        this.renderContracts();
        return;
      }
      const tutor = (event.target as HTMLElement).closest("[data-tutor]");
      if (tutor) {
        const index = Number(tutor.getAttribute("data-tutor"));
        const hero = save.heroes[index];
        const veteranLevel = Math.max(1, ...partyRoster(save).map((active) => save.heroes[active].level));
        if (!hero?.recruited || hero.active || hero.level >= veteranLevel || hero.level >= MAX_LEVEL) {
          this.showToast("Only an inactive companion behind the active band can take a lesson.");
          return;
        }
        const cost = roadTutelageCost(hero.level);
        if (!this.spend(cost)) return;
        const needed = Math.max(1, xpForLevel(hero.level) - hero.xp);
        grantHeroXp(save, index, needed);
        persist(save);
        audio.play("levelup");
        navigator.vibrate?.([14, 28, 20]);
        this.showToast(`${HEROES[index].name} studies the road and reaches level ${hero.level}`);
        this.renderShop("tavern");
        return;
      }
      const btn = (event.target as HTMLElement).closest("[data-recruit]");
      if (!btn) return;
      const i = Number(btn.getAttribute("data-recruit"));
      const cost = RECRUIT_COST[i] ?? 0;
      if (!this.spend(cost)) return;
      audio.play("tankard");
      const recruit = this.save.heroes[i];
      const starters = (HERO_STARTER_ABILITIES[i] ?? []).filter((id) => !!abilityById(id)).slice(0, MAX_EQUIPPED);
      recruit.recruited = true;
      recruit.active = partyRoster(this.save).length < PARTY_CAP;
      if (!recruit.calling) recruit.equipped = starters;
      for (const id of starters) if (!this.save.unlockedSpells.includes(id)) this.save.unlockedSpells.push(id);
      persist(this.save);
      const kit = starters.map((id) => abilityById(id).name).join(" and ");
      this.showToast(`${HEROES[i].name} joins with ${kit} ready.`);
      this.renderShop("tavern");
    });
  }

  /** The Smithy: everything the hammer touches — weapons, the Forge, the Tinker's Bench. */
  private buildSmithy(body: Element): void {
    const save = this.save;
    for (let i = 0; i < HEROES.length; i++) {
      const hero = save.heroes[i];
      if (!hero.recruited) continue;
      const def = HEROES[i];
      const nextW = hero.weaponTier + 1 < WEAPON_TIERS.length ? WEAPON_TIERS[hero.weaponTier + 1] : null;
      const worn = armorById(hero.armor);
      const card = el(`
        <div class="hero-card" style="--accent:${def.accent}">
          <div class="hero-head">
            <div class="hero-avatar portrait" style="background:${def.accent}"><canvas width="64" height="64"></canvas></div>
            <div>
              <div class="hero-name">${def.name}</div>
              <div class="hero-meta">${WEAPON_TIERS[hero.weaponTier].name} weapon · ${worn ? pieceLabel(worn, save.forge) : "Traveler's Garb"}</div>
            </div>
          </div>
          <div class="gear-row">
            ${
              nextW
                ? `<button class="big-btn buy-btn" data-gear="w:${i}" ${save.gold < nextW.cost ? 'data-cant="1"' : ""}>${ico("sword")} ${nextW.name} (+${WEAPON_DAMAGE_BONUS[hero.weaponTier + 1] - WEAPON_DAMAGE_BONUS[hero.weaponTier]} dmg) — ${nextW.cost}g</button>`
                : `<div class="gear-max">${ico("sword")} Best weapon owned</div>`
            }
          </div>
        </div>
      `);
      drawHeroPortrait(card.querySelector(".hero-avatar canvas") as HTMLCanvasElement, i, save);
      body.appendChild(card);
    }
    this.buildForgeBench(body);
    this.buildTinkerBench(body);
    body.addEventListener("click", (event) => {
      const forgeBtn = (event.target as HTMLElement).closest("[data-forge]");
      if (forgeBtn) {
        const id = forgeBtn.getAttribute("data-forge")!;
        const piece = armorById(id)!;
        const lvl = save.forge[id] ?? 0;
        if (lvl >= FORGE_MAX) return;
        if (!this.spend(forgeCost(piece, lvl + 1))) return;
        save.forge[id] = lvl + 1;
        persist(save);
        audio.play("anvil");
        if (lvl + 1 >= FORGE_MAX) audio.play("levelup");
        navigator.vibrate?.([12, 20, 30]);
        // hammer sparks fly from the button that was struck
        const rect = (forgeBtn as HTMLElement).getBoundingClientRect();
        const sparks = el(`<div class="forge-sparks ${lvl + 1 >= FORGE_MAX ? "master" : ""}" style="left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px"></div>`);
        for (let i = 0; i < 7; i++) {
          const s = document.createElement("i");
          s.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
          s.style.setProperty("--dy", `${-30 - Math.random() * 60}px`);
          s.style.animationDelay = `${Math.random() * 0.08}s`;
          sparks.appendChild(s);
        }
        document.body.appendChild(sparks);
        setTimeout(() => sparks.remove(), 800);
        this.showToast(`${piece.name} reforged to +${lvl + 1}${lvl + 1 >= FORGE_MAX ? " — masterwork!" : ""}`);
        this.renderShop("smithy");
        return;
      }
      const fuseBtn = (event.target as HTMLElement).closest("[data-fuse]");
      if (fuseBtn) {
        const id = fuseBtn.getAttribute("data-fuse")!;
        const t = trinketById(id)!;
        const remove = (times: number) => {
          for (let k = 0; k < times; k++) {
            const at = save.inventory.indexOf(id);
            if (at >= 0) save.inventory.splice(at, 1);
          }
        };
        if (t.rarity === "rare") {
          remove(1);
          save.gold += 120;
          audio.play("coin");
          this.showToast(`Sold the spare ${t.name} — +120 gold`);
        } else {
          remove(2);
          const rares = TRINKETS.filter((r) => r.rarity === "rare");
          const forged = rares[Math.floor(Math.random() * rares.length)];
          save.inventory.push(forged.id);
          save.lifetime.fuses += 1;
          audio.play("levelup");
          navigator.vibrate?.([15, 25, 40]);
          this.showToast(`The tinker forges ${forged.icon} ${forged.name} — RARE!`);
        }
        persist(save);
        this.renderShop("smithy");
        return;
      }
      const btn = (event.target as HTMLElement).closest("[data-gear]");
      if (!btn) return;
      const [, idx] = btn.getAttribute("data-gear")!.split(":");
      const i = Number(idx);
      const hero = save.heroes[i];
      const tier = hero.weaponTier + 1;
      if (!this.spend(WEAPON_TIERS[tier].cost)) return;
      hero.weaponTier = tier;
      persist(save);
      this.showToast(`${HEROES[i].name} equips a ${WEAPON_TIERS[tier].name} weapon!`);
      this.renderShop("smithy");
    });
  }

  /** The forge card: upgrades bind to the piece and sharpen everything it gives. */
  private buildForgeBench(body: Element): void {
    const save = this.save;
    const ownedPieces = [...new Set(save.armory)].map((id) => armorById(id)).filter((p): p is ArmorDef => !!p);
    if (!ownedPieces.length) {
      body.appendChild(el(`<div class="shop-note">The Forge waits for armor worth reworking — buy pieces at the Armory first.</div>`));
      return;
    }
    const forge = el(`
      <div class="hero-card tinker-bench">
        <div class="hero-name">The Forge</div>
        <div class="hero-meta">The smith can rework any owned piece up to +${FORGE_MAX} — every bonus it gives grows a quarter stronger per mark.</div>
        <div class="tinker-rows"></div>
      </div>
    `);
    const rows = forge.querySelector(".tinker-rows")!;
    for (const piece of ownedPieces) {
      const lvl = save.forge[piece.id] ?? 0;
      const pips = "●".repeat(lvl) + "○".repeat(FORGE_MAX - lvl);
      const next = lvl < FORGE_MAX ? forgeCost(piece, lvl + 1) : 0;
      rows.appendChild(
        el(`
          <div class="tinker-row">
            <span class="tinker-item">${ico(piece.icon)} ${pieceLabel(piece, save.forge)} <span class="forge-pips">${pips}</span></span>
            ${
              lvl < FORGE_MAX
                ? `<button class="big-btn buy-btn ${save.gold < next ? "cant" : ""}" data-forge="${piece.id}">Forge +${lvl + 1} — ${next}g</button>`
                : '<span class="gear-max">Masterwork</span>'
            }
          </div>
        `),
      );
    }
    body.appendChild(forge);
  }

  /** Tinker's bench: duplicate trinkets aren't dead weight — fuse or sell them. */
  private buildTinkerBench(body: Element): void {
    const save = this.save;
    const counts = new Map<string, number>();
    for (const id of save.inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n >= 2);
    if (!dupes.length) return;
    const bench = el(`
      <div class="hero-card tinker-bench">
        <div class="hero-name">Tinker's Bench</div>
        <div class="hero-meta">Two copies of the same trinket can be reworked.</div>
        <div class="tinker-rows"></div>
      </div>
    `);
    const rows = bench.querySelector(".tinker-rows")!;
    for (const [id, n] of dupes) {
      const t = trinketById(id)!;
      const rare = t.rarity === "rare";
      rows.appendChild(
        el(`
          <div class="tinker-row">
            <span class="tinker-item">${t.icon} ${t.name} ×${n}</span>
            <button class="big-btn buy-btn" data-fuse="${id}">
              ${rare ? "Sell spare — +120g" : "Fuse 2 → random RARE"}
            </button>
          </div>
        `),
      );
    }
    body.appendChild(bench);
  }

  private buildArmory(body: Element): void {
    const save = this.save;
    // the armorer's rack: named pieces, each a decision — now in three fittings
    const rack = el(`
      <div class="hero-card">
        <div class="hero-name">The Armorer's Rack</div>
        <div class="hero-meta">Every piece has its own passive character. Match body armor, helm, and boots to complete a family set. Buy a copy, then dress a hero on their Gear screen.</div>
        <div class="armor-rack"></div>
      </div>
    `);
    const rackList = rack.querySelector(".armor-rack")!;
    const wornBy = (piece: ArmorDef) =>
      HEROES.filter((_, hi) => {
        const h = save.heroes[hi];
        const s = slotOf(piece);
        return (s === "body" ? h.armor : s === "helm" ? h.helm : h.boots) === piece.id;
      }).map((h) => h.name);
    const rackSections: [string, ArmorDef[]][] = [
      ["Body", ARMORS],
      ["Helms", HELMS],
      ["Boots", BOOTS],
    ];
    for (const [label, catalog] of rackSections) {
      rackList.appendChild(el(`<div class="spell-section">${label}</div>`));
      for (const piece of catalog) {
        const owned = save.armory.filter((x) => x === piece.id).length;
        if (piece.cost === 0 && owned === 0) {
          rackList.appendChild(
            el(`<div class="curio-card unfound"><span class="curio-icon">?</span><span class="curio-text"><strong>A great foe's relic</strong><em>Fell one of the road's masters for the first time to claim it.</em></span></div>`),
          );
          continue;
        }
        const wearers = wornBy(piece);
        rackList.appendChild(
          el(`
            <div class="curio-card ${piece.boss ? "rare" : ""}">
              <span class="curio-icon">${ico(piece.icon)}</span>
              <span class="curio-text">
                <strong>${pieceLabel(piece, save.forge)} <span class="armor-fam">${piece.family}</span>${owned > 1 ? ` <span class="curio-count">×${owned}</span>` : ""}</strong>
                <em>${piece.blurb}</em>
                ${wearers.length ? `<em class="curio-worn">worn by ${wearers.join(" & ")}</em>` : owned ? `<em class="curio-worn">in the armory, unworn</em>` : ""}
              </span>
              ${owned > wearers.length ? `<button class="big-btn buy-btn" data-dress="${piece.id}">Dress…</button>` : ""}
              ${
                piece.cost > 0
                  ? `<button class="big-btn buy-btn ${save.gold < piece.cost ? "cant" : ""}" data-armorbuy="${piece.id}">${ico("coin")} ${piece.cost}</button>`
                  : '<span class="rare-tag">RELIC</span>'
              }
            </div>
          `),
        );
      }
    }
    body.appendChild(rack);
    body.appendChild(el(`<div class="shop-note">Weapon upgrades, the Forge, and the Tinker's Bench live at the <button class="linklike" data-goto-smithy>Smithy →</button></div>`));

    body.addEventListener("click", (event) => {
      const buyBtn = (event.target as HTMLElement).closest("[data-armorbuy]");
      if (buyBtn) {
        const id = buyBtn.getAttribute("data-armorbuy")!;
        const piece = armorById(id)!;
        if (!this.spend(piece.cost)) return;
        audio.play("clink");
        save.armory.push(id);
        persist(save);
        this.askWhoWears(piece.id);
        return;
      }
      // an owned, unworn piece can be dressed straight from the rack
      const dressBtn = (event.target as HTMLElement).closest("[data-dress]");
      if (dressBtn) {
        audio.play("click");
        this.askWhoWears(dressBtn.getAttribute("data-dress")!);
        return;
      }
      if ((event.target as HTMLElement).closest("[data-goto-smithy]")) {
        audio.play("page");
        this.renderShop("smithy");
      }
    });
  }

  private buildSpellShop(body: Element): void {
    const save = this.save;
    const archive = ABILITIES.filter((ability) => !ability.retired && !ability.pathSkill);
    body.appendChild(
      el(`<div class="shop-note">Path techniques are learned automatically and never bought. This archive only holds independent techniques the band may discover later.</div>`),
    );
    if (!archive.length) {
      body.appendChild(el(`<div class="picker-empty">The archive shelves are quiet. Choose or change a hero's techniques from their Path.</div>`));
      return;
    }
    // filter rail: thirty spells is a long shelf without one
    const owned = archive.filter((a) => save.unlockedSpells.includes(a.id)).length;
    body.appendChild(
      el(`
        <div class="shop-filters">
          <button class="filter-chip ${this.shopAttr === "all" ? "on" : ""}" data-filter="all">All</button>
          ${ATTR_KEYS.map(
            (k) => `<button class="filter-chip ${this.shopAttr === k ? "on" : ""}" data-filter="${k}">${ATTR_NAMES[k]}</button>`,
          ).join("")}
          <button class="filter-chip owned-chip ${this.shopHideOwned ? "on" : ""}" data-filter="hide-owned">Hide owned · ${owned}/${archive.length}</button>
        </div>
      `),
    );
    // shelved by attribute, cheapest gate first
    const shelf = [...archive]
      .sort((a, b) => ATTR_KEYS.indexOf(a.gate.attr) - ATTR_KEYS.indexOf(b.gate.attr) || a.gate.value - b.gate.value)
      .filter((a) => (this.shopAttr === "all" || a.gate.attr === this.shopAttr) && !(this.shopHideOwned && save.unlockedSpells.includes(a.id)));
    if (!shelf.length) {
      body.appendChild(el(`<div class="shop-note">Nothing left on this shelf — the band owns it all.</div>`));
    }
    for (const ability of shelf) {
      const owned = save.unlockedSpells.includes(ability.id);
      const cost = SPELL_COSTS[ability.id] ?? 100;
      const card = el(`
        <div class="ability-chip shop-spell ${owned ? "equipped" : ""}" style="--chip:${ability.color}">
          <div class="shop-spell-head">
            <span class="spell-ico"></span>
            <div class="chip-name">${ability.name}</div>
          </div>
          <div class="chip-gate">${ability.blurb}</div>
          <div class="chip-req">Requires ${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}</div>
          ${owned ? '<div class="chip-owned">✓ unlocked</div>' : `<button class="big-btn buy-btn ${save.gold < cost ? "cant" : ""}" data-spell="${ability.id}">${ico("coin")} ${cost}</button>`}
        </div>
      `);
      const holder = card.querySelector(".spell-ico")!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      canvas.style.width = canvas.style.height = "32px";
      const cctx = canvas.getContext("2d")!;
      cctx.scale(2, 2);
      drawAbilityGlyph(cctx, ability.icon, 16, 16, 9.5, ability.color);
      holder.appendChild(canvas);
      body.appendChild(card);
    }
    body.addEventListener("click", (event) => {
      const filter = (event.target as HTMLElement).closest("[data-filter]");
      if (filter) {
        const f = filter.getAttribute("data-filter")!;
        if (f === "hide-owned") this.shopHideOwned = !this.shopHideOwned;
        else this.shopAttr = f as AttrKey | "all";
        audio.play("click");
        this.renderShop("spells");
        return;
      }
      const btn = (event.target as HTMLElement).closest("[data-spell]");
      if (!btn) return;
      const id = btn.getAttribute("data-spell")!;
      if (!this.spend(SPELL_COSTS[id] ?? 100)) return;
      audio.play("page");
      save.unlockedSpells.push(id);
      persist(save);
      this.showToast(`${ABILITIES.find((a) => a.id === id)?.name} unlocked — assign it on the Party screen`);
      this.renderShop("spells");
    });
  }

  // ------------------------------------------------------------------ hero hub

  /** Tab rail every hero screen shares: one hero, four facets, plus ‹ › to walk the roster. */
  private heroTabs(index: number, active: "overview" | "gear" | "spells" | "talents" | "calling"): HTMLElement {
    const save = this.save;
    const canCall = !!save.heroes[index].calling || save.heroes[index].level >= CALLING_UNLOCK_LEVEL;
    const roster = save.heroes.map((h, i) => ({ h, i })).filter(({ h }) => h.recruited).map(({ i }) => i);
    const strip = el(`
      <div class="shop-tabs hero-tabs">
        <button class="hero-step" data-hstep="-1" title="previous hero">‹</button>
        <button class="shop-tab ${active === "overview" ? "on" : ""}" data-htab="overview" ${active === "overview" ? 'aria-current="page"' : ""}>${ico("banner")} Overview</button>
        <button class="shop-tab ${active === "gear" ? "on" : ""}" data-htab="gear" ${active === "gear" ? 'aria-current="page"' : ""}>${ico("shield")} Gear</button>
        <button class="shop-tab ${active === "spells" ? "on" : ""}" data-htab="spells" ${active === "spells" ? 'aria-current="page"' : ""}>${ico("spark")} Techniques</button>
        <button class="shop-tab ${active === "talents" ? "on" : ""}" data-htab="talents" ${active === "talents" ? 'aria-current="page"' : ""}>${ico("star")} Talents</button>
        <button class="shop-tab ${active === "calling" ? "on" : ""}" data-htab="calling" ${active === "calling" ? 'aria-current="page"' : ""} ${canCall ? "" : "disabled"}>${ico("sword")} Path</button>
        <button class="hero-step" data-hstep="1" title="next hero">›</button>
      </div>
    `);
    const open = (i: number, tab: string) => {
      if (tab === "overview") this.renderHeroOverview(i);
      else if (tab === "gear") this.renderEquipment(i);
      else if (tab === "spells") this.renderSpells(i);
      else if (tab === "talents") this.renderTalents(i);
      else if (this.save.heroes[i].calling || this.save.heroes[i].level >= CALLING_UNLOCK_LEVEL) this.renderCalling(i);
      else this.renderHeroOverview(i);
    };
    strip.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const step = target.closest("[data-hstep]");
      if (step && roster.length > 1) {
        const at = roster.indexOf(index);
        const next = roster[(at + Number(step.getAttribute("data-hstep")) + roster.length) % roster.length];
        audio.play("click");
        open(next, active);
        return;
      }
      const tab = target.closest("[data-htab]");
      if (!tab || tab.hasAttribute("disabled")) return;
      const kind = tab.getAttribute("data-htab")!;
      if (kind === active) return;
      audio.play("click");
      open(index, kind);
    });
    return strip;
  }

  /** The hero's front page: the full stat/attribute card under the hub tabs. */
  renderHeroOverview(index: number): void {
    this.pushNav("hero", index);
    this.root.innerHTML = "";
    this.show();
    const def = HEROES[index];
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div class="equip-title">
            <div class="hero-avatar portrait" style="background:${def.accent}"><canvas width="64" height="64"></canvas></div>
            <div>
              <div class="map-title">${def.name} <em class="sheet-title">${def.title}</em></div>
              <div class="map-level"><span class="gold-chip">${ico("coin")} ${this.save.gold}</span></div>
            </div>
          </div>
        </div>
        <div class="hero-list single"></div>
      </div>
    `);
    drawHeroPortrait(page.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, this.save);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "overview"));
    page.querySelector(".hero-list")!.appendChild(this.heroCard(index, true));
    page.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderParty());
      }
    });
    this.mount(page, "party");
  }

  // ------------------------------------------------------------------ party

  renderParty(): void {
    this.pushNav("party");
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Band</div>
            <div class="map-level">Tap a portrait to manage a hero · four take the field</div>
          </div>
        </div>
        <div class="place-banner place-camp">
          <span class="place-mark">${ico("flame")}</span>
          <span><em>Tonight's camp</em><strong>${this.save.heroes.filter((hero) => hero.recruited && hero.active).length}/${PARTY_CAP} ready to take the field</strong></span>
        </div>
        <div class="preset-row">
          <span class="preset-label">${ico("banner")} Band presets</span>
          ${[0, 1]
            .map(
              (i) => `<span class="preset-slot">
                <em>${this.save.presets[i] ? `Preset ${i + 1}` : "empty"}</em>
                <button class="toggle-btn preset-btn" data-preset-save="${i}">Save</button>
                <button class="toggle-btn preset-btn" data-preset-load="${i}" ${this.save.presets[i] ? "" : "disabled"}>Load</button>
              </span>`,
            )
            .join("")}
        </div>
        <div class="hero-list"></div>
      </div>
    `);
    const list = page.querySelector(".hero-list")!;
    const strip = el(`<div class="portrait-strip"></div>`);
    const recruited: number[] = [];
    for (let i = 0; i < HEROES.length; i++) if (this.save.heroes[i].recruited) recruited.push(i);
    if (!recruited.includes(this.partySel)) this.partySel = recruited[0] ?? 0;
    for (const i of recruited) {
      const h = this.save.heroes[i];
      const chip = el(`
        <button class="p-chip ${i === this.partySel ? "sel" : ""} ${h.active ? "in" : ""}" data-psel="${i}" style="--accent:${HEROES[i].accent}" title="${HEROES[i].name} · ${buildIdentity(this.save, i)}">
          <canvas width="64" height="64"></canvas>
          <span class="p-name">${HEROES[i].name}</span>
          ${h.active ? `<span class="p-flag">${ico("banner")}</span>` : ""}
          ${this.save.unspent[i] > 0 ? `<span class="badge">${this.save.unspent[i]}</span>` : ""}
        </button>
      `);
      drawHeroPortrait(chip.querySelector("canvas") as HTMLCanvasElement, i, this.save);
      strip.appendChild(chip);
    }
    for (let i = 0; i < HEROES.length; i++) {
      if (this.save.heroes[i].recruited) continue;
      const arrived = heroArrived(this.save, i);
      const chip = el(`
        <button class="p-chip locked" data-lockedhero="${i}" style="--accent:${HEROES[i].accent}">
          <canvas width="64" height="64"></canvas>
          <span class="p-name">${arrived ? HEROES[i].name : "···"}</span>
          <span class="p-lock">🔒</span>
        </button>
      `);
      if (arrived) drawHeroPortrait(chip.querySelector("canvas") as HTMLCanvasElement, i, this.save);
      strip.appendChild(chip);
    }
    const rollcall = el(`<div class="camp-rollcall"><div class="camp-ember" aria-hidden="true">✦</div></div>`);
    rollcall.appendChild(strip);
    page.querySelector(".preset-row")!.before(rollcall);
    list.appendChild(this.heroCard(this.partySel, true));
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const saveBtn = target.closest("[data-preset-save]");
      if (saveBtn) {
        const at = Number(saveBtn.getAttribute("data-preset-save"));
        this.save.presets[at] = {
          name: `Preset ${at + 1}`,
          loadout: this.save.heroes.map((h) => ({ equipped: [...h.equipped], trinket: h.trinket, active: h.active })),
        };
        persist(this.save);
        audio.play("click");
        this.showToast(`Preset ${at + 1} saved — the band's current shape, remembered`);
        this.renderParty();
        return;
      }
      const loadBtn = target.closest("[data-preset-load]");
      if (loadBtn && !loadBtn.hasAttribute("disabled")) {
        const at = Number(loadBtn.getAttribute("data-preset-load"));
        const preset = this.save.presets[at];
        if (!preset) return;
        this.save.heroes.forEach((h, i) => {
          const p = preset.loadout[i];
          if (!p) return;
          // A preset may reorder this Path's techniques, but never restores retired abilities.
          const pathIds = heroPathAbilities(h).map((ability) => ability.id);
          const remembered = p.equipped.filter((id) => pathIds.includes(id));
          h.equipped = [...remembered, ...pathIds.filter((id) => !remembered.includes(id))].slice(0, MAX_EQUIPPED);
          h.trinket = p.trinket && this.save.inventory.includes(p.trinket) ? p.trinket : null;
          if (h.recruited) h.active = p.active;
        });
        // party discipline: never over the cap, never empty
        const actives = this.save.heroes.map((h, i) => ({ h, i })).filter(({ h }) => h.recruited && h.active);
        actives.slice(PARTY_CAP).forEach(({ h }) => (h.active = false));
        if (!actives.length) {
          const first = this.save.heroes.find((h) => h.recruited);
          if (first) first.active = true;
        }
        persist(this.save);
        audio.play("levelup");
        this.showToast(`Preset ${at + 1} takes the field`);
        this.renderParty();
        return;
      }
      const psel = target.closest("[data-psel]");
      if (psel) {
        audio.play("click");
        this.partySel = Number(psel.getAttribute("data-psel"));
        this.renderParty();
        return;
      }
      const lockedHero = target.closest("[data-lockedhero]");
      if (lockedHero) {
        const li = Number(lockedHero.getAttribute("data-lockedhero"));
        this.showToast(
          heroArrived(this.save, li)
            ? `${HEROES[li].name} waits in the Tavern — ${RECRUIT_COST[li] ?? "?"} gold to hire`
            : li <= 5
              ? "Word of the band must spread — fell the Thornwood ogre first"
              : "They winter in the north — the road must reach the Winterreach first",
        );
        return;
      }
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (act === "back") {
        audio.play("click");
        this.goBack(() => this.renderMap());
      }
    });
    this.mount(page, "party");
  }

  private heroCard(index: number, full = false): HTMLElement {
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const sworn = callingById(hero.calling);
    const oathHolds = sworn ? callingEligible(sworn, hero.attrs) : false;
    const advInfo = oathHolds ? advCallingById(hero.advCalling) : null;
    const stats = deriveStats(
      hero.attrs,
      hero.weaponTier,
      heroGearOf(hero, save.forge),
      hero.talents,
      hero.trinket,
      oathHolds ? hero.calling : null,
      oathHolds ? hero.advCalling : null,
      hero.masteredElements,
    );
    const weapon = dominantWeapon(hero.attrs, oathHolds ? hero.calling : null);
    const unlocked = unlockedAbilities(hero.attrs).map((a) => a.id);
    const inParty = hero.active;
    const partySize = partyRoster(save).length;

    const trinket = trinketById(hero.trinket);
    const card = el(`
      <div class="hero-card ${inParty ? "" : "benched"}" style="--accent:${def.accent}">
        <div class="hero-head">
          <div class="hero-avatar portrait" style="background:${def.accent}">
            <canvas width="64" height="64"></canvas>
          </div>
          <div>
            <div class="hero-name">${def.name} <em>${advInfo ? advInfo.adv.epithet : sworn ? sworn.epithet : def.title}</em></div>
            <div class="hero-meta">${
              sworn
                ? oathHolds
                  ? `<span class="calling-tag" style="color:${sworn.color}">${advInfo ? advInfo.adv.name : sworn.name}</span> · `
                  : `<span class="calling-tag dormant">${sworn.name} — inactive</span> · `
                : ""
            }<span class="build-identity">${buildIdentity(save, index)}</span> · <span class="hero-lv">Lv ${hero.level}</span> · ${WEAPON_LABEL[weapon]} · ${WEAPON_TIERS[hero.weaponTier].name} / ${armorById(hero.armor)?.name ?? "Traveler's Garb"}</div>
            <div class="xp-bar hero-xp"><div class="xp-fill" style="width:${Math.min(100, Math.round((hero.xp / xpForLevel(hero.level)) * 100))}%"></div></div>
          </div>
          <button class="toggle-btn party-toggle ${inParty ? "in" : ""}" data-act="toggle-party">
            ${inParty ? `${ico("banner")} In party` : `${ico("moon")} Benched`}
          </button>
          <button class="hero-points ${save.unspent[index] > 0 ? "has" : ""}" data-act="open-hub">${save.unspent[index]} pts</button>
        </div>
        ${full ? `<div class="stat-grid">
          <div data-stat="Health"><span>Health</span><strong>${stats.maxHp}</strong></div>
          <div data-stat="Damage"><span>Damage</span><strong>${Math.round(stats.damage)}</strong></div>
          <div data-stat="Atk speed"><span>Atk speed</span><strong>${(1 / stats.attackCooldown).toFixed(2)}/s</strong></div>
          <div data-stat="Armor"><span>Armor</span><strong>${Math.round(stats.armor * 100)}%</strong></div>
          <div data-stat="Range"><span>Range</span><strong>${stats.range > 90 ? "Ranged" : "Melee"}</strong></div>
          <div data-stat="Move"><span>Move</span><strong>${Math.round(stats.speed)}</strong></div>
          <div data-stat="Healing"><span>Healing</span><strong>${stats.healPower.toFixed(1)}/s</strong></div>
              <div data-stat="Technique power"><span>Technique power</span><strong>×${stats.spellPower.toFixed(2)}</strong></div>
        </div>
        <div class="stat-hint">tap any stat to see what it does</div>` : ""}
        <button class="trinket-row equip-row loadout-row" data-act="equip">
          <span class="loadout-slots"></span>
          <span class="loadout-text"><strong>Gear &amp; Techniques</strong><em>${WEAPON_TIERS[hero.weaponTier].name} · ${armorById(hero.armor)?.name ?? "Traveler's Garb"}${trinket ? ` · ${trinket.name}` : ""} — tap to change</em></span>
          <span class="loadout-go">${ico("arrow")}</span>
        </button>
        ${full ? '<div class="attr-rows"></div>' : ""}
        <div class="card-actions">
          ${save.unspent[index] > 0 ? `<button class="toggle-btn suggest-btn" data-act="suggest">${ico("spark")} Suggest</button>` : ""}
          <button class="toggle-btn talents-btn" data-act="talents">${ico("star")} Talents</button>
          <button class="toggle-btn calling-btn ${!sworn && hero.level >= CALLING_UNLOCK_LEVEL ? "beckons" : ""}"
            data-act="calling" ${!sworn && hero.level < CALLING_UNLOCK_LEVEL ? "disabled" : ""}
            ${sworn ? (oathHolds ? `style="border-color:${sworn.color};color:${sworn.color}"` : 'style="border-color:#ff9a85;color:#ff9a85"') : ""}>
            ${
              sworn
                ? `${ico(sworn.crest)} ${advInfo ? advInfo.adv.name : sworn.name}${oathHolds ? "" : " (inactive)"}`
                : hero.level >= CALLING_UNLOCK_LEVEL
                  ? "Choose a Path"
                  : `Path at level ${CALLING_UNLOCK_LEVEL}`
            }
          </button>
          <button class="toggle-btn respec" data-act="respec">Respec (free)</button>
        </div>
      </div>
    `);
    drawHeroPortrait(card.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, save);
    // the portrait (and the points badge) opens the hero's hub page
    const avatar = card.querySelector(".hero-avatar") as HTMLElement;
    avatar.style.cursor = "pointer";
    avatar.addEventListener("click", () => {
      audio.play("click");
      this.renderHeroOverview(index);
    });
    card.querySelector('[data-act="open-hub"]')?.addEventListener("click", () => {
      audio.play("click");
      this.renderHeroOverview(index);
    });
    const slotStrip = card.querySelector(".loadout-slots")!;
    for (let s = 0; s < MAX_EQUIPPED; s++) slotStrip.appendChild(spellSlotEl(hero.equipped[s] ?? null, 22));
    card.querySelector(".stat-grid")?.addEventListener("click", (event) => {
      const cell = (event.target as HTMLElement).closest("[data-stat]");
      if (!cell) return;
      const key = cell.getAttribute("data-stat")!;
      audio.play("click");
      this.showToast(`${key} — ${STAT_BLURBS[key]}`);
    });
    card.querySelector('[data-act="equip"]')!.addEventListener("click", () => {
      audio.play("click");
      this.renderEquipment(index);
    });

    card.querySelector('[data-act="toggle-party"]')!.addEventListener("click", () => {
      if (inParty && partySize <= 1) {
        this.showToast("At least one hero must stay in the party");
        return;
      }
      if (!inParty && partySize >= PARTY_CAP) {
        this.showToast(`Party is full (${PARTY_CAP}) — bench someone first`);
        return;
      }
      hero.active = !hero.active;
      persist(save);
      audio.play("click");
      this.renderParty();
    });

    const attrRows = card.querySelector(".attr-rows");
    if (attrRows) for (const key of ATTR_KEYS) {
      // Attributes shape every Path; techniques come from Discipline + Attunement.
      const row = el(`
        <div class="attr-row">
          <div class="attr-name">
            ${ATTR_NAMES[key]}
            <div class="attr-sub">${ATTR_BLURBS[key]}</div>
          </div>
          <div class="attr-bar"><div style="width:${Math.min(100, hero.attrs[key] * 5)}%"></div></div>
          <div class="attr-val">${hero.attrs[key]}</div>
          <button class="attr-plus" ${save.unspent[index] > 0 ? "" : "disabled"} data-attr="${key}">+</button>
        </div>
      `);
      attrRows.appendChild(row);
    }
    attrRows?.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-attr]") as HTMLElement | null;
      if (!btn || save.unspent[index] <= 0) return;
      const key = btn.getAttribute("data-attr") as (typeof ATTR_KEYS)[number];
      const effCalling = () => {
        const c = callingById(hero.calling);
        return c && callingEligible(c, hero.attrs) ? hero.calling : null;
      };
      const effAdv = () => (effCalling() ? hero.advCalling : null);
      const statsBefore = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effCalling(), effAdv(), hero.masteredElements);
      hero.attrs[key] += 1;
      save.unspent[index] -= 1;
      const before = unlocked.length;
      const after = unlockedAbilities(hero.attrs);
      if (after.length > before) {
        const fresh = after[after.length - 1];
        const owned = save.unlockedSpells.includes(fresh.id);
        if (owned && hero.equipped.length < MAX_EQUIPPED && !hero.equipped.includes(fresh.id)) {
          hero.equipped.push(fresh.id);
        }
        audio.play("levelup");
        this.showToast(
          owned
            ? `${def.name} can now use ${fresh.name}!`
            : `${def.name} meets the bar for ${fresh.name} — unlock it at the Village`,
        );
      } else {
        audio.play("click");
      }
      persist(save);
      const statsAfter = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effCalling(), effAdv(), hero.masteredElements);
      const freshCard = this.refreshCard(card, index);
      flashStatDeltas(freshCard, statsBefore, statsAfter);
    });

    card.querySelector('[data-act="respec"]')!.addEventListener("click", () => {
      respecHero(save, index);
      audio.play("click");
      this.refreshCard(card, index);
    });

    // one tap spends every point along the hero's natural bent
    card.querySelector('[data-act="suggest"]')?.addEventListener("click", () => {
      const pts = save.unspent[index];
      if (pts <= 0) return;
      const base = HEROES[index].baseAttrs;
      const effC = () => {
        const c = callingById(hero.calling);
        return c && callingEligible(c, hero.attrs) ? hero.calling : null;
      };
      const before = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null, hero.masteredElements);
      for (let p = 0; p < pts; p++) {
        let bestK = ATTR_KEYS[0];
        let bestScore = -1;
        for (const k of ATTR_KEYS) {
          const score = base[k] / (hero.attrs[k] - base[k] + 1);
          if (score > bestScore) {
            bestScore = score;
            bestK = k;
          }
        }
        hero.attrs[bestK] += 1;
      }
      save.unspent[index] = 0;
      // pocket any spells the training just unlocked
      for (const a of unlockedAbilities(hero.attrs)) {
        if (save.unlockedSpells.includes(a.id) && !hero.equipped.includes(a.id) && hero.equipped.length < MAX_EQUIPPED) {
          hero.equipped.push(a.id);
        }
      }
      persist(save);
      audio.play("levelup");
      this.showToast(`${def.name}'s training follows their nature — ${pts} point${pts === 1 ? "" : "s"} spent`);
      const after = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null, hero.masteredElements);
      const freshCard = this.refreshCard(card, index);
      flashStatDeltas(freshCard, before, after);
    });

    card.querySelector('[data-act="talents"]')!.addEventListener("click", () => {
      audio.play("click");
      this.renderTalents(index);
    });

    card.querySelector('[data-act="calling"]')!.addEventListener("click", () => {
      if (!hero.calling && hero.level < CALLING_UNLOCK_LEVEL) return;
      audio.play("click");
      this.renderCalling(index);
    });

    return card;
  }

  // ------------------------------------------------------------------ Paths

  renderCalling(index: number): void {
    this.pushNav("calling", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    let draftDiscipline: DisciplineId = hero.discipline ?? DISCIPLINES[0].id;
    let draftElement: ElementId = hero.element ?? ELEMENTS[0].id;
    const page = el(`
      <div class="page hero-sheet path-page">
        <div class="map-header path-header">
          <div>
            <div class="map-title">${def.name}'s Path</div>
            <div class="map-level">${hero.calling ? `Changing an established Path costs ${CALLING_SWITCH_COST}g` : "Your first Path is free"} · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div>
          </div>
        </div>
        <div class="path-folio">
          <section class="path-step discipline-step" aria-labelledby="discipline-heading">
            <div class="path-step-heading"><span>01</span><div><strong id="discipline-heading">Choose how you fight</strong><em>Discipline shapes your weapon, role, and first lesson.</em></div></div>
            <div class="discipline-rail">
              ${DISCIPLINES.map((discipline) => `<button class="discipline-choice" data-discipline="${discipline.id}" aria-pressed="false" style="--path-color:${discipline.color}">
                <span class="discipline-crest">${ico(discipline.crest)}</span>
                <span><strong>${discipline.name}</strong><em>${discipline.epithet}</em><small>${discipline.weapon}</small></span>
              </button>`).join("")}
            </div>
          </section>
          <div class="folio-seam" aria-hidden="true"><span></span><b>WAYMARK</b><span></span></div>
          <section class="path-step attunement-step" aria-labelledby="attunement-heading">
            <div class="path-step-heading"><span>02</span><div><strong id="attunement-heading">Choose what answers you</strong><em>Attunement carves an element into that Discipline.</em></div></div>
            <div class="waymark-grid">
              ${ELEMENTS.map((element) => `<button class="waymark-choice" data-element="${element.id}" aria-pressed="false" style="--path-color:${element.color}">
                <i>${ico(element.icon)}</i><span><strong>${element.name}</strong><em>${element.adjective}</em></span>
              </button>`).join("")}
            </div>
          </section>
          <section class="path-reveal" aria-live="polite"></section>
        </div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "calling"));
    const reveal = page.querySelector(".path-reveal") as HTMLElement;

    const refreshReveal = () => {
      page.querySelectorAll<HTMLElement>("[data-discipline]").forEach((button) => {
        const selected = button.dataset.discipline === draftDiscipline;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      page.querySelectorAll<HTMLElement>("[data-element]").forEach((button) => {
        const selected = button.dataset.element === draftElement;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      const discipline = DISCIPLINES.find((choice) => choice.id === draftDiscipline)!;
      const element = ELEMENTS.find((choice) => choice.id === draftElement)!;
      const id = pathId(draftDiscipline, draftElement);
      const path = callingById(id);
      if (!path) {
        reveal.innerHTML = '<div class="path-empty">This Waymark has not been charted yet.</div>';
        return;
      }
      const techniques = [...pathAbilities(draftDiscipline, draftElement)];
      const isCurrent = hero.calling === path.id;
      const changing = !!hero.calling && !isCurrent;
      const pathPractice = Math.min(CALLING_MASTERY_LEVELS, hero.callingLevels[path.id] ?? 0);
      const pathMastered = hero.masteredCallings.includes(path.id);
      const legacyPractice = Math.min(CALLING_MASTERY_LEVELS, hero.elementLevels?.[draftElement] ?? 0);
      const legacyMastered = (hero.masteredElements ?? []).includes(draftElement);
      const advancement = isCurrent ? hero.advCalling : hero.advancedCallings[path.id] ?? null;
      const promotionReady = isCurrent && hero.level >= ADV_CALLING_LEVEL && pathMastered;
      reveal.style.setProperty("--path-color", path.color);
      reveal.innerHTML = `
        <div class="path-reveal-heading">
          <span class="path-sigil">${ico(discipline.crest)}</span>
          <div><small>${discipline.name} · ${element.name}</small><h2>${path.name}</h2><p>${path.epithet}</p></div>
          ${isCurrent ? '<span class="path-current-mark">Current Path</span>' : ""}
        </div>
        <div class="path-doctrine"><span>Passive</span><strong>${path.passive}</strong><em>${discipline.name} Discipline · ${element.name} Attunement</em></div>
        <div class="path-arsenal">
          ${techniques.map((ability, at) => `<article class="path-technique"><span class="path-glyph" data-path-glyph="${at}"></span><div><small>Technique ${at + 1}</small><strong>${ability.name}</strong><em>${ability.blurb}</em></div></article>`).join("")}
          <article class="path-technique ultimate"><span class="path-glyph" data-path-glyph="2"></span><div><small>Ultimate</small><strong>${path.signature.name}</strong><em>${path.signature.blurb}</em><b>${path.chargeHint}</b></div></article>
        </div>
        <div class="path-progress-grid">
          <div class="path-progress ${legacyMastered ? "complete" : ""}"><span><b>Elemental Legacy</b><em>${legacyMastered ? `${element.name} remains with you on every future Path.` : `Practice ${element.name} for ${CALLING_MASTERY_LEVELS} levels to keep its lesson.`}</em></span><strong>${legacyMastered ? "MASTERED" : `${legacyPractice}/${CALLING_MASTERY_LEVELS}`}</strong><i><b style="width:${(legacyPractice / CALLING_MASTERY_LEVELS) * 100}%"></b></i></div>
          <div class="path-progress ${pathMastered ? "complete" : ""}"><span><b>Path Mastery</b><em>${pathMastered ? "This Path is ready for its level-20 Promotion." : "Earn levels while this complete Path is active."}</em></span><strong>${pathMastered ? "MASTERED" : `${pathPractice}/${CALLING_MASTERY_LEVELS}`}</strong><i><b style="width:${(pathPractice / CALLING_MASTERY_LEVELS) * 100}%"></b></i></div>
        </div>
        <div class="path-promotions">
          <div class="path-section-label"><span>Level ${ADV_CALLING_LEVEL}</span><strong>Promotion</strong><em>${promotionReady ? "Choose the final shape of this Path." : isCurrent ? `Requires level ${ADV_CALLING_LEVEL} and Path Mastery.` : "Set this as the current Path before promoting."}</em></div>
          <div class="promotion-ledger">${(path.advanced ?? []).map((promotion) => {
            const chosen = advancement === promotion.id;
            return `<article class="promotion-card ${chosen ? "chosen" : ""} ${promotionReady ? "" : "locked"}"><span>${chosen ? "Chosen" : "Branch"}</span><strong>${promotion.name}</strong><em>${promotion.epithet}</em><p>${promotion.passive}</p><small>${promotion.ultNote}</small>${chosen || !promotionReady ? "" : `<button class="big-btn adv-btn" data-advance="${promotion.id}">${hero.advCalling ? `Change Promotion · ${ADV_SWITCH_COST}g` : "Take Promotion"}</button>`}</article>`;
          }).join("")}</div>
        </div>
        <button class="big-btn primary path-confirm ${isCurrent ? "is-current" : ""} ${changing && save.gold < CALLING_SWITCH_COST ? "cant" : ""}" data-set-path="${path.id}" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? "Current Path" : changing ? `Set Path · ${CALLING_SWITCH_COST}g` : "Begin this Path · free"}
        </button>
      `;
      const glyphs = [...techniques, path.signature];
      reveal.querySelectorAll<HTMLElement>("[data-path-glyph]").forEach((holder) => {
        const ability = glyphs[Number(holder.dataset.pathGlyph)];
        if (!ability) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 72;
        canvas.style.width = canvas.style.height = "36px";
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        drawAbilityGlyph(ctx, ability.icon, 18, 18, 10.5, ability.color);
        holder.appendChild(canvas);
      });
    };

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const discipline = target.closest<HTMLElement>("[data-discipline]");
      if (discipline) {
        draftDiscipline = discipline.dataset.discipline as DisciplineId;
        audio.play("click");
        refreshReveal();
        return;
      }
      const element = target.closest<HTMLElement>("[data-element]");
      if (element) {
        draftElement = element.dataset.element as ElementId;
        audio.play("click");
        refreshReveal();
        return;
      }
      const advance = target.closest<HTMLElement>("[data-advance]");
      if (advance) {
        const id = advance.dataset.advance!;
        if (hero.level < ADV_CALLING_LEVEL || !hero.masteredCallings.includes(hero.calling ?? "")) return;
        if (hero.advCalling && hero.advCalling !== id && !this.spend(ADV_SWITCH_COST)) return;
        hero.advCalling = id;
        if (hero.calling) hero.advancedCallings[hero.calling] = id;
        persist(save);
        audio.play("levelup");
        navigator.vibrate?.([20, 30, 50]);
        const found = advCallingById(id);
        this.showToast(found ? `${def.name} rises: ${found.adv.name}, ${found.adv.epithet}!` : `${def.name} takes a new Promotion.`);
        this.renderCalling(index);
        return;
      }
      const setPath = target.closest<HTMLElement>("[data-set-path]");
      if (setPath && !setPath.hasAttribute("disabled")) {
        const nextId = pathId(draftDiscipline, draftElement);
        const nextPath = callingById(nextId);
        if (!nextPath || hero.calling === nextId) return;
        const changing = !!hero.calling;
        if (changing && save.gold < CALLING_SWITCH_COST) {
          audio.play("click");
          this.showToast(`Not enough gold — need ${CALLING_SWITCH_COST}`);
          return;
        }
        if (changing) save.gold -= CALLING_SWITCH_COST;
        const techniques = [...pathAbilities(draftDiscipline, draftElement)];
        hero.discipline = draftDiscipline;
        hero.element = draftElement;
        hero.calling = nextId;
        hero.advCalling = hero.advancedCallings[nextId] ?? null;
        hero.equipped = techniques.map((ability) => ability.id).slice(0, MAX_EQUIPPED);
        for (const ability of techniques) if (!save.unlockedSpells.includes(ability.id)) save.unlockedSpells.push(ability.id);
        persist(save);
        audio.play("levelup");
        navigator.vibrate?.([20, 30, 50]);
        this.showToast(`${def.name} walks the ${nextPath.name} Path — two techniques and an ultimate are ready.`);
        this.renderCalling(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderParty());
      }
    });
    refreshReveal();
    this.mount(page, "party");
  }

  // ------------------------------------------------------------------ equipment

  /** A slot-first loadout screen: choose a slot, then choose one item for it. */
  renderEquipment(index: number): void {
    this.pushNav("equip", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const sworn = callingById(hero.calling);
    const oathHolds = sworn ? callingEligible(sworn, hero.attrs) : false;
    const weapon = dominantWeapon(hero.attrs, oathHolds ? hero.calling : null);
    const currentGear = () => heroGearOf(hero, save.forge);
    const currentStats = () => deriveStats(hero.attrs, hero.weaponTier, currentGear(), hero.talents, hero.trinket, oathHolds ? hero.calling : null, oathHolds ? hero.advCalling : null, hero.masteredElements);
    const wornSet = armorSetOf(currentGear());
    const slotInfo = [
      { key: "weapon", label: "Weapon", icon: "sword", value: `${WEAPON_TIERS[hero.weaponTier].name} ${WEAPON_LABEL[weapon]}` },
      { key: "body", label: "Armor", icon: "shield", value: armorById(hero.armor)?.name ?? "Traveler's Garb" },
      { key: "helm", label: "Helm", icon: "moon", value: armorById(hero.helm)?.name ?? "Empty" },
      { key: "boots", label: "Boots", icon: "arrow", value: armorById(hero.boots)?.name ?? "Empty" },
      { key: "trinket", label: "Trinket", icon: "gem", value: trinketById(hero.trinket)?.name ?? "Empty" },
    ] as const;
    const page = el(`
      <div class="page hero-sheet loadout-page">
        <div class="map-header">
          <div class="equip-title"><div><div class="map-title">${def.name} <em class="sheet-title">${def.title}</em></div>
          <div class="map-level">Choose a slot, then choose what goes there · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div></div></div>
        </div>
        <div class="loadout-workbench">
          <section class="loadout-hero" style="--accent:${def.accent}">
            <div class="figure-frame"><canvas class="figure-canvas" width="360" height="440"></canvas></div>
            <div class="loadout-stats"></div>
            <div class="loadout-set ${wornSet?.tier === 3 ? "complete" : ""}">
              ${ico("banner")} <strong>${wornSet ? `${wornSet.family} set · ${wornSet.tier}/3` : "No armor set"}</strong>
              <span>${wornSet ? (wornSet.tier >= 3 ? SET_BONUSES[wornSet.family].three : `Next: ${SET_BONUSES[wornSet.family].three}`) : "Match two pieces for a set bonus"}</span>
            </div>
          </section>
          <section class="loadout-console">
            <div class="loadout-slots" aria-label="Equipment slots">
              ${slotInfo.map((slot) => `<button class="loadout-slot ${this.gearFocus === slot.key ? "selected" : ""}" data-focus="${slot.key}"><span class="loadout-slot-icon">${ico(slot.icon)}</span><span><em>${slot.label}</em><strong>${slot.value}</strong></span><b>›</b></button>`).join("")}
            </div>
            <div class="loadout-picker"></div>
          </section>
        </div>
      </div>`);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "gear"));

    const stats = currentStats();
    page.querySelector(".loadout-stats")!.innerHTML = `
      <div><span>Health</span><strong>${stats.maxHp}</strong></div><div><span>Damage</span><strong>${Math.round(stats.damage)}</strong></div>
      <div><span>Armor</span><strong>${Math.round(stats.armor * 100)}%</strong></div><div><span>Move</span><strong>${Math.round(stats.speed)}</strong></div>`;
    const fig = page.querySelector(".figure-canvas") as HTMLCanvasElement;
    if (this.justDonned) { this.justDonned = false; page.querySelector(".figure-frame")?.classList.add("donned"); }
    drawHeroFigure(fig, index, save, 0);
    if (this.figureTimer) clearInterval(this.figureTimer);
    let figT = 0;
    this.figureTimer = window.setInterval(() => {
      if (!document.body.contains(fig)) { if (this.figureTimer) clearInterval(this.figureTimer); this.figureTimer = null; return; }
      drawHeroFigure(fig, index, save, (figT += 0.09));
    }, 90);

    const picker = page.querySelector(".loadout-picker")!;
    const focus = this.gearFocus;
    const heading = slotInfo.find((s) => s.key === focus)!;
    picker.innerHTML = `<div class="picker-head"><span>${ico(heading.icon)} ${heading.label}</span><small>Select an option below</small></div><div class="picker-list"></div>`;
    const list = picker.querySelector(".picker-list")!;
    if (focus === "weapon") {
      const next = hero.weaponTier + 1 < WEAPON_TIERS.length ? WEAPON_TIERS[hero.weaponTier + 1] : null;
      list.innerHTML = `<div class="item-choice equipped"><span class="choice-icon">${ico("sword")}</span><span><strong>${WEAPON_TIERS[hero.weaponTier].name}</strong><em>Equipped · +${WEAPON_DAMAGE_BONUS[hero.weaponTier]} damage</em></span><b>✓</b></div>${next ? `<button class="item-choice" data-gear="w"><span class="choice-icon">${ico("spark")}</span><span><strong>Upgrade to ${next.name}</strong><em>Permanent weapon improvement</em></span><b>${next.cost}g</b></button>` : `<div class="picker-empty">This weapon is fully upgraded.</div>`}`;
    } else if (focus === "trinket") {
      const taken = save.heroes.filter((_, hi) => hi !== index).map((h) => h.trinket);
      const ids = [...new Set(save.inventory)].filter((id) => save.inventory.filter((x) => x === id).length > taken.filter((x) => x === id).length);
      const choices = [null, ...ids];
      list.innerHTML = choices.map((id) => {
        const t = trinketById(id);
        return `<button class="item-choice ${hero.trinket === id ? "equipped" : ""}" data-trinket="${id ?? "none"}"><span class="choice-icon">${t?.icon ?? "◇"}</span><span><strong>${t?.name ?? "No trinket"}</strong><em>${t?.blurb ?? "Leave this slot empty"}</em></span><b>${hero.trinket === id ? "✓" : "Equip"}</b></button>`;
      }).join("");
      if (choices.length === 1) list.insertAdjacentHTML("beforeend", `<button class="picker-shop" data-goto="armory">Find trinkets in the Armory →</button>`);
    } else {
      const kind = focus as "body" | "helm" | "boots";
      const catalog = kind === "body" ? ARMORS : kind === "helm" ? HELMS : BOOTS;
      const wornId = kind === "body" ? hero.armor : kind === "helm" ? hero.helm : hero.boots;
      const pool = catalog.filter((p) => save.armory.filter((x) => x === p.id).length > save.heroes.filter((h, hi) => hi !== index && (kind === "body" ? h.armor : kind === "helm" ? h.helm : h.boots) === p.id).length);
      const cur = currentStats();
      const choices: (typeof pool[number] | null)[] = [null, ...pool];
      list.innerHTML = choices.map((piece) => {
        const altGear = { ...currentGear(), [kind === "body" ? "body" : kind]: piece?.id ?? null };
        const alt = deriveStats(hero.attrs, hero.weaponTier, altGear, hero.talents, hero.trinket, oathHolds ? hero.calling : null, oathHolds ? hero.advCalling : null, hero.masteredElements);
        const deltas = [[alt.maxHp - cur.maxHp, "hp"], [Math.round((alt.armor - cur.armor) * 100), "% armor"], [Math.round(((alt.speed - cur.speed) / cur.speed) * 100), "% move"]] as const;
        const deltaHtml = deltas.filter(([n]) => n).map(([n, label]) => `<i class="${n > 0 ? "up" : "dn"}">${n > 0 ? "+" : ""}${n}${label}</i>`).join("");
        const active = wornId === (piece?.id ?? null);
        const dataKey = kind === "body" ? "armor" : kind;
        const extra = piece?.active ?? null;
        return `<button class="item-choice ${active ? "equipped" : ""}" data-${dataKey}="${piece?.id ?? "none"}"><span class="choice-icon">${piece ? ico(piece.icon) : "◇"}</span><span><strong>${piece ? pieceLabel(piece, save.forge) : kind === "body" ? "Traveler's Garb" : "Empty"}</strong><em>${piece?.blurb ?? "Leave this slot unequipped"}${extra ? ` · Grants ${extra.name}` : ""}</em><span class="choice-deltas">${deltaHtml || "No stat change"}</span></span><b>${active ? "✓" : "Equip"}</b></button>`;
      }).join("");
      if (wornId && save.heroes.some((h, hi) => hi !== index && h.recruited)) list.insertAdjacentHTML("beforeend", `<button class="picker-shop" data-handoff="${kind}">Hand this piece to another hero</button>`);
      if (!pool.length) list.insertAdjacentHTML("beforeend", `<button class="picker-shop" data-goto="armory">Browse more gear in the Armory →</button>`);
    }

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const focusBtn = target.closest("[data-focus]");
      if (focusBtn) { this.gearFocus = focusBtn.getAttribute("data-focus") as typeof this.gearFocus; audio.play("click"); this.renderEquipment(index); return; }
      const gear = target.closest("[data-gear]");
      if (gear) { const tier = hero.weaponTier + 1; if (!this.spend(WEAPON_TIERS[tier].cost)) return; hero.weaponTier = tier; persist(save); audio.play("clink"); this.showToast(`${def.name}'s weapon is now ${WEAPON_TIERS[tier].name}`); this.renderEquipment(index); return; }
      const don = (slot: "armor" | "helm" | "boots", id: string) => {
        const before = armorSetOf(heroGearOf(hero))?.tier ?? 0; hero[slot] = id === "none" ? null : id; persist(save); const set = armorSetOf(heroGearOf(hero)); this.justDonned = id !== "none";
        if ((set?.tier ?? 0) >= 3 && before < 3) { audio.play("setChime"); this.showToast(`${set!.family.toUpperCase()} SET COMPLETE — ${SET_BONUSES[set!.family].three}`); } else audio.play("clink");
        this.renderEquipment(index);
      };
      const armor = target.closest("[data-armor]"); if (armor) { don("armor", armor.getAttribute("data-armor")!); return; }
      const helm = target.closest("[data-helm]"); if (helm) { don("helm", helm.getAttribute("data-helm")!); return; }
      const boots = target.closest("[data-boots]"); if (boots) { don("boots", boots.getAttribute("data-boots")!); return; }
      const trinket = target.closest("[data-trinket]"); if (trinket) { hero.trinket = trinket.getAttribute("data-trinket") === "none" ? null : trinket.getAttribute("data-trinket"); persist(save); audio.play("click"); this.renderEquipment(index); return; }
      const handoff = target.closest("[data-handoff]"); if (handoff) { this.askHandoff(index, handoff.getAttribute("data-handoff") as "body" | "helm" | "boots"); return; }
      if (target.closest("[data-goto]")) { audio.play("page"); this.renderShop("armory"); return; }
      if (target.closest('[data-act="back"]')) { audio.play("click"); this.goBack(() => this.renderParty()); }
    });
    this.mount(page, "party");
  }

  /** Previous expanded equipment sheet retained as a fallback reference. */
  renderEquipmentLegacy(index: number): void {
    this.pushNav("equip", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const sheetSworn = callingById(hero.calling);
    const sheetHolds = sheetSworn ? callingEligible(sheetSworn, hero.attrs) : false;
    const weapon = dominantWeapon(hero.attrs, sheetHolds ? hero.calling : null);
    const oathGuided = sheetHolds && weapon !== dominantWeapon(hero.attrs);
    const nextW = hero.weaponTier + 1 < WEAPON_TIERS.length ? WEAPON_TIERS[hero.weaponTier + 1] : null;
    const trinket = trinketById(hero.trinket);
    const dominant = ATTR_KEYS.reduce((best, k) => (hero.attrs[k] > hero.attrs[best] ? k : best), ATTR_KEYS[0]);
    const page = el(`
      <div class="page hero-sheet">
        <div class="map-header">
          <div class="equip-title">
            <div>
              <div class="map-title">${def.name} <em class="sheet-title">${def.title}</em></div>
              <div class="map-level">${WEAPON_LABEL[weapon]} · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div>
            </div>
          </div>
        </div>
        <div class="sheet-cols">
          <div class="sheet-left">
            <div class="figure-frame" style="--accent:${def.accent}">
              <canvas class="figure-canvas" width="360" height="440"></canvas>
              <div class="figure-caption">${
                oathGuided
                  ? `${WEAPON_LABEL[weapon]} — the ${sheetSworn!.name} Path guides the hand`
                  : `${WEAPON_LABEL[weapon]} — shaped by ${ATTR_NAMES[dominant]} ${hero.attrs[dominant]}`
              }</div>
            </div>
            <div class="equip-slot">
              <div class="equip-slot-head">${ico("sword")} Weapon — <strong>${WEAPON_TIERS[hero.weaponTier].name}</strong> <span>+${WEAPON_DAMAGE_BONUS[hero.weaponTier]} dmg</span></div>
              ${
                nextW
                  ? `<button class="big-btn buy-btn ${save.gold < nextW.cost ? "cant" : ""}" data-gear="w">Upgrade to ${nextW.name} — ${nextW.cost}g</button>`
                  : `<div class="gear-max">Finest weapon in the realm</div>`
              }
            </div>
            <div class="equip-slot">
              <div class="equip-slot-head">${ico("gem")} Trinket — <strong>${trinket ? `${trinket.icon} ${trinket.name}` : "none"}</strong></div>
              ${trinket ? `<div class="equip-blurb">${trinket.blurb}${trinket.rarity === "rare" ? ' <span class="rare-tag">RARE</span>' : ""}</div>` : ""}
              <div class="trinket-options"></div>
            </div>
          </div>
          <div class="sheet-right">
            <div class="gear-slots"></div>
          </div>
        </div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "gear"));
    // live figure: the real battle render, idling
    const fig = page.querySelector(".figure-canvas") as HTMLCanvasElement;
    if (this.justDonned) {
      this.justDonned = false;
      page.querySelector(".figure-frame")?.classList.add("donned");
    }
    drawHeroFigure(fig, index, save, 0);
    if (this.figureTimer) clearInterval(this.figureTimer);
    let figT = 0;
    this.figureTimer = window.setInterval(() => {
      if (!document.body.contains(fig)) {
        if (this.figureTimer) clearInterval(this.figureTimer);
        this.figureTimer = null;
        return;
      }
      figT += 0.09;
      drawHeroFigure(fig, index, save, figT);
    }, 90);

    // three gear slots: body carries the family skill; helm and boots complete a set
    const gearHolder = page.querySelector(".gear-slots")!;
    const gearNow = () => heroGearOf(hero, save.forge);
    const statsWith = (gear: ReturnType<typeof gearNow>) =>
      deriveStats(hero.attrs, hero.weaponTier, gear, hero.talents, hero.trinket, sheetHolds ? hero.calling : null, sheetHolds ? hero.advCalling : null, hero.masteredElements);
    const buildSlot = (kind: "body" | "helm" | "boots") => {
      const catalog = kind === "body" ? ARMORS : kind === "helm" ? HELMS : BOOTS;
      const wornId = kind === "body" ? hero.armor : kind === "helm" ? hero.helm : hero.boots;
      const worn = armorById(wornId);
      const dataKey = kind === "body" ? "armor" : kind;
      const pool = catalog.filter((p) => {
        const copies = save.armory.filter((x) => x === p.id).length;
        const used = save.heroes.filter((h, hi) => hi !== index && (kind === "body" ? h.armor : kind === "helm" ? h.helm : h.boots) === p.id).length;
        return copies > used;
      });
      const title = kind === "body" ? "Armor" : kind === "helm" ? "Helm" : "Boots";
      const sectionIcon = kind === "body" ? "shield" : kind === "helm" ? "moon" : "arrow";
      const skill = kind === "body" && worn ? worn.active : null;
      const cur = statsWith(gearNow());
      const options = pool
        .map((p) => {
          const alt = statsWith({ ...gearNow(), [kind === "body" ? "body" : kind]: p.id });
          const bits: string[] = [];
          const dHp = alt.maxHp - cur.maxHp;
          const dAr = Math.round((alt.armor - cur.armor) * 100);
          const dSp = Math.round(((alt.speed - cur.speed) / cur.speed) * 100);
          if (dHp) bits.push(`<i class="${dHp > 0 ? "up" : "dn"}">${dHp > 0 ? "+" : ""}${dHp}hp</i>`);
          if (dAr) bits.push(`<i class="${dAr > 0 ? "up" : "dn"}">${dAr > 0 ? "+" : ""}${dAr}%ar</i>`);
          if (dSp) bits.push(`<i class="${dSp > 0 ? "up" : "dn"}">${dSp > 0 ? "+" : ""}${dSp}%mv</i>`);
          return `<button class="toggle-btn trinket-opt ${wornId === p.id ? "on" : ""}" data-${dataKey}="${p.id}" title="${p.blurb}">${ico(p.icon)} ${pieceLabel(p, save.forge)}${p.boss ? " ✦" : ""}${bits.length ? ` <span class="delta-chips">${bits.join("")}</span>` : ""}</button>`;
        })
        .join("");
      // a worn piece can be handed straight to a bandmate
      const others = save.heroes.some((h, hi) => hi !== index && h.recruited);
      gearHolder.appendChild(
        el(`
          <div class="equip-slot">
            <div class="equip-slot-head">${ico(sectionIcon)} ${title} — <strong>${worn ? pieceLabel(worn, save.forge) : kind === "body" ? "Traveler's Garb" : "none"}</strong>
              ${worn && others ? `<button class="toggle-btn handoff-btn" data-handoff="${kind}">Hand to…</button>` : ""}
              <span class="loadout-hint ${kind === "body" && !worn && pool.length ? "urgent" : ""}">${pool.length ? "tap a piece below to wear it" : `<button class="linklike" data-goto="armory">the Armory sells more →</button>`}</span></div>
            ${
              worn
                ? `<div class="equip-blurb">${worn.blurb}${worn.boss ? ' <span class="rare-tag">RELIC</span>' : ""}${skill ? ` · grants <strong>${skill.name}</strong> in battle` : ""}</div>`
                : kind === "body"
                  ? `<div class="equip-blurb">Road-worn and honest — armor changes passive stats and combat traits without adding another battle button.</div>`
                  : ""
            }
            <div class="trinket-options armor-options">
              <button class="toggle-btn trinket-opt ${wornId === null ? "on" : ""}" data-${dataKey}="none">◇ ${kind === "body" ? "Garb" : "None"}</button>
              ${options}
            </div>
          </div>
        `),
      );
    };
    buildSlot("body");
    buildSlot("helm");
    buildSlot("boots");
    // the family-set meter: dress head to toe in one family and it answers
    const wornSet = armorSetOf(gearNow());
    gearHolder.appendChild(
      el(`
        <div class="equip-slot set-meter ${wornSet?.tier === 3 ? "complete" : ""}">
          <div class="equip-slot-head">${ico("banner")} Family set — <strong>${wornSet ? `${wornSet.family} ${wornSet.tier}/3` : "none"}</strong> ${wornSet ? "" : '<span class="loadout-hint">wear 2+ pieces of one family</span>'}</div>
          ${
            wornSet
              ? `<div class="equip-blurb">2 pieces: ${SET_BONUSES[wornSet.family].two}${
                  wornSet.tier >= 3 ? ` · 3 pieces: ${SET_BONUSES[wornSet.family].three}` : ` · <em>a third piece adds: ${SET_BONUSES[wornSet.family].three}</em>`
                }</div>`
              : ""
          }
        </div>
      `),
    );

    // trinket choices: none + every distinct loot piece not worn by someone else
    const options = page.querySelector(".trinket-options:not(.armor-options)")!;
    const takenElsewhere = save.heroes.filter((_, hi) => hi !== index).map((h) => h.trinket);
    const pool = [...new Set(save.inventory)].filter((id) => {
      const copies = save.inventory.filter((x) => x === id).length;
      const used = takenElsewhere.filter((x) => x === id).length;
      return copies > used;
    });
    if (!pool.length) {
      options.appendChild(el(`<div class="equip-blurb">No loot yet — clear stages to find trinkets.</div>`));
    } else {
      options.appendChild(el(`<button class="toggle-btn trinket-opt ${hero.trinket === null ? "on" : ""}" data-trinket="none">◇ None</button>`));
      for (const id of pool) {
        const t = trinketById(id)!;
        options.appendChild(
          el(`<button class="toggle-btn trinket-opt ${hero.trinket === id ? "on" : ""}" data-trinket="${id}">${t.icon} ${t.name}${t.rarity === "rare" ? " ✦" : ""}</button>`),
        );
      }
    }

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const gear = target.closest("[data-gear]");
      if (gear) {
        const tier = hero.weaponTier + 1;
        if (!this.spend(WEAPON_TIERS[tier].cost)) return;
        hero.weaponTier = tier;
        persist(save);
        this.showToast(`${def.name} equips a ${WEAPON_TIERS[tier].name} weapon!`);
        this.renderEquipment(index);
        return;
      }
      // donning gear: one path for all three slots, with a fanfare when a set completes
      const donGear = (slot: "armor" | "helm" | "boots", id: string, toastOn: string, toastOff: string) => {
        const setBefore = armorSetOf(heroGearOf(hero))?.tier ?? 0;
        hero[slot] = id === "none" ? null : id;
        persist(save);
        const setAfter = armorSetOf(heroGearOf(hero));
        if (id !== "none") this.justDonned = true;
        if ((setAfter?.tier ?? 0) >= 3 && setBefore < 3) {
          audio.play("setChime");
          navigator.vibrate?.([15, 20, 15, 20, 40]);
          this.showToast(`${setAfter!.family.toUpperCase()} SET COMPLETE — ${SET_BONUSES[setAfter!.family].three}`);
        } else {
          audio.play("clink");
          this.showToast(id === "none" ? toastOff : toastOn);
        }
        this.renderEquipment(index);
      };
      const armorBtn = target.closest("[data-armor]");
      if (armorBtn) {
        const id = armorBtn.getAttribute("data-armor")!;
        donGear("armor", id, `${def.name} dons the ${armorById(id)?.name}`, `${def.name} travels light`);
        return;
      }
      const helmBtn = target.closest("[data-helm]");
      if (helmBtn) {
        const id = helmBtn.getAttribute("data-helm")!;
        donGear("helm", id, `${def.name} dons the ${armorById(id)?.name}`, `${def.name} goes bare-headed`);
        return;
      }
      const bootsBtn = target.closest("[data-boots]");
      if (bootsBtn) {
        const id = bootsBtn.getAttribute("data-boots")!;
        donGear("boots", id, `${def.name} laces the ${armorById(id)?.name}`, `${def.name} trusts their own soles`);
        return;
      }
      const trinketBtn = target.closest("[data-trinket]");
      if (trinketBtn) {
        const id = trinketBtn.getAttribute("data-trinket")!;
        hero.trinket = id === "none" ? null : id;
        persist(save);
        audio.play("click");
        this.renderEquipment(index);
        return;
      }
      const goto = target.closest("[data-goto]");
      if (goto) {
        audio.play("page");
        this.renderShop("armory");
        return;
      }
      const handoffBtn = target.closest("[data-handoff]");
      if (handoffBtn) {
        this.askHandoff(index, handoffBtn.getAttribute("data-handoff") as "body" | "helm" | "boots");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderParty());
      }
    });
    this.mount(page, "party");
  }

  /** Pass a worn piece straight to a bandmate — no doff-then-dress round trip. */
  private askHandoff(index: number, kind: "body" | "helm" | "boots"): void {
    const save = this.save;
    const hero = save.heroes[index];
    const slotKeyOf = (h: (typeof save.heroes)[number]) => (kind === "body" ? h.armor : kind === "helm" ? h.helm : h.boots);
    const pieceId = slotKeyOf(hero);
    const piece = armorById(pieceId);
    if (!piece) return;
    const pop = el(`
      <div class="levelup-pop">
        <div class="levelup-card">
          <div class="levelup-title" style="font-size:20px">${pieceLabel(piece, save.forge)}</div>
          <div class="levelup-line">Hand it to whom? (their current piece returns to the armory)</div>
          <div class="wear-row">
            ${save.heroes
              .map((h, i) => ({ h, i }))
              .filter(({ h, i }) => h.recruited && i !== index)
              .map(({ h, i }) => `<button class="toggle-btn wear-opt" data-wear="${i}">${HEROES[i].name}${slotKeyOf(h) ? "" : " ◇"}</button>`)
              .join("")}
          </div>
          <div class="levelup-actions"><button class="big-btn" data-wear="cancel">Keep it</button></div>
        </div>
      </div>
    `);
    pop.addEventListener("click", (event) => {
      const pick = (event.target as HTMLElement).closest("[data-wear]")?.getAttribute("data-wear");
      if (!pick) return;
      if (pick !== "cancel") {
        const to = save.heroes[Number(pick)];
        if (kind === "body") {
          hero.armor = null;
          to.armor = pieceId;
        } else if (kind === "helm") {
          hero.helm = null;
          to.helm = pieceId;
        } else {
          hero.boots = null;
          to.boots = pieceId;
        }
        persist(save);
        audio.play("clink");
        this.showToast(`${HEROES[Number(pick)].name} takes the ${piece.name}`);
      }
      pop.remove();
      this.renderEquipment(index);
    });
    this.root.appendChild(pop);
  }

  /** A Path always carries exactly two techniques and one charge-based ultimate. */
  renderSpells(index: number): void {
    this.pushNav("spells", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const hero = save.heroes[index];
    const def = HEROES[index];
    const path = callingById(hero.calling);
    const roadSkills = path ? [] : hero.equipped.flatMap((id) => {
      const ability = ABILITIES.find((candidate) => candidate.id === id);
      return ability ? [ability] : [];
    }).slice(0, MAX_EQUIPPED);
    const granted = heroPathAbilities(hero);
    const remembered = hero.equipped.filter((id) => granted.some((ability) => ability.id === id));
    const techniques = [...remembered.map(abilityById), ...granted.filter((ability) => !remembered.includes(ability.id))].slice(0, MAX_EQUIPPED);
    const elementChoices = hero.element ? [...elementTechniqueOptions(hero.element)] : [];
    const normalized = techniques.map((ability) => ability.id);
    if (path && normalized.join("|") !== hero.equipped.join("|")) {
      hero.equipped = normalized;
      persist(save);
    }
    const page = el(`
      <div class="page hero-sheet loadout-page spell-loadout-page path-bar-page">
        <div class="map-header"><div class="equip-title"><div><div class="map-title">${def.name}'s Battle Bar</div>
          <div class="map-level">${path ? "One Discipline technique · one chosen elemental technique · one Path ultimate" : `Road skills now · elemental Paths open at level ${CALLING_UNLOCK_LEVEL}`}</div></div></div></div>
        ${path && techniques.length === MAX_EQUIPPED ? `
          <div class="spell-workbench path-bar-workbench" style="--path-color:${path.color}">
            <section class="battlebar-panel path-battlebar-panel">
              <div class="picker-head"><span>${ico("spark")} Ready for battle</span><small>Q · W · R by default</small></div>
              <div class="battlebar-slots"></div>
            </section>
            <aside class="path-bar-doctrine">
              <span class="path-bar-kicker">Current Path</span>
              <strong>${path.name}</strong><em>${path.epithet}</em>
              <p>${path.passive}</p>
              <div><b>Discipline</b><span>${DISCIPLINES.find((choice) => choice.id === hero.discipline)?.name ?? "Uncharted"}</span></div>
              <div><b>Attunement</b><span>${ELEMENTS.find((choice) => choice.id === hero.element)?.name ?? "Uncharted"}</span></div>
              <button class="big-btn" data-open-path>Review or change Path</button>
            </aside>
          </div>
          <section class="element-technique-picker" style="--path-color:${path.color}">
            <div class="element-technique-head"><span>Elemental slot · W</span><strong>Choose a ${elementById(hero.element)?.name ?? "Path"} technique</strong><p>Power deals the most damage. Control creates breathing room. Utility protects and accelerates the caster.</p></div>
            <div class="element-technique-options">
              ${elementChoices.map((ability) => `<button class="element-technique-option ${techniques[1]?.id === ability.id ? "selected" : ""}" data-element-technique="${ability.id}" style="--chip:${ability.color}"><small>${ability.pathVariant}</small><strong>${ability.name}</strong><em>${ability.blurb}</em><b>${techniques[1]?.id === ability.id ? "Equipped" : "Choose"}</b></button>`).join("")}
            </div>
          </section>` : roadSkills.length ? `
          <div class="spell-workbench path-bar-workbench road-skill-workbench">
            <section class="battlebar-panel path-battlebar-panel">
              <div class="picker-head"><span>${ico("spark")} Road skills</span><small>Q · W by default</small></div>
              <div class="battlebar-slots road-skill-slots"></div>
            </section>
            <aside class="path-bar-doctrine">
              <span class="path-bar-kicker">Before the Path</span>
              <strong>Founder's training</strong><em>Reliable skills for the first journey</em>
              <p>These opening skills keep the hero battle-ready. At level ${CALLING_UNLOCK_LEVEL}, choose a Discipline and an Attunement to replace them with a complete elemental Path.</p>
              <button class="big-btn primary" disabled>Paths unlock at level ${CALLING_UNLOCK_LEVEL}</button>
            </aside>
          </div>` : `
          <section class="path-bar-empty">
            <span>${ico("banner")}</span><strong>No Path charted</strong>
            <p>Choose a Discipline and an Attunement to set two techniques and an ultimate.</p>
            <button class="big-btn primary" data-open-path ${hero.level < CALLING_UNLOCK_LEVEL ? "disabled" : ""}>${hero.level < CALLING_UNLOCK_LEVEL ? `Paths unlock at level ${CALLING_UNLOCK_LEVEL}` : "Choose a Path"}</button>
          </section>`}
      </div>`);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "spells"));
    if (path && techniques.length === MAX_EQUIPPED) {
      const slots = page.querySelector(".battlebar-slots")!;
      const entries = [
        { ability: techniques[0], label: "Discipline", key: "Q", ultimate: false },
        { ability: techniques[1], label: "Element", key: "W", ultimate: false },
        { ability: path.signature, label: "Path ultimate", key: "R", ultimate: true },
      ];
      for (const entry of entries) {
        const slot = el(`<article class="battlebar-slot filled path-fixed-slot ${entry.ultimate ? "signature" : ""}" style="--chip:${entry.ability.color}"><span class="slot-number">${entry.key}</span><span class="spell-ico"></span><span><small>${entry.label}</small><strong>${entry.ability.name}</strong><em>${entry.ability.blurb}</em></span><b>${entry.ultimate ? "Charge" : "Ready"}</b></article>`);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 72;
        canvas.style.width = canvas.style.height = "36px";
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        drawAbilityGlyph(ctx, entry.ability.icon, 18, 18, 10.5, entry.ability.color);
        slot.querySelector(".spell-ico")!.appendChild(canvas);
        slots.appendChild(slot);
      }
    } else if (roadSkills.length) {
      const slots = page.querySelector(".road-skill-slots")!;
      for (const [at, ability] of roadSkills.entries()) {
        const slot = el(`<article class="battlebar-slot filled path-fixed-slot" style="--chip:${ability.color}"><span class="slot-number">${at === 0 ? "Q" : "W"}</span><span class="spell-ico"></span><span><small>Road skill ${at + 1}</small><strong>${ability.name}</strong><em>${ability.blurb}</em></span><b>Ready</b></article>`);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 72;
        canvas.style.width = canvas.style.height = "36px";
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        drawAbilityGlyph(ctx, ability.icon, 18, 18, 10.5, ability.color);
        slot.querySelector(".spell-ico")!.appendChild(canvas);
        slots.appendChild(slot);
      }
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const elemental = target.closest("[data-element-technique]");
      if (elemental && path && techniques.length === MAX_EQUIPPED) {
        const selected = elemental.getAttribute("data-element-technique");
        if (!selected || !elementChoices.some((ability) => ability.id === selected)) return;
        hero.equipped = [techniques[0].id, selected];
        if (!save.unlockedSpells.includes(selected)) save.unlockedSpells.push(selected);
        persist(save);
        audio.play("click");
        this.showToast(`${abilityById(selected).name} equipped to W.`);
        this.renderSpells(index);
        return;
      }
      if (target.closest("[data-open-path]") && hero.level >= CALLING_UNLOCK_LEVEL) {
        audio.play("page");
        this.renderCalling(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.goBack(() => this.renderParty());
      }
    });
    this.mount(page, "party");
  }

  /** Compatibility alias for old debug links; the obsolete global spellbook is retired. */
  renderSpellsLegacy(index: number): void {
    this.renderSpells(index);
  }

  private refreshCard(card: HTMLElement, index: number): HTMLElement {
    // Spending an attribute on the full hero sheet must keep that same sheet
    // open. Rebuilding the compact party card here made the rest of the
    // character controls disappear and felt like an unexpected navigation.
    const full = card.querySelector(".stat-grid") !== null;
    const fresh = this.heroCard(index, full);
    card.replaceWith(fresh);
    return fresh;
  }
}
