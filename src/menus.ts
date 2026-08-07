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
  CALLINGS,
  CALLING_SWITCH_COST,
  CALLING_MASTERY_LEVELS,
  CALLING_UNLOCK_LEVEL,
  callingById,
  callingEligible,
  CONTRACTS,
  contractPurse,
  FOUNDATIONAL_CALLING_IDS,
  DIFFICULTIES,
  heroArrived,
  TRINKETS,
  trinketById,
  MAX_LEVEL,
  TALENTS,
  TALENT_TREES,
  type TalentTree,
  TIER_UNLOCK,
  talentPointBudget,
  talentPointsInTree,
  talentPointsSpent,
  BOSS_STAGES,
  ATTR_BLURBS,
  ATTR_KEYS,
  ATTR_NAMES,
  bandLevel,
  boonById,
  DEEDS,
  ENEMIES,
  HEROES,
  MAX_EQUIPPED,
  PARTY_CAP,
  RECRUIT_COST,
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
import type { AttrKey, EnemyKind } from "./types";

function bestAttr(index: number): AttrKey {
  const attrs = HEROES[index].baseAttrs;
  return ATTR_KEYS.reduce((best, k) => (attrs[k] > attrs[best] ? k : best), ATTR_KEYS[0]);
}
import { drawAbilityGlyph, ico } from "./icons";
import { drawHeroFigure, setColorSafe } from "./render";
import { activeSlot, DEFAULT_KEYBINDS, nextSpeed, peekSlot, persist, respecHero, setActiveSlot, SLOT_NAMES, slotKey, speedLabel } from "./save";
import { exportTelemetry, telemetrySummary } from "./telemetry";
import type { SaveData } from "./types";

export interface MenuCallbacks {
  startStage: (stageIndex: number) => void;
  startChallenge: (kind: "arena" | "contract", stageIndex: number, id: string) => void;
  startTutorial: (kind: string) => void;
  resetProgress: () => void;
}

const WEAPON_LABEL: Record<string, string> = {
  sword: "Blade",
  bow: "Bow",
  staff: "Staff",
  stave: "Stave",
};

function abilityById(id: string) {
  return ABILITIES.find((a) => a.id === id)!;
}

function buildIdentity(save: SaveData, index: number): string {
  const hero = save.heroes[index];
  const calling = callingById(hero.calling);
  if (calling && callingEligible(calling, hero.attrs)) return calling.name;
  const ranked = ATTR_KEYS.slice().sort((a, b) => hero.attrs[b] - hero.attrs[a]);
  const pair = `${ranked[0]}-${ranked[1]}`;
  const named: Record<string, string> = {
    "str-int": "Spellblade", "int-str": "Spellblade",
    "str-vit": "Iron Vanguard", "vit-str": "Iron Vanguard",
    "dex-spi": "Wayfinder", "spi-dex": "Wayfinder",
    "int-spi": "Lantern Sage", "spi-int": "Lantern Sage",
    "dex-int": "Arcane Ranger", "int-dex": "Arcane Ranger",
    "vit-spi": "Oath Warden", "spi-vit": "Oath Warden",
  };
  return named[pair] ?? ({ str: "Bladebearer", dex: "Pathfinder", int: "Spellwright", vit: "Bulwark", spi: "Lightkeeper" } as Record<AttrKey, string>)[ranked[0]];
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
    ["Spell power", (s) => s.spellPower, (d) => `${d.toFixed(2)}`],
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
  "Spell power": "Multiplies the strength of every spell they cast.",
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
  if (kind === "wolf" || kind === "alpha" || kind === "frostwolf") {
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
  private spellFocus = 0;
  private pendingSpell: string | null = null; // retained for the legacy spell sheet below
  private figureTimer: number | null = null; // idle animation for the hero-sheet figure
  private justDonned = false; // flash the figure preview on the next sheet render
  private selectedStage: number | null = null; // map node the scout report is showing
  pendingFinale = false; // set when the Winterreach's king falls
  private shopAttr: AttrKey | "all" = "all"; // spell-shop filter
  private shopHideOwned = false;
  private partySel = 0;
  private lastGold: number | null = null; // for the counting-up gold chip

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
  }

  /** Wire the hardware/browser back button: each screen registers itself. */
  private navReady = false;
  private navigating = false;
  private pushNav(name: string, arg?: number): void {
    if (!this.navReady) {
      this.navReady = true;
      window.addEventListener("popstate", (ev) => {
        const st = (ev.state ?? {}) as { p?: string; a?: number };
        this.navigating = true;
        try {
          switch (st.p) {
            case "map": this.renderMap(); break;
            case "party": this.renderParty(); break;
            case "shop": this.renderShop("armory"); break;
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
            default: this.renderTitle();
          }
        } finally {
          this.navigating = false;
        }
      });
    }
    if (!this.navigating) history.pushState({ p: name, a: arg }, "", "");
  }

  private show(): void {
    this.root.classList.add("visible");
    this.root.scrollTop = 0;
  }

  showToast(text: string): void {
    this.toast?.remove();
    const toast = el(`<div class="toast">${text}</div>`);
    this.root.appendChild(toast);
    this.toast = toast;
    setTimeout(() => toast.classList.add("fade"), 2600);
    setTimeout(() => toast.remove(), 3300);
  }

  /** Battleheart-style bottom tab bar: five doors, every screen one tap apart. */
  private sectionBar(current: "battle" | "party" | "shop" | "tavern" | "records"): HTMLElement {
    const save = this.save;
    const unspent = save.heroes.reduce((sum, h, i) => sum + (h.recruited ? save.unspent[i] : 0), 0);
    const shopDeal =
      save.heroes.some((h) => h.recruited && h.weaponTier + 1 < WEAPON_TIERS.length && WEAPON_TIERS[h.weaponTier + 1].cost <= save.gold) ||
      ALL_GEAR.some((a) => a.cost > 0 && !save.armory.includes(a.id) && a.cost <= save.gold) ||
      ABILITIES.some((a) => !save.unlockedSpells.includes(a.id) && (SPELL_COSTS[a.id] ?? 100) <= save.gold);
    const recruitReady = save.heroes.some((h, i) => !h.recruited && heroArrived(save, i) && (RECRUIT_COST[i] ?? Infinity) <= save.gold);
    const btn = (id: string, icon: string, label: string, extra = "") =>
      `<button class="nav-btn ${current === id ? "on" : ""}" data-nav="${id}">${ico(icon)}<span>${label}</span>${extra}</button>`;
    const bar = el(`
      <nav class="nav-bar">
        ${btn("battle", "sword", "Battle")}
        ${btn("party", "shield", "Party", unspent > 0 ? `<span class="badge">${unspent}</span>` : "")}
        ${btn("shop", "bag", "Shop", shopDeal ? '<span class="shop-dot"></span>' : "")}
        ${btn("tavern", "home", "Tavern", recruitReady ? '<span class="shop-dot"></span>' : "")}
        ${btn("records", "book", "Records")}
        <span class="nav-gold">${ico("coin")} ${save.gold}</span>
      </nav>
    `);
    bar.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest("[data-nav]");
      if (!target) return;
      const to = target.getAttribute("data-nav");
      if (to === current) return;
      audio.play("page");
      if (to === "battle") this.renderMap();
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
    const page = el(`
      <div class="page title-page">
        <div class="title-block">
          <div class="title-kicker">A COMPANY RPG</div>
          <div class="game-logo">WAYBAND</div>
          <div class="game-sub">No chosen one. Four travelers, and the road ahead.</div>
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
        <div class="title-company" aria-label="Current company">
          ${this.save.heroes.map((hero, index) => ({ hero, index })).filter(({ hero }) => hero.recruited).map(({ index }) => `<span style="--company:${HEROES[index].accent}"><i></i>${HEROES[index].name}</span>`).join("")}
        </div>
        <div class="title-road-status">
          <span>${this.save.unlockedStage > 0 ? `The road remembers ${this.save.lifetime.victories} victor${this.save.lifetime.victories === 1 ? "y" : "ies"}.` : "Millbrook's west bell has stopped ringing."}</span>
          <strong>${this.save.unlockedStage > 0 ? `${STAGES[Math.min(this.save.unlockedStage, STAGES.length - 1)].name} waits.` : "Someone has to take the south road."}</strong>
        </div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="start">${this.save.seenIntro ? "Continue the Journey" : "Begin Your Journey"}</button>
          <button class="big-btn" data-act="tutorial">How to Play</button>
        </div>
        <details class="settings-card travel-kit">
          <summary class="settings-title"><span>Settings</span><em>Audio, play, access, saves</em></summary>
          <div class="settings-body">
            <section class="setting-section" aria-labelledby="settings-audio">
              <div class="setting-section-head"><span id="settings-audio">Audio</span><em>Mix the road</em></div>
              <div class="settings-row setting-switches">
                <button class="setting-switch" data-act="sound"></button>
                <button class="setting-switch" data-act="music"></button>
              </div>
              <label class="slider-row"><span>Effects</span><input aria-label="Effects volume" type="range" min="0" max="100" data-vol="sound"><output data-vol-out="sound"></output></label>
              <label class="slider-row"><span>Music</span><input aria-label="Music volume" type="range" min="0" max="100" data-vol="music"><output data-vol-out="music"></output></label>
            </section>
            <section class="setting-section" aria-labelledby="settings-battle">
              <div class="setting-section-head"><span id="settings-battle">Battle</span><em>Pace and feedback</em></div>
              <div class="settings-row setting-switches">
                <button class="setting-switch wide" data-act="speed"></button>
                <button class="setting-switch" data-act="numbers"></button>
              </div>
              <div class="settings-row setting-switches">
                <button class="setting-switch" data-act="shake"></button>
                <button class="setting-switch" data-act="pauseblur"></button>
              </div>
              <button class="setting-link" data-act="hotkeys"><span>Key bindings</span><em>Heroes, abilities, pause</em><b>›</b></button>
            </section>
            <section class="setting-section" aria-labelledby="settings-access">
              <div class="setting-section-head"><span id="settings-access">Display &amp; access</span><em>Read the field clearly</em></div>
              <div class="settings-row setting-switches three">
                <button class="setting-switch" data-act="motion"></button>
                <button class="setting-switch" data-act="colorsafe"></button>
                <button class="setting-switch" data-act="bigtext"></button>
              </div>
            </section>
            <section class="setting-section" aria-labelledby="settings-save">
              <div class="setting-section-head"><span id="settings-save">Campaign data</span><em>Stored on this device</em></div>
              <button class="setting-link" data-act="bands"><span>Band saves</span><em>Three separate campaigns</em><b>›</b></button>
              <div class="settings-row compact-actions">
                <button class="toggle-btn" data-act="export-save">Copy save</button>
                <button class="toggle-btn" data-act="import-save">Import save</button>
              </div>
              <button class="setting-link quiet" data-act="export-data"><span>Copy playtest report</span><em>Battle results only</em><b>›</b></button>
              ${(window as unknown as { __installPrompt?: unknown }).__installPrompt ? `<button class="setting-link quiet" data-act="install"><span>Install Wayband</span><em>Play from your home screen</em><b>›</b></button>` : ""}
              <button class="setting-link danger" data-act="reset"><span>Erase this band</span><em>Levels, heroes, gear, and records</em><b>›</b></button>
            </section>
          </div>
        </details>
        <div class="credit">drag your heroes · draw your spells · shape your band</div>
        <div class="version-tag">WAYBAND · woodland build</div>
      </div>
    `);
    const syncToggles = () => {
      const setSwitch = (act: string, label: string, on: boolean) => {
        const button = page.querySelector(`[data-act="${act}"]`) as HTMLElement;
        button.classList.toggle("on", on);
        button.innerHTML = `<span>${label}</span><b>${on ? "On" : "Off"}</b>`;
        button.setAttribute("aria-pressed", String(on));
      };
      setSwitch("sound", "Effects", this.save.sound);
      setSwitch("music", "Music", this.save.music);
      const speed = page.querySelector('[data-act="speed"]') as HTMLElement;
      speed.innerHTML = `<span>Combat pace</span><b>${speedLabel(this.save.speed)}</b>`;
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
          this.save.seenIntro = true;
          persist(this.save);
          this.renderFirstRun();
        } else {
          this.renderMap();
        }
      }
      if (act === "tutorial") this.renderTutorials();
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
          navigator.clipboard.writeText(code).then(finish, () => prompt("Copy your save code:", code));
        } else {
          prompt("Copy your save code:", code);
        }
      }
      if (act === "import-save") {
        const code = prompt("Paste a save code:");
        if (code) {
          try {
            const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
            if (!data || data.version !== 1 || !Array.isArray(data.heroes)) throw new Error("bad");
            localStorage.setItem(slotKey(), JSON.stringify(data));
            location.reload();
          } catch {
            this.showToast("That code didn't look like a Wayband save");
          }
        }
      }
      if (act === "export-data") {
        const json = exportTelemetry();
        const finish = () => this.showToast(`Playtest data copied (${telemetrySummary()})`);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(json).then(finish, () => prompt("Copy playtest data:", json));
        } else {
          prompt("Copy playtest data:", json);
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

  // ------------------------------------------------------------------ map

  renderMap(): void {
    this.pushNav("map");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const seasoned = bandLevel(save);
    const pendingPoints = save.heroes.reduce((sum, hero, index) => sum + (hero.recruited ? save.unspent[index] : 0), 0);
    const recruitReady = save.heroes.some((hero, index) => !hero.recruited && heroArrived(save, index) && (RECRUIT_COST[index] ?? Infinity) <= save.gold);
    const suggestedJourneyNote = pendingPoints > 0
      ? `${pendingPoints} attribute point${pendingPoints === 1 ? "" : "s"} waiting in Party`
      : recruitReady
        ? "A new companion can be hired in the Tavern"
        : `Scout ${STAGES[Math.min(save.unlockedStage, STAGES.length - 1)].name} and set out`;
    const journeyNote = save.pinnedGoal ?? suggestedJourneyNote;
    const page = el(`
      <div class="page journey-page ${save.unlockedStage >= 12 ? "coast-journey" : save.unlockedStage >= 6 ? "winter-journey" : "woodland-journey"}">
        <div class="map-header">
          <div>
            <div class="map-title">The Long Road</div>
            <div class="map-level">A band of ${save.heroes.filter((h) => h.recruited).length} · finest at level ${seasoned} · <span class="gold-chip">${ico("coin")} <span class="gold-num">${save.gold}</span></span></div>
          </div>
        </div>
        <aside class="journey-ribbon" aria-label="Journey progress">
          <div class="journey-chapter">${save.unlockedStage < 6 ? "The South Road · stages I–VI" : save.unlockedStage < 12 ? "The Winterreach · stages VII–XII" : "Stormbreak Coast · stages XIII–XVIII"}</div>
          <div class="journey-track" aria-hidden="true">
            ${STAGES.map((_, index) => `<i class="${index < save.unlockedStage ? "done" : index === save.unlockedStage ? "current" : ""}"></i>`).join("")}
          </div>
          <div class="journey-next"><span>Next move</span><strong>${journeyNote}</strong><button class="journey-pin" data-act="goal">${save.pinnedGoal ? "Change" : "Pin a goal"}</button></div>
        </aside>
        <div class="world-map"></div>
        <div class="stage-caption"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="difficulty" style="border-color:${DIFFICULTIES[save.difficulty].color};color:${DIFFICULTIES[save.difficulty].color}">${ico("skull")} ${DIFFICULTIES[save.difficulty].name}</button>
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
      if (act === "home") {
        audio.play("click");
        this.renderTitle();
      }
    });
    this.mount(page, "battle");
    this.tickGold(page);
    this.maybeOfferBoons();
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
      if (target.closest('[data-act="back"]')) return void this.renderMap();
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
      if (target.closest('[data-act="back"]')) return void this.renderShop("tavern");
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

  /** Level-up boon picks queue up here: one hero, two gifts, one choice. */
  private maybeOfferBoons(): void {
    const save = this.save;
    const next = save.pendingBoons[0];
    if (!next || document.querySelector(".boon-pop")) return;
    const hero = save.heroes[next.hero];
    const def = HEROES[next.hero];
    if (!hero || !def) {
      save.pendingBoons.shift();
      return;
    }
    const a = boonById(next.a);
    const b = boonById(next.b);
    if (!a || !b) {
      save.pendingBoons.shift();
      return;
    }
    const card = (boon: NonNullable<typeof a>, key: string) => `
      <button class="big-btn boon-card ${boon.rarity === "rare" ? "rare" : ""}" data-boon="${key}">
        <strong>${boon.name}${boon.rarity === "rare" ? " ✦" : ""}</strong>
        <em>${boon.blurb}</em>
      </button>`;
    const pop = el(`
      <div class="levelup-pop boon-pop">
        <div class="levelup-card">
          <div class="levelup-burst">✦</div>
          <div class="levelup-title">LEVEL ${hero.level}</div>
          <div class="levelup-line"><strong>${def.name}</strong> grows — choose their boon${save.pendingBoons.length > 1 ? ` <span class="boon-queue">(${save.pendingBoons.length} waiting)</span>` : ""}</div>
          <div class="boon-row">${card(a, "a")}${card(b, "b")}</div>
        </div>
      </div>
    `);
    navigator.vibrate?.([16, 40, 24]);
    audio.play("ready");
    pop.addEventListener("click", (event) => {
      const pick = (event.target as HTMLElement).closest("[data-boon]")?.getAttribute("data-boon");
      if (!pick) return;
      const chosen = pick === "a" ? a : b;
      hero.boons.push(chosen.id);
      save.pendingBoons.shift();
      persist(save);
      audio.play(chosen.rarity === "rare" ? "relic" : "levelup");
      this.showToast(`${def.name} takes ${chosen.name}`);
      pop.remove();
      this.maybeOfferBoons();
    });
    this.root.appendChild(pop);
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
      travel = `<circle r="7" fill="#ffe9a3" stroke="#112d36" stroke-width="2"><animateMotion dur="1.6s" fill="freeze" path="M ${a.x} ${a.y} L ${b.x} ${b.y}"/></circle>`;
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
    svg.addEventListener("click", (event) => {
      const node = (event.target as Element).closest(".map-node.open") as Element | null;
      if (!node) return;
      const idx = Number(node.getAttribute("data-stage"));
      audio.unlock(); audio.play("click");
      if (this.selectedStage === idx) return void this.showEmbarkBriefing(idx);
      this.selectedStage = idx;
      svg.querySelectorAll(".map-node.sel").forEach((item) => item.classList.remove("sel"));
      node.classList.add("sel");
      const caption = this.root.querySelector(".stage-caption");
      if (caption) { caption.innerHTML = ""; caption.appendChild(this.buildScoutCard(idx)); }
    });
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
      travel = `<g><circle r="7" fill="#ffe9a3" stroke="#1a2634" stroke-width="2"><animateMotion dur="1.6s" fill="freeze" path="M ${a.x} ${a.y} L ${b.x} ${b.y}"/></circle></g>`;
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
    svg.addEventListener("click", (event) => {
      const node = (event.target as Element).closest(".map-node.open") as Element | null;
      if (!node) return;
      const idx = Number(node.getAttribute("data-stage"));
      audio.unlock();
      audio.play("click");
      if (this.selectedStage === idx) {
        this.showEmbarkBriefing(idx);
        return;
      }
      this.selectedStage = idx;
      svg.querySelectorAll(".map-node.sel").forEach((g) => g.classList.remove("sel"));
      node.classList.add("sel");
      const caption = this.root.querySelector(".stage-caption");
      if (caption) {
        caption.innerHTML = "";
        caption.appendChild(this.buildScoutCard(idx));
      }
    });
    return svg;
  }

  private showGoalPicker(suggested: string): void {
    const goals = [
      suggested,
      "Save gold for the next recruit",
      "Complete a matching armor set",
      "Raise a hero to their Calling",
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
    const pop = el(`
      <div class="levelup-pop briefing-pop">
        <div class="levelup-card preparation-sheet">
          <div class="briefing-kicker">PREPARATION TABLE · ${DIFFICULTIES[this.save.difficulty].name.toUpperCase()}</div>
          <div class="levelup-title">${stage.name}</div>
          <div class="levelup-line">${stage.subtitle}</div>
          <div class="brief-party">
            ${party.map((index) => `<span style="--accent:${HEROES[index].accent}"><b>${HEROES[index].name}</b><em>${buildIdentity(this.save, index)}</em></span>`).join("")}
          </div>
          <div class="brief-section"><strong>Opening formation</strong><em id="formation-copy">${formationCopy[this.save.formation]}</em></div>
          <div class="formation-row">
            ${(["line", "wedge", "guard"] as const).map((formation) => `<button class="formation-btn ${this.save.formation === formation ? "on" : ""}" data-formation="${formation}"><i class="formation-glyph ${formation}"></i>${formation}</button>`).join("")}
          </div>
          <div class="intent-card"><span>${ico("skull")}</span><div><em>SCOUT'S WARNING · ${warning.name}</em><strong>${warning.habit}</strong></div></div>
          <div class="levelup-actions">
            <button class="big-btn primary" data-brief="embark">Embark now</button>
            <button class="big-btn" data-brief="party">Adjust the band</button>
            <button class="big-btn" data-brief="cancel">Not yet</button>
          </div>
        </div>
      </div>
    `);
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
        pop.remove();
        this.renderParty();
      } else if (action === "cancel" || event.target === pop) pop.remove();
    });
    this.root.appendChild(pop);
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
          ${stage.terrain ? `<span class="scout-chip">${stage.terrain.includes("tide") ? "≋ shifting tide" : ""}${stage.terrain === "tide-storm" ? " · " : ""}${stage.terrain.includes("storm") ? "ϟ lightning" : ""}</span>` : ""}
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
          .map((kind) => `<div><em>${ENEMIES[kind].name}</em><strong>${ENEMIES[kind].habit}</strong></div>`)
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
          <div class="atlas-beyond"><i></i><span>XIX–LX</span><em>Road uncharted</em></div>
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
    const name = atlas.querySelector("[data-region-name]")!;
    let active = currentRegion;
    const showRegion = (next: number, smooth = true) => {
      active = Math.max(0, Math.min(regions.length - 1, next));
      viewport.scrollTo({ left: viewport.clientWidth * active, behavior: smooth && !this.save.reducedMotion ? "smooth" : "auto" });
      name.textContent = regions[active].name;
      atlas.querySelectorAll(".atlas-mark").forEach((mark, i) => mark.classList.toggle("on", i === active));
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
      travel = `
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
              <animateTransform attributeName="transform" type="translate" values="-80 0; 720 24; -80 0" dur="52s" repeatCount="indefinite"/>
            </ellipse>
            <ellipse cx="0" cy="260" rx="52" ry="13">
              <animateTransform attributeName="transform" type="translate" values="700 0; -90 -18; 700 0" dur="64s" repeatCount="indefinite"/>
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
    svg.addEventListener("click", (event) => {
      const node = (event.target as Element).closest(".map-node.open") as Element | null;
      if (!node) return;
      const idx = Number(node.getAttribute("data-stage"));
      audio.unlock();
      audio.play("click");
      // first tap scouts the stage; tapping the scouted node again sets out
      if (this.selectedStage === idx) {
        this.callbacks.startStage(idx);
        return;
      }
      this.selectedStage = idx;
      svg.querySelectorAll(".map-node.sel").forEach((g) => g.classList.remove("sel"));
      node.classList.add("sel");
      const caption = this.root.querySelector(".stage-caption");
      if (caption) {
        caption.innerHTML = "";
        caption.appendChild(this.buildScoutCard(idx));
      }
    });
    return svg;
  }

  // ------------------------------------------------------------------ bestiary

  renderBestiary(): void {
    this.pushNav("bestiary");
    this.root.innerHTML = "";
    this.show();
    const kinds: EnemyKind[] = ["goblin", "wolf", "archer", "shaman", "brute", "ogre", "alpha", "warlord", "frostwolf", "icewisp", "snowhag", "rimetroll", "rimeheart"];
    const discovered = kinds.filter((k) => (this.save.bestiary[k] ?? 0) > 0).length;
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Records</div>
            <div class="map-level">${discovered}/${kinds.length} foes catalogued — defeat a creature to learn its ways</div>
          </div>
          
        </div>
        <div class="shop-tabs"><button class="shop-tab" data-rec="chronicle">${ico("chart")} Chronicle</button><button class="shop-tab on" data-rec="bestiary">${ico("book")} Bestiary</button></div>
        <div class="beast-list"></div>
      </div>
    `);
    const list = page.querySelector(".beast-list")!;
    for (const kind of kinds) {
      const def = ENEMIES[kind];
      const kills = this.save.bestiary[kind] ?? 0;
      if (kills > 0) {
        // knowledge is earned in tiers: lore at first blood, habits at 10, full measure at 25
        const T2 = 10;
        const T3 = 25;
        const habitLine =
          kills >= T2
            ? `<div class="beast-habit">${ico("sword")} ${def.habit}</div>`
            : `<div class="beast-habit beast-locked">${ico("sword")} Its ways are unclear — slay ${T2 - kills} more</div>`;
        const statLine =
          kills >= T3
            ? `<div class="beast-stats">${def.maxHp} hp · ${def.damage} dmg · ${def.range > 100 ? "ranged" : "melee"}${def.armor ? " · armored" : ""}</div>`
            : `<div class="beast-stats beast-locked">Full measure at ${T3} slain (${kills}/${T3})</div>`;
        const rank = kills >= T3 ? ' · <span class="beast-rank">mastered</span>' : "";
        const card = el(`
          <div class="beast-card" style="--beast:${def.body}">
            <div class="beast-icon"><canvas width="64" height="64"></canvas></div>
            <div class="beast-info">
              <div class="beast-name">${def.name} <span class="beast-kills">×${kills} slain${rank}</span></div>
              <div class="beast-lore">${def.lore}</div>
              ${habitLine}
              ${statLine}
              ${kills < T3 ? `<div class="beast-bar"><div style="width:${Math.min(100, (kills / T3) * 100)}%"></div></div>` : ""}
            </div>
          </div>
        `);
        drawBeastIcon(card.querySelector("canvas")!, kind);
        list.appendChild(card);
      } else {
        list.appendChild(
          el(`
            <div class="beast-card unknown">
              <div class="beast-icon"><div class="beast-mystery">?</div></div>
              <div class="beast-info">
                <div class="beast-name">Unknown creature</div>
                <div class="beast-lore">Rumors only. Defeat one to record it here.</div>
              </div>
            </div>
          `),
        );
      }
    }
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "back") {
        audio.play("click");
        this.renderMap();
      }
    });
    this.mount(page, "records");
  }

  // ------------------------------------------------------------------ hotkeys

  /** Rebind the battle keys: tap a row, press a key. */
  renderHotkeys(): void {
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const ROWS: [string, string][] = [
      ["hero1", "Select hero 1"],
      ["hero2", "Select hero 2"],
      ["hero3", "Select hero 3"],
      ["hero4", "Select hero 4"],
      ["ability1", "Cast ability 1"],
      ["ability2", "Cast ability 2"],
      ["ability3", "Cast the ULTIMATE"],
    ];
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Hotkeys</div>
            <div class="map-level">Tap a row, then press the key you want · aimed spells follow the mouse, click casts, Esc cancels</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Title</button>
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
        window.removeEventListener("keydown", capture, true);
        audio.play("click");
        this.renderTitle();
      }
    });
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ save slots

  /** Three bands, three tales — pick which one takes the road. */
  renderProfiles(): void {
    this.root.innerHTML = "";
    this.show();
    const current = activeSlot();
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Bands</div>
            <div class="map-level">Three tales, kept apart — switching never loses a thing</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Title</button>
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
        this.renderTitle();
      }
    });
    this.root.appendChild(page);
  }

  /** The campaign's last page: the storm breaks and the road goes on. */
  renderFinale(): void {
    this.pendingFinale = false;
    this.root.innerHTML = "";
    this.show();
    const lt = this.save.lifetime;
    const done = DEEDS.filter((d) => d.done(this.save)).length;
    const page = el(`
      <div class="page title-page finale-page">
        <div class="title-block">
          <div class="game-logo" style="font-size:40px">THE ROAD'S END</div>
          <div class="game-sub">Stormjaw is fallen. The black tide retreats. Dawn reaches the coast at last.</div>
        </div>
        <div class="campfire-scene" aria-hidden="true">
          <svg viewBox="0 0 360 120">
            <defs><linearGradient id="dawnsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a54"/><stop offset="0.6" stop-color="#c9825a"/><stop offset="1" stop-color="#f2c98a"/></linearGradient></defs>
            <rect width="360" height="120" rx="12" fill="url(#dawnsky)"/>
            <circle cx="286" cy="86" r="22" fill="#ffe9a3"/>
            <circle cx="286" cy="86" r="34" fill="#ffe9a3" opacity="0.25"/>
            <path d="M 0 96 Q 90 78 180 92 T 360 88 L 360 120 L 0 120 Z" fill="#527b82"/>
            <path d="M 0 104 Q 120 92 240 102 T 360 100 L 360 120 L 0 120 Z" fill="#c4b47d"/>
            ${this.save.heroes
              .map((h, i) => ({ h, i }))
              .filter(({ h }) => h.recruited)
              .slice(0, 8)
              .map(({ i }, at) => {
                const sx = 60 + at * 26;
                const sy = 92 - at * 1.2;
                return `<g fill="#1c2634"><circle cx="${sx}" cy="${sy - 12}" r="5"/><rect x="${sx - 4.5}" y="${sy - 9}" width="9" height="14" rx="3.4"/><rect x="${sx - 4.5}" y="${sy - 7.5}" width="9" height="2.4" rx="1.2" fill="${HEROES[i].accent}" opacity="0.7"/></g>`;
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
        this.renderMap();
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
      ["Spells cast", String(lt.casts)],
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
        this.renderMap();
      }
    });
    this.mount(page, "records");
  }

  // ------------------------------------------------------------------ tutorials

  /** One-time fork for brand-new players: lessons first, or straight to the road. */
  renderFirstRun(): void {
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page title-page">
        <div class="title-block">
          <div class="game-logo" style="font-size:34px">FIRST STEPS</div>
          <div class="game-sub">Lead a small company in real time. Two minutes of practice makes the first battle much clearer.</div>
        </div>
        <div class="guide-list first-steps-list">
          <div class="shop-note"><strong>1 · Command</strong> — drag a hero onto open ground to move, or onto a foe to attack.</div>
          <div class="shop-note"><strong>2 · Cast</strong> — tap an ability for an instant spell; drag an aimed ability onto the battlefield.</div>
          <div class="shop-note"><strong>3 · Grow</strong> — after battle, spend each hero's points however you like. There are no fixed classes.</div>
        </div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="learn">Practice for two minutes (recommended)</button>
          <button class="big-btn" data-act="skip">${ico("play")} Skip practice and see the map</button>
        </div>
        <div class="credit">practice is always available from How to Play</div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      audio.unlock();
      audio.play("click");
      if (act === "learn") this.callbacks.startTutorial("basics");
      else this.renderMap();
    });
    this.root.appendChild(page);
  }

  renderTutorials(): void {
    this.root.innerHTML = "";
    this.show();
    const lessons = [
      { kind: "basics", icon: "🗡", name: "The Basics", blurb: "Moving, attacking, your first spells, and healing. Start here." },
      { kind: "gestures", icon: "🎯", name: "Gesture Spells", blurb: "Practice aiming rays, blast circles, and frost trails." },
      { kind: "healing", icon: "✚", name: "Healing & Stances", blurb: "Channel heals, Mend, and switching your healer's stance." },
      { kind: "village", icon: "🏪", name: "The Village", blurb: "Gold, recruiting, gear, and the spell shop — a quick guide." },
    ];
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">How to Play</div>
            <div class="map-level">Short lessons — pick any, skip anytime</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Back</button>
        </div>
        <div class="lesson-list"></div>
      </div>
    `);
    const list = page.querySelector(".lesson-list")!;
    for (const lesson of lessons) {
      const card = el(`
        <button class="stage-card lesson-card" data-lesson="${lesson.kind}">
          <div class="stage-num">${lesson.icon}</div>
          <div class="stage-info">
            <div class="stage-name">${lesson.name}</div>
            <div class="stage-sub">${lesson.blurb}</div>
          </div>
          <div class="stage-waves">▶</div>
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
        else this.callbacks.startTutorial(kind);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderTitle();
      }
    });
    this.root.appendChild(page);
  }

  renderVillageGuide(): void {
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Village</div>
            <div class="map-level">Everything gold can buy</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Back</button>
        </div>
        <div class="guide-list">
          <div class="shop-note"><strong>${ico("coin")} Gold</strong> — every foe you slay and stage you clear pays gold. Even defeats salvage half the spoils.</div>
          <div class="shop-note"><strong>🍺 The Tavern</strong> — recruit new heroes to the band. Anyone hired can be rotated in or out of your fighting party of ${PARTY_CAP} on the Party screen.</div>
          <div class="shop-note"><strong>${ico("shield")} The Armory</strong> — weapons upgrade in tiers, but armor is a WARDROBE across THREE slots: body, helm, and boots. Every piece changes passive stats or combat traits; wear two or three pieces of one family and the SET answers with more. The Forge reworks any owned piece up to +3, and the great foes each guard a RELIC piece for whoever fells them first.</div>
          <div class="shop-note"><strong>${ico("spark")} The Spell Shop</strong> — unlock a spell once for the whole band, then assign it to any hero whose attributes meet its bar. Each hero carries up to ${MAX_EQUIPPED} spells.</div>
          <div class="shop-note"><strong>${ico("banner")} Six founding callings</strong> — swear an oath at level ${CALLING_UNLOCK_LEVEL}. Earn ${CALLING_MASTERY_LEVELS} levels beneath it to retain its mastery lesson after switching. At level ${ADV_CALLING_LEVEL}, a mastered oath promotes down one of two permanent paths.</div>
          <div class="shop-note"><strong>${ico("skull")} Bosses</strong> — the great foes hunt whoever HURTS them most. Pour damage in and a boss turns on you; your warrior holds its anger just by standing in its face, and taunts trump everything. Marked ground means MOVE.</div>
          <div class="shop-note"><strong>⌨ Keyboard</strong> — on a computer: 1–4 picks a hero, Q/W/E casts, R is the ultimate. Aimed spells follow the mouse; click casts, Esc cancels. Rebind in Settings.</div>
          <div class="shop-note"><strong>${ico("star")} Talents</strong> — every 2 band levels, each hero earns a talent point for the Strength, Dexterity, and Magic trees. Find them on the Party screen.</div>
        </div>
      </div>
    `);
    page.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest('[data-act="back"]')) {
        audio.play("click");
        this.renderTutorials();
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
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div class="equip-title">
            <div class="hero-avatar portrait" style="background:${def.accent}"><canvas width="64" height="64"></canvas></div>
            <div>
              <div class="map-title">${def.name}'s Talents</div>
              <div class="map-level">${free} point${free === 1 ? "" : "s"} to spend · earn 1 per 2 band levels (cap ${MAX_LEVEL})</div>
            </div>
          </div>
        </div>
        <div class="shop-note">◆ marks <strong>keystones</strong> — one point, one new way to fight. Deeper tiers open at ${TIER_UNLOCK[1]} and ${TIER_UNLOCK[2]} points in a tree.</div>
        <div class="talent-trees"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="reset-talents">Reset talents (free)</button>
        </div>
      </div>
    `);
    drawHeroPortrait(page.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, save);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "talents"));
    const trees = page.querySelector(".talent-trees")!;
    const treeKeys = Object.keys(TALENT_TREES) as TalentTree[];
    if (!this.talentTreeSel) this.talentTreeSel = treeKeys[0];
    const chips = el(`<div class="tree-chips"></div>`);
    for (const key of treeKeys) {
      const t = TALENT_TREES[key];
      const pts = talentPointsInTree(hero.talents, key);
      chips.appendChild(
        el(
          `<button class="tree-chip ${key === this.talentTreeSel ? "sel" : ""}" style="--tree:${t.color}" data-tree="${key}">${t.icon} ${t.name}${pts > 0 ? ` <span class="tree-spent">${pts}</span>` : ""}</button>`,
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
          <div class="talent-col-head">${tree.icon} ${tree.name} <span class="tree-spent">${inTree}p</span></div>
        </div>
      `);
      for (const tier of [1, 2, 3] as const) {
        const need = TIER_UNLOCK[tier - 1];
        const open = inTree >= need;
        if (tier > 1) {
          column.appendChild(
            el(`<div class="tier-rule ${open ? "open" : ""}">${open ? `— tier ${tier} —` : `🔒 ${need} points in ${tree.name}`}</div>`),
          );
        }
        for (const talent of TALENTS.filter((t) => t.tree === treeKey && t.tier === tier)) {
          const rank = hero.talents[talent.id] ?? 0;
          const maxed = rank >= talent.maxRank;
          const pips =
            talent.maxRank > 1
              ? `<div class="talent-pips">${Array.from({ length: talent.maxRank }, (_, r) => `<i class="${r < rank ? "on" : ""}"></i>`).join("")}</div>`
              : `<div class="talent-pips key ${rank > 0 ? "on" : ""}">${rank > 0 ? "◆ learned" : "◆ keystone"}</div>`;
          column.appendChild(
            el(`
              <button class="talent-node ${talent.keystone ? "keystone" : ""} ${maxed ? "maxed" : ""} ${open && free > 0 && !maxed ? "can" : ""} ${open ? "" : "tier-locked"}" data-talent="${talent.id}">
                <div class="talent-name">${talent.keystone ? "◆ " : ""}${talent.name}</div>
                <div class="talent-blurb">${talent.blurb}${talent.maxRank > 1 ? " <em>/rank</em>" : ""}</div>
                ${pips}
              </button>
            `),
          );
        }
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
        const inTree = talentPointsInTree(hero.talents, talent.tree);
        if (inTree < TIER_UNLOCK[talent.tier - 1]) {
          this.showToast(`Locked — spend ${TIER_UNLOCK[talent.tier - 1] - inTree} more point${TIER_UNLOCK[talent.tier - 1] - inTree === 1 ? "" : "s"} in ${TALENT_TREES[talent.tree].name} first`);
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
        this.renderParty();
      }
    });
    this.mount(page, "party");
  }

  // ------------------------------------------------------------------ village shops

  renderShop(tab: "tavern" | "armory" | "smithy" | "spells" | "curios"): void {
    this.pushNav("shop");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    // the Tavern is its own door on the bottom bar — the Village tab row stays wares-only
    const tavern = tab === "tavern";
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
          <button class="shop-tab ${tab === "spells" ? "on" : ""}" data-tab="spells">${ico("spark")} Spells</button>
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
        this.renderShop(tabBtn.getAttribute("data-tab") as "armory" | "smithy" | "spells" | "curios");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderMap();
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
    for (let i = 0; i < HEROES.length; i++) {
      const def = HEROES[i];
      const hero = save.heroes[i];
      const cost = RECRUIT_COST[i];
      const arrived = heroArrived(save, i);
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
      const btn = (event.target as HTMLElement).closest("[data-recruit]");
      if (!btn) return;
      const i = Number(btn.getAttribute("data-recruit"));
      const cost = RECRUIT_COST[i] ?? 0;
      if (!this.spend(cost)) return;
      audio.play("tankard");
      this.save.heroes[i].recruited = true;
      this.save.heroes[i].active = partyRoster(this.save).length < PARTY_CAP;
      persist(this.save);
      this.showToast(`${HEROES[i].name} ${HEROES[i].title} joins the band!`);
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
    body.appendChild(
      el(`<div class="shop-note">Unlock a spell once, then assign it to any hero who meets its attribute — up to ${MAX_EQUIPPED} spells per hero, on the Party screen.</div>`),
    );
    // filter rail: thirty spells is a long shelf without one
    const owned = ABILITIES.filter((a) => save.unlockedSpells.includes(a.id)).length;
    body.appendChild(
      el(`
        <div class="shop-filters">
          <button class="filter-chip ${this.shopAttr === "all" ? "on" : ""}" data-filter="all">All</button>
          ${ATTR_KEYS.map(
            (k) => `<button class="filter-chip ${this.shopAttr === k ? "on" : ""}" data-filter="${k}">${ATTR_NAMES[k]}</button>`,
          ).join("")}
          <button class="filter-chip owned-chip ${this.shopHideOwned ? "on" : ""}" data-filter="hide-owned">Hide owned · ${owned}/${ABILITIES.length}</button>
        </div>
      `),
    );
    // shelved by attribute, cheapest gate first
    const shelf = [...ABILITIES]
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
        <button class="shop-tab ${active === "overview" ? "on" : ""}" data-htab="overview">${ico("banner")} Overview</button>
        <button class="shop-tab ${active === "gear" ? "on" : ""}" data-htab="gear">${ico("shield")} Gear</button>
        <button class="shop-tab ${active === "spells" ? "on" : ""}" data-htab="spells">${ico("spark")} Spells</button>
        <button class="shop-tab ${active === "talents" ? "on" : ""}" data-htab="talents">${ico("star")} Talents</button>
        <button class="shop-tab ${active === "calling" ? "on" : ""}" data-htab="calling" ${canCall ? "" : "disabled"}>${ico("sword")} Calling</button>
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
        this.renderParty();
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
          // only what still holds: owned spells the hero still qualifies for
          const gated = unlockedAbilities(h.attrs).map((a) => a.id);
          h.equipped = p.equipped.filter((id) => this.save.unlockedSpells.includes(id) && gated.includes(id)).slice(0, MAX_EQUIPPED);
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
        this.renderMap();
      }
    });
    this.mount(page, "party");
    this.maybeOfferBoons();
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
      hero.boons,
      hero.masteredCallings,
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
                  : `<span class="calling-tag dormant">${sworn.name} — dormant</span> · `
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
          <div data-stat="Spell power"><span>Spell power</span><strong>×${stats.spellPower.toFixed(2)}</strong></div>
        </div>
        <div class="stat-hint">tap any stat to see what it does</div>` : ""}
        <button class="trinket-row equip-row loadout-row" data-act="equip">
          <span class="loadout-slots"></span>
          <span class="loadout-text"><strong>Gear &amp; Spells</strong><em>${WEAPON_TIERS[hero.weaponTier].name} · ${armorById(hero.armor)?.name ?? "Traveler's Garb"}${trinket ? ` · ${trinket.name}` : ""} — tap to change</em></span>
          <span class="loadout-go">${ico("arrow")}</span>
        </button>
        ${full ? '<div class="attr-rows"></div>' : ""}
        <div class="card-actions">
          <button class="toggle-btn equip-btn" data-act="equip">${ico("shield")} Equip</button>
          ${save.unspent[index] > 0 ? `<button class="toggle-btn suggest-btn" data-act="suggest">${ico("spark")} Suggest</button>` : ""}
          <button class="toggle-btn talents-btn" data-act="talents">${ico("star")} Talents</button>
          <button class="toggle-btn calling-btn ${!sworn && hero.level >= CALLING_UNLOCK_LEVEL ? "beckons" : ""}"
            data-act="calling" ${!sworn && hero.level < CALLING_UNLOCK_LEVEL ? "disabled" : ""}
            ${sworn ? (oathHolds ? `style="border-color:${sworn.color};color:${sworn.color}"` : 'style="border-color:#ff9a85;color:#ff9a85"') : ""}>
            ${
              sworn
                ? `${ico(sworn.crest)} ${advInfo ? advInfo.adv.name : sworn.name}${oathHolds ? "" : " (dormant)"}`
                : hero.level >= CALLING_UNLOCK_LEVEL
                  ? "Choose a Calling"
                  : `Calling at level ${CALLING_UNLOCK_LEVEL}`
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
      // surface what the attribute does and the next spell it would unlock
      const nextGate = ABILITIES.filter((a) => a.gate.attr === key && a.gate.value > hero.attrs[key]).sort(
        (a, b) => a.gate.value - b.gate.value,
      )[0];
      const row = el(`
        <div class="attr-row">
          <div class="attr-name">
            ${ATTR_NAMES[key]}
            <div class="attr-sub">${ATTR_BLURBS[key]}${nextGate ? ` · <b>${nextGate.name}</b> at ${nextGate.gate.value}` : ""}</div>
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
      const statsBefore = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effCalling(), effAdv(), hero.boons, hero.masteredCallings);
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
      const statsAfter = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effCalling(), effAdv(), hero.boons, hero.masteredCallings);
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
      const before = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null, hero.boons, hero.masteredCallings);
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
      const after = deriveStats(hero.attrs, hero.weaponTier, heroGearOf(hero, save.forge), hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null, hero.boons, hero.masteredCallings);
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

  // ------------------------------------------------------------------ callings

  renderCalling(index: number): void {
    this.pushNav("calling", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const page = el(`
      <div class="page hero-sheet">
        <div class="map-header">
          <div>
            <div class="map-title">${def.name}'s Calling</div>
            <div class="map-level">${
              hero.calling
                ? `Sworn — switching costs ${CALLING_SWITCH_COST}g`
                : "Swear one oath — your first is free, and stats never lock"
            } · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div>
          </div>
        </div>
        <div class="calling-grid"></div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "calling"));
    const grid = page.querySelector(".calling-grid")!;
    const FAMILY_ORDER = ["Iron", "Blade", "Hunt", "Elemental", "Faith & Shadow"];
    const visibleIds = new Set<string>(FOUNDATIONAL_CALLING_IDS);
    if (hero.calling) visibleIds.add(hero.calling); // legacy oaths remain playable and switchable
    const ordered = CALLINGS.filter((calling) => visibleIds.has(calling.id)).sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
    let lastFamily = "";
    for (const c of ordered) {
      if (c.family !== lastFamily) {
        lastFamily = c.family;
        grid.appendChild(el(`<div class="calling-family">${c.family} <span>${ordered.filter((o) => o.family === c.family).length} paths</span></div>`));
      }
      const eligible = callingEligible(c, hero.attrs);
      const isSworn = hero.calling === c.id;
      const practice = Math.min(CALLING_MASTERY_LEVELS, hero.callingLevels[c.id] ?? 0);
      const mastered = hero.masteredCallings.includes(c.id);
      const card = el(`
        <div class="calling-card ${isSworn ? "sworn" : ""} ${eligible ? "" : "locked"}" style="--chip:${c.color}">
          <div class="calling-head">
            <span class="calling-crest">${ico(c.crest)}</span>
            <div class="calling-title"><strong>${c.name}</strong><em>${c.epithet}</em></div>
            ${isSworn ? `<span class="sworn-badge ${eligible ? "" : "dormant"}">${eligible ? "Sworn" : "Dormant"}</span>` : ""}
          </div>
          ${
            isSworn && !eligible
              ? '<div class="dormant-note">Oath dormant — passive and ultimate are offline until the requirements are met again.</div>'
              : ""
          }
          <div class="calling-req">${c.entry
            .map((e) => `<span class="req-chip ${hero.attrs[e.attr] >= e.value ? "met" : ""}">${ATTR_NAMES[e.attr]} ${e.value}</span>`)
            .join("")}</div>
          <div class="calling-passive">${c.passive}</div>
          <div class="mastery-track ${mastered ? "complete" : ""}"><span><b>${mastered ? "Mastered" : `Mastery ${practice}/${CALLING_MASTERY_LEVELS}`}</b><em>${mastered ? "Passive retained when another oath is active" : "Earn hero levels while this oath is active"}</em></span><i><b style="width:${(practice / CALLING_MASTERY_LEVELS) * 100}%"></b></i></div>
          <div class="calling-sig">
            <span class="spell-ico"></span>
            <span class="spell-info">
              <strong>${c.signature.name} <span class="ult-chip">ULT</span></strong>
              <em>${c.signature.blurb}</em>
              <em class="charge-hint">${c.chargeHint}</em>
            </span>
          </div>
          ${
            isSworn
              ? ""
              : `<button class="big-btn ${eligible ? "primary" : ""} swear-btn" data-swear="${c.id}" ${eligible ? "" : "disabled"}>
                  ${eligible ? (hero.calling ? `Switch — ${CALLING_SWITCH_COST}g` : "Swear the oath") : "Attributes too low"}
                </button>`
          }
        </div>
      `);
      const holder = card.querySelector(".spell-ico")!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 60;
      canvas.style.width = canvas.style.height = "30px";
      const cctx = canvas.getContext("2d")!;
      cctx.scale(2, 2);
      drawAbilityGlyph(cctx, c.signature.icon, 15, 15, 9, c.color);
      holder.appendChild(canvas);
      // level-20 advancement: the sworn calling shows its two branches
      if (isSworn && c.advanced) {
        const advReady = hero.level >= ADV_CALLING_LEVEL && mastered;
        const advWrap = el(`
          <div class="adv-section">
            <div class="adv-head">Promotion ${advReady ? "" : `<span>requires level ${ADV_CALLING_LEVEL} + mastery</span>`}</div>
            <div class="adv-branches"></div>
          </div>
        `);
        const branches = advWrap.querySelector(".adv-branches")!;
        for (const adv of c.advanced) {
          const isCurrent = hero.advCalling === adv.id;
          branches.appendChild(
            el(`
              <div class="adv-branch ${isCurrent ? "sworn" : ""} ${advReady ? "" : "locked"}">
                <strong>${adv.name} <em>${adv.epithet}</em>${isCurrent ? '<span class="sworn-badge">Chosen</span>' : ""}</strong>
                <span class="adv-line">${adv.passive}</span>
                <span class="adv-line ult">${adv.ultNote}</span>
                ${
                  isCurrent || !advReady
                    ? ""
                    : `<button class="big-btn ${hero.advCalling ? "" : "primary"} adv-btn" data-advance="${adv.id}">
                        ${hero.advCalling ? `Switch — ${ADV_SWITCH_COST}g` : "Advance"}
                      </button>`
                }
              </div>
            `),
          );
        }
        card.appendChild(advWrap);
      }
      grid.appendChild(card);
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const advance = target.closest("[data-advance]");
      if (advance) {
        const id = advance.getAttribute("data-advance")!;
        if (hero.level < ADV_CALLING_LEVEL || !hero.masteredCallings.includes(hero.calling ?? "")) return;
        if (hero.advCalling && !this.spend(ADV_SWITCH_COST)) return;
        hero.advCalling = id;
        if (hero.calling) hero.advancedCallings[hero.calling] = id;
        persist(save);
        audio.play("levelup");
        navigator.vibrate?.([20, 30, 50]);
        const found = advCallingById(id)!;
        this.showToast(`${def.name} rises: ${found.adv.name}, ${found.adv.epithet}!`);
        this.renderCalling(index);
        return;
      }
      const swear = target.closest("[data-swear]");
      if (swear) {
        const id = swear.getAttribute("data-swear")!;
        const c = callingById(id)!;
        if (!callingEligible(c, hero.attrs)) return;
        if (hero.calling && !this.spend(CALLING_SWITCH_COST)) return;
        hero.calling = id;
        hero.advCalling = hero.advancedCallings[id] ?? null;
        persist(save);
        audio.play("levelup");
        this.showToast(`${def.name} swears the ${c.name}'s oath — ${c.signature.name} joins the battle bar`);
        this.renderCalling(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderParty();
      }
    });
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
    const currentStats = () => deriveStats(hero.attrs, hero.weaponTier, currentGear(), hero.talents, hero.trinket, oathHolds ? hero.calling : null, oathHolds ? hero.advCalling : null, hero.boons, hero.masteredCallings);
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
        const alt = deriveStats(hero.attrs, hero.weaponTier, altGear, hero.talents, hero.trinket, oathHolds ? hero.calling : null, oathHolds ? hero.advCalling : null, hero.boons, hero.masteredCallings);
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
      if (target.closest('[data-act="back"]')) { audio.play("click"); this.renderParty(); }
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
                  ? `${WEAPON_LABEL[weapon]} — the ${sheetSworn!.name}'s oath guides the hand`
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
      deriveStats(hero.attrs, hero.weaponTier, gear, hero.talents, hero.trinket, sheetHolds ? hero.calling : null, sheetHolds ? hero.advCalling : null, hero.boons, hero.masteredCallings);
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
        this.renderParty();
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

  /** A battle-bar-first spell screen: select a slot, then assign one known spell. */
  renderSpells(index: number): void {
    this.pushNav("spells", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const hero = save.heroes[index];
    const def = HEROES[index];
    this.spellFocus = Math.max(0, Math.min(MAX_EQUIPPED - 1, this.spellFocus));
    const trainable = new Set(unlockedAbilities(hero.attrs).map((a) => a.id));
    const usable = ABILITIES.filter((a) => save.unlockedSpells.includes(a.id) && trainable.has(a.id));
    const unavailable = ABILITIES.filter((a) => !save.unlockedSpells.includes(a.id) || !trainable.has(a.id));
    const page = el(`
      <div class="page hero-sheet loadout-page spell-loadout-page">
        <div class="map-header"><div class="equip-title"><div><div class="map-title">${def.name} <em class="sheet-title">${def.title}</em></div>
          <div class="map-level">Build the battle bar one slot at a time · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div></div></div></div>
        <div class="spell-workbench">
          <section class="battlebar-panel">
            <div class="picker-head"><span>${ico("spark")} Battle bar</span><small>Choose a slot to edit</small></div>
            <div class="battlebar-slots"></div>
            <div class="battlebar-note">Spells appear in this order during combat.</div>
          </section>
          <section class="spell-picker">
            <div class="picker-head"><span>${ico("book")} Slot ${this.spellFocus + 1}</span><small>${hero.equipped[this.spellFocus] ? "Choose a replacement or clear it" : "Choose a spell"}</small></div>
            <div class="spell-choice-list"></div>
          </section>
        </div>
      </div>`);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "spells"));
    const slots = page.querySelector(".battlebar-slots")!;
    for (let s = 0; s < MAX_EQUIPPED; s++) {
      const id = hero.equipped[s] ?? null;
      const ability = id ? abilityById(id) : null;
      const slot = el(`<button class="battlebar-slot ${s === this.spellFocus ? "selected" : ""} ${id ? "filled" : "empty"}" data-slot="${s}" style="--chip:${ability?.color ?? "#6b6478"}"><span class="slot-number">${s + 1}</span><span class="spell-ico"></span><span><strong>${ability?.name ?? "Empty slot"}</strong><em>${ability?.blurb ?? "Tap to choose a spell"}</em></span><b>›</b></button>`);
      if (ability) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 68; canvas.style.width = canvas.style.height = "34px";
        const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); drawAbilityGlyph(ctx, ability.icon, 17, 17, 10, ability.color); slot.querySelector(".spell-ico")!.appendChild(canvas);
      }
      slots.appendChild(slot);
    }
    const sworn = callingById(hero.calling);
    if (sworn) {
      const holds = callingEligible(sworn, hero.attrs);
      slots.appendChild(el(`<div class="battlebar-slot signature ${holds ? "" : "dormant"}" style="--chip:${holds ? sworn.color : "#6b6478"}"><span class="slot-number">★</span><span class="spell-ico">${ico(sworn.crest)}</span><span><strong>${sworn.signature.name}</strong><em>${holds ? `${sworn.name} ultimate · always available` : "Calling requirements are not met"}</em></span><b>${holds ? "Bonus" : "Dormant"}</b></div>`));
    }
    const list = page.querySelector(".spell-choice-list")!;
    if (hero.equipped[this.spellFocus]) list.appendChild(el(`<button class="spell-choice clear-choice" data-clear="1"><span class="choice-icon">×</span><span><strong>Clear this slot</strong><em>Leave slot ${this.spellFocus + 1} empty</em></span></button>`));
    if (!usable.length) list.appendChild(el(`<div class="picker-empty">No usable spells yet. Unlock spells in the Village or train this hero's attributes.</div>`));
    for (const ability of usable) {
      const at = hero.equipped.indexOf(ability.id);
      const choice = el(`<button class="spell-choice ${at === this.spellFocus ? "equipped" : ""}" data-ability="${ability.id}" style="--chip:${ability.color}"><span class="spell-ico"></span><span><strong>${ability.name}</strong><em>${ability.blurb}</em><small>${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}${at >= 0 ? ` · currently in slot ${at + 1}` : ""}</small></span><b>${at === this.spellFocus ? "✓" : at >= 0 && this.spellFocus < hero.equipped.length ? "Swap" : at >= 0 ? "Added" : "Equip"}</b></button>`);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 68; canvas.style.width = canvas.style.height = "34px";
      const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); drawAbilityGlyph(ctx, ability.icon, 17, 17, 10, ability.color); choice.querySelector(".spell-ico")!.appendChild(canvas); list.appendChild(choice);
    }
    if (unavailable.length) {
      list.appendChild(el(`<details class="unavailable-spells"><summary>${unavailable.length} unavailable spell${unavailable.length === 1 ? "" : "s"}</summary><div>${unavailable.map((a) => `<button class="spell-choice locked" data-locked="${a.id}" style="--chip:${a.color}"><span class="choice-icon">${ico("lock")}</span><span><strong>${a.name}</strong><em>${!save.unlockedSpells.includes(a.id) ? "Unlock at the Village" : `Needs ${ATTR_NAMES[a.gate.attr]} ${a.gate.value}`}</em></span></button>`).join("")}</div></details>`));
    }
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const slot = target.closest("[data-slot]");
      if (slot) { this.spellFocus = Number(slot.getAttribute("data-slot")); audio.play("click"); this.renderSpells(index); return; }
      if (target.closest("[data-clear]")) { hero.equipped.splice(this.spellFocus, 1); persist(save); audio.play("click"); this.renderSpells(index); return; }
      const pick = target.closest("[data-ability]");
      if (pick) {
        const id = pick.getAttribute("data-ability")!;
        const next = [...hero.equipped];
        const existing = next.indexOf(id);
        if (existing === this.spellFocus) return;
        if (existing >= 0 && this.spellFocus >= next.length) { this.showToast(`${abilityById(id).name} is already in slot ${existing + 1}`); return; }
        if (existing >= 0 && this.spellFocus < next.length) [next[existing], next[this.spellFocus]] = [next[this.spellFocus], next[existing]];
        else { if (existing >= 0) next.splice(existing, 1); if (this.spellFocus < next.length) next[this.spellFocus] = id; else next.push(id); }
        hero.equipped = next.slice(0, MAX_EQUIPPED); persist(save); audio.play("levelup"); this.showToast(`${abilityById(id).name} assigned to slot ${this.spellFocus + 1}`); this.renderSpells(index); return;
      }
      const locked = target.closest("[data-locked]");
      if (locked) { const a = abilityById(locked.getAttribute("data-locked")!); this.showToast(!save.unlockedSpells.includes(a.id) ? "Unlock this spell at the Village first" : `Needs ${ATTR_NAMES[a.gate.attr]} ${a.gate.value}`); return; }
      if (target.closest('[data-act="back"]')) { audio.play("click"); this.renderParty(); }
    });
    this.mount(page, "party");
  }

  /** Previous expanded spellbook retained as a fallback reference. */
  renderSpellsLegacy(index: number): void {
    this.pushNav("spells", index);
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const hero = save.heroes[index];
    const def = HEROES[index];
    const unlocked = unlockedAbilities(hero.attrs).map((a) => a.id);
    const page = el(`
      <div class="page hero-sheet">
        <div class="map-header">
          <div class="equip-title">
            <div>
              <div class="map-title">${def.name} <em class="sheet-title">${def.title}</em></div>
              <div class="map-level">Spellcraft · <span class="gold-chip">${ico("coin")} ${save.gold}</span></div>
            </div>
          </div>
        </div>
        <div class="equip-slot loadout-panel">
          <div class="equip-slot-head">${ico("spark")} Spell loadout — <strong>${hero.equipped.length}/${MAX_EQUIPPED}</strong>
            <span class="loadout-hint ${this.pendingSpell ? "urgent" : ""}">${
              this.pendingSpell ? "tap a slot to swap it in" : "these fire from the battle bar"
            }</span>
          </div>
          <div class="slot-row"></div>
        </div>
        <div class="equip-slot">
          <div class="equip-slot-head">${ico("book")} Spellbook <span>tap to equip · tap again to remove</span></div>
          <div class="spell-grid"></div>
        </div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "spells"));

    // loadout slots
    const slotRow = page.querySelector(".slot-row")!;
    for (let s = 0; s < MAX_EQUIPPED; s++) {
      const id = hero.equipped[s] ?? null;
      const slot = el(`
        <button class="big-slot ${id ? "filled" : "empty"} ${this.pendingSpell ? "pulse" : ""}" data-slot="${s}" ${id ? `style="--chip:${abilityById(id).color}"` : ""}>
          <span class="big-slot-ico"></span>
          <span class="big-slot-name">${id ? abilityById(id).name : "Empty"}</span>
          ${id && !this.pendingSpell ? '<span class="big-slot-x">×</span>' : ""}
        </button>
      `);
      if (id) {
        const holder = slot.querySelector(".big-slot-ico")!;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 68;
        canvas.style.width = canvas.style.height = "34px";
        const cctx = canvas.getContext("2d")!;
        cctx.scale(2, 2);
        drawAbilityGlyph(cctx, abilityById(id).icon, 17, 17, 10, abilityById(id).color);
        holder.appendChild(canvas);
      }
      slotRow.appendChild(slot);
    }
    // sworn calling's ultimate rides along as a bonus fourth slot
    const swornCalling = callingById(hero.calling);
    const sheetOathHolds = swornCalling ? callingEligible(swornCalling, hero.attrs) : false;
    if (swornCalling) {
      const sigSlot = el(`
        <div class="big-slot filled signature ${sheetOathHolds ? "" : "dormant"}" style="--chip:${sheetOathHolds ? swornCalling.color : "#7d7590"}">
          <span class="big-slot-ico"></span>
          <span class="big-slot-name">${swornCalling.signature.name}</span>
          <span class="sig-tag">${ico(swornCalling.crest)} ${sheetOathHolds ? `${swornCalling.name} ultimate` : "oath dormant"}</span>
        </div>
      `);
      const sigHolder = sigSlot.querySelector(".big-slot-ico")!;
      const sigCanvas = document.createElement("canvas");
      sigCanvas.width = sigCanvas.height = 68;
      sigCanvas.style.width = sigCanvas.style.height = "34px";
      const sigCtx = sigCanvas.getContext("2d")!;
      sigCtx.scale(2, 2);
      drawAbilityGlyph(sigCtx, swornCalling.signature.icon, 17, 17, 10, swornCalling.color);
      sigHolder.appendChild(sigCanvas);
      slotRow.appendChild(sigSlot);
    }

    const grid = page.querySelector(".spell-grid")!;
    let lastAttr = "";
    for (const ability of [...ABILITIES].sort((a, b) => ATTR_KEYS.indexOf(a.gate.attr) - ATTR_KEYS.indexOf(b.gate.attr) || a.gate.value - b.gate.value)) {
      if (ability.gate.attr !== lastAttr) {
        lastAttr = ability.gate.attr;
        grid.appendChild(el(`<div class="spell-section">${ATTR_NAMES[ability.gate.attr]} <em>${hero.attrs[ability.gate.attr]} trained</em></div>`));
      }
      const gateOk = unlocked.includes(ability.id);
      const owned = save.unlockedSpells.includes(ability.id);
      const usable = gateOk && owned;
      const slotAt = hero.equipped.indexOf(ability.id);
      const isPending = this.pendingSpell === ability.id;
      const tag = !owned
        ? "Unlock at the Village"
        : !gateOk
          ? `Needs ${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}`
          : slotAt >= 0
            ? `Equipped — slot ${slotAt + 1}`
            : ability.blurb;
      const chip = el(`
        <button class="spell-chip ${usable ? "" : "locked"} ${slotAt >= 0 ? "equipped" : ""} ${isPending ? "pending" : ""}"
          style="--chip:${ability.color}" data-ability="${ability.id}">
          <span class="spell-ico"></span>
          <span class="spell-info">
            <strong>${ability.name}${isPending ? " — pick a slot" : ""}</strong>
            <em>${tag}</em>
          </span>
          ${slotAt >= 0 ? `<span class="slot-badge">${slotAt + 1}</span>` : ""}
        </button>
      `);
      const holder = chip.querySelector(".spell-ico")!;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 60;
      canvas.style.width = canvas.style.height = "30px";
      const cctx = canvas.getContext("2d")!;
      cctx.scale(2, 2);
      drawAbilityGlyph(cctx, ability.icon, 15, 15, 9, usable ? ability.color : "#6b6478");
      holder.appendChild(canvas);
      grid.appendChild(chip);
    }

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const slotBtn = target.closest("[data-slot]");
      if (slotBtn) {
        const at = Number(slotBtn.getAttribute("data-slot"));
        if (this.pendingSpell) {
          // swap the waiting spell into this slot
          if (at < hero.equipped.length) hero.equipped[at] = this.pendingSpell;
          else hero.equipped.push(this.pendingSpell);
          this.pendingSpell = null;
          audio.play("levelup");
          persist(save);
        } else if (hero.equipped[at]) {
          hero.equipped.splice(at, 1);
          audio.play("click");
          persist(save);
        }
        this.renderSpells(index);
        return;
      }
      const chip = target.closest("[data-ability]");
      if (chip) {
        const id = chip.getAttribute("data-ability")!;
        if (this.pendingSpell === id) {
          // tapping the waiting spell again cancels the swap
          this.pendingSpell = null;
          audio.play("click");
          this.renderSpells(index);
          return;
        }
        if (!save.unlockedSpells.includes(id)) {
          this.showToast("Buy this spell at the Village first");
          return;
        }
        if (!unlockedAbilities(hero.attrs).some((a) => a.id === id)) {
          const gate = abilityById(id).gate;
          this.showToast(`Needs ${ATTR_NAMES[gate.attr]} ${gate.value} — train up first`);
          return;
        }
        const at = hero.equipped.indexOf(id);
        if (at >= 0) hero.equipped.splice(at, 1);
        else if (hero.equipped.length < MAX_EQUIPPED) hero.equipped.push(id);
        else {
          // slots full: arm replace mode instead of scolding
          this.pendingSpell = id;
          audio.play("click");
          this.renderSpells(index);
          return;
        }
        audio.play("click");
        persist(save);
        this.renderSpells(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        this.pendingSpell = null;
        audio.play("click");
        this.renderParty();
      }
    });
    this.mount(page, "party");
  }

  private refreshCard(card: HTMLElement, index: number): HTMLElement {
    const fresh = this.heroCard(index);
    card.replaceWith(fresh);
    return fresh;
  }
}
