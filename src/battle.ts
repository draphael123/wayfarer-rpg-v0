import { audio } from "./audio";
import { DIFFICULTIES, ENEMIES, HEROES, abilityById, armorById, callingById, callingEligible, cooldownReduction, deriveStats, partyRoster, talentMods, trinketMods } from "./data";
import type { FxSystem } from "./fx";
import type {
  AbilityState,
  EnemyKind,
  GroundZone,
  Telegraph,
  Projectile,
  SaveData,
  StageDef,
  StatusEffect,
  Unit,
  Vec,
} from "./types";

export interface FieldRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type BattleState = "fighting" | "wavebreak" | "victory" | "defeat";

let nextUnitId = 1;

function makeEffect(kind: StatusEffect["kind"], time: number, power: number, source: Unit | null = null): StatusEffect {
  return { kind, time, power, source };
}

/** The great foes — they hunt by threat, not by proximity or frailty. */
const BOSS_KINDS = ["alpha", "warlord", "ogre", "rimeheart"];

export class Battle {
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  zones: GroundZone[] = [];
  telegraphs: Telegraph[] = [];
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
  castCounts: Record<string, number> = {};
  heroDeaths = 0;
  /** Per-hero battle ledger (keyed by heroIndex) — feeds the victory recap. */
  tallies: Record<number, { dealt: number; taken: number; healed: number }> = {};
  ordersIssued = 0;
  introBanner = 2.6;
  zoomPunch = 0;
  decals: { x: number; y: number; kind: "scorch" | "stain" | "print"; age: number; size: number; angle: number }[] = [];
  kickX = 0;
  kickY = 0;
  cinematic = 0; // boss-intro seconds remaining
  bossRef: Unit | null = null;
  slowmo = 0; // kill-cam seconds remaining
  ultFlash: { color: string; time: number } | null = null; // ult-cast screen tint

  constructor(
    public stage: StageDef,
    save: SaveData,
    public field: FieldRect,
    public fx: FxSystem,
    public tutorialMode = false,
  ) {
    const diff = DIFFICULTIES[save.difficulty ?? 1];
    this.difficultyMult = this.tutorialMode ? 1 : diff.enemyMult;
    this.telegraphTime = this.tutorialMode ? 1.5 : diff.telegraph;
    this.enemyHaste = this.tutorialMode ? 1 : diff.haste;
    this.extraSpawn = this.tutorialMode ? 0 : diff.extraSpawn;
    const roster = partyRoster(save);
    const midY = (field.top + field.bottom) / 2;
    const spread = Math.min(120, (field.bottom - field.top) / 3);
    for (let slot = 0; slot < roster.length; slot++) {
      const i = roster[slot];
      const t = roster.length === 1 ? 0.5 : slot / (roster.length - 1);
      const pos: Vec = {
        x: field.left + 60 + Math.abs(t - 0.5) * 60,
        y: midY - spread + t * spread * 2,
      };
      const heroSave = save.heroes[i];
      // an oath only holds while its stat requirements are still met
      const sworn = callingById(heroSave.calling);
      const oath = sworn && callingEligible(sworn, heroSave.attrs) ? sworn : null;
      const advanced = oath ? heroSave.advCalling : null;
      const stats = deriveStats(heroSave.attrs, heroSave.weaponTier, heroSave.armor, heroSave.talents, heroSave.trinket, oath?.id ?? null, advanced);
      const abilities: AbilityState[] = heroSave.equipped
        .map((id) => abilityById(id))
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map((def) => ({ def, timer: 0 }));
      if (oath) abilities.push({ def: oath.signature, timer: 1, ult: true });
      this.units.push({
        id: nextUnitId++,
        name: HEROES[i].name,
        team: "hero",
        heroIndex: i,
        enemyKind: null,
        calling: oath?.id ?? null,
        advCalling: advanced,
        ultCharge: 0,
        entered: true,
        x: pos.x,
        y: pos.y,
        radius: 15,
        stats,
        hp: stats.maxHp,
        attackTimer: 0,
        moveTarget: null,
        attackTarget: null,
        healTarget: null,
        stance: heroSave.attrs.spi >= 6 ? "heal" : "attack",
        autoOrder: false,
        abilities,
        effects: [],
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
    const y = overrides.y ?? this.field.top + 20 + Math.random() * (this.field.bottom - this.field.top - 40);
    const x = overrides.x ?? this.field.right + 30 + Math.random() * 60;
    this.units.push({
      id: nextUnitId++,
      name: def.name,
      team: "enemy",
      heroIndex: -1,
      enemyKind: kind,
      calling: null,
      advCalling: null,
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
      facing: -1,
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
  }

  private startNextWave(): void {
    this.waveIndex++;
    if (this.waveIndex >= this.stage.waves.length) {
      this.state = "victory";
      this.resultDelay = 1.4;
      this.slowmo = Math.max(this.slowmo, 1.1); // savor the final blow
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
    this.stage.waves[this.waveIndex].forEach((entry, at) => {
      const count = entry.count + (at === 0 && !BOSS_KINDS.includes(entry.kind) ? this.extraSpawn : 0);
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
        this.bossStaggerMax = this.bossRef.enemyKind === "rimeheart" ? 400 : this.bossRef.enemyKind === "warlord" ? 340 : this.bossRef.enemyKind === "alpha" ? 280 : 240;
        this.cinematic = 2.6;
        this.waveBanner = 0;
        audio.play(this.bossRef.enemyKind === "warlord" ? "warhorn" : this.bossRef.enemyKind === "alpha" ? "howl" : this.bossRef.enemyKind === "rimeheart" ? "glacialGroan" : "roar");
      }
    }
    this.seerGuard = this.livingHeroes().filter((h) => h.calling === "seer").length;
    this.lancerStruck.clear();
    // Trapper: a hidden snare beneath the foes' line
    for (const t of this.livingHeroes()) {
      if (t.calling === "trapper") {
        this.zones.push({
          x: this.field.right - 150,
          y: (this.field.top + this.field.bottom) / 2,
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
      if (this.heroTalentRank(hero, "windStep") > 0) this.windstepReady.add(hero.id);
      // Second Breath: a gulp of air between fights
      if (this.heroTalentRank(hero, "secondBreath") > 0 && hero.hp < hero.stats.maxHp) {
        this.heal(hero, hero.stats.maxHp * 0.06, true, null);
      }
      const armorHook = this.armorHookOf(hero);
      if (armorHook === "dodgeFirstHit" || hero.advCalling === "phantom") this.armorDodgeReady.add(hero.id);
      if (armorHook === "waveShield") {
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 9999, 30, null));
      }
    }
    audio.play("wave");
  }

  private windstepReady = new Set<number>();
  private armorDodgeReady = new Set<number>();

  /** The battle-relevant quirk of whatever this hero is wearing. */
  private armorHookOf(unit: Unit): string | null {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return null;
    return armorById(this.saveRef.heroes[unit.heroIndex]?.armor)?.hook ?? null;
  }

  /** Rank of a talent on this unit's hero save (0 for enemies / no save). */
  heroTalentRank(unit: Unit, id: string): number {
    if (unit.team !== "hero" || unit.heroIndex < 0 || !this.saveRef) return 0;
    return this.saveRef.heroes[unit.heroIndex]?.talents?.[id] ?? 0;
  }

  effect(unit: Unit, kind: StatusEffect["kind"]): StatusEffect | undefined {
    return unit.effects.find((e) => e.kind === kind);
  }

  private speedOf(unit: Unit): number {
    let speed = unit.stats.speed;
    const slow = this.effect(unit, "slow");
    if (slow) speed *= 1 - slow.power;
    return speed;
  }

  /** Feed a hero's ultimate meter; announces the moment it fills. */
  private gainUlt(hero: Unit, amount: number): void {
    if (!hero.calling || !hero.alive || amount <= 0) return;
    const before = hero.ultCharge;
    hero.ultCharge = Math.min(100, hero.ultCharge + amount);
    if (before < 100 && hero.ultCharge >= 100) {
      this.fx.floatText(hero.x, hero.y - hero.radius * 3 - 12, "ultimate ready!", callingById(hero.calling)?.color ?? "#ffe9a3", 13);
      this.fx.ring(hero.x, hero.y, 46, callingById(hero.calling)?.color ?? "#ffe9a3", { width: 3, life: 0.5 });
      audio.play("ultReady");
      navigator.vibrate?.(35);
    }
  }

  private attackIntervalOf(unit: Unit): number {
    let interval = unit.stats.attackCooldown;
    const haste = this.effect(unit, "haste");
    if (haste) interval /= haste.power;
    if (unit.team === "enemy") interval /= this.enemyHaste;
    // Ranger skirmisher: faster shots while nothing is in their face
    if (unit.calling === "ranger" && !this.nearestEnemyWithin(unit, 70)) interval /= 1.15;
    // the Bard's song carries: allies near one strike quicker
    if (unit.team === "hero" && this.livingHeroes().some((s) => s.calling === "bard" && Math.hypot(s.x - unit.x, s.y - unit.y) < 140)) {
      interval /= 1.06;
    }
    // Berserker: the red mist quickens once blood is drawn
    if (unit.advCalling === "berserker" && unit.hp < unit.stats.maxHp * 0.65) interval /= 1.25;
    return interval;
  }

  damage(target: Unit, rawAmount: number, source: Unit | null, opts: { spell?: boolean; color?: string } = {}): void {
    if (!target.alive) return;
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
    let amount = rawAmount * (1 - target.stats.armor);
    const vulnerable = this.effect(target, "vulnerable");
    if (vulnerable) amount *= 1 + vulnerable.power;
    const guard = this.effect(target, "guard");
    if (guard) amount *= 1 - guard.power;
    // Vanguard holds the line: sturdier while an enemy is at arm's reach
    if (target.calling === "vanguard" && this.nearestEnemyWithin(target, 60)) amount *= 0.9;
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
      this.livingHeroes().some((h) => h !== target && h.advCalling === "bulwarkSaint" && Math.hypot(h.x - target.x, h.y - target.y) < 90)
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
    // a Warden's Hauberk shelters everyone near its wearer
    if (
      target.team === "hero" &&
      this.livingHeroes().some((h) => h !== target && this.armorHookOf(h) === "allyAura" && Math.hypot(h.x - target.x, h.y - target.y) < 90)
    ) {
      amount *= 0.94;
    }
    // Warbreaker: melee blows are answered in kind
    if (
      target.advCalling === "warbreaker" &&
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
    if (this.carry && target === this.carry.ogre) this.carry.hurt += amount;
    if (this.tutorialMode && target.team === "hero" && target.hp < 1) target.hp = 1;
    if (source && source.team === "hero" && source.heroIndex >= 0 && target.team === "enemy") {
      this.tally(source.heroIndex).dealt += amount;
      if (BOSS_KINDS.includes(target.enemyKind ?? "")) {
        this.threat[source.id] = (this.threat[source.id] ?? 0) + amount * this.threatMult(source);
        if (target === this.bossRef && this.bossStaggerMax > 0 && !this.effect(target, "stun")) {
          this.bossStagger += amount * (this.effect(target, "vulnerable") ? 0.9 : 0.5);
          if (this.bossStagger >= this.bossStaggerMax) this.staggerBoss(target);
        }
      }
    }
    if (target.team === "hero" && target.heroIndex >= 0) {
      this.tally(target.heroIndex).taken += amount;
    }
    // ultimate charge: playing your calling's role feeds the meter
    if (source?.team === "hero" && target.team === "enemy") {
      const primary = [
        "reaver", "ranger", "arcanist", "duelist", "spellblade", "nightblade",
        "pyromancer", "cryomancer", "tempest", "exorcist", "bloodknight", "lancer", "monk", "trapper", "alchemist", "warcrier",
      ].includes(source.calling ?? "");
      this.gainUlt(source, amount * (primary ? 0.3 : source.calling === "trickster" ? 0.18 : 0.12));
    }
    if (target.team === "hero") {
      this.gainUlt(target, amount * (target.calling === "vanguard" ? 0.42 : target.calling === "warden" ? 0.38 : target.calling === "geomancer" ? 0.34 : 0.12));
    }
    if (amount > 24) this.hitstop = Math.max(this.hitstop, 0.055);
    if (amount > 18 && source) {
      const kdx = target.x - source.x;
      const kdy = target.y - source.y;
      const klen = Math.hypot(kdx, kdy) || 1;
      this.kickX += (kdx / klen) * Math.min(4, amount * 0.12);
      this.kickY += (kdy / klen) * Math.min(3, amount * 0.08);
    }
    target.hitFlash = 0.18;
    this.fx.floatText(
      target.x + (Math.random() * 16 - 8),
      target.y - target.radius - 14,
      `${amount}`,
      opts.color ?? (target.team === "hero" ? "#ff7d6b" : "#f2ead8"),
      target.team === "hero" ? 15 : 14,
    );
    if (source) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.hypot(dx, dy) || 1;
      this.fx.spray(target.x, target.y - target.radius * 0.6, dx / len, dy / len, opts.color ?? "#e8564a", 5);
    } else {
      this.fx.burst(target.x, target.y - target.radius * 0.6, opts.color ?? "#e8564a", 5, 70);
    }
    if (target.hp - amount <= 0 && target.hp > 0) {
      // killing blow: bigger, golder, longer
      this.fx.floatText(target.x, target.y - target.radius - 26, `${amount}`, "#ffd76b", 20);
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
    if (amount > 22) audio.play("hitHeavy");
    if (target.hp <= 0) this.kill(target, source);
    else audio.play(opts.spell ? "hit" : "hit");
  }

  private tally(heroIndex: number): { dealt: number; taken: number; healed: number } {
    return (this.tallies[heroIndex] ??= { dealt: 0, taken: 0, healed: 0 });
  }

  heal(target: Unit, amount: number, showText = true, from: Unit | null = null): void {
    if (!target.alive || target.hp >= target.stats.maxHp) return;
    const applied = Math.min(target.stats.maxHp - target.hp, amount);
    target.hp += applied;
    if (from && from.team === "hero" && from.heroIndex >= 0 && applied >= 1) {
      this.tally(from.heroIndex).healed += applied;
    }
    if (from && from.team === "hero" && target !== from) {
      this.gainUlt(from, applied * (from.calling === "chaplain" ? 0.36 : from.calling === "seer" ? 0.3 : from.calling === "bard" ? 0.25 : from.calling === "warden" ? 0.2 : 0.12));
    }
    if (showText && applied >= 1) {
      this.fx.floatText(target.x, target.y - target.radius - 14, `+${Math.round(applied)}`, "#8ee88b", 14);
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

  private kill(unit: Unit, killer: Unit | null = null): void {
    if (unit.team === "hero") this.heroDeaths++;
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
    if (unit.team === "enemy" && ["alpha", "warlord", "ogre", "rimeheart"].includes(unit.enemyKind ?? "")) {
      this.slowmo = Math.max(this.slowmo, 1.6);
      this.zoomPunch = Math.max(this.zoomPunch, 1.2);
      this.fx.beam(unit.x, unit.y, 200, 22, "rgba(215, 240, 230, 0.85)", 1.4);
      this.fx.burst(unit.x, unit.y - 20, "#d8efe8", 26, 200, { glow: true, gravity: -120, life: 1 });
      this.fx.burst(unit.x, unit.y - 10, "#ffd76b", 18, 160, { glow: true, gravity: 60 });
      this.fx.ring(unit.x, unit.y, 180, "#d8efe8", { width: 6, life: 0.9 });
      this.fx.addShake(13);
      audio.play("roar");
    }
    // kills surge the slayer's ultimate — Tricksters feast on them
    if (unit.team === "enemy" && killer?.team === "hero") {
      this.gainUlt(killer, killer.advCalling === "spellthief" ? 25 : killer.calling === "trickster" || killer.calling === "nightblade" ? 18 : 6);
      // Nightblade: every kill is a step into the dark — speed, and pursuers lose the scent
      if (killer.calling === "nightblade") {
        killer.effects.push(makeEffect("haste", 1.6, 1.5, killer));
        for (const e of this.livingEnemies()) {
          if (e.aggro === killer) e.aggro = null;
        }
      }
      // Spellthief: every kill shaves a second off the spell cooldowns
      if (killer.advCalling === "spellthief") {
        for (const ab of killer.abilities) {
          if (!ab.ult && ab.timer > 0) ab.timer = Math.max(0, ab.timer - 1);
        }
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
    // Windfall: kills shake loose extra coin
    if (unit.team === "enemy" && killer?.team === "hero" && this.heroTalentRank(killer, "windfall") > 0) {
      this.goldEarned += 3;
      this.fx.floatText(unit.x, unit.y - unit.radius - 6, "+3g", "#ffd76b", 11);
    }
    // Warcrier: every kill is a drumbeat the whole band marches to
    if (unit.team === "enemy" && killer?.team === "hero" && killer.calling === "warcrier") {
      for (const ally of this.livingHeroes()) {
        ally.effects = ally.effects.filter((e) => e.kind !== "haste" || e.power > 1.13);
        ally.effects.push(makeEffect("haste", 2, 1.12, killer));
      }
    }
    // Necromancer: death is a wellspring
    for (const necro of this.livingHeroes()) {
      if (necro.calling === "necromancer" && Math.hypot(necro.x - unit.x, necro.y - unit.y) < 340) this.gainUlt(necro, 6);
    }
    audio.play("thud");
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

  castAbility(hero: Unit, state: AbilityState, save: SaveData, aim: Vec | null, allyTarget: Unit | null): boolean {
    if (!hero.alive || state.timer > 0 || this.effect(hero, "stun")) return false;
    const id = state.def.id;
    const attrs = save.heroes[hero.heroIndex].attrs;
    const dir = aim ? this.normalize({ x: aim.x - hero.x, y: aim.y - hero.y }) : { x: hero.facing, y: 0 };
    let cast = true;
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
          ally.effects = ally.effects.filter((e) => !["burn", "slow", "stun", "vulnerable"].includes(e.kind));
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
      default:
        cast = false;
    }
    if (cast) {
      this.castCounts[id] = (this.castCounts[id] ?? 0) + 1;
      if (state.ult) {
        hero.ultCharge = 0;
        state.timer = 1;
        navigator.vibrate?.([18, 26, 42]);
        // ceremony: the world catches its breath in the oath's color
        this.ultFlash = { color: callingById(hero.calling)?.color ?? "#ffe9a3", time: 0.55 };
        this.slowmo = Math.max(this.slowmo, 0.35);
        this.hitstop = Math.max(this.hitstop, 0.1);
        this.zoomPunch = Math.max(this.zoomPunch, 0.8);
      } else {
        const cdr = hero.heroIndex >= 0 ? cooldownReduction(save.heroes[hero.heroIndex]) : 0;
        state.timer = state.def.cooldown * (1 - cdr);
      }
      hero.castGlow = 0.4;
    }
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
    this.time += dt;
    this.waveBanner = Math.max(0, this.waveBanner - dt);
    this.introBanner = Math.max(0, this.introBanner - dt);
    if (this.ultFlash) {
      this.ultFlash.time -= dt;
      if (this.ultFlash.time <= 0) this.ultFlash = null;
    }

    if (this.state === "victory" || this.state === "defeat") {
      this.resultDelay = Math.max(0, this.resultDelay - dt);
      // the band walks off down the road as the victory settles
      if (this.state === "victory" && this.resultDelay < 0.7) {
        const band = this.livingHeroes();
        band.forEach((hero, rank) => {
          hero.celebrate = false;
          hero.facing = 1;
          hero.moveTarget = { x: this.field.right + 220, y: this.field.top + 50 + rank * 38 };
          this.moveToward(hero, hero.moveTarget, dt, 4);
        });
      }
      this.updatePresentation(dt);
      this.updateProjectiles(dt);
      return;
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
        lm.x -= dt * 60;
        lm.alpha = Math.max(0, lm.alpha - dt * 0.5);
      }
      this.landmarks = this.landmarks.filter((lm) => lm.alpha > 0 && lm.x > -120);
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
        const rate = hero.calling === "vanguard" ? 30 : hero.stats.weapon === "sword" ? 14 : 0;
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
          for (const lm of this.landmarks) lm.x -= dt * 150;
          this.landmarks = this.landmarks.filter((lm) => lm.x > -120);
          for (const u of this.units) if (!u.alive) u.x -= dt * 150;
          for (const d of this.decals) d.x -= dt * 150;
          for (const z of this.zones) z.x -= dt * 150;
          for (const hero of this.livingHeroes()) {
            const rank = this.heroes().indexOf(hero);
            const fx = this.field.left + 70 + (rank % 2) * 46;
            const fy = this.field.top + 40 + rank * ((this.field.bottom - this.field.top - 80) / 4);
            hero.moveTarget = { x: fx + 26, y: fy };
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
            x: this.field.right + 120,
            y: this.field.top + 4 + ((Math.sin(seed * 311.7) * 12345.678 % 1 + 1) % 1) * 26,
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
            this.performAttack(unit, target);
            // the Alpha's howled-up bites draw blood
            if (unit.enemyKind === "alpha" && unit.phase >= 2 && target.alive && unit.stats.range < 90) {
              target.effects.push(makeEffect("burn", 3, 3, unit));
            }
          }
        }
        continue;
      }
      if (unit.team === "hero") this.updateHero(unit, dt, save);
      else this.updateEnemy(unit, dt);
    }

    this.separateUnits(dt);
    this.updateTelegraphs(dt);
    this.updateZones(dt);
    this.updateProjectiles(dt);
    this.updatePresentation(dt);
  }

  private updateEffects(unit: Unit, dt: number): void {
    // ember-lined cloth: chill cannot take hold
    if (unit.team === "hero" && this.armorHookOf(unit) === "slowProof") {
      unit.effects = unit.effects.filter((e) => e.kind !== "slow");
    }
    for (let i = unit.effects.length - 1; i >= 0; i--) {
      const effect = unit.effects[i];
      effect.time -= dt;
      if (effect.kind === "burn") {
        unit.hp -= effect.power * dt;
        if (unit.hp <= 0) {
          this.kill(unit);
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
            this.kill(unit);
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
    if (hero.calling && this.state === "fighting") this.gainUlt(hero, dt * 1.2);
    const ultState = hero.abilities.find((a) => a.ult);
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
          if (hero.calling === "chaplain") {
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
    attacker.windup = 0.13;
    attacker.pendingTarget = target;
    attacker.attackTimer = this.attackIntervalOf(attacker);
    attacker.facing = target.x >= attacker.x ? 1 : -1;
  }

  /** How loudly a hero registers to bosses: shield-bearers ring loudest, menders barely. */
  private threatMult(hero: Unit): number {
    if (hero.calling === "vanguard") return 2.6;
    if (hero.stats.weapon === "sword") return 1.5; // any front-liner holds attention
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
    if (enemy.x > this.field.right - enemy.radius) {
      enemy.x -= this.speedOf(enemy) * 1.8 * dt;
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
      enemy.lungeDir = { x: -1, y: 0 };
    }
    // mid-leap the body belongs to the arc, not the brain
    if (enemy.leap) return;
    // then close most of the gap at a quickened pace so fights start fast
    const nearestForPace = this.nearestHero(enemy);
    const paceBoost = nearestForPace && unitDist(enemy, nearestForPace) > 320 ? 1.5 : 1;

    if (enemy.enemyKind === "bonecaller") {
      this.updateBonecaller(enemy, dt);
      return;
    }
    if (enemy.enemyKind === "shaman" || enemy.enemyKind === "snowhag") {
      this.updateShaman(enemy, dt);
      return;
    }
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

  private updateShaman(shaman: Unit, dt: number): void {
    shaman.supportTimer -= dt;
    // drift to stay behind the front line
    const nearest = this.nearestHero(shaman);
    if (nearest && unitDist(shaman, nearest) < 130) {
      const away = this.normalize({ x: shaman.x - nearest.x, y: shaman.y - nearest.y });
      const to = this.clampToField({ x: shaman.x + away.x * 70, y: shaman.y + away.y * 70 }, shaman.radius);
      this.moveToward(shaman, to, dt, 4);
    }
    if (shaman.supportTimer > 0) return;

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
    } else if (shaman.enemyKind === "snowhag" && nearest && Math.random() < 0.5) {
      // the hag sings the ground to ice beneath your feet
      shaman.supportTimer = 3.2;
      shaman.castGlow = 0.4;
      this.zones.push({ x: nearest.x, y: nearest.y, radius: 58, time: 0, duration: 4.5, kind: "frost", power: 0.35, dps: 0, from: shaman });
      this.fx.ring(nearest.x, nearest.y, 58, "#b8e0f0", { width: 3, life: 0.5 });
      audio.play("frost");
    } else if (nearest) {
      // nothing to mend: the shaman fights like everyone else
      const dist = unitDist(shaman, nearest);
      if (dist > shaman.stats.range) {
        this.moveToward(shaman, nearest, dt, shaman.stats.range - 12);
      } else if (shaman.attackTimer <= 0) {
        shaman.facing = nearest.x >= shaman.x ? 1 : -1;
        this.performAttack(shaman, nearest);
        shaman.attackTimer = this.attackIntervalOf(shaman);
      }
      shaman.supportTimer = 0.4; // keep glancing for wounded packmates
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
    }
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
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "FRENZY!", "#ff8a70", 18);
      alpha.supportTimer = Math.min(alpha.supportTimer, 1.2);
      // the last of the pack answers the frenzy
      this.fx.ring(alpha.x, alpha.y, 200, "#ff8a70", { width: 4, life: 0.7 });
      audio.play("howl");
      for (let i = 0; i < 2; i++) this.spawnEnemy("wolf");
    }
    if (alpha.phase === 0) alpha.phase = 1;

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
    // between pounces: normal wolf brawling, steered by threat
    const taunt = this.effect(alpha, "taunt");
    let target: Unit | null = taunt && taunt.source && taunt.source.alive ? taunt.source : null;
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
    // PHASE 3 — no quarter: faster, angrier, and melee blows are answered
    if (frac < 0.33 && lord.phase < 3) {
      lord.phase = 3;
      this.fx.floatText(lord.x, lord.y - lord.radius * 3, "NO QUARTER!", "#ff5a48", 20);
      lord.effects.push(makeEffect("haste", 999, 1.25, null));
      this.fx.addShake(9);
      this.hitstop = Math.max(this.hitstop, 0.09);
      audio.play("roar");
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

  private updateTelegraphs(dt: number): void {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const mark = this.telegraphs[i];
      mark.time += dt;
      if (!mark.owner.alive) {
        this.telegraphs.splice(i, 1);
        continue;
      }
      if (mark.time >= mark.duration) {
        this.telegraphs.splice(i, 1);
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
          lord.lungeDir = this.normalize({ x: mark.x - lord.x, y: mark.y - lord.y });
          lord.lunge = 1;
          for (const hero of this.livingHeroes()) {
            if (Math.hypot(hero.x - mark.x, hero.y - mark.y) < mark.radius + hero.radius * 0.5) {
              this.damage(hero, lord.stats.damage * (isAxe ? 0.75 : 1.5), lord);
              if (hero.alive) hero.effects.push(makeEffect("slow", 1.5, isAxe ? 0.25 : 0.35, lord));
            }
          }
          this.fx.slash(mark.x, mark.y - 10, Math.PI * 0.1, mark.radius * 0.8, "#ff9a85", Math.PI * 1.6);
          this.fx.ring(mark.x, mark.y, mark.radius + 10, "#ff8a70", { width: 5, life: 0.5 });
          this.fx.burst(mark.x, mark.y, "#c98a5a", 20, 190, { gravity: 200 });
          this.fx.addShake(10);
          this.hitstop = Math.max(this.hitstop, 0.08);
          this.zoomPunch = Math.max(this.zoomPunch, 0.9);
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
    alpha.lungeDir = { x: alpha.facing, y: 0 };
    alpha.lunge = 1;
    let struck = 0;
    for (const hero of this.livingHeroes()) {
      if (Math.hypot(hero.x - x, hero.y - y) < radius + hero.radius * 0.5) {
        this.damage(hero, alpha.stats.damage * 1.7, alpha);
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
    // frenzy leaves the alpha exhausted: your window
    if (alpha.phase === 3) {
      alpha.effects.push(makeEffect("stun", 2.4, 1, null));
      alpha.effects.push(makeEffect("vulnerable", 2.4, 0.75, null));
      this.fx.floatText(alpha.x, alpha.y - alpha.radius * 3, "exhausted!", "#ffe9a3", 15);
    }
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
    if (attacker.enemyKind === "warlord" || attacker.enemyKind === "ogre" || attacker.enemyKind === "rimeheart") {
      // ground-shaking slam that clips everyone near the target
      const reach = attacker.enemyKind === "warlord" ? 70 : attacker.enemyKind === "rimeheart" ? 78 : 52;
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
    if (attacker.team === "hero" && this.saveRef) {
      const chance = talentMods(this.saveRef.heroes[attacker.heroIndex].talents).crit;
      if (Math.random() < chance) {
        crit = true;
        dmg *= 1.6;
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
      const weapon = attacker.team === "hero" ? attacker.stats.weapon : attacker.enemyKind === "shaman" || attacker.enemyKind === "bonecaller" ? "staff" : "bow";
      const isArcane = weapon === "staff";
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
        color: isArcane ? (attacker.enemyKind === "shaman" ? "#7de8c9" : "#b48ae8") : isHoly ? "#ffe9a3" : "#e8d9b0",
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
        if (n % 4 === 0) {
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
      this.damage(target, dmg, attacker, crit ? { color: "#ffd76b" } : {});
      if (crit) this.fx.floatText(target.x, target.y - target.radius - 30, "crit!", "#ffd76b", 12);
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
      // enemies are allowed to be off-field on the right while entering
      if (unit.team === "enemy" && unit.x > this.field.right - unit.radius) {
        unit.y = Math.min(this.field.bottom - unit.radius, Math.max(this.field.top + unit.radius, unit.y));
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
          this.damage(p.target, p.damage, p.from, { color: p.kind === "bolt" ? "#d3b6f0" : undefined });
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
