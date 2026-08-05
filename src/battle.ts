import { audio } from "./audio";
import { ENEMIES, HEROES, abilityById, deriveStats } from "./data";
import type { FxSystem } from "./fx";
import type {
  AbilityState,
  EnemyKind,
  GroundZone,
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

export class Battle {
  units: Unit[] = [];
  projectiles: Projectile[] = [];
  zones: GroundZone[] = [];
  state: BattleState = "wavebreak";
  waveIndex = -1;
  waveBanner = 0;
  breakTimer = 1.2;
  time = 0;
  xpEarned = 0;
  resultDelay = 0;

  constructor(
    public stage: StageDef,
    save: SaveData,
    public field: FieldRect,
    public fx: FxSystem,
  ) {
    const midY = (field.top + field.bottom) / 2;
    const spread = Math.min(120, (field.bottom - field.top) / 3);
    const positions: Vec[] = [
      { x: field.left + 90, y: midY - spread },
      { x: field.left + 60, y: midY - spread / 3 },
      { x: field.left + 60, y: midY + spread / 3 },
      { x: field.left + 90, y: midY + spread },
    ];
    for (let i = 0; i < 4; i++) {
      const heroSave = save.heroes[i];
      const stats = deriveStats(heroSave.attrs);
      const abilities: AbilityState[] = heroSave.equipped
        .map((id) => abilityById(id))
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map((def) => ({ def, timer: 0 }));
      this.units.push({
        id: nextUnitId++,
        name: HEROES[i].name,
        team: "hero",
        heroIndex: i,
        enemyKind: null,
        x: positions[i].x,
        y: positions[i].y,
        radius: 15,
        stats,
        hp: stats.maxHp,
        attackTimer: 0,
        moveTarget: null,
        attackTarget: null,
        healTarget: null,
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
      });
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

  private spawnEnemy(kind: EnemyKind): void {
    const def = ENEMIES[kind];
    const scale = this.stage.scale;
    const y = this.field.top + 20 + Math.random() * (this.field.bottom - this.field.top - 40);
    const x = this.field.right + 30 + Math.random() * 60;
    this.units.push({
      id: nextUnitId++,
      name: def.name,
      team: "enemy",
      heroIndex: -1,
      enemyKind: kind,
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
    });
  }

  private startNextWave(): void {
    this.waveIndex++;
    if (this.waveIndex >= this.stage.waves.length) {
      this.state = "victory";
      this.resultDelay = 1.0;
      audio.play("victory");
      return;
    }
    for (const entry of this.stage.waves[this.waveIndex]) {
      for (let i = 0; i < entry.count; i++) this.spawnEnemy(entry.kind);
    }
    this.state = "fighting";
    this.waveBanner = 2.2;
    audio.play("wave");
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

  private attackIntervalOf(unit: Unit): number {
    let interval = unit.stats.attackCooldown;
    const haste = this.effect(unit, "haste");
    if (haste) interval /= haste.power;
    return interval;
  }

  damage(target: Unit, rawAmount: number, source: Unit | null, opts: { spell?: boolean; color?: string } = {}): void {
    if (!target.alive) return;
    let amount = rawAmount * (1 - target.stats.armor);
    const guard = this.effect(target, "guard");
    if (guard) amount *= 1 - guard.power;
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
    target.hitFlash = 0.18;
    this.fx.floatText(
      target.x + (Math.random() * 16 - 8),
      target.y - target.radius - 14,
      `${amount}`,
      opts.color ?? (target.team === "hero" ? "#ff7d6b" : "#ffe9a3"),
      target.team === "hero" ? 15 : 14,
    );
    this.fx.burst(target.x, target.y - target.radius * 0.6, opts.color ?? "#e8564a", 5, 70);
    if (target.team === "enemy" && source && source.team === "hero" && !target.aggro) {
      target.aggro = source;
    }
    if (target.hp <= 0) this.kill(target);
    else audio.play(opts.spell ? "hit" : "hit");
  }

  heal(target: Unit, amount: number, showText = true): void {
    if (!target.alive || target.hp >= target.stats.maxHp) return;
    const applied = Math.min(target.stats.maxHp - target.hp, amount);
    target.hp += applied;
    if (showText && applied >= 1) {
      this.fx.floatText(target.x, target.y - target.radius - 14, `+${Math.round(applied)}`, "#8ee88b", 14);
    }
  }

  private kill(unit: Unit): void {
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
    this.fx.addShake(unit.radius > 20 ? 8 : 3);
    audio.play("thud");
    if (unit.team === "enemy" && unit.enemyKind) {
      this.xpEarned += Math.round(ENEMIES[unit.enemyKind].xp * this.stage.scale);
    }
  }

  // ----- orders from input -----

  orderMove(hero: Unit, to: Vec): void {
    if (!hero.alive) return;
    hero.moveTarget = this.clampToField(to, hero.radius);
    hero.attackTarget = null;
    hero.healTarget = null;
  }

  orderAttack(hero: Unit, target: Unit): void {
    if (!hero.alive || !target.alive) return;
    hero.attackTarget = target;
    hero.healTarget = null;
    hero.moveTarget = null;
  }

  orderHeal(hero: Unit, target: Unit): void {
    if (!hero.alive || !target.alive || target === hero) return;
    hero.healTarget = target;
    hero.attackTarget = null;
    hero.moveTarget = null;
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
            this.damage(enemy, dmg, hero, { color: "#ffd27d" });
            if (enemy.alive) enemy.effects.push(makeEffect("stun", 0.4, 1, hero));
            hitAny = true;
          }
        }
        hero.lunge = 1;
        hero.lungeDir = dir;
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
          }
        }
        hero.effects.push(makeEffect("guard", 6, 0.4, hero));
        this.fx.burst(hero.x, hero.y - 20, "#e0904b", 18, 160, { glow: true });
        this.fx.addShake(4);
        audio.play("warcry");
        break;
      }
      case "pierce": {
        const dmg = 10 + attrs.dex * 2.6;
        const reach = 430;
        for (const enemy of this.livingEnemies()) {
          if (this.distToRay(hero, dir, reach, enemy) < enemy.radius + 14) {
            this.damage(enemy, dmg, hero, { color: "#b6f0a8" });
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
        this.fx.addShake(7);
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
        this.heal(target, 30 + attrs.spi * 4);
        this.fx.burst(target.x, target.y - 18, "#f2e7a0", 16, 110, { glow: true, gravity: -40 });
        audio.play("heal");
        break;
      }
      case "radiance": {
        for (const ally of this.livingHeroes()) {
          const d = Math.hypot(ally.x - hero.x, ally.y - hero.y);
          if (d < 190) {
            this.heal(ally, 20 + attrs.spi * 2.6);
            this.fx.burst(ally.x, ally.y - 18, "#fff3c0", 10, 90, { glow: true, gravity: -50 });
          }
        }
        this.fx.addShake(3);
        audio.play("heal");
        break;
      }
      case "bulwark": {
        hero.effects = hero.effects.filter((e) => e.kind !== "shield");
        hero.effects.push(makeEffect("shield", 8, 30 + attrs.vit * 5, hero));
        this.fx.burst(hero.x, hero.y - 16, "#c6d3e8", 14, 100, { glow: true });
        audio.play("shield");
        break;
      }
      default:
        cast = false;
    }
    if (cast) {
      state.timer = state.def.cooldown;
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
    this.time += dt;
    this.waveBanner = Math.max(0, this.waveBanner - dt);

    if (this.state === "victory" || this.state === "defeat") {
      this.resultDelay = Math.max(0, this.resultDelay - dt);
      this.updatePresentation(dt);
      this.updateProjectiles(dt);
      return;
    }

    if (this.state === "wavebreak") {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startNextWave();
    } else if (this.livingEnemies().length === 0) {
      if (this.waveIndex >= this.stage.waves.length - 1) {
        this.startNextWave(); // triggers victory
      } else {
        this.state = "wavebreak";
        this.breakTimer = 1.6;
      }
    }

    if (this.livingHeroes().length === 0 && this.state !== ("defeat" as BattleState)) {
      this.state = "defeat";
      this.resultDelay = 1.0;
      audio.play("defeat");
      return;
    }

    for (const unit of this.units) {
      if (!unit.alive) continue;
      this.updateEffects(unit, dt);
      for (const ability of unit.abilities) ability.timer = Math.max(0, ability.timer - dt);
      unit.attackTimer = Math.max(0, unit.attackTimer - dt);
      if (this.effect(unit, "stun")) continue;
      if (unit.team === "hero") this.updateHero(unit, dt, save);
      else this.updateEnemy(unit, dt);
    }

    this.separateUnits(dt);
    this.updateZones(dt);
    this.updateProjectiles(dt);
    this.updatePresentation(dt);
  }

  private updateEffects(unit: Unit, dt: number): void {
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
    // frost zones apply slow continuously
    let inFrost = false;
    for (const zone of this.zones) {
      if (unit.team === "enemy" && Math.hypot(unit.x - zone.x, unit.y - zone.y) < zone.radius + unit.radius) {
        inFrost = true;
        unit.hp -= zone.dps * dt;
        if (unit.hp <= 0) {
          this.kill(unit);
          return;
        }
        const slow = this.effect(unit, "slow");
        if (slow) slow.time = Math.max(slow.time, 0.3);
        else unit.effects.push(makeEffect("slow", 0.3, zone.power, zone.from));
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
    return dist - step <= arriveDist;
  }

  private updateHero(hero: Unit, dt: number, save: SaveData): void {
    if (hero.attackTarget && !hero.attackTarget.alive) hero.attackTarget = null;
    if (hero.healTarget && !hero.healTarget.alive) hero.healTarget = null;
    hero.channelBeam = Math.max(0, hero.channelBeam - dt * 4);

    if (hero.moveTarget) {
      if (this.moveToward(hero, hero.moveTarget, dt, 4)) hero.moveTarget = null;
      return;
    }

    if (hero.healTarget) {
      const target = hero.healTarget;
      const dist = Math.hypot(target.x - hero.x, target.y - hero.y);
      if (dist > 90) {
        this.moveToward(hero, target, dt, 80);
      } else {
        hero.facing = target.x >= hero.x ? 1 : -1;
        const spi = this.attrOf(hero, "spi", save);
        const rate = hero.stats.healPower;
        if (spi <= 0 || target.hp >= target.stats.maxHp) {
          hero.channelBeam = 0;
        } else {
          hero.channelBeam = 1;
          this.heal(target, rate * dt, false);
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
    if (unitDist(hero, target) <= hero.stats.range + target.radius && hero.attackTimer <= 0) {
      this.performAttack(hero, target);
      hero.attackTimer = this.attackIntervalOf(hero);
    }
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
    // then close most of the gap at a quickened pace so fights start fast
    const nearestForPace = this.nearestHero(enemy);
    const paceBoost = nearestForPace && unitDist(enemy, nearestForPace) > 320 ? 1.5 : 1;

    if (enemy.enemyKind === "shaman") {
      this.updateShaman(enemy, dt);
      return;
    }

    const taunt = this.effect(enemy, "taunt");
    let target: Unit | null = taunt && taunt.source && taunt.source.alive ? taunt.source : null;
    if (!target && enemy.aggro && enemy.aggro.alive) target = enemy.aggro;
    if (!target) target = this.nearestHero(enemy);
    if (!target) return;
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
    if (enemy.attackTimer <= 0) {
      this.performAttack(enemy, target);
      enemy.attackTimer = this.attackIntervalOf(enemy);
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
      audio.play("bolt");
    } else if (nearest && shaman.attackTimer <= 0 && unitDist(shaman, nearest) <= shaman.stats.range) {
      shaman.facing = nearest.x >= shaman.x ? 1 : -1;
      this.performAttack(shaman, nearest);
      shaman.attackTimer = this.attackIntervalOf(shaman);
    }
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
    if (attacker.enemyKind === "warlord") {
      // ground-shaking slam that clips everyone near the target
      for (const hero of this.livingHeroes()) {
        if (Math.hypot(hero.x - target.x, hero.y - target.y) < 70) {
          this.damage(hero, attacker.stats.damage, attacker);
        }
      }
      this.fx.burst(target.x, target.y, "#c98a5a", 18, 170, { gravity: 220 });
      this.fx.addShake(9);
      audio.play("thud");
      return;
    }
    if (ranged) {
      const isArcane = attacker.team === "hero" && attacker.stats.weapon === "staff";
      this.projectiles.push({
        x: attacker.x + attacker.facing * 10,
        y: attacker.y - 18,
        target,
        aim: attacker.lungeDir,
        speed: isArcane ? 300 : 420,
        damage: attacker.stats.damage,
        from: attacker,
        kind: isArcane ? "bolt" : "arrow",
        color: isArcane ? "#b48ae8" : "#e8d9b0",
        heals: false,
        life: 3,
      });
      audio.play(isArcane ? "bolt" : "shoot");
    } else {
      this.damage(target, attacker.stats.damage, attacker);
      audio.play("slash");
    }
  }

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
      if (zone.time >= zone.duration) this.zones.splice(i, 1);
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
          this.heal(p.target, p.damage);
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
