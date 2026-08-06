import { audio } from "./audio";
import {
  ABILITIES,
  ARMORS,
  ARMOR_FAMILY_TIER,
  armorById,
  ADV_CALLING_LEVEL,
  ADV_SWITCH_COST,
  advCallingById,
  CALLINGS,
  CALLING_SWITCH_COST,
  CALLING_UNLOCK_LEVEL,
  callingById,
  callingEligible,
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
  DEEDS,
  ENEMIES,
  HEROES,
  MAX_EQUIPPED,
  PARTY_CAP,
  POINTS_PER_LEVEL,
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
  pendingLevelUp: { level: number; gained: number } | null = null; // set on victory, shown once on the map
  private pendingSpell: string | null = null; // spell waiting for a slot in replace mode
  private figureTimer: number | null = null; // idle animation for the hero-sheet figure
  private selectedStage: number | null = null; // map node the scout report is showing
  private mapAct: 0 | 1 = 0; // which panel of the world we're looking at
  pendingFinale = false; // set when the Winterreach's king falls
  private shopAttr: AttrKey | "all" = "all"; // spell-shop filter
  private shopHideOwned = false;
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
            case "shop": this.renderShop("tavern"); break;
            case "bestiary": this.renderBestiary(); break;
            case "chronicle": this.renderChronicle(); break;
            case "hero": this.renderHeroOverview(st.a ?? 0); break;
            case "equip": this.renderEquipment(st.a ?? 0); break;
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

  // ------------------------------------------------------------------ title

  renderTitle(): void {
    this.pushNav("title");
    this.root.innerHTML = "";
    this.show();
    const page = el(`
      <div class="page title-page">
        <div class="title-block">
          <div class="game-logo">WAYBAND</div>
          <div class="game-sub">a classless company of four</div>
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
        <div class="title-buttons">
          <button class="big-btn primary" data-act="start">Set Out</button>
          <button class="big-btn" data-act="tutorial">How to Play</button>
        </div>
        <div class="settings-card">
          <div class="settings-title">Settings</div>
          <div class="settings-row">
            <button class="toggle-btn" data-act="sound"></button>
            <button class="toggle-btn" data-act="music"></button>
          </div>
          <div class="slider-row"><span>Effects</span><input type="range" min="0" max="100" data-vol="sound"></div>
          <div class="slider-row"><span>Music</span><input type="range" min="0" max="100" data-vol="music"></div>
          <button class="toggle-btn" data-act="speed"></button>
          <div class="settings-row">
            <button class="toggle-btn" data-act="motion"></button>
            <button class="toggle-btn" data-act="colorsafe"></button>
          </div>
          <button class="toggle-btn" data-act="bigtext"></button>
          <button class="toggle-btn" data-act="hotkeys">⌨ Hotkeys</button>
          <button class="toggle-btn" data-act="bands">${ico("banner")} Bands — save slots</button>
          <div class="settings-row">
            <button class="toggle-btn" data-act="export-save">${ico("upload")} Export save</button>
            <button class="toggle-btn" data-act="import-save">${ico("download")} Import save</button>
          </div>
          <button class="toggle-btn" data-act="export-data">${ico("chart")} Export playtest data</button>
          ${(window as unknown as { __installPrompt?: unknown }).__installPrompt ? `<button class="toggle-btn" data-act="install">${ico("download")} Install app</button>` : ""}
          <button class="toggle-btn danger" data-act="reset">Reset all progress</button>
        </div>
        <div class="credit">drag your heroes · draw your spells · shape your band</div>
        <div class="version-tag">WAYBAND · woodland build</div>
      </div>
    `);
    const syncToggles = () => {
      (page.querySelector('[data-act="sound"]') as HTMLElement).textContent = `Sound: ${this.save.sound ? "on" : "off"}`;
      (page.querySelector('[data-act="music"]') as HTMLElement).textContent = `Music: ${this.save.music ? "on" : "off"}`;
      (page.querySelector('[data-act="speed"]') as HTMLElement).textContent = `Combat speed: ${speedLabel(this.save.speed)}`;
      (page.querySelector('[data-act="motion"]') as HTMLElement).textContent = `Calm motion: ${this.save.reducedMotion ? "on" : "off"}`;
      (page.querySelector('[data-act="colorsafe"]') as HTMLElement).textContent = `Safe colors: ${this.save.colorSafe ? "on" : "off"}`;
      (page.querySelector('[data-act="bigtext"]') as HTMLElement).textContent = `Large text: ${this.save.bigText ? "on" : "off"}`;
    };
    syncToggles();
    // volume sliders live-update the mixer, persisting on release
    for (const kind of ["sound", "music"] as const) {
      const slider = page.querySelector(`[data-vol="${kind}"]`) as HTMLInputElement;
      slider.value = String(Math.round((kind === "sound" ? this.save.soundVol : this.save.musicVol) * 100));
      slider.addEventListener("input", () => {
        const v = Number(slider.value) / 100;
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
    const need = xpForLevel(save.level);
    const xpPct = Math.min(100, Math.round((save.xp / need) * 100));
    const roster = partyRoster(save);
    const unspentTotal = roster.reduce((sum: number, i: number) => sum + save.unspent[i], 0);
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Long Road</div>
            <div class="map-level">Band level ${save.level}/${MAX_LEVEL} · ${save.xp}/${need} xp · <span class="gold-chip">${ico("coin")} <span class="gold-num">${save.gold}</span></span></div>
            <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
          </div>
          <button class="big-btn party-btn" data-act="party">
            Party${unspentTotal > 0 ? ` <span class="badge">${unspentTotal}</span>` : ""}
          </button>
        </div>
        <div class="world-map"></div>
        <div class="stage-caption"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="difficulty" style="border-color:${DIFFICULTIES[save.difficulty].color};color:${DIFFICULTIES[save.difficulty].color}">${ico("skull")} ${DIFFICULTIES[save.difficulty].name}</button>
          <button class="toggle-btn" data-act="shop">${ico("home")} Village${
            save.heroes.some((h) => h.recruited && h.weaponTier + 1 < WEAPON_TIERS.length && WEAPON_TIERS[h.weaponTier + 1].cost <= save.gold) ||
            ARMORS.some((a) => a.cost > 0 && !save.armory.includes(a.id) && a.cost <= save.gold) ||
            ABILITIES.some((a) => !save.unlockedSpells.includes(a.id) && (SPELL_COSTS[a.id] ?? 100) <= save.gold) ||
            save.heroes.some((h, i) => !h.recruited && heroArrived(save, i) && (RECRUIT_COST[i] ?? Infinity) <= save.gold)
              ? ' <span class="shop-dot"></span>'
              : ""
          }</button>
          <button class="toggle-btn" data-act="chronicle">${ico("book")} Records</button>
          <button class="toggle-btn" data-act="home">Title</button>
        </div>
      </div>
    `);
    const maxIdx = Math.min(save.unlockedStage, STAGES.length - 1);
    this.selectedStage = Math.min(this.selectedStage ?? maxIdx, maxIdx);
    this.mapAct = (this.selectedStage ?? 0) >= 6 ? 1 : 0;
    if (save.unlockedStage >= 6) {
      page.querySelector(".world-map")!.appendChild(
        el(`<div class="act-tabs">
          <button class="shop-tab ${this.mapAct === 0 ? "on" : ""}" data-mapact="0">⛰ The South Road</button>
          <button class="shop-tab ${this.mapAct === 1 ? "on" : ""}" data-mapact="1">❄ The Winterreach</button>
        </div>`),
      );
    }
    page.querySelector(".world-map")!.appendChild(this.buildWorldMap());
    const caption = page.querySelector(".stage-caption")!;
    caption.appendChild(this.buildScoutCard(this.selectedStage));
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "embark") {
        audio.unlock();
        audio.play("click");
        this.callbacks.startStage(this.selectedStage ?? maxIdx);
      }
      if (act === "party") {
        audio.play("click");
        this.renderParty();
      }
      const mapActBtn = (event.target as HTMLElement).closest("[data-mapact]");
      if (mapActBtn) {
        audio.play("click");
        this.mapAct = Number(mapActBtn.getAttribute("data-mapact")) as 0 | 1;
        this.selectedStage = this.mapAct === 1 ? Math.max(6, Math.min(this.save.unlockedStage, 11)) : Math.min(this.save.unlockedStage, 5);
        this.renderMap();
        return;
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
    this.root.appendChild(page);
    this.tickGold(page);
    if (this.pendingLevelUp) {
      const info = this.pendingLevelUp;
      this.pendingLevelUp = null;
      const talentsGained = Math.floor(info.level / 2) - Math.floor((info.level - info.gained) / 2);
      const pop = el(`
        <div class="levelup-pop">
          <div class="levelup-card">
            <div class="levelup-burst">✦</div>
            <div class="levelup-title">LEVEL UP!</div>
            <div class="levelup-line">The band reaches <strong>level ${info.level}</strong></div>
            <div class="levelup-line">+${info.gained * POINTS_PER_LEVEL} attribute point${info.gained * POINTS_PER_LEVEL === 1 ? "" : "s"} for every hero${talentsGained > 0 ? ` · +${talentsGained} talent point${talentsGained === 1 ? "" : "s"}` : ""}</div>
            ${
              info.level - info.gained < CALLING_UNLOCK_LEVEL && info.level >= CALLING_UNLOCK_LEVEL
                ? '<div class="levelup-line callings-unlocked">Callings unlocked — each hero may now swear an oath on the Party screen</div>'
                : ""
            }
            ${
              info.level - info.gained < ADV_CALLING_LEVEL && info.level >= ADV_CALLING_LEVEL
                ? '<div class="levelup-line callings-unlocked">Advanced callings unlocked — every sworn oath can now deepen down one of two paths</div>'
                : ""
            }
            <div class="levelup-actions">
              <button class="big-btn primary" data-act="lv-spend">Spend points</button>
              <button class="big-btn" data-act="lv-later">Later</button>
            </div>
          </div>
        </div>
      `);
      navigator.vibrate?.([16, 40, 24]);
      pop.addEventListener("click", (event) => {
        const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
        if (act === "lv-spend") {
          audio.play("click");
          this.renderParty();
        } else if (act === "lv-later" || event.target === pop) {
          audio.play("click");
          pop.remove();
        }
      });
      this.root.appendChild(pop);
    }
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
    return card;
  }

  /** Painted SVG overworld: dawn sky, layered ridges, a river, themed regions, and tappable stage nodes. */
  private buildWorldMap(): HTMLElement {
    if (this.mapAct === 1) return this.buildWinterMap();
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
          <button class="big-btn party-btn" data-act="back">Map</button>
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
    this.root.appendChild(page);
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
      ["ability3", "Cast ability 3"],
      ["ability4", "Cast the ULTIMATE"],
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

  /** The campaign's last page: the king is down, the dawn comes, the road goes on. */
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
          <div class="game-sub">Rimeheart is fallen. The Winterreach is quiet. Dawn finds the band still standing.</div>
        </div>
        <div class="campfire-scene" aria-hidden="true">
          <svg viewBox="0 0 360 120">
            <defs><linearGradient id="dawnsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a54"/><stop offset="0.6" stop-color="#c9825a"/><stop offset="1" stop-color="#f2c98a"/></linearGradient></defs>
            <rect width="360" height="120" rx="12" fill="url(#dawnsky)"/>
            <circle cx="286" cy="86" r="22" fill="#ffe9a3"/>
            <circle cx="286" cy="86" r="34" fill="#ffe9a3" opacity="0.25"/>
            <path d="M 0 96 Q 90 78 180 92 T 360 88 L 360 120 L 0 120 Z" fill="#e8f0f5"/>
            <path d="M 0 104 Q 120 92 240 102 T 360 100 L 360 120 L 0 120 Z" fill="#c8dce8"/>
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
          <button class="big-btn party-btn" data-act="back">Map</button>
        </div>
        <div class="shop-tabs"><button class="shop-tab on" data-rec="chronicle">${ico("chart")} Chronicle</button><button class="shop-tab" data-rec="bestiary">${ico("book")} Bestiary</button></div>
        <div class="chron-grid">
          ${stats.map(([k, v]) => `<div class="chron-cell"><span>${k}</span><strong>${v}</strong></div>`).join("")}
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
    this.root.appendChild(page);
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
          <div class="game-sub">Wayband is played entirely by dragging. Two minutes of practice makes all the difference.</div>
        </div>
        <div class="title-buttons">
          <button class="big-btn primary" data-act="learn">🎓 Learn the ropes (recommended)</button>
          <button class="big-btn" data-act="skip">${ico("play")} Jump straight in</button>
        </div>
        <div class="credit">the lessons stay on the title screen if you change your mind</div>
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
          <div class="shop-note"><strong>${ico("shield")} The Armory</strong> — weapons upgrade in tiers, but armor is a WARDROBE: named pieces with real identities (a cloak that slips the first hit of a wave, plate that starts each fight shielded). Buy from the Armorer's Rack, dress heroes on their Equip screen — and the great foes each guard a RELIC piece for whoever fells them first.</div>
          <div class="shop-note"><strong>${ico("spark")} The Spell Shop</strong> — unlock a spell once for the whole band, then assign it to any hero whose attributes meet its bar. Each hero carries up to ${MAX_EQUIPPED} spells.</div>
          <div class="shop-note"><strong>${ico("banner")} Callings</strong> — at band level ${CALLING_UNLOCK_LEVEL} each hero may swear an oath their stats have earned: an always-on passive, regalia, and an ULTIMATE that charges as they play their role. At level ${ADV_CALLING_LEVEL} every oath deepens down one of two paths. Stats never lock — but drop below an oath's bar and it sleeps.</div>
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
    const budget = talentPointBudget(save.level);
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
          <button class="big-btn party-btn" data-act="back">Party</button>
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
        if (talentPointBudget(save.level) - talentPointsSpent(hero.talents) <= 0) {
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
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ village shops

  renderShop(tab: "tavern" | "armory" | "spells" | "curios"): void {
    this.pushNav("shop");
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Village</div>
            <div class="map-level"><span class="gold-chip">${ico("coin")} <span class="gold-num">${save.gold}</span> gold</span></div>
          </div>
          <button class="big-btn party-btn" data-act="back">Map</button>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab ${tab === "tavern" ? "on" : ""}" data-tab="tavern">🍺 Tavern</button>
          <button class="shop-tab ${tab === "armory" ? "on" : ""}" data-tab="armory">${ico("shield")} Armory</button>
          <button class="shop-tab ${tab === "spells" ? "on" : ""}" data-tab="spells">${ico("spark")} Spells</button>
          <button class="shop-tab ${tab === "curios" ? "on" : ""}" data-tab="curios">${ico("gem")} Curios</button>
        </div>
        <div class="shop-body"></div>
      </div>
    `);
    const body = page.querySelector(".shop-body")!;
    if (tab === "tavern") this.buildTavern(body);
    else if (tab === "armory") this.buildArmory(body);
    else if (tab === "curios") this.buildCabinet(body);
    else this.buildSpellShop(body);
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tabBtn = target.closest("[data-tab]");
      if (tabBtn) {
        audio.play("click");
        this.renderShop(tabBtn.getAttribute("data-tab") as "tavern" | "armory" | "spells" | "curios");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderMap();
      }
    });
    this.root.appendChild(page);
    this.tickGold(page);
  }

  /** One gesture from gold to dressed: pick the wearer right at the counter. */
  private askWhoWears(pieceId: string): void {
    const piece = armorById(pieceId)!;
    const pop = el(`
      <div class="levelup-pop">
        <div class="levelup-card">
          <div class="levelup-title" style="font-size:20px">${piece.name}</div>
          <div class="levelup-line">Who wears it?</div>
          <div class="wear-row">
            ${this.save.heroes
              .map((h, i) => ({ h, i }))
              .filter(({ h }) => h.recruited)
              .map(({ h, i }) => `<button class="toggle-btn wear-opt" data-wear="${i}">${HEROES[i].name}${h.armor ? "" : " ◇"}</button>`)
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
        this.save.heroes[Number(pick)].armor = pieceId;
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

  private buildArmory(body: Element): void {
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
              <div class="hero-meta">${WEAPON_TIERS[hero.weaponTier].name} weapon · ${worn ? worn.name : "Traveler's Garb"}</div>
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

    // the armorer's rack: named pieces, each a decision — no ladders here
    const rack = el(`
      <div class="hero-card">
        <div class="hero-name">The Armorer's Rack</div>
        <div class="hero-meta">Every piece has its own character. Buy a copy, then dress a hero on their Equip screen.</div>
        <div class="armor-rack"></div>
      </div>
    `);
    const rackList = rack.querySelector(".armor-rack")!;
    for (const piece of ARMORS) {
      const owned = save.armory.filter((x) => x === piece.id).length;
      if (piece.cost === 0 && owned === 0) {
        rackList.appendChild(
          el(`<div class="curio-card unfound"><span class="curio-icon">?</span><span class="curio-text"><strong>A great foe's relic</strong><em>Fell one of the road's masters for the first time to claim it.</em></span></div>`),
        );
        continue;
      }
      const wearers = HEROES.filter((_, hi) => save.heroes[hi].armor === piece.id).map((h) => h.name);
      rackList.appendChild(
        el(`
          <div class="curio-card ${piece.boss ? "rare" : ""}">
            <span class="curio-icon">${ico(piece.icon)}</span>
            <span class="curio-text">
              <strong>${piece.name} <span class="armor-fam">${piece.family}</span>${owned > 1 ? ` <span class="curio-count">×${owned}</span>` : ""}</strong>
              <em>${piece.blurb}</em>
              ${wearers.length ? `<em class="curio-worn">worn by ${wearers.join(" & ")}</em>` : owned ? `<em class="curio-worn">in the armory, unworn</em>` : ""}
            </span>
            ${
              piece.cost > 0
                ? `<button class="big-btn buy-btn ${save.gold < piece.cost ? "cant" : ""}" data-armorbuy="${piece.id}">${ico("coin")} ${piece.cost}</button>`
                : '<span class="rare-tag">RELIC</span>'
            }
          </div>
        `),
      );
    }
    body.appendChild(rack);

    // Tinker's bench: duplicate trinkets aren't dead weight — fuse or sell them
    const counts = new Map<string, number>();
    for (const id of save.inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n >= 2);
    if (dupes.length) {
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
        this.renderShop("armory");
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
      this.renderShop("armory");
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
  private heroTabs(index: number, active: "overview" | "loadout" | "talents" | "calling"): HTMLElement {
    const save = this.save;
    const canCall = !!save.heroes[index].calling || save.level >= CALLING_UNLOCK_LEVEL;
    const roster = save.heroes.map((h, i) => ({ h, i })).filter(({ h }) => h.recruited).map(({ i }) => i);
    const strip = el(`
      <div class="shop-tabs hero-tabs">
        <button class="hero-step" data-hstep="-1" title="previous hero">‹</button>
        <button class="shop-tab ${active === "overview" ? "on" : ""}" data-htab="overview">${ico("banner")} Overview</button>
        <button class="shop-tab ${active === "loadout" ? "on" : ""}" data-htab="loadout">${ico("shield")} Equip</button>
        <button class="shop-tab ${active === "talents" ? "on" : ""}" data-htab="talents">${ico("star")} Talents</button>
        <button class="shop-tab ${active === "calling" ? "on" : ""}" data-htab="calling" ${canCall ? "" : "disabled"}>${ico("sword")} Calling</button>
        <button class="hero-step" data-hstep="1" title="next hero">›</button>
      </div>
    `);
    const open = (i: number, tab: string) => {
      if (tab === "overview") this.renderHeroOverview(i);
      else if (tab === "loadout") this.renderEquipment(i);
      else if (tab === "talents") this.renderTalents(i);
      else if (this.save.heroes[i].calling || this.save.level >= CALLING_UNLOCK_LEVEL) this.renderCalling(i);
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
          <button class="big-btn party-btn" data-act="back">Party</button>
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
    this.root.appendChild(page);
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
            <div class="map-level">Spend points to unlock abilities · your weapon follows your strongest art</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Map</button>
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
    for (let i = 0; i < HEROES.length; i++) {
      if (this.save.heroes[i].recruited) list.appendChild(this.heroCard(i));
    }
    for (let i = 0; i < HEROES.length; i++) {
      if (this.save.heroes[i].recruited) continue;
      const arrived = heroArrived(this.save, i);
      const lockedCard = el(`
          <div class="hero-card locked-hero" style="--accent:${HEROES[i].accent}">
            <div class="hero-head">
              <div class="hero-avatar portrait" style="background:${HEROES[i].accent};opacity:.45">
                <canvas width="64" height="64"></canvas>
              </div>
              <div>
                <div class="hero-name">${arrived ? `${HEROES[i].name} <em>${HEROES[i].title}</em>` : "A distant wanderer"}</div>
                <div class="hero-meta">${
                  arrived
                    ? `For hire at the <strong>Village Tavern</strong> — ${ico("coin")} ${RECRUIT_COST[i] ?? "?"}`
                    : i <= 5 ? "Word of the band must spread — fell the Thornwood ogre first." : "They winter in the north — the road must reach the Winterreach first."
                }</div>
              </div>
              <div class="hero-points">🔒</div>
            </div>
          </div>
        `);
      if (arrived) drawHeroPortrait(lockedCard.querySelector(".hero-avatar canvas") as HTMLCanvasElement, i, this.save);
      list.appendChild(lockedCard);
    }
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
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (act === "back") {
        audio.play("click");
        this.renderMap();
      }
    });
    this.root.appendChild(page);
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
      hero.armor,
      hero.talents,
      hero.trinket,
      oathHolds ? hero.calling : null,
      oathHolds ? hero.advCalling : null,
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
            }${WEAPON_LABEL[weapon]} · ${WEAPON_TIERS[hero.weaponTier].name} / ${armorById(hero.armor)?.name ?? "Traveler's Garb"}</div>
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
          <button class="toggle-btn calling-btn ${!sworn && save.level >= CALLING_UNLOCK_LEVEL ? "beckons" : ""}"
            data-act="calling" ${!sworn && save.level < CALLING_UNLOCK_LEVEL ? "disabled" : ""}
            ${sworn ? (oathHolds ? `style="border-color:${sworn.color};color:${sworn.color}"` : 'style="border-color:#ff9a85;color:#ff9a85"') : ""}>
            ${
              sworn
                ? `${ico(sworn.crest)} ${advInfo ? advInfo.adv.name : sworn.name}${oathHolds ? "" : " (dormant)"}`
                : save.level >= CALLING_UNLOCK_LEVEL
                  ? "Choose a Calling"
                  : `Calling at band lv ${CALLING_UNLOCK_LEVEL}`
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
      const statsBefore = deriveStats(hero.attrs, hero.weaponTier, hero.armor, hero.talents, hero.trinket, effCalling(), effAdv());
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
      const statsAfter = deriveStats(hero.attrs, hero.weaponTier, hero.armor, hero.talents, hero.trinket, effCalling(), effAdv());
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
      const before = deriveStats(hero.attrs, hero.weaponTier, hero.armor, hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null);
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
      const after = deriveStats(hero.attrs, hero.weaponTier, hero.armor, hero.talents, hero.trinket, effC(), effC() ? hero.advCalling : null);
      const freshCard = this.refreshCard(card, index);
      flashStatDeltas(freshCard, before, after);
    });

    card.querySelector('[data-act="talents"]')!.addEventListener("click", () => {
      audio.play("click");
      this.renderTalents(index);
    });

    card.querySelector('[data-act="calling"]')!.addEventListener("click", () => {
      if (!hero.calling && save.level < CALLING_UNLOCK_LEVEL) return;
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
          <button class="big-btn party-btn" data-act="back">Party</button>
        </div>
        <div class="calling-grid"></div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "calling"));
    const grid = page.querySelector(".calling-grid")!;
    for (const c of CALLINGS) {
      const eligible = callingEligible(c, hero.attrs);
      const isSworn = hero.calling === c.id;
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
      if (isSworn) {
        const advReady = save.level >= ADV_CALLING_LEVEL;
        const advWrap = el(`
          <div class="adv-section">
            <div class="adv-head">Advancement ${advReady ? "" : `<span>at band level ${ADV_CALLING_LEVEL}</span>`}</div>
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
        if (save.level < ADV_CALLING_LEVEL) return;
        if (hero.advCalling && !this.spend(ADV_SWITCH_COST)) return;
        hero.advCalling = id;
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
        hero.advCalling = null; // a new oath starts unadvanced
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
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ equipment

  renderEquipment(index: number): void {
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
    const unlocked = unlockedAbilities(hero.attrs).map((a) => a.id);
    const nextW = hero.weaponTier + 1 < WEAPON_TIERS.length ? WEAPON_TIERS[hero.weaponTier + 1] : null;
    const wornArmor = armorById(hero.armor);
    // pieces free to wear: owned copies not already on someone else's back
    const wardrobe = ARMORS.filter((p) => {
      const copies = save.armory.filter((x) => x === p.id).length;
      const used = save.heroes.filter((h, hi) => hi !== index && h.armor === p.id).length;
      return copies > used;
    });
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
          <button class="big-btn party-btn" data-act="back">Party</button>
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
              <div class="equip-slot-head">${ico("shield")} Armor — <strong>${wornArmor ? wornArmor.name : "Traveler's Garb"}</strong> <span class="loadout-hint ${!wornArmor && wardrobe.length ? "urgent" : ""}">${wardrobe.length ? "tap a piece below to wear it" : "buy pieces at the Village Armory"}</span></div>
              ${wornArmor ? `<div class="equip-blurb">${wornArmor.blurb}${wornArmor.boss ? ' <span class="rare-tag">RELIC</span>' : ""}</div>` : `<div class="equip-blurb">Road-worn and honest — the Armorer's Rack at the Village sells better.</div>`}
              <div class="trinket-options armor-options">
                <button class="toggle-btn trinket-opt ${hero.armor === null ? "on" : ""}" data-armor="none">◇ Garb</button>
                ${wardrobe
                  .map((p) => {
                    const cur = deriveStats(hero.attrs, hero.weaponTier, hero.armor, hero.talents, hero.trinket, sheetHolds ? hero.calling : null, sheetHolds ? hero.advCalling : null);
                    const alt = deriveStats(hero.attrs, hero.weaponTier, p.id, hero.talents, hero.trinket, sheetHolds ? hero.calling : null, sheetHolds ? hero.advCalling : null);
                    const bits: string[] = [];
                    const dHp = alt.maxHp - cur.maxHp;
                    const dAr = Math.round((alt.armor - cur.armor) * 100);
                    const dSp = Math.round(((alt.speed - cur.speed) / cur.speed) * 100);
                    if (dHp) bits.push(`<i class="${dHp > 0 ? "up" : "dn"}">${dHp > 0 ? "+" : ""}${dHp}hp</i>`);
                    if (dAr) bits.push(`<i class="${dAr > 0 ? "up" : "dn"}">${dAr > 0 ? "+" : ""}${dAr}%ar</i>`);
                    if (dSp) bits.push(`<i class="${dSp > 0 ? "up" : "dn"}">${dSp > 0 ? "+" : ""}${dSp}%mv</i>`);
                    return `<button class="toggle-btn trinket-opt ${hero.armor === p.id ? "on" : ""}" data-armor="${p.id}" title="${p.blurb}">${ico(p.icon)} ${p.name}${p.boss ? " ✦" : ""}${bits.length ? ` <span class="delta-chips">${bits.join("")}</span>` : ""}</button>`;
                  })
                  .join("")}
              </div>
            </div>
            <div class="equip-slot">
              <div class="equip-slot-head">${ico("gem")} Trinket — <strong>${trinket ? `${trinket.icon} ${trinket.name}` : "none"}</strong></div>
              ${trinket ? `<div class="equip-blurb">${trinket.blurb}${trinket.rarity === "rare" ? ' <span class="rare-tag">RARE</span>' : ""}</div>` : ""}
              <div class="trinket-options"></div>
            </div>
          </div>
          <div class="sheet-right">
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
        </div>
      </div>
    `);
    page.querySelector(".map-header")!.after(this.heroTabs(index, "loadout"));
    // live figure: the real battle render, idling
    const fig = page.querySelector(".figure-canvas") as HTMLCanvasElement;
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

    // trinket choices: none + every distinct loot piece not worn by someone else
    const options = page.querySelector(".trinket-options")!;
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
      const armorBtn = target.closest("[data-armor]");
      if (armorBtn) {
        const id = armorBtn.getAttribute("data-armor")!;
        hero.armor = id === "none" ? null : id;
        persist(save);
        audio.play("clink");
        this.showToast(id === "none" ? `${def.name} travels light` : `${def.name} dons the ${armorById(id)!.name}`);
        this.renderEquipment(index);
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
        this.renderEquipment(index);
        return;
      }
      const chip = target.closest("[data-ability]");
      if (chip) {
        const id = chip.getAttribute("data-ability")!;
        if (this.pendingSpell === id) {
          // tapping the waiting spell again cancels the swap
          this.pendingSpell = null;
          audio.play("click");
          this.renderEquipment(index);
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
          this.renderEquipment(index);
          return;
        }
        audio.play("click");
        persist(save);
        this.renderEquipment(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        this.pendingSpell = null;
        audio.play("click");
        this.renderParty();
      }
    });
    this.root.appendChild(page);
  }

  private refreshCard(card: HTMLElement, index: number): HTMLElement {
    const fresh = this.heroCard(index);
    card.replaceWith(fresh);
    return fresh;
  }
}
