export type Team = "hero" | "enemy";

export type EnemyKind =
  | "goblin"
  | "archer"
  | "brute"
  | "ogre"
  | "shaman"
  | "wolf"
  | "alpha"
  | "warlord"
  | "frostwolf"
  | "icewisp"
  | "rimetroll"
  | "snowhag"
  | "rimeheart"
  | "bonecaller"
  | "shambler"
  | "stalker"
  | "shieldbearer"
  | "harrier"
  | "drummer";

export interface Vec {
  x: number;
  y: number;
}

export type AttrKey = "str" | "dex" | "int" | "vit" | "spi";

export type Attributes = Record<AttrKey, number>;

export type WeaponKind = "sword" | "bow" | "staff" | "stave";

export type EffectKind = "stun" | "slow" | "taunt" | "shield" | "haste" | "guard" | "burn" | "vulnerable";

export interface StatusEffect {
  kind: EffectKind;
  time: number; // seconds remaining
  power: number; // slow: fraction, shield: hp pool, haste: cooldown multiplier bonus, guard: damage reduction fraction, burn: dps
  source: Unit | null;
}

export type AbilityTargeting = "instant" | "ray" | "point" | "ally";

export interface AbilityDef {
  id: string;
  name: string;
  gate: { attr: AttrKey; value: number };
  targeting: AbilityTargeting;
  cooldown: number;
  color: string;
  icon: string; // glyph drawn on the button
  blurb: string;
}

export interface AbilityState {
  def: AbilityDef;
  timer: number; // seconds until ready; 0 = ready (ultimates mirror charge here: 1 = charging, 0 = full)
  ult?: boolean; // calling ultimate: gated by Unit.ultCharge, not time
  armorSkill?: boolean; // family skill granted by the worn body armor
}

export interface DerivedStats {
  maxHp: number;
  damage: number;
  range: number;
  attackCooldown: number;
  speed: number;
  armor: number; // fraction of damage ignored
  healPower: number; // hp/s while channeling onto an ally
  spellPower: number; // multiplier for damaging spells
  weapon: WeaponKind;
}

export interface Unit {
  id: number;
  name: string;
  team: Team;
  heroIndex: number; // -1 for enemies
  enemyKind: EnemyKind | null;
  calling: string | null; // sworn calling (heroes only, null while the oath is dormant)
  advCalling: string | null; // advanced branch (null unless the oath is active and advanced)
  ultCharge: number; // 0-100, fills from the calling's role actions
  entered: boolean; // enemies flip this crashing onto the field (spawn presentation)
  x: number;
  y: number;
  radius: number;
  stats: DerivedStats;
  hp: number;
  attackTimer: number;
  // orders / intent
  moveTarget: Vec | null;
  attackTarget: Unit | null;
  healTarget: Unit | null;
  stance: "attack" | "heal";
  autoOrder: boolean;
  abilities: AbilityState[];
  effects: StatusEffect[];
  // presentation
  facing: 1 | -1;
  bobPhase: number;
  lunge: number;
  lungeDir: Vec;
  hitFlash: number;
  castGlow: number;
  channelBeam: number;
  deathTime: number;
  alive: boolean;
  // enemy brain
  aggro: Unit | null;
  supportTimer: number;
  phase: number; // boss phase (0 = not a boss / phase 1)
  // presentation extras
  windup: number; // seconds of attack anticipation remaining
  pendingTarget: Unit | null; // target the windup will strike
  alert: number; // "!" reaction timer
  celebrate: boolean; // victory pose
  idleTimer: number; // countdown to next idle flourish
  idleAnim: number; // active idle flourish time
  leap: { t: number; dur: number; fromX: number; fromY: number; toX: number; toY: number; radius: number } | null; // airborne pounce in flight
  marching?: boolean; // held in the between-fights walk — render keeps the legs moving
  aloft?: boolean; // harriers circle out of melee reach until they dive
}

export interface Projectile {
  x: number;
  y: number;
  target: Unit | null;
  aim: Vec; // direction for unguided projectiles
  speed: number;
  damage: number;
  from: Unit;
  kind: "arrow" | "bolt" | "spark";
  color: string;
  heals: boolean;
  life: number;
}

export interface Telegraph {
  x: number;
  y: number;
  radius: number;
  time: number;
  duration: number;
  owner: Unit;
  kind: "pounce" | "sweep" | "meteor";
}

export interface GroundZone {
  x: number;
  y: number;
  radius: number;
  time: number;
  duration: number;
  kind: "frost" | "sanctuary" | "smoke" | "gravity";
  power: number; // frost: slow fraction · sanctuary: burn dps · smoke: damage reduction · gravity: pull px/s
  dps: number; // frost: damage/s to enemies · sanctuary: healing/s to heroes · gravity: damage/s
  from: Unit;
}

export interface WaveEntry {
  kind: EnemyKind;
  count: number;
}

export interface StageDef {
  id: number;
  name: string;
  subtitle: string;
  palette: {
    skyTop: string;
    skyBottom: string;
    hills: string;
    ground: string;
    groundDark: string;
    prop: string;
  };
  waves: WaveEntry[][];
  scale: number; // enemy stat multiplier
  xpReward: number;
}

export interface HeroSave {
  attrs: Attributes;
  equipped: string[]; // ability ids, max 3
  recruited: boolean;
  active: boolean; // in the fighting party (max 4)
  weaponTier: number; // 0-3
  armor: string | null; // equipped body armor piece id (null = traveler's garb)
  helm: string | null; // equipped helm piece id
  boots: string | null; // equipped boots piece id
  talents: Record<string, number>; // talent id -> rank
  trinket: string | null;
  calling: string | null; // sworn calling id (band level 5+), null = unsworn
  advCalling: string | null; // advanced branch id (band level 20+), null = not yet advanced
}

export interface SaveData {
  version: number;
  unlockedStage: number;
  level: number;
  xp: number;
  unspent: number[]; // per hero
  heroes: HeroSave[];
  sound: boolean;
  music: boolean;
  soundVol: number; // 0-1 effects loudness
  musicVol: number; // 0-1 music loudness
  speed: number; // combat speed multiplier
  bestiary: Partial<Record<EnemyKind, number>>; // kills per enemy kind
  gold: number;
  unlockedSpells: string[]; // ability ids bought in the spell shop (account-wide)
  inventory: string[]; // trinket ids collected as loot
  armory: string[]; // armor piece ids owned, any slot (one copy dresses one hero)
  forge: Record<string, number>; // piece id -> forge level 0-3 (upgrades bind to the piece)
  difficulty: number; // index into DIFFICULTIES
  seenIntro: boolean; // first-run tutorial prompt shown
  stageStats: Record<number, { bestTime: number; clears: number }>; // per-stage clear records
  lifetime: LifetimeStats; // the band's whole story in numbers
  presets: (PartyPreset | null)[]; // two savable band configurations
  reducedMotion: boolean; // calmer screen: no shake/zoom punch, no menu animation
  colorSafe: boolean; // colorblind-friendly health bars (hero bars go blue)
  bigText: boolean; // larger menu + hint text
  keybinds: Record<string, string>; // action id -> key (hero1-4, ability1-4)
}

export interface LifetimeStats {
  battles: number; // real battles finished, any outcome
  victories: number;
  kills: number;
  casts: number;
  gold: number; // gold earned all-time
  deaths: number; // heroes fallen all-time
  fuses: number; // tinker's bench fusions
  flawless: number; // victories with no hero fallen
  brutalClears: number; // victories on Brutal
}

export interface PartyPreset {
  name: string;
  loadout: { equipped: string[]; trinket: string | null; active: boolean }[]; // per hero index
}
