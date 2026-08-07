import { Battle, type FieldRect } from "./battle";
import { FxSystem } from "./fx";
import type { SaveData, StageDef } from "./types";

export interface SimulationOptions {
  maxSeconds?: number;
  seed?: number;
}

export interface SimulationResult {
  result: "victory" | "defeat" | "timeout";
  time: number;
  deaths: number;
  casts: number;
}

/** Mulberry32 is compact, stable, and adequate for reproducible balance runs. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** One tick of AUTO behavior, shared by live battles and balance simulations. */
export function autopilotTick(battle: Battle, save: SaveData): number {
  let casts = 0;
  const enemies = battle.units.filter((unit) => unit.team === "enemy" && unit.alive);
  for (const hero of battle.units) {
    if (hero.team !== "hero" || !hero.alive) continue;
    if (hero.stats.healPower >= 8) {
      const wounded = battle.units
        .filter((unit) => unit.team === "hero" && unit.alive && unit !== hero && unit.hp < unit.stats.maxHp * 0.7)
        .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
      hero.healTarget = wounded ?? null;
      if (wounded) hero.attackTarget = null;
    }
    if (!hero.healTarget && (!hero.attackTarget || !hero.attackTarget.alive) && enemies.length) {
      hero.attackTarget = enemies.reduce((nearest, enemy) =>
        Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < Math.hypot(nearest.x - hero.x, nearest.y - hero.y) ? enemy : nearest,
      );
    }
    for (const ability of hero.abilities) {
      if (ability.timer > 0) continue;
      const target = hero.attackTarget?.alive ? hero.attackTarget : enemies[0];
      const aim = target ? { x: target.x, y: target.y } : null;
      if (battle.castAbility(hero, ability, save, aim, null)) casts++;
    }
  }
  return casts;
}

/** Run the simulation synchronously so its seeded random scope cannot leak. */
export function runBattleSimulation(
  stage: StageDef,
  save: SaveData,
  field: FieldRect,
  options: SimulationOptions = {},
): SimulationResult {
  const originalRandom = Math.random;
  Math.random = seededRandom(options.seed ?? 1);
  try {
    const fx = new FxSystem();
    const battle = new Battle(stage, save, field, fx);
    const maxSeconds = options.maxSeconds ?? 240;
    const dt = 1 / 30;
    let casts = 0;
    while (battle.state !== "victory" && battle.state !== "defeat" && battle.time < maxSeconds) {
      if (battle.state === "fighting" && battle.cinematic <= 0) casts += autopilotTick(battle, save);
      battle.update(dt, save);
      fx.update(dt);
      if (fx.particles.length > 300) fx.particles.length = 0;
      if (fx.floaters.length > 150) fx.floaters.length = 0;
    }
    return {
      result: battle.state === "victory" ? "victory" : battle.state === "defeat" ? "defeat" : "timeout",
      time: Math.round(battle.time * 10) / 10,
      deaths: battle.heroDeaths,
      casts,
    };
  } finally {
    Math.random = originalRandom;
  }
}
