export type Team = "hero" | "enemy";

export type EnemyKind = "goblin" | "archer" | "brute" | "shaman" | "wolf" | "alpha" | "warlord";

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
  timer: number; // seconds until ready; 0 = ready
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
  kind: "pounce";
}

export interface GroundZone {
  x: number;
  y: number;
  radius: number;
  time: number;
  duration: number;
  kind: "frost";
  power: number; // slow fraction
  dps: number;
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
  armorTier: number; // 0-3
  talents: Record<string, number>; // talent id -> rank
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
  speed: number; // combat speed multiplier
  bestiary: Partial<Record<EnemyKind, number>>; // kills per enemy kind
  gold: number;
  unlockedSpells: string[]; // ability ids bought in the spell shop (account-wide)
}
