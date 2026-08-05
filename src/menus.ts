import { audio } from "./audio";
import {
  ABILITIES,
  ATTR_BLURBS,
  ATTR_KEYS,
  ATTR_NAMES,
  ENEMIES,
  HEROES,
  JOIN_REQUIREMENT,
  MAX_EQUIPPED,
  STAGES,
  activeRoster,
  deriveStats,
  dominantWeapon,
  unlockedAbilities,
  xpForLevel,
} from "./data";
import type { EnemyKind } from "./types";
import { nextSpeed, persist, respecHero } from "./save";
import type { SaveData } from "./types";

export interface MenuCallbacks {
  startStage: (stageIndex: number) => void;
  startTutorial: () => void;
  resetProgress: () => void;
}

const WEAPON_LABEL: Record<string, string> = {
  sword: "⚔ Blade",
  bow: "➳ Bow",
  staff: "✦ Staff",
};

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
  if (kind === "wolf") {
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
  const big = kind === "brute" || kind === "warlord";
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
          <button class="toggle-btn danger" data-act="reset">Reset all progress</button>
        </div>
        <div class="credit">drag your heroes · draw your spells · shape your band</div>
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
      if (act === "start") this.renderMap();
      if (act === "tutorial") this.callbacks.startTutorial();
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
    const roster = activeRoster(save.unlockedStage);
    const unspentTotal = roster.reduce((sum, i) => sum + save.unspent[i], 0);
    const page = el(`
      <div class="page">
        <div class="map-header">
          <div>
            <div class="map-title">The Long Road</div>
            <div class="map-level">Band level ${save.level} · ${save.xp}/${need} xp</div>
            <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
          </div>
          <button class="big-btn party-btn" data-act="party">
            Party${unspentTotal > 0 ? ` <span class="badge">${unspentTotal}</span>` : ""}
          </button>
        </div>
        <div class="world-map"></div>
        <div class="stage-caption"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="bestiary">📖 Bestiary</button>
          <button class="toggle-btn" data-act="home">Title screen</button>
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
      if (act === "home") {
        audio.play("click");
        this.renderTitle();
      }
    });
    this.root.appendChild(page);
  }

  /** Painted SVG overworld: a winding road through the forest with tappable stage nodes. */
  private buildWorldMap(): HTMLElement {
    const save = this.save;
    const nodes = [
      { x: 76, y: 244 },
      { x: 190, y: 172 },
      { x: 312, y: 228 },
      { x: 412, y: 142 },
      { x: 508, y: 206 },
      { x: 576, y: 92 },
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
    // scatter of pines, deterministic
    let trees = "";
    const rand = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = 0; i < 34; i++) {
      const tx = 20 + rand(i * 3) * 600;
      const ty = 30 + rand(i * 7 + 1) * 240;
      if (nodes.some((n) => Math.hypot(n.x - tx, n.y - ty) < 44)) continue;
      const s = 7 + rand(i * 11) * 9;
      const shade = rand(i * 5) > 0.5 ? "#2e5038" : "#26452f";
      trees += `<path d="M ${tx} ${ty - s * 2} L ${tx - s} ${ty} L ${tx + s} ${ty} Z" fill="${shade}"/>`;
      trees += `<rect x="${tx - 1.4}" y="${ty}" width="2.8" height="${s * 0.5}" fill="#1c3023"/>`;
    }
    let markers = "";
    STAGES.forEach((stage, i) => {
      const n = nodes[i];
      const done = i < save.unlockedStage;
      const isCurrent = i === save.unlockedStage;
      const unlocked = i <= save.unlockedStage;
      const fill = done ? "#3f7a4c" : isCurrent ? "#d9a441" : "#3a3348";
      const stroke = done ? "#8ee88b" : isCurrent ? "#ffe9a3" : "#57506b";
      const label = done ? "✓" : unlocked ? String(i + 1) : "🔒";
      markers += `
        <g class="map-node ${isCurrent ? "current" : ""} ${unlocked ? "open" : "locked"}" data-stage="${i}">
          <circle cx="${n.x}" cy="${n.y}" r="30" fill="transparent"/>
          ${isCurrent ? `<circle class="node-pulse" cx="${n.x}" cy="${n.y}" r="20" fill="none" stroke="#ffe9a3" stroke-width="2"/>` : ""}
          <circle cx="${n.x}" cy="${n.y}" r="17" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
          <text x="${n.x}" y="${n.y + 5}" text-anchor="middle" font-size="${unlocked ? 15 : 12}" font-weight="900" fill="#f7f2e0">${label}</text>
          <text x="${n.x}" y="${n.y + 34}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${unlocked ? "#f2ecd8" : "#8d84a3"}" stroke="#1a2b20" stroke-width="3" paint-order="stroke">${unlocked ? stage.name : "???"}</text>
        </g>`;
    });
    const svg = el(`
      <div class="map-frame">
        <svg viewBox="0 0 640 300" role="img" aria-label="World map">
          <defs>
            <linearGradient id="mapsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#43695c"/>
              <stop offset="1" stop-color="#2f5240"/>
            </linearGradient>
          </defs>
          <rect width="640" height="300" rx="16" fill="url(#mapsky)"/>
          <ellipse cx="120" cy="290" rx="240" ry="60" fill="#3a6148" opacity="0.7"/>
          <ellipse cx="520" cy="300" rx="280" ry="70" fill="#35594a" opacity="0.7"/>
          <path d="M 0 70 Q 160 30 320 62 T 640 55 L 640 0 L 0 0 Z" fill="#243d30" opacity="0.55"/>
          ${trees}
          <path d="${road}" fill="none" stroke="#1c3023" stroke-width="11" stroke-linecap="round"/>
          <path d="${road}" fill="none" stroke="#c9a973" stroke-width="6" stroke-dasharray="1 11" stroke-linecap="round"/>
          ${markers}
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
    const kinds: EnemyKind[] = ["goblin", "wolf", "archer", "shaman", "brute", "warlord"];
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
    const roster = activeRoster(this.save.unlockedStage);
    for (const i of roster) list.appendChild(this.heroCard(i));
    for (let i = 0; i < HEROES.length; i++) {
      if (roster.includes(i)) continue;
      const need = JOIN_REQUIREMENT[i];
      const stageName = STAGES[need - 1]?.name ?? "the road ahead";
      list.appendChild(
        el(`
          <div class="hero-card locked-hero" style="--accent:${HEROES[i].accent}">
            <div class="hero-head">
              <div class="hero-avatar" style="background:${HEROES[i].accent};opacity:.45">
                <span style="background:${HEROES[i].skin}"></span>
              </div>
              <div>
                <div class="hero-name">${HEROES[i].name} <em>${HEROES[i].title}</em></div>
                <div class="hero-meta">Joins the band after you clear <strong>${stageName}</strong></div>
              </div>
              <div class="hero-points">🔒</div>
            </div>
          </div>
        `),
      );
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
    const stats = deriveStats(hero.attrs);
    const weapon = dominantWeapon(hero.attrs);
    const unlocked = unlockedAbilities(hero.attrs).map((a) => a.id);

    const card = el(`
      <div class="hero-card" style="--accent:${def.accent}">
        <div class="hero-head">
          <div class="hero-avatar" style="background:${def.accent}">
            <span style="background:${def.skin}"></span>
          </div>
          <div>
            <div class="hero-name">${def.name} <em>${def.title}</em></div>
            <div class="hero-meta">${WEAPON_LABEL[weapon]} · ${stats.maxHp} hp · ${Math.round(stats.damage)} dmg</div>
          </div>
          <div class="hero-points ${save.unspent[index] > 0 ? "has" : ""}">${save.unspent[index]} pts</div>
        </div>
        <div class="attr-rows"></div>
        <div class="ability-row-title">Abilities <span>(tap to equip · max ${MAX_EQUIPPED})</span></div>
        <div class="ability-chips"></div>
        <button class="toggle-btn respec" data-act="respec">Respec (free)</button>
      </div>
    `);

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
        if (hero.equipped.length < MAX_EQUIPPED && !hero.equipped.includes(fresh.id)) {
          hero.equipped.push(fresh.id);
        }
        audio.play("levelup");
        this.showToast(`${def.name} learned ${fresh.name}!`);
      } else {
        audio.play("click");
      }
      persist(save);
      this.refreshCard(card, index);
    });

    const chips = card.querySelector(".ability-chips")!;
    for (const ability of ABILITIES) {
      const isUnlocked = unlocked.includes(ability.id);
      const isEquipped = hero.equipped.includes(ability.id);
      const chip = el(`
        <button class="ability-chip ${isUnlocked ? "" : "locked"} ${isEquipped ? "equipped" : ""}"
          style="--chip:${ability.color}" data-ability="${ability.id}">
          <div class="chip-name">${ability.name}</div>
          <div class="chip-gate">${
            isUnlocked
              ? ability.blurb
              : `Needs ${ATTR_NAMES[ability.gate.attr]} ${ability.gate.value}`
          }</div>
        </button>
      `);
      chips.appendChild(chip);
    }
    chips.addEventListener("click", (event) => {
      const chip = (event.target as HTMLElement).closest("[data-ability]") as HTMLElement | null;
      if (!chip) return;
      const id = chip.getAttribute("data-ability")!;
      if (!unlockedAbilities(hero.attrs).some((a) => a.id === id)) {
        audio.play("click");
        return;
      }
      const at = hero.equipped.indexOf(id);
      if (at >= 0) hero.equipped.splice(at, 1);
      else if (hero.equipped.length < MAX_EQUIPPED) hero.equipped.push(id);
      else {
        this.showToast(`Max ${MAX_EQUIPPED} equipped — unequip one first`);
        return;
      }
      audio.play("click");
      persist(save);
      this.refreshCard(card, index);
    });

    card.querySelector('[data-act="respec"]')!.addEventListener("click", () => {
      respecHero(save, index);
      audio.play("click");
      this.refreshCard(card, index);
    });

    return card;
  }

  private refreshCard(card: HTMLElement, index: number): void {
    const fresh = this.heroCard(index);
    card.replaceWith(fresh);
  }
}
