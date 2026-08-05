import { audio } from "./audio";
import {
  ABILITIES,
  ATTR_BLURBS,
  ATTR_KEYS,
  ATTR_NAMES,
  HEROES,
  MAX_EQUIPPED,
  STAGES,
  deriveStats,
  dominantWeapon,
  unlockedAbilities,
  xpForLevel,
} from "./data";
import { persist, respecHero } from "./save";
import type { SaveData } from "./types";

export interface MenuCallbacks {
  startStage: (stageIndex: number) => void;
  resetProgress: () => void;
}

const WEAPON_LABEL: Record<string, string> = {
  sword: "⚔ Blade",
  bow: "➳ Bow",
  staff: "✦ Staff",
};

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
        </div>
        <div class="settings-card">
          <div class="settings-title">Settings</div>
          <div class="settings-row">
            <button class="toggle-btn" data-act="sound"></button>
            <button class="toggle-btn" data-act="music"></button>
          </div>
          <button class="toggle-btn danger" data-act="reset">Reset all progress</button>
        </div>
        <div class="credit">drag your heroes · draw your spells · shape your band</div>
      </div>
    `);
    const syncToggles = () => {
      (page.querySelector('[data-act="sound"]') as HTMLElement).textContent = `Sound: ${this.save.sound ? "on" : "off"}`;
      (page.querySelector('[data-act="music"]') as HTMLElement).textContent = `Music: ${this.save.music ? "on" : "off"}`;
    };
    syncToggles();
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      audio.unlock();
      audio.play("click");
      if (act === "start") this.renderMap();
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
    const unspentTotal = save.unspent.reduce((a, b) => a + b, 0);
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
        <div class="stage-list"></div>
        <div class="map-footer">
          <button class="toggle-btn" data-act="home">Title screen</button>
        </div>
      </div>
    `);
    const list = page.querySelector(".stage-list")!;
    STAGES.forEach((stage, i) => {
      const unlocked = i <= save.unlockedStage;
      const done = i < save.unlockedStage;
      const card = el(`
        <button class="stage-card ${unlocked ? "" : "locked"}" ${unlocked ? "" : "disabled"}>
          <div class="stage-num">${done ? "✓" : i + 1}</div>
          <div class="stage-info">
            <div class="stage-name">${stage.name}</div>
            <div class="stage-sub">${unlocked ? stage.subtitle : "Locked — clear the previous stage"}</div>
          </div>
          <div class="stage-waves">${unlocked ? `${stage.waves.length} waves` : "🔒"}</div>
        </button>
      `);
      if (unlocked) {
        card.addEventListener("click", () => {
          audio.unlock();
          audio.play("click");
          this.callbacks.startStage(i);
        });
      }
      list.appendChild(card);
    });
    page.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "party") {
        audio.play("click");
        this.renderParty();
      }
      if (act === "home") {
        audio.play("click");
        this.renderTitle();
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
    for (let i = 0; i < HEROES.length; i++) list.appendChild(this.heroCard(i));
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
