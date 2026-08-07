import { audio } from "./audio";
import { BOSS_PHASES, DIFFICULTIES, ENEMIES, HEROES, PRIORITY_ENEMIES, abilityById, armorById, armorSetOf, callingById, callingEligible, cooldownReduction, deriveStats, heroGearOf, partyRoster, pathDoctrineRank, resolvedPathAbilities, talentMods, trinketById, trinketMods, SET_BONUSES } from "./data";
import { isLateBossKind, isLateFoeKind, type LateBossKind, type LateEnemyKind } from "./late-content";

// Battleheart pacing: cooldowns run 2.5× longer, so each cast must matter more.
// Heals compensate harder than damage — a mend that has to cover a 20s window
// must be worth waiting for.
const SPELL_POTENCY = 1.5;
const HEAL_POTENCY = 1.8;
import type { FxSystem } from "./fx";
import type {
  AbilityState,
  BossObjective,
  DamageElement,
  DisciplineId,
  EnemyKind,
  ElementId,
  GroundZone,
  Telegraph,
  Projectile,
  SaveData,
  StageDef,
  StatusEffect,
  Unit,
  Vec,
} from "./types";

const ELEMENT_COLORS: Record<ElementId, string> = {
  flame: "#ff9b42",
  frost: "#a9ddf5",
  storm: "#8fc7e8",
  earth: "#c9a06b",
  venom: "#9ad06a",
  radiant: "#ffe9a3",
  blood: "#d95763",
  shadow: "#a89bd8",
};

const ELEMENT_POOL_COLORS: Record<ElementId, string> = {
  flame: "255,155,66",
  frost: "169,221,245",
  storm: "143,199,232",
  earth: "160,128,82",
  venom: "130,190,86",
  radiant: "255,233,163",
  blood: "190,65,78",
  shadow: "120,104,170",
};

/** Short combat callouts make each Discipline + Attunement interaction legible
 * without adding another button, meter, or status icon to the HUD. */
const PATH_SIGNATURE_CUES: Record<DisciplineId, Record<ElementId, string>> = {
  knight: { flame: "HEARTH WARD", frost: "STILL GATE", storm: "STORMWALL", earth: "SHARED STONE", venom: "CORRODING GUARD", radiant: "DAWN AEGIS", blood: "BLOOD DEBT", shadow: "NIGHTWALL" },
  warrior: { flame: "BURN HARVEST", frost: "SHATTER HEW", storm: "FURY CURRENT", earth: "FAULT CLEAVE", venom: "BLIGHT HARVEST", radiant: "SUNDERING WARD", blood: "RED FEAST", shadow: "NIGHT REPRISE" },
  rogue: { flame: "EMBER TRAIL", frost: "MIRROR SHATTER", storm: "STORMSTEP", earth: "RIVEN FLOOR", venom: "MORTAL DOSE", radiant: "SUNWARD", blood: "DEBT PAID", shadow: "BLACKOUT" },
  archer: { flame: "ASHEN WAKE", frost: "WINTER'S MEASURE", storm: "CROSSWIND", earth: "STONEPIERCE", venom: "THORNMARK", radiant: "FIRST RAY", blood: "HEARTSEEKER", shadow: "MOONLESS STEP" },
  priest: { flame: "HEARTH AURA", frost: "QUIET MERCY", storm: "THUNDER CHOIR", earth: "DEEP FOUNDATION", venom: "BITTER PURGE", radiant: "AURORA WARD", blood: "BLOOD COVENANT", shadow: "LAST LANTERN" },
  mage: { flame: "DETONATION", frost: "ABSOLUTE ZERO", storm: "CURRENT FIELD", earth: "WORLDSPINE", venom: "RUIN BLOOMS", radiant: "LIVING STAR", blood: "SCARLET EQUATION", shadow: "VOID DRAW" },
  necromancer: { flame: "ASH SERVANT", frost: "PALE GUARD", storm: "SPIRIT CIRCUIT", earth: "BONE RAMPART", venom: "MORTAL BLOOM", radiant: "ANCESTOR'S HAND", blood: "RED THRALL", shadow: "OPEN GRAVES" },
};

const PROMOTION_CUES: Record<DisciplineId, readonly [string, string]> = {
  knight: ["UNBROKEN FORMATION", "THE BLOW ANSWERED"],
  warrior: ["PERFECTED STROKE", "NO RED LINE"],
  rogue: ["NOTHING BUT A SHADOW", "THE TRAP CLOSES"],
  archer: ["ONE QUARRY · ONE END", "THE ROAD FIRES BACK"],
  priest: ["FATE REFUSES", "JUDGMENT RETURNS"],
  mage: ["THE FIELD REWRITTEN", "THE LIMIT BROKEN"],
  necromancer: ["THE DEAD STAND GUARD", "DEATH PAYS DIVIDENDS"],
};

function hasPromotion(unit: Unit, discipline: DisciplineId, branch: "ascendant" | "paragon"): boolean {
  return unit.discipline === discipline && unit.advCalling?.endsWith(`-${branch}`) === true;
}

export interface FieldRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type BattleState = "fighting" | "wavebreak" | "victory" | "defeat";

/** Raised dead are battlefield actors rather than recolored projectiles. They
 * persist, pursue priority enemies, and express their master's Attunement with
 * a different on-hit answer. They are deliberately not party Units: enemies
 * cannot mistake a disposable shade for a hero and the HUD stays readable. */
export interface NecroServant {
  id: number;
  owner: Unit;
  element: ElementId;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  attackTimer: number;
  strength: number;
  bob: number;
}

function makeEffect(kind: StatusEffect["kind"], time: number, power: number, source: Unit | null = null): StatusEffect {
  return { kind, time, power, source };
}

/** The great foes — they hunt by threat, not by proximity or frailty. */
const BOSS_KINDS = Object.keys(BOSS_PHASES);

export class Battle {
  private nextUnitId = 1;
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  zones: GroundZone[] = [];
  telegraphs: Telegraph[] = [];
  bossObjectives: BossObjective[] = [];
  necroServants: NecroServant[] = [];
  state: BattleState = "wavebreak";
  waveIndex = -1;
  /** Enemies still crashing through the treeline — waves arrive gradually. */
  pendingSpawns: { kind: EnemyKind; at: number }[] = [];
  /** How far the band has marched through the level, in world pixels — the scenery scrolls by this. */
  travel = 0;
  /** One-off roadside sights that drift past during marches and park where the band stops. */
  landmarks: { type: number; x: number; y: number; alpha: number }[] = [];
  /** True while the band is walking to the next encounter (the old wavebreak). */
  get marching(): boolean {
    return this.state === "wavebreak" && this.waveIndex >= 0;
  }
  get descending(): boolean {
    return this.stage.travelDirection === "south";
  }
  /** Recent damage each hero (by id) has dealt to bosses; decays in seconds.
   *  Pour damage in and the boss turns on YOU — that's how you peel it off the healer. */
  threat: Record<number, number> = {};
  /** Boss poise: hero hits fill it; full = STAGGERED (stun + vulnerability), then it deepens. */
  bossStagger = 0;
  bossStaggerMax = 0;
  waveBanner = 0;
  breakTimer = 1.2;
  time = 0;
  xpEarned = 0;
  goldEarned = 0;
  resultDelay = 0;
  hitstop = 0;
  killCounts: Partial<Record<EnemyKind, number>> = {};
  saveRef: SaveData | null = null;
  difficultyMult = 1;
  telegraphTime = 1.5;
  enemyHaste = 1;
  extraSpawn = 0;
  tideLevel = 0;
  tideHigh = false;
  private lightningTimer = 7;
  private regionHazardTimer = 6.5;
  private widowToll = 4.5;
  private widowRite: { safeLane: number; safeY: number; halfWidth: number; time: number; duration: number } | null = null;
  private widowTollCount = 0;
  private jawCycle: {
    mode: "reef" | "undertow" | "breach" | "exposed";
    time: number;
    nextBreach: number;
    nextLightning: number;
    tideWasHigh: boolean;
    target: Vec | null;
  } | null = null;
  /** Pattern cursor for late-road bosses; keyed by unit id so the Way-Eater can
   * recall earlier omens without adding hidden state to save data. */
  private lateBossCycles = new Map<number, number>();
  private bossObjectiveTimer = 4;
  private bossObjectivePhase = 0;
  private nextObjectiveId = 1;
  castCounts: Record<string, number> = {};
  heroDeaths = 0;
  /** Per-hero battle ledger (keyed by heroIndex) — feeds the victory recap. */
  tallies: Record<number, { dealt: number; taken: number; healed: number }> = {};
  ordersIssued = 0;
  introBanner = 2.6;
  roleCallout: { title: string; text: string; color: string; time: number } | null = null;
  zoomPunch = 0;
  decals: { x: number; y: number; kind: "scorch" | "stain" | "print"; age: number; size: number; angle: number }[] = [];
  kickX = 0;
  kickY = 0;
  cinematic = 0; // boss-intro seconds remaining
  bossMoment: { eyebrow: string; title: string; accent: string; time: number; maxTime: number; final: boolean } | null = null;
  bossRef: Unit | null = null;
  slowmo = 0; // kill-cam seconds remaining
  ultFlash: { color: string; time: number } | null = null; // ult-cast screen tint
  private castingSpell = false; // true while a hero's castAbility resolves — heals read it
  private moonHunt: { remaining: number; whiffs: number; cool: number } | null = null; // the Alpha's phase-3 set-piece
  private alphaPrey: Unit | null = null; // who the pack-ruled Alpha has committed to hunting
  private alphaPick = 0; // seconds until it picks fresh prey
  private ogreCart = false; // Mosstooth's 66% set-piece fired
  private ogreFlop = false; // Mosstooth's 33% set-piece fired
  private clusterTime = 0; // Gorehulk's discipline: how long heroes have bunched up
  private clusterCool = 0; // cooldown on the scatter volley
  private bannerPlanted = false; // Gorehulk's 33% war banner
  private stillness: Record<number, { x: number; y: number; t: number }> = {}; // Rimeheart's cracking ice
  private detonations: { x: number; y: number; at: number; dmg: number; r: number }[] = []; // vengeful elites' last words
  private elementWeakShown = new Set<string>();
  private elementResistShown = new Set<string>();
  private roleIntroduced = new Set<EnemyKind>();
  private lastLightSpent = new Set<number>();
  private hierophantGraceSpent = new Set<number>();
  private graveWardSpent = new Set<number>();
  private holdFastSpent = new Set<number>();
  private priorityMarked = new Set<string>();
  private warningScale = 1;
  private presentedBossPhase = 0;

  constructor(
    public stage: StageDef,
    save: SaveData,
    public field: FieldRect,
    public fx: FxSystem,
    public tutorialMode = false,
  ) {
    const diff = DIFFICULTIES[save.difficulty ?? 1];
    this.introBanner = stage.fieldNote ? 4 : 2.6;
    this.warningScale = save.telegraphAssist === "extra" ? 1.5 : save.telegraphAssist === "long" ? 1.25 : 1;
    this.fx.setDetail(save.effectDensity);
    this.difficultyMult = this.tutorialMode ? 1 : diff.enemyMult;
    this.telegraphTime = (this.tutorialMode ? 1.5 : diff.telegraph) * this.warningScale;
    this.enemyHaste = this.tutorialMode ? 1 : diff.haste;
    this.extraSpawn = this.tutorialMode ? 0 : diff.extraSpawn;
    const roster = partyRoster(save);
    const midY = (field.top + field.bottom) / 2;
    const spread = Math.min(120, (field.bottom - field.top) / 3);
    for (let slot = 0; slot < roster.length; slot++) {
      const i = roster[slot];
      const t = roster.length === 1 ? 0.5 : slot / (roster.length - 1);
      const formationX =
        save.formation === "wedge"
          ? slot === 0
            ? 92
            : slot === roster.length - 1
              ? 42
              : 64
          : save.formation === "guard"
            ? slot < Math.ceil(roster.length / 2)
              ? 78
              : 38
            : 60 + Math.abs(t - 0.5) * 60;
      const pos: Vec = this.descending
        ? {
            x: (field.left + field.right) / 2 - spread + t * spread * 2,
            y: field.top + 48 + formationX * 0.22,
          }
        : {
            x: field.left + formationX,
            y: midY - spread + t * spread * 2,
          };
      const heroSave = save.heroes[i];
      // an oath only holds while its stat requirements are still met
      const sworn = callingById(heroSave.calling);
      const oath = sworn && callingEligible(sworn, heroSave.attrs) ? sworn : null;
      const advanced = oath ? heroSave.advCalling : null;
      const stats = deriveStats(heroSave.attrs, heroSave.weaponTier, heroGearOf(heroSave, save.forge), heroSave.talents, heroSave.trinket, oath?.id ?? null, advanced, heroSave.masteredElements);
      const normalDefs = oath ? [...resolvedPathAbilities(oath.discipline, oath.element, heroSave.equipped, heroSave.masteredSpecializations)] : [];
      const abilities: AbilityState[] = (normalDefs.length ? normalDefs : heroSave.equipped
        .map((id) => abilityById(id))
        .filter((d): d is NonNullable<typeof d> => !!d))
        .map((def) => ({ def, timer: 0 }));
      if (oath) abilities.push({ def: oath.signature, timer: 1, ult: true });
      // Ordinary armor is passive-only. A future legendary may explicitly
      // carry an active without reopening the old family-skill system.
      const bodyPiece = armorById(heroSave.armor);
      if (bodyPiece?.active) abilities.push({ def: bodyPiece.active, timer: 0, armorSkill: true });
      this.units.push({
        id: this.nextUnitId++,
        name: HEROES[i].name,
        team: "hero",
        heroIndex: i,
        enemyKind: null,
        calling: oath?.id ?? null,
        advCalling: advanced,
        discipline: oath?.discipline ?? heroSave.discipline ?? null,
        element: oath?.element ?? heroSave.element ?? null,
        ultCharge: 0,
        pathResource: oath?.discipline === "warrior" || oath?.discipline === "necromancer" ? 0 : undefined,
        entered: true,
        x: this.descending ? pos.x : field.left - 72 - slot * 24,
        y: this.descending ? field.top - 72 - slot * 24 : pos.y,
        radius: 15,
        stats,
        hp: stats.maxHp,
        attackTimer: 0,
        moveTarget: pos,
        attackTarget: null,
        healTarget: null,
        stance: (oath?.discipline ?? heroSave.discipline) === "priest" || heroSave.attrs.spi >= 6 ? "heal" : "attack",
        autoOrder: false,
        abilities,
        effects: [],
        elementBuildup: {},
        lastBuildElement: null,
        facing: 1,
        bobPhase: Math.random() * Math.PI * 2,
        lunge: 0,
        lungeDir: { x: 1, y: 0 },
        hitFlash: 0,
        castGlow: 0,
        channelBeam: 0,
        deathTime: 0,
        alive: true,
        aggro: null,
        supportTimer: 0,
        phase: 0,
        windup: 0,
        pendingTarget: null,
        alert: 0,
        celebrate: false,
        idleTimer: 3 + Math.random() * 4,
        idleAnim: 0,
        leap: null,
        marching: true,
      });
      const ward = talentMods(heroSave.talents).startShield + trinketMods(heroSave.trinket).startShield;
      if (ward > 0) {
        this.units[this.units.length - 1].effects.push(makeEffect("shield", 9999, ward, null));
      }
    }
  }

  heroes(): Unit[] {
    return this.units.filter((u) => u.team === "hero");
  }

  livingHeroes(): Unit[] {
    return this.units.filter((u) => u.team === "hero" && u.alive);
  }

  livingEnemies(): Unit[] {
    return this.units.filter((u) => u.team === "enemy" && u.alive);
  }

  attrOf(unit: Unit, key: "str" | "dex" | "int" | "vit" | "spi", save: SaveData): number {
    return unit.heroIndex >= 0 ? save.heroes[unit.heroIndex].attrs[key] : 0;
  }

  spawnEnemy(kind: EnemyKind, overrides: { x?: number; y?: number; scale?: number } = {}): void {
    const def = ENEMIES[kind];
    const scale = (overrides.scale ?? this.stage.scale) * this.difficultyMult;
    const living = this.livingHeroes();
    const y = overrides.y ?? (this.descending
      ? Math.min(this.field.bottom + 30, (living.length ? Math.max(...living.map((h) => h.y)) : this.field.top + 100) + 360 + Math.random() * 70)
      : this.field.top + 20 + Math.random() * (this.field.bottom - this.field.top - 40));
    // foes are MET on the road, about a screen ahead of wherever the band has
    // pushed to — the wide field means the fight travels, not the walking
    const frontier = living.length ? Math.max(...living.map((h) => h.x)) : this.field.left + 200;
    const x = overrides.x ?? (this.descending
      ? this.field.left + 32 + Math.random() * (this.field.right - this.field.left - 64)
      : Math.min(this.field.right + 30, frontier + 620 + Math.random() * 90));
    this.units.push({
      id: this.nextUnitId++,
      name: def.name,
      team: "enemy",
      heroIndex: -1,
      enemyKind: kind,
      calling: null,
      advCalling: null,
      discipline: null,
      element: def.affinity ?? null,
      ultCharge: 0,
      entered: false,
      x,
      y,
      radius: def.radius,
      stats: {
        maxHp: Math.round(def.maxHp * scale),
        damage: def.damage * scale,
        range: def.range,
        attackCooldown: def.attackCooldown,
        speed: def.speed,
        armor: def.armor,
        healPower: 0,
        spellPower: 1,
        weapon: "sword",
      },
      hp: Math.round(def.maxHp * scale),
      attackTimer: 0.5 + Math.random() * 0.8,
      moveTarget: null,
      attackTarget: null,
      healTarget: null,
      stance: "attack",
      autoOrder: false,
      abilities: [],
      effects: [],
      elementBuildup: {},
      lastBuildElement: null,
        facing: this.descending ? (x > (this.field.left + this.field.right) / 2 ? -1 : 1) : -1,
      bobPhase: Math.random() * Math.PI * 2,
      lunge: 0,
      lungeDir: { x: -1, y: 0 },
      hitFlash: 0,
      castGlow: 0,
      channelBeam: 0,
      deathTime: 0,
      alive: true,
      aggro: null,
      supportTimer: 1 + Math.random(),
      phase: 0,
      windup: 0,
      pendingTarget: null,
      alert: 0,
      celebrate: false,
      idleTimer: 3 + Math.random() * 4,
      idleAnim: 0,
      leap: null,
    });
    // harriers arrive on the wing
    if (kind === "harrier" || kind === "galeharrier") {
      const bird = this.units[this.units.length - 1];
      bird.aloft = true;
      bird.supportTimer = 4 + Math.random() * 3;
    }
    // ELITE AFFIXES: some foes come touched — a title, a twist, and a lesson.
    // More of them on higher difficulties and deeper roads.
    const affixable = !this.tutorialMode && !BOSS_KINDS.includes(kind) && kind !== "warbanner" && kind !== "shambler";
    if (affixable) {
      const idx = this.saveRef?.difficulty ?? 1;
      const chance = [0, 0.1, 0.17, 0.24][idx] + this.stage.id * 0.005;
      if (Math.random() < chance) {
        const pool = ["stubborn", "swift", "burning", "bulwark", "vengeful"];
        const u = this.units[this.units.length - 1];
        u.affix = pool[Math.floor(Math.random() * pool.length)];
        if (u.affix === "stubborn") {
          u.stats.maxHp = Math.round(u.stats.maxHp * 1.35);
          u.hp = u.stats.maxHp;
          u.stats.armor = Math.min(0.6, u.stats.armor + 0.2);
        } else if (u.affix === "swift") {
          u.effects.push(makeEffect("haste", 9999, 1.3, null));
        } else if (u.affix === "bulwark") {
          u.effects.push(makeEffect("shield", 9999, 45, null));
        }
      }
    }
  }

  /** Elite titles, announced when they crash in. */
  static readonly AFFIX_NAMES: Record<string, string> = {
    stubborn: "STUBBORN",
    swift: "SWIFT",
    burning: "BURNING",
    bulwark: "WARDED",
    vengeful: "VENGEFUL",
  };

  private startNextWave(): void {
    this.waveIndex++;
    if (this.waveIndex >= this.stage.waves.length) {
      this.state = "victory";
      this.resultDelay = 1.4;
      this.slowmo = Math.max(this.slowmo, 1.1); // savor the final blow
      // The encounter is settled on the final blow. Stray hostile missiles and
      // warnings must not injure the band behind the victory banner or change a
      // flawless/contract result while the player reads the recap.
      this.projectiles.length = 0;
      this.telegraphs.length = 0;
      this.pendingSpawns.length = 0;
      // a shower of gold and light while the banner lands
      const cx = (this.field.left + this.field.right) / 2;
      const cy = (this.field.top + this.field.bottom) / 2;
      this.fx.ring(cx, cy, 180, "#ffe9a3", { width: 5, life: 0.8 });
      this.fx.burst(cx, cy - 20, "#ffd76b", 26, 220, { glow: true, gravity: 140, size: 4 });
      this.fx.burst(cx, cy - 20, "#fff3c0", 16, 160, { glow: true, gravity: 100 });
      for (const hero of this.livingHeroes()) {
        this.fx.burst(hero.x, hero.y - 20, "#ffe9a3", 8, 90, { glow: true, gravity: -60 });
        hero.celebrate = true;
        hero.facing = 1;
        hero.moveTarget = null;
        hero.attackTarget = null;
        hero.healTarget = null;
      }
      audio.play("victory");
      if (this.heroDeaths === 0) audio.play("flawless");
      return;
    }
    const bossWave = this.stage.waves[this.waveIndex].some((e) => BOSS_KINDS.includes(e.kind));
    // bosses stride in alone and at once; the rest trickle through the treeline
    let stagger = 0;
    const extraAt = this.stage.waves[this.waveIndex].findIndex((entry) => !BOSS_KINDS.includes(entry.kind) && !ENEMIES[entry.kind].priority);
    this.stage.waves[this.waveIndex].forEach((entry, at) => {
      const count = entry.count + (at === extraAt ? this.extraSpawn : 0);
      for (let i = 0; i < count; i++) {
        if (BOSS_KINDS.includes(entry.kind)) {
          this.spawnEnemy(entry.kind);
        } else if (stagger === 0) {
          this.spawnEnemy(entry.kind); // the wave visibly begins at once
          stagger += 0.55 + Math.random() * 0.5;
        } else {
          this.pendingSpawns.push({ kind: entry.kind, at: this.time + stagger });
          stagger += 0.55 + Math.random() * 0.5;
        }
      }
    });
    this.state = "fighting";
    this.waveBanner = 2.2;
    if (bossWave && !this.tutorialMode) {
      this.bossRef = this.units.find((u) => u.alive && BOSS_KINDS.includes(u.enemyKind ?? "")) ?? null;
      if (this.bossRef) {
        this.bossStagger = 0;
        this.bossStaggerMax = this.bossStaggerCapacity(this.bossRef.enemyKind);
        this.cinematic = 2.6;
        this.waveBanner = 0;
        const entranceColor = this.bossRef.enemyKind ? ENEMIES[this.bossRef.enemyKind].trim : "#ffe9a3";
        this.bossRef.castGlow = 1.35;
        this.fx.ring(this.bossRef.x, this.bossRef.y, this.bossRef.radius * 4.2, entranceColor, { width: 6, life: 1.15 });
        this.fx.burst(this.bossRef.x, this.bossRef.y, entranceColor, 18, 150, { glow: true, gravity: -45, life: 0.9, size: 3.5 });
        this.addDecal(this.bossRef.x, this.bossRef.y + 2, "scorch", this.bossRef.radius * 1.7);
        this.playBossEntrance(this.bossRef.enemyKind);
        this.setupBossObjectives(this.bossRef);
      }
    }
    this.seerGuard = this.livingHeroes().filter((h) => h.calling === "seer").length;
    this.lancerStruck.clear();
    // Trapper: a hidden snare beneath the foes' line
    for (const t of this.livingHeroes()) {
      if (t.calling === "trapper") {
        this.zones.push({
          x: this.descending ? (this.field.left + this.field.right) / 2 : this.field.right - 150,
          y: this.descending ? this.field.bottom - 70 : (this.field.top + this.field.bottom) / 2,
          radius: 75,
          time: 0,
          duration: 6,
          kind: "frost",
          power: 0.45,
          dps: 0,
          from: t,
        });
      }
    }
    // Wind Step: dodge-ready again at the start of every wave
    for (const hero of this.livingHeroes()) {
      hero.marching = false;
      hero.elementBuildup = {};
      hero.lastBuildElement = null;
      if (this.heroTalentRank(hero, "windStep") > 0) this.windstepReady.add(hero.id);
      if (this.heroTalentRank(hero, "afterimage") > 0) this.armorDodgeReady.add(hero.id);
      if (this.heroTalentRank(hero, "deepPockets") > 0) {
        this.gainUlt(hero, 20);
        this.fx.floatText(hero.x, hero.y - hero.radius * 3, "AMBUSH READY", "#e8b85a", 11);
      }
      // Second Breath: a gulp of air between fights
      if (this.heroTalentRank(hero, "secondBreath") > 0 && hero.hp < hero.stats.maxHp) {
        this.heal(hero, hero.stats.maxHp * 0.06, true, null);
      }
      const armorHook = this.armorHookOf(hero);
      if (armorHook === "dodgeFirstHit" || hero.advCalling === "phantom" || hasPromotion(hero, "rogue", "ascendant")) this.armorDodgeReady.add(hero.id);
      if (armorHook === "waveShield" || this.armorSetHookOf(hero) === "waveShield") {
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 9999, 30, null));
        // the ward shimmers into place so the player sees where it came from
        this.fx.ring(hero.x, hero.y - 14, hero.radius * 2.4, "#7db4e8", { width: 2.5, life: 0.6 });
        this.fx.burst(hero.x, hero.y - 18, "#b8d8f5", 6, 50, { glow: true, gravity: -50, life: 0.5 });
      }
    }
    audio.play("wave");
  }

  private objectivePoint(boss: Unit, dx: number, dy: number): Vec {
    return this.clampToField({ x: boss.x + dx, y: boss.y + dy }, 34);
  }

  /** Turn each late finale's written promise into something visible on the
   * field. Objectives are solved by positioning, keeping normal targeting
   * clean on both mouse and touch. */
  private setupBossObjectives(boss: Unit): void {
    this.bossObjectives = [];
    this.bossObjectiveTimer = 4.5;
    this.bossObjectivePhase = 0;
    if (!isLateBossKind(boss.enemyKind)) return;
    const add = (kind: BossObjective["kind"], dx: number, dy: number, required: number, extra: Partial<BossObjective> = {}) => {
      const p = this.objectivePoint(boss, dx, dy);
      this.bossObjectives.push({
        id: this.nextObjectiveId++, kind, x: p.x, y: p.y, radius: kind === "lightningRod" ? 34 : 42,
        progress: 0, required, active: true, resolved: false, ...extra,
      });
    };
    if (boss.enemyKind === "cindermaw") add("furnaceHeart", -72, 0, 3.2, { active: false });
    else if (boss.enemyKind === "verdantcolossus") {
      add("rootAnchor", -155, -78, 1.8);
      add("rootAnchor", -170, 82, 1.8);
      add("rootAnchor", 100, 92, 1.8);
    } else if (boss.enemyKind === "nightmother") {
      const trueIndex = (boss.id + this.stage.id) % 3;
      [[-145, -72], [-165, 82], [95, 88]].forEach(([dx, dy], index) => add("trueShadow", dx, dy, 1.65, { active: false, correct: index === trueIndex }));
    } else if (boss.enemyKind === "reliquaryseraph") {
      add("saintVessel", -170, -78, 2.35);
      add("saintVessel", -190, 82, 2.35);
      add("saintVessel", 105, 92, 2.35);
    } else if (boss.enemyKind === "skybreaker") {
      add("lightningRod", -175, -86, 1);
      add("lightningRod", -185, 86, 1);
      add("lightningRod", 105, 92, 1);
    } else if (boss.enemyKind === "wayeater") {
      add("waystone", -190, -82, 2.4);
      add("waystone", -205, 82, 2.4);
      add("waystone", 95, 92, 2.4);
    }
    const briefing: Partial<Record<LateBossKind, string>> = {
      cindermaw: "When the furnace-heart opens, stand within its ring to break it.",
      verdantcolossus: "Stand at each root-anchor to sever the grove from its armor.",
      nightmother: "The true shadow's inner moon turns against the false reflections.",
      reliquaryseraph: "Shatter the saint-vessels before they renew its borrowed wings.",
      skybreaker: "Carry marked lightning into the summit rods to ground the titan.",
      bloodmoonstag: "Dodge the marked hunt, then follow the heart-trail in order.",
      wayeater: "Anchor the waystones; their light shelters the band from unmaking.",
    };
    const text = briefing[boss.enemyKind];
    if (text) this.roleCallout = { title: "ARENA RULE", text, color: ENEMIES[boss.enemyKind].trim, time: 6.5 };
  }

  private remainingObjectives(kind: BossObjective["kind"]): number {
    return this.bossObjectives.filter((objective) => objective.kind === kind && !objective.resolved).length;
  }

  private completeBossObjective(objective: BossObjective, boss: Unit): void {
    objective.resolved = true;
    objective.progress = objective.required;
    const allDone = !this.bossObjectives.some((other) => other.kind === objective.kind && !other.resolved);
    const names: Record<BossObjective["kind"], string> = {
      furnaceHeart: "FURNACE-HEART BROKEN",
      rootAnchor: allDone ? "HEARTWOOD UNBOUND" : "ROOT-ANCHOR SEVERED",
      trueShadow: "TRUE SHADOW FOUND",
      saintVessel: allDone ? "BORROWED WINGS FALL" : "SAINT-VESSEL SHATTERED",
      lightningRod: allDone ? "SKYBREAKER GROUNDED" : "SUMMIT ROD CHARGED",
      heartTrail: allDone ? "THE TRAIL RETURNS" : "HEART-TRAIL FOUND",
      waystone: allDone ? "THE LAST ROAD HOLDS" : "WAYSTONE ANCHORED",
    };
    this.fx.floatText(objective.x, objective.y - objective.radius - 12, names[objective.kind], "#ffe9a3", allDone ? 18 : 14);
    this.fx.ring(objective.x, objective.y, objective.radius * 1.5, "#ffe9a3", { width: 5, life: 0.65 });
    this.fx.burst(objective.x, objective.y - 8, "#ffe9a3", 16, 135, { glow: true, gravity: 35 });
    audio.play("staggerBreak");

    if (objective.kind === "furnaceHeart") {
      boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.1);
      boss.effects.push(makeEffect("stun", 1.4, 1, null));
      boss.effects.push(makeEffect("vulnerable", 5, 0.38, null));
      this.bossStagger += this.bossStaggerMax * 0.35;
    } else if (objective.kind === "rootAnchor") {
      boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.035);
      this.bossStagger += this.bossStaggerMax * 0.12;
      if (allDone) boss.effects.push(makeEffect("vulnerable", 4.5, 0.36, null));
    } else if (objective.kind === "trueShadow") {
      for (const reflection of this.bossObjectives.filter((other) => other.kind === "trueShadow")) reflection.resolved = true;
      boss.effects.push(makeEffect("stun", 1.3, 1, null));
      boss.effects.push(makeEffect("vulnerable", 5, 0.42, null));
      this.bossStagger += this.bossStaggerMax * 0.3;
    } else if (objective.kind === "saintVessel") {
      boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.025);
      if (allDone) boss.effects.push(makeEffect("vulnerable", 4.5, 0.34, null));
    } else if (objective.kind === "lightningRod") {
      boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.025);
      if (allDone) {
        boss.effects.push(makeEffect("stun", 2.6, 1, null));
        boss.effects.push(makeEffect("vulnerable", 4.5, 0.38, null));
        this.bossStagger += this.bossStaggerMax * 0.4;
      }
    } else if (objective.kind === "heartTrail" && allDone) {
      boss.effects.push(makeEffect("stun", 1.2, 1, null));
      boss.effects.push(makeEffect("vulnerable", 5, 0.42, null));
      this.bossStagger += this.bossStaggerMax * 0.3;
    } else if (objective.kind === "waystone" && allDone) {
      boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.06);
      boss.effects.push(makeEffect("vulnerable", 4, 0.28, null));
    }
    if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(boss);
  }

  private failFalseShadow(objective: BossObjective, boss: Unit): void {
    objective.progress = 0;
    for (const reflection of this.bossObjectives.filter((other) => other.kind === "trueShadow" && !other.resolved)) reflection.progress = 0;
    for (const hero of this.livingHeroes()) {
      if (Math.hypot(hero.x - objective.x, (hero.y - objective.y) / 0.65) <= objective.radius + 35) {
        this.damage(hero, boss.stats.damage * 0.72, boss, { spell: true, color: "#c4a9ee", element: "shadow" });
      }
    }
    this.fx.floatText(objective.x, objective.y - 48, "FALSE MOON", "#c4a9ee", 16);
    this.fx.pool(objective.x, objective.y, 88, "78,56,118", 0.75);
    audio.play("bossEclipse");
  }

  private spawnHeartTrail(boss: Unit, mark: Telegraph): void {
    const angle = mark.angle ?? 0;
    const length = mark.length ?? 360;
    this.bossObjectives = [];
    for (let i = 0; i < 3; i++) {
      const distance = length * (0.16 + i * 0.2);
      const point = this.clampToField({ x: mark.x - Math.cos(angle) * distance, y: mark.y - Math.sin(angle) * distance }, 28);
      this.bossObjectives.push({
        id: this.nextObjectiveId++, kind: "heartTrail", x: point.x, y: point.y, radius: 34,
        progress: 0, required: 0.72, active: i === 0, resolved: false, order: i, expires: 11,
      });
    }
    this.fx.floatText(boss.x, boss.y - boss.radius * 3.2, "FOLLOW THE HEART-TRAIL!", "#ffe9a3", 17);
  }

  private updateBossObjectives(dt: number): void {
    const boss = this.bossRef;
    if (!boss?.alive || !isLateBossKind(boss.enemyKind)) return;
    if (!this.bossObjectives.length && boss.enemyKind !== "bloodmoonstag") return;

    if (boss.phase !== this.bossObjectivePhase) {
      this.bossObjectivePhase = boss.phase;
      if (boss.enemyKind === "cindermaw" && boss.phase >= 2) {
        const heart = this.bossObjectives.find((objective) => objective.kind === "furnaceHeart" && !objective.resolved);
        if (heart) heart.active = true;
      }
      if (boss.enemyKind === "nightmother" && boss.phase >= 2) {
        for (const reflection of this.bossObjectives.filter((objective) => objective.kind === "trueShadow" && !objective.resolved)) reflection.active = true;
      }
      if (boss.enemyKind === "reliquaryseraph" && boss.phase >= 2) {
        const remaining = this.remainingObjectives("saintVessel");
        if (remaining) {
          // Each intact vessel performs a modest renewal. Breaking them stops
          // later renewals instead of leaving an opaque permanent shield.
          this.heal(boss, boss.stats.maxHp * 0.012 * remaining, true, boss);
          this.fx.floatText(boss.x, boss.y - boss.radius * 3, "THE VESSELS RENEW ITS WINGS", "#ffe6a0", 15);
        }
      }
    }

    if (boss.enemyKind === "skybreaker" && this.remainingObjectives("lightningRod") > 0) {
      this.bossObjectiveTimer -= dt;
      if (this.bossObjectiveTimer <= 0 && !this.telegraphs.some((mark) => mark.owner === boss && mark.kind === "lightning")) {
        const heroes = this.livingHeroes();
        if (heroes.length) {
          const marked = heroes[(boss.phase + Math.floor(this.time)) % heroes.length];
          this.telegraphs.push({ x: marked.x, y: marked.y, radius: 64, time: 0, duration: 2.8 * this.warningScale, owner: boss, kind: "lightning", follow: marked, label: "FEED THE RODS" });
          this.fx.floatText(marked.x, marked.y - marked.radius - 26, "MARKED — BAIT A SUMMIT ROD", "#bdefff", 13);
          audio.play("bossShatter");
        }
        this.bossObjectiveTimer = boss.phase >= 3 ? 6.5 : 8.5;
      }
    }

    const heroes = this.livingHeroes();
    for (const objective of this.bossObjectives) {
      if (!objective.active || objective.resolved) continue;
      if (objective.expires !== undefined) {
        objective.expires -= dt;
        if (objective.expires <= 0) {
          this.bossObjectives = [];
          this.fx.floatText(boss.x, boss.y - boss.radius * 3, "THE TRAIL GOES COLD", "#f06d68", 15);
          break;
        }
      }
      if (objective.kind === "lightningRod") continue;
      const channelers = heroes.filter((hero) => Math.hypot(hero.x - objective.x, (hero.y - objective.y) / 0.72) <= objective.radius + hero.radius + 10);
      if (!channelers.length) {
        objective.progress = Math.max(0, objective.progress - dt * 0.22);
        continue;
      }
      objective.progress += dt * (1 + Math.min(2, channelers.length - 1) * 0.45);
      if (objective.progress < objective.required) continue;
      if (objective.kind === "trueShadow" && !objective.correct) this.failFalseShadow(objective, boss);
      else {
        this.completeBossObjective(objective, boss);
        if (objective.kind === "heartTrail") {
          const next = this.bossObjectives.find((other) => other.kind === "heartTrail" && !other.resolved && other.order === (objective.order ?? 0) + 1);
          if (next) next.active = true;
        }
      }
    }
  }

  private bossStaggerCapacity(kind: EnemyKind | null): number {
    let base = 240;
    if (kind === "wyrm") base = 440;
    else if (kind === "rimeheart") base = 400;
    else if (kind === "warlord") base = 340;
    else if (kind === "alpha") base = 280;
    else if (kind === "wayeater") base = 520;
    else if (isLateBossKind(kind)) base = 390 + Math.floor(this.stage.id / 12) * 18;
    // Harder foes gain some poise along with health, without making interrupts
    // disappear entirely on the upper difficulties.
    return Math.round(base * Math.sqrt(this.difficultyMult));
  }

  private playBossEntrance(kind: EnemyKind | null): void {
    if (kind === "warlord") audio.play("warhorn");
    else if (kind === "alpha") audio.play("howl");
    else if (kind === "ogre") audio.play("roar");
    else if (kind === "rimeheart" || kind === "wyrm") audio.play("glacialGroan");
    else if (kind === "bellwidow") audio.play("drumbeat");
    else if (kind === "stormjaw") audio.play("breach");
    else if (isLateBossKind(kind)) this.playLatePatternSound(this.latePatternOf(kind));
    else audio.play("roar");
  }

  private windstepReady = new Set<number>();
  private armorDodgeReady = new Set<number>();
  private miracleSpent = new Set<number>();
  private undyingSpent = new Set<number>();

  /** The battle-relevant quirk of whatever this hero is wearing. */
  private armorHookOf(unit: Unit): string | null {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return null;
    return armorById(this.saveRef.heroes[unit.heroIndex]?.armor)?.hook ?? null;
  }

  /** The hook earned by wearing three pieces of one family (mail aura / plate ward). */
  private armorSetHookOf(unit: Unit): string | null {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return null;
    const hero = this.saveRef.heroes[unit.heroIndex];
    if (!hero) return null;
    const set = armorSetOf(heroGearOf(hero));
    return set && set.tier >= 3 ? (SET_BONUSES[set.family].hook3 ?? null) : null;
  }

  /** Forge level of the hero's worn body piece — armor skills grow with it. */
  private bodyForgeOf(unit: Unit): number {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return 0;
    const id = this.saveRef.heroes[unit.heroIndex]?.armor;
    return id ? (this.saveRef.forge?.[id] ?? 0) : 0;
  }

  /** Rank of a talent on this unit's hero save (0 for enemies / no save). */
  heroTalentRank(unit: Unit, id: string): number {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return 0;
    return this.saveRef.heroes[unit.heroIndex]?.talents?.[id] ?? 0;
  }

  effect(unit: Unit, kind: StatusEffect["kind"]): StatusEffect | undefined {
    if (kind !== "haste") return unit.effects.find((e) => e.kind === kind);
    // Several sources can quicken the same unit. Cadence must use the strongest
    // live effect rather than whichever one happened to be inserted first.
    return unit.effects.reduce<StatusEffect | undefined>(
      (strongest, candidate) => candidate.kind === "haste" && (!strongest || candidate.power > strongest.power) ? candidate : strongest,
      undefined,
    );
  }

  private trinketHookOf(unit: Unit): string | null {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return null;
    return trinketById(this.saveRef.heroes[unit.heroIndex]?.trinket)?.hook ?? null;
  }

  private setElementCondition(target: Unit, element: ElementId, source: Unit | null): void {
    const specs: Record<ElementId, { kind: StatusEffect["kind"]; time: number; power: number; label: string }> = {
      flame: { kind: "burn", time: 4.5, power: target.team === "hero" ? 2.4 : 3.2, label: "BURNING" },
      frost: { kind: "frozen", time: target.team === "hero" ? 2 : 2.7, power: 0.48, label: "FROZEN" },
      storm: { kind: "conductive", time: 5.5, power: 0.15, label: "CONDUCTIVE" },
      earth: { kind: "brittle", time: 6, power: 0.2, label: "BRITTLE" },
      venom: { kind: "poisoned", time: 6, power: target.team === "hero" ? 1.4 : 2, label: "POISONED" },
      radiant: { kind: "exposed", time: 5, power: 0.15, label: "EXPOSED" },
      blood: { kind: "bleeding", time: 5.5, power: target.team === "hero" ? 1.5 : 2.2, label: "BLEEDING" },
      shadow: { kind: "shrouded", time: 5, power: 0.15, label: "SHROUDED" },
    };
    const spec = specs[element];
    const existing = this.effect(target, spec.kind);
    if (existing) {
      existing.time = Math.max(existing.time, spec.time);
      existing.power = Math.max(existing.power, spec.power);
      existing.source = source;
    } else {
      target.effects.push(makeEffect(spec.kind, spec.time, spec.power, source));
    }
    if (element === "frost") {
      const slow = this.effect(target, "slow");
      if (slow) { slow.time = Math.max(slow.time, spec.time); slow.power = Math.max(slow.power, spec.power); }
      else target.effects.push(makeEffect("slow", spec.time, spec.power, source));
    }
    this.fx.floatText(target.x, target.y - target.radius * 3 - 18, spec.label, ELEMENT_COLORS[element], 12);
    this.fx.ring(target.x, target.y, target.radius * 2.1, ELEMENT_COLORS[element], { width: 2.5, life: 0.45 });
  }

  private applyElementBuildup(target: Unit, element: DamageElement, amount: number, source: Unit | null, spell: boolean, secondary: boolean): void {
    if (element === "physical" || !source || source.team === target.team || secondary || !target.alive || target.hp <= 0) return;
    const def = target.enemyKind ? ENEMIES[target.enemyKind] : null;
    const boss = target.enemyKind ? BOSS_KINDS.includes(target.enemyKind) : false;
    let gain = (spell ? 24 : 10) + Math.min(24, amount * (spell ? 0.34 : 0.2));
    if (def?.affinity === element) gain *= 0.7;
    if (def?.weakTo === element) gain *= 1.15;
    const threshold = boss ? 165 : 100;
    const next = Math.min(threshold, (target.elementBuildup[element] ?? 0) + gain);
    target.elementBuildup[element] = next;
    target.lastBuildElement = element;
    if (next < threshold) return;
    target.elementBuildup[element] = 0;
    this.setElementCondition(target, element, source);
  }

  private speedOf(unit: Unit): number {
    let speed = unit.stats.speed;
    const slow = this.effect(unit, "slow");
    if (slow) speed *= 1 - slow.power;
    if (unit.enemyKind === "stormeel" && this.tideHigh) speed *= 1.18;
    // the drummer's rhythm puts spring in a foe's stride too
    if (unit.team === "enemy" && this.effect(unit, "haste")) speed *= 1.15;
    return speed;
  }

  /** Feed a hero's ultimate meter; announces the moment it fills. */
  private gainUlt(hero: Unit, amount: number): void {
    if ((!hero.calling && !hero.discipline) || !hero.alive || amount <= 0) return;
    const before = hero.ultCharge;
    hero.ultCharge = Math.min(100, hero.ultCharge + amount);
    if (before < 100 && hero.ultCharge >= 100) {
      const color = hero.element ? ELEMENT_COLORS[hero.element] : callingById(hero.calling)?.color ?? "#ffe9a3";
      this.fx.floatText(hero.x, hero.y - hero.radius * 3 - 12, "ultimate ready!", color, 13);
      this.fx.ring(hero.x, hero.y, 46, color, { width: 3, life: 0.5 });
      audio.play("ultReady");
      navigator.vibrate?.(35);
    }
  }

  private attackIntervalOf(unit: Unit): number {
    let interval = unit.stats.attackCooldown;
    const haste = this.effect(unit, "haste");
    if (haste) interval /= haste.power;
    if (unit.team === "enemy") interval /= this.enemyHaste;
    // Archers keep their cadence while the line holds; legacy Rangers inherit it.
    if ((unit.discipline === "archer" || unit.calling === "ranger") && !this.nearestEnemyWithin(unit, 70)) interval /= 1.15;
    // Rogues and storm-bound heroes trade a little safety for tempo.
    if (unit.discipline === "rogue") interval /= 1.08;
    if (unit.element === "storm") interval /= 1.05;
    // the Bard's song carries: allies near one strike quicker
    if (unit.team === "hero" && this.livingHeroes().some((s) => s.calling === "bard" && Math.hypot(s.x - unit.x, s.y - unit.y) < 140)) {
      interval /= 1.06;
    }
    // Berserker: the red mist quickens once blood is drawn
    if ((unit.advCalling === "berserker" || hasPromotion(unit, "warrior", "paragon")) && unit.hp < unit.stats.maxHp * 0.65) interval /= 1.25;
    return interval;
  }

  damage(
    target: Unit,
    rawAmount: number,
    source: Unit | null,
    opts: { spell?: boolean; color?: string; element?: DamageElement; secondary?: boolean } = {},
  ): void {
    if (!target.alive) return;
    const damageElement: DamageElement = opts.element ?? source?.element ?? "physical";
    if (
      source?.team === "hero" &&
      target.team === "enemy" &&
      this.heroTalentRank(source, "kingsRansom") > 0 &&
      (BOSS_KINDS.includes(target.enemyKind ?? "") || PRIORITY_ENEMIES.has(target.enemyKind!))
    ) rawAmount *= 1.2;
    if (target.team === "hero") {
      const citadel = this.livingHeroes().find((ally) => ally !== target && this.heroTalentRank(ally, "livingCitadel") > 0 && Math.hypot(ally.x - target.x, ally.y - target.y) < 125);
      if (citadel) rawAmount *= 0.9;
    }
    // Wind Step: shrug off the first hit of the wave entirely
    if (target.team === "hero" && this.windstepReady.has(target.id)) {
      this.windstepReady.delete(target.id);
      this.fx.floatText(target.x, target.y - target.radius - 16, "dodged!", "#b6f0a8", 13);
      this.fx.burst(target.x, target.y - 10, "#b6f0a8", 6, 80, { glow: true });
      return;
    }
    // wolf-taught footwork: some cloaks slip the first blow of every wave
    if (target.team === "hero" && this.armorDodgeReady.has(target.id)) {
      this.armorDodgeReady.delete(target.id);
      this.fx.floatText(target.x, target.y - target.radius - 16, "slipped!", "#c9c2e8", 13);
      this.fx.burst(target.x, target.y - 10, "#c9c2e8", 6, 80, { glow: true });
      return;
    }
    // a circling harrier is simply out of a blade's reach
    if (target.aloft && source && source.team === "hero" && !opts.spell && source.stats.range <= 90) {
      this.fx.floatText(target.x, target.y - target.radius - 40, "aloft!", "#d8cfc0", 11);
      return;
    }
    // the Wyrm beneath the ice cannot be touched — wait for the breach
    if (target.submerged && source && source.team === "hero") {
      if (Math.random() < 0.3) this.fx.floatText(target.x, target.y - 34, "beneath the ice!", "#b8e0f0", 11);
      return;
    }
    // FLANKING: a blade from behind bites deeper — for everyone. Positioning pays.
    if (source && source.alive && !opts.spell && source.team !== target.team && source.stats.range <= 90) {
      if ((source.x - target.x) * target.facing < 0) {
        rawAmount *= 1.25;
        if (Math.random() < 0.2) this.fx.floatText(target.x, target.y - target.radius - 28, "flanked!", "#ffd27d", 10);
      }
    }
    // Conditions create advantages, never hard locks. Reactions consume the
    // setup that enabled them so control cannot become permanent.
    let triggeredReaction = false;
    const frozen = this.effect(target, "frozen");
    const burning = this.effect(target, "burn");
    const conductive = this.effect(target, "conductive");
    const brittle = this.effect(target, "brittle");
    if (damageElement === "flame" && frozen) {
      triggeredReaction = true;
      rawAmount *= 1.25;
      target.effects = target.effects.filter((effect) => effect !== frozen && effect.kind !== "slow");
      this.fx.floatText(target.x, target.y - target.radius * 3 - 22, "THAW SHATTER +25%", ELEMENT_COLORS.flame, 11);
    } else if (damageElement === "frost" && burning) {
      triggeredReaction = true;
      rawAmount *= 1.2;
      target.effects = target.effects.filter((effect) => effect !== burning);
      this.fx.floatText(target.x, target.y - target.radius * 3 - 22, "QUENCHED +20%", ELEMENT_COLORS.frost, 11);
    } else if (damageElement === "storm" && conductive) {
      triggeredReaction = true;
      rawAmount *= 1.15;
      target.effects = target.effects.filter((effect) => effect !== conductive);
      target.effects.push(makeEffect("stun", target.team === "hero" ? 0.35 : 0.6, 1, source));
      this.fx.floatText(target.x, target.y - target.radius * 3 - 22, "SURGE +15%", ELEMENT_COLORS.storm, 11);
    } else if ((damageElement === "earth" || damageElement === "physical") && brittle) {
      triggeredReaction = true;
      rawAmount *= 1.2;
      target.effects = target.effects.filter((effect) => effect !== brittle);
      this.fx.floatText(target.x, target.y - target.radius * 3 - 22, "FRACTURED +20%", ELEMENT_COLORS.earth, 11);
    }
    if (triggeredReaction) {
      const reactionColor = damageElement === "physical" ? ELEMENT_COLORS.earth : ELEMENT_COLORS[damageElement];
      this.fx.ring(target.x, target.y, target.radius * 3.1, reactionColor, { width: 5, life: 0.48 });
      this.fx.ring(target.x, target.y, target.radius * 2.1, "rgba(255,255,255,.88)", { width: 2, life: 0.3 });
      this.fx.burst(target.x, target.y - target.radius * 0.5, reactionColor, 11, 115, { glow: true, gravity: 45, life: 0.42 });
      this.hitstop = Math.max(this.hitstop, 0.065);
      this.zoomPunch = Math.max(this.zoomPunch, 0.34);
      audio.reaction(damageElement === "physical" ? "earth" : damageElement);
    }
    if (
      triggeredReaction &&
      source?.team === "hero" &&
      (this.trinketHookOf(source) === "reactionEcho" || this.heroTalentRank(source, "elementalConduit") > 0)
    ) {
      const refund = this.trinketHookOf(source) === "reactionEcho" ? 2 : 1.5;
      for (const ability of source.abilities) if (!ability.ult) ability.timer = Math.max(0, ability.timer - refund);
      this.fx.floatText(source.x, source.y - source.radius * 3 - 8, "reaction echo", "#c8a8f0", 11);
      audio.play("ready");
    }
    const exposed = this.effect(target, "exposed");
    if (exposed) rawAmount *= 1 + exposed.power;
    if (source && this.effect(source, "shrouded")) rawAmount *= 0.85;
    // a BURNING elite's blows set you alight
    if (source?.affix === "burning" && !opts.spell && target.team === "hero") {
      target.effects.push(makeEffect("burn", 2.5, 3, source));
    }
    // Battleheart pacing: with cooldowns stretched, every hero cast lands harder
    if (opts.spell && source && source.team === "hero" && target.team === "enemy") rawAmount *= SPELL_POTENCY;
    let amount = rawAmount * (1 - target.stats.armor);
    const vulnerable = this.effect(target, "vulnerable");
    if (vulnerable) amount *= 1 + vulnerable.power;
    // Elemental matchups reward preparation without ever making a party invalid.
    // Bosses use gentler values so their mechanics, rather than loadout luck,
    // remain the deciding factor.
    if (target.team === "enemy" && target.enemyKind) {
      const element = damageElement;
      const def = ENEMIES[target.enemyKind];
      const boss = BOSS_KINDS.includes(target.enemyKind);
      const phaseWeakness: ElementId | undefined = target.enemyKind === "wyrm" && target.element === "flame" ? "frost" : def.weakTo;
      const phaseResistance: ElementId | undefined = target.enemyKind === "wyrm" && target.element === "flame" ? "flame" : def.resists;
      const key = `${target.id}:${element}`;
      if (phaseWeakness === element) {
        const bonus = boss ? 0.15 : 0.25;
        amount *= 1 + bonus;
        if (!this.elementWeakShown.has(key)) {
          this.elementWeakShown.add(key);
          this.fx.floatText(target.x, target.y - target.radius * 3 - 12, `WEAK +${Math.round(bonus * 100)}%`, ELEMENT_COLORS[element], 12);
          this.fx.ring(target.x, target.y, target.radius * 2.5, ELEMENT_COLORS[element], { width: 3.5, life: 0.46 });
          this.fx.burst(target.x, target.y - 8, ELEMENT_COLORS[element], 7, 80, { glow: true, gravity: 30, life: 0.36 });
        }
      } else if (phaseResistance === element) {
        const reduction = boss ? 0.1 : 0.15;
        amount *= 1 - reduction;
        if (!this.elementResistShown.has(key)) {
          this.elementResistShown.add(key);
          this.fx.floatText(target.x, target.y - target.radius * 3 - 12, `RESISTS -${Math.round(reduction * 100)}%`, "#c9c2b8", 11);
          this.fx.ring(target.x, target.y, target.radius * 2.3, "#c9c2b8", { width: 2, life: 0.4 });
        }
      }
    }
    // the pavise: blows from the front glance off, and friends crouch in its shadow
    if (target.team === "enemy" && source && source.team === "hero" && !opts.spell) {
      if ((target.enemyKind === "shieldbearer" || target.enemyKind === "brinecrawler") && source.x < target.x) {
        amount *= 0.45;
        if (Math.random() < 0.35) this.fx.floatText(target.x - target.radius, target.y - target.radius * 2.6, "blocked", "#c9d2dd", 10);
      } else if (
        target.enemyKind !== "shieldbearer" &&
        source.stats.range > 90 &&
        this.livingEnemies().some(
          (p) => (p.enemyKind === "shieldbearer" || p.enemyKind === "brinecrawler") && p !== target && target.x > p.x && target.x - p.x < 110 && Math.abs(target.y - p.y) < 48,
        )
      ) {
        amount *= 0.65;
      }
    }
    const guard = this.effect(target, "guard");
    if (guard) amount *= 1 - guard.power;
    // Knights hold the line; legacy Vanguards keep the same promise.
    if ((target.discipline === "knight" || target.calling === "vanguard") && this.nearestEnemyWithin(target, 60)) amount *= 0.9;
    // smoke cover softens whatever finds you in it
    if (target.team === "hero") {
      const smoke = this.zones.find(
        (z) => z.kind === "smoke" && Math.hypot(target.x - z.x, target.y - z.y) < z.radius + target.radius,
      );
      if (smoke) amount *= 1 - smoke.power;
    }
    // Bulwark Saint: allies shelter in the living wall's shadow
    if (
      target.team === "hero" &&
      this.livingHeroes().some((h) => h !== target && (h.advCalling === "bulwarkSaint" || hasPromotion(h, "knight", "ascendant")) && Math.hypot(h.x - target.x, h.y - target.y) < 90)
    ) {
      amount *= 0.92;
    }
    // the Warden's shelter: stand beside the standing stone
    if (target.team === "hero") {
      const warden = this.livingHeroes().find(
        (h) => h !== target && h.calling === "warden" && Math.hypot(h.x - target.x, h.y - target.y) < (h.advCalling === "oathkeeper" ? 130 : 90),
      );
      if (warden) amount *= warden.advCalling === "oathkeeper" ? 0.88 : 0.92;
    }
    // the Geomancer's patience is catching
    if (
      target.team === "hero" &&
      this.livingHeroes().some((h) => h !== target && h.calling === "geomancer" && Math.hypot(h.x - target.x, h.y - target.y) < 100)
    ) {
      amount *= 0.94;
    }
    // a Warden's Hauberk (or a full mail set) shelters everyone near its wearer
    if (
      target.team === "hero" &&
      this.livingHeroes().some(
        (h) => h !== target && (this.armorHookOf(h) === "allyAura" || this.armorSetHookOf(h) === "allyAura") && Math.hypot(h.x - target.x, h.y - target.y) < 90,
      )
    ) {
      amount *= 0.94;
    }
    // Warbreaker: melee blows are answered in kind
    if (
      (target.advCalling === "warbreaker" || hasPromotion(target, "warrior", "ascendant")) &&
      source &&
      source.team === "enemy" &&
      source.alive &&
      source.stats.range <= 90 &&
      !opts.spell
    ) {
      this.damage(source, rawAmount * 0.25, target, { spell: true, color: "#e0a34b" });
    }
    // the Duelist's riposte: melee blows against them are answered
    if (
      (target.calling === "duelist" || target.advCalling === "thornwarden") &&
      source &&
      source.team === "enemy" &&
      source.alive &&
      source.stats.range <= 90 &&
      !opts.spell
    ) {
      const bite = target.advCalling === "corsair" ? 0.5 : 0.25;
      this.damage(source, rawAmount * bite, target, { spell: true, color: "#ffd27d" });
    }
    // NO QUARTER: the enraged warlord answers melee blows himself
    if (
      target.enemyKind === "warlord" &&
      target.phase >= 3 &&
      source &&
      source.team === "hero" &&
      source.stats.range <= 90 &&
      !opts.spell
    ) {
      this.damage(source, rawAmount * 0.15, target, { spell: true, color: "#ff8a70" });
    }
    // Gorehulk's Wall answers melee blows with iron
    if (
      target.team === "hero" &&
      this.armorHookOf(target) === "retaliate" &&
      source &&
      source.team === "enemy" &&
      source.alive &&
      source.stats.range <= 90 &&
      !opts.spell
    ) {
      this.damage(source, 6, target, { spell: true, color: "#c9a06b" });
    }
    const retaliation = this.heroTalentRank(target, "retaliation");
    if (retaliation > 0 && source?.team === "enemy" && source.alive && source.stats.range <= 90 && !opts.spell) {
      this.damage(source, rawAmount * retaliation * 0.05, target, { spell: true, color: "#d6b37a", secondary: true });
    }
    // the Seer's foresight: one heavy blow a wave lands soft
    if (target.team === "hero" && this.seerGuard > 0 && amount > target.stats.maxHp * 0.25) {
      amount *= 0.5;
      this.seerGuard--;
      this.fx.floatText(target.x, target.y - target.radius - 30, "foreseen!", "#b8a8e8", 13);
    }
    amount = Math.max(1, Math.round(amount * (0.9 + Math.random() * 0.2)));
    const shield = this.effect(target, "shield");
    if (shield) {
      const absorbed = Math.min(shield.power, amount);
      shield.power -= absorbed;
      amount -= absorbed;
      if (shield.power <= 0) target.effects = target.effects.filter((e) => e !== shield);
      if (absorbed > 0) this.fx.floatText(target.x, target.y - target.radius - 18, `${absorbed}`, "#9fc6e8", 13);
      if (amount <= 0) return;
    }
    target.hp -= amount;
    if (target.team === "hero" && target.hp > 0 && target.hp < target.stats.maxHp * 0.35) {
      if (this.heroTalentRank(target, "holdFast") > 0 && !this.holdFastSpent.has(target.id)) {
        this.holdFastSpent.add(target.id);
        target.effects.push(makeEffect("shield", 9999, Math.round(target.stats.maxHp * 0.18), target));
        this.fx.ring(target.x, target.y - 12, 50, "#9fc6e8", { width: 4, life: 0.8 });
        this.fx.floatText(target.x, target.y - target.radius * 3, "HOLD FAST", "#d8edf8", 14);
        audio.play("shield");
      }
      if (this.trinketHookOf(target) === "lastLight" && !this.lastLightSpent.has(target.id)) {
        this.lastLightSpent.add(target.id);
        this.heal(target, target.stats.maxHp * 0.2, true, target);
        for (const ally of this.livingHeroes()) {
          ally.effects.push(makeEffect("shield", 9999, Math.max(12, Math.round(ally.stats.maxHp * 0.1)), target));
          this.fx.ring(ally.x, ally.y - 12, 38, "#ffe9a3", { width: 2.5, life: 0.65 });
        }
        this.fx.floatText(target.x, target.y - target.radius * 3 - 10, "LAST LIGHT", "#ffe9a3", 14);
        audio.play("levelup");
      }
    }
    if (this.carry && target === this.carry.ogre) this.carry.hurt += amount;
    if (this.tutorialMode && target.team === "hero" && target.hp < 1) target.hp = 1;
    if (target.team === "hero" && target.hp <= 0) {
      const hierophant = this.livingHeroes().find((hero) =>
        hasPromotion(hero, "priest", "ascendant") &&
        !this.hierophantGraceSpent.has(hero.id) &&
        (hero === target || target.effects.some((effect) => effect.source === hero && (effect.kind === "guard" || effect.kind === "shield"))),
      );
      if (hierophant) {
        this.hierophantGraceSpent.add(hierophant.id);
        target.hp = Math.max(1, Math.round(target.stats.maxHp * 0.2));
        target.effects.push(makeEffect("shield", 6, Math.round(target.stats.maxHp * 0.18), hierophant));
        this.fx.ring(target.x, target.y - 12, 58, ELEMENT_COLORS[hierophant.element ?? "radiant"], { width: 5, life: 0.85 });
        this.fx.floatText(target.x, target.y - target.radius * 3, "FATE REFUSES", "#ffe9a3", 15);
        audio.play("levelup");
      }
    }
    if (target.team === "hero" && target.hp <= 0 && this.trinketHookOf(target) === "graveWard" && !this.graveWardSpent.has(target.id)) {
      this.graveWardSpent.add(target.id);
      target.hp = Math.max(1, Math.round(target.stats.maxHp * 0.1));
      target.effects.push(makeEffect("shield", 9999, Math.round(target.stats.maxHp * 0.12), target));
      this.fx.burst(target.x, target.y - 10, "#b8b29a", 14, 110, { glow: true });
      this.fx.floatText(target.x, target.y - target.radius * 3, "GRAVEWARD", "#e4dfc8", 15);
      audio.play("staggerBreak");
    } else if (target.team === "hero" && target.hp <= 0 && this.heroTalentRank(target, "miracle") > 0 && !this.miracleSpent.has(target.id)) {
      this.miracleSpent.add(target.id);
      target.hp = Math.max(1, Math.round(target.stats.maxHp * 0.25));
      this.fx.ring(target.x, target.y - 12, 48, "#ffe9a3", { width: 4, life: 0.7 });
      this.fx.floatText(target.x, target.y - target.radius * 3, "miracle!", "#ffe9a3", 15);
      audio.play("levelup");
    } else if (target.team === "hero" && target.hp <= 0 && this.heroTalentRank(target, "undying") > 0 && !this.undyingSpent.has(target.id)) {
      this.undyingSpent.add(target.id);
      target.hp = Math.max(1, Math.round(target.stats.maxHp * 0.15));
      this.fx.burst(target.x, target.y - 10, "#d99b78", 14, 120, { glow: true });
      this.fx.floatText(target.x, target.y - target.radius * 3, "undying!", "#f0b38e", 15);
      audio.play("thud");
    }
    const lethal = target.hp <= 0;
    this.applyElementBuildup(target, damageElement, amount, source, !!opts.spell, !!opts.secondary);
    if (source && source.team === "hero" && source.heroIndex >= 0 && target.team === "enemy") {
      this.tally(source.heroIndex).dealt += amount;
      if (BOSS_KINDS.includes(target.enemyKind ?? "")) {
        this.threat[source.id] = (this.threat[source.id] ?? 0) + amount * this.threatMult(source);
        if (target === this.bossRef && this.bossStaggerMax > 0 && !this.effect(target, "stun")) {
          this.bossStagger += amount * (this.effect(target, "vulnerable") ? 0.9 : 0.5);
          if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(target);
        }
      }
      if (target.enemyKind && ENEMIES[target.enemyKind].priority && this.trinketHookOf(source) === "priorityMark") {
        const markKey = `${source.id}:${target.id}`;
        if (!this.priorityMarked.has(markKey)) {
          this.priorityMarked.add(markKey);
          target.effects.push(makeEffect("exposed", 3.5, 0.12, source));
          this.fx.ring(target.x, target.y, target.radius * 2.8, "#ffd76b", { width: 3, life: 0.65 });
          this.fx.floatText(target.x, target.y - target.radius * 3 - 8, "TRUE MARK", "#ffd76b", 12);
        }
      }
    }
    if (target.team === "hero" && target.heroIndex >= 0) {
      this.tally(target.heroIndex).taken += amount;
    }
    // Ultimate charge now follows the broad discipline role. Legacy callings
    // remain as a fallback for old saves that have not migrated yet.
    if (source?.team === "hero" && target.team === "enemy" && !opts.secondary) {
      const primary = [
        "reaver", "ranger", "arcanist", "duelist", "spellblade", "nightblade",
        "pyromancer", "cryomancer", "tempest", "exorcist", "bloodknight", "lancer", "monk", "trapper", "alchemist", "warcrier",
      ].includes(source.calling ?? "");
      const roleRate = source.discipline === "rogue" || source.discipline === "archer" || source.discipline === "mage"
        ? 0.3
        : source.discipline === "knight"
          ? 0.18
          : source.discipline === "priest"
            ? 0.14
            : primary
              ? 0.3
              : source.calling === "trickster"
                ? 0.18
                : 0.12;
      this.gainUlt(source, amount * roleRate);
    }
    if (target.team === "hero") {
      const roleRate = target.discipline === "knight"
        ? 0.42
        : target.discipline === "priest"
          ? 0.18
          : target.calling === "vanguard"
            ? 0.42
            : target.calling === "warden"
              ? 0.38
              : target.calling === "geomancer"
                ? 0.34
                : 0.12;
      // Difficulty raises incoming damage; it should not also become an
      // unintended ultimate-generation bonus.
      this.gainUlt(target, (amount / Math.max(1, this.difficultyMult)) * roleRate);
    }
    if (amount > 24) this.hitstop = Math.max(this.hitstop, 0.055);
    if (amount > 18 && source) {
      const kdx = target.x - source.x;
      const kdy = target.y - source.y;
      const klen = Math.hypot(kdx, kdy) || 1;
      this.kickX += (kdx / klen) * Math.min(4, amount * 0.12);
      this.kickY += (kdy / klen) * Math.min(3, amount * 0.08);
    }
    if (source) {
      const recoil = this.normalize({ x: target.x - source.x, y: target.y - source.y });
      target.lungeDir = recoil;
    }
    target.hitFlash = amount > 22 ? 0.26 : 0.2;
    if (!lethal && this.saveRef?.damageNumbers !== false) {
      this.fx.floatText(
        target.x + (Math.random() * 16 - 8),
        target.y - target.radius - 14,
        `${amount}`,
        opts.color ?? (target.team === "hero" ? "#ff7d6b" : "#f2ead8"),
        target.team === "hero" ? 15 : 14,
      );
    }
    if (source) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.hypot(dx, dy) || 1;
      this.fx.spray(target.x, target.y - target.radius * 0.6, dx / len, dy / len, opts.color ?? "#e8564a", 5);
    } else {
      this.fx.burst(target.x, target.y - target.radius * 0.6, opts.color ?? "#e8564a", 5, 70);
    }
    if (lethal) {
      // One killing number replaces the old stacked normal + lethal pair.
      if (this.saveRef?.damageNumbers !== false) this.fx.floatText(target.x, target.y - target.radius - 26, `✦ ${amount}`, "#ffd76b", 20);
      this.hitstop = Math.max(this.hitstop, 0.09);
    }
    if (target.team === "enemy" && source && source.team === "hero" && !target.aggro) {
      target.aggro = source;
      target.alert = 0.5;
      this.fx.floatText(target.x, target.y - target.radius * 3 - 8, "!", "#ff8a70", 17);
    }
    // a struck hero answers back — unless already trading blows with someone else
    if (
      target.team === "hero" &&
      target.alive &&
      target.stance === "attack" &&
      !target.healTarget &&
      source &&
      source.team === "enemy" &&
      source.alive &&
      (!target.attackTarget || !target.attackTarget.alive)
    ) {
      target.attackTarget = source;
    }
    // Kindled Mind: damaging spells leave a scorch
    if (
      opts.spell &&
      source?.team === "hero" &&
      target.alive &&
      target.team === "enemy" &&
      (this.heroTalentRank(source, "kindledMind") > 0 || this.armorHookOf(source) === "burnOnSpell") &&
      !this.effect(target, "burn")
    ) {
      target.effects.push(makeEffect("burn", 3, 2.7, source));
    }
    // Pyromancer: everything it touches remembers the fire · Alchemist: the reagents keep eating
    if (opts.spell && source?.team === "hero" && target.alive && target.team === "enemy" && !this.effect(target, "burn")) {
      if (source.calling === "pyromancer") target.effects.push(makeEffect("burn", 3, 3.2, source));
      else if (source.calling === "alchemist") target.effects.push(makeEffect("burn", 4, 2.4, source));
    }
    // Cryomancer: every spell carries the still air
    if (opts.spell && source?.team === "hero" && source.calling === "cryomancer" && target.alive && target.team === "enemy") {
      target.effects.push(makeEffect("slow", 1.6, 0.3, source));
    }
    if (source && source.team === "enemy" && (source.enemyKind === "frostwolf" || source.enemyKind === "icewisp") && target.alive && target.team === "hero") {
      target.effects.push(makeEffect("slow", 1.6, 0.3, source));
    }
    audio.impact(amount, lethal, !!opts.spell);
    if (lethal) this.kill(target, source, true);
  }

  private tally(heroIndex: number): { dealt: number; taken: number; healed: number } {
    return (this.tallies[heroIndex] ??= { dealt: 0, taken: 0, healed: 0 });
  }

  heal(target: Unit, amount: number, showText = true, from: Unit | null = null): void {
    if (!target.alive || target.hp >= target.stats.maxHp) return;
    if (this.effect(target, "poisoned")) amount *= 0.7;
    // spell heals share the potency compensation (channel healing keeps its own pace)
    if (this.castingSpell && from && from.team === "hero") amount *= HEAL_POTENCY;
    if (from?.discipline === "priest") amount *= 1.05;
    const applied = Math.min(target.stats.maxHp - target.hp, amount);
    target.hp += applied;
    if (from && from.team === "hero" && from.heroIndex >= 0 && applied >= 1) {
      this.tally(from.heroIndex).healed += applied;
    }
    if (from && from.team === "hero" && target !== from) {
      const roleRate = from.discipline === "priest"
        ? 0.36
        : from.discipline === "knight"
          ? 0.2
          : from.calling === "chaplain"
            ? 0.36
            : from.calling === "seer"
              ? 0.3
              : from.calling === "bard"
                ? 0.25
                : from.calling === "warden"
                  ? 0.2
                  : 0.12;
      this.gainUlt(from, applied * roleRate);
    }
    if (showText && applied >= 1) {
      if (this.saveRef?.damageNumbers !== false) {
        this.fx.floatText(target.x, target.y - target.radius - 14, `+${Math.round(applied)}`, "#8ee88b", 14);
      }
    }
    if (from && from.team === "hero") {
      // Overflow: healing past full spills onto the most wounded other ally
      const spill = amount - applied;
      if (spill > 1 && this.heroTalentRank(from, "overflow") > 0) {
        let worst: Unit | null = null;
        let worstFrac = 0.999;
        for (const ally of this.livingHeroes()) {
          if (ally === target) continue;
          const frac = ally.hp / ally.stats.maxHp;
          if (frac < worstFrac) {
            worstFrac = frac;
            worst = ally;
          }
        }
        if (worst) this.heal(worst, spill, showText, null);
      }
      // Mender's Ward: topping an ally off leaves a small ward
      if (target.hp >= target.stats.maxHp && this.heroTalentRank(from, "mendersWard") > 0) {
        const shield = this.effect(target, "shield");
        if (!shield || shield.power < 10) {
          target.effects = target.effects.filter((e) => e.kind !== "shield");
          target.effects.push(makeEffect("shield", 9999, 10, from));
          this.fx.ring(target.x, target.y - 12, target.radius * 2.2, "#cfe0f0", { width: 2.5, life: 0.4 });
        }
      }
    }
  }

  private kill(unit: Unit, killer: Unit | null = null, impactPlayed = false): void {
    const deathCurse = unit.effects.find((effect) => effect.kind === "cursed" && effect.source?.alive);
    if (unit.team === "hero") this.heroDeaths++;
    // a VENGEFUL elite doesn't go quietly — back away from the body
    if (unit.team === "enemy" && unit.affix === "vengeful") {
      this.detonations.push({ x: unit.x, y: unit.y, at: this.time + 0.9, dmg: Math.max(10, unit.stats.damage * 1.2), r: 62 });
      this.fx.ring(unit.x, unit.y, 62, "#ff8a70", { width: 3, life: 0.9 });
      this.fx.floatText(unit.x, unit.y - unit.radius * 2.5, "it swells…", "#ff8a70", 12);
    }
    unit.alive = false;
    unit.hp = 0;
    unit.deathTime = 0;
    unit.moveTarget = null;
    unit.attackTarget = null;
    unit.healTarget = null;
    unit.effects = [];
    this.fx.burst(unit.x, unit.y - unit.radius * 0.5, unit.team === "enemy" ? "#c9c2b8" : "#e8a0a0", 14, 120, {
      gravity: 240,
    });
    // dust puff at the ground where they fall
    this.fx.burst(unit.x, unit.y, "rgba(190,175,150,0.7)", 8, 55, { gravity: -30, size: 4.5, life: 0.45 });
    this.addDecal(unit.x, unit.y + 2, "stain", unit.radius * 1.1);
    this.fx.ring(unit.x, unit.y, unit.radius * 2.4, "rgba(255,255,255,0.7)", { width: 2.5, life: 0.32 });
    this.fx.addShake(unit.radius > 20 ? 8 : 3);
    this.hitstop = Math.max(this.hitstop, unit.radius > 20 ? 0.1 : 0.06);
    if (unit.radius > 20) this.zoomPunch = Math.max(this.zoomPunch, 0.8);
    // a boss falls like a felled tower: slow motion, soul geyser, the works
    if (unit.enemyKind === "icewisp") {
      this.fx.burst(unit.x, unit.y - 18, "#d8f0f8", 12, 130, { glow: true, size: 3 });
      audio.play("wispShatter");
    }
    if (unit.enemyKind === "rimeheart") {
      this.fx.burst(unit.x, unit.y - 24, "#d8f0f8", 40, 260, { glow: true, gravity: 120, size: 5 });
      this.fx.burst(unit.x, unit.y - 24, "#8fb8cc", 24, 180, { gravity: 200, size: 4 });
      this.fx.ring(unit.x, unit.y, 220, "#b8e0f0", { width: 7, life: 0.9 });
      audio.play("staggerBreak");
    }
    if (unit.team === "enemy" && BOSS_KINDS.includes(unit.enemyKind ?? "")) {
      this.slowmo = Math.max(this.slowmo, 1.6);
      this.zoomPunch = Math.max(this.zoomPunch, 1.2);
      const bossColor = unit.enemyKind ? ENEMIES[unit.enemyKind].trim : "#d8efe8";
      this.fx.beam(unit.x, unit.y, 200, 22, bossColor, 1.4);
      this.fx.burst(unit.x, unit.y - 20, bossColor, 30, 220, { glow: true, gravity: -120, life: 1.1 });
      this.fx.burst(unit.x, unit.y - 10, "#ffd76b", 18, 160, { glow: true, gravity: 60 });
      this.fx.ring(unit.x, unit.y, 190, bossColor, { width: 7, life: 1 });
      this.fx.addShake(13);
      const accent = unit.enemyKind ? ENEMIES[unit.enemyKind].trim : "#ffe9a3";
      this.bossMoment = { eyebrow: "GREAT FOE FELLED", title: unit.name.toUpperCase(), accent, time: 2.35, maxTime: 2.35, final: true };
      audio.bossDefeated();
    }
    // kills surge the slayer's ultimate — Tricksters feast on them
    if (unit.team === "enemy" && killer?.team === "hero") {
      const saboteur = hasPromotion(killer, "rogue", "paragon");
      this.gainUlt(killer, killer.advCalling === "spellthief" || saboteur ? 25 : killer.calling === "trickster" || killer.calling === "nightblade" ? 18 : 6);
      // Nightblade: every kill is a step into the dark — speed, and pursuers lose the scent
      if (killer.calling === "nightblade") {
        killer.effects.push(makeEffect("haste", 1.6, 1.5, killer));
        for (const e of this.livingEnemies()) {
          if (e.aggro === killer) e.aggro = null;
        }
      }
      // Spellthief: every kill shaves a second off the spell cooldowns
      if (killer.advCalling === "spellthief" || saboteur) {
        for (const ab of killer.abilities) {
          if (!ab.ult && ab.timer > 0) ab.timer = Math.max(0, ab.timer - (saboteur ? 1.5 : 1));
        }
        if (saboteur) this.fx.floatText(killer.x, killer.y - killer.radius * 3, "RUIN PREPARED", ELEMENT_COLORS[killer.element ?? "venom"], 10);
      }
      // quick kills climb a chime ladder
      const streak = this.killStreaks.get(killer.id);
      const n = streak && this.time - streak.t < 4 ? streak.n + 1 : 1;
      this.killStreaks.set(killer.id, { n, t: this.time });
      audio.killChime(n);
      if (n === 3) this.fx.floatText(killer.x, killer.y - killer.radius * 3 - 8, "rampage!", "#ffd76b", 14);
    }
    // Battle Roar: kills whip the slayer into a brief fury
    if (unit.team === "enemy" && killer?.team === "hero" && this.heroTalentRank(killer, "battleRoar") > 0) {
      killer.effects = killer.effects.filter((e) => e.kind !== "haste");
      killer.effects.push(makeEffect("haste", 2.5, 1.35, killer));
      this.fx.burst(killer.x, killer.y - 16, "#ffd27d", 8, 90, { glow: true });
    }
    if (unit.team === "enemy" && killer?.team === "hero" && this.trinketHookOf(killer) === "packbreaker") {
      killer.effects = killer.effects.filter((effect) => effect.kind !== "haste" || effect.power > 1.25);
      killer.effects.push(makeEffect("haste", 2.2, 1.25, killer));
      killer.attackTimer = 0;
      this.fx.floatText(killer.x, killer.y - killer.radius * 3, "PACKBREAKER", "#d9b07d", 11);
    }
    if (unit.team === "enemy" && killer?.team === "hero") {
      const feast = this.heroTalentRank(killer, "warFeast") * 0.02 + this.heroTalentRank(killer, "redHarvest") * 0.08;
      if (feast > 0) this.heal(killer, killer.stats.maxHp * feast, false, killer);
      if (this.heroTalentRank(killer, "spellstorm") > 0) {
        for (const ability of killer.abilities) ability.timer = Math.max(0, ability.timer - 1);
        this.fx.floatText(killer.x, killer.y - killer.radius * 3, "spellstorm", "#c8a8f0", 11);
      }
    }
    // Marked Quarry: every solved role hastens the ultimate; priority enemies
    // pay three times as much for being correctly identified and focused.
    if (unit.team === "enemy" && killer?.team === "hero" && this.heroTalentRank(killer, "windfall") > 0) {
      const priority = PRIORITY_ENEMIES.has(unit.enemyKind!);
      this.gainUlt(killer, priority ? 12 : 4);
      this.fx.floatText(unit.x, unit.y - unit.radius - 6, priority ? "+12 ultimate" : "+4 ultimate", "#e8b85a", 11);
    }
    if (unit.team === "enemy" && killer?.team === "hero" && this.heroTalentRank(killer, "avatarOfWar") > 0) {
      const disciplineSkill = killer.abilities.find((ability) => ability.def.pathSkill === "core");
      if (disciplineSkill) disciplineSkill.timer = Math.max(0, disciplineSkill.timer - 2);
    }
    // Warcrier: every kill is a drumbeat the whole band marches to
    if (unit.team === "enemy" && killer?.team === "hero" && killer.calling === "warcrier") {
      for (const ally of this.livingHeroes()) {
        ally.effects = ally.effects.filter((e) => e.kind !== "haste" || e.power > 1.13);
        ally.effects.push(makeEffect("haste", 2, 1.12, killer));
      }
    }
    // Gravebind is a promise made before the kill: whoever lands the final
    // blow, the cursed body answers the Necromancer who marked it.
    if (unit.team === "enemy" && deathCurse?.source?.discipline === "necromancer" && deathCurse.source.element) {
      const necro = deathCurse.source;
      const necroElement = necro.element as ElementId;
      const empowered = BOSS_KINDS.includes(unit.enemyKind ?? "") || deathCurse.power >= 2;
      this.raiseNecroServant(necro, necroElement, unit.x, unit.y, empowered);
      unit.deathTime = 99;
      if (necroElement === "venom") {
        const next = this.livingEnemies()
          .filter((enemy) => !this.effect(enemy, "cursed"))
          .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y))[0];
        if (next && Math.hypot(next.x - unit.x, next.y - unit.y) < 150) {
          this.refreshPathEffect(next, "cursed", 8, 1, necro);
          this.fx.floatText(next.x, next.y - next.radius * 2.8, "PLAGUE PASSES", ELEMENT_COLORS.venom, 10);
        }
      } else if (necroElement === "radiant") {
        const ally = this.mostWoundedAlly();
        if (ally) this.heal(ally, 8 + necro.stats.damage * 0.25, true, necro);
      } else if (necroElement === "shadow") {
        for (const enemy of this.livingEnemies()) if (enemy.aggro === necro || enemy.attackTarget === necro) { enemy.aggro = null; enemy.attackTarget = null; }
      }
      this.fx.floatText(unit.x, unit.y - unit.radius * 2.6, "THE DEAD ANSWER", ELEMENT_COLORS[necroElement], 11);
    }
    // Necromancer: every nearby death leaves Remains. Liches immediately turn
    // a portion of that deathly momentum back into technique recovery.
    for (const necro of this.livingHeroes()) {
      if (necro.discipline !== "necromancer" || Math.hypot(necro.x - unit.x, necro.y - unit.y) >= 380) continue;
      necro.pathResource = Math.min(100, (necro.pathResource ?? 0) + (BOSS_KINDS.includes(unit.enemyKind ?? "") ? 50 : 20));
      this.gainUlt(necro, 7);
      if (necro.advCalling?.endsWith("-paragon")) {
        for (const ability of necro.abilities) if (!ability.ult) ability.timer = Math.max(0, ability.timer - 1.5);
      }
      this.fx.floatText(necro.x, necro.y - necro.radius * 3, "+REMAINS", "#b7a5d6", 10);
    }
    if (!impactPlayed) audio.play("thud");
    if (
      unit.team === "enemy" &&
      this.waveIndex >= this.stage.waves.length - 1 &&
      this.livingEnemies().length === 0 &&
      !this.tutorialMode
    ) {
      this.slowmo = 1.1;
      this.zoomPunch = Math.max(this.zoomPunch, 1);
    }
    if (unit.team === "enemy" && unit.enemyKind) {
      this.xpEarned += Math.round(ENEMIES[unit.enemyKind].xp * this.stage.scale);
      this.goldEarned += Math.round(ENEMIES[unit.enemyKind].xp * 0.7 * this.stage.scale);
      this.killCounts[unit.enemyKind] = (this.killCounts[unit.enemyKind] ?? 0) + 1;
    }
  }

  // ----- orders from input -----

  orderMove(hero: Unit, to: Vec): void {
    if (!hero.alive) return;
    hero.moveTarget = this.clampToField(to, hero.radius);
    hero.attackTarget = null;
    hero.healTarget = null;
    hero.autoOrder = false;
    this.ordersIssued++;
    this.fx.ring(hero.moveTarget.x, hero.moveTarget.y, 20, "rgba(255,250,220,0.9)", { width: 2.5, life: 0.45 });
  }

  orderAttack(hero: Unit, target: Unit): void {
    if (!hero.alive || !target.alive) return;
    hero.attackTarget = target;
    hero.healTarget = null;
    hero.moveTarget = null;
    hero.autoOrder = false;
    this.ordersIssued++;
    this.fx.ring(target.x, target.y, target.radius * 2.2, "#ff8a70", { width: 3, life: 0.5 });
  }

  orderHeal(hero: Unit, target: Unit): void {
    if (!hero.alive || !target.alive) return;
    hero.healTarget = target;
    hero.attackTarget = null;
    hero.moveTarget = null;
    hero.autoOrder = false;
    this.ordersIssued++;
    this.fx.ring(target.x, target.y, target.radius * 2.2, "#8ee88b", { width: 3, life: 0.5 });
  }

  addDecal(x: number, y: number, kind: "scorch" | "stain" | "print", size: number): void {
    this.decals.push({ x, y, kind, age: 0, size, angle: Math.random() * Math.PI });
    if (this.decals.length > 44) this.decals.shift();
  }

  clampToField(v: Vec, radius: number): Vec {
    return {
      x: Math.min(this.field.right - radius, Math.max(this.field.left + radius, v.x)),
      y: Math.min(this.field.bottom - radius, Math.max(this.field.top + radius, v.y)),
    };
  }

  // ----- abilities -----

  /** Refresh a path effect without building an unreadable tower of duplicates. */
  private refreshPathEffect(target: Unit, kind: StatusEffect["kind"], time: number, power: number, source: Unit): void {
    const existing = this.effect(target, kind);
    if (existing) {
      existing.time = Math.max(existing.time, time);
      existing.power = Math.max(existing.power, power);
      if (!existing.source || !existing.source.alive) existing.source = source;
      return;
    }
    target.effects.push(makeEffect(kind, time, power, source));
  }

  /** Element is the consequence; discipline decides how that consequence is delivered. */
  private applyPathElement(
    source: Unit,
    target: Unit,
    element: ElementId,
    tier: "core" | "focus" | "ultimate",
    baseDamage: number,
    allowPulse: boolean,
    doctrine = 0,
  ): void {
    if (!target.alive) return;
    const rank = tier === "core" ? 0 : tier === "focus" ? 1 : 2;
    const boss = BOSS_KINDS.includes(target.enemyKind ?? "");
    const color = ELEMENT_COLORS[element];
    const deepen = 1 + doctrine * 0.04;
    switch (element) {
      case "flame": {
        const alreadyBurning = !!this.effect(target, "burn");
        const duration = [3, 4.2, 5.8][rank];
        const dps = Math.max(2, baseDamage * [0.08, 0.11, 0.14][rank] * deepen);
        this.refreshPathEffect(target, "burn", duration, dps, source);
        if (alreadyBurning && allowPulse && doctrine >= 2) {
          const sparks = this.livingEnemies()
            .filter((enemy) => enemy !== target && unitDist(enemy, target) < 105 + doctrine * 9)
            .sort((a, b) => unitDist(a, target) - unitDist(b, target))
            .slice(0, Math.min(3, 1 + Math.floor(doctrine / 2)));
          for (const enemy of sparks) {
            this.damage(enemy, baseDamage * (0.14 + doctrine * 0.025), source, { spell: true, color, element, secondary: true });
            this.refreshPathEffect(enemy, "burn", duration * 0.72, dps * 0.7, source);
            this.fx.tracer(target.x, target.y - 10, enemy.x, enemy.y - 10, color, 0.24, 2.2);
          }
        }
        this.addDecal(target.x, target.y, "scorch", 16 + rank * 5);
        break;
      }
      case "frost": {
        const duration = [2.2, 3.2, 4.4][rank] * (boss ? 0.65 : 1);
        const slow = Math.min(0.62, [0.18, 0.28, 0.38][rank] * (boss ? 0.7 : 1) * deepen);
        this.refreshPathEffect(target, "slow", duration, slow, source);
        break;
      }
      case "storm": {
        this.refreshPathEffect(source, "haste", [1.8, 2.8, 4][rank] * deepen, [1.12, 1.2, 1.3][rank] + doctrine * 0.012, source);
        if (allowPulse) {
          const arcs = [1, 2, 3][rank] + Math.floor(doctrine / 2);
          const range = [115, 140, 170][rank];
          const others = this.livingEnemies()
            .filter((enemy) => enemy !== target && unitDist(enemy, target) < range)
            .sort((a, b) => unitDist(a, target) - unitDist(b, target))
            .slice(0, arcs);
          for (const enemy of others) {
            this.damage(enemy, baseDamage * [0.24, 0.29, 0.34][rank], source, { spell: true, color, element, secondary: true });
            this.fx.tracer(target.x, target.y - 14, enemy.x, enemy.y - 14, color, 0.28, 2.5 + rank * 0.5);
            this.fx.burst(enemy.x, enemy.y - 12, color, 4 + rank * 2, 70, { glow: true, life: 0.3 });
          }
        }
        break;
      }
      case "earth": {
        this.refreshPathEffect(source, "guard", [2.2, 3.4, 5][rank] * deepen, [0.12, 0.2, 0.3][rank] + doctrine * 0.012, source);
        if (boss) {
          if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [5, 10, 18][rank];
          this.refreshPathEffect(target, "slow", [0.8, 1.2, 1.8][rank], 0.16, source);
        } else {
          this.refreshPathEffect(target, "stun", [0.16, 0.34, 0.62][rank], 1, source);
        }
        break;
      }
      case "venom": {
        // Poison deliberately shares the existing damage-over-time vessel; the
        // green cast language and corrosion make it distinct without a second
        // hidden timer system.
        this.refreshPathEffect(target, "burn", [4, 5.2, 7][rank] * deepen, Math.max(1.8, baseDamage * [0.08, 0.1, 0.13][rank] * deepen), source);
        this.refreshPathEffect(target, "vulnerable", [2.5, 3.8, 5][rank] * deepen, [0.06, 0.1, 0.16][rank] + doctrine * 0.012, source);
        if (allowPulse && doctrine >= 3 && (this.effect(target, "poisoned") || this.effect(target, "vulnerable"))) {
          for (const enemy of this.livingEnemies()
            .filter((candidate) => candidate !== target && unitDist(candidate, target) < 120 + doctrine * 8)
            .sort((a, b) => unitDist(a, target) - unitDist(b, target))
            .slice(0, 1 + Math.floor(doctrine / 2))) {
            this.refreshPathEffect(enemy, "vulnerable", 2.5 + doctrine * 0.35, 0.04 + doctrine * 0.01, source);
            this.fx.tracer(target.x, target.y - 8, enemy.x, enemy.y - 8, color, 0.34, 1.7);
          }
        }
        break;
      }
      case "radiant": {
        if (rank > 0) this.refreshPathEffect(target, "vulnerable", [0, 3, 4.5][rank], [0, 0.08, 0.14][rank], source);
        if (allowPulse) {
          const ally = this.mostWoundedAlly();
          if (ally) {
            this.heal(ally, Math.max(3, baseDamage * [0.14, 0.2, 0.28][rank] * deepen), true, source);
            if (rank > 0) this.refreshPathEffect(ally, "shield", [0, 4, 6][rank] * deepen, [0, 8, 15][rank] + source.stats.healPower * 0.35 + doctrine * 1.5, source);
          }
        }
        break;
      }
      case "blood": {
        if (allowPulse && source.hp < source.stats.maxHp) {
          this.heal(source, Math.max(2, baseDamage * [0.1, 0.16, 0.24][rank] * deepen), true, source);
        }
        if (target.hp < target.stats.maxHp * 0.4) this.refreshPathEffect(target, "vulnerable", 2.2 + rank, 0.08 + rank * 0.04, source);
        break;
      }
      case "shadow": {
        this.refreshPathEffect(target, "vulnerable", [2, 3.2, 4.8][rank] * deepen, [0.07, 0.12, 0.18][rank] + doctrine * 0.01, source);
        this.refreshPathEffect(source, "guard", [1.3, 2.2, 3.4][rank] * deepen, [0.12, 0.2, 0.28][rank] + doctrine * 0.01, source);
        if (!boss) {
          const away = this.normalize({ x: target.x - source.x, y: target.y - source.y });
          const moved = this.clampToField({ x: target.x + away.x * [10, 19, 30][rank], y: target.y + away.y * [10, 19, 30][rank] }, target.radius);
          target.x = moved.x;
          target.y = moved.y;
        }
        if (allowPulse) {
          if (rank > 0 && source.discipline !== "priest") {
            this.zones.push({
              x: source.x,
              y: source.y,
              radius: rank === 2 ? 105 : 78,
              time: 0,
              duration: rank === 2 ? 5 : 3.5,
              kind: "smoke",
              power: rank === 2 ? 0.32 : 0.24,
              dps: 0,
              from: source,
            });
            this.fx.pool(source.x, source.y, rank === 2 ? 105 : 78, ELEMENT_POOL_COLORS.shadow, rank === 2 ? 1 : 0.75);
          }
          for (const enemy of this.livingEnemies()) {
            if (enemy.aggro === source) enemy.aggro = null;
            if (enemy.attackTarget === source) enemy.attackTarget = null;
          }
        }
        break;
      }
    }
    this.fx.burst(target.x, target.y - target.radius * 0.7, color, 3 + rank * 2, 60 + rank * 15, { glow: true, life: 0.35 });
  }

  /** Priest techniques express their element even when there is no enemy in
   *  the sanctuary. Offensive consequences still come from applyPathElement. */
  private applyPriestElementSupport(source: Unit, ally: Unit, element: ElementId, tier: "core" | "focus" | "ultimate", power: number): void {
    const rank = tier === "core" ? 0 : tier === "focus" ? 1 : 2;
    switch (element) {
      case "flame":
        this.refreshPathEffect(ally, "haste", [1.8, 2.8, 4][rank], [1.06, 1.1, 1.16][rank], source);
        break;
      case "frost":
        ally.effects = ally.effects.filter((effect) => effect.kind !== "slow");
        this.refreshPathEffect(ally, "guard", [2, 3, 4.5][rank], [0.06, 0.1, 0.16][rank], source);
        break;
      case "storm":
        this.refreshPathEffect(ally, "haste", [2.2, 3.5, 5][rank], [1.12, 1.2, 1.3][rank], source);
        break;
      case "earth":
        this.refreshPathEffect(ally, "guard", [2.5, 4, 6][rank], [0.1, 0.18, 0.26][rank], source);
        break;
      case "venom":
        ally.effects = ally.effects.filter((effect) => effect.kind !== "burn" && effect.kind !== "vulnerable");
        break;
      case "radiant":
        this.refreshPathEffect(ally, "shield", [3, 5, 7][rank], power * [0.22, 0.38, 0.58][rank], source);
        break;
      case "blood":
        if (ally.hp < ally.stats.maxHp * 0.55) this.refreshPathEffect(ally, "haste", [1.8, 2.8, 4][rank], [1.08, 1.14, 1.22][rank], source);
        break;
      case "shadow":
        this.refreshPathEffect(ally, "guard", [1.8, 3, 4.5][rank], [0.1, 0.17, 0.24][rank], source);
        if (rank > 0) {
          for (const enemy of this.livingEnemies()) {
            if (enemy.aggro === ally) enemy.aggro = null;
            if (enemy.attackTarget === ally) enemy.attackTarget = null;
          }
        }
        break;
    }
  }

  /** The shared element rule is only the foundation. This second layer gives
   * every one of the fifty-six Paths a discipline-specific way to exploit it. */
  private applyPathSignature(
    source: Unit,
    discipline: DisciplineId,
    element: ElementId,
    tier: "core" | "focus" | "ultimate",
    power: number,
    origin: Vec,
    center: Vec,
    hitTargets: Unit[],
    supportedAllies: Unit[],
    eventCount: number,
    overflowWard: number,
  ): void {
    const rank = tier === "core" ? 0 : tier === "focus" ? 1 : 2;
    const color = ELEMENT_COLORS[element];
    const enemies = this.livingEnemies();
    const allies = this.livingHeroes();
    const livingHits = hitTargets.filter((target) => target.alive);
    const fallenHits = hitTargets.filter((target) => !target.alive);
    let triggered = false;
    const within = (point: Vec, unit: Unit, radius: number) => Math.hypot(unit.x - point.x, unit.y - point.y) < radius + unit.radius;
    const leastHealthyAlly = () => [...allies].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0] ?? null;
    const ward = (ally: Unit, amount: number, time = 5 + rank) => {
      this.refreshPathEffect(ally, "shield", time, Math.max(3, amount), source);
      this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.25, color, { width: 2.5 + rank * 0.5, life: 0.45 });
    };
    const addWard = (ally: Unit, amount: number, time: number) => {
      const existing = this.effect(ally, "shield");
      const added = Math.max(3, amount);
      if (existing) {
        existing.time = Math.max(existing.time, time);
        existing.power = Math.min(ally.stats.maxHp * 0.6, existing.power + added);
        existing.source = source;
      } else {
        ally.effects.push(makeEffect("shield", time, Math.min(ally.stats.maxHp * 0.6, added), source));
      }
      this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.35, color, { width: 3 + rank * 0.5, life: 0.5 });
    };

    switch (discipline) {
      case "knight": {
        const nearAllies = allies.filter((ally) => within(source, ally, 118 + rank * 24));
        switch (element) {
          case "flame": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) {
              ward(ally, 5 + hitTargets.length * [2.5, 4, 6][rank] + power * 0.08);
              if (rank > 0) for (const near of nearAllies) this.refreshPathEffect(near, "guard", 2.5 + rank, 0.06 + rank * 0.04, source);
              triggered = true;
            }
            break;
          }
          case "frost":
            if (hitTargets.length) {
              ward(source, power * [0.18, 0.3, 0.46][rank], 4 + rank * 1.5);
              for (const target of livingHits) this.refreshPathEffect(target, "slow", [2.4, 4, 5.5][rank], [0.22, 0.34, 0.44][rank], source);
              triggered = true;
            }
            break;
          case "storm":
            if (hitTargets.length) {
              for (const ally of nearAllies) this.refreshPathEffect(ally, "haste", [1.8, 3, 4.8][rank], [1.08, 1.16, 1.25][rank], source);
              triggered = true;
            }
            break;
          case "earth":
            if (hitTargets.length) {
              for (const ally of nearAllies) this.refreshPathEffect(ally, "guard", [2, 3.5, 5.5][rank], [0.07, 0.12, 0.19][rank], source);
              for (const target of livingHits) {
                if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [3, 8, 15][rank];
              }
              triggered = true;
            }
            break;
          case "venom":
            if (hitTargets.length) {
              if (rank > 0) {
                for (const struck of hitTargets) {
                  for (const enemy of enemies) {
                    if (hitTargets.includes(enemy) || !within(struck, enemy, 76 + rank * 16)) continue;
                    this.refreshPathEffect(enemy, "vulnerable", 3.2 + rank, 0.07 + rank * 0.04, source);
                  }
                }
              }
              triggered = true;
            }
            break;
          case "radiant":
            if (hitTargets.length) {
              for (const ally of nearAllies) this.heal(ally, power * [0.1, 0.16, 0.24][rank], true, source);
              const weakest = leastHealthyAlly();
              if (weakest) ward(weakest, power * [0.12, 0.22, 0.36][rank]);
              triggered = true;
            }
            break;
          case "blood": {
            if (hitTargets.length) {
              const missing = 1 - source.hp / source.stats.maxHp;
              this.refreshPathEffect(source, "guard", 2.5 + rank, [0.1, 0.16, 0.23][rank] + missing * 0.12, source);
              if (fallenHits.length) this.refreshPathEffect(source, "haste", 2.5 + rank, 1.12 + rank * 0.08, source);
              triggered = true;
            }
            break;
          }
          case "shadow":
            if (hitTargets.length) {
              for (const target of livingHits) this.refreshPathEffect(target, "slow", [1.4, 2.4, 3.6][rank], [0.12, 0.2, 0.3][rank], source);
              for (const enemy of enemies) {
                if (enemy.aggro === source) enemy.aggro = null;
                if (enemy.attackTarget === source) enemy.attackTarget = null;
              }
              triggered = true;
            }
            break;
        }
        break;
      }
      case "warrior": {
        switch (element) {
          case "flame":
            for (const target of livingHits) this.refreshPathEffect(target, "burn", 3.5 + rank, Math.max(2, power * (0.05 + rank * 0.02)), source);
            triggered = hitTargets.length > 0;
            break;
          case "frost":
            for (const target of livingHits) {
              if (this.effect(target, "slow")) {
                if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [6, 14, 28][rank];
                else this.refreshPathEffect(target, "stun", [0.25, 0.55, 0.9][rank], 1, source);
              }
              this.refreshPathEffect(target, "slow", 3 + rank, 0.25 + rank * 0.08, source);
            }
            triggered = hitTargets.length > 0;
            break;
          case "storm":
            if (hitTargets.length) this.refreshPathEffect(source, "haste", 2.5 + rank, 1.12 + rank * 0.1, source);
            triggered = hitTargets.length > 0;
            break;
          case "earth":
            for (const target of livingHits) this.refreshPathEffect(target, "vulnerable", 3 + rank, 0.08 + rank * 0.05, source);
            if (hitTargets.length) this.refreshPathEffect(source, "guard", 2.5 + rank, 0.14 + rank * 0.06, source);
            triggered = hitTargets.length > 0;
            break;
          case "venom":
            for (const target of livingHits) this.refreshPathEffect(target, "vulnerable", 4 + rank, 0.12 + rank * 0.05, source);
            triggered = hitTargets.length > 0;
            break;
          case "radiant": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) ward(ally, power * (0.18 + rank * 0.11));
            triggered = hitTargets.length > 0;
            break;
          }
          case "blood":
            if (fallenHits.length) this.heal(source, power * (0.18 + rank * 0.08), true, source);
            triggered = hitTargets.length > 0;
            break;
          case "shadow":
            for (const target of livingHits) this.damage(target, power * [0.12, 0.2, 0.3][rank], source, { spell: true, color, element, secondary: true });
            triggered = hitTargets.length > 0;
            break;
        }
        break;
      }
      case "rogue": {
        switch (element) {
          case "flame": {
            const trailTargets = enemies.filter((enemy) => within(origin, enemy, [58, 78, 104][rank]));
            for (const enemy of trailTargets) {
              this.refreshPathEffect(enemy, "burn", 3.2 + rank, Math.max(1.6, power * [0.045, 0.065, 0.09][rank]), source);
              this.addDecal(enemy.x, enemy.y, "scorch", 13 + rank * 4);
            }
            triggered = trailTargets.length > 0 || hitTargets.length > 0;
            break;
          }
          case "frost":
            triggered = eventCount > 0;
            break;
          case "storm":
            if (livingHits.length) {
              for (const target of livingHits) {
                if (BOSS_KINDS.includes(target.enemyKind ?? "")) {
                  if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [2, 5, 9][rank];
                } else {
                  this.refreshPathEffect(target, "stun", [0.12, 0.22, 0.36][rank], 1, source);
                }
              }
              triggered = true;
            }
            break;
          case "earth": {
            const pursuers = enemies.filter((enemy) => within(origin, enemy, [62, 88, 118][rank]));
            for (const enemy of pursuers) this.refreshPathEffect(enemy, "slow", [1.8, 2.8, 4][rank], [0.2, 0.3, 0.4][rank], source);
            this.refreshPathEffect(source, "guard", 1.5 + rank, 0.12 + rank * 0.06, source);
            triggered = pursuers.length > 0 || hitTargets.length > 0;
            break;
          }
          case "venom":
            if (livingHits.length) {
              for (const target of livingHits) this.refreshPathEffect(target, "vulnerable", 3 + rank * 1.2, 0.1 + rank * 0.05, source);
              triggered = true;
            }
            break;
          case "radiant": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) {
              ward(ally, power * [0.15, 0.25, 0.38][rank]);
              triggered = true;
            }
            break;
          }
          case "blood":
            if (hitTargets.length) {
              if (fallenHits.length) {
                this.heal(source, power * (0.22 + rank * 0.08), true, source);
                this.refreshPathEffect(source, "haste", 2.2 + rank, 1.16 + rank * 0.08, source);
              }
              triggered = true;
            }
            break;
          case "shadow":
            if (hitTargets.length) {
              this.refreshPathEffect(source, "guard", 2 + rank, 0.18 + rank * 0.06, source);
              for (const enemy of enemies) {
                if (enemy.aggro === source) enemy.aggro = null;
                if (enemy.attackTarget === source) enemy.attackTarget = null;
              }
              if (rank === 0) {
                this.zones.push({ x: source.x, y: source.y, radius: 58, time: 0, duration: 2.2, kind: "smoke", power: 0.18, dps: 0, from: source, element });
                this.fx.pool(source.x, source.y, 58, ELEMENT_POOL_COLORS.shadow, 0.65);
              }
              triggered = true;
            }
            break;
        }
        break;
      }
      case "archer": {
        switch (element) {
          case "flame":
            if (hitTargets.length) {
              for (const struck of hitTargets) {
                for (const enemy of enemies) {
                  if (enemy === struck || !within(struck, enemy, 72 + rank * 12)) continue;
                  this.refreshPathEffect(enemy, "burn", 3.2 + rank, Math.max(1.5, power * [0.04, 0.06, 0.08][rank]), source);
                }
              }
              triggered = true;
            }
            break;
          case "frost":
            if (livingHits.length) {
              for (const target of livingHits) this.refreshPathEffect(target, "slow", 3 + rank * 1.2, 0.25 + rank * 0.07, source);
              triggered = true;
            }
            break;
          case "storm": {
            if (hitTargets.length) {
              const ally = allies.filter((candidate) => candidate !== source).sort((a, b) => unitDist(source, a) - unitDist(source, b))[0] ?? source;
              this.refreshPathEffect(ally, "haste", 2.4 + rank * 1.2, 1.12 + rank * 0.08, source);
              triggered = true;
            }
            break;
          }
          case "earth":
            if (livingHits.length) {
              for (const target of livingHits) {
                this.refreshPathEffect(target, "vulnerable", 2.4 + rank, 0.06 + rank * 0.04, source);
                if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [3, 8, 16][rank];
              }
              triggered = true;
            }
            break;
          case "venom":
            if (hitTargets.length) {
              if (rank > 0) {
                for (const struck of hitTargets) {
                  for (const enemy of enemies) {
                    if (hitTargets.includes(enemy) || !within(struck, enemy, 82 + rank * 12)) continue;
                    this.refreshPathEffect(enemy, "vulnerable", 3.5 + rank, 0.08 + rank * 0.04, source);
                  }
                }
              }
              triggered = true;
            }
            break;
          case "radiant": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) {
              ward(ally, power * [0.12, 0.23, 0.36][rank]);
              triggered = true;
            }
            break;
          }
          case "blood":
            if (hitTargets.length) {
              if (fallenHits.length) this.refreshPathEffect(source, "haste", 2.2 + rank, 1.12 + rank * 0.08, source);
              triggered = true;
            }
            break;
          case "shadow":
            if (hitTargets.length) {
              const away = this.normalize({ x: source.x - center.x, y: source.y - center.y });
              const step = [22, 48, 74][rank];
              const moved = this.clampToField({ x: source.x + away.x * step, y: source.y + away.y * step }, source.radius);
              source.x = moved.x;
              source.y = moved.y;
              this.refreshPathEffect(source, "guard", 1.8 + rank, 0.14 + rank * 0.06, source);
              for (const enemy of enemies) {
                if (enemy.aggro === source) enemy.aggro = null;
                if (enemy.attackTarget === source) enemy.attackTarget = null;
              }
              triggered = true;
            }
            break;
        }
        break;
      }
      case "priest": {
        switch (element) {
          case "flame":
            if (supportedAllies.length) {
              for (const ally of supportedAllies) {
                for (const enemy of enemies) {
                  if (!within(ally, enemy, 64 + rank * 16)) continue;
                  this.refreshPathEffect(enemy, "burn", 3.2 + rank, Math.max(1.5, power * [0.045, 0.065, 0.09][rank]), source);
                }
              }
              triggered = true;
            }
            break;
          case "frost":
            if (supportedAllies.length) {
              for (const ally of supportedAllies) {
                for (const enemy of enemies) {
                  if (within(ally, enemy, 72 + rank * 16)) this.refreshPathEffect(enemy, "slow", 2.2 + rank, 0.2 + rank * 0.08, source);
                }
              }
              triggered = true;
            }
            break;
          case "storm": {
            const target = enemies.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))[0];
            if (target && supportedAllies.length) {
              this.damage(target, power * [0.16, 0.22, 0.3][rank], source, { spell: true, color, element, secondary: true });
              this.fx.tracer(center.x, center.y - 12, target.x, target.y - 12, color, 0.3, 2.5 + rank);
              triggered = true;
            }
            break;
          }
          case "earth":
            if (supportedAllies.length) {
              for (const ally of supportedAllies) ward(ally, power * [0.1, 0.18, 0.28][rank]);
              triggered = true;
            }
            break;
          case "venom":
            if (eventCount > 0) {
              const recipients = enemies
                .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
                .slice(0, Math.min(enemies.length, eventCount + rank));
              for (const enemy of recipients) {
                this.refreshPathEffect(enemy, "vulnerable", 3.5 + rank, 0.1 + rank * 0.04, source);
                this.refreshPathEffect(enemy, "burn", 3 + rank, Math.max(1.4, power * 0.04), source);
              }
              triggered = true;
            }
            break;
          case "radiant":
            if (supportedAllies.length && overflowWard > 0) {
              addWard(supportedAllies[0], overflowWard * [0.65, 0.78, 0.92][rank], 5 + rank * 1.5);
              triggered = true;
            }
            break;
          case "blood": {
            const ally = this.mostWoundedAlly();
            if (ally && supportedAllies.length) {
              this.heal(ally, power * [0.12, 0.2, 0.3][rank], true, source);
              triggered = true;
            }
            break;
          }
          case "shadow":
            if (supportedAllies.length) {
              const covered = this.zones.some((zone) => zone.kind === "smoke" && zone.from === source && Math.hypot(zone.x - center.x, zone.y - center.y) < 30);
              if (!covered) {
                const radius = [64, 88, 118][rank];
                this.zones.push({ x: center.x, y: center.y, radius, time: 0, duration: [2.8, 4.2, 6][rank], kind: "smoke", power: [0.16, 0.24, 0.32][rank], dps: 0, from: source, element });
                this.fx.pool(center.x, center.y, radius, ELEMENT_POOL_COLORS.shadow, 0.75 + rank * 0.12);
              }
              triggered = true;
            }
            break;
        }
        break;
      }
      case "mage": {
        switch (element) {
          case "flame":
          case "frost":
          case "venom":
            triggered = eventCount > 0;
            break;
          case "storm":
            if (livingHits.length) {
              for (const target of livingHits) {
                const bossScale = BOSS_KINDS.includes(target.enemyKind ?? "") ? 0.35 : 1;
                const toward = this.normalize({ x: center.x - target.x, y: center.y - target.y });
                const step = [12, 26, 44][rank] * bossScale;
                const moved = this.clampToField({ x: target.x + toward.x * step, y: target.y + toward.y * step }, target.radius);
                target.x = moved.x;
                target.y = moved.y;
              }
              triggered = true;
            }
            break;
          case "earth": {
            const sheltered = allies.filter((ally) => within(center, ally, [82, 116, 164][rank]));
            for (const ally of sheltered) this.refreshPathEffect(ally, "guard", 2.5 + rank * 1.2, 0.08 + rank * 0.05, source);
            for (const target of livingHits) {
              if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [4, 10, 18][rank];
            }
            triggered = hitTargets.length > 0 || sheltered.length > 0;
            break;
          }
          case "radiant": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) {
              ward(ally, power * [0.1, 0.2, 0.34][rank]);
              triggered = true;
            }
            break;
          }
          case "blood":
            if (hitTargets.length) {
              const missing = 1 - source.hp / source.stats.maxHp;
              if (missing > 0.25) ward(source, power * missing * [0.1, 0.18, 0.28][rank], 3 + rank);
              triggered = true;
            }
            break;
          case "shadow":
            if (livingHits.length) {
              for (const target of livingHits) {
                const bossScale = BOSS_KINDS.includes(target.enemyKind ?? "") ? 0.35 : 1;
                const toward = this.normalize({ x: center.x - target.x, y: center.y - target.y });
                const step = [22, 46, 74][rank] * bossScale;
                const moved = this.clampToField({ x: target.x + toward.x * step, y: target.y + toward.y * step }, target.radius);
                target.x = moved.x;
                target.y = moved.y;
                this.refreshPathEffect(target, "slow", 1.8 + rank, 0.16 + rank * 0.06, source);
              }
              triggered = true;
            }
            break;
        }
        break;
      }
      case "necromancer": {
        switch (element) {
          case "flame":
            for (const target of livingHits) this.refreshPathEffect(target, "burn", 4 + rank, Math.max(2, power * [0.05, 0.075, 0.1][rank]), source);
            triggered = eventCount > 0 || hitTargets.length > 0;
            break;
          case "frost":
            for (const target of livingHits) this.refreshPathEffect(target, "slow", 3 + rank, 0.28 + rank * 0.08, source);
            if (hitTargets.length) ward(leastHealthyAlly() ?? source, power * [0.12, 0.22, 0.34][rank]);
            triggered = hitTargets.length > 0;
            break;
          case "storm": {
            const first = livingHits[0];
            const next = first ? enemies.find((enemy) => enemy !== first && within(first, enemy, 100 + rank * 20)) : null;
            if (next) this.damage(next, power * [0.18, 0.28, 0.4][rank], source, { spell: true, color, element, secondary: true });
            if (hitTargets.length) this.refreshPathEffect(source, "haste", 2.5 + rank, 1.1 + rank * 0.08, source);
            triggered = hitTargets.length > 0;
            break;
          }
          case "earth":
            if (hitTargets.length) for (const ally of allies.filter((ally) => within(center, ally, 110 + rank * 24))) ward(ally, power * [0.1, 0.18, 0.28][rank]);
            triggered = hitTargets.length > 0;
            break;
          case "venom":
            for (const target of livingHits) this.refreshPathEffect(target, "vulnerable", 4 + rank, 0.1 + rank * 0.05, source);
            triggered = hitTargets.length > 0;
            break;
          case "radiant": {
            const ally = leastHealthyAlly();
            if (ally && hitTargets.length) this.heal(ally, power * [0.18, 0.3, 0.46][rank], true, source);
            triggered = hitTargets.length > 0;
            break;
          }
          case "blood":
            if (hitTargets.length) this.heal(source, power * [0.12, 0.22, 0.34][rank], true, source);
            triggered = hitTargets.length > 0;
            break;
          case "shadow":
            for (const target of livingHits) {
              const toward = this.normalize({ x: center.x - target.x, y: center.y - target.y });
              const moved = this.clampToField({ x: target.x + toward.x * [18, 38, 62][rank], y: target.y + toward.y * [18, 38, 62][rank] }, target.radius);
              target.x = moved.x;
              target.y = moved.y;
            }
            if (rank > 0) for (const enemy of enemies) if (enemy.aggro === source) enemy.aggro = null;
            triggered = hitTargets.length > 0;
            break;
        }
        break;
      }
    }

    if (triggered) {
      const suffix = eventCount > 1 && (element === "frost" || element === "venom") ? ` x${eventCount}` : "";
      this.fx.floatText(source.x, source.y - source.radius * 2.6 - 22, `${PATH_SIGNATURE_CUES[discipline][element]}${suffix}`, color, tier === "ultimate" ? 14 : 11);
    }
  }

  /** Five readable delivery patterns, each deepened by a handcrafted
   * Discipline + Attunement signature without expanding the three-button bar. */
  private castPathAbility(hero: Unit, state: AbilityState, save: SaveData, aim: Vec | null, allyTarget: Unit | null): boolean {
    const discipline: DisciplineId | null = state.def.discipline ?? hero.discipline;
    const element: ElementId | null = state.def.element && state.def.element !== "physical" ? state.def.element : hero.element;
    const tier = state.def.pathSkill;
    if (!discipline || !element || !tier) return false;

    const attrs = save.heroes[hero.heroIndex].attrs;
    const roleStat = discipline === "knight"
      ? Math.max(attrs.str, attrs.vit)
      : discipline === "warrior"
        ? attrs.str
      : discipline === "rogue"
        ? Math.max(attrs.dex, attrs.str)
        : discipline === "archer"
          ? attrs.dex
          : discipline === "priest"
            ? attrs.spi
            : attrs.int;
    const tierRank = tier === "core" ? 0 : tier === "focus" ? 1 : 2;
    const variant = state.def.pathVariant;
    const variantScale = variant === "power" ? 1.18 : variant === "control" ? 0.9 : variant === "utility" ? 0.76 : 1;
    const doctrine = pathDoctrineRank(save.heroes[hero.heroIndex]);
    const damage = (5 + roleStat * 1.25 + hero.stats.damage * 0.55) * [0.72, 1, 1.45][tierRank] * variantScale * (1 + doctrine * 0.025);
    const color = ELEMENT_COLORS[element];
    const enemies = this.livingEnemies();
    const castOrigin = { x: hero.x, y: hero.y };
    let signatureCenter: Vec = aim ?? castOrigin;
    const hitTargets: Unit[] = [];
    const supportedAllies: Unit[] = [];
    let signatureEvents = 0;
    let overflowWard = 0;
    let pulseReady = true;
    let hitCount = 0;
    const hit = (target: Unit, multiplier = 1) => {
      if (!target.alive) return;
      const amount = damage * multiplier;
      hitTargets.push(target);
      this.damage(target, amount, hero, { spell: true, color, element });
      this.applyPathElement(hero, target, element, tier, amount, pulseReady, doctrine);
      pulseReady = false;
      hitCount++;
    };

    // Blood always asks its price up front, but never kills its bearer. The
    // path must connect (or deliberately dash/support) before this is charged.
    const payBloodPrice = () => {
      if (element !== "blood") return;
      const price = Math.min(hero.hp - 1, Math.max(1, hero.stats.maxHp * [0.025, 0.045, 0.075][tierRank]));
      if (price <= 0) return;
      hero.hp -= price;
      if (doctrine >= 3) this.refreshPathEffect(hero, "shield", 4.2, price * (0.28 + doctrine * 0.06), hero);
      this.fx.floatText(hero.x, hero.y - hero.radius - 18, `-${Math.round(price)} blood`, color, 11);
    };

    switch (discipline) {
      case "knight": {
        const nearest = enemies.sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        if (tier === "focus" && (aim || nearest)) {
          const toward = aim ?? nearest;
          const delta = { x: toward.x - hero.x, y: toward.y - hero.y };
          const length = Math.hypot(delta.x, delta.y);
          if (length > 1) {
            const step = Math.min(96, length);
            const moved = this.clampToField({ x: hero.x + (delta.x / length) * step, y: hero.y + (delta.y / length) * step }, hero.radius);
            hero.x = moved.x;
            hero.y = moved.y;
          }
        }
        payBloodPrice();
        const radius = [84, 112, 170][tierRank];
        for (const enemy of enemies) {
          if (unitDist(hero, enemy) < radius + enemy.radius) {
            let multiplier = tier === "ultimate" ? 1.1 : 1;
            if (element === "blood") {
              const missing = 1 - hero.hp / hero.stats.maxHp;
              multiplier *= 1 + missing * [0.2, 0.35, 0.55][tierRank];
            }
            hit(enemy, multiplier);
            if (enemy.alive && tier === "core") this.refreshPathEffect(enemy, "taunt", 2.4, 1, hero);
            if (enemy.alive && element !== "earth") {
              if (BOSS_KINDS.includes(enemy.enemyKind ?? "")) {
                if (tier !== "core" && enemy === this.bossRef) this.bossStagger += tier === "ultimate" ? 14 : 7;
              } else if (tier !== "core") {
                this.refreshPathEffect(enemy, "stun", tier === "ultimate" ? 0.5 : 0.24, 1, hero);
              }
            }
          }
        }
        this.refreshPathEffect(hero, "guard", [2.5, 4, 6][tierRank], [0.18, 0.28, 0.38][tierRank], hero);
        if (tier === "ultimate") {
          for (const ally of this.livingHeroes()) {
            if (unitDist(hero, ally) > radius + 35) continue;
            this.refreshPathEffect(ally, "guard", 4.5, 0.2, hero);
            this.refreshPathEffect(ally, "shield", 6, 10 + attrs.vit * 1.6, hero);
          }
          for (const enemy of enemies) this.refreshPathEffect(enemy, "taunt", 3.5, 1, hero);
        }
        hero.lunge = 1;
        signatureCenter = { x: hero.x, y: hero.y };
        hero.lungeDir = aim ? this.normalize({ x: aim.x - hero.x, y: aim.y - hero.y }) : { x: hero.facing, y: 0 };
        this.fx.slash(hero.x, hero.y - 12, Math.atan2(hero.lungeDir.y, hero.lungeDir.x), radius * 0.62, color, Math.PI * 1.45);
        this.fx.ring(hero.x, hero.y, radius, color, { width: 4 + tierRank, life: 0.45 + tierRank * 0.1 });
        break;
      }
      case "warrior": {
        if (!enemies.length) return false;
        payBloodPrice();
        const fury = hero.pathResource ?? 0;
        const spend = tier === "core" ? 0 : tier === "focus" ? Math.min(60, fury) : fury;
        const direction = this.normalize({ x: (aim?.x ?? hero.x + hero.facing * 100) - hero.x, y: (aim?.y ?? hero.y) - hero.y });
        const radius = [88, 122, 176][tierRank] + spend * 0.22;
        const arc = tier === "core" ? Math.PI * 0.9 : tier === "focus" ? Math.PI * 1.35 : Math.PI * 2;
        let total = 0;
        for (const enemy of enemies) {
          const delta = { x: enemy.x - hero.x, y: enemy.y - hero.y };
          const dist = Math.hypot(delta.x, delta.y);
          if (dist > radius + enemy.radius) continue;
          const dot = dist < 1 ? 1 : (delta.x * direction.x + delta.y * direction.y) / dist;
          if (tier !== "ultimate" && dot < Math.cos(arc / 2)) continue;
          const multiplier = (1 + spend / 120) * (hero.advCalling?.endsWith("-paragon") && hero.hp < hero.stats.maxHp * 0.55 ? 1.22 : 1);
          hit(enemy, multiplier);
          total += damage * multiplier;
          if (enemy === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += [5, 12, 24][tierRank] + spend * 0.12;
        }
        if (!hitTargets.length) return false;
        if (tier === "core") hero.pathResource = Math.min(100, fury + 14 + hitTargets.length * 8);
        else hero.pathResource = Math.max(0, fury - spend);
        if (hero.advCalling?.endsWith("-ascendant")) {
          this.refreshPathEffect(hero, "guard", 3.5 + tierRank, 0.18 + tierRank * 0.07, hero);
          if (tier === "ultimate") for (const ally of this.livingHeroes()) this.refreshPathEffect(ally, "shield", 6, damage * 0.32, hero);
        } else if (hero.advCalling?.endsWith("-paragon") && total > 0) {
          this.refreshPathEffect(hero, "haste", 3 + tierRank, 1.18 + tierRank * 0.08, hero);
          if (tier !== "core") this.heal(hero, total * 0.12, true, hero);
        }
        hero.lungeDir = direction;
        hero.lunge = 1.25;
        signatureCenter = { x: hero.x + direction.x * radius * 0.5, y: hero.y + direction.y * radius * 0.5 };
        this.fx.slash(hero.x, hero.y - 12, Math.atan2(direction.y, direction.x), radius * 0.72, color, arc);
        this.fx.ring(hero.x, hero.y, radius, color, { width: 5 + tierRank, life: 0.5 + tierRank * 0.12 });
        this.fx.floatText(hero.x, hero.y - hero.radius * 3.8, `FURY ${Math.round(hero.pathResource ?? 0)}`, color, 10);
        break;
      }
      case "rogue": {
        const candidates = enemies
          .filter((enemy) => unitDist(hero, enemy) < (tier === "ultimate" ? 430 : 350))
          .sort((a, b) => {
            if (aim) return Math.hypot(a.x - aim.x, a.y - aim.y) - Math.hypot(b.x - aim.x, b.y - aim.y);
            return a.hp / a.stats.maxHp - b.hp / b.stats.maxHp;
          });
        if (!candidates.length) {
          if (!aim || tier === "ultimate") return false;
          payBloodPrice();
          const from = { x: hero.x, y: hero.y };
          const d = this.normalize({ x: aim.x - hero.x, y: aim.y - hero.y });
          const distance = Math.min(tier === "focus" ? 240 : 175, Math.hypot(aim.x - hero.x, aim.y - hero.y));
          const to = this.clampToField({ x: hero.x + d.x * distance, y: hero.y + d.y * distance }, hero.radius);
          hero.x = to.x;
          hero.y = to.y;
          this.refreshPathEffect(hero, "guard", 1.2, 0.25, hero);
          this.fx.tracer(from.x, from.y - 12, to.x, to.y - 12, color, 0.35, 4);
          break;
        }
        payBloodPrice();
        const marks = tier === "ultimate" ? candidates.slice(0, 5) : candidates.slice(0, 1);
        for (const prey of marks) {
          const from = { x: hero.x, y: hero.y };
          const travelDir = this.normalize({ x: prey.x - hero.x, y: prey.y - hero.y });
          const side = tier === "focus" || tier === "ultimate" ? 1 : -1;
          const arrive = this.clampToField(
            { x: prey.x + travelDir.x * (prey.radius + hero.radius + 5) * side, y: prey.y + travelDir.y * (prey.radius + hero.radius + 5) * side },
            hero.radius,
          );
          hero.x = arrive.x;
          hero.y = arrive.y;
          const execute = prey.hp / prey.stats.maxHp < (tier === "focus" ? 0.45 : 0.32);
          let multiplier = tier === "ultimate" ? (execute ? 1.22 : 0.82) : tier === "focus" && execute ? 1.55 : 1;
          if (element === "frost" && this.effect(prey, "slow")) {
            multiplier *= [1.18, 1.32, 1.45][tierRank];
            signatureEvents++;
          } else if (element === "venom" && this.effect(prey, "vulnerable")) {
            multiplier *= [1.12, 1.26, 1.4][tierRank];
            signatureEvents++;
          }
          if (element === "blood") {
            const preyMissing = 1 - prey.hp / prey.stats.maxHp;
            multiplier *= 1 + preyMissing * [0.2, 0.34, 0.5][tierRank];
          }
          hit(prey, multiplier);
          this.fx.tracer(from.x, from.y - 12, hero.x, hero.y - 12, color, 0.28, 3 + tierRank);
          this.fx.slash(prey.x, prey.y - 12, Math.atan2(travelDir.y, travelDir.x), 42 + tierRank * 6, color, Math.PI * 1.1);
        }
        hero.moveTarget = null;
        hero.lunge = 1;
        signatureCenter = { x: hero.x, y: hero.y };
        // Opening Cut must actually break pursuit as its doctrine promises.
        // The short veil protects the reposition without giving the Rogue the
        // longer safety window reserved for focus and ultimate techniques.
        if (tier === "core") {
          this.refreshPathEffect(hero, "guard", 1.15, 0.18, hero);
          for (const enemy of enemies) {
            if (enemy.aggro === hero) enemy.aggro = null;
            if (enemy.attackTarget === hero) enemy.attackTarget = null;
          }
        }
        if (tier !== "core") {
          this.refreshPathEffect(hero, "guard", tier === "ultimate" ? 3 : 1.8, tier === "ultimate" ? 0.35 : 0.24, hero);
          this.refreshPathEffect(hero, "haste", tier === "ultimate" ? 3.5 : 2.2, tier === "ultimate" ? 1.35 : 1.2, hero);
          for (const enemy of enemies) {
            if (enemy.aggro === hero) enemy.aggro = null;
            if (enemy.attackTarget === hero) enemy.attackTarget = null;
          }
        }
        break;
      }
      case "archer": {
        if (!aim && !enemies.length) return false;
        payBloodPrice();
        const nearest = enemies.sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        const direction = this.normalize({ x: (aim?.x ?? nearest?.x ?? hero.x + hero.facing) - hero.x, y: (aim?.y ?? nearest?.y ?? hero.y) - hero.y });
        const reach = [430, 470, 540][tierRank];
        const width = [13, 28, 54][tierRank];
        const inLine = enemies
          .map((enemy) => ({ enemy, along: (enemy.x - hero.x) * direction.x + (enemy.y - hero.y) * direction.y }))
          .filter(({ enemy, along }) => along >= 0 && along <= reach && this.distToRay(hero, direction, reach, enemy) < enemy.radius + width)
          .sort((a, b) => a.along - b.along);
        const marks = tier === "core" ? inLine.slice(0, 1) : inLine;
        signatureCenter = aim ?? (marks[0]?.enemy ? { x: marks[0].enemy.x, y: marks[0].enemy.y } : { x: hero.x + direction.x * reach, y: hero.y + direction.y * reach });
        marks.forEach(({ enemy, along }, index) => {
          let multiplier = tier === "focus" && index === 0 ? 1.22 : tier === "ultimate" ? 1.05 : 1;
          if (element === "frost" && along > 230) {
            multiplier *= [1.16, 1.25, 1.36][tierRank];
            signatureEvents++;
          }
          if (element === "earth" && along > 210) {
            multiplier *= [1.14, 1.22, 1.32][tierRank];
            signatureEvents++;
          }
          if (element === "blood") {
            const wound = Math.max(1 - hero.hp / hero.stats.maxHp, 1 - enemy.hp / enemy.stats.maxHp);
            multiplier *= 1 + wound * [0.22, 0.36, 0.52][tierRank];
          }
          hit(enemy, multiplier);
        });
        this.fx.tracer(hero.x + direction.x * 12, hero.y - 14, hero.x + direction.x * reach, hero.y - 14 + direction.y * reach, color, 0.4 + tierRank * 0.08, 3 + tierRank * 1.5);
        for (let t = 55; t < reach; t += 72) this.fx.burst(hero.x + direction.x * t, hero.y - 14 + direction.y * t, color, 1 + tierRank, 32, { glow: true, life: 0.3 });
        hero.lungeDir = direction;
        hero.lunge = 0.65;
        break;
      }
      case "priest": {
        payBloodPrice();
        const support = allyTarget ?? this.mostWoundedAlly() ?? hero;
        signatureCenter = { x: support.x, y: support.y };
        const supportRadius = tier === "core" ? 0 : tier === "focus" ? 125 : Infinity;
        for (const ally of this.livingHeroes()) {
          if (supportRadius !== Infinity && ally !== support && unitDist(ally, support) > supportRadius) continue;
          if (tier === "core" && ally !== support) continue;
          const removedAilments = element === "venom"
            ? ally.effects.filter((effect) => effect.kind === "burn" || effect.kind === "vulnerable").length
            : 0;
          let healing = damage * [0.62, 0.5, 0.72][tierRank];
          if (element === "blood" && ally.hp < ally.stats.maxHp * 0.5) {
            healing *= [1.22, 1.3, 1.42][tierRank];
            signatureEvents++;
          }
          if (element === "radiant") {
            const effectiveHealing = healing * HEAL_POTENCY * 1.05;
            overflowWard += Math.max(0, effectiveHealing - (ally.stats.maxHp - ally.hp));
          }
          this.heal(ally, healing, true, hero);
          supportedAllies.push(ally);
          signatureEvents += removedAilments;
          this.applyPriestElementSupport(hero, ally, element, tier, damage);
          if (tier !== "core") this.refreshPathEffect(ally, "shield", tier === "ultimate" ? 7 : 4.5, damage * (tier === "ultimate" ? 0.55 : 0.3), hero);
          this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.2, color, { width: 2.5, life: 0.45 });
        }
        const nearest = enemies.sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        const center = aim ?? (nearest && unitDist(hero, nearest) < 220 ? { x: nearest.x, y: nearest.y } : { x: support.x, y: support.y });
        signatureCenter = center;
        const radius = [62, 100, 170][tierRank];
        const judged = enemies.filter((enemy) => Math.hypot(enemy.x - center.x, enemy.y - center.y) < radius + enemy.radius);
        const marks = tier === "core" ? judged.slice(0, 1) : judged;
        for (const enemy of marks) hit(enemy, tier === "ultimate" ? 0.78 : 0.62);
        this.fx.beam(center.x, center.y, 100 + tierRank * 45, 12 + tierRank * 5, color, 0.5 + tierRank * 0.15);
        this.fx.ring(center.x, center.y, radius, color, { width: 4 + tierRank, life: 0.55 });
        break;
      }
      case "mage": {
        if (!aim && !enemies.length) return false;
        payBloodPrice();
        const nearest = enemies.sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        const center = this.clampToField(aim ?? { x: nearest.x, y: nearest.y }, 0);
        signatureCenter = center;
        const radius = [74, 108, 158][tierRank];
        const caught = enemies.filter((enemy) => Math.hypot(enemy.x - center.x, enemy.y - center.y) < radius + enemy.radius);
        for (const enemy of caught) {
          const burning = this.effect(enemy, "burn");
          const chilled = this.effect(enemy, "slow");
          const exposed = this.effect(enemy, "vulnerable");
          let multiplier = tier === "ultimate" ? 1.08 : 1;
          if (element === "flame" && tier !== "core" && burning) {
            multiplier *= tier === "ultimate" ? 1.42 : 1.28;
            signatureEvents++;
          } else if (element === "venom" && exposed) {
            multiplier *= [1.12, 1.25, 1.4][tierRank];
            signatureEvents++;
          }
          if (element === "blood") {
            const missing = 1 - hero.hp / hero.stats.maxHp;
            multiplier *= 1 + missing * [0.22, 0.4, 0.62][tierRank];
          }
          hit(enemy, multiplier);
          if (!enemy.alive) continue;
          const boss = BOSS_KINDS.includes(enemy.enemyKind ?? "");
          if (element === "frost" && tier !== "core" && chilled) {
            signatureEvents++;
            if (boss) {
              if (enemy === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += tier === "ultimate" ? 14 : 7;
            } else {
              this.refreshPathEffect(enemy, "stun", tier === "ultimate" ? 0.72 : 0.42, 1, hero);
            }
          }
          this.refreshPathEffect(enemy, "slow", [1.2, 2.2, 3.4][tierRank] * (boss ? 0.6 : 1), [0.12, 0.2, 0.28][tierRank] * (boss ? 0.7 : 1), hero);
          if (tier === "ultimate" && !boss) this.refreshPathEffect(enemy, "stun", 0.32, 1, hero);
        }
        this.fx.pool(center.x, center.y, radius, ELEMENT_POOL_COLORS[element], 0.7 + tierRank * 0.2);
        this.fx.ring(center.x, center.y, radius, color, { width: 4 + tierRank, life: 0.55 + tierRank * 0.1 });
        this.fx.burst(center.x, center.y - 10, color, 14 + tierRank * 8, 120 + tierRank * 35, { glow: true, gravity: element === "earth" ? 220 : 30 });
        break;
      }
      case "necromancer": {
        if (!enemies.length) return false;
        const remains = hero.pathResource ?? 0;
        const nearest = [...enemies].sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        const center = this.clampToField(aim ?? { x: nearest.x, y: nearest.y }, 0);
        signatureCenter = center;
        const radius = [92, 132, 190][tierRank];
        const candidates = enemies
          .filter((enemy) => Math.hypot(enemy.x - center.x, enemy.y - center.y) < radius + enemy.radius)
          .sort((a, b) => PRIORITY_ENEMIES.has(a.enemyKind!) === PRIORITY_ENEMIES.has(b.enemyKind!) ? a.hp - b.hp : PRIORITY_ENEMIES.has(a.enemyKind!) ? -1 : 1);
        const targets = tier === "core" ? candidates.slice(0, 1) : candidates;
        if (!targets.length) return false;
        payBloodPrice();

        // Necromancy begins with a curse, not an elemental projectile. A
        // Gravebound foe rises for this caster no matter which hero kills it.
        for (const target of targets) {
          hit(target, tier === "core" ? 0.22 : tier === "focus" ? 0.34 : 0.48);
          if (!target.alive) continue;
          this.refreshPathEffect(target, "cursed", [12, 16, 22][tierRank], tierRank + 1, hero);
          if (element === "flame") this.refreshPathEffect(target, "burn", 4 + tierRank, Math.max(1.5, damage * 0.06), hero);
          else if (element === "frost") this.refreshPathEffect(target, "slow", 3 + tierRank, 0.22 + tierRank * 0.05, hero);
          else if (element === "venom") this.refreshPathEffect(target, "vulnerable", 4 + tierRank, 0.08 + tierRank * 0.04, hero);
          else if (element === "blood") this.refreshPathEffect(target, "bleeding", 4 + tierRank, Math.max(1.2, damage * 0.05), hero);
          else if (element === "shadow") {
            if (target.aggro === hero) target.aggro = null;
            if (target.attackTarget === hero) target.attackTarget = null;
          }
        }

        // Focus and ultimate rites always call part of the host. Fresh bodies
        // add servants for free; stored Remains buy additional shades.
        let servantCount = tier === "core" ? 0 : tier === "focus" ? 1 : 3;
        const corpseLimit = tier === "core" ? 1 : tier === "focus" ? 2 : 4;
        const corpses = this.units
          .filter((unit) => !unit.alive && unit.team === "enemy" && unit.deathTime < 12 && Math.hypot(unit.x - center.x, unit.y - center.y) < radius + 45)
          .slice(0, corpseLimit);
        for (const corpse of corpses) {
          this.raiseNecroServant(hero, element, corpse.x, corpse.y, tier === "ultimate");
          corpse.deathTime = 99;
          signatureEvents++;
        }
        const remainSpend = tier === "core" ? 0 : tier === "focus" ? Math.min(50, remains) : remains;
        servantCount += tier === "focus" ? Math.floor(remainSpend / 25) : tier === "ultimate" ? Math.floor(remainSpend / 20) : 0;
        for (let index = 0; index < servantCount; index++) {
          const angle = (index / Math.max(1, servantCount)) * Math.PI * 2;
          this.raiseNecroServant(hero, element, center.x + Math.cos(angle) * (30 + (index % 2) * 16), center.y + Math.sin(angle) * 24, tier === "ultimate");
        }
        if (remainSpend > 0) hero.pathResource = Math.max(0, remains - remainSpend);
        if (hero.advCalling?.endsWith("-ascendant") && (servantCount || corpses.length)) {
          const ally = [...this.livingHeroes()].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0] ?? hero;
          this.refreshPathEffect(ally, "shield", 5 + tierRank, damage * (0.3 + (servantCount + corpses.length) * 0.06), hero);
          this.refreshPathEffect(ally, "guard", 3.5 + tierRank, 0.12 + tierRank * 0.05, hero);
        }
        this.fx.pool(center.x, center.y, radius, ELEMENT_POOL_COLORS[element], 0.75 + tierRank * 0.2);
        this.fx.ring(center.x, center.y, radius, color, { width: 4 + tierRank, life: 0.6 });
        this.fx.floatText(center.x, center.y - 42, tier === "core" ? "GRAVEBOUND" : tier === "focus" ? "THE GRAVE OPENS" : "THE HOST MARCHES", color, tier === "ultimate" ? 14 : 11);
        this.fx.floatText(hero.x, hero.y - hero.radius * 3.8, `REMAINS ${Math.round(hero.pathResource ?? 0)}`, color, 10);
        break;
      }
    }

    this.applyPathSignature(hero, discipline, element, tier, damage, castOrigin, signatureCenter, hitTargets, supportedAllies, signatureEvents, overflowWard);

    // Level-20 specializations alter the loop, not merely the stat sheet. The
    // first branch masters control/teamcraft; the second converts the same Path
    // into a riskier offensive engine.
    const ascendant = hero.advCalling?.endsWith("-ascendant") === true;
    const paragon = hero.advCalling?.endsWith("-paragon") === true;
    if (ascendant) {
      if (discipline === "knight" && hitTargets.length) {
        for (const ally of this.livingHeroes().filter((ally) => ally !== hero && unitDist(hero, ally) < 125)) {
          this.refreshPathEffect(ally, "guard", 3.5 + tierRank, 0.12 + tierRank * 0.05, hero);
          if (tier === "ultimate") this.refreshPathEffect(ally, "shield", 7, damage * 0.28, hero);
        }
      } else if (discipline === "rogue") {
        this.refreshPathEffect(hero, "shrouded", 2.2 + tierRank, 1, hero);
        for (const enemy of enemies) if (enemy.aggro === hero || enemy.attackTarget === hero) { enemy.aggro = null; enemy.attackTarget = null; }
        if (tier === "ultimate") for (const ally of this.livingHeroes().filter((ally) => unitDist(hero, ally) < 110)) this.refreshPathEffect(ally, "guard", 3, 0.16, hero);
      } else if (discipline === "archer" && hitTargets.length) {
        const quarry = hitTargets[0];
        if (quarry.alive) this.refreshPathEffect(quarry, "vulnerable", 4 + tierRank, 0.1 + tierRank * 0.05, hero);
        if (quarry === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += 5 + tierRank * 6;
      } else if (discipline === "priest" && supportedAllies.length) {
        for (const ally of supportedAllies) {
          this.refreshPathEffect(ally, "shield", 6, damage * (0.22 + tierRank * 0.1), hero);
          if (ally.hp / ally.stats.maxHp <= 0.25) {
            this.heal(ally, damage * (0.28 + tierRank * 0.08), true, hero);
            this.fx.floatText(ally.x, ally.y - ally.radius * 2.8, "FATE HELD", color, 10);
          }
        }
      } else if (discipline === "mage" && hitTargets.length) {
        for (const target of hitTargets) if (target.alive) this.refreshPathEffect(target, "slow", 3 + tierRank, 0.28 + tierRank * 0.07, hero);
        if (tier === "focus") for (const ability of hero.abilities) if (ability.def.pathSkill === "core") ability.timer = Math.max(0, ability.timer - 1.5);
      }
      if (tier === "ultimate") this.fx.floatText(hero.x, hero.y - hero.radius * 4.2, PROMOTION_CUES[discipline][0], color, 12);
    } else if (paragon) {
      if (discipline === "knight") {
        for (const target of hitTargets) if (target.alive && this.effect(target, "taunt")) this.damage(target, damage * (0.18 + tierRank * 0.08), hero, { spell: true, color, element, secondary: true });
      } else if (discipline === "rogue" && (hitTargets.some((target) => !target.alive) || hitTargets.some((target) => PRIORITY_ENEMIES.has(target.enemyKind!)))) {
        const refund = hitTargets.some((target) => !target.alive) ? 3 : 1.5;
        for (const ability of hero.abilities) if (!ability.ult) ability.timer = Math.max(0, ability.timer - refund);
      } else if (discipline === "archer" && hitTargets.length) {
        this.refreshPathEffect(hero, "haste", 3 + tierRank, 1.18 + tierRank * 0.08, hero);
        const away = this.normalize({ x: hero.x - signatureCenter.x, y: hero.y - signatureCenter.y });
        const moved = this.clampToField({ x: hero.x + away.x * (24 + tierRank * 18), y: hero.y + away.y * (24 + tierRank * 18) }, hero.radius);
        hero.x = moved.x; hero.y = moved.y;
      } else if (discipline === "priest" && hitTargets.length) {
        const weakest = this.livingHeroes().sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
        if (weakest) this.heal(weakest, damage * hitTargets.length * (0.12 + tierRank * 0.05), true, hero);
        for (const target of hitTargets) if (target.alive && PRIORITY_ENEMIES.has(target.enemyKind!)) this.refreshPathEffect(target, "vulnerable", 4, 0.12 + tierRank * 0.04, hero);
      } else if (discipline === "mage" && hitTargets.length) {
        const price = Math.min(hero.hp - 1, hero.stats.maxHp * (0.025 + tierRank * 0.015));
        if (price > 0) hero.hp -= price;
        for (const target of hitTargets) if (target.alive) this.damage(target, damage * (0.16 + tierRank * 0.08), hero, { spell: true, color, element, secondary: true });
      }
      if (tier === "ultimate") this.fx.floatText(hero.x, hero.y - hero.radius * 4.2, PROMOTION_CUES[discipline][1], color, 12);
    }

    // Elemental techniques share an Attunement, but their intent stays
    // immediately readable: power hits harder, control buys room, utility
    // protects the caster. Discipline still determines delivery and targets.
    if (variant === "control") {
      for (const target of hitTargets) {
        if (!target.alive) continue;
        const bossScale = BOSS_KINDS.includes(target.enemyKind ?? "") ? 0.55 : 1;
        this.refreshPathEffect(target, "slow", 2.4 * bossScale, 0.22 * bossScale, hero);
      }
      this.fx.floatText(hero.x, hero.y - hero.radius * 2.6 - 36, "CONTROL", color, 10);
    } else if (variant === "utility") {
      this.refreshPathEffect(hero, "shield", 5, Math.max(8, damage * 0.42), hero);
      this.refreshPathEffect(hero, "haste", 2.5, this.heroTalentRank(hero, "stormDancer") > 0 ? 1.25 : 1.14, hero);
      this.fx.floatText(hero.x, hero.y - hero.radius * 2.6 - 36, "WARD", color, 10);
    } else if (variant === "power" && hitTargets.some((target) => target === this.bossRef)) {
      this.bossStagger += this.heroTalentRank(hero, "highArcanum") > 0 ? 15 : 5;
    }

    if (hitCount > 0) {
      this.hitstop = Math.max(this.hitstop, tier === "ultimate" ? 0.08 : 0.035);
      this.fx.addShake(tier === "ultimate" ? 7 : tier === "focus" ? 4 : 2);
    }
    // Attunements need a silhouette at a glance, not only a different tint.
    // One restrained signature gesture per element keeps crowded fights legible.
    const flourish = [42, 66, 104][tierRank];
    switch (element) {
      case "flame":
        this.fx.burst(signatureCenter.x, signatureCenter.y - 8, color, 7 + tierRank * 5, flourish, { glow: true, gravity: -35, life: 0.48 });
        this.addDecal(signatureCenter.x, signatureCenter.y, "scorch", 20 + tierRank * 9);
        break;
      case "frost":
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish, color, { width: 2 + tierRank, life: 0.58 });
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish * 0.55, "rgba(235,250,255,.82)", { width: 1.5, life: 0.38 });
        break;
      case "storm":
        for (const target of hitTargets.slice(0, 3 + tierRank)) this.fx.tracer(hero.x, hero.y - 18, target.x, target.y - 14, color, 0.2, 1.8 + tierRank);
        break;
      case "earth":
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish, color, { width: 6 + tierRank * 2, life: 0.42 });
        this.fx.burst(signatureCenter.x, signatureCenter.y, "#d8c291", 5 + tierRank * 4, flourish * 0.7, { gravity: 120, life: 0.5 });
        break;
      case "venom":
        this.fx.pool(signatureCenter.x, signatureCenter.y, flourish, ELEMENT_POOL_COLORS.venom, 0.65 + tierRank * 0.2);
        this.fx.burst(signatureCenter.x, signatureCenter.y - 5, color, 6 + tierRank * 3, flourish * 0.7, { glow: true, gravity: -18, life: 0.62 });
        break;
      case "radiant":
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish, "rgba(255,245,190,.92)", { width: 3 + tierRank, life: 0.62 });
        this.fx.burst(signatureCenter.x, signatureCenter.y - 18, color, 8 + tierRank * 4, flourish, { glow: true, gravity: -55, life: 0.62 });
        break;
      case "blood":
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish * 0.72, color, { width: 3 + tierRank * 2, life: 0.48 });
        this.addDecal(signatureCenter.x, signatureCenter.y, "stain", 15 + tierRank * 8);
        break;
      case "shadow":
        this.fx.pool(signatureCenter.x, signatureCenter.y, flourish, ELEMENT_POOL_COLORS.shadow, 0.7 + tierRank * 0.2);
        this.fx.ring(signatureCenter.x, signatureCenter.y, flourish * 0.62, color, { width: 2 + tierRank, life: 0.72 });
        break;
    }
    hero.castGlow = tier === "ultimate" ? 1.05 : tier === "focus" ? 0.72 : 0.48;
    audio.disciplineCast(discipline, tier);
    audio.elementCast(element, tier);
    return true;
  }

  /** A mastered specialization contributes one portable W-slot technique.
   * Its geometry comes from the mastered Discipline, while the hero's current
   * Attunement supplies the condition and visual language. */
  private castLegacyTechnique(hero: Unit, state: AbilityState, save: SaveData, aim: Vec | null, allyTarget: Unit | null): boolean {
    const spec = state.def.legacySpec;
    const element = hero.element;
    if (!spec || !element) return false;
    const split = spec.lastIndexOf("-");
    const discipline = spec.slice(0, split) as DisciplineId;
    const branch = spec.slice(split + 1) as "ascendant" | "paragon";
    const attrs = save.heroes[hero.heroIndex].attrs;
    const color = ELEMENT_COLORS[element];
    const power = 16 + Math.max(attrs.str, attrs.dex, attrs.int, attrs.spi, attrs.vit) * 2.1 + hero.stats.damage * 0.55;
    const enemies = this.livingEnemies();
    const hit = (target: Unit, multiplier = 1) => {
      const amount = power * multiplier;
      this.damage(target, amount, hero, { spell: true, color, element });
      if (target.alive) this.applyPathElement(hero, target, element, "focus", amount, true);
    };
    const center = this.clampToField(aim ?? { x: hero.x + hero.facing * 90, y: hero.y }, 0);

    if (discipline === "knight") {
      if (branch === "ascendant") {
        const ally = allyTarget ?? this.mostWoundedAlly() ?? hero;
        this.refreshPathEffect(ally, "shield", 7, power * 0.9, hero);
        this.refreshPathEffect(ally, "guard", 5, 0.22, hero);
        for (const enemy of enemies) if (unitDist(enemy, ally) < 105) this.refreshPathEffect(enemy, "taunt", 3, 1, hero);
        this.fx.ring(ally.x, ally.y, 105, color, { width: 5, life: 0.6 });
      } else {
        const dir = this.normalize({ x: center.x - hero.x, y: center.y - hero.y });
        const from = { x: hero.x, y: hero.y };
        const to = this.clampToField({ x: hero.x + dir.x * 150, y: hero.y + dir.y * 150 }, hero.radius);
        for (const enemy of enemies) if (this.distToRay(from, dir, 150, enemy) < enemy.radius + 28) hit(enemy, 0.9);
        hero.x = to.x; hero.y = to.y;
        this.refreshPathEffect(hero, "guard", 3, 0.18, hero);
        this.fx.tracer(from.x, from.y - 12, to.x, to.y - 12, color, 0.45, 5);
      }
    } else if (discipline === "warrior") {
      const radius = branch === "ascendant" ? 115 : 145;
      let struck = 0;
      for (const enemy of enemies) if (unitDist(hero, enemy) < radius + enemy.radius) {
        hit(enemy, branch === "ascendant" ? 1.15 : 0.92);
        if (enemy === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += branch === "ascendant" ? 24 : 10;
        struck++;
      }
      if (!struck) return false;
      if (branch === "ascendant") this.refreshPathEffect(hero, "guard", 3.5, 0.2, hero);
      else { this.refreshPathEffect(hero, "haste", 5, 1.35, hero); hero.hp = Math.max(1, hero.hp - hero.stats.maxHp * 0.05); }
      this.fx.slash(hero.x, hero.y - 12, 0, radius * 0.7, color, Math.PI * 2);
    } else if (discipline === "rogue") {
      const from = { x: hero.x, y: hero.y };
      if (branch === "ascendant") {
        const to = this.clampToField(center, hero.radius);
        hero.x = to.x; hero.y = to.y;
        this.refreshPathEffect(hero, "shrouded", 3, 1, hero);
        this.refreshPathEffect(hero, "guard", 2.5, 0.28, hero);
        for (const enemy of enemies) if (enemy.aggro === hero || enemy.attackTarget === hero) { enemy.aggro = null; enemy.attackTarget = null; }
        this.fx.tracer(from.x, from.y - 12, to.x, to.y - 12, color, 0.45, 4);
      } else {
        let struck = 0;
        for (const enemy of enemies) if (Math.hypot(enemy.x - center.x, enemy.y - center.y) < 100 + enemy.radius) {
          hit(enemy, 0.72); this.refreshPathEffect(enemy, "vulnerable", 5, 0.2, hero); struck++;
        }
        if (!struck) return false;
        this.fx.pool(center.x, center.y, 104, ELEMENT_POOL_COLORS[element], 0.9);
      }
    } else if (discipline === "archer") {
      if (branch === "ascendant") {
        const dir = this.normalize({ x: center.x - hero.x, y: center.y - hero.y });
        const target = enemies.filter((enemy) => this.distToRay(hero, dir, 520, enemy) < enemy.radius + 18).sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        if (!target) return false;
        const distance = unitDist(hero, target);
        hit(target, 1 + Math.min(0.8, distance / 600));
        if (target.alive) this.refreshPathEffect(target, "vulnerable", 6, 0.18, hero);
        this.fx.tracer(hero.x, hero.y - 14, target.x, target.y - 12, color, 0.55, 5);
      } else {
        const away = this.normalize({ x: hero.x - center.x, y: hero.y - center.y });
        const moved = this.clampToField({ x: hero.x + away.x * 70, y: hero.y + away.y * 70 }, hero.radius);
        hero.x = moved.x; hero.y = moved.y;
        let struck = 0;
        for (const enemy of enemies) if (Math.hypot(enemy.x - center.x, enemy.y - center.y) < 115 + enemy.radius) { hit(enemy, 0.78); struck++; }
        if (!struck) return false;
        this.refreshPathEffect(hero, "haste", 4, 1.25, hero);
        this.fx.ring(center.x, center.y, 115, color, { width: 4, life: 0.55 });
      }
    } else if (discipline === "priest") {
      if (branch === "ascendant") {
        const ally = allyTarget ?? this.mostWoundedAlly() ?? hero;
        this.heal(ally, power * 0.8, true, hero);
        this.refreshPathEffect(ally, "shield", 8, power * 0.9, hero);
        this.refreshPathEffect(ally, "guard", 5, 0.2, hero);
        this.fx.beam(ally.x, ally.y, 100, 13, color, 0.55);
      } else {
        let dealt = 0;
        for (const enemy of enemies) if (Math.hypot(enemy.x - center.x, enemy.y - center.y) < 105 + enemy.radius) { hit(enemy, 0.75); dealt += power * 0.75; }
        if (!dealt) return false;
        const ally = this.mostWoundedAlly() ?? hero;
        this.heal(ally, dealt * 0.35, true, hero);
        this.fx.beam(center.x, center.y, 120, 14, color, 0.55);
      }
    } else if (discipline === "mage") {
      let struck = 0;
      const radius = branch === "ascendant" ? 110 : 145;
      if (branch === "paragon") hero.hp = Math.max(1, hero.hp - hero.stats.maxHp * 0.07);
      for (const enemy of enemies) if (Math.hypot(enemy.x - center.x, enemy.y - center.y) < radius + enemy.radius) {
        hit(enemy, branch === "ascendant" ? 0.72 : 1.15);
        if (branch === "ascendant" && enemy.alive) this.refreshPathEffect(enemy, "slow", 4, 0.35, hero);
        struck++;
      }
      if (!struck) return false;
      this.fx.pool(center.x, center.y, radius, ELEMENT_POOL_COLORS[element], 1);
      this.fx.ring(center.x, center.y, radius, color, { width: 6, life: 0.65 });
    } else if (discipline === "necromancer") {
      if (branch === "ascendant") {
        const ally = allyTarget ?? this.mostWoundedAlly() ?? hero;
        this.refreshPathEffect(ally, "shield", 8, power, hero);
        const threat = enemies.sort((a, b) => unitDist(ally, a) - unitDist(ally, b))[0];
        if (threat) hit(threat, 0.7);
        this.fx.ring(ally.x, ally.y, 72, color, { width: 4, life: 0.6 });
      } else {
        const remains = hero.pathResource ?? 0;
        let struck = 0;
        for (const enemy of enemies) if (Math.hypot(enemy.x - center.x, enemy.y - center.y) < 120 + enemy.radius) { hit(enemy, 0.75 + remains / 160); struck++; }
        if (!struck) return false;
        hero.pathResource = Math.max(0, remains - 35);
        this.fx.pool(center.x, center.y, 124, ELEMENT_POOL_COLORS[element], 1);
      }
    } else return false;

    hero.castGlow = 0.65;
    this.fx.floatText(hero.x, hero.y - hero.radius * 3.8, "MASTERED LEGACY", color, 11);
    audio.disciplineCast(discipline, "focus");
    audio.elementCast(element, "focus");
    return true;
  }

  private finishAbilityCast(hero: Unit, state: AbilityState, save: SaveData): void {
    const id = state.def.id;
    this.castCounts[id] = (this.castCounts[id] ?? 0) + 1;
    this.fx.sigil(hero.x, hero.y - hero.radius * 2.6 - 14, state.def.icon, state.def.color);
    const ultimate = state.ult || state.def.pathSkill === "ultimate";
    if (ultimate) {
      hero.ultCharge = 0;
      state.timer = 1;
      navigator.vibrate?.([18, 26, 42]);
      const color = state.def.color || (hero.element ? ELEMENT_COLORS[hero.element] : callingById(hero.calling)?.color ?? "#ffe9a3");
      this.ultFlash = { color, time: 0.55 };
      this.slowmo = Math.max(this.slowmo, 0.35);
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.zoomPunch = Math.max(this.zoomPunch, 0.8);
    } else {
      const cdr = hero.heroIndex >= 0 ? cooldownReduction(save.heroes[hero.heroIndex]) : 0;
      state.timer = state.def.cooldown * (1 - cdr);
    }
    hero.castGlow = 0.4;
  }

  castAbility(hero: Unit, state: AbilityState, save: SaveData, aim: Vec | null, allyTarget: Unit | null): boolean {
    if (hero.team === "hero" && (this.state !== "fighting" || this.cinematic > 0)) return false;
    if (!hero.alive || state.timer > 0 || this.effect(hero, "stun") || this.effect(hero, "silence")) return false;
    if (state.def.legacySpec) {
      this.castingSpell = hero.team === "hero";
      const cast = this.castLegacyTechnique(hero, state, save, aim, allyTarget);
      this.castingSpell = false;
      if (cast) this.finishAbilityCast(hero, state, save);
      return cast;
    }
    if (state.def.pathSkill) {
      this.castingSpell = hero.team === "hero";
      const cast = this.castPathAbility(hero, state, save, aim, allyTarget);
      this.castingSpell = false;
      if (cast) this.finishAbilityCast(hero, state, save);
      return cast;
    }
    const id = state.def.id;
    const attrs = save.heroes[hero.heroIndex].attrs;
    const dir = aim ? this.normalize({ x: aim.x - hero.x, y: aim.y - hero.y }) : { x: hero.facing, y: 0 };
    let cast = true;
    this.castingSpell = hero.team === "hero";
    switch (id) {
      case "cleave": {
        const dmg = 12 + attrs.str * 3;
        let hitAny = false;
        for (const enemy of this.livingEnemies()) {
          const d = Math.hypot(enemy.x - hero.x, enemy.y - hero.y);
          if (d < 78 + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#ffd27d" });
            if (enemy.alive) enemy.effects.push(makeEffect("stun", 0.4, 1, hero));
            hitAny = true;
          }
        }
        hero.lunge = 1;
        hero.lungeDir = dir;
        this.fx.slash(hero.x, hero.y - 14, Math.atan2(dir.y, dir.x), 52, "#ffd27d", Math.PI * 1.4);
        this.fx.ring(hero.x, hero.y, 82, HEROES[hero.heroIndex]?.accent ?? "#ffd27d", { width: 3, life: 0.35 });
        this.fx.burst(hero.x + dir.x * 40, hero.y + dir.y * 40 - 10, "#ffd27d", 12, 140, { glow: true });
        this.fx.addShake(hitAny ? 5 : 2);
        audio.play("slash");
        break;
      }
      case "warcry": {
        for (const enemy of this.livingEnemies()) {
          const d = Math.hypot(enemy.x - hero.x, enemy.y - hero.y);
          if (d < 170) {
            enemy.effects = enemy.effects.filter((e) => e.kind !== "taunt");
            enemy.effects.push(makeEffect("taunt", 5, 1, hero));
            enemy.alert = 0.5;
          }
        }
        hero.effects.push(makeEffect("guard", 6, 0.4, hero));
        this.fx.burst(hero.x, hero.y - 20, "#e0904b", 18, 160, { glow: true });
        this.fx.ring(hero.x, hero.y, 170, "#e0904b", { width: 4, life: 0.55 });
        this.fx.addShake(4);
        audio.play("warcry");
        break;
      }
      case "pierce": {
        const dmg = 10 + attrs.dex * 2.6;
        const reach = 430;
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(hero, dir, reach, enemy) < enemy.radius + 14) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#b6f0a8" });
          }
        }
        this.fx.burst(hero.x + dir.x * 30, hero.y + dir.y * 30 - 8, "#b6f0a8", 8, 120, { glow: true });
        for (let t = 30; t < reach; t += 34) {
          this.fx.burst(hero.x + dir.x * t, hero.y + dir.y * t - 8, "#d8ffcf", 1, 30, { glow: true, life: 0.3 });
        }
        hero.lungeDir = dir;
        hero.lunge = 0.7;
        audio.play("shoot");
        break;
      }
      case "flurry": {
        hero.effects.push(makeEffect("haste", 5, 2.4, hero));
        this.fx.burst(hero.x, hero.y - 16, "#8ed081", 12, 110, { glow: true });
        audio.play("shield");
        break;
      }
      case "fireball": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        const dmg = 16 + attrs.int * 3;
        for (const enemy of this.livingEnemies()) {
          const d = Math.hypot(enemy.x - at.x, enemy.y - at.y);
          if (d < 85 + enemy.radius) {
            this.damage(enemy, dmg * hero.stats.spellPower * 0.55 + dmg * 0.45, hero, { spell: true, color: "#ffb46b" });
            if (enemy.alive) enemy.effects.push(makeEffect("burn", 3, 2 + attrs.int * 0.5, hero));
          }
        }
        this.fx.burst(at.x, at.y - 8, "#ff9b42", 26, 190, { glow: true, gravity: 60 });
        this.fx.burst(at.x, at.y - 8, "#ffe08a", 14, 120, { glow: true });
        this.fx.burst(at.x, at.y, "rgba(90,70,60,0.8)", 10, 90, { gravity: -40, size: 5, life: 0.6 });
        this.fx.ring(at.x, at.y, 100, "#ffb46b", { width: 5, life: 0.5 });
        this.fx.pool(at.x, at.y, 110, "255,150,60", 0.9);
        this.addDecal(at.x, at.y, "scorch", 46);
        this.fx.ring(at.x, at.y, 60, "#fff0c0", { width: 3, life: 0.3 });
        this.fx.addShake(8);
        this.hitstop = Math.max(this.hitstop, 0.07);
        this.zoomPunch = Math.max(this.zoomPunch, 0.7);
        audio.play("fireball");
        break;
      }
      case "frostwake": {
        const reach = 360;
        for (let t = 40; t < reach; t += 55) {
          const zx = hero.x + dir.x * t;
          const zy = hero.y + dir.y * t;
          this.zones.push({
            x: zx,
            y: zy,
            radius: 46,
            time: 0,
            duration: 4.5,
            kind: "frost",
            power: 0.45,
            dps: 2 + attrs.int * 0.8,
            from: hero,
          });
          this.fx.burst(zx, zy - 6, "#bfe6ff", 6, 60, { glow: true, gravity: 20 });
        }
        audio.play("frost");
        break;
      }
      case "mend": {
        const target = allyTarget ?? this.mostWoundedAlly();
        if (!target) {
          cast = false;
          break;
        }
        this.heal(target, 30 + attrs.spi * 4, true, hero);
        this.fx.burst(target.x, target.y - 18, "#f2e7a0", 16, 110, { glow: true, gravity: -40 });
        this.fx.pool(target.x, target.y, 70, "255,235,160", 0.7);
        audio.play("heal");
        break;
      }
      case "radiance": {
        for (const ally of this.livingHeroes()) {
          const d = Math.hypot(ally.x - hero.x, ally.y - hero.y);
          if (d < 190) {
            this.heal(ally, 20 + attrs.spi * 2.6, true, hero);
            this.fx.burst(ally.x, ally.y - 18, "#fff3c0", 10, 90, { glow: true, gravity: -50 });
            this.fx.ring(ally.x, ally.y, ally.radius * 2.4, "#fff3c0", { width: 2.5, life: 0.45 });
          }
        }
        this.fx.ring(hero.x, hero.y, 190, "#f7e8a4", { width: 4, life: 0.6 });
        this.fx.pool(hero.x, hero.y, 160, "255,235,160", 0.8);
        this.fx.addShake(3);
        audio.play("heal");
        break;
      }
      case "bulwark": {
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 8, 30 + attrs.vit * 5, hero));
        this.fx.burst(hero.x, hero.y - 16, "#c6d3e8", 14, 100, { glow: true });
        this.fx.ring(hero.x, hero.y - 14, hero.radius * 2.6, "#c6d3e8", { width: 3.5, life: 0.5, squash: 1 });
        audio.play("shield");
        break;
      }
      case "overpower": {
        const victim = this.nearestEnemyWithin(hero, 75);
        if (!victim) {
          cast = false;
          break;
        }
        const dmg = 16 + attrs.str * 3.4;
        hero.lungeDir = this.normalize({ x: victim.x - hero.x, y: victim.y - hero.y });
        hero.lunge = 1;
        this.damage(victim, dmg, hero, { spell: true, color: "#ffb46b" });
        this.fx.slash(victim.x, victim.y - 14, Math.atan2(hero.lungeDir.y, hero.lungeDir.x), 40, "#ffb46b", Math.PI * 0.8);
        this.fx.addShake(6);
        this.hitstop = Math.max(this.hitstop, 0.06);
        audio.play("spOverpower");
        break;
      }
      case "caltrops": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        this.zones.push({ x: at.x, y: at.y, radius: 70, time: 0, duration: 6, kind: "frost", power: 0.3, dps: 1 + attrs.dex * 0.5, from: hero });
        this.fx.burst(at.x, at.y - 4, "#9db36b", 10, 90, { gravity: 200, size: 2.6 });
        this.fx.ring(at.x, at.y, 74, "#9db36b", { width: 3, life: 0.4 });
        audio.play("spCaltrops");
        break;
      }
      case "chainspark": {
        const struck = this.livingEnemies()
          .map((e) => ({ e, d: Math.hypot(e.x - hero.x, e.y - hero.y) }))
          .filter((t) => t.d < 240)
          .sort((a, b) => a.d - b.d)
          .slice(0, 3);
        if (!struck.length) {
          cast = false;
          break;
        }
        const dmg = (6 + attrs.int * 1.8) * (0.6 + hero.stats.spellPower * 0.4);
        let prev: Unit = hero;
        for (const { e } of struck) {
          this.damage(e, dmg, hero, { spell: true, color: "#8fc7e8" });
          // the arc itself, link to link, with sparks along it
          this.fx.tracer(prev.x, prev.y - 16, e.x, e.y - 14, "#8fc7e8", 0.3, 2.5);
          const steps2 = 4;
          for (let s = 1; s < steps2; s++) {
            const t = s / steps2;
            const jx = prev.x + (e.x - prev.x) * t + (Math.random() - 0.5) * 10;
            const jy = prev.y - 16 + (e.y - prev.y) * t + (Math.random() - 0.5) * 10;
            this.fx.burst(jx, jy, "#c6e6ff", 1, 24, { glow: true, life: 0.2 });
          }
          prev = e;
        }
        audio.play("spChainspark");
        break;
      }
      case "sunlance": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        const dmg = 10 + attrs.spi * 2.6;
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - at.x, enemy.y - at.y) < 62 + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#ffd76b" });
          }
        }
        for (const ally of this.livingHeroes()) {
          if (Math.hypot(ally.x - at.x, ally.y - at.y) < 62 + ally.radius) {
            this.heal(ally, 8 + attrs.spi * 1.6, true, hero);
          }
        }
        // the pillar itself: a true column of light
        this.fx.beam(at.x, at.y, 170, 16, "rgba(255, 220, 130, 0.95)", 0.65);
        this.fx.burst(at.x, at.y - 12, "#ffe9a3", 10, 90, { glow: true, gravity: -90 });
        this.fx.ring(at.x, at.y, 66, "#ffd76b", { width: 4, life: 0.5 });
        this.fx.pool(at.x, at.y, 80, "255,215,107", 0.8);
        audio.play("spSunlance");
        break;
      }
      case "shieldslam": {
        const victim = this.nearestEnemyWithin(hero, 65);
        if (!victim) {
          cast = false;
          break;
        }
        const dmg = 8 + attrs.vit * 2.2;
        hero.lungeDir = this.normalize({ x: victim.x - hero.x, y: victim.y - hero.y });
        hero.lunge = 1;
        this.damage(victim, dmg, hero, { spell: true, color: "#c9b38a" });
        if (victim.alive) {
          victim.effects.push(makeEffect("stun", 0.6, 1, hero));
          const shoved = this.clampToField(
            { x: victim.x + hero.lungeDir.x * 32, y: victim.y + hero.lungeDir.y * 32 },
            victim.radius,
          );
          victim.x = shoved.x;
          victim.y = shoved.y;
        }
        this.fx.burst(victim.x, victim.y - 10, "#c9b38a", 8, 100, { glow: true });
        this.fx.addShake(5);
        audio.play("spShieldslam");
        break;
      }
      case "stoneskin": {
        const target = allyTarget ?? this.mostWoundedAlly() ?? hero;
        target.effects = target.effects.filter((e) => e.kind !== "guard");
        target.effects.push(makeEffect("guard", 6, 0.3, hero));
        target.effects.push(makeEffect("shield", 6, 10 + attrs.vit * 2, hero));
        this.fx.ring(target.x, target.y - 14, target.radius * 2.4, "#a8a29a", { width: 4, life: 0.5, squash: 1 });
        this.fx.burst(target.x, target.y - 14, "#c9c2b8", 10, 80, { gravity: 120 });
        audio.play("spStoneskin");
        break;
      }
      case "sunder": {
        const victim = this.nearestEnemyWithin(hero, 75);
        if (!victim) {
          cast = false;
          break;
        }
        this.damage(victim, 8 + attrs.str * 1.6, hero, { spell: true, color: "#c25a3a" });
        if (victim.alive) {
          victim.effects = victim.effects.filter((e) => e.kind !== "vulnerable");
          victim.effects.push(makeEffect("vulnerable", 5, 0.25, hero));
          this.fx.floatText(victim.x, victim.y - victim.radius * 3, "sundered!", "#ffb46b", 12);
        }
        hero.lungeDir = this.normalize({ x: victim.x - hero.x, y: victim.y - hero.y });
        hero.lunge = 1;
        this.fx.burst(victim.x, victim.y - 12, "#c25a3a", 8, 100, { glow: true });
        audio.play("spSunder");
        break;
      }
      case "groundbreaker": {
        let hitAny = false;
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 95 + enemy.radius) {
            this.damage(enemy, 8 + attrs.str * 1.8, hero, { spell: true, color: "#c9a06b" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 1.6, 0.4, hero));
            hitAny = true;
          }
        }
        this.fx.ring(hero.x, hero.y, 100, "#a8683f", { width: 6, life: 0.5 });
        this.fx.burst(hero.x, hero.y, "rgba(150,120,90,0.8)", 18, 150, { gravity: 220, size: 4 });
        this.fx.addShake(hitAny ? 9 : 5);
        this.hitstop = Math.max(this.hitstop, 0.06);
        audio.play("spGroundbreaker");
        break;
      }
      case "rush": {
        const marks = this.livingEnemies()
          .map((e) => ({ e, d: Math.hypot(e.x - hero.x, e.y - hero.y) }))
          .filter((t) => t.d < 280);
        if (!marks.length) {
          cast = false;
          break;
        }
        const prey = marks.reduce((a, b) => (a.e.hp / a.e.stats.maxHp <= b.e.hp / b.e.stats.maxHp ? a : b)).e;
        const from = { x: hero.x, y: hero.y };
        const arrive = this.clampToField({ x: prey.x - Math.sign(prey.x - hero.x) * 26, y: prey.y }, hero.radius);
        hero.x = arrive.x;
        hero.y = arrive.y;
        hero.moveTarget = null;
        hero.facing = prey.x >= hero.x ? 1 : -1;
        hero.lungeDir = this.normalize({ x: prey.x - hero.x, y: prey.y - hero.y });
        hero.lunge = 1;
        this.damage(prey, 12 + attrs.str * 3, hero, { spell: true, color: "#e0494b" });
        this.fx.tracer(from.x, from.y - 12, hero.x, hero.y - 12, "#e0494b", 0.35, 4);
        for (let t2 = 0.15; t2 < 1; t2 += 0.2) {
          this.fx.burst(from.x + (hero.x - from.x) * t2, from.y + (hero.y - from.y) * t2 - 10, "#e0494b", 2, 40, { glow: true, life: 0.25 });
        }
        this.fx.addShake(6);
        audio.play("spRush");
        break;
      }
      case "twinshot": {
        const reach = 400;
        for (const spreadA of [-0.11, 0.11]) {
          const ca = Math.cos(spreadA);
          const sa = Math.sin(spreadA);
          const d2 = { x: dir.x * ca - dir.y * sa, y: dir.x * sa + dir.y * ca };
          for (const enemy of this.livingEnemies()) {
            if (this.distToRay(hero, d2, reach, enemy) < enemy.radius + 12) {
              this.damage(enemy, 8 + attrs.dex * 2, hero, { spell: true, color: "#b6f0a8" });
            }
          }
          for (let t2 = 30; t2 < reach; t2 += 46) {
            this.fx.burst(hero.x + d2.x * t2, hero.y + d2.y * t2 - 8, "#d8ffcf", 1, 26, { glow: true, life: 0.25 });
          }
        }
        hero.lungeDir = dir;
        hero.lunge = 0.7;
        audio.play("spTwinshot");
        break;
      }
      case "smokebomb": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        this.zones.push({ x: at.x, y: at.y, radius: 82, time: 0, duration: 5, kind: "smoke", power: 0.33, dps: 0, from: hero });
        this.fx.burst(at.x, at.y - 8, "rgba(150,158,175,0.8)", 20, 90, { gravity: -30, size: 5, life: 0.8 });
        audio.play("spSmokebomb");
        break;
      }
      case "deadeye": {
        // the first foe along the line eats the whole shot
        const reach = 460;
        let best: Unit | null = null;
        let bestT = Infinity;
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(hero, dir, reach, enemy) < enemy.radius + 12) {
            const t2 = (enemy.x - hero.x) * dir.x + (enemy.y - hero.y) * dir.y;
            if (t2 >= 0 && t2 < bestT) {
              bestT = t2;
              best = enemy;
            }
          }
        }
        if (!best) {
          cast = false;
          break;
        }
        this.damage(best, 20 + attrs.dex * 4, hero, { spell: true, color: "#c9e86b" });
        if (best.alive) best.effects.push(makeEffect("vulnerable", 4, 0.2, hero));
        // the shot hangs in the air as a tracer
        this.fx.tracer(hero.x + dir.x * 14, hero.y - 12, best.x, best.y - 12, "#c9e86b", 0.45, 3);
        this.fx.burst(hero.x + dir.x * 16, hero.y - 12, "#f2ffd0", 6, 70, { glow: true, life: 0.25 });
        this.fx.burst(best.x, best.y - 12, "#c9e86b", 10, 110, { glow: true });
        this.fx.addShake(5);
        this.hitstop = Math.max(this.hitstop, 0.06);
        hero.lungeDir = dir;
        hero.lunge = 0.8;
        audio.play("spDeadeye");
        break;
      }
      case "missiles": {
        const prey = this.nearestEnemyWithin(hero, 280);
        if (!prey) {
          cast = false;
          break;
        }
        const dmg = (4 + attrs.int * 1.2) * (0.6 + hero.stats.spellPower * 0.4);
        for (let i = 0; i < 3; i++) {
          this.projectiles.push({
            x: hero.x,
            y: hero.y - 16 - i * 5,
            target: prey,
            aim: { x: hero.facing, y: 0 },
            speed: 300 + i * 40,
            damage: dmg,
            from: hero,
            kind: "bolt",
            color: "#b48ae8",
            heals: false,
            life: 3,
          });
        }
        hero.castGlow = 0.4;
        audio.play("spMissiles");
        break;
      }
      case "gravity": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        this.zones.push({ x: at.x, y: at.y, radius: 95, time: 0, duration: 3.5, kind: "gravity", power: 65, dps: 1 + attrs.int * 0.5, from: hero });
        this.fx.ring(at.x, at.y, 95, "#7a6ae8", { width: 4, life: 0.6 });
        this.fx.burst(at.x, at.y - 8, "#9a8af2", 14, 110, { glow: true, gravity: -40 });
        audio.play("spGravity");
        break;
      }
      case "meteor": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        this.telegraphs.push({ x: at.x, y: at.y, radius: 92, time: 0, duration: 1.2, owner: hero, kind: "meteor" });
        hero.castGlow = 0.5;
        audio.play("spMeteor");
        break;
      }
      case "blessing": {
        const target = allyTarget ?? this.mostWoundedAlly() ?? hero;
        this.heal(target, 12 + attrs.spi * 1.8, true, hero);
        target.effects = target.effects.filter((e) => e.kind !== "slow" && e.kind !== "burn");
        target.effects.push(makeEffect("haste", 5, 1.3, hero));
        this.fx.burst(target.x, target.y - 18, "#e8d98a", 14, 100, { glow: true, gravity: -50 });
        audio.play("spBlessing");
        break;
      }
      case "ward": {
        const target = allyTarget ?? this.mostWoundedAlly() ?? hero;
        target.effects = target.effects.filter((e) => e.kind !== "shield");
        target.effects.push(makeEffect("shield", 8, 15 + attrs.spi * 2.5, hero));
        this.fx.ring(target.x, target.y - 14, target.radius * 2.6, "#f2e0b0", { width: 4, life: 0.6, squash: 1 });
        this.fx.burst(target.x, target.y - 16, "#fff0c8", 10, 80, { glow: true });
        audio.play("spWard");
        break;
      }
      case "judgement": {
        const guilty = this.livingEnemies().filter((e) => e.hp < e.stats.maxHp * 0.5);
        if (!guilty.length) {
          cast = false;
          break;
        }
        for (const enemy of guilty) {
          this.damage(enemy, 12 + attrs.spi * 2.2, hero, { spell: true, color: "#fff0b4" });
          this.fx.beam(enemy.x, enemy.y, 140, 11, "rgba(255, 240, 180, 0.9)", 0.55);
          this.fx.burst(enemy.x, enemy.y - 30, "#fff0b4", 8, 70, { glow: true, gravity: 160 });
          this.fx.pool(enemy.x, enemy.y, 46, "255,240,180", 0.5);
        }
        this.fx.addShake(5);
        audio.play("spJudgement");
        break;
      }
      case "secondwind": {
        this.heal(hero, 12 + attrs.vit * 2.5, true, hero);
        hero.effects = hero.effects.filter((e) => e.kind !== "burn");
        this.fx.burst(hero.x, hero.y - 16, "#b8c9a0", 12, 90, { glow: true, gravity: -60 });
        audio.play("spSecondwind");
        break;
      }
      case "ramwall": {
        const dist = 130;
        const from = { x: hero.x, y: hero.y };
        const to = this.clampToField({ x: hero.x + dir.x * dist, y: hero.y + dir.y * dist }, hero.radius);
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(from, dir, dist, enemy) < enemy.radius + 26) {
            this.damage(enemy, 6 + attrs.vit * 1.6, hero, { spell: true, color: "#c9a06b" });
            if (enemy.alive) {
              const side = this.normalize({ x: -dir.y, y: dir.x });
              const flip = (enemy.x - from.x) * side.x + (enemy.y - from.y) * side.y >= 0 ? 1 : -1;
              const shoved = this.clampToField({ x: enemy.x + side.x * flip * 40, y: enemy.y + side.y * flip * 40 }, enemy.radius);
              enemy.x = shoved.x;
              enemy.y = shoved.y;
              enemy.effects.push(makeEffect("stun", 0.4, 1, hero));
            }
          }
        }
        hero.x = to.x;
        hero.y = to.y;
        hero.moveTarget = null;
        hero.lungeDir = dir;
        hero.lunge = 1;
        this.fx.burst(from.x, from.y, "rgba(185,170,145,0.7)", 10, 80, { gravity: -20, size: 3.5 });
        this.fx.addShake(7);
        audio.play("spRamwall");
        break;
      }
      case "bastion": {
        for (const ally of this.livingHeroes()) {
          ally.effects = ally.effects.filter((e) => e.kind !== "shield");
          ally.effects.push(makeEffect("shield", 7, 12 + attrs.vit * 2, hero));
          this.fx.burst(ally.x, ally.y - 16, "#d8ccb0", 8, 80, { glow: true });
        }
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 160) {
            enemy.effects = enemy.effects.filter((e) => e.kind !== "taunt");
            enemy.effects.push(makeEffect("taunt", 3, 1, hero));
            enemy.alert = 0.5;
          }
        }
        this.fx.ring(hero.x, hero.y, 160, "#d8ccb0", { width: 5, life: 0.6 });
        this.fx.addShake(5);
        audio.play("spBastion");
        break;
      }
      // ----- calling signatures -----
      case "cataclysm": {
        if (!aim) { cast = false; break; }
        const at = this.clampToField(aim, 0);
        const dmg = (16 + attrs.int * 3.0) * (0.5 + hero.stats.spellPower * 0.5);
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - at.x, enemy.y - at.y) < 115 + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#ff7a45" });
            if (enemy.alive) {
              enemy.effects = enemy.effects.filter((e) => e.kind !== "burn");
              enemy.effects.push(makeEffect("burn", 4, 3 + attrs.int * 0.5, hero));
            }
          }
        }
        for (let i = 0; i < 22; i++) {
          this.fx.burst(at.x + (Math.random() - 0.5) * 190, at.y + (Math.random() - 0.5) * 80, "#ff9a5a", 3, 120, { glow: true, gravity: 200, life: 0.5 });
        }
        this.fx.ring(at.x, at.y, 115, "#ff7a45", { width: 6, life: 0.6 });
        this.fx.pool(at.x, at.y, 118, "255,122,69", 0.9);
        this.fx.addShake(7);
        audio.play("ultBarrage");
        break;
      }
      case "deepfreeze": {
        let caught = 0;
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 135) {
            this.damage(enemy, (10 + attrs.int * 2.0) * (0.5 + hero.stats.spellPower * 0.5), hero, { spell: true, color: "#7cc7e8" });
            if (enemy.alive) {
              enemy.effects.push(makeEffect("stun", 1.8, 1, hero));
              enemy.effects.push(makeEffect("slow", 3.5, 0.4, hero));
            }
            caught++;
          }
        }
        if (!caught) { cast = false; break; }
        this.fx.ring(hero.x, hero.y, 135, "#7cc7e8", { width: 5, life: 0.6 });
        this.fx.ring(hero.x, hero.y, 80, "#d8f0f8", { width: 3, life: 0.45 });
        this.fx.burst(hero.x, hero.y - 20, "#d8f0f8", 20, 150, { glow: true });
        audio.play("ultSanctuary");
        break;
      }
      case "stormburst": {
        const chain = this.livingEnemies()
          .map((e) => ({ e, d: unitDist(hero, e) }))
          .filter((t) => t.d < 320)
          .sort((a, b) => a.d - b.d)
          .slice(0, 6);
        if (!chain.length) { cast = false; break; }
        const dmg = (12 + attrs.int * 2.4) * (0.5 + hero.stats.spellPower * 0.5);
        let prev: Unit = hero;
        for (const { e } of chain) {
          this.damage(e, dmg, hero, { spell: true, color: "#8fb8ff" });
          if (e.alive) e.effects.push(makeEffect("stun", 0.6, 1, hero));
          for (let s = 1; s < 6; s++) {
            const t = s / 6;
            this.fx.burst(prev.x + (e.x - prev.x) * t, prev.y - 16 + (e.y - prev.y) * t, "#c8dcff", 1, 24, { glow: true, life: 0.22 });
          }
          this.fx.burst(e.x, e.y - 14, "#8fb8ff", 8, 110, { glow: true });
          prev = e;
        }
        this.fx.addShake(5);
        audio.play("ultBarrage");
        break;
      }
      case "stoneward": {
        for (const ally of this.livingHeroes()) {
          ally.effects = ally.effects.filter((e) => e.kind !== "shield");
          ally.effects.push(makeEffect("shield", 8, Math.round(ally.stats.maxHp * 0.18), hero));
          this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.4, "#c0a878", { width: 3, life: 0.5 });
        }
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 130) enemy.effects.push(makeEffect("slow", 2.5, 0.4, hero));
        }
        this.fx.ring(hero.x, hero.y, 130, "#c0a878", { width: 6, life: 0.7 });
        this.fx.addShake(5);
        audio.play("ultChallenge");
        break;
      }
      case "banishment": {
        let hit = 0;
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 135) {
            const beast = ["wolf", "alpha", "frostwolf", "shambler"].includes(enemy.enemyKind ?? "");
            this.damage(enemy, (14 + attrs.spi * 2.2 + attrs.int * 1.2) * (beast ? 1.5 : 1), hero, { spell: true, color: "#f2d16b" });
            if (enemy.alive) enemy.effects.push(makeEffect("stun", 0.8, 1, hero));
            hit++;
          }
        }
        if (!hit) { cast = false; break; }
        this.fx.ring(hero.x, hero.y, 135, "#f2d16b", { width: 5, life: 0.6 });
        this.fx.burst(hero.x, hero.y - 24, "#fff2c8", 24, 170, { glow: true, gravity: -50 });
        audio.play("ultSanctuary");
        break;
      }
      case "crimsonpact": {
        let drunk = 0;
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 115) {
            const bite = hero.stats.damage * 1.2;
            this.damage(enemy, bite, hero, { spell: true, color: "#c04858" });
            drunk += bite * 0.6;
          }
        }
        if (!drunk) { cast = false; break; }
        this.heal(hero, drunk, true, null);
        this.fx.ring(hero.x, hero.y, 115, "#c04858", { width: 5, life: 0.6 });
        this.fx.burst(hero.x, hero.y - 18, "#e86878", 16, 130, { glow: true });
        audio.play("ultWhirlwind");
        break;
      }
      case "fateweave": {
        for (const ally of this.livingHeroes()) {
          this.armorDodgeReady.add(ally.id);
          ally.effects.push(makeEffect("haste", 6, 1.15, hero));
          this.fx.burst(ally.x, ally.y - 16, "#b8a8e8", 10, 100, { glow: true });
        }
        this.fx.ring(hero.x, hero.y, 150, "#b8a8e8", { width: 4, life: 0.7 });
        audio.play("ultBlink");
        break;
      }
      case "impale": {
        const reach = 260;
        const from = { x: hero.x, y: hero.y };
        const to = this.clampToField({ x: hero.x + dir.x * reach, y: hero.y + dir.y * reach }, hero.radius);
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(hero, dir, reach, enemy) < 36 + enemy.radius) {
            this.damage(enemy, hero.stats.damage * 2, hero, { color: "#ffd76b" });
            if (enemy.alive) enemy.effects.push(makeEffect("stun", 0.6, 1, hero));
            this.fx.burst(enemy.x, enemy.y - 12, "#ffd76b", 8, 110, { glow: true });
          }
        }
        for (let s = 1; s < 9; s++) {
          const t = s / 9;
          this.fx.burst(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, "#d8a048", 2, 40, { glow: true, life: 0.3 });
        }
        hero.x = to.x;
        hero.y = to.y;
        hero.moveTarget = null;
        hero.lungeDir = dir;
        hero.lunge = 0.9;
        this.fx.addShake(6);
        audio.play("ultWhirlwind");
        break;
      }
      case "hundredfists": {
        const prey = this.livingEnemies().sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        if (!prey || unitDist(hero, prey) > 130) { cast = false; break; }
        for (let i = 0; i < 5; i++) {
          this.damage(prey, hero.stats.damage * 0.6, hero, { color: i === 4 ? "#ffd76b" : undefined });
          this.fx.burst(prey.x + (Math.random() - 0.5) * 20, prey.y - 14 + (Math.random() - 0.5) * 16, "#e8b878", 4, 90, { glow: true, life: 0.25 });
        }
        if (prey.alive) prey.effects.push(makeEffect("stun", 0.8, 1, hero));
        this.hitstop = Math.max(this.hitstop, 0.1);
        hero.lunge = 1;
        audio.play("ultWhirlwind");
        break;
      }
      case "gravecall": {
        const corpses = this.units.filter((u) => !u.alive && u.team === "enemy" && u.deathTime < 15);
        if (!corpses.length) { cast = false; break; }
        const dmg = (12 + attrs.int * 2.2) * (0.5 + hero.stats.spellPower * 0.5);
        for (const corpse of corpses) {
          for (const enemy of this.livingEnemies()) {
            if (Math.hypot(enemy.x - corpse.x, enemy.y - corpse.y) < 95) {
              this.damage(enemy, dmg, hero, { spell: true, color: "#9a88b8" });
            }
          }
          corpse.deathTime = 99;
          this.fx.burst(corpse.x, corpse.y - 10, "#9a88b8", 14, 120, { glow: true });
          this.fx.ring(corpse.x, corpse.y, 60, "#c8b8e8", { width: 3, life: 0.5 });
        }
        this.fx.addShake(5);
        audio.play("ultBarrage");
        break;
      }
      case "battlehymn": {
        for (const ally of this.livingHeroes()) {
          ally.effects.push(makeEffect("haste", 6, 1.25, hero));
          this.heal(ally, 15 + attrs.spi * 2, true, hero);
          this.fx.burst(ally.x, ally.y - 16, "#e8c8a0", 10, 100, { glow: true, gravity: -40 });
        }
        this.fx.ring(hero.x, hero.y, 160, "#e8c8a0", { width: 4, life: 0.8 });
        audio.play("ultSanctuary");
        break;
      }
      case "elixirbomb": {
        if (!aim) { cast = false; break; }
        const at = this.clampToField(aim, 0);
        const dmg = (12 + attrs.int * 2.4) * (0.5 + hero.stats.spellPower * 0.5);
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - at.x, enemy.y - at.y) < 110 + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#9ad06a" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 2, 0.3, hero));
          }
        }
        for (const ally of this.livingHeroes()) {
          if (Math.hypot(ally.x - at.x, ally.y - at.y) < 110) this.heal(ally, 25 + attrs.spi * 2, true, hero);
        }
        this.fx.ring(at.x, at.y, 110, "#9ad06a", { width: 5, life: 0.6 });
        this.fx.pool(at.x, at.y, 112, "154,208,106", 0.9);
        this.fx.burst(at.x, at.y - 10, "#c8e8a0", 18, 130, { glow: true });
        audio.play("ultVolley");
        break;
      }
      case "snarefield": {
        if (!aim) { cast = false; break; }
        const at = this.clampToField(aim, 0);
        this.zones.push({
          x: at.x,
          y: at.y,
          radius: 130,
          time: 0,
          duration: 8,
          kind: "frost",
          power: 0.5,
          dps: 2 + attrs.dex * 0.6,
          from: hero,
        });
        this.fx.ring(at.x, at.y, 130, "#a8925a", { width: 5, life: 0.6 });
        this.fx.pool(at.x, at.y, 132, "168,146,90", 1.0);
        audio.play("ultVolley");
        break;
      }
      case "greatshout": {
        let reached = 0;
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 145) {
            this.damage(enemy, hero.stats.damage * 0.8, hero, { spell: true, color: "#e09858" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 2.5, 0.35, hero));
            reached++;
          }
        }
        if (this.bossRef && this.bossRef.alive && unitDist(hero, this.bossRef) < 145 && this.bossStaggerMax > 0) {
          this.bossStagger += 80;
        }
        for (const ally of this.livingHeroes()) {
          ally.effects.push(makeEffect("haste", 3, 1.12, hero));
        }
        if (!reached) { cast = false; break; }
        this.fx.ring(hero.x, hero.y, 145, "#e09858", { width: 6, life: 0.6 });
        this.fx.addShake(7);
        this.zoomPunch = Math.max(this.zoomPunch, 0.5);
        audio.play("ultChallenge");
        break;
      }
      case "challenge": {
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < 175) {
            enemy.effects = enemy.effects.filter((e) => e.kind !== "taunt");
            enemy.effects.push(makeEffect("taunt", 6, 1, hero));
            enemy.alert = 0.5;
          }
        }
        hero.effects.push(makeEffect("guard", 5, 0.35, hero));
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 6, 20 + attrs.vit * 3, hero));
        // Bulwark Saint: the challenge shelters the whole band
        if (hero.advCalling === "bulwarkSaint") {
          for (const ally of this.livingHeroes()) {
            if (ally === hero) continue;
            ally.effects = ally.effects.filter((e) => e.kind !== "shield");
            ally.effects.push(makeEffect("shield", 6, Math.round(ally.stats.maxHp * 0.15), hero));
            this.fx.burst(ally.x, ally.y - 16, "#e0d4b8", 8, 80, { glow: true });
          }
        }
        // Warbreaker: the challenge whips you into a fury
        if (hero.advCalling === "warbreaker") {
          hero.effects.push(makeEffect("haste", 5, 1.35, hero));
        }
        this.fx.ring(hero.x, hero.y, 175, "#e0a34b", { width: 5, life: 0.6 });
        this.fx.ring(hero.x, hero.y, 100, "#ffdf9e", { width: 3, life: 0.45 });
        this.fx.burst(hero.x, hero.y - 22, "#e0a34b", 20, 170, { glow: true });
        this.fx.addShake(6);
        this.zoomPunch = Math.max(this.zoomPunch, 0.5);
        audio.play("ultChallenge");
        break;
      }
      case "whirlwind": {
        const dmg = hero.stats.damage * 2.3;
        const reach = hero.advCalling === "blademaster" ? 110 : 85;
        let dealt = 0;
        let hitAny = false;
        for (const enemy of this.livingEnemies()) {
          const d = Math.hypot(enemy.x - hero.x, enemy.y - hero.y);
          if (d < reach + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#ff9a85" });
            dealt += dmg;
            if (enemy.alive) {
              if (hero.advCalling === "blademaster") enemy.effects.push(makeEffect("burn", 3, 3, hero));
              enemy.effects.push(makeEffect("stun", 0.7, 1, hero));
              const away = this.normalize({ x: enemy.x - hero.x, y: enemy.y - hero.y });
              const shoved = this.clampToField({ x: enemy.x + away.x * 36, y: enemy.y + away.y * 36 }, enemy.radius);
              enemy.x = shoved.x;
              enemy.y = shoved.y;
            }
            hitAny = true;
          }
        }
        // Berserker: the spin drinks deep
        if (hero.advCalling === "berserker" && dealt > 0) {
          this.heal(hero, dealt * 0.4, true, hero);
        }
        this.fx.slash(hero.x, hero.y - 12, 0, 66, "#ff9a85", Math.PI * 2);
        this.fx.slash(hero.x, hero.y - 12, Math.PI, 50, "#ffd0c5", Math.PI * 2);
        this.fx.ring(hero.x, hero.y, reach + 15, "#d1543f", { width: 5, life: 0.5 });
        this.fx.addShake(hitAny ? 9 : 4);
        this.hitstop = Math.max(this.hitstop, hitAny ? 0.08 : 0);
        this.zoomPunch = Math.max(this.zoomPunch, 0.7);
        hero.lunge = 0.8;
        audio.play("ultWhirlwind");
        break;
      }
      case "volley": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        const dmg = 14 + attrs.dex * 3.2;
        const spread = hero.advCalling === "hawkeye" ? 125 : 95;
        for (const enemy of this.livingEnemies()) {
          if (Math.hypot(enemy.x - at.x, enemy.y - at.y) < spread + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#cfe8b0" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 2, 0.35, hero));
          }
        }
        // Strider: the storm leaves a chilling field behind
        if (hero.advCalling === "strider") {
          this.zones.push({ x: at.x, y: at.y, radius: 80, time: 0, duration: 4, kind: "frost", power: 0.35, dps: 1.5, from: hero });
        }
        // arrowfall
        for (let i = 0; i < 20; i++) {
          const ax = at.x + (Math.random() - 0.5) * 160;
          const ay = at.y + (Math.random() - 0.5) * 72;
          this.fx.burst(ax, ay - 6, "#e8d9b0", 2, 70, { gravity: 260, life: 0.4 });
        }
        this.fx.ring(at.x, at.y, 100, "#a8d080", { width: 5, life: 0.5 });
        this.fx.pool(at.x, at.y, 105, "168,208,128", 0.8);
        this.fx.addShake(5);
        hero.lungeDir = dir;
        hero.lunge = 0.6;
        audio.play("ultVolley");
        break;
      }
      case "barrage": {
        const targets = this.livingEnemies()
          .map((e) => ({ e, d: Math.hypot(e.x - hero.x, e.y - hero.y) }))
          .filter((t) => t.d < 300)
          .sort((a, b) => a.d - b.d)
          .slice(0, 5);
        if (!targets.length) {
          cast = false;
          break;
        }
        const dmg = (10 + attrs.int * 2.6) * (0.5 + hero.stats.spellPower * 0.5);
        for (const { e } of targets) {
          this.damage(e, dmg, hero, { spell: true, color: "#b79aee" });
          // Runebinder: the bolts brand their victims
          if (hero.advCalling === "runebinder" && e.alive) {
            e.effects.push(makeEffect("burn", 4, 2 + attrs.int * 0.4, hero));
          }
          // Stormcaller: the bolts arc onward
          if (hero.advCalling === "stormcaller") {
            const near = this.livingEnemies().find((o) => o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 90);
            if (near) {
              this.damage(near, dmg * 0.4, hero, { spell: true, color: "#d8c5ff" });
              this.fx.burst(near.x, near.y - 12, "#d8c5ff", 6, 90, { glow: true });
            }
          }
          this.fx.burst(e.x, e.y - 14, "#b79aee", 10, 120, { glow: true });
          // bolt streak from caster to victim
          const steps = 6;
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            this.fx.burst(hero.x + (e.x - hero.x) * t, hero.y - 18 + (e.y - 4 - hero.y) * t, "#d8c5ff", 1, 20, { glow: true, life: 0.25 });
          }
        }
        this.fx.burst(hero.x, hero.y - 24, "#b79aee", 8, 90, { glow: true });
        audio.play("ultBarrage");
        break;
      }
      case "sanctuary": {
        if (!aim) {
          cast = false;
          break;
        }
        const at = this.clampToField(aim, 0);
        this.zones.push({
          x: at.x,
          y: at.y,
          radius: 92,
          time: 0,
          duration: hero.advCalling === "oracle" ? 8.5 : 6.5,
          kind: "sanctuary",
          // Lightwardens consecrate ground that burns the unworthy
          power: hero.advCalling === "lightwarden" ? 5 + attrs.spi * 1.2 : 0,
          dps: 9 + attrs.spi * 2.2,
          from: hero,
        });
        this.fx.ring(at.x, at.y, 96, "#f2e7a0", { width: 4, life: 0.6 });
        this.fx.burst(at.x, at.y - 10, "#f2e7a0", 16, 100, { glow: true, gravity: -60 });
        this.fx.pool(at.x, at.y, 95, "242,231,160", 1.1);
        audio.play("ultSanctuary");
        break;
      }
      case "blink": {
        const dist = aim ? Math.min(200, Math.hypot(aim.x - hero.x, aim.y - hero.y)) : 150;
        const from = { x: hero.x, y: hero.y };
        const to = this.clampToField({ x: hero.x + dir.x * dist, y: hero.y + dir.y * dist }, hero.radius);
        this.fx.burst(from.x, from.y - 14, "#9adeee", 12, 110, { glow: true });
        // Shadowdancer: the foes you abandon freeze mid-lunge
        if (hero.advCalling === "shadowdancer") {
          for (const enemy of this.livingEnemies()) {
            if (Math.hypot(enemy.x - from.x, enemy.y - from.y) < 120) {
              enemy.effects.push(makeEffect("stun", 1.1, 1, hero));
            }
          }
          this.fx.ring(from.x, from.y, 120, "#9adeee", { width: 3, life: 0.4 });
        }
        hero.x = to.x;
        hero.y = to.y;
        hero.moveTarget = null;
        // emerge quicksilver: a burst of speed and slipperiness
        hero.effects.push(makeEffect("haste", 3, 1.8, hero));
        hero.effects.push(makeEffect("guard", 2, 0.3, hero));
        // shed every hunter
        for (const enemy of this.livingEnemies()) {
          if (enemy.aggro === hero) enemy.aggro = null;
          if (enemy.attackTarget === hero) enemy.attackTarget = null;
          enemy.effects = enemy.effects.filter((e) => !(e.kind === "taunt" && e.source === hero));
        }
        this.fx.burst(to.x, to.y - 14, "#9adeee", 14, 120, { glow: true });
        this.fx.ring(to.x, to.y, 40, "#9adeee", { width: 3, life: 0.35 });
        audio.play("ultBlink");
        break;
      }
      case "duel": {
        const prey = this.livingEnemies().sort((a, b) => unitDist(hero, a) - unitDist(hero, b))[0];
        if (!prey) {
          cast = false;
          break;
        }
        hero.x = this.clampToField({ x: prey.x - Math.sign(prey.x - hero.x || 1) * (prey.radius + 26), y: prey.y }, hero.radius).x;
        hero.y = prey.y;
        const strikes = hero.advCalling === "swordsaint" ? 8 : 6;
        const per = (8 + attrs.str * 1.1 + attrs.dex * 0.8) * 1.1;
        for (let i = 0; i < strikes; i++) {
          if (!prey.alive) break;
          this.damage(prey, per, hero, { spell: true, color: "#ffd27d" });
          this.fx.slash(prey.x, prey.y - 12, Math.random() * Math.PI, 44, "#ffd27d", Math.PI * 1.2);
        }
        this.fx.ring(prey.x, prey.y, 60, "#ffd27d", { width: 4, life: 0.5 });
        this.hitstop = Math.max(this.hitstop, 0.09);
        audio.play("ultDuel");
        break;
      }
      case "aegis": {
        const power = Math.round((26 + attrs.vit * 3.4) * (hero.advCalling === "oathkeeper" ? 1.5 : 1));
        for (const ally of this.livingHeroes()) {
          ally.effects = ally.effects.filter((e) => e.kind !== "shield");
          ally.effects.push(makeEffect("shield", 9999, power, hero));
          this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.4, "#bff0cf", { width: 3, life: 0.5 });
        }
        for (const enemy of this.livingEnemies()) {
          enemy.effects.push(makeEffect("taunt", 3.5, 1, hero));
          if (hero.advCalling === "thornwarden") enemy.effects.push(makeEffect("burn", 3.5, 2.5, hero));
        }
        this.fx.ring(hero.x, hero.y, 200, "#bff0cf", { width: 5, life: 0.8 });
        audio.play("ultAegis");
        break;
      }
      case "nova": {
        const dmg = (20 + attrs.int * 2.6 + attrs.str * 1.2) * hero.stats.spellPower;
        const hitIds = new Set<number>();
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 150 + enemy.radius) {
            this.damage(enemy, dmg, hero, { spell: true, color: "#dcb0f5" });
            if (enemy.alive && hero.advCalling === "runeknight") enemy.effects.push(makeEffect("burn", 3, 3, hero));
            hitIds.add(enemy.id);
          }
        }
        if (hero.advCalling === "stormedge") {
          const beyond = this.livingEnemies().filter((e) => !hitIds.has(e.id)).sort((a, b) => unitDist(hero, a) - unitDist(hero, b)).slice(0, 3);
          for (const e of beyond) {
            this.damage(e, dmg * 0.6, hero, { spell: true, color: "#8fc7e8" });
            this.fx.tracer(hero.x, hero.y - 16, e.x, e.y - 12, "#8fc7e8");
          }
        }
        this.fx.ring(hero.x, hero.y, 155, "#dcb0f5", { width: 6, life: 0.6 });
        this.fx.burst(hero.x, hero.y - 12, "#dcb0f5", 26, 210, { glow: true });
        this.fx.addShake(8);
        audio.play("ultNova");
        break;
      }
      case "shadows": {
        const per = 10 + attrs.dex * 2.0 + attrs.int * 0.8;
        for (const enemy of this.livingEnemies()) {
          const dmg = hero.advCalling === "reaper" && enemy.hp < enemy.stats.maxHp * 0.5 ? per * 2 : per;
          this.damage(enemy, dmg, hero, { spell: true, color: "#b0a5f0" });
          if (enemy.alive && hero.advCalling === "phantom") enemy.effects.push(makeEffect("slow", 2, 0.35, hero));
          this.fx.slash(enemy.x, enemy.y - 12, Math.random() * Math.PI, 40, "#b0a5f0", Math.PI * 1.3);
        }
        this.fx.ring(hero.x, hero.y, 90, "#b0a5f0", { width: 4, life: 0.5 });
        this.slowmo = Math.max(this.slowmo, 0.5);
        audio.play("ultShadows");
        break;
      }
      case "bellow": {
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 150 + enemy.radius) {
            enemy.effects = enemy.effects.filter((e) => e.kind !== "taunt");
            enemy.effects.push(makeEffect("taunt", 3, 1, hero));
          }
        }
        hero.effects.push(makeEffect("guard", 3, 0.2, hero));
        this.fx.ring(hero.x, hero.y, 150, "#e0904b", { width: 4, life: 0.5 });
        this.fx.floatText(hero.x, hero.y - 40, "OVER HERE!", "#e0904b", 15);
        audio.play("warcry");
        break;
      }
      case "avalanche": {
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 130 + enemy.radius) {
            this.damage(enemy, (16 + attrs.str * 2.6) * 1.1, hero, { spell: true, color: "#bcd8e8" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 2.5, 0.4, hero));
          }
        }
        this.fx.ring(hero.x, hero.y, 135, "#bcd8e8", { width: 6, life: 0.6 });
        this.fx.burst(hero.x, hero.y - 8, "#e8f2f8", 22, 180, { gravity: 160, size: 4 });
        this.fx.addShake(9);
        this.hitstop = Math.max(this.hitstop, 0.07);
        audio.play("thud");
        break;
      }
      case "hailknives": {
        for (let k = -2; k <= 2; k++) {
          const a = Math.atan2(dir.y, dir.x) + k * 0.16;
          this.projectiles.push({
            x: hero.x,
            y: hero.y - 14,
            target: null,
            aim: { x: Math.cos(a), y: Math.sin(a) },
            speed: 460,
            damage: (7 + attrs.dex * 1.5) * hero.stats.spellPower,
            from: hero,
            kind: "bolt",
            color: "#9fd6e8",
            heals: false,
            life: 1.1,
          });
        }
        audio.play("shoot");
        break;
      }
      case "windlash": {
        for (const enemy of this.livingEnemies()) {
          if (unitDist(hero, enemy) < 120 + enemy.radius) {
            this.damage(enemy, (10 + attrs.dex * 2.0) * hero.stats.spellPower, hero, { spell: true, color: "#c9e8e0" });
            if (enemy.alive) enemy.effects.push(makeEffect("slow", 2, 0.35, hero));
          }
        }
        this.fx.ring(hero.x, hero.y, 125, "#c9e8e0", { width: 4, life: 0.5 });
        audio.play("spSmokebomb");
        break;
      }
      case "blizzard": {
        if (!aim) {
          cast = false;
          break;
        }
        this.zones.push({ x: aim.x, y: aim.y, radius: 95, time: 0, duration: 5, kind: "frost", power: 0.45, dps: 6 + attrs.int * 1.4, from: hero });
        this.fx.ring(aim.x, aim.y, 95, "#8fc7e8", { width: 4, life: 0.6 });
        audio.play("frost");
        break;
      }
      case "icelance": {
        let first = true;
        const reach = 430;
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(hero, dir, reach, enemy) < enemy.radius + 14) {
            this.damage(enemy, (14 + attrs.int * 2.4) * hero.stats.spellPower, hero, { spell: true, color: "#b8e0f0" });
            if (first && enemy.alive) {
              enemy.effects.push(makeEffect("stun", 0.8, 1, hero));
              first = false;
            }
          }
        }
        this.fx.tracer(hero.x, hero.y - 14, hero.x + dir.x * reach, hero.y - 14 + dir.y * reach, "#b8e0f0");
        audio.play("frost");
        break;
      }
      case "auroraveil": {
        for (const ally of this.livingHeroes()) {
          ally.effects.push(makeEffect("guard", 4.5, 0.25, hero));
          this.fx.ring(ally.x, ally.y - 12, ally.radius * 2.2, "#b0e8c9", { width: 2.5, life: 0.5 });
        }
        audio.play("spBlessing");
        break;
      }
      case "cleansing": {
        for (const ally of this.livingHeroes()) {
          this.heal(ally, 14 + attrs.spi * 2.2, true, hero);
          ally.effects = ally.effects.filter((e) => !["burn", "slow", "silence", "stun", "vulnerable", "frozen", "conductive", "brittle", "poisoned", "exposed", "bleeding", "shrouded"].includes(e.kind));
        }
        this.fx.ring(hero.x, hero.y, 160, "#f0f5d8", { width: 4, life: 0.7 });
        audio.play("spJudgement");
        break;
      }
      case "permafrost": {
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 9999, 25 + attrs.vit * 3, hero));
        this.zones.push({ x: hero.x, y: hero.y, radius: 90, time: 0, duration: 5, kind: "frost", power: 0.4, dps: 3 + attrs.vit * 0.8, from: hero });
        this.fx.ring(hero.x, hero.y, 90, "#a8c9d8", { width: 4, life: 0.6 });
        audio.play("spStoneskin");
        break;
      }
      // --- armor skills: the worn body piece's family answers ---
      case "armorSurge": {
        // cloth: a rush of focus — shave seconds off every other cooldown
        const shave = 6 + this.bodyForgeOf(hero) * 2;
        for (const ab of hero.abilities) {
          if (ab !== state && !ab.ult && ab.timer > 0) ab.timer = Math.max(0, ab.timer - shave);
        }
        // ceremony: a clock of sparks spun forward around the caster
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.fx.burst(hero.x + Math.cos(a) * 26, hero.y - 16 + Math.sin(a) * 16, "#d4baf5", 3, 60, { glow: true, life: 0.35, gravity: -40 });
        }
        this.fx.ring(hero.x, hero.y, 60, "#b48ae8", { width: 3, life: 0.5 });
        this.fx.ring(hero.x, hero.y, 34, "#e8dcff", { width: 2, life: 0.35 });
        this.fx.beam(hero.x, hero.y - 8, 70, 14, "#b48ae8", 0.35);
        hero.castGlow = 0.6;
        audio.play("armorSurge");
        break;
      }
      case "armorTumble": {
        // leather: roll clear — shed every hunter and sprint
        const forge = this.bodyForgeOf(hero);
        hero.effects.push(makeEffect("haste", 2 + forge * 0.3, 1.6, hero));
        hero.effects.push(makeEffect("guard", 1.2, 0.4, hero));
        for (const enemy of this.livingEnemies()) {
          if (enemy.aggro === hero) enemy.aggro = null;
          if (enemy.attackTarget === hero) enemy.attackTarget = null;
        }
        hero.lunge = 1;
        hero.lungeDir = dir;
        // ceremony: a dust-streak the shape of the escape
        this.fx.tracer(hero.x - dir.x * 44, hero.y - dir.y * 44 - 10, hero.x + dir.x * 20, hero.y + dir.y * 20 - 10, "#e8dcc0", 0.3, 4);
        this.fx.tracer(hero.x - dir.x * 30, hero.y - dir.y * 30 - 16, hero.x + dir.x * 16, hero.y + dir.y * 16 - 16, "#8ed081", 0.24, 2.5);
        this.fx.burst(hero.x - dir.x * 18, hero.y - 4, "#c9b490", 14, 110, { gravity: 70, life: 0.5 });
        this.fx.ring(hero.x, hero.y, 36, "#8ed081", { width: 2.5, life: 0.3 });
        audio.play("armorTumble");
        break;
      }
      case "armorRally": {
        // mail: a steadying shout — mend this hero and allies close by
        const frac = 0.1 + this.bodyForgeOf(hero) * 0.02;
        for (const ally of this.livingHeroes()) {
          if (ally !== hero && Math.hypot(ally.x - hero.x, ally.y - hero.y) > 130) continue;
          this.heal(ally, ally.stats.maxHp * frac, true, hero);
          // ceremony: rising motes over everyone the shout reaches
          this.fx.burst(ally.x, ally.y - 24, "#bfe8d4", 8, 60, { glow: true, gravity: -90, life: 0.7 });
          this.fx.ring(ally.x, ally.y - 10, ally.radius * 2, "#9fd4e8", { width: 2, life: 0.45 });
        }
        this.fx.ring(hero.x, hero.y, 130, "#9fd4e8", { width: 4, life: 0.6 });
        this.fx.beam(hero.x, hero.y - 6, 90, 20, "#bfe8d4", 0.5);
        audio.play("armorRally");
        break;
      }
      case "armorBrace": {
        // plate: plant your feet — greatly reduced harm for a few seconds
        const forge = this.bodyForgeOf(hero);
        hero.effects = hero.effects.filter((e) => e.kind !== "guard");
        hero.effects.push(makeEffect("guard", 3 + forge * 0.35, 0.55 + forge * 0.05, hero));
        hero.moveTarget = null;
        // ceremony: the ground takes the weight
        this.fx.ring(hero.x, hero.y, 46, "#c9d2dd", { width: 4, life: 0.5, squash: 0.4 });
        this.fx.ring(hero.x, hero.y, 70, "#8a93a2", { width: 2.5, life: 0.6, squash: 0.4 });
        this.fx.burst(hero.x - 14, hero.y, "#b8aa90", 6, 70, { gravity: 90, life: 0.5 });
        this.fx.burst(hero.x + 14, hero.y, "#b8aa90", 6, 70, { gravity: 90, life: 0.5 });
        this.fx.addShake(4);
        this.hitstop = Math.max(this.hitstop, 0.05);
        audio.play("armorBrace");
        break;
      }
      default:
        cast = false;
    }
    this.castingSpell = false;
    if (cast) this.finishAbilityCast(hero, state, save);
    return cast;
  }

  private mostWoundedAlly(): Unit | null {
    let best: Unit | null = null;
    let bestFrac = 1;
    for (const hero of this.livingHeroes()) {
      const frac = hero.hp / hero.stats.maxHp;
      if (frac < bestFrac) {
        bestFrac = frac;
        best = hero;
      }
    }
    return bestFrac < 0.999 ? best : null;
  }

  private raiseNecroServant(owner: Unit, element: ElementId, x: number, y: number, empowered = false): NecroServant {
    const guardian = owner.advCalling?.endsWith("-ascendant") === true;
    const maxLife = (element === "earth" ? 16 : element === "shadow" ? 9 : 12) + (guardian ? 4 : 0) + (empowered ? 4 : 0);
    const servant: NecroServant = {
      id: this.nextUnitId++,
      owner,
      element,
      x,
      y,
      life: maxLife,
      maxLife,
      attackTimer: 0.35,
      strength: (guardian ? 0.9 : 1) * (empowered ? 1.35 : 1),
      bob: Math.random() * Math.PI * 2,
    };
    this.necroServants.push(servant);
    while (this.necroServants.length > 10) this.necroServants.shift();
    this.fx.ring(x, y, empowered ? 62 : 45, ELEMENT_COLORS[element], { width: empowered ? 5 : 3, life: 0.55 });
    this.fx.burst(x, y - 12, ELEMENT_COLORS[element], empowered ? 18 : 11, 100, { glow: true, gravity: -70, life: 0.65 });
    audio.play("bolt");
    return servant;
  }

  private updateNecroServants(dt: number): void {
    for (let index = this.necroServants.length - 1; index >= 0; index--) {
      const servant = this.necroServants[index];
      servant.life -= dt;
      servant.attackTimer -= dt;
      servant.bob += dt * (servant.element === "shadow" ? 8 : 5.5);
      if (!servant.owner.alive || servant.life <= 0) {
        this.fx.burst(servant.x, servant.y - 10, ELEMENT_COLORS[servant.element], 7, 60, { glow: true, gravity: -50, life: 0.45 });
        this.necroServants.splice(index, 1);
        continue;
      }

      const enemies = [...this.livingEnemies()].sort((a, b) => {
        const priority = Number(PRIORITY_ENEMIES.has(b.enemyKind!)) - Number(PRIORITY_ENEMIES.has(a.enemyKind!));
        return priority || Math.hypot(a.x - servant.x, a.y - servant.y) - Math.hypot(b.x - servant.x, b.y - servant.y);
      });
      const target = enemies[0];
      if (!target) {
        const orbit = { x: servant.owner.x - 28 + (servant.id % 3) * 24, y: servant.owner.y - 10 + Math.sin(servant.bob) * 8 };
        const delta = this.normalize({ x: orbit.x - servant.x, y: orbit.y - servant.y });
        servant.x += delta.x * Math.min(75 * dt, Math.hypot(orbit.x - servant.x, orbit.y - servant.y));
        servant.y += delta.y * Math.min(75 * dt, Math.hypot(orbit.x - servant.x, orbit.y - servant.y));
        continue;
      }

      const dx = target.x - servant.x;
      const dy = target.y - servant.y;
      const distance = Math.hypot(dx, dy);
      if (distance > target.radius + 34) {
        const speed = servant.element === "shadow" ? 155 : servant.element === "earth" ? 95 : 125;
        servant.x += (dx / Math.max(1, distance)) * Math.min(speed * dt, distance);
        servant.y += (dy / Math.max(1, distance)) * Math.min(speed * dt, distance);
        continue;
      }
      if (servant.attackTimer > 0) continue;

      const damage = (6 + servant.owner.stats.damage * 0.62) * servant.strength;
      this.damage(target, damage, servant.owner, { spell: true, color: ELEMENT_COLORS[servant.element], element: servant.element, secondary: true });
      if (target.alive) this.applyPathElement(servant.owner, target, servant.element, "core", damage, true);
      servant.owner.pathResource = Math.min(100, (servant.owner.pathResource ?? 0) + 3);
      servant.attackTimer = servant.element === "shadow" ? 0.72 : servant.element === "storm" ? 0.9 : 1.18;
      this.fx.tracer(servant.x, servant.y - 12, target.x, target.y - 10, ELEMENT_COLORS[servant.element], 0.3, 2.5);
      this.fx.burst(target.x, target.y - 10, ELEMENT_COLORS[servant.element], 5, 55, { glow: true, life: 0.35 });

      if (servant.element === "flame" && target.alive) {
        this.refreshPathEffect(target, "burn", 3.5, Math.max(1.5, damage * 0.08), servant.owner);
      } else if (servant.element === "frost" && target.alive) {
        this.refreshPathEffect(target, "slow", 2.5, 0.28, servant.owner);
      } else if (servant.element === "storm") {
        const fork = enemies.find((enemy) => enemy !== target && Math.hypot(enemy.x - target.x, enemy.y - target.y) < 135);
        if (fork) {
          this.damage(fork, damage * 0.42, servant.owner, { spell: true, color: ELEMENT_COLORS.storm, element: "storm", secondary: true });
          this.fx.tracer(target.x, target.y - 10, fork.x, fork.y - 10, ELEMENT_COLORS.storm, 0.25, 2);
        }
      } else if (servant.element === "earth") {
        const ally = this.livingHeroes().sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0] ?? servant.owner;
        this.refreshPathEffect(ally, "guard", 2.2, 0.12, servant.owner);
      } else if (servant.element === "venom" && target.alive) {
        this.refreshPathEffect(target, "vulnerable", 3.5, 0.1, servant.owner);
      } else if (servant.element === "radiant") {
        const ally = this.mostWoundedAlly();
        if (ally) this.heal(ally, damage * 0.38, true, servant.owner);
      } else if (servant.element === "blood") {
        this.heal(servant.owner, damage * 0.25, false, servant.owner);
      } else if (servant.element === "shadow" && target.alive) {
        if (target.aggro === servant.owner) target.aggro = null;
        if (target.attackTarget === servant.owner) target.attackTarget = null;
      }
    }
  }

  private normalize(v: Vec): Vec {
    const len = Math.hypot(v.x, v.y);
    if (len < 0.0001) return { x: 1, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  private distToRay(origin: Vec, dir: Vec, reach: number, unit: Unit): number {
    const relX = unit.x - origin.x;
    const relY = unit.y - origin.y;
    const t = Math.max(0, Math.min(reach, relX * dir.x + relY * dir.y));
    return Math.hypot(relX - dir.x * t, relY - dir.y * t);
  }

  // ----- per-frame update -----

  update(dt: number, save: SaveData): void {
    this.saveRef = save;
    if (this.state === "victory" || this.state === "defeat") {
      this.resultDelay = Math.max(0, this.resultDelay - dt);
      if (this.ultFlash) {
        this.ultFlash.time -= dt;
        if (this.ultFlash.time <= 0) this.ultFlash = null;
      }
      // the band walks off down the road as the victory settles
      if (this.state === "victory" && this.resultDelay < 0.7) {
        const band = this.livingHeroes();
        band.forEach((hero, rank) => {
          hero.celebrate = false;
          hero.facing = 1;
          hero.moveTarget = this.descending
            ? { x: (this.field.left + this.field.right) / 2 + (rank - (band.length - 1) / 2) * 72, y: this.field.bottom + 220 }
            : { x: this.field.right + 220, y: this.field.top + 50 + rank * 38 };
          this.moveToward(hero, hero.moveTarget, dt, 4);
        });
      }
      this.updatePresentation(dt);
      return;
    }

    // Encounter time is combat time, not the time spent reading a result card.
    // Contracts, best records and journal entries all consume this one clock.
    this.time += dt;
    this.updateTerrain(dt);
    this.waveBanner = Math.max(0, this.waveBanner - dt);
    this.introBanner = Math.max(0, this.introBanner - dt);
    if (this.roleCallout) {
      this.roleCallout.time -= dt;
      if (this.roleCallout.time <= 0) this.roleCallout = null;
    }
    if (this.ultFlash) {
      this.ultFlash.time -= dt;
      if (this.ultFlash.time <= 0) this.ultFlash = null;
    }

    if (this.cinematic > 0) {
      // the world holds its breath while the boss is introduced
      this.cinematic -= dt;
      this.updatePresentation(dt);
      return;
    }
    // sights the band has passed drift on and fade once the fighting starts
    if (this.state === "fighting") {
      for (const lm of this.landmarks) {
        if (this.descending) lm.y -= dt * 60;
        else lm.x -= dt * 60;
        lm.alpha = Math.max(0, lm.alpha - dt * 0.5);
      }
      this.landmarks = this.landmarks.filter((lm) => lm.alpha > 0 && (this.descending ? lm.y > this.field.top - 120 : lm.x > -120));
    }
    // stragglers crash in on their own schedule
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      if (this.time >= this.pendingSpawns[i].at) {
        this.spawnEnemy(this.pendingSpawns[i].kind);
        this.pendingSpawns.splice(i, 1);
      }
    }
    // boss threat cools quickly — the fight keeps asking who is loudest NOW
    for (const k in this.threat) this.threat[k] *= Math.exp(-dt * 0.28);
    // standing in the boss's face is its own kind of loudness — tanks hold attention
    const bosses = this.units.filter((u) => u.alive && u.team === "enemy" && BOSS_KINDS.includes(u.enemyKind ?? ""));
    if (bosses.length) {
      for (const hero of this.livingHeroes()) {
        if (!bosses.some((bz) => unitDist(hero, bz) < 110)) continue;
        const rate = hero.calling === "vanguard" ? 30 : hero.stats.weapon === "sword" || hero.stats.weapon === "greatsword" ? 14 : 0;
        if (rate) this.threat[hero.id] = (this.threat[hero.id] ?? 0) + rate * dt;
      }
    }

    if (this.carry && (!this.carry.ogre.alive || !this.carry.hero.alive)) this.releaseCarry(false);
    if (this.tutorialMode) {
      this.state = "fighting";
    } else {
      if (this.state === "wavebreak") {
        this.breakTimer -= dt;
        if (this.waveIndex >= 0) {
          // the band marches on: the world slides past while they walk
          this.travel += dt * 150;
          // what the fight left behind stays behind
          for (const lm of this.landmarks) {
            if (this.descending) lm.y -= dt * 150;
            else lm.x -= dt * 150;
          }
          this.landmarks = this.landmarks.filter((lm) => this.descending ? lm.y > this.field.top - 120 : lm.x > -120);
          for (const u of this.units) if (!u.alive) {
            if (this.descending) u.y -= dt * 150;
            else u.x -= dt * 150;
          }
          for (const d of this.decals) {
            if (this.descending) d.y -= dt * 150;
            else d.x -= dt * 150;
          }
          for (const z of this.zones) {
            if (this.descending) z.y -= dt * 150;
            else z.x -= dt * 150;
          }
          const marchers = this.livingHeroes();
          for (let rank = 0; rank < marchers.length; rank++) {
            const hero = marchers[rank];
            const fx = this.descending
              ? (this.field.left + this.field.right) / 2 + (rank - (marchers.length - 1) / 2) * 72
              : this.field.left + 70 + (rank % 2) * 46;
            const fy = this.descending
              ? this.field.top + 72 + (rank % 2) * 28
              : this.field.top + 40 + rank * ((this.field.bottom - this.field.top - 80) / 4);
            hero.moveTarget = this.descending ? { x: fx, y: fy + 26 } : { x: fx + 26, y: fy };
            hero.facing = 1;
            hero.marching = true;
            if (this.moveToward(hero, { x: fx, y: fy }, dt, 8)) hero.bobPhase += dt * 10;
          }
        }
        if (this.breakTimer <= 0) this.startNextWave();
      } else if (this.livingEnemies().length === 0 && this.pendingSpawns.length === 0) {
        if (this.waveIndex >= this.stage.waves.length - 1) {
          this.startNextWave(); // triggers victory
        } else {
          this.state = "wavebreak";
          this.breakTimer = 4.2;
          // something worth passing on this stretch of road
          const seed = this.stage.id * 7.3 + this.waveIndex * 3.1;
          this.landmarks.push({
            type: Math.floor((Math.sin(seed * 127.1) * 43758.5453 % 1 + 1) % 1 * 5),
            x: this.descending
              ? this.field.left + 70 + ((Math.sin(seed * 311.7) * 12345.678 % 1 + 1) % 1) * (this.field.right - this.field.left - 140)
              : this.field.right + 120,
            y: this.descending
              ? this.field.bottom + 120
              : this.field.top + 4 + ((Math.sin(seed * 311.7) * 12345.678 % 1 + 1) % 1) * 26,
            alpha: 1,
          });
        }
      }

      if (this.livingHeroes().length === 0 && this.state !== ("defeat" as BattleState)) {
        this.state = "defeat";
        this.resultDelay = 1.0;
        this.slowmo = Math.max(this.slowmo, 1.3); // the fall lands in slow motion
        audio.play("defeat");
        return;
      }
    }

    for (const unit of this.units) {
      if (!unit.alive) continue;
      // an airborne pounce carries the body along its arc, then slams down
      if (unit.leap) {
        const L = unit.leap;
        L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        const e = k * k * (3 - 2 * k);
        unit.x = L.fromX + (L.toX - L.fromX) * e;
        unit.y = L.fromY + (L.toY - L.fromY) * e;
        unit.facing = (L.toX >= L.fromX ? 1 : -1) as 1 | -1;
        if (k >= 1) {
          unit.leap = null;
          this.landPounce(unit, L.toX, L.toY, L.radius);
        }
      }
      this.updateEffects(unit, dt);
      for (const ability of unit.abilities) ability.timer = Math.max(0, ability.timer - dt);
      unit.attackTimer = Math.max(0, unit.attackTimer - dt);
      // Juggernaut: shrug off stuns while above two-thirds health
      if (
        unit.team === "hero" &&
        this.effect(unit, "stun") &&
        this.heroTalentRank(unit, "juggernaut") > 0 &&
        unit.hp > unit.stats.maxHp * (2 / 3)
      ) {
        unit.effects = unit.effects.filter((e) => e.kind !== "stun");
        this.fx.floatText(unit.x, unit.y - unit.radius - 20, "unshaken!", "#ffd27d", 12);
      }
      if (this.effect(unit, "stun")) {
        unit.windup = 0;
        unit.pendingTarget = null;
        continue;
      }
      if (unit.windup > 0) {
        unit.windup -= dt;
        if (unit.windup <= 0 && unit.pendingTarget) {
          const target = unit.pendingTarget;
          unit.pendingTarget = null;
          if (target.alive) {
            // stepping out of a telegraphed swing makes it MISS — dodging is play now
            if (
              unit.team === "enemy" &&
              unit.stats.range <= 90 &&
              unitDist(unit, target) > unit.stats.range + target.radius + 16
            ) {
              unit.lunge = 0.6;
              unit.lungeDir = this.normalize({ x: target.x - unit.x, y: target.y - unit.y });
              this.fx.floatText(unit.x, unit.y - unit.radius * 2.6, "missed!", "#d8d2e4", 11);
              this.fx.burst(unit.x + unit.lungeDir.x * 20, unit.y - 6, "rgba(200,195,210,0.5)", 4, 60, { life: 0.3 });
            } else {
              this.performAttack(unit, target);
              // the Alpha's howled-up bites draw blood
              if (unit.enemyKind === "alpha" && unit.phase >= 2 && target.alive && unit.stats.range < 90) {
                target.effects.push(makeEffect("burn", 3, 3, unit));
              }
            }
          }
        }
        continue;
      }
      if (unit.team === "hero") this.updateHero(unit, dt, save);
      else this.updateEnemy(unit, dt);
    }

    this.updateNecroServants(dt);

    this.updateBossObjectives(dt);
    this.separateUnits(dt);
    // vengeful elites burst where they fell
    for (let i = this.detonations.length - 1; i >= 0; i--) {
      const d = this.detonations[i];
      if (this.time < d.at) continue;
      this.detonations.splice(i, 1);
      for (const hero of this.livingHeroes()) {
        if (Math.hypot(hero.x - d.x, hero.y - d.y) < d.r + hero.radius * 0.5) this.damage(hero, d.dmg, null, { color: "#ff8a70" });
      }
      this.fx.burst(d.x, d.y - 8, "#ff8a70", 16, 150, { glow: true, gravity: 60 });
      this.fx.ring(d.x, d.y, d.r + 8, "#ff8a70", { width: 4, life: 0.4 });
      this.fx.addShake(5);
      audio.play("thud");
    }
    this.updateTelegraphs(dt);
    this.updateZones(dt);
    this.updateProjectiles(dt);
    this.updatePresentation(dt);
  }

  /** Stormbreak terrain affects both teams and can be turned against the enemy. */
  private updateTerrain(dt: number): void {
    const tide = this.stage.terrain === "tide" || this.stage.terrain === "tide-storm";
    const storm = this.stage.terrain === "storm" || this.stage.terrain === "tide-storm";
    if (tide) {
      this.tideLevel = 0.5 - Math.cos((this.time / 18) * Math.PI * 2) * 0.5;
      this.tideHigh = this.tideLevel > 0.58;
      if (this.tideHigh) {
        const waterline = this.field.top + (this.field.bottom - this.field.top) * 0.58;
        for (const unit of this.units) {
          if (!unit.alive || unit.y < waterline || unit.enemyKind === "reefhound" || unit.enemyKind === "stormeel") continue;
          const slow = this.effect(unit, "slow");
          if (slow) {
            slow.time = Math.max(slow.time, 0.22);
            slow.power = Math.max(slow.power, 0.22);
          } else unit.effects.push(makeEffect("slow", 0.22, 0.22, null));
        }
      }
    }
    if (storm && this.state === "fighting" && !this.tutorialMode) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0 && !this.telegraphs.some((mark) => mark.kind === "lightning")) {
        const owner = this.livingEnemies()[0] ?? this.livingHeroes()[0];
        if (owner) {
          const lanes = [0.25, 0.5, 0.75];
          const lane = lanes[Math.floor(Math.random() * lanes.length)];
          this.telegraphs.push({
            x: this.field.left + (this.field.right - this.field.left) * lane,
            y: this.field.top + (this.field.bottom - this.field.top) * (0.35 + Math.random() * 0.5),
            radius: 68,
            time: 0,
            duration: 2.25 * this.warningScale,
            owner,
            kind: "lightning",
          });
        }
        this.lightningTimer = 9 + Math.random() * 4;
      }
    }
    const regionalPatterns: Partial<Record<NonNullable<StageDef["terrain"]>, Telegraph["kind"]>> = {
      cinder: "eruption",
      overgrowth: "roots",
      mirage: "eclipse",
      sanctified: "beam",
      hunt: "bloodmoon",
      void: "void",
    };
    const regionalPattern = this.stage.terrain ? regionalPatterns[this.stage.terrain] : undefined;
    if (regionalPattern && this.state === "fighting" && !this.tutorialMode && !this.bossRef?.alive) {
      this.regionHazardTimer -= dt;
      const lateKinds: Telegraph["kind"][] = ["eruption", "roots", "eclipse", "beam", "shatter", "bloodmoon", "void"];
      if (this.regionHazardTimer <= 0 && !this.telegraphs.some((mark) => lateKinds.includes(mark.kind))) {
        const owner = [...this.livingEnemies()].sort((a, b) => b.hp - a.hp)[0];
        if (owner) {
          const before = this.telegraphs.length;
          this.queueLatePattern(owner, regionalPattern, false);
          for (const mark of this.telegraphs.slice(before)) {
            mark.environmental = true;
            mark.label = `FIELD: ${mark.label ?? "HAZARD"}`;
          }
        }
        this.regionHazardTimer = 10.5 + (this.stage.id % 3) * 1.4;
      }
    }
  }

  private updateEffects(unit: Unit, dt: number): void {
    for (const element of Object.keys(unit.elementBuildup) as ElementId[]) {
      unit.elementBuildup[element] = Math.max(0, (unit.elementBuildup[element] ?? 0) - dt * 3.5);
    }
    if (unit.lastBuildElement && (unit.elementBuildup[unit.lastBuildElement] ?? 0) <= 0) unit.lastBuildElement = null;
    // ember-lined cloth: chill cannot take hold
    if (unit.team === "hero" && this.armorHookOf(unit) === "slowProof") {
      unit.effects = unit.effects.filter((e) => e.kind !== "slow");
    }
    // Once the great bell begins to swing, ordinary control cannot desync the
    // lane warning from its impact. The safe lane is the interrupt.
    if (unit.enemyKind === "bellwidow" && this.widowRite) {
      unit.effects = unit.effects.filter((effect) => effect.kind !== "stun");
    }
    for (let i = unit.effects.length - 1; i >= 0; i--) {
      const effect = unit.effects[i];
      effect.time -= dt;
      if (effect.kind === "burn") {
        unit.hp -= effect.power * dt;
        if (unit.hp <= 0) {
          this.kill(unit, effect.source);
          return;
        }
      }
      if (effect.kind === "poisoned" || effect.kind === "bleeding") {
        const moving = unit.moveTarget !== null || unit.leap !== null;
        const motionMult = effect.kind === "bleeding" && moving ? 1.6 : 1;
        unit.hp -= effect.power * motionMult * dt;
        if (unit.hp <= 0) {
          this.kill(unit, effect.source);
          return;
        }
      }
      if (effect.time <= 0 || (effect.source && !effect.source.alive && effect.kind === "taunt")) {
        unit.effects.splice(i, 1);
      }
    }
    // ground zones: frost chills enemies, sanctuaries mend heroes
    let inFrost = false;
    for (const zone of this.zones) {
      const inside = Math.hypot(unit.x - zone.x, unit.y - zone.y) < zone.radius + unit.radius;
      if (!inside) continue;
      if (zone.kind === "sanctuary") {
        if (unit.team === "hero" && unit.hp < unit.stats.maxHp) {
          this.heal(unit, zone.dps * dt, false, zone.from);
          if (Math.floor((this.time - dt) * 1.1) !== Math.floor(this.time * 1.1)) {
            this.fx.burst(unit.x, unit.y - 16, "#f2e7a0", 2, 40, { gravity: -70, glow: true });
          }
        } else if (unit.team === "enemy" && zone.power > 0) {
          // Lightwarden ground scorches the unworthy
          unit.hp -= zone.power * dt;
          if (unit.hp <= 0) {
            this.kill(unit, zone.from);
            return;
          }
        }
        continue;
      }
      if (zone.kind === "smoke") continue; // damage reduction applies in damage()
      if (zone.kind === "gravity") {
        if (unit.team === "enemy") {
          const gx = zone.x - unit.x;
          const gyy = zone.y - unit.y;
          const glen = Math.hypot(gx, gyy) || 1;
          unit.x += (gx / glen) * zone.power * dt;
          unit.y += (gyy / glen) * zone.power * dt;
          unit.hp -= zone.dps * dt;
          if (unit.hp <= 0) {
            this.kill(unit, zone.from);
            return;
          }
        }
        continue;
      }
      if (unit.team !== zone.from.team) {
        inFrost = true;
        if (unit.team === "enemy") {
          unit.hp -= zone.dps * dt;
          if (unit.hp <= 0) {
            this.kill(unit, zone.from);
            return;
          }
        }
        // ember-lined heroes shrug the ground-chill too
        if (!(unit.team === "hero" && this.armorHookOf(unit) === "slowProof")) {
          const slow = this.effect(unit, "slow");
          if (slow) slow.time = Math.max(slow.time, 0.3);
          else unit.effects.push(makeEffect("slow", 0.3, zone.power, zone.from));
        }
      }
    }
    if (inFrost) unit.hitFlash = Math.max(unit.hitFlash, 0.05);
  }

  private moveToward(unit: Unit, to: Vec, dt: number, arriveDist: number, speedMult = 1): boolean {
    const dx = to.x - unit.x;
    const dy = to.y - unit.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= arriveDist) return true;
    const speed = this.speedOf(unit) * speedMult;
    const step = Math.min(dist, speed * dt);
    unit.x += (dx / dist) * step;
    unit.y += (dy / dist) * step;
    if (Math.abs(dx) > 2) unit.facing = dx > 0 ? 1 : -1;
    unit.bobPhase += dt * 11;
    if (Math.random() < dt * (unit.radius > 20 ? 8 : 4)) {
      this.fx.burst(unit.x - (dx / dist) * unit.radius * 0.6, unit.y, "rgba(170,160,135,0.5)", 1, 26, {
        gravity: -18,
        size: unit.radius > 20 ? 4 : 2.6,
        life: 0.4,
      });
      if (unit.radius > 20) this.addDecal(unit.x, unit.y + 2, "print", 7);
    }
    return dist - step <= arriveDist;
  }

  private updateHero(hero: Unit, dt: number, save: SaveData): void {
    if (hero.attackTarget && !hero.attackTarget.alive) hero.attackTarget = null;
    if (hero.healTarget && !hero.healTarget.alive) hero.healTarget = null;
    // Mosstooth's Hide: wounds slowly knit themselves closed
    if (hero.hp < hero.stats.maxHp && this.armorHookOf(hero) === "regen") {
      this.heal(hero, 1.8 * dt, false, null);
    }
    // auto orders release when finished so the player's own orders always win
    // ultimate: slow ambient charge, and mirror readiness into the button timer
    if ((hero.calling || hero.discipline) && this.state === "fighting") this.gainUlt(hero, dt * 1.2);
    const ultState = hero.abilities.find((a) => a.ult || a.def.pathSkill === "ultimate");
    if (ultState) ultState.timer = hero.ultCharge >= 100 ? 0 : 1;

    if (hero.autoOrder && hero.healTarget && hero.healTarget.hp >= hero.healTarget.stats.maxHp * 0.98) {
      hero.healTarget = null;
      hero.autoOrder = false;
    }
    hero.channelBeam = Math.max(0, hero.channelBeam - dt * 4);

    if (hero.moveTarget) {
      if (this.moveToward(hero, hero.moveTarget, dt, 4)) hero.moveTarget = null;
      return;
    }

    // heal stance: idle healers seek the most wounded nearby ally on their own
    if (!hero.healTarget && !hero.attackTarget && hero.stance === "heal" && hero.stats.healPower >= 8) {
      let worst: Unit | null = null;
      let worstFrac = 0.9;
      for (const ally of this.livingHeroes()) {
        const frac = ally.hp / ally.stats.maxHp;
        if (frac < worstFrac && unitDist(hero, ally) < 420) {
          worstFrac = frac;
          worst = ally;
        }
      }
      if (worst) {
        hero.healTarget = worst;
        hero.autoOrder = true;
      }
    }

    if (hero.healTarget) {
      const target = hero.healTarget;
      const dist = Math.hypot(target.x - hero.x, target.y - hero.y);
      // the mender works from the back line, not from inside the melee
      if (dist > 270) {
        this.moveToward(hero, target, dt, 240);
      } else {
        hero.facing = target.x >= hero.x ? 1 : -1;
        const spi = this.attrOf(hero, "spi", save);
        const rate = hero.stats.healPower;
        if (spi <= 0 || target.hp >= target.stats.maxHp) {
          hero.channelBeam = 0;
        } else {
          hero.channelBeam = 1;
          this.heal(target, rate * dt, false, hero);
          // Chaplain's grace: the channel spills onto wounded allies nearby
          // (Oracles reach two; everyone else one)
          if (hero.discipline === "priest" || hero.calling === "chaplain") {
            const spillCount = hero.advCalling === "oracle" ? 2 : 1;
            const candidates = this.livingHeroes()
              .filter((ally) => ally !== target && ally !== hero && ally.hp / ally.stats.maxHp < 0.92)
              .filter((ally) => Math.hypot(ally.x - target.x, ally.y - target.y) < 200)
              .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)
              .slice(0, spillCount);
            for (const ally of candidates) this.heal(ally, rate * 0.3 * dt, false, hero);
          }
          if (Math.floor((this.time - dt) * 1.25) !== Math.floor(this.time * 1.25)) {
            this.fx.floatText(target.x, target.y - target.radius - 14, `+${Math.round(rate * 0.8)}`, "#8ee88b", 12);
            this.fx.burst(target.x, target.y - 14, "#bff0b0", 2, 40, { gravity: -60, glow: true });
          }
        }
      }
      return;
    }

    let target = hero.attackTarget;
    if (!target) {
      // Idle heroes swing at whatever wanders into reach, but hold position.
      // Heal-stance heroes keep their hands free for channeling.
      if (hero.stance === "heal" && hero.stats.healPower >= 8) return;
      target = this.nearestEnemyWithin(hero, hero.stats.range + 12);
      if (!target) return;
    } else {
      const dist = Math.hypot(target.x - hero.x, target.y - hero.y);
      if (dist > hero.stats.range + target.radius - 6) {
        this.moveToward(hero, target, dt, hero.stats.range + target.radius - 10);
        return;
      }
    }
    hero.facing = target.x >= hero.x ? 1 : -1;
    if (unitDist(hero, target) <= hero.stats.range + target.radius && hero.attackTimer <= 0 && hero.windup <= 0) {
      this.startAttack(hero, target);
    }
  }

  /** Begin the anticipation pose; the strike lands when windup expires. */
  private startAttack(attacker: Unit, target: Unit): void {
    // enemies TELEGRAPH their swings now — a readable windup you can step out of.
    // Heroes stay snappy; bosses have their own telegraph language already.
    if (attacker.team === "enemy") {
      const boss = BOSS_KINDS.includes(attacker.enemyKind ?? "");
      const ranged = attacker.stats.range > 90;
      attacker.windup = boss ? 0.32 : ranged ? 0.3 : 0.55;
      if (!boss && !ranged) {
        this.fx.ring(attacker.x, attacker.y, attacker.radius * 2.1, "#ff9a85", { width: 2, life: attacker.windup, squash: 0.4 });
      }
    } else {
      attacker.windup = 0.13;
    }
    attacker.pendingTarget = target;
    attacker.attackTimer = this.attackIntervalOf(attacker);
    attacker.facing = target.x >= attacker.x ? 1 : -1;
  }

  /** How loudly a hero registers to bosses: shield-bearers ring loudest, menders barely. */
  private threatMult(hero: Unit): number {
    if (hero.calling === "vanguard") return 2.6;
    if (hero.stats.weapon === "sword" || hero.stats.weapon === "greatsword") return 1.5; // any front-liner holds attention
    if (hero.stats.healPower >= 8) return 0.5;
    return 1;
  }

  /** The hero a boss should be angry at. A challenger must OUT-shout the current
   *  target by a clear margin — bosses don't ping-pong, and tanks hold by default. */
  private topThreat(current: Unit | null): Unit | null {
    let best: Unit | null = null;
    let bestV = 10; // below this, threat is just noise
    for (const hero of this.livingHeroes()) {
      const v = this.threat[hero.id] ?? 0;
      if (v > bestV) {
        bestV = v;
        best = hero;
      }
    }
    if (!best) return null;
    if (current && current.alive && best !== current) {
      const held = this.threat[current.id] ?? 0;
      if (bestV < held * 1.3) return current; // not loud enough to peel it off
    }
    return best;
  }

  private nearestEnemyWithin(unit: Unit, range: number): Unit | null {
    let best: Unit | null = null;
    let bestDist = range;
    for (const enemy of this.livingEnemies()) {
      const d = unitDist(unit, enemy);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  private updateEnemy(enemy: Unit, dt: number): void {
    // jog onto the field first
    if (this.descending ? enemy.y > this.field.bottom - enemy.radius : enemy.x > this.field.right - enemy.radius) {
      if (this.descending) enemy.y -= this.speedOf(enemy) * 1.8 * dt;
      else enemy.x -= this.speedOf(enemy) * 1.8 * dt;
      enemy.bobPhase += dt * 14;
      return;
    }
    // crash through the treeline: a burst of leaves and dust on arrival
    if (!enemy.entered) {
      enemy.entered = true;
      this.fx.burst(enemy.x + enemy.radius, enemy.y - 10, "rgba(120, 150, 90, 0.8)", 8, 110, { gravity: 120, size: 3.2, life: 0.5 });
      this.fx.burst(enemy.x, enemy.y + 2, "rgba(185, 170, 145, 0.7)", 6, 60, { gravity: -30, size: 3 });
      this.fx.addShake(enemy.radius > 20 ? 4 : 1.5);
      enemy.lunge = 0.5;
      enemy.lungeDir = this.descending ? { x: 0, y: -1 } : { x: -1, y: 0 };
      if (enemy.affix) {
        this.fx.floatText(enemy.x, enemy.y - enemy.radius * 3 - 8, Battle.AFFIX_NAMES[enemy.affix] ?? enemy.affix, "#ffd76b", 13);
        this.fx.ring(enemy.x, enemy.y, enemy.radius * 2.6, "#ffd76b", { width: 2.5, life: 0.6 });
      }
      const def = enemy.enemyKind ? ENEMIES[enemy.enemyKind] : null;
      if (enemy.enemyKind && def?.priority && !this.roleIntroduced.has(enemy.enemyKind)) {
        this.roleIntroduced.add(enemy.enemyKind);
        const role = (def.role ?? "vanguard").toUpperCase();
        this.fx.floatText(enemy.x, enemy.y - enemy.radius * 3.5 - 14, `${def.name.toUpperCase()} · ${role}`, def.trim, 13);
        this.fx.ring(enemy.x, enemy.y, enemy.radius * 2.8, def.trim, { width: 3, life: 0.7 });
        audio.play("page");
        if (this.saveRef?.tutorialHints && this.stage.id <= 5) {
          const lessons: Record<string, string> = {
            assassin: "It ignores the front line. Intercept it before it reaches a wounded hero.",
            support: "Its allies become harder to kill while it lives. Reach it early.",
            summoner: "Every corpse becomes another problem. Stop the caller first.",
            disruptor: "It breaks formations and interrupts techniques. Keep room to recover.",
            artillery: "Its warning reaches the back line. Move before returning fire.",
            tank: "It protects more dangerous allies. Turn it or go around.",
            controller: "It changes where the band can safely stand. Preserve an escape lane.",
          };
          this.roleCallout = {
            title: `${role} · ${def.name}`,
            text: lessons[def.role ?? ""] ?? def.habit,
            color: def.trim,
            time: 5.2,
          };
        }
      }
    }
    // mid-leap the body belongs to the arc, not the brain
    if (enemy.leap) return;
    // then close most of the gap at a quickened pace so fights start fast
    const nearestForPace = this.nearestHero(enemy);
    const paceBoost = nearestForPace && unitDist(enemy, nearestForPace) > 320 ? 1.5 : 1;

    if (isLateBossKind(enemy.enemyKind) && this.updateLateBoss(enemy, dt)) return;
    if (isLateFoeKind(enemy.enemyKind) && this.updateLateFoe(enemy, dt)) return;

    if (enemy.enemyKind === "bonecaller") {
      this.updateBonecaller(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "shaman" || enemy.enemyKind === "snowhag" || enemy.enemyKind === "saltwitch" || enemy.enemyKind === "stormcaller") {
      this.updateShaman(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "stalker") {
      this.updateStalker(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "harrier" || enemy.enemyKind === "galeharrier") {
      this.updateHarrier(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "drummer" || enemy.enemyKind === "bellkeeper") {
      this.updateDrummer(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "wreckgunner") {
      this.updateWreckGunner(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "conchseer") {
      this.updateConchSeer(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "warbanner") {
      this.updateBanner(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "wyrm") {
      this.updateWyrm(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "stormjaw" && this.updateStormjaw(enemy, dt)) return;
    // Rimeclad ice casing: it cracks off at three-quarters strength
    if (enemy.enemyKind === "rimetroll" && enemy.phase === 0 && enemy.hp < enemy.stats.maxHp * 0.75) {
      enemy.phase = 1;
      enemy.stats.armor = 0.05;
      this.fx.floatText(enemy.x, enemy.y - enemy.radius * 3, "SHATTERED!", "#b8e0f0", 16);
      this.fx.burst(enemy.x, enemy.y - 14, "#d8f0f8", 14, 150, { glow: true, gravity: 180 });
      this.fx.addShake(5);
      audio.play("staggerBreak");
    }
    if (enemy.enemyKind === "rimeheart") this.updateRimeheart(enemy, dt);
    if (enemy.enemyKind === "bellwidow" && this.updateBellWidow(enemy, dt)) return;
    if (enemy.enemyKind === "alpha") {
      this.updateAlpha(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "ogre") {
      this.updateOgreRage(enemy, dt);
      if (this.updateOgreGrab(enemy, dt)) return;
    }
    if (enemy.enemyKind === "warlord") this.updateWarlordSweep(enemy, dt);

    const taunt = this.effect(enemy, "taunt");
    let target: Unit | null = taunt && taunt.source && taunt.source.alive ? taunt.source : null;
    const role = enemy.enemyKind ? ENEMIES[enemy.enemyKind].role : undefined;
    const heroes = this.livingHeroes();
    if (!target && role === "assassin" && heroes.length) {
      target = [...heroes].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
    }
    if (!target && role === "hunter" && heroes.length > 1) {
      target = [...heroes].sort((a, b) => {
        const aPack = Math.min(...heroes.filter((hero) => hero !== a).map((hero) => unitDist(a, hero)));
        const bPack = Math.min(...heroes.filter((hero) => hero !== b).map((hero) => unitDist(b, hero)));
        return bPack - aPack;
      })[0];
    }
    if (!target && role === "disruptor" && heroes.length) {
      target = [...heroes].sort((a, b) => b.abilities.filter((ability) => ability.timer <= 0).length - a.abilities.filter((ability) => ability.timer <= 0).length)[0];
    }
    // bosses answer the loudest threat — pour damage in and they turn on you
    const bossBrain = BOSS_KINDS.includes(enemy.enemyKind ?? "");
    if (!target && bossBrain) target = this.topThreat(enemy.aggro && enemy.aggro.alive ? enemy.aggro : null);
    if (!target && enemy.aggro && enemy.aggro.alive) target = enemy.aggro;
    if (!target) target = bossBrain ? this.nearestFighter(enemy) : this.nearestHero(enemy);
    if (!target) return;
    if (!enemy.aggro) {
      enemy.alert = 0.5;
      this.fx.floatText(enemy.x, enemy.y - enemy.radius * 3 - 8, "!", "#ffd7a0", 15);
    }
    enemy.aggro = target;

    const def = enemy.enemyKind ? ENEMIES[enemy.enemyKind] : null;
    const dist = unitDist(enemy, target);

    // snipers back away from close threats while reloading
    if (def && def.range > 100 && dist < 95 && enemy.attackTimer > 0.35) {
      const away = this.normalize({ x: enemy.x - target.x, y: enemy.y - target.y });
      const to = this.clampToField({ x: enemy.x + away.x * 60, y: enemy.y + away.y * 60 }, enemy.radius);
      this.moveToward(enemy, to, dt, 4);
      enemy.facing = target.x >= enemy.x ? 1 : -1;
      return;
    }

    if (dist > enemy.stats.range + target.radius - 4) {
      this.moveToward(enemy, target, dt, enemy.stats.range + target.radius - 8, paceBoost);
      return;
    }
    enemy.facing = target.x >= enemy.x ? 1 : -1;
    if (enemy.attackTimer <= 0 && enemy.windup <= 0) {
      this.startAttack(enemy, target);
    }
  }

  private latePatternOf(kind: LateEnemyKind): Telegraph["kind"] {
    if (["cinderkin", "ashenhound", "furnacecantor", "kilntyrant", "cindermaw"].includes(kind)) return "eruption";
    if (["briarback", "sporeseer", "vinelurker", "rootboundmatriarch", "verdantcolossus"].includes(kind)) return "roots";
    if (["gloomwing", "glassjackal", "mirageseer", "dunerevenant", "nightmother"].includes(kind)) return "eclipse";
    if (["reliquaryguard", "censerwraith", "oathbreaker", "gildedinquisitor", "reliquaryseraph"].includes(kind)) return "beam";
    if (["shardling", "galeroc", "thundermonk", "tempestroc", "skybreaker"].includes(kind)) return "shatter";
    if (["bloodreaver", "briarwitch", "moonfang", "redhuntsman", "bloodmoonstag"].includes(kind)) return "bloodmoon";
    return "void";
  }

  private playLatePatternSound(kind: Telegraph["kind"]): void {
    if (kind === "eruption") audio.play("bossEruption");
    else if (kind === "roots") audio.play("bossRoots");
    else if (kind === "eclipse") audio.play("bossEclipse");
    else if (kind === "beam") audio.play("bossBeam");
    else if (kind === "shatter") audio.play("bossShatter");
    else if (kind === "bloodmoon") audio.play("bossBloodmoon");
    else if (kind === "void") audio.play("bossVoid");
  }

  private queueLatePattern(owner: Unit, kind: Telegraph["kind"], boss: boolean): void {
    const heroes = this.livingHeroes();
    if (!heroes.length) return;
    owner.castGlow = 0.85;
    const duration = this.telegraphTime * (boss ? 1.08 : 0.92) + (kind === "beam" || kind === "bloodmoon" ? 0.28 : 0);
    const weakest = [...heroes].sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
    const isolated = [...heroes].sort((a, b) => {
      const aNearest = Math.min(...heroes.filter((hero) => hero !== a).map((hero) => unitDist(a, hero)), 999);
      const bNearest = Math.min(...heroes.filter((hero) => hero !== b).map((hero) => unitDist(b, hero)), 999);
      return bNearest - aNearest;
    })[0];
    const backliner = [...heroes].sort((a, b) => {
      const aScore = a.stats.healPower * 3 + a.stats.range * 0.08 - a.stats.armor * 18;
      const bScore = b.stats.healPower * 3 + b.stats.range * 0.08 - b.stats.armor * 18;
      return bScore - aScore;
    })[0];
    let clustered = heroes[0];
    let clusteredCount = 0;
    for (const hero of heroes) {
      const nearby = heroes.filter((other) => Math.hypot(other.x - hero.x, other.y - hero.y) < 120).length;
      if (nearby > clusteredCount) {
        clustered = hero;
        clusteredCount = nearby;
      }
    }
    // Regular foes share a regional attack language, but aim it according to
    // their fixed combat role. That makes a hound, seer, and cantor ask three
    // different questions even when all three belong to the same element.
    const role = ENEMIES[owner.enemyKind!]?.role ?? "vanguard";
    const roleTarget = role === "assassin" || role === "hunter"
      ? isolated
      : role === "artillery" || role === "support" || role === "summoner"
        ? backliner
        : role === "disruptor"
          ? [...heroes].sort((a, b) => b.abilities.filter((ability) => ability.timer <= 0).length - a.abilities.filter((ability) => ability.timer <= 0).length)[0]
          : clustered;
    const addCircle = (target: Vec, radius: number, label: string, delay = 0) => {
      this.telegraphs.push({ x: target.x, y: target.y, radius, time: -delay, duration, owner, kind, label });
    };

    if (kind === "eruption") {
      const heartBroken = owner.enemyKind === "cindermaw" && this.remainingObjectives("furnaceHeart") === 0;
      const count = boss ? Math.min(heroes.length, Math.max(2, owner.phase + 1) - (heartBroken ? 1 : 0)) : 1;
      for (let i = 0; i < count; i++) addCircle(boss ? heroes[(i + owner.id) % heroes.length] : roleTarget, boss ? 68 : 48, "ERUPT", i * 0.16);
      if (boss && (owner.phase >= 3 || (owner.enemyKind === "kilntyrant" && owner.phase >= 2))) {
        addCircle(owner, owner.enemyKind === "kilntyrant" ? 82 : 96, "VENT", 0.28);
      }
    } else if (kind === "roots") {
      const rootsClose = owner.enemyKind === "rootboundmatriarch" && owner.phase >= 2;
      const anchors = owner.enemyKind === "verdantcolossus" ? this.remainingObjectives("rootAnchor") : 0;
      const targets = boss ? heroes.slice(0, owner.phase >= 3 || rootsClose ? heroes.length : 2) : [roleTarget];
      targets.forEach((hero, index) => addCircle(hero, boss ? 66 + anchors * 3 : 50, anchors ? "ANCHOR ROOTS" : "ROOTS", index * 0.12));
    } else if (kind === "eclipse") {
      addCircle(boss ? clustered : roleTarget, boss ? 126 : 66, "ECLIPSE");
      if (boss && (owner.phase >= 3 || (owner.enemyKind === "dunerevenant" && owner.phase >= 2))) {
        const other = heroes.find((hero) => hero !== clustered) ?? clustered;
        addCircle(other, 88, "FALSE MOON", 0.32);
      }
    } else if (kind === "beam") {
      const cx = (this.field.left + this.field.right) / 2;
      const cy = (this.field.top + this.field.bottom) / 2;
      this.telegraphs.push({
        x: cx,
        y: boss ? clustered.y : roleTarget.y,
        radius: boss ? 52 : 34,
        time: 0,
        duration,
        owner,
        kind,
        label: "VERDICT",
        angle: 0,
        length: this.field.right - this.field.left,
      });
      if (boss && owner.phase >= 2) {
        this.telegraphs.push({
          x: clustered.x,
          y: cy,
          radius: 48,
          time: -0.22,
          duration,
          owner,
          kind,
          label: "CROSSING RAY",
          angle: Math.PI / 2,
          length: this.field.bottom - this.field.top,
        });
        // The final Seraph phase turns the old cross into a broken halo. The
        // diagonal arrives later, leaving readable seams rather than a wall of
        // simultaneous damage.
        if (owner.enemyKind === "reliquaryseraph" && owner.phase >= 3) {
          this.telegraphs.push({
            x: cx,
            y: cy,
            radius: 40,
            time: -0.48,
            duration,
            owner,
            kind,
            label: "FALLEN HALO",
            angle: Math.PI / 4,
            length: Math.hypot(this.field.right - this.field.left, this.field.bottom - this.field.top),
          });
        }
      }
    } else if (kind === "shatter") {
      addCircle(boss ? clustered : roleTarget, boss ? 128 : 64, "SHATTER");
      if (boss && (owner.phase >= 3 || (owner.enemyKind === "skybreaker" && owner.phase >= 2) || (owner.enemyKind === "tempestroc" && owner.phase >= 2))) {
        const radius = owner.enemyKind === "tempestroc" ? 78 : owner.enemyKind === "skybreaker" && owner.phase === 2 ? 76 : 90;
        addCircle(weakest, radius, owner.enemyKind === "skybreaker" ? "FALLING PEAK" : "AFTERSHOCK", owner.enemyKind === "skybreaker" ? 0.52 : 0.38);
      }
    } else if (kind === "bloodmoon") {
      const dx = weakest.x - owner.x;
      const dy = weakest.y - owner.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const length = Math.min(boss ? 520 : 350, distance + (boss ? 120 : 70));
      const ux = dx / distance;
      const uy = dy / distance;
      this.telegraphs.push({
        x: owner.x + ux * length * 0.5,
        y: owner.y + uy * length * 0.5,
        radius: boss ? 56 : 38,
        time: 0,
        duration,
        owner,
        kind,
        label: "MARKED CHARGE",
        angle: Math.atan2(dy, dx),
        length,
      });
      owner.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
    } else {
      addCircle(clustered, boss ? 122 : 68, "UNMAKE");
      if (boss && (owner.phase >= 4 || (owner.enemyKind === "lastpilgrim" && owner.phase >= 2))) {
        addCircle(weakest, owner.enemyKind === "lastpilgrim" ? 74 : 82, "NO ROAD", 0.4);
      }
    }
    this.playLatePatternSound(kind);
  }

  /** One signature warning per late regular foe. They keep moving and using
   * basic attacks between casts, so the new mechanic adds a role instead of
   * replacing the existing combat grammar. */
  private updateLateFoe(enemy: Unit, dt: number): boolean {
    if (!isLateFoeKind(enemy.enemyKind)) return false;
    const role = ENEMIES[enemy.enemyKind].role ?? "vanguard";
    enemy.supportTimer -= dt;
    if (this.telegraphs.some((mark) => mark.owner === enemy)) {
      enemy.castGlow = Math.max(enemy.castGlow, 0.5);
      return true;
    }
    // Late-road enemies keep the region's visual language, but their role now
    // decides what they actually contribute to the composition.
    if (role === "support" && enemy.supportTimer <= 0 && !this.effect(enemy, "stun")) {
      const ally = this.livingEnemies()
        .filter((unit) => unit !== enemy)
        .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      if (ally) {
        const shield = this.effect(ally, "shield");
        const strength = 28 + this.stage.scale * 4;
        if (shield) shield.power += strength;
        else ally.effects.push(makeEffect("shield", 5.5, strength, enemy));
        ally.effects.push(makeEffect("haste", 4.5, 1.14, enemy));
        this.fx.floatText(enemy.x, enemy.y - enemy.radius * 3, "WARDING", ENEMIES[enemy.enemyKind].trim, 11);
        this.fx.ring(ally.x, ally.y, ally.radius * 2, ENEMIES[enemy.enemyKind].trim, { width: 2, life: 0.45 });
      }
      enemy.supportTimer = 7.5 + (enemy.id % 3) * 0.6;
      return !!ally;
    }
    if (role === "tank") {
      const guarded = this.livingEnemies().find((unit) => unit !== enemy && ENEMIES[unit.enemyKind!].priority && unit.x > enemy.x && unit.x - enemy.x < 125 && Math.abs(unit.y - enemy.y) < 60);
      if (guarded && !this.effect(guarded, "guard")) guarded.effects.push(makeEffect("guard", 1.2, 0.22, enemy));
      return false;
    }
    if (role === "vanguard" || role === "hunter" || role === "assassin") return false;
    if (enemy.supportTimer <= 0 && !this.effect(enemy, "stun")) {
      this.queueLatePattern(enemy, this.latePatternOf(enemy.enemyKind), false);
      enemy.supportTimer = role === "disruptor" ? 7.2 + (enemy.id % 3) * 0.5 : 8.5 + (enemy.id % 4) * 0.55;
      return true;
    }
    return false;
  }

  /** Every late boss owns a different arena question. The Way-Eater is the
   * capstone: it recalls those questions in sequence rather than inventing a
   * visually unrelated final gimmick. */
  private updateLateBoss(boss: Unit, dt: number): boolean {
    if (!isLateBossKind(boss.enemyKind)) return false;
    const thresholds = BOSS_PHASES[boss.enemyKind] ?? [];
    const frac = boss.hp / boss.stats.maxHp;
    const nextPhase = 1 + thresholds.filter((threshold) => frac < threshold).length;
    if (nextPhase > boss.phase) {
      const previousPhase = boss.phase;
      boss.phase = nextPhase;
      boss.supportTimer = Math.min(boss.supportTimer, nextPhase === 1 ? 1.15 : 0.7);
      const phaseWords: Record<LateBossKind, string[]> = {
        kilntyrant: ["THE CRUCIBLE WALKS", "IRON SHELL CRACKED"],
        cindermaw: ["THE FURNACE OPENS", "THE CRUST SPLITS", "ALL FIRES BELOW"],
        rootboundmatriarch: ["THE NURSERY WAKES", "HEARTROOT EXPOSED"],
        verdantcolossus: ["THE GROVE WALKS", "ROOTS TAKE HOLD", "HEARTWOOD BARED"],
        dunerevenant: ["THE FALSE KING RIDES", "THE MIRAGE BREAKS"],
        nightmother: ["THE VEIL DESCENDS", "A SECOND MOON", "NIGHT WITHOUT LAMPS"],
        gildedinquisitor: ["THE TRIAL BEGINS", "JUDGMENT REVERSED"],
        reliquaryseraph: ["THE VOW AWAKES", "VERDICT IN GOLD", "SEVEN WINGS BURN"],
        tempestroc: ["THE ROC DESCENDS", "THUNDER-WINGS BROKEN"],
        skybreaker: ["THE PEAK TAKES FLIGHT", "CRYSTAL STORM", "THE SKY COMES APART"],
        redhuntsman: ["THE HORN NAMES PREY", "THE HUNTER STARVES"],
        bloodmoonstag: ["THE HUNT NAMES YOU", "THE RED TRAIL", "NO QUARRY ESCAPES"],
        lastpilgrim: ["THE PILGRIM RETURNS", "NO ROAD BEHIND"],
        wayeater: ["THE HORIZON OPENS", "IT REMEMBERS FIRE", "IT REMEMBERS NIGHT", "THE LAST ROAD"],
      };
      const words = phaseWords[boss.enemyKind][Math.min(nextPhase - 1, phaseWords[boss.enemyKind].length - 1)];
      this.fx.floatText(boss.x, boss.y - boss.radius * 3.1, words, "#ffe9a3", nextPhase === 1 ? 17 : 20);
      this.fx.ring(boss.x, boss.y, boss.radius * (2.2 + nextPhase * 0.3), ENEMIES[boss.enemyKind].trim, { width: 4, life: 0.7 });
      this.hitstop = Math.max(this.hitstop, nextPhase === 1 ? 0.04 : 0.1);
      this.zoomPunch = Math.max(this.zoomPunch, nextPhase === 1 ? 0.45 : 1.05);
      if (nextPhase > 1) {
        const finalPhase = nextPhase >= phaseWords[boss.enemyKind].length;
        this.bossMoment = {
          eyebrow: finalPhase ? `FINAL PHASE · ${(ENEMIES[boss.enemyKind].role ?? "great foe").toUpperCase()}` : `PHASE ${nextPhase} · PATTERN CHANGED`,
          title: words,
          accent: ENEMIES[boss.enemyKind].trim,
          time: 1.65,
          maxTime: 1.65,
          final: finalPhase,
        };
        audio.bossPhase(nextPhase, finalPhase);
      }
      if (nextPhase > 1) {
        this.fx.burst(boss.x, boss.y - boss.radius, ENEMIES[boss.enemyKind].trim, 22, 180, { glow: true, gravity: 30 });
        audio.play("staggerBreak");
      }
      if (nextPhase > 1) {
        const crossedPhases = nextPhase - Math.max(1, previousPhase);
        const phaseHaste = 1.05 + nextPhase * 0.06;
        const existingPhaseHaste = boss.effects.find((effect) => effect.kind === "haste" && effect.source === null && effect.time >= 900);
        if (existingPhaseHaste) {
          existingPhaseHaste.time = 999;
          existingPhaseHaste.power = Math.max(existingPhaseHaste.power, phaseHaste);
        } else {
          boss.effects.push(makeEffect("haste", 999, phaseHaste, null));
        }
        boss.stats.armor = Math.max(0.05, boss.stats.armor - 0.035 * crossedPhases);
        const attendant: Partial<Record<LateBossKind, EnemyKind>> = {
          kilntyrant: "ashenhound",
          cindermaw: "cinderkin",
          rootboundmatriarch: "vinelurker",
          verdantcolossus: "briarback",
          dunerevenant: "glassjackal",
          nightmother: "gloomwing",
          gildedinquisitor: "censerwraith",
          reliquaryseraph: "reliquaryguard",
          tempestroc: "galeroc",
          skybreaker: "shardling",
          redhuntsman: "moonfang",
          bloodmoonstag: "bloodreaver",
          lastpilgrim: "rifthound",
          wayeater: "nullwalker",
        };
        const attendantScale = boss.enemyKind === "reliquaryseraph"
          ? 0.55
          : boss.enemyKind === "wayeater"
            ? 0.45
            : 0.82;
        // Burst damage may cross more than one threshold in a frame. Preserve
        // every phase's reinforcement instead of silently skipping the middle.
        for (let crossed = 0; crossed < crossedPhases; crossed++) {
          this.spawnEnemy(attendant[boss.enemyKind]!, { scale: this.stage.scale * attendantScale });
        }
        this.fx.addShake(7 + nextPhase);
      }
    }

    boss.supportTimer -= dt;
    if (this.telegraphs.some((mark) => mark.owner === boss)) {
      boss.castGlow = Math.max(boss.castGlow, 0.75);
      return true;
    }
    if (boss.supportTimer > 0 || this.effect(boss, "stun")) return false;

    let pattern = this.latePatternOf(boss.enemyKind);
    if (boss.enemyKind === "wayeater") {
      const remembered: Telegraph["kind"][] = ["eruption", "roots", "eclipse", "beam", "shatter", "bloodmoon", "void"];
      const cursor = this.lateBossCycles.get(boss.id) ?? 0;
      pattern = remembered[(cursor + Math.max(0, boss.phase - 1)) % remembered.length];
      this.lateBossCycles.set(boss.id, cursor + 1);
    }
    this.queueLatePattern(boss, pattern, true);
    boss.supportTimer = boss.enemyKind === "wayeater"
      ? Math.max(5.15, 7.9 - boss.phase * 0.62)
      : Math.max(4.25, 7.4 - boss.phase * 0.72);
    return true;
  }

  /** Fen Stalker: skirts the fight along a lane, then leaps on whoever mends the others. */
  private updateStalker(st: Unit, dt: number): void {
    st.supportTimer -= dt;
    if (st.leap) return;
    const pending = this.telegraphs.find((t) => t.owner === st);
    // the hunt: mark the healer if one stands, else the frailest — on a long cadence
    if (!pending && st.supportTimer <= 0 && !this.effect(st, "stun")) {
      const heroes = this.livingHeroes();
      if (heroes.length) {
        const prey =
          heroes.find((h) => h.stats.healPower >= 8) ??
          [...heroes].sort((a, b) => a.stats.maxHp - b.stats.maxHp)[0];
        this.telegraphs.push({
          x: prey.x,
          y: prey.y,
          radius: 46,
          time: 0,
          duration: this.telegraphTime * 0.85,
          owner: st,
          kind: "pounce",
        });
        audio.play("hiss");
        st.supportTimer = 11;
        return;
      }
    }
    const exposed = this.effect(st, "vulnerable");
    const target = st.aggro && st.aggro.alive ? st.aggro : this.nearestHero(st);
    if (!target) return;
    st.aggro = target;
    // between hunts it prowls the field's edge instead of joining the line
    if (!exposed && !pending && st.supportTimer > 3.5) {
      const laneY = st.id % 2 === 0 ? this.field.top + 18 : this.field.bottom - 18;
      const lurk = this.clampToField({ x: Math.max(this.field.left + 80, target.x + 90), y: laneY }, st.radius);
      if (Math.hypot(lurk.x - st.x, lurk.y - st.y) > 26) {
        this.moveToward(st, lurk, dt, 20, 1.05);
        st.facing = target.x >= st.x ? 1 : -1;
        return;
      }
      st.facing = target.x >= st.x ? 1 : -1;
      return;
    }
    // caught out (or waiting): it fights like any knife-thing
    const dist = unitDist(st, target);
    if (dist > st.stats.range + target.radius - 4) {
      this.moveToward(st, target, dt, st.stats.range + target.radius - 8);
      return;
    }
    st.facing = target.x >= st.x ? 1 : -1;
    if (st.attackTimer <= 0 && st.windup <= 0) this.startAttack(st, target);
  }

  /** Moor Harrier: circles out of reach, dives on a telegraph, and is grounded after. */
  private updateHarrier(h: Unit, dt: number): void {
    h.supportTimer -= dt;
    if (h.leap) return;
    if (h.aloft === undefined) {
      h.aloft = true;
      h.supportTimer = 4 + Math.random() * 3;
    }
    if (!h.aloft) {
      // grounded after the swoop — this is the window to hurt it
      if (h.supportTimer <= 0 && !this.effect(h, "stun")) {
        h.aloft = true;
        h.supportTimer = 7 + Math.random() * 2.5;
        this.fx.burst(h.x, h.y - 8, "#d8cfc0", 10, 100, { gravity: -60, life: 0.5 });
        audio.play("wingbeat");
        return;
      }
      const t = h.aggro && h.aggro.alive ? h.aggro : this.nearestHero(h);
      if (!t) return;
      h.aggro = t;
      const dist = unitDist(h, t);
      if (dist > h.stats.range + t.radius - 4) {
        this.moveToward(h, t, dt, h.stats.range + t.radius - 8);
        return;
      }
      h.facing = t.x >= h.x ? 1 : -1;
      if (h.attackTimer <= 0 && h.windup <= 0) this.startAttack(h, t);
      return;
    }
    // aloft: orbit the band's midst, untouchable by blades
    const t = this.nearestHero(h);
    if (!t) return;
    h.phase += dt * 1.3;
    const orbit = this.clampToField({ x: t.x + Math.cos(h.phase) * 175, y: t.y + Math.sin(h.phase) * 60 }, h.radius);
    this.moveToward(h, orbit, dt, 8, 1.1);
    h.facing = t.x >= h.x ? 1 : -1;
    const pending = this.telegraphs.find((tg) => tg.owner === h);
    if (!pending && h.supportTimer <= 0 && !this.effect(h, "stun")) {
      const heroes = this.livingHeroes();
      const prey = heroes[Math.floor(Math.random() * heroes.length)];
      this.telegraphs.push({
        x: prey.x,
        y: prey.y,
        radius: 52,
        time: 0,
        duration: this.telegraphTime * 0.9,
        owner: h,
        kind: "pounce",
      });
      audio.play("screech");
      h.supportTimer = 999; // the landing sets the grounded clock
    }
  }

  /** Gorehulk's war banner: stands where planted, pulsing rage — and falls with its lord. */
  private updateBanner(banner: Unit, dt: number): void {
    if (!this.livingEnemies().some((u) => u.enemyKind === "warlord")) {
      // the lord is dead; the standard means nothing now
      this.damage(banner, 99999, null);
      return;
    }
    banner.supportTimer -= dt;
    if (banner.supportTimer <= 0) {
      banner.supportTimer = 3;
      banner.castGlow = 0.5;
      for (const ally of this.livingEnemies()) {
        if (ally === banner || Math.hypot(ally.x - banner.x, ally.y - banner.y) > 220) continue;
        ally.effects = ally.effects.filter((e) => !(e.kind === "haste" && e.source === banner));
        ally.effects.push(makeEffect("haste", 3.4, 1.3, banner));
      }
      this.fx.ring(banner.x, banner.y, 220, "#9a2f28", { width: 3.5, life: 0.6 });
      audio.play("drumbeat");
    }
  }

  /** War-Drummer: hangs back and beats a rhythm that quickens every foe near it. */
  private updateDrummer(d: Unit, dt: number): void {
    d.supportTimer -= dt;
    if (d.supportTimer <= 0 && !this.effect(d, "stun")) {
      d.supportTimer = 4;
      d.castGlow = 0.5;
      let stirred = 0;
      for (const ally of this.livingEnemies()) {
        if (ally === d || Math.hypot(ally.x - d.x, ally.y - d.y) > 170) continue;
        ally.effects = ally.effects.filter((e) => !(e.kind === "haste" && e.source === d));
        ally.effects.push(makeEffect("haste", 4.4, 1.22, d));
        stirred++;
      }
      this.fx.ring(d.x, d.y, 170, "#e8a05a", { width: 3.5, life: 0.6 });
      this.fx.ring(d.x, d.y, 60, "#f5c88a", { width: 2.5, life: 0.4 });
      if (stirred > 0) this.fx.floatText(d.x, d.y - d.radius * 3, "DOOM-doom-doom", "#e8a05a", 12);
      audio.play("drumbeat");
    }
    // it keeps the drum out of sword's reach
    const near = this.nearestHero(d);
    if (!near) return;
    const dist = unitDist(d, near);
    if (dist < 190) {
      const away = this.normalize({ x: d.x - near.x, y: d.y - near.y });
      this.moveToward(d, this.clampToField({ x: d.x + away.x * 60, y: d.y + away.y * 60 }, d.radius), dt, 4, 0.9);
      d.facing = near.x >= d.x ? 1 : -1;
      return;
    }
    if (dist > 300) {
      this.moveToward(d, near, dt, 260);
      return;
    }
    d.facing = near.x >= d.x ? 1 : -1;
    if (dist < d.stats.range + near.radius && d.attackTimer <= 0 && d.windup <= 0) this.startAttack(d, near);
  }

  /** Wreck Gunner: keeps its rusted cannon behind the line and marks the ground before firing. */
  private updateWreckGunner(gunner: Unit, dt: number): void {
    gunner.supportTimer -= dt;
    const nearest = this.nearestHero(gunner);
    const pending = this.telegraphs.some((mark) => mark.owner === gunner);
    if (!pending && gunner.supportTimer <= 0 && !this.effect(gunner, "stun")) {
      const heroes = this.livingHeroes();
      let target: Unit | null = null;
      let cluster = -1;
      for (const hero of heroes) {
        const nearby = heroes.filter((other) => Math.hypot(other.x - hero.x, other.y - hero.y) < 105).length;
        if (nearby > cluster) {
          cluster = nearby;
          target = hero;
        }
      }
      if (target) {
        this.telegraphs.push({
          x: target.x,
          y: target.y,
          radius: 62,
          time: 0,
          duration: this.telegraphTime + 0.45,
          owner: gunner,
          kind: "cannon",
        });
        gunner.facing = target.x >= gunner.x ? 1 : -1;
        gunner.castGlow = 0.55;
        gunner.supportTimer = 7.5;
        this.fx.floatText(gunner.x, gunner.y - gunner.radius * 3, "powder lit!", "#e6b06c", 12);
        audio.play("shoot");
      }
    }
    if (!nearest) return;
    const dist = unitDist(gunner, nearest);
    if (dist < 165) {
      const away = this.normalize({ x: gunner.x - nearest.x, y: gunner.y - nearest.y });
      this.moveToward(gunner, this.clampToField({ x: gunner.x + away.x * 70, y: gunner.y + away.y * 70 }, gunner.radius), dt, 4, 0.9);
      gunner.facing = nearest.x >= gunner.x ? 1 : -1;
      return;
    }
    if (dist > gunner.stats.range + nearest.radius - 4) {
      this.moveToward(gunner, nearest, dt, gunner.stats.range + nearest.radius - 14);
      return;
    }
    gunner.facing = nearest.x >= gunner.x ? 1 : -1;
    if (gunner.attackTimer <= 0 && gunner.windup <= 0) this.startAttack(gunner, nearest);
  }

  /** Conch Seer: lays short-lived pearlescent wards over the coast's front line. */
  private updateConchSeer(seer: Unit, dt: number): void {
    seer.supportTimer -= dt;
    const nearest = this.nearestHero(seer);
    if (nearest && unitDist(seer, nearest) < 135) {
      const away = this.normalize({ x: seer.x - nearest.x, y: seer.y - nearest.y });
      this.moveToward(seer, this.clampToField({ x: seer.x + away.x * 70, y: seer.y + away.y * 70 }, seer.radius), dt, 4, 0.9);
    }
    if (seer.supportTimer <= 0 && !this.effect(seer, "stun")) {
      const ward = Math.round((this.tideHigh ? 18 : 15) * this.stage.scale);
      const allies = this.livingEnemies()
        .filter((ally) => ally !== seer && unitDist(seer, ally) < 240 && (this.effect(ally, "shield")?.power ?? 0) < ward)
        .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)
        .slice(0, 2);
      if (allies.length) {
        for (const ally of allies) {
          ally.effects = ally.effects.filter((effect) => effect.kind !== "shield");
          ally.effects.push(makeEffect("shield", 6.8, ward, seer));
          this.fx.ring(ally.x, ally.y - 10, ally.radius * 2.35, "#e7d5b6", { width: 3, life: 0.55 });
          this.fx.burst(ally.x, ally.y - 14, "#b9eee5", 5, 48, { glow: true, gravity: -35, life: 0.45 });
        }
        seer.castGlow = 0.55;
        seer.supportTimer = 6.2;
        this.fx.floatText(seer.x, seer.y - seer.radius * 3, this.tideHigh ? "high-tide ward!" : "pearl ward!", "#e7d5b6", 12);
        audio.play("shield");
        return;
      }
      seer.supportTimer = 0.5;
    }
    if (!nearest) return;
    const dist = unitDist(seer, nearest);
    if (dist > seer.stats.range + nearest.radius - 4) {
      this.moveToward(seer, nearest, dt, seer.stats.range + nearest.radius - 12);
    } else if (seer.attackTimer <= 0 && seer.windup <= 0) {
      seer.facing = nearest.x >= seer.x ? 1 : -1;
      this.startAttack(seer, nearest);
    }
  }

  private updateShaman(shaman: Unit, dt: number): void {
    shaman.supportTimer -= dt;
    // drift to stay behind the front line
    const nearest = this.nearestHero(shaman);
    if (nearest && unitDist(shaman, nearest) < 130) {
      const away = this.normalize({ x: shaman.x - nearest.x, y: shaman.y - nearest.y });
      const to = this.clampToField({ x: shaman.x + away.x * 70, y: shaman.y + away.y * 70 }, shaman.radius);
      this.moveToward(shaman, to, dt, 4);
    }

    // Healing is checked on its own cadence. Normal attacks are not: a support
    // unit should keep fighting between checks instead of idling until its next
    // heal is ready.
    if (shaman.supportTimer <= 0) {
      let wounded: Unit | null = null;
      let worst = 0.92;
      for (const ally of this.livingEnemies()) {
        if (ally === shaman) continue;
        const frac = ally.hp / ally.stats.maxHp;
        if (frac < worst && unitDist(shaman, ally) < 260) {
          worst = frac;
          wounded = ally;
        }
      }
      if (wounded) {
        shaman.supportTimer = 2.6;
        shaman.castGlow = 0.4;
        shaman.facing = wounded.x >= shaman.x ? 1 : -1;
        this.projectiles.push({
          x: shaman.x,
          y: shaman.y - 16,
          target: wounded,
          aim: { x: shaman.facing, y: 0 },
          speed: 240,
          damage: 24 * this.stage.scale,
          from: shaman,
          kind: "spark",
          color: "#7de8c9",
          heals: true,
          life: 3,
        });
        audio.play(shaman.enemyKind === "snowhag" ? "hagChant" : "bolt");
        return;
      }
      if (shaman.enemyKind === "snowhag" && nearest && Math.random() < 0.5) {
        // the hag sings the ground to ice beneath your feet
        shaman.supportTimer = 3.2;
        shaman.castGlow = 0.4;
        this.zones.push({ x: nearest.x, y: nearest.y, radius: 58, time: 0, duration: 4.5, kind: "frost", power: 0.35, dps: 0, from: shaman });
        this.fx.ring(nearest.x, nearest.y, 58, "#b8e0f0", { width: 3, life: 0.5 });
        audio.play("frost");
        return;
      }
      shaman.supportTimer = 0.4; // keep glancing for wounded packmates
    }

    if (!nearest) return;
    // Nothing to mend: fight like any other ranged enemy while the next support
    // check counts down.
    const dist = unitDist(shaman, nearest);
    const attackRange = shaman.stats.range + nearest.radius - 4;
    if (dist > attackRange) {
      this.moveToward(shaman, nearest, dt, attackRange - 8);
    } else if (shaman.attackTimer <= 0 && shaman.windup <= 0) {
      shaman.facing = nearest.x >= shaman.x ? 1 : -1;
      this.startAttack(shaman, nearest);
    }
  }

  /** The Bone-Caller drifts behind the line and raises what falls. */
  private updateBonecaller(caller: Unit, dt: number): void {
    caller.supportTimer -= dt;
    const nearest = this.nearestHero(caller);
    if (nearest && unitDist(caller, nearest) < 140) {
      const away = this.normalize({ x: caller.x - nearest.x, y: caller.y - nearest.y });
      const to = this.clampToField({ x: caller.x + away.x * 70, y: caller.y + away.y * 70 }, caller.radius);
      this.moveToward(caller, to, dt, 4);
    }
    if (caller.supportTimer > 0) return;
    const corpse = this.units.find(
      (u) =>
        !u.alive &&
        u.team === "enemy" &&
        u.enemyKind !== "shambler" &&
        !BOSS_KINDS.includes(u.enemyKind ?? "") &&
        u.deathTime < 14 &&
        unitDist(caller, u) < 260,
    );
    if (corpse) {
      caller.castGlow = 0.6;
      caller.supportTimer = 7;
      corpse.deathTime = 99; // the grave gives up its tenant
      this.spawnEnemy("shambler", { x: corpse.x, y: corpse.y });
      const risen = this.units[this.units.length - 1];
      if (risen && risen.enemyKind === "shambler") {
        risen.entered = true;
        risen.alert = 0.5;
      }
      this.fx.burst(corpse.x, corpse.y - 10, "#9a88b8", 14, 110, { glow: true });
      this.fx.ring(corpse.x, corpse.y, 46, "#b8b29a", { width: 3, life: 0.5 });
      this.fx.floatText(caller.x, caller.y - caller.radius * 3 - 6, "RISE", "#b8b29a", 13);
      audio.play("hagChant");
      return;
    }
    // nothing to raise: it fights, grudgingly
    if (nearest) {
      const dist = unitDist(caller, nearest);
      if (dist > caller.stats.range) {
        this.moveToward(caller, nearest, dt, caller.stats.range - 12);
      } else if (caller.attackTimer <= 0) {
        caller.facing = nearest.x >= caller.x ? 1 : -1;
        this.performAttack(caller, nearest);
        caller.attackTimer = this.attackIntervalOf(caller);
      }
    }
  }

  private rimeHail = 5;
  private rimeBreath = 9;

  /** Rimeheart: hail from above, a freezing breath, and a heart that sheds its own armor. */
  /** NEMESIS RULE — the king forbids it: your most-leaned-on spell is sealed for a
   *  while at each phase turn. Ultimates and armor skills are beneath his notice. */
  private forbidSpell(king: Unit): void {
    const counts = Object.entries(this.castCounts).filter(([id]) => !id.startsWith("armor"));
    if (!counts.length) return;
    counts.sort((a, b) => b[1] - a[1]);
    const banned = counts[0][0];
    const def = abilityById(banned);
    let struckAny = false;
    for (const hero of this.livingHeroes()) {
      for (const ab of hero.abilities) {
        if (ab.def.id === banned && !ab.ult) {
          ab.timer = Math.max(ab.timer, 20);
          this.fx.ring(hero.x, hero.y - 10, hero.radius * 2.4, "#b8e0f0", { width: 2.5, life: 0.7 });
          struckAny = true;
        }
      }
    }
    if (struckAny) {
      this.fx.floatText(king.x, king.y - king.radius * 3 - 16, `"${def?.name ?? banned}" IS FORBIDDEN!`, "#b8e0f0", 17);
      audio.play("glacialGroan");
    }
  }

  /** Frozen-lake law, shared by the old king and the Wyrm: statues fall through. */
  private crackStillIce(owner: Unit, dt: number): void {
    for (const hero of this.livingHeroes()) {
      const rec = this.stillness[hero.id] ?? { x: hero.x, y: hero.y, t: 0 };
      if (Math.hypot(hero.x - rec.x, hero.y - rec.y) < 7) {
        rec.t += dt;
        if (rec.t > 2.6) {
          this.telegraphs.push({ x: hero.x, y: hero.y, radius: 55, time: 0, duration: 1.1 * this.warningScale, owner, kind: "sweep" });
          this.fx.floatText(hero.x, hero.y - hero.radius - 26, "the ice cracks!", "#b8e0f0", 12);
          audio.play("frost");
          rec.t = -1.5; // grace after each crack
        }
      } else {
        rec.x = hero.x;
        rec.y = hero.y;
        rec.t = Math.max(0, rec.t - dt);
      }
      this.stillness[hero.id] = rec;
    }
  }

  /** THE WINTER WYRM — the Winterreach's true finale. Solo, no trash: it coils
   *  and breathes, hunts beneath the ice, and bares its heart when it breaches.
   *  The whole fight is learning its rhythm and punishing the open heart. */
  private wyrm: { mode: "coil" | "hunt" | "bared"; t: number; anchor: number; breath: number; slam: number; hunt: number } | null = null;

  private updateWyrm(wyrm: Unit, dt: number): void {
    if (!this.wyrm) {
      this.wyrm = { mode: "coil", t: 0, anchor: Math.random() * Math.PI * 2, breath: 6, slam: 9, hunt: 15 };
      wyrm.trail = [];
    }
    const W = this.wyrm;
    const frac = wyrm.hp / wyrm.stats.maxHp;
    const heroes = this.livingHeroes();
    if (!heroes.length) return;
    const cx = heroes.reduce((a, h) => a + h.x, 0) / heroes.length;
    const cy = heroes.reduce((a, h) => a + h.y, 0) / heroes.length;

    // phase turns: the court's law returns, and the hunts come faster
    if (frac < 0.66 && wyrm.phase < 2) {
      wyrm.phase = 2;
      this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 2.4, "IT REMEMBERS THE COURT'S LAW!", "#b8e0f0", 18);
      this.forbidSpell(wyrm);
      W.hunt = Math.min(W.hunt, 2);
      audio.play("glacialGroan");
    }
    if (frac < 0.33 && wyrm.phase < 3) {
      wyrm.phase = 3;
      wyrm.element = "flame";
      wyrm.elementBuildup = {};
      this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 2.4, "FROSTFIRE UNBOUND · FLAME", "#ff8a70", 20);
      this.fx.ring(wyrm.x, wyrm.y, wyrm.radius * 3.4, ELEMENT_COLORS.flame, { width: 6, life: 0.9 });
      this.fx.burst(wyrm.x, wyrm.y - 14, ELEMENT_COLORS.flame, 26, 190, { glow: true, gravity: -40 });
      wyrm.effects.push(makeEffect("haste", 999, 1.2, null));
      this.forbidSpell(wyrm);
      this.fx.addShake(9);
      audio.play("staggerBreak");
    }
    if (wyrm.phase === 0) wyrm.phase = 1;

    // the body remembers where the head has been
    const trail = (wyrm.trail ??= []);
    const last = trail[0];
    if (!last || Math.hypot(wyrm.x - last.x, wyrm.y - last.y) > 7) {
      trail.unshift({ x: wyrm.x, y: wyrm.y });
      if (trail.length > 30) trail.pop();
    }

    // statues fall through, from the second phase on
    if (wyrm.phase >= 2) this.crackStillIce(wyrm, dt);

    W.t += dt;
    if (W.mode === "bared") {
      // the heart lies bare — the band's window; it does nothing but breathe
      if (W.t >= (wyrm.phase >= 3 ? 3 : 4)) {
        W.mode = "coil";
        W.t = 0;
        W.breath = 4;
        W.slam = 7;
        W.hunt = wyrm.phase >= 3 ? 11 : 15;
        this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 2.4, "it coils again…", "#b8e0f0", 13);
      }
      return;
    }

    if (W.mode === "hunt") {
      // beneath the ice: untouchable, chasing, cracking the lake as it comes
      const prey = this.nearestHero(wyrm);
      if (prey) this.moveToward(wyrm, prey, dt, 10, 1.35);
      if (W.t < 3.5 && Math.floor((W.t - dt) / 0.7) !== Math.floor(W.t / 0.7)) {
        this.telegraphs.push({ x: wyrm.x, y: wyrm.y, radius: 46, time: 0, duration: 1.0 * this.warningScale, owner: wyrm, kind: "sweep" });
        audio.play("frost");
      }
      if (W.t >= 3.5 && W.t - dt < 3.5) {
        // the water goes still — then the lake EXPLODES
        this.telegraphs.push({ x: wyrm.x, y: wyrm.y, radius: 95, time: 0, duration: 1.1 * this.warningScale, owner: wyrm, kind: "sweep" });
        this.fx.floatText(wyrm.x, wyrm.y - 30, "the water stills…", "#dcedf5", 13);
      }
      if (W.t >= 4.7) {
        wyrm.submerged = false;
        W.mode = "bared";
        W.t = 0;
        wyrm.effects.push(makeEffect("vulnerable", wyrm.phase >= 3 ? 3 : 4, 0.5, null));
        this.fx.burst(wyrm.x, wyrm.y - 16, "#dcedf5", 30, 240, { glow: true, gravity: 160 });
        this.fx.burst(wyrm.x, wyrm.y - 10, "#8fb8cc", 18, 170, { gravity: 220 });
        this.fx.ring(wyrm.x, wyrm.y, 120, "#b8e0f0", { width: 6, life: 0.7 });
        this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 3, "ITS HEART LIES BARE!", "#ffe9a3", 20);
        this.fx.addShake(11);
        this.hitstop = Math.max(this.hitstop, 0.1);
        this.zoomPunch = Math.max(this.zoomPunch, 1);
        audio.play("breach");
      }
      return;
    }

    // COIL: it swims a tightening ellipse around the band, biting what it passes
    W.anchor += dt * 0.5;
    const orbit = { x: cx + Math.cos(W.anchor) * 180, y: cy + Math.sin(W.anchor) * 90 };
    this.moveToward(wyrm, this.clampToField(orbit, wyrm.radius), dt, 8, 1.05);
    const bite = heroes.find((h) => unitDist(wyrm, h) < wyrm.stats.range + h.radius);
    if (bite && wyrm.attackTimer <= 0 && wyrm.windup <= 0) this.startAttack(wyrm, bite);

    // BREATH: a sweeping line of frostfire with readable gaps
    W.breath -= dt;
    if (W.breath <= 0 && !this.effect(wyrm, "stun")) {
      W.breath = wyrm.phase >= 3 ? 7 : 9;
      const across = Math.random() < 0.5;
      for (let i = 0; i < 5; i++) {
        const fx2 = across ? this.field.left + 70 + i * ((this.field.right - this.field.left - 140) / 4) : cx + (i - 2) * 15;
        const fy = across ? cy + (i % 2 === 0 ? -18 : 26) : this.field.top + 24 + i * ((this.field.bottom - this.field.top - 48) / 4);
        this.telegraphs.push({ x: fx2, y: fy, radius: 56, time: 0, duration: this.telegraphTime * 0.8 + i * 0.32, owner: wyrm, kind: "sweep" });
      }
      this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 2.4, "it draws breath—", "#b8e0f0", 14);
      audio.play("glacialGroan");
    }
    // TAIL: one hard promise on a single head
    W.slam -= dt;
    if (W.slam <= 0 && !this.effect(wyrm, "stun")) {
      W.slam = 8;
      const prey = heroes[Math.floor(Math.random() * heroes.length)];
      this.telegraphs.push({ x: prey.x, y: prey.y, radius: 60, time: 0, duration: this.telegraphTime, owner: wyrm, kind: "sweep" });
      audio.play("warcry");
    }
    // THE HUNT BENEATH: it slips under and the lake goes quiet — from the very
    // first phase, so the fight teaches its central rhythm early
    {
      W.hunt -= dt;
      if (W.hunt <= 0 && !this.effect(wyrm, "stun")) {
        W.mode = "hunt";
        W.t = 0;
        wyrm.submerged = true;
        this.fx.burst(wyrm.x, wyrm.y - 8, "#b8e0f0", 20, 160, { gravity: 200 });
        this.fx.ring(wyrm.x, wyrm.y, 90, "#8fb8cc", { width: 4, life: 0.6 });
        this.fx.floatText(wyrm.x, wyrm.y - wyrm.radius * 2.4, "IT GOES BENEATH!", "#b8e0f0", 17);
        this.fx.addShake(7);
        audio.play("glacialGroan");
      }
    }
  }

  /** The Bell Widow conducts the whole field. Two lanes drown on each toll; the
   *  untouched lane is a playable answer. Reach it together and the clapper is
   *  checked, leaving her exposed. Anyone caught outside is silenced, and from
   *  phase two onward the failed rite calls another drowned attendant. */
  private updateBellWidow(widow: Unit, dt: number): boolean {
    const frac = widow.hp / widow.stats.maxHp;
    if (widow.phase === 0) {
      widow.phase = 1;
      this.widowToll = 3.8;
      this.fx.floatText(widow.x, widow.y - widow.radius * 3, "THE BELL REMEMBERS", "#d5bd80", 18);
    }
    if (frac < 0.66 && widow.phase < 2) {
      widow.phase = 2;
      this.spawnEnemy("bellkeeper");
      this.spawnEnemy("conchseer");
      this.widowToll = Math.min(this.widowToll, 2.2);
      this.fx.ring(widow.x, widow.y, 190, "#b9e4df", { width: 5, life: 0.8 });
      this.fx.floatText(widow.x, widow.y - widow.radius * 3, "THE DROWNED ANSWER!", "#b9e4df", 19);
      audio.play("warcry");
    }
    if (frac < 0.33 && widow.phase < 3) {
      widow.phase = 3;
      widow.stats.armor = Math.max(0.04, widow.stats.armor - 0.12);
      widow.effects.push(makeEffect("haste", 999, 1.22, null));
      this.bossStaggerMax = Math.round(this.bossStaggerMax * 0.78);
      this.widowToll = Math.min(this.widowToll, 1.2);
      this.fx.floatText(widow.x, widow.y - widow.radius * 3, "THE LAST TOLL!", "#ffcf76", 21);
      this.fx.addShake(9);
      audio.play("staggerBreak");
    }

    if (this.widowRite) {
      const rite = this.widowRite;
      rite.time += dt;
      // drawBellWidow reads castGlow for the clapper swing. Refreshing it keeps
      // the whole warning visibly in motion; the impact below snaps it to one.
      widow.castGlow = Math.max(widow.castGlow, 0.72);
      if (rite.time < rite.duration) return true;

      widow.castGlow = 1;
      const heroes = this.livingHeroes();
      const caught = heroes.filter((hero) => Math.abs(hero.y - rite.safeY) > rite.halfWidth);
      if (caught.length === 0 && heroes.length > 0) {
        widow.effects.push(makeEffect("stun", 1.45, 1, null));
        widow.effects.push(makeEffect("vulnerable", 3.1, 0.34, null));
        this.bossStagger += this.bossStaggerMax * 0.28;
        this.fx.floatText(widow.x, widow.y - widow.radius * 3, "THE TOLL FALLS SILENT!", "#ffe9a3", 19);
        this.fx.ring(widow.x, widow.y, 175, "#ffe9a3", { width: 6, life: 0.75 });
        if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(widow);
        audio.play("staggerBreak");
      } else {
        const silenceTime = widow.phase >= 3 ? 3.4 : 2.6;
        for (const hero of caught) {
          hero.effects.push(makeEffect("silence", silenceTime, 1, widow));
          hero.effects.push(makeEffect("slow", 1.8, 0.28, widow));
          this.fx.floatText(hero.x, hero.y - hero.radius - 24, "SILENCED", "#d5bd80", 12);
        }
        const attendants = this.livingEnemies().filter((unit) => unit !== widow).length;
        if (widow.phase >= 2 && attendants < 4) {
          const summon = widow.phase >= 3 && this.widowTollCount % 2 === 0 ? "bellkeeper" : "kelpbound";
          this.spawnEnemy(summon);
          this.fx.floatText(widow.x, widow.y - widow.radius * 3, "THE FLOOD-BELL ANSWERS!", "#b9e4df", 15);
        }
      }
      this.widowRite = null;
      return true;
    }

    this.widowToll -= dt;
    if (this.widowToll > 0 || this.effect(widow, "stun")) return false;
    this.widowToll = widow.phase >= 3 ? 6.2 : widow.phase >= 2 ? 7.5 : 9;
    this.widowTollCount++;
    const span = this.field.bottom - this.field.top;
    const laneCenters = [1 / 6, 0.5, 5 / 6];
    // The safe lane rotates instead of rerolling, so the rite can be learned.
    const safeLane = (this.widowTollCount + widow.phase - 1) % 3;
    const safeY = this.field.top + span * laneCenters[safeLane];
    const duration = this.telegraphTime + 0.7;
    this.widowRite = { safeLane, safeY, halfWidth: Math.max(38, span / 6 - 8), time: 0, duration };
    for (let lane = 0; lane < 3; lane++) {
      if (lane === safeLane) continue;
      const y = this.field.top + span * laneCenters[lane];
      for (let x = this.field.left + 66; x < this.field.right; x += 132) {
        this.telegraphs.push({ x, y, radius: 68, time: 0, duration, owner: widow, kind: "sweep" });
      }
    }
    const laneName = safeLane === 0 ? "UPPER" : safeLane === 1 ? "MIDDLE" : "LOWER";
    widow.castGlow = 0.95;
    this.fx.floatText(this.field.left + 210, safeY - 26, `${laneName} LANE — SILENCE`, "#b9e4df", 14);
    this.fx.ring(widow.x, widow.y, 150, "#d5bd80", { width: 5, life: 0.7 });
    audio.play("glacialGroan");
    return true;
  }

  /** Stormjaw is a tide rhythm, not another summoner. Reef plates close at
   *  high water; marked lightning can crack them. Its undertow pulls the band
   *  toward a promised breach, and dodging the jaws earns the longest heart
   *  window. */
  private updateStormjaw(jaw: Unit, dt: number): boolean {
    const frac = jaw.hp / jaw.stats.maxHp;
    if (jaw.phase === 0 || !this.jawCycle) {
      jaw.phase = 1;
      this.jawCycle = { mode: "reef", time: 0, nextBreach: 5.5, nextLightning: 7, tideWasHigh: this.tideHigh, target: null };
      this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "THE COAST WAKES", "#9edbd5", 20);
    }
    const cycle = this.jawCycle;
    if (frac < 0.68 && jaw.phase < 2) {
      jaw.phase = 2;
      this.spawnEnemy("reefhound");
      this.spawnEnemy("stormeel");
      jaw.stats.damage *= 1.1;
      cycle.nextBreach = Math.min(cycle.nextBreach, 2.2);
      cycle.nextLightning = Math.min(cycle.nextLightning, 1.2);
      this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "BREAKERS, RISE!", "#9edbd5", 20);
      this.fx.addShake(10);
      audio.play("breach");
    }
    if (frac < 0.34 && jaw.phase < 3) {
      jaw.phase = 3;
      jaw.stats.armor = Math.max(0.05, jaw.stats.armor - 0.14);
      jaw.effects = jaw.effects.filter((effect) => !(effect.kind === "guard" && effect.source === jaw));
      jaw.effects.push(makeEffect("haste", 999, 1.3, null));
      cycle.nextBreach = Math.min(cycle.nextBreach, 0.8);
      cycle.nextLightning = Math.min(cycle.nextLightning, 1.5);
      this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "THE HEART SURFACES!", "#ffe9a3", 21);
      audio.play("staggerBreak");
    }

    // High tide closes the reef shell. Low tide opens it again; phase three has
    // already torn the plates off and never regains this protection.
    if (jaw.phase < 3 && this.tideHigh) {
      const plate = jaw.effects.find((effect) => effect.kind === "guard" && effect.source === jaw);
      if (plate) plate.time = Math.max(plate.time, 0.3);
      else jaw.effects.push(makeEffect("guard", 0.3, 0.24, jaw));
      if (!cycle.tideWasHigh) this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "REEF PLATES CLOSE", "#9edbd5", 13);
    } else {
      jaw.effects = jaw.effects.filter((effect) => !(effect.kind === "guard" && effect.source === jaw));
      if (cycle.tideWasHigh && jaw.phase < 3) {
        jaw.effects.push(makeEffect("vulnerable", 1.4, 0.16, null));
        this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "LOW TIDE — PLATES OPEN", "#ffe9a3", 13);
      }
    }
    cycle.tideWasHigh = this.tideHigh;

    if (cycle.mode === "exposed") {
      cycle.time += dt;
      jaw.castGlow = Math.max(jaw.castGlow, 0.5);
      if (cycle.time >= (jaw.phase >= 3 ? 2.8 : 3.4)) {
        cycle.mode = "reef";
        cycle.time = 0;
        cycle.nextBreach = jaw.phase >= 3 ? 4.8 : jaw.phase >= 2 ? 6.5 : 8;
        this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "THE REEF SEALS", "#9edbd5", 13);
      }
      return true;
    }

    if (cycle.mode === "breach") {
      cycle.time += dt;
      jaw.castGlow = Math.max(jaw.castGlow, 0.82);
      if (cycle.target) this.moveToward(jaw, cycle.target, dt, 14, 1.75);
      // updateTelegraphs normally ends this mode. This fallback prevents an
      // interrupted or externally-cleared mark from trapping the boss forever.
      if (cycle.time > this.telegraphTime + 1.35 && !this.telegraphs.some((mark) => mark.owner === jaw && mark.kind === "sweep" && mark.radius >= 110)) {
        this.finishStormjawBreach(jaw, 0);
      }
      return true;
    }

    if (cycle.mode === "undertow") {
      cycle.time += dt;
      jaw.castGlow = Math.max(jaw.castGlow, 0.65);
      const pull = (this.tideHigh ? 52 : 36) * (jaw.phase >= 3 ? 1.12 : 1);
      for (const hero of this.livingHeroes()) {
        const dx = jaw.x - hero.x;
        const dy = jaw.y - hero.y;
        const len = Math.hypot(dx, dy) || 1;
        hero.x += (dx / len) * pull * dt;
        hero.y += (dy / len) * pull * dt;
        const clamped = this.clampToField(hero, hero.radius);
        hero.x = clamped.x;
        hero.y = clamped.y;
      }
      if (Math.floor((cycle.time - dt) * 2) !== Math.floor(cycle.time * 2)) {
        this.fx.ring(jaw.x, jaw.y, 210 - Math.min(120, cycle.time * 42), "#76c9cc", { width: 4, life: 0.45 });
      }
      if (cycle.time >= (jaw.phase >= 3 ? 1.65 : 2.05)) {
        const heroes = this.livingHeroes();
        if (!heroes.length) return true;
        const target = this.clampToField({
          x: heroes.reduce((sum, hero) => sum + hero.x, 0) / heroes.length,
          y: heroes.reduce((sum, hero) => sum + hero.y, 0) / heroes.length,
        }, 105);
        cycle.mode = "breach";
        cycle.time = 0;
        cycle.target = target;
        const duration = this.telegraphTime + (jaw.phase >= 3 ? 0.1 : 0.35);
        this.telegraphs.push({ x: target.x, y: target.y, radius: 118, time: 0, duration, owner: jaw, kind: "sweep" });
        this.fx.floatText(target.x, target.y - 40, "THE JAWS BREACH HERE", "#b9f4ff", 15);
        audio.play("breach");
      }
      return true;
    }

    cycle.nextBreach -= dt;
    cycle.nextLightning -= dt;
    if (
      jaw.phase >= 2 &&
      cycle.nextLightning <= 0 &&
      !this.effect(jaw, "stun") &&
      !this.telegraphs.some((mark) => mark.kind === "lightning" && mark.owner === jaw)
    ) {
      cycle.nextLightning = jaw.phase >= 3 ? 6.8 : 9;
      const heroes = this.livingHeroes();
      // Only heroes are marked. Carrying the warning circle back over Stormjaw
      // is the counterplay; the boss no longer gifts itself a free strike.
      const marked = heroes
        .slice()
        .sort((a, b) => unitDist(jaw, a) - unitDist(jaw, b))
        .slice(0, jaw.phase >= 3 ? Math.min(2, heroes.length) : 1);
      for (const hero of marked) {
        this.telegraphs.push({ x: hero.x, y: hero.y, radius: 72, time: 0, duration: 2.55 * this.warningScale, owner: jaw, kind: "lightning", follow: hero });
        this.fx.floatText(hero.x, hero.y - hero.radius - 27, "MARKED — BAIT THE SKY", "#b9f4ff", 12);
      }
      jaw.castGlow = 0.9;
      audio.play("glacialGroan");
    }
    if (cycle.nextBreach <= 0 && !this.effect(jaw, "stun")) {
      cycle.mode = "undertow";
      cycle.time = 0;
      cycle.target = null;
      this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, "UNDERTOW — BREAK FROM THE JAWS!", "#9edbd5", 16);
      this.fx.ring(jaw.x, jaw.y, 220, "#76c9cc", { width: 5, life: 0.7 });
      audio.play("warcry");
      return true;
    }
    return false;
  }

  private finishStormjawBreach(jaw: Unit, struck: number): void {
    const cycle = this.jawCycle;
    if (!cycle || cycle.mode !== "breach") return;
    cycle.mode = "exposed";
    cycle.time = 0;
    cycle.target = null;
    const cleanDodge = struck === 0;
    const window = cleanDodge ? 4.2 : 3;
    jaw.effects.push(makeEffect("vulnerable", window, cleanDodge ? 0.48 : 0.28, null));
    this.bossStagger += this.bossStaggerMax * (cleanDodge ? 0.34 : 0.12);
    jaw.castGlow = 1;
    this.fx.floatText(jaw.x, jaw.y - jaw.radius * 3, cleanDodge ? "JAWS MISS — HEART EXPOSED!" : "THE HEART SURFACES!", "#ffe9a3", 19);
    this.fx.ring(jaw.x, jaw.y, 165, "#ffe9a3", { width: 6, life: 0.7 });
    if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(jaw);
    audio.play("staggerBreak");
  }

  private updateRimeheart(king: Unit, dt: number): void {
    const frac = king.hp / king.stats.maxHp;
    if (king.phase === 0) {
      king.phase = 1;
      this.rimeHail = 5;
      this.rimeBreath = 9;
    }
    if (frac < 0.66 && king.phase < 2) {
      king.phase = 2;
      this.fx.floatText(king.x, king.y - king.radius * 3, "THE LONG BREATH!", "#b8e0f0", 18);
      audio.play("howl");
      this.forbidSpell(king);
    }
    if (frac < 0.33 && king.phase < 3) {
      king.phase = 3;
      // the king sheds his own armor to fight unbound — faster, harder, softer
      king.stats.armor = 0.05;
      king.stats.damage *= 1.3;
      king.effects.push(makeEffect("haste", 999, 1.25, null));
      this.bossStaggerMax = Math.round(this.bossStaggerMax * 0.7);
      this.fx.floatText(king.x, king.y - king.radius * 3, "THE HEART SHATTERS!", "#ff8a70", 20);
      this.fx.burst(king.x, king.y - 20, "#d8f0f8", 26, 220, { glow: true, gravity: 160 });
      this.fx.addShake(10);
      this.hitstop = Math.max(this.hitstop, 0.1);
      audio.play("staggerBreak");
      this.forbidSpell(king);
    }
    // NEMESIS RULE — the cracking ice (phase 2+): stand still too long and the
    // lake opens under you. The court allows no statues.
    if (king.phase >= 2) this.crackStillIce(king, dt);
    // HAIL: ice falls where heroes stand
    this.rimeHail -= dt;
    if (this.rimeHail <= 0 && !this.effect(king, "stun")) {
      this.rimeHail = king.phase >= 3 ? 6.5 : 8.5;
      const heroes = this.livingHeroes();
      for (let i = 0; i < Math.min(2, heroes.length); i++) {
        const target = heroes[(i * 2 + Math.floor(this.time)) % heroes.length];
        this.telegraphs.push({ x: target.x, y: target.y, radius: 50, time: 0, duration: this.telegraphTime, owner: king, kind: "sweep" });
      }
      this.fx.floatText(king.x, king.y - king.radius * 3, "calls the hail!", "#b8e0f0", 13);
      audio.play("warcry");
    }
    // THE LONG BREATH (phase 2+): frost creeps across the field, and winter answers
    if (king.phase >= 2) {
      this.rimeBreath -= dt;
      if (this.rimeBreath <= 0 && !this.effect(king, "stun")) {
        this.rimeBreath = 14;
        const near = this.nearestHero(king);
        if (near) {
          const dx = near.x - king.x;
          const dy = near.y - king.y;
          const len = Math.hypot(dx, dy) || 1;
          for (let i = 1; i <= 3; i++) {
            this.zones.push({
              x: this.clampToField({ x: king.x + (dx / len) * i * 95, y: king.y + (dy / len) * i * 95 }, 0).x,
              y: this.clampToField({ x: king.x + (dx / len) * i * 95, y: king.y + (dy / len) * i * 95 }, 0).y,
              radius: 62,
              time: 0,
              duration: 6,
              kind: "frost",
              power: 0.4,
              dps: 0,
              from: king,
            });
          }
        }
        this.spawnEnemy("icewisp");
        this.spawnEnemy("icewisp");
        this.fx.ring(king.x, king.y, 180, "#b8e0f0", { width: 5, life: 0.8 });
        audio.play("frost");
      }
    }
  }

  /** The Alpha of Thornwood: pounce telegraphs, a howl phase, and exhaustion windows. */
  private updateAlpha(alpha: Unit, dt: number): void {
    const frac = alpha.hp / alpha.stats.maxHp;
    const phase = frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
    if (phase >= 2 && alpha.phase < 2) {
      // the howl: summon the pack, learn to bleed
      alpha.phase = 2;
      this.fx.ring(alpha.x, alpha.y, 220, "#c9c2e8", { width: 5, life: 0.8 });
      this.fx.addShake(8);
      audio.play("howl");
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "AWOOOO!", "#c9c2e8", 20);
      for (let i = 0; i < 3; i++) this.spawnEnemy("wolf");
      alpha.supportTimer = 2.5;
    }
    if (phase === 3 && alpha.phase < 3) {
      alpha.phase = 3;
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "THE MOONLIGHT HUNT!", "#c9c2e8", 20);
      alpha.supportTimer = Math.min(alpha.supportTimer, 1.2);
      this.fx.ring(alpha.x, alpha.y, 200, "#ff8a70", { width: 4, life: 0.7 });
      this.fx.ring(alpha.x, alpha.y, 260, "#c9c2e8", { width: 3, life: 0.9 });
      audio.play("howl");
      for (let i = 0; i < 2; i++) this.spawnEnemy("wolf");
      // set-piece: it leaves the field and falls on you three times from the dark
      this.moonHunt = { remaining: 3, whiffs: 0, cool: 1.0 };
    }
    if (alpha.phase === 0) alpha.phase = 1;

    // THE MOONLIGHT HUNT: a pure dodge sequence — survive it, or better, embarrass it
    if (this.moonHunt) {
      const hunt = this.moonHunt;
      if (!alpha.leap && !this.telegraphs.some((t) => t.owner === alpha)) {
        if (hunt.remaining <= 0) {
          this.moonHunt = null;
          if (hunt.whiffs >= 3) {
            // it caught nothing but snow — utterly spent
            alpha.effects.push(makeEffect("stun", 3.2, 1, null));
            alpha.effects.push(makeEffect("vulnerable", 3.2, 0.6, null));
            this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "THE HUNT FAILS!", "#ffe9a3", 20);
            this.bossStagger += this.bossStaggerMax * 0.5;
            if (this.bossStagger >= this.bossStaggerMax && alpha === this.bossRef) this.staggerBoss(alpha);
            audio.play("staggerBreak");
          } else {
            alpha.effects.push(makeEffect("stun", 1.2, 1, null));
            this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "winded…", "#c9c2e8", 14);
          }
          alpha.supportTimer = 5;
        } else {
          hunt.cool -= dt;
          if (hunt.cool <= 0) {
            // vanish to the treeline, then fall out of the dark
            alpha.x = this.field.right + 160;
            alpha.y = this.field.top + Math.random() * (this.field.bottom - this.field.top);
            const heroes = this.livingHeroes();
            if (heroes.length) {
              const prey = heroes[Math.floor(Math.random() * heroes.length)];
              this.telegraphs.push({
                x: prey.x,
                y: prey.y,
                radius: 62,
                time: 0,
                duration: this.telegraphTime * 0.75,
                owner: alpha,
                kind: "pounce",
              });
              audio.play("hiss");
            }
            hunt.remaining--;
            hunt.cool = 0.5;
          }
        }
      }
      return; // the hunt owns the wolf entirely
    }

    // pounce cadence: supportTimer doubles as the pounce clock
    alpha.supportTimer -= dt;
    const pending = this.telegraphs.find((t) => t.owner === alpha);
    if (!pending && alpha.supportTimer <= 0 && !this.effect(alpha, "stun")) {
      // the pounce hunts unpredictably — anyone can be marked
      const heroes = this.livingHeroes();
      if (heroes.length) {
        const target = heroes[Math.floor(Math.random() * heroes.length)];
        this.telegraphs.push({
          x: target.x,
          y: target.y,
          radius: 62,
          time: 0,
          duration: this.telegraphTime,
          owner: alpha,
          kind: "pounce",
        });
        audio.play("warcry");
        alpha.supportTimer = alpha.phase === 3 ? 3.2 : 6.2;
      }
    }

    // DEVOUR: between pounces it feeds on the fallen pack unless you deny it
    if (alpha.phase >= 2 && alpha.hp < alpha.stats.maxHp * 0.9 && !alpha.leap && alpha.supportTimer > 2.5) {
      const corpse = this.units.find(
        (u) => !u.alive && u.team === "enemy" && u.enemyKind === "wolf" && u.deathTime < 6 && unitDist(alpha, u) < 400,
      );
      if (corpse) {
        if (unitDist(alpha, corpse) > 30) {
          this.moveToward(alpha, corpse, dt, 24, 1.1);
          return;
        }
        alpha.castGlow = 0.4;
        this.heal(alpha, alpha.stats.maxHp * 0.045 * dt, false, null);
        if (Math.floor((this.time - dt) * 2) !== Math.floor(this.time * 2)) {
          this.fx.floatText(alpha.x, alpha.y - alpha.radius * 2.6, "devouring…", "#ff8a70", 12);
          this.fx.burst(corpse.x, corpse.y - 8, "#c9c2b8", 3, 50, { gravity: 60 });
        }
        corpse.deathTime += dt * 3; // the body goes fast
        return;
      }
    }
    // NEMESIS RULE — the pack has no master: while TWO or more packmates live the
    // Alpha cannot be taunted, and it hunts whoever your line protects least. Thin
    // the pack, or your tank means nothing to it.
    const packCount = this.livingEnemies().filter((u) => u !== alpha && (u.enemyKind === "wolf" || u.enemyKind === "frostwolf")).length;
    const packRules = packCount >= 2;
    const taunt = packRules ? undefined : this.effect(alpha, "taunt");
    if (packRules && this.effect(alpha, "taunt") && Math.floor((this.time - dt) * 0.4) !== Math.floor(this.time * 0.4)) {
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "the pack has no master!", "#c9c2e8", 12);
    }
    let target: Unit | null = taunt && taunt.source && taunt.source.alive ? taunt.source : null;
    if (!target && packRules) {
      // it slips past the shield and goes for the soft — but commits to a hunt
      // for a few breaths rather than flickering between prey
      this.alphaPick -= dt;
      if (this.alphaPick <= 0 || !this.alphaPrey || !this.alphaPrey.alive) {
        this.alphaPick = 4;
        let low = Infinity;
        for (const h of this.livingHeroes()) {
          const v = this.threat[h.id] ?? 0;
          if (v < low) {
            low = v;
            this.alphaPrey = h;
          }
        }
        // the hunted one is TOLD — get them moving
        if (this.alphaPrey) {
          this.fx.floatText(this.alphaPrey.x, this.alphaPrey.y - this.alphaPrey.radius - 28, "the Alpha's eyes find you!", "#c9c2e8", 12);
          this.fx.ring(this.alphaPrey.x, this.alphaPrey.y, this.alphaPrey.radius * 2.6, "#c9c2e8", { width: 2.5, life: 0.8 });
          audio.play("hiss");
        }
      }
      target = this.alphaPrey;
      // a stalk, not a sprint — the soft target can run, and the pack can be thinned
      if (target) {
        alpha.aggro = target;
        const dist = unitDist(alpha, target);
        if (dist > alpha.stats.range + target.radius - 4) {
          this.moveToward(alpha, target, dt, alpha.stats.range + target.radius - 8, 0.8);
          return;
        }
        alpha.facing = target.x >= alpha.x ? 1 : -1;
        if (alpha.attackTimer <= 0 && alpha.windup <= 0) this.startAttack(alpha, target);
        return;
      }
    }
    if (!target) target = this.topThreat(alpha.aggro && alpha.aggro.alive ? alpha.aggro : null);
    if (!target && alpha.aggro && alpha.aggro.alive) target = alpha.aggro;
    if (!target) target = this.nearestFighter(alpha);
    if (!target) return;
    alpha.aggro = target;
    const dist = unitDist(alpha, target);
    if (dist > alpha.stats.range + target.radius - 4) {
      // blood scent: wounded prey makes it run
      this.moveToward(alpha, target, dt, alpha.stats.range + target.radius - 8, target.hp < target.stats.maxHp * 0.4 ? 1.3 : 1);
      return;
    }
    alpha.facing = target.x >= alpha.x ? 1 : -1;
    if (alpha.attackTimer <= 0 && alpha.windup <= 0) {
      this.startAttack(alpha, target);
    }
  }

  /** Below half health the ogre enrages: faster and angrier, but it still fights
   *  whoever hurts it most — threat and taunts steer it, not the healer's hp bar. */
  private updateOgreRage(ogre: Unit, _dt: number): void {
    const frac = ogre.hp / ogre.stats.maxHp;
    // SET-PIECE @66%: he rips the wrecked cart loose and drags it across the
    // field in three sweeping lanes — readable gaps, if you move NOW
    if (frac < 0.66 && !this.ogreCart) {
      this.ogreCart = true;
      this.fx.floatText(ogre.x, ogre.y - ogre.radius * 3, "RIPS THE CART LOOSE!", "#ffb4a0", 18);
      this.fx.addShake(8);
      audio.play("roar");
      const top = this.field.top;
      const span = this.field.bottom - top;
      [0.18, 0.52, 0.86].forEach((fr, i) => {
        this.telegraphs.push({
          x: this.field.left + 190 + i * 150,
          y: top + span * fr,
          radius: 95,
          time: 0,
          duration: this.telegraphTime + 0.5 + i * 0.7,
          owner: ogre,
          kind: "sweep",
        });
      });
    }
    // SET-PIECE @33%: the belly-flop — a huge promise, and a huge mistake to miss
    if (frac < 0.33 && !this.ogreFlop) {
      this.ogreFlop = true;
      const heroes = this.livingHeroes();
      if (heroes.length) {
        const cx = heroes.reduce((a, h) => a + h.x, 0) / heroes.length;
        const cy = heroes.reduce((a, h) => a + h.y, 0) / heroes.length;
        const at = this.clampToField({ x: cx, y: cy }, 40);
        this.telegraphs.push({ x: at.x, y: at.y, radius: 150, time: 0, duration: this.telegraphTime + 0.9, owner: ogre, kind: "sweep" });
        this.fx.floatText(ogre.x, ogre.y - ogre.radius * 3, "HE LEAPS!", "#ff8a70", 20);
        audio.play("roar");
      }
    }
    if (frac < 0.55 && ogre.phase === 0) {
      ogre.phase = 1;
      ogre.effects.push(makeEffect("haste", 999, 1.5, null));
      this.fx.floatText(ogre.x, ogre.y - ogre.radius * 3, "ENRAGED!", "#ff8a70", 20);
      this.fx.ring(ogre.x, ogre.y, 150, "#ff8a70", { width: 5, life: 0.7 });
      this.fx.addShake(9);
      this.hitstop = Math.max(this.hitstop, 0.09);
      audio.play("roar");
    }
  }

  /** The ogre's favorite trick: snatch a hero and lumber off to eat them.
      Hurt it hard enough and it drops the prize, staggered — dawdle and it bites. */
  private updateOgreGrab(ogre: Unit, dt: number): boolean {
    if (this.carry && this.carry.ogre === ogre) {
      const c = this.carry;
      c.t += dt;
      this.moveToward(ogre, { x: this.field.right - 50, y: ogre.y }, dt, 8, 0.55);
      c.hero.x = ogre.x + ogre.facing * ogre.radius * 0.8;
      c.hero.y = ogre.y - 8;
      c.hero.moveTarget = null;
      if (c.hurt >= ogre.stats.maxHp * 0.07) {
        this.releaseCarry(true);
      } else if (c.t >= 5) {
        this.damage(c.hero, Math.round(c.hero.stats.maxHp * 0.25), ogre, { color: "#ff8a70" });
        this.fx.floatText(ogre.x, ogre.y - ogre.radius * 3 - 10, "CRUNCH", "#ff8a70", 18);
        this.releaseCarry(false);
      }
      return true;
    }
    ogre.supportTimer -= dt;
    if (ogre.supportTimer > 0 || this.carry) return false;
    const prey = this.nearestHero(ogre);
    if (prey && unitDist(ogre, prey) < ogre.radius + prey.radius + 26) {
      this.carry = { ogre, hero: prey, t: 0, hurt: 0 };
      prey.effects.push(makeEffect("stun", 8, 1, ogre));
      prey.attackTarget = null;
      prey.healTarget = null;
      ogre.supportTimer = 15;
      this.fx.floatText(prey.x, prey.y - prey.radius - 24, "GRABBED!", "#ffd76b", 16);
      this.fx.addShake(5);
      audio.play("roar");
      return true;
    }
    return false;
  }

  private releaseCarry(broken: boolean): void {
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    c.hero.effects = c.hero.effects.filter((e) => !(e.kind === "stun" && e.source === c.ogre));
    if (broken && c.ogre.alive) {
      c.ogre.effects.push(makeEffect("stun", 2, 1, null));
      c.ogre.effects.push(makeEffect("vulnerable", 3, 0.25, null));
      this.fx.floatText(c.ogre.x, c.ogre.y - c.ogre.radius * 3, "DROPPED!", "#ffd76b", 16);
      this.fx.ring(c.ogre.x, c.ogre.y, 90, "#ffd76b", { width: 4, life: 0.5 });
      audio.play("staggerBreak");
    }
  }

  /** The warlord telegraphs a huge executioner's sweep at the thickest hero
   *  cluster — spread out, or Blink clear of it. */
  private warlordWall = 6; // seconds until the next shieldwall stance
  private warlordThrow = 4; // seconds until the next hurled axe (phase 2+)

  private updateWarlordSweep(lord: Unit, dt: number): void {
    if (lord.phase === 0) {
      lord.phase = 1;
      lord.supportTimer = 5;
      this.warlordWall = 6;
      this.warlordThrow = 4;
    }
    const frac = lord.hp / lord.stats.maxHp;
    // PHASE 2 — the hollow answers: reinforcements, and he starts throwing
    if (frac < 0.66 && lord.phase < 2) {
      lord.phase = 2;
      this.fx.floatText(lord.x, lord.y - lord.radius * 3, "THE HOLLOW ANSWERS!", "#ff8a70", 18);
      this.fx.ring(lord.x, lord.y, 200, "#ff8a70", { width: 5, life: 0.8 });
      this.fx.addShake(8);
      audio.play("warhorn");
      this.spawnEnemy("goblin");
      this.spawnEnemy("archer");
    }
    // PHASE 3 — no quarter: faster, angrier, and melee blows are answered.
    // SET-PIECE: he plants the war banner — smash it or fight his whole rage
    if (frac < 0.33 && lord.phase < 3) {
      lord.phase = 3;
      this.fx.floatText(lord.x, lord.y - lord.radius * 3, "NO QUARTER!", "#ff5a48", 20);
      lord.effects.push(makeEffect("haste", 999, 1.25, null));
      this.fx.addShake(9);
      this.hitstop = Math.max(this.hitstop, 0.09);
      audio.play("roar");
      if (!this.bannerPlanted) {
        this.bannerPlanted = true;
        const at = this.clampToField({ x: lord.x + 70, y: lord.y }, 16);
        this.spawnEnemy("warbanner", { x: at.x, y: at.y });
        this.fx.floatText(at.x, at.y - 40, "PLANTS THE WAR BANNER!", "#ff8a70", 16);
        this.fx.ring(at.x, at.y, 220, "#9a2f28", { width: 4, life: 0.8 });
        audio.play("warhorn");
      }
    }
    // NEMESIS RULE — the warlord's discipline: bunch up for long and he calls a
    // volley down on the cluster. Spread, or eat axes together.
    const disciplined = this.livingHeroes();
    const clustered = disciplined.filter((h) => disciplined.some((o) => o !== h && Math.hypot(o.x - h.x, o.y - h.y) < 70));
    this.clusterCool -= dt;
    if (clustered.length >= 2) this.clusterTime += dt;
    else this.clusterTime = Math.max(0, this.clusterTime - dt * 2);
    if (this.clusterTime > 3 && this.clusterCool <= 0 && !this.effect(lord, "stun")) {
      this.clusterCool = 9;
      this.clusterTime = 0;
      for (const h of clustered.slice(0, 3)) {
        this.telegraphs.push({ x: h.x, y: h.y, radius: 48, time: 0, duration: this.telegraphTime * 0.9, owner: lord, kind: "sweep" });
      }
      this.fx.floatText(lord.x, lord.y - lord.radius * 3, "SCATTER!", "#ffb4a0", 17);
      audio.play("warhorn");
    }
    // SHIELDWALL: he plants and weathers the storm — hold your burst
    this.warlordWall -= dt;
    if (this.warlordWall <= 0 && !this.effect(lord, "stun")) {
      this.warlordWall = 14;
      lord.effects.push(makeEffect("guard", 2.2, 0.45, null));
      this.fx.floatText(lord.x, lord.y - lord.radius * 3, "SHIELDWALL!", "#c9d2dd", 15);
      this.fx.ring(lord.x, lord.y, lord.radius * 3, "#c9d2dd", { width: 4, life: 0.5 });
      audio.play("shield");
    }
    // THE HURLED AXE (phase 2+): the back line is not safe either
    if (lord.phase >= 2) {
      this.warlordThrow -= dt;
      if (this.warlordThrow <= 0 && !this.effect(lord, "stun")) {
        this.warlordThrow = lord.phase >= 3 ? 8 : 11;
        let far: Unit | null = null;
        let fd = -1;
        for (const h of this.livingHeroes()) {
          const d = unitDist(lord, h);
          if (d > fd) {
            fd = d;
            far = h;
          }
        }
        if (far) {
          this.telegraphs.push({ x: far.x, y: far.y, radius: 52, time: 0, duration: this.telegraphTime, owner: lord, kind: "sweep" });
          this.fx.floatText(lord.x, lord.y - lord.radius * 3, "hurls his axe!", "#ffb4a0", 13);
          audio.play("shoot");
        }
      }
    }
    lord.supportTimer -= dt;
    const pending = this.telegraphs.find((t) => t.owner === lord);
    if (!pending && lord.supportTimer <= 0 && !this.effect(lord, "stun")) {
      const heroes = this.livingHeroes();
      if (!heroes.length) return;
      let best = heroes[0];
      let bestN = 0;
      for (const h of heroes) {
        const n = heroes.filter((o) => Math.hypot(o.x - h.x, o.y - h.y) < 120).length;
        if (n > bestN) {
          bestN = n;
          best = h;
        }
      }
      this.telegraphs.push({
        x: best.x,
        y: best.y,
        radius: 105,
        time: 0,
        duration: this.telegraphTime + 0.3,
        owner: lord,
        kind: "sweep",
      });
      lord.castGlow = 0.4;
      audio.play("warcry");
      lord.supportTimer = lord.phase >= 3 ? 6.5 : 8.5;
    }
  }

  private resolveLateTelegraph(mark: Telegraph): boolean {
    const lateKinds: Telegraph["kind"][] = ["eruption", "roots", "eclipse", "beam", "shatter", "bloodmoon", "void"];
    if (!lateKinds.includes(mark.kind)) return false;
    const owner = mark.owner;
    const boss = !mark.environmental && owner === this.bossRef && isLateBossKind(owner.enemyKind);
    const angle = mark.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const inside = (hero: Unit): boolean => {
      const dx = hero.x - mark.x;
      const dy = hero.y - mark.y;
      if (mark.kind === "beam" || mark.kind === "bloodmoon") {
        const along = dx * cos + dy * sin;
        const across = -dx * sin + dy * cos;
        const halfLength = (mark.length ?? mark.radius * 5) / 2;
        const halfWidth = mark.radius * (mark.kind === "beam" ? 0.55 : 0.42);
        return Math.abs(along) <= halfLength + hero.radius && Math.abs(across) <= halfWidth + hero.radius * 0.55;
      }
      if (mark.kind === "shatter") {
        const within = Math.hypot(dx, dy / 0.7) <= mark.radius + hero.radius * 0.45;
        return within && (Math.abs(dx) <= mark.radius * 0.2 + hero.radius || Math.abs(dy) <= mark.radius * 0.18 + hero.radius);
      }
      const ellipticalDistance = Math.hypot(dx, dy / 0.55);
      if (mark.kind === "eclipse") return ellipticalDistance >= mark.radius * 0.36 && ellipticalDistance <= mark.radius + hero.radius * 0.5;
      return ellipticalDistance <= mark.radius + hero.radius * 0.5;
    };

    const colors: Record<string, string> = {
      eruption: "#ff8a3d",
      roots: "#aad16f",
      eclipse: "#c4a9ee",
      beam: "#ffe49a",
      shatter: "#bdefff",
      bloodmoon: "#f06d68",
      void: "#aa9ce0",
    };
    const elements: Record<string, DamageElement> = {
      eruption: "flame",
      roots: "earth",
      eclipse: "shadow",
      beam: "radiant",
      shatter: "storm",
      bloodmoon: "blood",
      void: "shadow",
    };
    const multipliers: Record<string, number> = {
      eruption: boss ? 1.12 : 0.82,
      roots: boss ? 0.9 : 0.68,
      eclipse: boss ? 0.88 : 0.7,
      beam: boss ? 1.2 : 0.78,
      shatter: boss ? 1.08 : 0.78,
      bloodmoon: boss ? 1.34 : 0.92,
      void: boss ? 1.02 : 0.76,
    };
    let struck = 0;
    for (const hero of this.livingHeroes()) {
      if (!inside(hero)) continue;
      if (
        mark.kind === "void" &&
        owner.enemyKind === "wayeater" &&
        this.bossObjectives.some((objective) => objective.kind === "waystone" && objective.resolved && Math.hypot(hero.x - objective.x, (hero.y - objective.y) / 0.7) <= objective.radius + 30)
      ) {
        this.fx.floatText(hero.x, hero.y - hero.radius - 22, "ANCHORED", "#ffe9a3", 12);
        continue;
      }
      // The Seraph's crossed verdicts and the finale's recalled sequence layer
      // more hazards than single-pattern bosses, so each individual hit is a
      // little lighter while still punishing a missed warning.
      const patternScale = owner.enemyKind === "reliquaryseraph" && mark.kind === "beam"
        ? 0.72
        : owner.enemyKind === "wayeater"
          ? 0.56
          : 1;
      const sourceDamage = mark.environmental ? 14 + this.stage.scale * 2.5 : owner.stats.damage;
      this.damage(hero, sourceDamage * multipliers[mark.kind] * patternScale, mark.environmental ? null : owner, {
        spell: mark.kind !== "bloodmoon",
        color: colors[mark.kind],
        element: elements[mark.kind],
      });
      struck++;
      if (!hero.alive) continue;
      if (mark.kind === "eruption") hero.effects.push(makeEffect("burn", boss ? 4 : 2.5, boss ? 5 : 3, owner));
      else if (mark.kind === "roots") hero.effects.push(makeEffect("slow", boss ? 3 : 1.8, boss ? 0.58 : 0.4, owner));
      else if (mark.kind === "eclipse") {
        hero.effects.push(makeEffect("silence", boss ? 2.4 : 1.3, 1, owner));
        hero.effects.push(makeEffect("vulnerable", boss ? 2.8 : 1.6, boss ? 0.22 : 0.12, owner));
      } else if (mark.kind === "beam") hero.effects.push(makeEffect("silence", boss ? 1.4 : 0.7, 1, owner));
      else if (mark.kind === "shatter") hero.effects.push(makeEffect("stun", boss ? 0.75 : 0.4, 1, owner));
      else if (mark.kind === "bloodmoon") hero.effects.push(makeEffect("burn", boss ? 3.5 : 2, boss ? 4 : 2.5, owner));
      else if (mark.kind === "void") hero.effects.push(makeEffect("vulnerable", boss ? 3.4 : 2, boss ? 0.3 : 0.18, owner));
    }

    if (mark.kind === "bloodmoon" && !mark.environmental) {
      const length = mark.length ?? mark.radius * 5;
      const arrive = this.clampToField({ x: mark.x + Math.cos(angle) * length * 0.5, y: mark.y + Math.sin(angle) * length * 0.5 }, owner.radius);
      owner.x = arrive.x;
      owner.y = arrive.y;
      owner.lungeDir = { x: Math.cos(angle), y: Math.sin(angle) };
      owner.lunge = 1;
      if (struck > 0 && owner.alive) this.heal(owner, owner.stats.maxHp * Math.min(0.09, struck * 0.025), true, owner);
      else if (owner.enemyKind === "bloodmoonstag" && owner.alive) this.spawnHeartTrail(owner, mark);
    }

    if (boss && struck === 0 && this.bossStaggerMax > 0) {
      const poise = mark.kind === "bloodmoon" ? 0.3 : mark.kind === "beam" || mark.kind === "eclipse" ? 0.18 : 0.11;
      this.bossStagger += this.bossStaggerMax * poise;
      if (poise >= 0.18) this.fx.floatText(mark.x, mark.y - mark.radius * 0.7, mark.kind === "bloodmoon" ? "THE HUNT MISSES!" : "PATTERN BROKEN", "#ffe9a3", 15);
      if (mark.kind === "bloodmoon") owner.effects.push(makeEffect("vulnerable", 2.2, 0.3, null));
      const signatureOpenings: Partial<Record<LateBossKind, { pattern: Telegraph["kind"]; label: string; time: number; power: number; stun?: number }>> = {
        kilntyrant: { pattern: "eruption", label: "FURNACE STALLED", time: 2.4, power: 0.3 },
        cindermaw: { pattern: "eruption", label: "FURNACE VENTED", time: 2.6, power: 0.32 },
        rootboundmatriarch: { pattern: "roots", label: "HEARTROOT OPEN", time: 3, power: 0.36 },
        dunerevenant: { pattern: "eclipse", label: "TRUE SHAPE FOUND", time: 2.6, power: 0.34 },
        reliquaryseraph: { pattern: "beam", label: "VERDICT OVERTURNED", time: 2.2, power: 0.28 },
        tempestroc: { pattern: "shatter", label: "WINGS GROUNDED", time: 2.2, power: 0.28, stun: 1.1 },
        skybreaker: { pattern: "shatter", label: "CRYSTAL CORE EXPOSED", time: 2.4, power: 0.3, stun: 0.7 },
        redhuntsman: { pattern: "bloodmoon", label: "THE HUNT STARVES", time: 2.8, power: 0.38 },
        lastpilgrim: { pattern: "void", label: "THE ROAD HOLDS", time: 2.8, power: 0.34 },
      };
      const opening = isLateBossKind(owner.enemyKind) ? signatureOpenings[owner.enemyKind] : undefined;
      if (opening?.pattern === mark.kind) {
        owner.effects.push(makeEffect("vulnerable", opening.time, opening.power, null));
        if (opening.stun) owner.effects.push(makeEffect("stun", opening.stun, 1, null));
        this.fx.floatText(owner.x, owner.y - owner.radius * 3.1, opening.label, "#ffe9a3", 16);
        this.fx.ring(owner.x, owner.y, owner.radius * 2.8, "#ffe9a3", { width: 4, life: 0.55 });
      }
      if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(owner);
    }

    const color = colors[mark.kind];
    if (mark.kind === "eruption") {
      this.fx.burst(mark.x, mark.y - 8, color, 24, 220, { glow: true, gravity: 120 });
      this.fx.pool(mark.x, mark.y, mark.radius * 1.4, "255,92,44", 0.8);
      this.addDecal(mark.x, mark.y, "scorch", Math.min(58, mark.radius));
    } else if (mark.kind === "roots") {
      this.fx.burst(mark.x, mark.y, color, 18, 105, { gravity: -80, size: 4 });
      this.fx.ring(mark.x, mark.y, mark.radius, color, { width: 5, life: 0.55 });
    } else if (mark.kind === "eclipse") {
      this.fx.pool(mark.x, mark.y, mark.radius * 1.3, "78,56,118", 0.7);
      this.fx.ring(mark.x, mark.y, mark.radius, color, { width: 5, life: 0.65 });
    } else if (mark.kind === "beam") {
      const length = mark.length ?? mark.radius * 6;
      this.fx.slash(mark.x, mark.y, angle, length * 0.48, color, 0.04);
      this.fx.burst(mark.x, mark.y, color, 20, 180, { glow: true, gravity: 20 });
    } else if (mark.kind === "shatter") {
      for (let i = 0; i < 4; i++) this.fx.slash(mark.x, mark.y, (i / 4) * Math.PI * 2, mark.radius * 0.82, color, 0.08);
      this.fx.burst(mark.x, mark.y, color, 28, 240, { glow: true, gravity: 150 });
    } else if (mark.kind === "bloodmoon") {
      this.fx.slash(mark.x, mark.y, angle, (mark.length ?? 300) * 0.5, color, 0.12);
      this.fx.burst(owner.x, owner.y, color, 18, 170, { glow: true, gravity: 80 });
    } else {
      this.fx.pool(mark.x, mark.y, mark.radius * 1.45, "55,43,92", 0.9);
      this.fx.ring(mark.x, mark.y, mark.radius, color, { width: 6, life: 0.7 });
    }
    this.fx.addShake(boss ? 9 : 4);
    this.hitstop = Math.max(this.hitstop, boss ? 0.07 : 0.025);
    this.playLatePatternSound(mark.kind);
    return true;
  }

  private updateTelegraphs(dt: number): void {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const mark = this.telegraphs[i];
      if (mark.follow?.alive) {
        mark.x = mark.follow.x;
        mark.y = mark.follow.y;
      }
      mark.time += dt;
      if (!mark.owner.alive && mark.kind !== "lightning") {
        this.telegraphs.splice(i, 1);
        continue;
      }
      if (mark.time >= mark.duration) {
        this.telegraphs.splice(i, 1);
        if (this.resolveLateTelegraph(mark)) continue;
        if (mark.kind === "lightning") {
          const boss = mark.owner === this.bossRef ? this.bossRef : null;
          if (boss?.enemyKind === "skybreaker") {
            const rod = this.bossObjectives.find((objective) =>
              objective.kind === "lightningRod" && !objective.resolved &&
              Math.hypot(objective.x - mark.x, (objective.y - mark.y) / 0.7) < objective.radius + mark.radius * 0.65,
            );
            if (rod) this.completeBossObjective(rod, boss);
          }
          for (const unit of this.units) {
            if (!unit.alive || Math.hypot(unit.x - mark.x, unit.y - mark.y) >= mark.radius + unit.radius) continue;
            this.damage(unit, 16 * this.stage.scale, null, { spell: true, color: "#b9f4ff" });
            if (unit.alive && this.tideHigh) unit.effects.push(makeEffect("stun", 0.55, 1, null));
            if (unit.alive && unit.enemyKind === "stormjaw") {
              unit.effects = unit.effects.filter((effect) => !(effect.kind === "guard" && effect.source === unit));
              unit.effects.push(makeEffect("vulnerable", 2.8, 0.38, null));
              this.bossStagger += this.bossStaggerMax * 0.24;
              this.fx.floatText(unit.x, unit.y - unit.radius * 3, "PLATES SPLIT!", "#ffe9a3", 17);
              if (this.jawCycle?.mode === "reef") this.jawCycle.nextBreach = Math.min(this.jawCycle.nextBreach, 1.5);
              if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(unit);
            }
          }
          this.fx.burst(mark.x, mark.y - 12, "#d9fbff", 28, 240, { glow: true, gravity: 40 });
          this.fx.ring(mark.x, mark.y, mark.radius + 12, "#8de7f2", { width: 6, life: 0.55 });
          this.addDecal(mark.x, mark.y, "scorch", 46);
          this.fx.addShake(10);
          audio.play("glacialGroan");
          continue;
        }
        if (mark.kind === "cannon") {
          const gunner = mark.owner;
          for (const hero of this.livingHeroes()) {
            if (Math.hypot(hero.x - mark.x, hero.y - mark.y) >= mark.radius + hero.radius * 0.5) continue;
            this.damage(hero, gunner.stats.damage * 1.15, gunner);
            if (hero.alive) hero.effects.push(makeEffect("slow", 1.2, 0.22, gunner));
          }
          this.fx.burst(mark.x, mark.y - 8, "#e6b06c", 22, 210, { glow: true, gravity: 150 });
          this.fx.burst(mark.x, mark.y, "#59686a", 16, 130, { gravity: 40, size: 5 });
          this.fx.ring(mark.x, mark.y, mark.radius + 12, "#d58d4e", { width: 5, life: 0.5 });
          this.addDecal(mark.x, mark.y, "scorch", 44);
          this.fx.addShake(8);
          this.hitstop = Math.max(this.hitstop, 0.06);
          audio.play("thud");
          continue;
        }
        if (mark.kind === "meteor") {
          // the star lands
          const casterAttrs = this.saveRef && mark.owner.heroIndex >= 0 ? this.saveRef.heroes[mark.owner.heroIndex].attrs : null;
          const dmg = 30 + (casterAttrs ? casterAttrs.int * 4 : 40);
          for (const enemy of this.livingEnemies()) {
            if (Math.hypot(enemy.x - mark.x, enemy.y - mark.y) < mark.radius + enemy.radius) {
              this.damage(enemy, dmg, mark.owner, { spell: true, color: "#ff9b42" });
              if (enemy.alive) enemy.effects.push(makeEffect("burn", 3, 3.5, mark.owner));
            }
          }
          this.fx.burst(mark.x, mark.y - 10, "#ff9b42", 30, 220, { glow: true, gravity: 80 });
          this.fx.burst(mark.x, mark.y - 10, "#ffe08a", 18, 140, { glow: true });
          this.fx.ring(mark.x, mark.y, mark.radius + 14, "#ff7a3a", { width: 6, life: 0.6 });
          this.fx.pool(mark.x, mark.y, 120, "255,140,60", 1);
          this.addDecal(mark.x, mark.y, "scorch", 52);
          this.fx.addShake(11);
          this.hitstop = Math.max(this.hitstop, 0.09);
          this.zoomPunch = Math.max(this.zoomPunch, 1);
          audio.play("fireball");
          continue;
        }
        if (mark.kind === "sweep") {
          // executioner's arc crashes down where it was promised (thrown axes bite lighter)
          const lord = mark.owner;
          const isAxe = mark.radius <= 60;
          const isFlop = lord.enemyKind === "ogre" && mark.radius > 120;
          const isWidowFlood = lord.enemyKind === "bellwidow";
          const isStormBreach = lord.enemyKind === "stormjaw" && mark.radius >= 110;
          if (!isWidowFlood) {
            lord.lungeDir = this.normalize({ x: mark.x - lord.x, y: mark.y - lord.y });
            lord.lunge = 1;
          }
          let struck = 0;
          for (const hero of this.livingHeroes()) {
            if (Math.hypot(hero.x - mark.x, hero.y - mark.y) < mark.radius + hero.radius * 0.5) {
              const multiplier = isWidowFlood ? 0.62 : isStormBreach ? 0.82 : isFlop ? 1.6 : isAxe ? 0.75 : 1.5;
              this.damage(hero, lord.stats.damage * multiplier, lord);
              if (hero.alive) hero.effects.push(makeEffect("slow", isWidowFlood ? 1.8 : 1.5, isWidowFlood ? 0.28 : isAxe ? 0.25 : 0.35, lord));
              struck++;
            }
          }
          if (isStormBreach) this.finishStormjawBreach(lord, struck);
          // dodging is a weapon: a promise that finds nobody costs the boss poise —
          // but only in proportion to how big the promise was. Slipping one circle
          // of a five-lane breath is expected play, not a triumph.
          if (struck === 0 && !isWidowFlood && !isStormBreach && lord === this.bossRef && this.bossStaggerMax > 0) {
            const poiseFrac = isFlop ? 0.5 : mark.radius >= 90 ? 0.3 : mark.radius >= 60 ? 0.12 : 0.05;
            this.bossStagger += this.bossStaggerMax * poiseFrac;
            if (poiseFrac >= 0.12) this.fx.floatText(mark.x, mark.y - 20, isFlop ? "FACE-FIRST!" : "wide open!", "#ffe9a3", isFlop ? 18 : 14);
            if (isFlop && lord.alive) {
              lord.effects.push(makeEffect("stun", 2.6, 1, null));
              lord.effects.push(makeEffect("vulnerable", 2.6, 0.45, null));
            }
            if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(lord);
          }
          if (isWidowFlood) {
            this.fx.ring(mark.x, mark.y, mark.radius + 5, "#d5bd80", { width: 3, life: 0.4 });
            continue;
          }
          this.fx.slash(mark.x, mark.y - 10, Math.PI * 0.1, mark.radius * 0.8, "#ff9a85", Math.PI * 1.6);
          this.fx.ring(mark.x, mark.y, mark.radius + 10, "#ff8a70", { width: 5, life: 0.5 });
          this.fx.burst(mark.x, mark.y, "#c98a5a", 20, 190, { gravity: 200 });
          this.fx.addShake(isFlop ? 12 : 10);
          this.hitstop = Math.max(this.hitstop, 0.08);
          this.zoomPunch = Math.max(this.zoomPunch, isFlop ? 1.1 : 0.9);
          audio.play("thud");
          continue;
        }
        const alpha = mark.owner;
        // the telegraph resolves into a real LEAP — airborne, arcing, landing hard
        alpha.facing = (mark.x >= alpha.x ? 1 : -1) as 1 | -1;
        alpha.leap = {
          t: 0,
          dur: Math.max(0.3, Math.min(0.5, Math.hypot(mark.x - alpha.x, mark.y - alpha.y) / 640)),
          fromX: alpha.x,
          fromY: alpha.y,
          toX: mark.x,
          toY: mark.y,
          radius: mark.radius,
        };
        // dust kicked up at takeoff
        this.fx.burst(alpha.x, alpha.y + 2, "rgba(185,170,145,0.7)", 8, 90, { gravity: -40, size: 3.4 });
        audio.play("shoot");
      }
    }
  }

  /** Poise breaks: the boss reels — your window, and it deepens each time. */
  private staggerBoss(boss: Unit): void {
    this.bossStagger = 0;
    this.bossStaggerMax = Math.round(this.bossStaggerMax * 1.4);
    boss.effects.push(makeEffect("stun", 2.5, 1, null));
    boss.effects.push(makeEffect("vulnerable", 2.5, 0.25, null));
    this.fx.floatText(boss.x, boss.y - boss.radius * 3, "STAGGERED!", "#ffe9a3", 22);
    this.fx.ring(boss.x, boss.y, boss.radius * 3.4, "#ffe9a3", { width: 6, life: 0.7 });
    this.fx.burst(boss.x, boss.y - 16, "#ffe9a3", 18, 160, { glow: true });
    this.fx.addShake(9);
    this.hitstop = Math.max(this.hitstop, 0.1);
    this.zoomPunch = Math.max(this.zoomPunch, 0.9);
    audio.play("staggerBreak");
  }

  /** The pounce lands: the slam happens where the paws come down. */
  private landPounce(alpha: Unit, x: number, y: number, radius: number): void {
    // the stalker's leap: one hard strike, then it stands exposed
    if (alpha.enemyKind === "stalker") {
      for (const hero of this.livingHeroes()) {
        if (Math.hypot(hero.x - x, hero.y - y) < radius + hero.radius * 0.5) {
          this.damage(hero, alpha.stats.damage * 1.5, alpha);
        }
      }
      alpha.effects.push(makeEffect("vulnerable", 2.4, 0.5, null));
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "exposed!", "#b6f0a8", 13);
      this.fx.burst(x, y, "rgba(120,140,110,0.8)", 10, 100, { gravity: -20, size: 3.5 });
      this.fx.ring(x, y, radius + 8, "#4a5a44", { width: 3, life: 0.35 });
      this.fx.addShake(5);
      audio.play("thud");
      return;
    }
    // the harrier's dive: it strikes, then must catch its breath on the ground
    if (alpha.enemyKind === "harrier") {
      for (const hero of this.livingHeroes()) {
        if (Math.hypot(hero.x - x, hero.y - y) < radius + hero.radius * 0.5) {
          this.damage(hero, alpha.stats.damage * 1.4, alpha);
        }
      }
      alpha.aloft = false;
      alpha.supportTimer = 3;
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "grounded!", "#ffd7a0", 13);
      this.fx.burst(x, y, "#d8cfc0", 12, 110, { gravity: 80, life: 0.5 });
      this.fx.ring(x, y, radius + 10, "#8a7a9c", { width: 3.5, life: 0.4 });
      this.fx.addShake(6);
      audio.play("thud");
      return;
    }
    alpha.lungeDir = { x: alpha.facing, y: 0 };
    alpha.lunge = 1;
    let struck = 0;
    // hunt-dives fall lighter — three in a row must be survivable without dodging every one
    const pounceMult = this.moonHunt ? 1.2 : 1.7;
    for (const hero of this.livingHeroes()) {
      if (Math.hypot(hero.x - x, hero.y - y) < radius + hero.radius * 0.5) {
        this.damage(hero, alpha.stats.damage * pounceMult, alpha);
        struck++;
      }
    }
    // a pounce that finds only snow costs the Alpha dearly — dodging is a weapon
    if (struck === 0 && alpha === this.bossRef && this.bossStaggerMax > 0) {
      this.bossStagger += this.bossStaggerMax * 0.4;
      this.fx.floatText(x, y - 20, "off balance!", "#ffe9a3", 15);
      if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(alpha);
    }
    this.fx.burst(x, y, "rgba(190,175,150,0.8)", 14, 120, { gravity: -20, size: 4.5 });
    this.fx.ring(x, y, radius + 14, "#c9c2e8", { width: 4, life: 0.4 });
    this.fx.addShake(9);
    this.hitstop = Math.max(this.hitstop, 0.07);
    this.zoomPunch = Math.max(this.zoomPunch, 1);
    audio.play("thud");
    // frenzy leaves the alpha exhausted: your window (the hunt has its own reckoning)
    if (alpha.phase === 3 && !this.moonHunt) {
      alpha.effects.push(makeEffect("stun", 2.4, 1, null));
      alpha.effects.push(makeEffect("vulnerable", 2.4, 0.75, null));
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "exhausted!", "#ffe9a3", 15);
    }
    if (this.moonHunt && struck === 0) this.moonHunt.whiffs++;
  }

  /** Bosses opening a fight square up to the nearest FIGHTER — never the mender by default. */
  private nearestFighter(from: Unit): Unit | null {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const hero of this.livingHeroes()) {
      if (hero.stats.healPower >= 8) continue;
      const d = unitDist(from, hero);
      if (d < bestDist) {
        bestDist = d;
        best = hero;
      }
    }
    return best ?? this.nearestHero(from);
  }

  private nearestHero(from: Unit): Unit | null {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const hero of this.livingHeroes()) {
      const d = unitDist(from, hero);
      if (d < bestDist) {
        bestDist = d;
        best = hero;
      }
    }
    return best;
  }

  private performAttack(attacker: Unit, target: Unit): void {
    attacker.lungeDir = this.normalize({ x: target.x - attacker.x, y: target.y - attacker.y });
    attacker.lunge = 1;
    const ranged = attacker.stats.range > 90;
    if (attacker.enemyKind === "warlord" || attacker.enemyKind === "ogre" || attacker.enemyKind === "rimeheart" || attacker.enemyKind === "wyrm") {
      // ground-shaking slam that clips everyone near the target
      const reach = attacker.enemyKind === "warlord" ? 70 : attacker.enemyKind === "rimeheart" ? 78 : attacker.enemyKind === "wyrm" ? 74 : 52;
      for (const hero of this.livingHeroes()) {
        if (Math.hypot(hero.x - target.x, hero.y - target.y) < reach) {
          this.damage(hero, attacker.stats.damage, attacker);
        }
      }
      this.fx.burst(target.x, target.y, "#c98a5a", 18, 170, { gravity: 220 });
      this.fx.ring(target.x, target.y, reach + 8, "#e8b088", { width: 5, life: 0.5 });
      this.fx.addShake(attacker.enemyKind === "warlord" ? 9 : 6);
      this.hitstop = Math.max(this.hitstop, 0.08);
      audio.play("thud");
      return;
    }
    let dmg = attacker.stats.damage;
    let crit = false;
    // Every typed combatant carries a restrained elemental imprint. Basic
    // attacks build conditions slowly; techniques and warnings build faster.
    const attackElement: DamageElement = attacker.element ?? "physical";
    if (attacker.team === "hero" && this.saveRef) {
      const chance = talentMods(this.saveRef.heroes[attacker.heroIndex].talents).crit;
      if (Math.random() < chance) {
        crit = true;
        dmg *= 1.6;
        if (this.heroTalentRank(attacker, "eagleSoul") > 0) {
          const elementalSkill = attacker.abilities.find((ability) => ability.def.pathSkill === "focus");
          if (elementalSkill) elementalSkill.timer = Math.max(0, elementalSkill.timer - 0.75);
        }
        this.hitstop = Math.max(this.hitstop, 0.05);
        this.zoomPunch = Math.max(this.zoomPunch, 0.4);
      }
      // Last Stand: fury below 30% health
      const lastStand = this.heroTalentRank(attacker, "lastStand");
      if (lastStand > 0 && attacker.hp < attacker.stats.maxHp * 0.3) {
        dmg *= 1 + 0.08 * lastStand;
      }
      // Hunter's Mark: the first blood is the deepest
      if (this.heroTalentRank(attacker, "huntersMark") > 0 && target.hp >= target.stats.maxHp * 0.995) {
        dmg *= 1.25;
      }
      // Executioner: finish wounded foes
      if (this.heroTalentRank(attacker, "executioner") > 0 && target.hp < target.stats.maxHp * 0.25) {
        dmg *= 2;
      }
      // Exorcist: anathema to beasts and the risen dead
      if (attacker.calling === "exorcist" && ["wolf", "alpha", "frostwolf", "shambler"].includes(target.enemyKind ?? "")) {
        dmg *= 1.15;
      }
      // Lancer: first blood on every new foe
      if (attacker.calling === "lancer" && !this.lancerStruck.has(attacker.id * 100000 + target.id)) {
        this.lancerStruck.add(attacker.id * 100000 + target.id);
        dmg *= 1.3;
      }
      // Reaver: red-handed against the already-bleeding (Blademasters cut deeper, sooner)
      if (attacker.calling === "reaver") {
        const threshold = attacker.advCalling === "blademaster" ? 0.5 : 0.4;
        const bonus = attacker.advCalling === "blademaster" ? 1.3 : 1.2;
        if (target.hp < target.stats.maxHp * threshold) dmg *= bonus;
      }
      // Reaper: the kept promise — foes below a fifth are simply finished
      if (attacker.advCalling === "reaper" && target.hp < target.stats.maxHp * 0.2) {
        dmg = Math.max(dmg, target.hp + 1);
      }
      // Spellblade: every melee hit hastens the runes
      if (attacker.calling === "spellblade" && attacker.stats.range <= 90) {
        for (const ab of attacker.abilities) {
          if (!ab.ult && ab.timer > 0) ab.timer = Math.max(0, ab.timer - 0.3);
        }
      }
    }
    if (!ranged) {
      // melee slash arc + knockback nudge
      const angle = Math.atan2(attacker.lungeDir.y, attacker.lungeDir.x);
      this.fx.slash(attacker.x, attacker.y - 12, angle, attacker.radius + 22, attacker.team === "hero" ? "#ffe9a3" : "#e8b0a0");
      const push = this.clampToField(
        { x: target.x + attacker.lungeDir.x * 6, y: target.y + attacker.lungeDir.y * 6 },
        target.radius,
      );
      target.x = push.x;
      target.y = push.y;
    }
    if (ranged) {
      const coastalCaster = attacker.enemyKind === "saltwitch" || attacker.enemyKind === "stormcaller" || attacker.enemyKind === "conchseer";
      const lateCaster = ["cinderkin", "furnacecantor", "sporeseer", "gloomwing", "mirageseer", "censerwraith", "shardling", "briarwitch", "nullwalker", "waylostarcher"].includes(attacker.enemyKind ?? "");
      const weapon = attacker.team === "hero" ? attacker.stats.weapon : attacker.enemyKind === "shaman" || attacker.enemyKind === "bonecaller" || coastalCaster || lateCaster ? "staff" : "bow";
      const isArcane = weapon === "staff" || weapon === "tome";
      const isHoly = weapon === "stave";
      const missile = {
        x: attacker.x + attacker.facing * 10,
        y: attacker.y - 18,
        target,
        aim: attacker.lungeDir,
        speed: isArcane ? 300 : isHoly ? 260 : 420,
        damage: dmg,
        from: attacker,
        kind: (isArcane ? "bolt" : isHoly ? "spark" : "arrow") as "bolt" | "spark" | "arrow",
        color: isArcane ? (coastalCaster ? "#a9e1d8" : lateCaster ? ENEMIES[attacker.enemyKind!].trim : attacker.enemyKind === "shaman" ? "#7de8c9" : "#b48ae8") : isHoly ? "#ffe9a3" : "#e8d9b0",
        heals: false,
        life: 3,
      };
      this.projectiles.push(missile);
      // muzzle flash at the loose
      this.fx.burst(missile.x + attacker.facing * 4, missile.y, missile.color, 3, 55, { glow: true, life: 0.2, size: 2.4 });
      // Twin Arrows: every 4th ranged attack looses a second missile
      if (this.heroTalentRank(attacker, "twinArrows") > 0) {
        const n = (this.shotCounts.get(attacker.id) ?? 0) + 1;
        this.shotCounts.set(attacker.id, n);
        const volleyEvery = this.heroTalentRank(attacker, "perfectVolley") > 0 ? 3 : 4;
        if (n % volleyEvery === 0) {
          this.projectiles.push({ ...missile, y: missile.y - 7, speed: missile.speed * 0.88 });
          this.fx.floatText(attacker.x, attacker.y - attacker.radius * 3 - 4, "twin!", "#b6f0a8", 11);
        }
      }
      // Stormweaver: every 4th attack forks lightning to a second foe
      if (attacker.calling === "tempest") {
        const forks = (this.forkCounts.get(attacker.id) ?? 0) + 1;
        this.forkCounts.set(attacker.id, forks);
        if (forks % 4 === 0) {
          const other = this.livingEnemies().find((o) => o !== target && Math.hypot(o.x - target.x, o.y - target.y) < 220);
          if (other) {
            this.damage(other, dmg * 0.4, attacker, { spell: true, color: "#8fb8ff" });
            this.fx.burst(other.x, other.y - 12, "#8fb8ff", 6, 90, { glow: true });
          }
        }
      }
      audio.play(isArcane || isHoly ? "bolt" : "shoot");
    } else {
      this.damage(target, dmg, attacker, crit ? { color: "#ffd76b", element: attackElement } : { element: attackElement });
      if (attacker.team === "hero" && attacker.discipline === "warrior") {
        attacker.pathResource = Math.min(100, (attacker.pathResource ?? 0) + (crit ? 14 : 8));
      }
      if (crit) this.fx.floatText(target.x, target.y - target.radius - 30, "crit!", "#ffd76b", 12);
      // Storm Eels punish a packed formation. High tide carries the arc farther and leaves a brief stun.
      if (attacker.enemyKind === "stormeel" && target.team === "hero") {
        const arcRange = this.tideHigh ? 145 : 105;
        const other = this.livingHeroes()
          .filter((hero) => hero !== target && Math.hypot(hero.x - target.x, hero.y - target.y) < arcRange)
          .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
        if (other) {
          this.damage(other, dmg * 0.48, attacker, { spell: true, color: "#a9f2ff" });
          if (this.tideHigh && other.alive) other.effects.push(makeEffect("stun", 0.35, 1, attacker));
          this.fx.burst(target.x, target.y - 12, "#a9f2ff", 5, 70, { glow: true, life: 0.35 });
          this.fx.burst(other.x, other.y - 12, "#a9f2ff", 7, 90, { glow: true, life: 0.4 });
          this.fx.floatText(other.x, other.y - other.radius * 2.5, this.tideHigh ? "high-tide arc!" : "arc!", "#a9f2ff", 11);
          audio.play("bolt");
        }
      }
      // Cleaving Blows: melee strikes splash to nearby foes
      if (attacker.team === "hero" && this.heroTalentRank(attacker, "cleavingBlows") > 0) {
        for (const other of this.livingEnemies()) {
          if (other !== target && Math.hypot(other.x - target.x, other.y - target.y) < 60) {
            this.damage(other, dmg * 0.3, attacker, { color: "#ffd27d" });
          }
        }
      }
      // Blood Knight: the chalice fills
      if (attacker.calling === "bloodknight") this.heal(attacker, dmg * 0.08, false, null);
      // Monk: the third strike staggers
      if (attacker.calling === "monk") {
        const strikes = (this.monkCounts.get(attacker.id) ?? 0) + 1;
        this.monkCounts.set(attacker.id, strikes);
        if (strikes % 3 === 0) {
          if (BOSS_KINDS.includes(target.enemyKind ?? "")) {
            if (target === this.bossRef && this.bossStaggerMax > 0) this.bossStagger += 12;
          } else if (target.alive) {
            target.effects.push(makeEffect("stun", 0.5, 1, attacker));
          }
          this.fx.burst(target.x, target.y - 14, "#e8b878", 6, 80, { glow: true });
        }
      }
      // Stormweaver: every 4th attack forks lightning to a second foe
      if (attacker.calling === "tempest") {
        const forks = (this.forkCounts.get(attacker.id) ?? 0) + 1;
        this.forkCounts.set(attacker.id, forks);
        if (forks % 4 === 0) {
          const other = this.livingEnemies().find((o) => o !== target && Math.hypot(o.x - target.x, o.y - target.y) < 220);
          if (other) {
            this.damage(other, dmg * 0.4, attacker, { spell: true, color: "#8fb8ff" });
            this.fx.burst(other.x, other.y - 12, "#8fb8ff", 6, 90, { glow: true });
          }
        }
      }

      audio.play("slash");
    }
  }

  private shotCounts = new Map<number, number>();
  private forkCounts = new Map<number, number>();
  private monkCounts = new Map<number, number>();
  private lancerStruck = new Set<number>();
  private seerGuard = 0;
  carry: { ogre: Unit; hero: Unit; t: number; hurt: number } | null = null;
  private killStreaks = new Map<number, { n: number; t: number }>();

  private separateUnits(dt: number): void {
    const living = this.units.filter((u) => u.alive);
    for (let i = 0; i < living.length; i++) {
      for (let j = i + 1; j < living.length; j++) {
        const a = living[i];
        const b = living[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = (a.radius + b.radius) * 0.9;
        if (dist > 0.001 && dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5;
          const strength = Math.min(1, dt * 12);
          a.x -= dx * push * strength;
          a.y -= dy * push * strength;
          b.x += dx * push * strength;
          b.y += dy * push * strength;
        }
      }
    }
    for (const unit of living) {
      const clamped = this.clampToField(unit, unit.radius);
      // enemies may wait just beyond the active edge while entering a room
      if (unit.team === "enemy" && (this.descending ? unit.y > this.field.bottom - unit.radius : unit.x > this.field.right - unit.radius)) {
        if (this.descending) unit.x = Math.min(this.field.right - unit.radius, Math.max(this.field.left + unit.radius, unit.x));
        else unit.y = Math.min(this.field.bottom - unit.radius, Math.max(this.field.top + unit.radius, unit.y));
        continue;
      }
      unit.x = clamped.x;
      unit.y = clamped.y;
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      zone.time += dt;
      if (zone.time >= zone.duration) {
        this.zones.splice(i, 1);
        // a gravity well dies violently: everything it held gets one last yank
        if (zone.kind === "gravity") {
          this.fx.burst(zone.x, zone.y - 6, "#9a8af2", 20, 160, { glow: true });
          this.fx.ring(zone.x, zone.y, zone.radius * 0.7, "#7a6ae8", { width: 5, life: 0.4 });
          this.fx.addShake(5);
          audio.play("bolt");
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }
      let tx: number;
      let ty: number;
      if (p.target && p.target.alive) {
        tx = p.target.x;
        ty = p.target.y - p.target.radius * 0.7;
      } else {
        tx = p.x + p.aim.x * 40;
        ty = p.y + p.aim.y * 40;
        p.life -= dt * 2;
      }
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (p.target && p.target.alive && dist <= step + p.target.radius * 0.6) {
        if (p.heals) {
          this.heal(p.target, p.damage, true, p.from);
          this.fx.burst(p.target.x, p.target.y - 16, p.color, 8, 80, { glow: true, gravity: -40 });
        } else {
          const element: DamageElement = p.element ?? p.from.element ?? "physical";
          this.damage(p.target, p.damage, p.from, { color: p.kind === "bolt" ? "#d3b6f0" : undefined, element });
        }
        this.projectiles.splice(i, 1);
        continue;
      }
      if (dist > 0.001) {
        p.aim = { x: dx / dist, y: dy / dist };
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  private updatePresentation(dt: number): void {
    if (this.bossMoment) {
      this.bossMoment.time -= dt;
      if (this.bossMoment.time <= 0) this.bossMoment = null;
    }
    const boss = this.bossRef;
    if (boss?.alive && boss.enemyKind && this.cinematic <= 0 && boss.phase > this.presentedBossPhase) {
      const phase = boss.phase;
      this.presentedBossPhase = phase;
      if (phase > 1 && !this.bossMoment) {
        const earlyTurns: Partial<Record<EnemyKind, string[]>> = {
          ogre: ["THE CART BREAKS", "NO WEIGHT HELD BACK"],
          alpha: ["THE PACK CLOSES", "THE LAST HUNT"],
          warlord: ["THE BANNER RISES", "NO GROUND GIVEN"],
          rimeheart: ["THE ICE CRACKS", "WINTER HAS TEETH"],
          wyrm: ["THE COURT DESCENDS", "THE LONG BREATH"],
          bellwidow: ["THE SECOND TOLL", "THE DROWNED CHOIR"],
          stormjaw: ["THE TIDE TURNS", "THE DEEP BREACH"],
        };
        const turns = earlyTurns[boss.enemyKind] ?? [];
        const title = turns[Math.min(turns.length - 1, phase - 2)] ?? `PHASE ${phase}`;
        const finalPhase = phase >= (BOSS_PHASES[boss.enemyKind]?.length ?? 2) + 1;
        this.bossMoment = {
          eyebrow: finalPhase ? "FINAL PHASE · GREAT FOE" : `PHASE ${phase} · PATTERN CHANGED`,
          title,
          accent: ENEMIES[boss.enemyKind].trim,
          time: 1.65,
          maxTime: 1.65,
          final: finalPhase,
        };
        audio.bossPhase(phase, finalPhase);
      }
    }
    for (const unit of this.units) {
      unit.lunge = Math.max(0, unit.lunge - dt * 5);
      unit.hitFlash = Math.max(0, unit.hitFlash - dt);
      unit.castGlow = Math.max(0, unit.castGlow - dt);
      unit.alert = Math.max(0, unit.alert - dt);
      unit.idleAnim = Math.max(0, unit.idleAnim - dt);
      if (unit.alive && unit.team === "hero" && !unit.moveTarget && !unit.attackTarget && !unit.healTarget && !unit.celebrate) {
        unit.idleTimer -= dt;
        if (unit.idleTimer <= 0) {
          unit.idleTimer = 4 + Math.random() * 4;
          unit.idleAnim = 0.7;
          if (unit.stats.weapon === "stave" || unit.stats.weapon === "staff") unit.castGlow = Math.max(unit.castGlow, 0.3);
        }
      }
      if (!unit.alive) unit.deathTime += dt;
    }
  }

  unitAt(x: number, y: number, team?: "hero" | "enemy", extraPad = 0): Unit | null {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const unit of this.units) {
      if (!unit.alive) continue;
      if (team && unit.team !== team) continue;
      const pad = (unit.team === "hero" ? 16 : 12) + extraPad;
      const d = Math.hypot(unit.x - x, (unit.y - 14 - y) * 0.9);
      if (d < unit.radius + pad && d < bestDist) {
        bestDist = d;
        best = unit;
      }
    }
    return best;
  }
}

export function unitDist(a: Unit, b: Unit): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
