import { audio } from "./audio";
import {
  ABILITIES,
  DIFFICULTIES,
  trinketById,
  MAX_LEVEL,
  TALENTS,
  TALENT_TREES,
  TIER_UNLOCK,
  talentPointBudget,
  talentPointsInTree,
  talentPointsSpent,
  ARMOR_BONUS,
  ARMOR_HP_BONUS,
  ARMOR_TIERS,
  ATTR_BLURBS,
  ATTR_KEYS,
  ATTR_NAMES,
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
import { nextSpeed, persist, respecHero } from "./save";
import { exportTelemetry, telemetrySummary } from "./telemetry";
import type { SaveData } from "./types";

export interface MenuCallbacks {
  startStage: (stageIndex: number) => void;
  startTutorial: (kind: string) => void;
  resetProgress: () => void;
}

const WEAPON_LABEL: Record<string, string> = {
  sword: "⚔ Blade",
  bow: "➳ Bow",
  staff: "✦ Staff",
  stave: "✚ Stave",
};

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
  const robed = dominantWeapon(hero.attrs) === "stave";
  const aTier = hero.armorTier;
  const outline = "#221a30";
  const line = (w: number) => {
    ctx.strokeStyle = outline;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / 64, canvas.height / 64);
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
      ctx.fillStyle = aTier >= 3 ? "#aab4c2" : "#7a5a3a";
      ctx.fill();
      line(2.4);
    }
  }
  if (!robed && aTier >= 2) {
    ctx.strokeStyle = aTier >= 3 ? "#c2ccda" : "#9aa3ad";
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
    ctx.fillStyle = "#aab4c2";
    ctx.fill();
    line(2.6);
    ctx.fillStyle = "#aab4c2";
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
  if (kind === "wolf" || kind === "alpha") {
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
  const big = kind === "brute" || kind === "warlord" || kind === "ogre";
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
  if (kind === "goblin" || kind === "archer" || kind === "shaman") {
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
  if (kind === "shaman") {
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
            <!-- the band, silhouetted -->
            <g fill="#141a10">
              <circle cx="96" cy="84" r="9"/><rect x="88" y="90" width="16" height="22" rx="6"/>
              <circle cx="140" cy="78" r="10"/><rect x="130" y="85" width="20" height="27" rx="7"/>
              <circle cx="224" cy="80" r="10"/><rect x="214" y="87" width="20" height="25" rx="7"/>
              <circle cx="266" cy="86" r="9"/><rect x="258" y="92" width="16" height="20" rx="6"/>
              <rect x="272" y="58" width="3" height="36" rx="1.5"/>
            </g>
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
          <button class="toggle-btn" data-act="speed"></button>
          <div class="settings-row">
            <button class="toggle-btn" data-act="export-save">📤 Export save</button>
            <button class="toggle-btn" data-act="import-save">📥 Import save</button>
          </div>
          <button class="toggle-btn" data-act="export-data">📊 Export playtest data</button>
          <button class="toggle-btn danger" data-act="reset">Reset all progress</button>
        </div>
        <div class="credit">drag your heroes · draw your spells · shape your band</div>
        <div class="version-tag">WAYBAND · woodland build</div>
      </div>
    `);
    const syncToggles = () => {
      (page.querySelector('[data-act="sound"]') as HTMLElement).textContent = `Sound: ${this.save.sound ? "on" : "off"}`;
      (page.querySelector('[data-act="music"]') as HTMLElement).textContent = `Music: ${this.save.music ? "on" : "off"}`;
      (page.querySelector('[data-act="speed"]') as HTMLElement).textContent = `Combat speed: ×${this.save.speed}`;
    };
    syncToggles();
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
            localStorage.setItem("wayband-save-v1", JSON.stringify(data));
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
        if (confirm("Erase all progress and start over?")) {
          this.callbacks.resetProgress();
        }
      }
    });
    this.root.appendChild(page);
  }

  // ------------------------------------------------------------------ map

  renderMap(): void {
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
            <div class="map-level">Band level ${save.level}/${MAX_LEVEL} · ${save.xp}/${need} xp · <span class="gold-chip">🪙 ${save.gold}</span></div>
            <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
          </div>
          <button class="big-btn party-btn" data-act="party">
            Party${unspentTotal > 0 ? ` <span class="badge">${unspentTotal}</span>` : ""}
          </button>
        </div>
        <div class="world-map"></div>
        <div class="stage-caption"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="difficulty" style="border-color:${DIFFICULTIES[save.difficulty].color};color:${DIFFICULTIES[save.difficulty].color}">☠ ${DIFFICULTIES[save.difficulty].name}</button>
          <button class="toggle-btn" data-act="shop">🏪 Village</button>
          <button class="toggle-btn" data-act="bestiary">📖 Bestiary</button>
          <button class="toggle-btn" data-act="home">Title</button>
        </div>
      </div>
    `);
    page.querySelector(".world-map")!.appendChild(this.buildWorldMap());
    const caption = page.querySelector(".stage-caption")!;
    const current = STAGES[Math.min(save.unlockedStage, STAGES.length - 1)];
    caption.innerHTML = `<strong>Next:</strong> ${current.name} — <em>${current.subtitle}</em>`;
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "party") {
        audio.play("click");
        this.renderParty();
      }
      if (act === "bestiary") {
        audio.play("click");
        this.renderBestiary();
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
        this.showToast(`☠ ${d.name}: enemies ×${d.enemyMult}, rewards ×${d.rewardMult}`);
        this.renderMap();
      }
      if (act === "home") {
        audio.play("click");
        this.renderTitle();
      }
    });
    this.root.appendChild(page);
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

  /** Painted SVG overworld: dawn sky, layered ridges, a river, themed regions, and tappable stage nodes. */
  private buildWorldMap(): HTMLElement {
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
    STAGES.forEach((stage, i) => {
      const n = nodes[i];
      const done = i < save.unlockedStage;
      const isCurrent = i === save.unlockedStage;
      const unlocked = i <= save.unlockedStage;
      const fill = done ? "url(#nodeDone)" : isCurrent ? "url(#nodeNow)" : "#332d42";
      const stroke = done ? "#8ee88b" : isCurrent ? "#ffe9a3" : "#514a66";
      const label = done ? "✓" : unlocked ? String(i + 1) : "";
      const nameW = stage.name.length * 6.4 + 16;
      markers += `
        <g class="map-node ${isCurrent ? "current" : ""} ${unlocked ? "open" : "locked"}" data-stage="${i}">
          <circle cx="${n.x}" cy="${n.y}" r="30" fill="transparent"/>
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
      this.callbacks.startStage(idx);
    });
    return svg;
  }

  // ------------------------------------------------------------------ bestiary

  renderBestiary(): void {
    this.root.innerHTML = "";
    this.show();
    const kinds: EnemyKind[] = ["goblin", "wolf", "archer", "shaman", "brute", "ogre", "alpha", "warlord"];
    const discovered = kinds.filter((k) => (this.save.bestiary[k] ?? 0) > 0).length;
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">Bestiary</div>
            <div class="map-level">${discovered}/${kinds.length} foes catalogued — defeat a creature to learn its ways</div>
          </div>
          <button class="big-btn party-btn" data-act="back">Map</button>
        </div>
        <div class="beast-list"></div>
      </div>
    `);
    const list = page.querySelector(".beast-list")!;
    for (const kind of kinds) {
      const def = ENEMIES[kind];
      const kills = this.save.bestiary[kind] ?? 0;
      if (kills > 0) {
        const card = el(`
          <div class="beast-card" style="--beast:${def.body}">
            <div class="beast-icon"><canvas width="64" height="64"></canvas></div>
            <div class="beast-info">
              <div class="beast-name">${def.name} <span class="beast-kills">×${kills} slain</span></div>
              <div class="beast-lore">${def.lore}</div>
              <div class="beast-habit">⚔ ${def.habit}</div>
              <div class="beast-stats">${def.maxHp} hp · ${def.damage} dmg · ${def.range > 100 ? "ranged" : "melee"}${def.armor ? " · armored" : ""}</div>
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
          <button class="big-btn" data-act="skip">⚔ Jump straight in</button>
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
          <div class="shop-note"><strong>🪙 Gold</strong> — every foe you slay and stage you clear pays gold. Even defeats salvage half the spoils.</div>
          <div class="shop-note"><strong>🍺 The Tavern</strong> — recruit new heroes to the band. Anyone hired can be rotated in or out of your fighting party of ${PARTY_CAP} on the Party screen.</div>
          <div class="shop-note"><strong>🛡 The Armory</strong> — buy each hero better weapons (more damage) and armor (more health and protection). Three tiers of each.</div>
          <div class="shop-note"><strong>✨ The Spell Shop</strong> — unlock a spell once for the whole band, then assign it to any hero whose attributes meet its bar. Each hero carries up to ${MAX_EQUIPPED} spells.</div>
          <div class="shop-note"><strong>⭐ Talents</strong> — every 2 band levels, each hero earns a talent point for the Strength, Dexterity, and Magic trees. Find them on the Party screen.</div>
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

  renderTalents(index: number): void {
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
    const trees = page.querySelector(".talent-trees")!;
    for (const treeKey of ["str", "dex", "mag"] as const) {
      const tree = TALENT_TREES[treeKey];
      const inTree = talentPointsInTree(hero.talents, treeKey);
      const column = el(`
        <div class="talent-col" style="--tree:${tree.color}">
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

  renderShop(tab: "tavern" | "armory" | "spells"): void {
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Village</div>
            <div class="map-level"><span class="gold-chip">🪙 ${save.gold} gold</span></div>
          </div>
          <button class="big-btn party-btn" data-act="back">Map</button>
        </div>
        <div class="shop-tabs">
          <button class="shop-tab ${tab === "tavern" ? "on" : ""}" data-tab="tavern">🍺 Tavern</button>
          <button class="shop-tab ${tab === "armory" ? "on" : ""}" data-tab="armory">🛡 Armory</button>
          <button class="shop-tab ${tab === "spells" ? "on" : ""}" data-tab="spells">✨ Spells</button>
        </div>
        <div class="shop-body"></div>
      </div>
    `);
    const body = page.querySelector(".shop-body")!;
    if (tab === "tavern") this.buildTavern(body);
    else if (tab === "armory") this.buildArmory(body);
    else this.buildSpellShop(body);
    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tabBtn = target.closest("[data-tab]");
      if (tabBtn) {
        audio.play("click");
        this.renderShop(tabBtn.getAttribute("data-tab") as "tavern" | "armory" | "spells");
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderMap();
      }
    });
    this.root.appendChild(page);
  }

  private spend(cost: number): boolean {
    if (this.save.gold < cost) {
      audio.play("click");
      this.showToast(`Not enough gold — need 🪙 ${cost}`);
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
                : `<button class="big-btn buy-btn ${save.gold < cost ? "cant" : ""}" data-recruit="${i}">🪙 ${cost}</button>`
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
      const nextA = hero.armorTier + 1 < ARMOR_TIERS.length ? ARMOR_TIERS[hero.armorTier + 1] : null;
      const card = el(`
        <div class="hero-card" style="--accent:${def.accent}">
          <div class="hero-head">
            <div class="hero-avatar portrait" style="background:${def.accent}"><canvas width="64" height="64"></canvas></div>
            <div>
              <div class="hero-name">${def.name}</div>
              <div class="hero-meta">${WEAPON_TIERS[hero.weaponTier].name} weapon · ${ARMOR_TIERS[hero.armorTier].name} armor</div>
            </div>
          </div>
          <div class="gear-row">
            ${
              nextW
                ? `<button class="big-btn buy-btn" data-gear="w:${i}" ${save.gold < nextW.cost ? 'data-cant="1"' : ""}>⚔ ${nextW.name} (+${WEAPON_DAMAGE_BONUS[hero.weaponTier + 1] - WEAPON_DAMAGE_BONUS[hero.weaponTier]} dmg) — 🪙 ${nextW.cost}</button>`
                : `<div class="gear-max">⚔ Best weapon owned</div>`
            }
            ${
              nextA
                ? `<button class="big-btn buy-btn" data-gear="a:${i}" ${save.gold < nextA.cost ? 'data-cant="1"' : ""}>🛡 ${nextA.name} (+${Math.round((ARMOR_BONUS[hero.armorTier + 1] - ARMOR_BONUS[hero.armorTier]) * 100)}% armor, +${ARMOR_HP_BONUS[hero.armorTier + 1] - ARMOR_HP_BONUS[hero.armorTier]} hp) — 🪙 ${nextA.cost}</button>`
                : `<div class="gear-max">🛡 Best armor owned</div>`
            }
          </div>
        </div>
      `);
      drawHeroPortrait(card.querySelector(".hero-avatar canvas") as HTMLCanvasElement, i, save);
      body.appendChild(card);
    }
    body.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-gear]");
      if (!btn) return;
      const [slot, idx] = btn.getAttribute("data-gear")!.split(":");
      const i = Number(idx);
      const hero = save.heroes[i];
      const tier = slot === "w" ? hero.weaponTier + 1 : hero.armorTier + 1;
      const cost = (slot === "w" ? WEAPON_TIERS : ARMOR_TIERS)[tier].cost;
      if (!this.spend(cost)) return;
      if (slot === "w") hero.weaponTier = tier;
      else hero.armorTier = tier;
      persist(save);
      this.showToast(`${HEROES[i].name} equips ${(slot === "w" ? WEAPON_TIERS : ARMOR_TIERS)[tier].name} ${slot === "w" ? "weapon" : "armor"}!`);
      this.renderShop("armory");
    });
  }

  private buildSpellShop(body: Element): void {
    const save = this.save;
    body.appendChild(
      el(`<div class="shop-note">Unlock a spell once, then assign it to any hero who meets its attribute — up to ${MAX_EQUIPPED} spells per hero, on the Party screen.</div>`),
    );
    for (const ability of ABILITIES) {
      const owned = save.unlockedSpells.includes(ability.id);
      const cost = SPELL_COSTS[ability.id] ?? 100;
      const card = el(`
        <div class="ability-chip shop-spell ${owned ? "equipped" : ""}" style="--chip:${ability.color}">
          <div class="chip-name">${ability.name}</div>
          <div class="chip-gate">${ability.blurb}</div>
          <div class="chip-req">Requires ${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}</div>
          ${owned ? '<div class="chip-owned">✓ unlocked</div>' : `<button class="big-btn buy-btn ${save.gold < cost ? "cant" : ""}" data-spell="${ability.id}">🪙 ${cost}</button>`}
        </div>
      `);
      body.appendChild(card);
    }
    body.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-spell]");
      if (!btn) return;
      const id = btn.getAttribute("data-spell")!;
      if (!this.spend(SPELL_COSTS[id] ?? 100)) return;
      save.unlockedSpells.push(id);
      persist(save);
      this.showToast(`${ABILITIES.find((a) => a.id === id)?.name} unlocked — assign it on the Party screen`);
      this.renderShop("spells");
    });
  }

  // ------------------------------------------------------------------ party

  renderParty(): void {
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
        <div class="hero-list"></div>
      </div>
    `);
    const list = page.querySelector(".hero-list")!;
    for (let i = 0; i < HEROES.length; i++) {
      if (this.save.heroes[i].recruited) list.appendChild(this.heroCard(i));
    }
    for (let i = 0; i < HEROES.length; i++) {
      if (this.save.heroes[i].recruited) continue;
      const lockedCard = el(`
          <div class="hero-card locked-hero" style="--accent:${HEROES[i].accent}">
            <div class="hero-head">
              <div class="hero-avatar portrait" style="background:${HEROES[i].accent};opacity:.45">
                <canvas width="64" height="64"></canvas>
              </div>
              <div>
                <div class="hero-name">${HEROES[i].name} <em>${HEROES[i].title}</em></div>
                <div class="hero-meta">For hire at the <strong>Village Tavern</strong> — 🪙 ${RECRUIT_COST[i] ?? "?"}</div>
              </div>
              <div class="hero-points">🔒</div>
            </div>
          </div>
        `);
      drawHeroPortrait(lockedCard.querySelector(".hero-avatar canvas") as HTMLCanvasElement, i, this.save);
      list.appendChild(lockedCard);
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

  private heroCard(index: number): HTMLElement {
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const stats = deriveStats(hero.attrs, hero.weaponTier, hero.armorTier);
    const weapon = dominantWeapon(hero.attrs);
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
            <div class="hero-name">${def.name} <em>${def.title}</em></div>
            <div class="hero-meta">${WEAPON_LABEL[weapon]} · ${WEAPON_TIERS[hero.weaponTier].name} / ${ARMOR_TIERS[hero.armorTier].name}</div>
          </div>
          <button class="toggle-btn party-toggle ${inParty ? "in" : ""}" data-act="toggle-party">
            ${inParty ? "⚔ In party" : "💤 Benched"}
          </button>
          <div class="hero-points ${save.unspent[index] > 0 ? "has" : ""}">${save.unspent[index]} pts</div>
        </div>
        <div class="stat-grid">
          <div data-stat="Health"><span>Health</span><strong>${stats.maxHp}</strong></div>
          <div data-stat="Damage"><span>Damage</span><strong>${Math.round(stats.damage)}</strong></div>
          <div data-stat="Atk speed"><span>Atk speed</span><strong>${(1 / stats.attackCooldown).toFixed(2)}/s</strong></div>
          <div data-stat="Armor"><span>Armor</span><strong>${Math.round(stats.armor * 100)}%</strong></div>
          <div data-stat="Range"><span>Range</span><strong>${stats.range > 90 ? "Ranged" : "Melee"}</strong></div>
          <div data-stat="Move"><span>Move</span><strong>${Math.round(stats.speed)}</strong></div>
          <div data-stat="Healing"><span>Healing</span><strong>${stats.healPower.toFixed(1)}/s</strong></div>
          <div data-stat="Spell power"><span>Spell power</span><strong>×${stats.spellPower.toFixed(2)}</strong></div>
        </div>
        <div class="stat-hint">tap any stat to see what it does</div>
        <button class="trinket-row equip-row" data-act="equip">
          🎒 <strong>Equipment</strong> — ⚔ ${WEAPON_TIERS[hero.weaponTier].name} · 🛡 ${ARMOR_TIERS[hero.armorTier].name} · ${trinket ? `${trinket.icon} ${trinket.name}` : "◇ no trinket"} · ✨ ${hero.equipped.length}/${MAX_EQUIPPED} spells
        </button>
        <div class="attr-rows"></div>
        <div class="card-actions">
          <button class="toggle-btn talents-btn" data-act="talents">⭐ Talents</button>
          <button class="toggle-btn respec" data-act="respec">Respec (free)</button>
        </div>
      </div>
    `);
    drawHeroPortrait(card.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, save);
    card.querySelector(".stat-grid")!.addEventListener("click", (event) => {
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

    const attrRows = card.querySelector(".attr-rows")!;
    for (const key of ATTR_KEYS) {
      const row = el(`
        <div class="attr-row">
          <div class="attr-name" title="${ATTR_BLURBS[key]}">${ATTR_NAMES[key]}</div>
          <div class="attr-bar"><div style="width:${Math.min(100, hero.attrs[key] * 5)}%"></div></div>
          <div class="attr-val">${hero.attrs[key]}</div>
          <button class="attr-plus" ${save.unspent[index] > 0 ? "" : "disabled"} data-attr="${key}">+</button>
        </div>
      `);
      attrRows.appendChild(row);
    }
    attrRows.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement).closest("[data-attr]") as HTMLElement | null;
      if (!btn || save.unspent[index] <= 0) return;
      const key = btn.getAttribute("data-attr") as (typeof ATTR_KEYS)[number];
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
      this.refreshCard(card, index);
    });

    card.querySelector('[data-act="respec"]')!.addEventListener("click", () => {
      respecHero(save, index);
      audio.play("click");
      this.refreshCard(card, index);
    });

    card.querySelector('[data-act="talents"]')!.addEventListener("click", () => {
      audio.play("click");
      this.renderTalents(index);
    });

    return card;
  }

  // ------------------------------------------------------------------ equipment

  renderEquipment(index: number): void {
    this.root.innerHTML = "";
    this.show();
    const save = this.save;
    const def = HEROES[index];
    const hero = save.heroes[index];
    const weapon = dominantWeapon(hero.attrs);
    const unlocked = unlockedAbilities(hero.attrs).map((a) => a.id);
    const nextW = hero.weaponTier + 1 < WEAPON_TIERS.length ? WEAPON_TIERS[hero.weaponTier + 1] : null;
    const nextA = hero.armorTier + 1 < ARMOR_TIERS.length ? ARMOR_TIERS[hero.armorTier + 1] : null;
    const trinket = trinketById(hero.trinket);
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div class="equip-title">
            <div class="hero-avatar portrait portrait-lg" style="background:${def.accent}">
              <canvas width="96" height="96"></canvas>
            </div>
            <div>
              <div class="map-title">${def.name}'s Pack</div>
              <div class="map-level">${WEAPON_LABEL[weapon]} · <span class="gold-chip">🪙 ${save.gold}</span></div>
            </div>
          </div>
          <button class="big-btn party-btn" data-act="back">Party</button>
        </div>
        <div class="equip-list">
          <div class="equip-slot">
            <div class="equip-slot-head">⚔ Weapon — <strong>${WEAPON_TIERS[hero.weaponTier].name}</strong> <span>+${WEAPON_DAMAGE_BONUS[hero.weaponTier]} dmg</span></div>
            ${
              nextW
                ? `<button class="big-btn buy-btn ${save.gold < nextW.cost ? "cant" : ""}" data-gear="w">Upgrade to ${nextW.name} (+${WEAPON_DAMAGE_BONUS[hero.weaponTier + 1] - WEAPON_DAMAGE_BONUS[hero.weaponTier]} dmg) — 🪙 ${nextW.cost}</button>`
                : `<div class="gear-max">Finest weapon in the realm</div>`
            }
          </div>
          <div class="equip-slot">
            <div class="equip-slot-head">🛡 Armor — <strong>${ARMOR_TIERS[hero.armorTier].name}</strong> <span>+${Math.round(ARMOR_BONUS[hero.armorTier] * 100)}% armor · +${ARMOR_HP_BONUS[hero.armorTier]} hp</span></div>
            ${
              nextA
                ? `<button class="big-btn buy-btn ${save.gold < nextA.cost ? "cant" : ""}" data-gear="a">Upgrade to ${nextA.name} (+${Math.round((ARMOR_BONUS[hero.armorTier + 1] - ARMOR_BONUS[hero.armorTier]) * 100)}% armor, +${ARMOR_HP_BONUS[hero.armorTier + 1] - ARMOR_HP_BONUS[hero.armorTier]} hp) — 🪙 ${nextA.cost}</button>`
                : `<div class="gear-max">Finest armor in the realm</div>`
            }
          </div>
          <div class="equip-slot">
            <div class="equip-slot-head">◇ Trinket — <strong>${trinket ? `${trinket.icon} ${trinket.name}` : "none"}</strong></div>
            ${trinket ? `<div class="equip-blurb">${trinket.blurb}${trinket.rarity === "rare" ? ' <span class="rare-tag">RARE</span>' : ""}</div>` : ""}
            <div class="trinket-options"></div>
          </div>
          <div class="equip-slot">
            <div class="equip-slot-head">✨ Spells — <strong>${hero.equipped.length}/${MAX_EQUIPPED} assigned</strong> <span>tap to assign or remove</span></div>
            <div class="ability-chips"></div>
          </div>
        </div>
      </div>
    `);
    drawHeroPortrait(page.querySelector(".hero-avatar canvas") as HTMLCanvasElement, index, save);

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

    const chips = page.querySelector(".ability-chips")!;
    for (const ability of ABILITIES) {
      const gateOk = unlocked.includes(ability.id);
      const owned = save.unlockedSpells.includes(ability.id);
      const usable = gateOk && owned;
      const isEquipped = hero.equipped.includes(ability.id);
      const gateText = !owned
        ? `🪙 Unlock at the Village spell shop`
        : gateOk
          ? ability.blurb
          : `Needs ${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}`;
      chips.appendChild(
        el(`
          <button class="ability-chip ${usable ? "" : "locked"} ${isEquipped ? "equipped" : ""}"
            style="--chip:${ability.color}" data-ability="${ability.id}">
            <div class="chip-name">${ability.name}</div>
            <div class="chip-gate">${gateText}</div>
          </button>
        `),
      );
    }

    page.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const gear = target.closest("[data-gear]");
      if (gear) {
        const slot = gear.getAttribute("data-gear")!;
        const tier = slot === "w" ? hero.weaponTier + 1 : hero.armorTier + 1;
        const item = (slot === "w" ? WEAPON_TIERS : ARMOR_TIERS)[tier];
        if (!this.spend(item.cost)) return;
        if (slot === "w") hero.weaponTier = tier;
        else hero.armorTier = tier;
        persist(save);
        this.showToast(`${def.name} equips ${item.name} ${slot === "w" ? "weapon" : "armor"}!`);
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
      const chip = target.closest("[data-ability]");
      if (chip) {
        const id = chip.getAttribute("data-ability")!;
        if (!save.unlockedSpells.includes(id)) {
          this.showToast("Buy this spell at the Village first");
          return;
        }
        if (!unlockedAbilities(hero.attrs).some((a) => a.id === id)) {
          audio.play("click");
          return;
        }
        const at = hero.equipped.indexOf(id);
        if (at >= 0) hero.equipped.splice(at, 1);
        else if (hero.equipped.length < MAX_EQUIPPED) hero.equipped.push(id);
        else {
          this.showToast(`Max ${MAX_EQUIPPED} assigned — remove one first`);
          return;
        }
        audio.play("click");
        persist(save);
        this.renderEquipment(index);
        return;
      }
      if (target.closest('[data-act="back"]')) {
        audio.play("click");
        this.renderParty();
      }
    });
    this.root.appendChild(page);
  }

  private refreshCard(card: HTMLElement, index: number): void {
    const fresh = this.heroCard(index);
    card.replaceWith(fresh);
  }
}
